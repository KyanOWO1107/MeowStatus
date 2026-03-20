from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
import mimetypes
import os
import threading
import time
import uuid
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .config import AppConfig, load_config
from .plugins import MinecraftBedrockProvider, MinecraftJavaProvider, ProviderRegistry
from .poller import WidgetPoller
from .store import StatusStore, utc_now_iso

logger = logging.getLogger("meowstatus")


def configure_logging(config: AppConfig) -> None:
    config.log_dir.mkdir(parents=True, exist_ok=True)
    log_file = config.log_dir / "meowstatus.log"

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)

    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=config.log_max_bytes,
        backupCount=config.log_backup_count,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(config.log_level)
    root.addHandler(stream_handler)
    root.addHandler(file_handler)

    logger.info("Logging initialized: level=%s, file=%s", config.log_level, log_file)

SUPPORTED_UI_THEMES = {
    "bluery",
    "midnight",
    "nature",
    "lake",
    "coder",
    "github",
    "vscode",
    "dark",
    "fox",
    "flamingo",
    "lavender",
    "amethyst",
    "sky",
    "cyan",
    "lemon",
    "chocolate",
    "strawberry",
    "mint",
    "lime",
    "obsidian",
    "ocean",
    "pale",
    "honey",
    "indigo",
    "rose",
    "paradox",
    "gingercat",
    "galaxy",
    "pine",
}

class AuthRateLimiter:
    def __init__(self, *, max_attempts: int, window_sec: int, lockout_sec: int) -> None:
        self.max_attempts = max_attempts
        self.window_sec = window_sec
        self.lockout_sec = lockout_sec
        self._lock = threading.Lock()
        self._state: dict[str, dict[str, object]] = {}

    def current_status(self, key: str) -> dict[str, int | bool]:
        now = time.monotonic()
        with self._lock:
            state = self._state.get(key)
            if state is None:
                return {
                    "blocked": False,
                    "retry_after": 0,
                    "attempts_remaining": self.max_attempts,
                    "attempts_used": 0,
                }

            self._prune_failures(state, now)
            blocked_until = float(state.get("blocked_until", 0.0))
            blocked = blocked_until > now

            failures = state.get("failures")
            if not isinstance(failures, list):
                failures = []
                state["failures"] = failures

            attempts_used = len(failures)
            attempts_remaining = max(0, self.max_attempts - attempts_used)
            retry_after = max(0, int(blocked_until - now)) if blocked else 0

            if blocked:
                attempts_used = self.max_attempts
                attempts_remaining = 0

            if not blocked and attempts_used == 0:
                # Clean empty record.
                self._state.pop(key, None)

            return {
                "blocked": blocked,
                "retry_after": retry_after,
                "attempts_remaining": attempts_remaining,
                "attempts_used": attempts_used,
            }

    def record_failure(self, key: str) -> dict[str, int | bool]:
        now = time.monotonic()
        with self._lock:
            state = self._state.setdefault(key, {"failures": [], "blocked_until": 0.0})
            self._prune_failures(state, now)

            failures = state.get("failures")
            if not isinstance(failures, list):
                failures = []
                state["failures"] = failures

            blocked_until = float(state.get("blocked_until", 0.0))
            if blocked_until > now:
                return {
                    "blocked": True,
                    "retry_after": max(1, int(blocked_until - now)),
                    "attempts_remaining": 0,
                    "attempts_used": self.max_attempts,
                }

            failures.append(now)
            attempts_used = len(failures)

            if attempts_used >= self.max_attempts:
                blocked_until = now + self.lockout_sec
                state["blocked_until"] = blocked_until
                failures.clear()
                return {
                    "blocked": True,
                    "retry_after": self.lockout_sec,
                    "attempts_remaining": 0,
                    "attempts_used": self.max_attempts,
                }

            return {
                "blocked": False,
                "retry_after": 0,
                "attempts_remaining": max(0, self.max_attempts - attempts_used),
                "attempts_used": attempts_used,
            }

    def record_success(self, key: str) -> None:
        with self._lock:
            self._state.pop(key, None)

    def _prune_failures(self, state: dict[str, object], now: float) -> None:
        window_start = now - self.window_sec
        failures = state.get("failures")
        if not isinstance(failures, list):
            state["failures"] = []
            failures = []

        filtered = [ts for ts in failures if isinstance(ts, (int, float)) and ts >= window_start]
        state["failures"] = filtered

        blocked_until = float(state.get("blocked_until", 0.0))
        if blocked_until <= now:
            state["blocked_until"] = 0.0


@dataclass(slots=True)
class AppContext:
    config: AppConfig
    store: StatusStore
    registry: ProviderRegistry
    poller: WidgetPoller
    auth_limiter: AuthRateLimiter


