from __future__ import annotations

import inspect
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from .base import ProviderError, WidgetProvider

try:  # Optional dependency for direct protocol queries.
    from mcstatus import BedrockServer, JavaServer
except Exception:  # noqa: BLE001
    BedrockServer = None
    JavaServer = None


logger = logging.getLogger(__name__)

ALLOWED_SOURCES = {"auto", "mcstatus", "mcsrvstat"}

KNOWN_SOFTWARE_MARKERS = [
    "Paper",
    "Purpur",
    "Spigot",
    "Folia",
    "NeoForge",
    "Forge",
    "Fabric",
    "Velocity",
    "BungeeCord",
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _first_numeric(*candidates: Any) -> float | None:
    for value in candidates:
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            return int(raw)
        except ValueError:
            return None
    return None


def _extract_field(container: Any, *names: str) -> Any:
    if container is None:
        return None

    for name in names:
        if isinstance(container, dict):
            if name in container:
                return container.get(name)
            continue

        value = getattr(container, name, None)
        if value is not None:
            return value

    return None


def _extract_mapping(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value

    raw = getattr(value, "raw", None)
    if isinstance(raw, dict):
        return raw

    return None


def _flatten_mc_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        parts: list[str] = []
        text = value.get("text")
        if isinstance(text, str):
            parts.append(text)
        extra = value.get("extra")
        if isinstance(extra, list):
            parts.extend(_flatten_mc_text(item) for item in extra)
        return "".join(parts)
    if isinstance(value, list):
        return "".join(_flatten_mc_text(item) for item in value)

    for method_name in ("to_plain", "to_minecraft", "to_ansi"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                rendered = method()
            except Exception:  # noqa: BLE001
                continue
            if isinstance(rendered, str):
                return rendered

    return str(value)


def _normalize_version(value: Any) -> str | None:
    if value is None:
        return None

    if isinstance(value, str):
        text = value.strip()
        return text or None

    if isinstance(value, dict):
        for key in ("name", "version", "brand"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return item.strip()

    for key in ("name", "version", "brand"):
        item = getattr(value, key, None)
        if isinstance(item, str) and item.strip():
            return item.strip()

    text = str(value).strip()
    return text or None


def _detect_software_from_text(text: str | None) -> str | None:
    if not text:
        return None

    for marker in KNOWN_SOFTWARE_MARKERS:
        if re.search(rf"\b{re.escape(marker)}\b", text, flags=re.IGNORECASE):
            return marker
    return None


def _software_from_value(software: Any) -> str | None:
    if software is None:
        return None

    if isinstance(software, str):
        text = software.strip()
        return text or None

    if isinstance(software, dict):
        name = software.get("name") or software.get("brand") or software.get("type")
        version = software.get("version")
        if isinstance(name, str) and name.strip():
            if isinstance(version, (str, int, float)) and str(version).strip():
                return f"{name} {version}".strip()
            return name.strip()

    name = getattr(software, "name", None) or getattr(software, "brand", None) or getattr(software, "type", None)
    version = getattr(software, "version", None)
    if isinstance(name, str) and name.strip():
        if isinstance(version, (str, int, float)) and str(version).strip():
            return f"{name} {version}".strip()
        return name.strip()

    return None


def _detect_software(data: dict[str, Any]) -> str | None:
    software = _software_from_value(data.get("software"))
    if software:
        return software

    brand = data.get("brand")
    if isinstance(brand, str) and brand.strip():
        return brand.strip()

    version = data.get("version")
    if isinstance(version, str):
        marker = _detect_software_from_text(version)
        if marker:
            return marker

    if isinstance(version, dict):
        name = version.get("name")
        if isinstance(name, str):
            marker = _detect_software_from_text(name)
            if marker:
                return marker

    return None


def _call_method_with_timeout(obj: Any, method_name: str, timeout_sec: int) -> Any:
    method = getattr(obj, method_name, None)
    if not callable(method):
        raise ProviderError(f"mcstatus server does not support '{method_name}'")

    supports_timeout = False
    try:
        signature = inspect.signature(method)
        supports_timeout = "timeout" in signature.parameters
    except (TypeError, ValueError):
        supports_timeout = False

    if supports_timeout:
        return method(timeout=timeout_sec)
    return method()


class _MinecraftProviderBase(WidgetProvider):
    default_port: int
    endpoint_prefix: str
    mcstatus_edition: str

    def validate_config(self, config: dict[str, Any]) -> dict[str, Any]:
        host = str(config.get("host", "")).strip()
        if not host:
            raise ProviderError("Minecraft widget requires a non-empty host")

        raw_port = config.get("port")
        if raw_port in (None, ""):
            raw_port = self.default_port

        try:
            port = int(raw_port)
        except (TypeError, ValueError) as exc:
            raise ProviderError("Minecraft widget port must be an integer") from exc

        raw_timeout = config.get("timeout_sec", 6)
        if raw_timeout in (None, ""):
            raw_timeout = 6

        try:
            timeout_sec = int(raw_timeout)
        except (TypeError, ValueError) as exc:
            raise ProviderError("Minecraft widget timeout_sec must be an integer") from exc

        source = str(config.get("source", "auto")).strip().lower()
        if source not in ALLOWED_SOURCES:
            allowed = ", ".join(sorted(ALLOWED_SOURCES))
            raise ProviderError(f"Minecraft widget source must be one of: {allowed}")

        return {
            "host": host,
            "port": port,
            "timeout_sec": timeout_sec,
            "source": source,
        }

    def fetch_status(self, config: dict[str, Any]) -> dict[str, Any]:
        normalized = self.validate_config(config)
        source = normalized["source"]

        if source == "mcstatus":
            return self._fetch_via_mcstatus(normalized)

        if source == "mcsrvstat":
            return self._fetch_via_mcsrvstat(normalized)

        try:
            return self._fetch_via_mcstatus(normalized)
        except ProviderError as exc:
            logger.warning(
                "mcstatus lookup failed for %s:%s, falling back to mcsrvstat: %s",
                normalized["host"],
                normalized["port"],
                exc,
            )

        try:
            payload = self._fetch_via_mcsrvstat(normalized)
            payload["fallback_from"] = "mcstatus"
            return payload
        except ProviderError as exc:
            logger.warning(
                "mcsrvstat fallback failed for %s:%s: %s",
                normalized["host"],
                normalized["port"],
                exc,
            )
            raise ProviderError("Minecraft status lookup failed on all sources") from exc

    def _build_target(self, host: str, port: int) -> str:
        return f"{host}:{port}"

    def _fetch_via_mcsrvstat(self, config: dict[str, Any]) -> dict[str, Any]:
        host = config["host"]
        port = config["port"]
        timeout_sec = config["timeout_sec"]

        target = self._build_target(host, port)
        encoded_target = urllib.parse.quote(target, safe="")
        url = f"https://api.mcsrvstat.us/{self.endpoint_prefix}/{encoded_target}"

        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "MeowStatus/0.3 (+https://localhost)"},
            )
            with urllib.request.urlopen(request, timeout=timeout_sec) as response:
                if response.status != 200:
                    raise ProviderError(f"Minecraft status API returned HTTP {response.status}")
                raw = response.read().decode("utf-8")
                data = json.loads(raw)
        except urllib.error.URLError as exc:
            raise ProviderError("Could not query Minecraft status API") from exc
        except json.JSONDecodeError as exc:
            raise ProviderError("Minecraft status API returned invalid JSON") from exc

        motd = ""
        motd_field = data.get("motd")
        if isinstance(motd_field, dict):
            clean_lines = motd_field.get("clean")
            if isinstance(clean_lines, list):
                motd = " ".join(str(line) for line in clean_lines if line)

        players = data.get("players") if isinstance(data.get("players"), dict) else {}
        debug = data.get("debug") if isinstance(data.get("debug"), dict) else {}

        latency_ms = _first_numeric(
            data.get("latency"),
            data.get("ping"),
            debug.get("latency"),
            debug.get("response_time"),
            debug.get("duration_ms"),
        )
        if latency_ms is not None:
            latency_ms = round(latency_ms, 2)

        return {
            "provider": self.kind,
            "source": "mcsrvstat",
            "target": target,
            "online": bool(data.get("online")),
            "motd": motd,
            "version": data.get("version"),
            "server_software": _detect_software(data),
            "players_online": players.get("online"),
            "players_max": players.get("max"),
            "latency_ms": latency_ms,
            "ping_protocol_used": debug.get("ping") if isinstance(debug.get("ping"), bool) else None,
            "query_protocol_used": debug.get("query") if isinstance(debug.get("query"), bool) else None,
            "favicon": data.get("icon"),
            "checked_at": _utc_now_iso(),
            "raw": data,
        }

    def _fetch_via_mcstatus(self, config: dict[str, Any]) -> dict[str, Any]:
        host = config["host"]
        port = config["port"]
        timeout_sec = config["timeout_sec"]
        target = self._build_target(host, port)

        if self.mcstatus_edition == "java":
            server_cls = JavaServer
        else:
            server_cls = BedrockServer

        if server_cls is None:
            raise ProviderError("mcstatus library is not installed")

        try:
            server = server_cls.lookup(target)
        except Exception as exc:  # noqa: BLE001
            raise ProviderError("Could not initialize mcstatus server lookup") from exc

        for attr_name in ("timeout", "socket_timeout"):
            if hasattr(server, attr_name):
                try:
                    setattr(server, attr_name, float(timeout_sec))
                except Exception:  # noqa: BLE001
                    pass

        try:
            status = _call_method_with_timeout(server, "status", timeout_sec)
        except Exception as exc:  # noqa: BLE001
            raise ProviderError("Could not query Minecraft server via mcstatus") from exc

        raw_status = _extract_mapping(status) or {}

        players_value = _extract_field(status, "players")
        players_online = _coerce_int(_extract_field(players_value, "online"))
        players_max = _coerce_int(_extract_field(players_value, "max"))

        version = _normalize_version(_extract_field(status, "version"))
        if version is None:
            version = _normalize_version(_extract_field(raw_status, "version"))

        motd = _flatten_mc_text(_extract_field(status, "motd", "description")).strip()
        if not motd:
            motd = _flatten_mc_text(_extract_field(raw_status, "motd", "description")).strip()

        latency_ms = _first_numeric(_extract_field(status, "latency", "ping"))
        if latency_ms is not None:
            latency_ms = round(latency_ms, 2)

        favicon = _extract_field(status, "icon")
        if not isinstance(favicon, str):
            favicon = _extract_field(raw_status, "favicon", "icon")

        software = _software_from_value(_extract_field(status, "software"))
        if software is None:
            software = _detect_software(raw_status)
        if software is None:
            software = _detect_software_from_text(version)

        query_protocol_used: bool | None = None
        raw_query: dict[str, Any] | None = None

        if self.mcstatus_edition == "java" and software is None:
            try:
                query = _call_method_with_timeout(server, "query", timeout_sec)
                raw_query = _extract_mapping(query)
                software = _software_from_value(_extract_field(query, "software"))
                if software is None and isinstance(raw_query, dict):
                    software = _detect_software(raw_query)
                query_protocol_used = True
            except Exception:  # noqa: BLE001
                query_protocol_used = False

        raw_payload: dict[str, Any]
        if raw_query is not None:
            raw_payload = {
                "status": raw_status,
                "query": raw_query,
            }
        else:
            raw_payload = raw_status

        online_value = _extract_field(status, "online", "is_online")
        if online_value is None:
            online_value = _extract_field(raw_status, "online")
        online = bool(online_value) if online_value is not None else True

        ping_protocol_used: bool | None = True if self.mcstatus_edition == "java" else None

        return {
            "provider": self.kind,
            "source": "mcstatus",
            "target": target,
            "online": online,
            "motd": motd,
            "version": version,
            "server_software": software,
            "players_online": players_online,
            "players_max": players_max,
            "latency_ms": latency_ms,
            "ping_protocol_used": ping_protocol_used,
            "query_protocol_used": query_protocol_used,
            "favicon": favicon,
            "checked_at": _utc_now_iso(),
            "raw": raw_payload,
        }


class MinecraftJavaProvider(_MinecraftProviderBase):
    kind = "minecraft-java"
    default_port = 25565
    endpoint_prefix = "3"
    mcstatus_edition = "java"


class MinecraftBedrockProvider(_MinecraftProviderBase):
    kind = "minecraft-bedrock"
    default_port = 19132
    endpoint_prefix = "bedrock/3"
    mcstatus_edition = "bedrock"
