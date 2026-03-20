from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ADMIN_TOKEN_HASH_KEY = "admin_token_hash"
ADMIN_TOKEN_CHANGE_REQUIRED_KEY = "admin_token_change_required"
UI_THEME_KEY = "ui_theme"

PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 390000
PBKDF2_SALT_BYTES = 16


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _legacy_hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _pbkdf2_hash(token: str, *, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", token.encode("utf-8"), salt, iterations)


def _make_token_hash(token: str) -> str:
    salt = secrets.token_bytes(PBKDF2_SALT_BYTES)
    digest = _pbkdf2_hash(token, salt=salt, iterations=PBKDF2_ITERATIONS)
    return f"{PBKDF2_ALGORITHM}${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def _verify_token_hash(stored_hash: str, token: str) -> bool:
    if stored_hash.startswith(PBKDF2_ALGORITHM + "$"):
        parts = stored_hash.split("$", 3)
        if len(parts) != 4:
            return False

        _, iterations_raw, salt_hex, digest_hex = parts

        try:
            iterations = int(iterations_raw)
            salt = bytes.fromhex(salt_hex)
            expected_digest = bytes.fromhex(digest_hex)
        except ValueError:
            return False

        actual_digest = _pbkdf2_hash(token, salt=salt, iterations=iterations)
        return hmac.compare_digest(expected_digest, actual_digest)

    # Legacy compatibility: unsalted SHA-256 hash.
    if len(stored_hash) == 64:
        return hmac.compare_digest(stored_hash, _legacy_hash_token(token))

    return False


def _is_legacy_hash(stored_hash: str) -> bool:
    return len(stored_hash) == 64 and not stored_hash.startswith(PBKDF2_ALGORITHM + "$")


def _classify_widget_error(error: str | None) -> tuple[str | None, str | None]:
    if error is None:
        return None, None

    text = str(error).strip()
    if not text:
        return None, None

    lowered = text.lower()

    if "could not query minecraft status api" in lowered:
        return "MC_NET_FAIL", "Minecraft 状态查询失败（网络不可达或超时）"

    if "minecraft status api returned http" in lowered:
        return "MC_UPSTREAM_HTTP", "Minecraft 状态查询失败（上游服务返回异常）"

    if "minecraft status api returned invalid json" in lowered:
        return "MC_UPSTREAM_BAD_JSON", "Minecraft 状态查询失败（上游响应格式异常）"

    if lowered.startswith("unexpected error") or lowered.startswith("widget refresh failed due to internal error"):
        return "WIDGET_INTERNAL_ERROR", "挂件刷新失败（服务内部异常）"

    if "no provider registered for kind" in lowered:
        return "WIDGET_PROVIDER_MISSING", "挂件刷新失败（缺少对应类型的提供器）"

    sensitive_markers = ("traceback", "ssl:", "urlopen error", "_ssl.c:", "file \"", "errno")
    if any(marker in lowered for marker in sensitive_markers):
        return "WIDGET_RUNTIME_ERROR", "挂件刷新失败（网络或服务异常）"

    if len(text) > 180:
        return "WIDGET_ERROR_REDACTED", "挂件刷新失败（错误信息已省略）"

    return "WIDGET_ERROR", text


class StatusStore:
    def __init__(self, db_path: Path, *, admin_bootstrap_token: str) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._admin_bootstrap_token = admin_bootstrap_token
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            cur = self._conn.cursor()
            cur.executescript(
                """
                CREATE TABLE IF NOT EXISTS profile_status (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    state TEXT NOT NULL,
                    note TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS widgets (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    name TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    config_json TEXT NOT NULL,
                    last_payload_json TEXT,
                    last_updated_at TEXT,
                    last_error TEXT,
                    last_error_code TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            self._conn.commit()

            self._ensure_widgets_schema(cur)

            row = cur.execute("SELECT id FROM profile_status WHERE id = 1").fetchone()
            if row is None:
                now = utc_now_iso()
                cur.execute(
                    "INSERT INTO profile_status (id, state, note, updated_at) VALUES (1, ?, ?, ?)",
                    ("away", "", now),
                )
                self._conn.commit()

            self._ensure_admin_settings()

    def _ensure_widgets_schema(self, cur: sqlite3.Cursor) -> None:
        rows = cur.execute("PRAGMA table_info(widgets)").fetchall()
        columns = {str(row["name"]).strip().lower() for row in rows}

        if "last_error_code" not in columns:
            cur.execute("ALTER TABLE widgets ADD COLUMN last_error_code TEXT")
            self._conn.commit()

    def _ensure_admin_settings(self) -> None:
        now = utc_now_iso()
        token_row = self._conn.execute(
            "SELECT value FROM app_settings WHERE key = ?", (ADMIN_TOKEN_HASH_KEY,)
        ).fetchone()
        if token_row is None:
            self._conn.execute(
                "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
                (ADMIN_TOKEN_HASH_KEY, _make_token_hash(self._admin_bootstrap_token), now),
            )

        force_change_row = self._conn.execute(
            "SELECT value FROM app_settings WHERE key = ?", (ADMIN_TOKEN_CHANGE_REQUIRED_KEY,)
        ).fetchone()
        if force_change_row is None:
            self._conn.execute(
                "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
                (ADMIN_TOKEN_CHANGE_REQUIRED_KEY, "1", now),
            )

        theme_row = self._conn.execute(
            "SELECT value FROM app_settings WHERE key = ?", (UI_THEME_KEY,)
        ).fetchone()
        if theme_row is None:
            self._conn.execute(
                "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
                (UI_THEME_KEY, "bluery", now),
            )

        self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def get_profile_status(self) -> dict[str, Any]:
        with self._lock:
            row = self._conn.execute(
                "SELECT state, note, updated_at FROM profile_status WHERE id = 1"
            ).fetchone()

        return {
            "state": row["state"],
            "note": row["note"],
            "updated_at": row["updated_at"],
        }

    def set_profile_status(self, state: str, note: str) -> dict[str, Any]:
        now = utc_now_iso()
        with self._lock:
            self._conn.execute(
                "UPDATE profile_status SET state = ?, note = ?, updated_at = ? WHERE id = 1",
                (state, note, now),
            )
            self._conn.commit()

        return {"state": state, "note": note, "updated_at": now}

    def list_widgets(self, *, enabled_only: bool = False, kind: str | None = None) -> list[dict[str, Any]]:
        query = (
            "SELECT id, kind, name, enabled, config_json, last_payload_json, last_updated_at, "
            "last_error, last_error_code, created_at, updated_at FROM widgets"
        )
        where_parts: list[str] = []
        values: list[Any] = []

        if enabled_only:
            where_parts.append("enabled = 1")
        if kind:
            where_parts.append("kind = ?")
            values.append(kind)

        if where_parts:
            query += " WHERE " + " AND ".join(where_parts)

        query += " ORDER BY updated_at DESC, created_at DESC"

        with self._lock:
            rows = self._conn.execute(query, values).fetchall()

        return [self._widget_row_to_dict(row) for row in rows]

    def get_widget(self, widget_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT id, kind, name, enabled, config_json, last_payload_json,
                       last_updated_at, last_error, last_error_code, created_at, updated_at
                FROM widgets WHERE id = ?
                """,
                (widget_id,),
            ).fetchone()

        return self._widget_row_to_dict(row) if row else None

    def upsert_widget(
        self,
        *,
        widget_id: str,
        kind: str,
        name: str,
        enabled: bool,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        now = utc_now_iso()
        config_json = json.dumps(config, ensure_ascii=True)

        with self._lock:
            current = self._conn.execute(
                "SELECT id FROM widgets WHERE id = ?", (widget_id,)
            ).fetchone()

            if current:
                self._conn.execute(
                    """
                    UPDATE widgets
                    SET kind = ?, name = ?, enabled = ?, config_json = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (kind, name, int(enabled), config_json, now, widget_id),
                )
            else:
                self._conn.execute(
                    """
                    INSERT INTO widgets
                    (id, kind, name, enabled, config_json, last_payload_json,
                     last_updated_at, last_error, last_error_code, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
                    """,
                    (widget_id, kind, name, int(enabled), config_json, now, now),
                )

            self._conn.commit()

        updated = self.get_widget(widget_id)
        if updated is None:
            raise RuntimeError("Widget upsert failed unexpectedly")
        return updated

    def update_widget_snapshot(
        self,
        widget_id: str,
        *,
        payload: dict[str, Any] | None,
        error: str | None,
    ) -> dict[str, Any] | None:
        now = utc_now_iso()
        payload_json = json.dumps(payload, ensure_ascii=True) if payload is not None else None
        error_code, safe_error = _classify_widget_error(error)

        with self._lock:
            self._conn.execute(
                """
                UPDATE widgets
                SET last_payload_json = ?,
                    last_error = ?,
                    last_error_code = ?,
                    last_updated_at = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (payload_json, safe_error, error_code, now, now, widget_id),
            )
            self._conn.commit()

        return self.get_widget(widget_id)

    def delete_widget(self, widget_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM widgets WHERE id = ?", (widget_id,))
            self._conn.commit()
            return cur.rowcount > 0

    def verify_admin_token(self, token: str) -> bool:
        if not token:
            return False

        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM app_settings WHERE key = ?", (ADMIN_TOKEN_HASH_KEY,)
            ).fetchone()

            if row is None:
                return False

            stored_hash = row["value"]
            matched = _verify_token_hash(stored_hash, token)

            # Lazy upgrade for legacy hashes after a successful login.
            if matched and _is_legacy_hash(stored_hash):
                self._conn.execute(
                    "UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?",
                    (_make_token_hash(token), utc_now_iso(), ADMIN_TOKEN_HASH_KEY),
                )
                self._conn.commit()

            return matched

    def is_admin_token_change_required(self) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM app_settings WHERE key = ?", (ADMIN_TOKEN_CHANGE_REQUIRED_KEY,)
            ).fetchone()

        if row is None:
            return True
        return row["value"] == "1"

    def change_admin_token(self, current_token: str, new_token: str) -> bool:
        if not self.verify_admin_token(current_token):
            return False

        now = utc_now_iso()
        with self._lock:
            self._conn.execute(
                "UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?",
                (_make_token_hash(new_token), now, ADMIN_TOKEN_HASH_KEY),
            )
            self._conn.execute(
                "UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?",
                ("0", now, ADMIN_TOKEN_CHANGE_REQUIRED_KEY),
            )
            self._conn.commit()

        return True

    def get_ui_theme(self) -> str:
        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM app_settings WHERE key = ?", (UI_THEME_KEY,)
            ).fetchone()
        if row is None:
            return "bluery"
        value = str(row["value"]).strip().lower()
        return value or "bluery"

    def set_ui_theme(self, theme: str) -> str:
        now = utc_now_iso()
        normalized = theme.strip().lower()
        with self._lock:
            self._conn.execute(
                "UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?",
                (normalized, now, UI_THEME_KEY),
            )
            self._conn.commit()
        return normalized

    def _widget_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        payload_raw = row["last_payload_json"]
        classified_code, safe_error = _classify_widget_error(row["last_error"])

        stored_code = row["last_error_code"]
        if isinstance(stored_code, str) and stored_code.strip():
            resolved_code = stored_code.strip()
        else:
            resolved_code = classified_code

        if safe_error is None:
            resolved_code = None

        return {
            "id": row["id"],
            "kind": row["kind"],
            "name": row["name"],
            "enabled": bool(row["enabled"]),
            "config": json.loads(row["config_json"]),
            "last_payload": json.loads(payload_raw) if payload_raw else None,
            "last_updated_at": row["last_updated_at"],
            "last_error": safe_error,
            "last_error_code": resolved_code,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