class MeowStatusHandler(BaseHTTPRequestHandler):
    context: AppContext

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token, Authorization")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path in {"/", "/index.html"}:
            self._serve_static("index.html")
            return

        if path == self.context.config.admin_path:
            self._serve_static("admin.html")
            return

        if path.startswith("/static/"):
            rel_path = path[len("/static/") :]
            self._serve_static(rel_path)
            return

        if path == "/api/health":
            self._send_json(HTTPStatus.OK, {"ok": True, "time": utc_now_iso()})
            return

        if path == "/api/admin/check":
            if not self._require_admin(enforce_token_rotated=False):
                return
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "must_change_token": self.context.store.is_admin_token_change_required(),
                },
            )
            return

        if path == "/api/theme":
            self._send_json(HTTPStatus.OK, {"theme": self.context.store.get_ui_theme()})
            return
        if path == "/api/profile/status":
            profile = self.context.store.get_profile_status()
            self._send_json(HTTPStatus.OK, profile)
            return

        if path == "/api/widgets":
            query = parse_qs(parsed.query)
            kind = query.get("kind", [None])[0]
            widgets = self.context.store.list_widgets(kind=kind)
            self._send_json(HTTPStatus.OK, {"items": widgets})
            return

        widget_id, action = self._parse_widget_path(path)
        if widget_id and action is None:
            widget = self.context.store.get_widget(widget_id)
            if widget is None:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Widget not found"})
            else:
                self._send_json(HTTPStatus.OK, widget)
            return

        if path == "/api/dashboard":
            payload = {
                "profile_status": self.context.store.get_profile_status(),
                "widgets": self.context.store.list_widgets(),
                "providers": self.context.registry.list_kinds(),
                "theme": self.context.store.get_ui_theme(),
                "generated_at": utc_now_iso(),
            }
            self._send_json(HTTPStatus.OK, payload)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/admin/login":
            client_key = self._client_identity_key()
            if not self._enforce_auth_rate_limit(client_key):
                return

            body = self._parse_json_body()
            if body is None:
                return

            token = str(body.get("token", "")).strip()
            if not self.context.store.verify_admin_token(token):
                status = self.context.auth_limiter.record_failure(client_key)
                if bool(status["blocked"]):
                    self._send_json(
                        HTTPStatus.TOO_MANY_REQUESTS,
                        {
                            "error": "Too many authentication attempts. Try again later.",
                            "retry_after": int(status["retry_after"]),
                            "rate_limit": status,
                        },
                        extra_headers={"Retry-After": str(int(status["retry_after"]))},
                    )
                else:
                    self._send_json(
                        HTTPStatus.UNAUTHORIZED,
                        {
                            "error": "Admin authentication failed",
                            "rate_limit": status,
                        },
                    )
                return

            self.context.auth_limiter.record_success(client_key)
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "must_change_token": self.context.store.is_admin_token_change_required(),
                    "rate_limit": self.context.auth_limiter.current_status(client_key),
                },
            )
            return

        if path == "/api/admin/change-token":
            client_key = self._client_identity_key()
            if not self._enforce_auth_rate_limit(client_key):
                return

            body = self._parse_json_body()
            if body is None:
                return

            current_token = str(body.get("current_token", "")).strip()
            new_token = str(body.get("new_token", "")).strip()

            error = self._validate_new_token(new_token)
            if error:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": error})
                return

            changed = self.context.store.change_admin_token(current_token, new_token)
            if not changed:
                status = self.context.auth_limiter.record_failure(client_key)
                if bool(status["blocked"]):
                    self._send_json(
                        HTTPStatus.TOO_MANY_REQUESTS,
                        {
                            "error": "Too many authentication attempts. Try again later.",
                            "retry_after": int(status["retry_after"]),
                            "rate_limit": status,
                        },
                        extra_headers={"Retry-After": str(int(status["retry_after"]))},
                    )
                else:
                    self._send_json(
                        HTTPStatus.UNAUTHORIZED,
                        {
                            "error": "Current token is invalid",
                            "rate_limit": status,
                        },
                    )
                return

            self.context.auth_limiter.record_success(client_key)
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "rate_limit": self.context.auth_limiter.current_status(client_key),
                },
            )
            return

        if path == "/api/theme":
            if not self._require_admin(enforce_token_rotated=True):
                return

            body = self._parse_json_body()
            if body is None:
                return

            theme = str(body.get("theme", "")).strip().lower()
            if theme not in SUPPORTED_UI_THEMES:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Unsupported theme"})
                return

            saved = self.context.store.set_ui_theme(theme)
            self._send_json(HTTPStatus.OK, {"theme": saved})
            return
        if path == "/api/profile/status":
            if not self._require_admin(enforce_token_rotated=True):
                return

            body = self._parse_json_body()
            if body is None:
                return

            state = str(body.get("state", "")).strip().lower()
            note = str(body.get("note", "")).strip()

            if not state:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "'state' is required"})
                return

            profile = self.context.store.set_profile_status(state=state, note=note)
            self._send_json(HTTPStatus.OK, profile)
            return

        if path == "/api/widgets/minecraft":
            if not self._require_admin(enforce_token_rotated=True):
                return

            body = self._parse_json_body()
            if body is None:
                return

            widget, error = self._upsert_minecraft_widget(body)
            if error:
                self._send_json(error[0], {"error": error[1]})
                return

            self._send_json(HTTPStatus.CREATED, widget)
            return

        widget_id, action = self._parse_widget_path(path)
        if widget_id and action == "order":
            if not self._require_admin(enforce_token_rotated=True):
                return

            body = self._parse_json_body()
            if body is None:
                return

            raw_position = body.get("position")
            try:
                position = int(raw_position)
            except (TypeError, ValueError):
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "'position' must be an integer >= 0"})
                return

            if position < 0:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": "'position' must be >= 0"})
                return

            updated = self.context.store.set_widget_order(widget_id, position)
            if updated is None:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Widget not found"})
            else:
                self._send_json(HTTPStatus.OK, updated)
            return

        if widget_id and action == "refresh":
            if not self._require_admin(enforce_token_rotated=True):
                return

            refreshed = self.context.poller.refresh_widget(widget_id)
            if refreshed is None:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Widget not found"})
            else:
                self._send_json(HTTPStatus.OK, refreshed)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})

    def do_PUT(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        widget_id, action = self._parse_widget_path(path)
        if not widget_id or action != "minecraft":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})
            return

        if not self._require_admin(enforce_token_rotated=True):
            return

        body = self._parse_json_body()
        if body is None:
            return

        existing = self.context.store.get_widget(widget_id)
        if existing is None:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Widget not found"})
            return

        widget, error = self._upsert_minecraft_widget(body, widget_id=widget_id, existing=existing)
        if error:
            self._send_json(error[0], {"error": error[1]})
            return

        self._send_json(HTTPStatus.OK, widget)

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        widget_id, action = self._parse_widget_path(path)
        if not widget_id or action is not None:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Route not found"})
            return

        if not self._require_admin(enforce_token_rotated=True):
            return

        deleted = self.context.store.delete_widget(widget_id)
        if not deleted:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Widget not found"})
            return

        self._send_json(HTTPStatus.OK, {"ok": True})

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        logger.info("%s - %s", self.address_string(), format % args)

    def _parse_json_body(self) -> dict | None:
        content_length = self.headers.get("Content-Length")
        if not content_length:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Request body is required"})
            return None

        try:
            raw = self.rfile.read(int(content_length))
            body = json.loads(raw.decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
            return None

        if not isinstance(body, dict):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "JSON body must be an object"})
            return None

        return body

    def _serve_static(self, relative_path: str) -> None:
        base_dir = self.context.config.static_dir.resolve()
        requested = (base_dir / relative_path).resolve()

        if base_dir not in requested.parents and requested != base_dir:
            self._send_json(HTTPStatus.FORBIDDEN, {"error": "Forbidden"})
            return

        if not requested.exists() or not requested.is_file():
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "File not found"})
            return

        mime, _ = mimetypes.guess_type(str(requested))
        content_type = mime or "application/octet-stream"

        data = requested.read_bytes()

        self.send_response(HTTPStatus.OK)
        self._send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, status: HTTPStatus, payload: dict, *, extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")

    def _parse_widget_path(self, path: str) -> tuple[str | None, str | None]:
        parts = [part for part in path.split("/") if part]
        if len(parts) < 3 or parts[0] != "api" or parts[1] != "widgets":
            return None, None

        widget_id = parts[2]
        action = parts[3] if len(parts) >= 4 else None
        return widget_id, action

    def _require_admin(self, *, enforce_token_rotated: bool) -> bool:
        token = self._extract_admin_token()
        if not self.context.store.verify_admin_token(token):
            self._send_json(HTTPStatus.UNAUTHORIZED, {"error": "Admin authentication failed"})
            return False

        if enforce_token_rotated and self.context.store.is_admin_token_change_required():
            self._send_json(
                HTTPStatus.PRECONDITION_REQUIRED,
                {"error": "Token must be changed before using admin actions"},
            )
            return False

        return True

    def _extract_admin_token(self) -> str:
        token = self.headers.get("X-Admin-Token", "").strip()
        if token:
            return token

        authorization = self.headers.get("Authorization", "").strip()
        if authorization.lower().startswith("bearer "):
            return authorization[7:].strip()

        return ""

    def _upsert_minecraft_widget(
        self,
        body: dict,
        *,
        widget_id: str | None = None,
        existing: dict | None = None,
    ) -> tuple[dict | None, tuple[HTTPStatus, str] | None]:
        if existing:
            default_edition = "java" if existing["kind"] == "minecraft-java" else "bedrock"
        else:
            default_edition = "java"

        edition = str(body.get("edition", default_edition)).strip().lower()
        kind = {
            "java": "minecraft-java",
            "bedrock": "minecraft-bedrock",
        }.get(edition)

        if kind is None:
            return None, (HTTPStatus.BAD_REQUEST, "'edition' must be 'java' or 'bedrock'")

        provider = self.context.registry.get(kind)
        if provider is None:
            return None, (HTTPStatus.INTERNAL_SERVER_ERROR, "Provider is not registered")

        resolved_widget_id = widget_id or str(body.get("id", "")).strip() or str(uuid.uuid4())

        if existing is None:
            existing = self.context.store.get_widget(resolved_widget_id)

        if existing is None:
            enabled_default = True
            existing_config: dict = {}
            existing_name = f"Minecraft ({edition})"
        else:
            enabled_default = existing["enabled"]
            existing_config = dict(existing["config"])
            existing_name = existing["name"]

        name = str(body.get("name", existing_name)).strip() or existing_name
        enabled = self._coerce_bool(body.get("enabled"), enabled_default)

        raw_config = {
            "host": body.get("host", existing_config.get("host")),
            "port": body.get("port", existing_config.get("port")),
            "timeout_sec": body.get("timeout_sec", existing_config.get("timeout_sec", 6)),
            "source": body.get("source", existing_config.get("source", "auto")),
        }

        try:
            config = provider.validate_config(raw_config)
        except Exception as exc:  # noqa: BLE001
            return None, (HTTPStatus.BAD_REQUEST, str(exc))

        widget = self.context.store.upsert_widget(
            widget_id=resolved_widget_id,
            kind=kind,
            name=name,
            enabled=enabled,
            config=config,
        )

        if enabled:
            widget = self.context.poller.refresh_widget(resolved_widget_id) or widget

        return widget, None

    def _coerce_bool(self, value: object, default: bool) -> bool:
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)

    def _validate_new_token(self, token: str) -> str | None:
        if len(token) < 8:
            return "New token must be at least 8 characters"
        if token.strip() != token:
            return "New token must not start or end with whitespace"
        return None

    def _client_identity_key(self) -> str:
        # Reverse proxies should overwrite this by setting proper forwarding middleware.
        return self.client_address[0] or "unknown"

    def _enforce_auth_rate_limit(self, client_key: str) -> bool:
        status = self.context.auth_limiter.current_status(client_key)
        if not bool(status["blocked"]):
            return True

        retry_after = int(status["retry_after"])
        self._send_json(
            HTTPStatus.TOO_MANY_REQUESTS,
            {
                "error": "Too many authentication attempts. Try again later.",
                "retry_after": retry_after,
                "rate_limit": status,
            },
            extra_headers={"Retry-After": str(retry_after)},
        )
        return False


