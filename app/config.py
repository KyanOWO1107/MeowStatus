from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class AppConfig:
    host: str
    port: int
    db_path: Path
    static_dir: Path
    widget_poll_interval_sec: int
    admin_bootstrap_token: str
    admin_path: str
    auth_max_attempts: int
    auth_window_sec: int
    auth_lockout_sec: int
    log_level: str
    log_dir: Path
    log_max_bytes: int
    log_backup_count: int
    local_assets_dir: Path


RESERVED_ADMIN_PATH_PREFIXES = (
    "/api",
    "/static",
)

RESERVED_ADMIN_PATHS = {
    "/",
    "/index.html",
    "/favicon.ico",
}


def _normalize_admin_path(raw_path: str) -> str:
    path = (raw_path or "").strip()
    if not path:
        path = "/admin"

    if not path.startswith("/"):
        path = "/" + path

    parts = [part for part in path.split("/") if part]
    if not parts:
        path = "/admin"
    else:
        path = "/" + "/".join(parts)

    if path in RESERVED_ADMIN_PATHS:
        raise ValueError(f"MEOWSTATUS_ADMIN_PATH '{path}' is reserved")

    for prefix in RESERVED_ADMIN_PATH_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            raise ValueError(f"MEOWSTATUS_ADMIN_PATH '{path}' conflicts with reserved prefix '{prefix}'")

    return path


def _load_int_env(name: str, default: int, *, min_value: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc

    if value < min_value:
        raise ValueError(f"{name} must be >= {min_value}")

    return value


def load_config() -> AppConfig:
    root_dir = Path(__file__).resolve().parent.parent
    default_db = root_dir / "data" / "status_hub.db"

    host = os.getenv("STATUS_HUB_HOST", "0.0.0.0")
    port = _load_int_env("STATUS_HUB_PORT", 8080, min_value=1)
    db_path = Path(os.getenv("STATUS_HUB_DB", str(default_db))).resolve()
    static_dir = root_dir / "app" / "static"
    widget_poll_interval_sec = _load_int_env("WIDGET_POLL_INTERVAL", 60, min_value=5)

    admin_bootstrap_token = os.getenv("MEOWSTATUS_ADMIN_TOKEN", "change-me")
    admin_path = _normalize_admin_path(os.getenv("MEOWSTATUS_ADMIN_PATH", "/admin"))

    auth_max_attempts = _load_int_env("MEOWSTATUS_AUTH_MAX_ATTEMPTS", 5, min_value=1)
    auth_window_sec = _load_int_env("MEOWSTATUS_AUTH_WINDOW_SEC", 60, min_value=5)
    auth_lockout_sec = _load_int_env("MEOWSTATUS_AUTH_LOCKOUT_SEC", 300, min_value=10)

    log_level = os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO"
    log_dir = Path(os.getenv("MEOWSTATUS_LOG_DIR", str(root_dir / "logs"))).resolve()
    log_max_bytes = _load_int_env("MEOWSTATUS_LOG_MAX_BYTES", 5 * 1024 * 1024, min_value=1024)
    log_backup_count = _load_int_env("MEOWSTATUS_LOG_BACKUP_COUNT", 5, min_value=1)
    local_assets_dir = Path(os.getenv("MEOWSTATUS_LOCAL_ASSETS_DIR", str(root_dir / "@localonly"))).resolve()

    return AppConfig(
        host=host,
        port=port,
        db_path=db_path,
        static_dir=static_dir,
        widget_poll_interval_sec=widget_poll_interval_sec,
        admin_bootstrap_token=admin_bootstrap_token,
        admin_path=admin_path,
        auth_max_attempts=auth_max_attempts,
        auth_window_sec=auth_window_sec,
        auth_lockout_sec=auth_lockout_sec,
        log_level=log_level,
        log_dir=log_dir,
        log_max_bytes=log_max_bytes,
        log_backup_count=log_backup_count,
        local_assets_dir=local_assets_dir,
    )


