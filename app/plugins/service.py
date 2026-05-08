from __future__ import annotations

import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from .base import ProviderError, WidgetProvider


MIN_TIMEOUT_SEC = 1
MAX_TIMEOUT_SEC = 30
ALLOWED_METHODS = {"GET", "HEAD"}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_status(value: Any, *, default: int) -> int:
    if value in (None, ""):
        return default
    try:
        status = int(value)
    except (TypeError, ValueError) as exc:
        raise ProviderError("Service monitor status code must be an integer") from exc
    if status < 100 or status > 599:
        raise ProviderError("Service monitor status code must be between 100 and 599")
    return status


class HttpServiceProvider(WidgetProvider):
    kind = "service-http"

    def validate_config(self, config: dict[str, Any]) -> dict[str, Any]:
        url = str(config.get("url", "")).strip()
        if not url:
            raise ProviderError("Service monitor requires a non-empty url")

        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ProviderError("Service monitor url must be an http(s) URL")

        method = str(config.get("method", "GET")).strip().upper() or "GET"
        if method not in ALLOWED_METHODS:
            allowed = ", ".join(sorted(ALLOWED_METHODS))
            raise ProviderError(f"Service monitor method must be one of: {allowed}")

        raw_timeout = config.get("timeout_sec", 5)
        if raw_timeout in (None, ""):
            raw_timeout = 5
        try:
            timeout_sec = int(raw_timeout)
        except (TypeError, ValueError) as exc:
            raise ProviderError("Service monitor timeout_sec must be an integer") from exc
        if timeout_sec < MIN_TIMEOUT_SEC or timeout_sec > MAX_TIMEOUT_SEC:
            raise ProviderError(
                f"Service monitor timeout_sec must be between {MIN_TIMEOUT_SEC} and {MAX_TIMEOUT_SEC}"
            )

        status_min = _coerce_status(config.get("expected_status_min"), default=200)
        status_max = _coerce_status(config.get("expected_status_max"), default=399)
        if status_min > status_max:
            raise ProviderError("Service monitor expected status minimum must be <= maximum")

        return {
            "url": url,
            "method": method,
            "timeout_sec": timeout_sec,
            "expected_status_min": status_min,
            "expected_status_max": status_max,
        }

    def fetch_status(self, config: dict[str, Any]) -> dict[str, Any]:
        normalized = self.validate_config(config)
        url = normalized["url"]
        method = normalized["method"]
        timeout_sec = normalized["timeout_sec"]
        status_min = normalized["expected_status_min"]
        status_max = normalized["expected_status_max"]

        started = time.perf_counter()
        status_code: int | None = None
        status_text = "连接失败"
        error_message: str | None = None

        try:
            request = urllib.request.Request(
                url,
                method=method,
                headers={"User-Agent": "MeowStatus/0.4 (+https://localhost)"},
            )
            with urllib.request.urlopen(request, timeout=timeout_sec) as response:
                status_code = int(response.status)
                status_text = getattr(response, "reason", "") or "OK"
                if method == "GET":
                    response.read(1)
        except urllib.error.HTTPError as exc:
            status_code = int(exc.code)
            status_text = exc.reason or f"HTTP {exc.code}"
        except urllib.error.URLError:
            error_message = "请求失败或超时"
        except TimeoutError:
            error_message = "请求超时"

        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        online = status_code is not None and status_min <= status_code <= status_max

        return {
            "provider": self.kind,
            "source": "http",
            "target": url,
            "online": online,
            "status_code": status_code,
            "status_text": status_text if status_code is not None else error_message or status_text,
            "latency_ms": latency_ms,
            "method": method,
            "expected_status_min": status_min,
            "expected_status_max": status_max,
            "checked_at": _utc_now_iso(),
        }