def build_context(config: AppConfig) -> AppContext:
    store = StatusStore(config.db_path, admin_bootstrap_token=config.admin_bootstrap_token)

    registry = ProviderRegistry()
    registry.register(MinecraftJavaProvider())
    registry.register(MinecraftBedrockProvider())

    poller = WidgetPoller(store=store, registry=registry, interval_sec=config.widget_poll_interval_sec)
    poller.start()

    auth_limiter = AuthRateLimiter(
        max_attempts=config.auth_max_attempts,
        window_sec=config.auth_window_sec,
        lockout_sec=config.auth_lockout_sec,
    )

    return AppContext(
        config=config,
        store=store,
        registry=registry,
        poller=poller,
        auth_limiter=auth_limiter,
    )


def run() -> None:
    config = load_config()
    configure_logging(config)

    context = build_context(config)
    MeowStatusHandler.context = context

    if context.config.admin_bootstrap_token == "change-me" and context.store.is_admin_token_change_required():
        logger.warning("MEOWSTATUS_ADMIN_TOKEN is still default value; please change it immediately")

    server = ThreadingHTTPServer((context.config.host, context.config.port), MeowStatusHandler)
    logger.info("MeowStatus running on http://%s:%s", context.config.host, context.config.port)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down")
    finally:
        server.shutdown()
        server.server_close()
        context.poller.shutdown()
        context.store.close()


if __name__ == "__main__":
    run()


