from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from .base import ProviderError, WidgetProvider


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


def _detect_software(data: dict[str, Any]) -> str | None:
    software = data.get("software")
    if isinstance(software, str) and software.strip():
        return software.strip()

    if isinstance(software, dict):
        name = software.get("name") or software.get("brand") or software.get("type")
        version = software.get("version")
        if isinstance(name, str) and name.strip():
            if isinstance(version, (str, int, float)) and str(version).strip():
                return f"{name} {version}".strip()
            return name.strip()

    brand = data.get("brand")
    if isinstance(brand, str) and brand.strip():
        return brand.strip()

    version = data.get("version")
    if isinstance(version, str):
        for marker in KNOWN_SOFTWARE_MARKERS:
            if re.search(rf"\b{re.escape(marker)}\b", version, flags=re.IGNORECASE):
                return marker

    return None


class _MinecraftProviderBase(WidgetProvider):
    default_port: int
    endpoint_prefix: str

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

        source = str(config.get("source", "mcsrvstat")).strip().lower()
        if source != "mcsrvstat":
            raise ProviderError("Only source='mcsrvstat' is supported in this build")

        return {
            "host": host,
            "port": port,
            "timeout_sec": timeout_sec,
            "source": source,
        }

    def fetch_status(self, config: dict[str, Any]) -> dict[str, Any]:
        normalized = self.validate_config(config)
        host = normalized["host"]
        port = normalized["port"]
        timeout_sec = normalized["timeout_sec"]

        target = f"{host}:{port}"
        encoded_target = urllib.parse.quote(target, safe="")
        url = f"https://api.mcsrvstat.us/{self.endpoint_prefix}/{encoded_target}"

        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "MeowStatus/0.2 (+https://localhost)"},
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


class MinecraftJavaProvider(_MinecraftProviderBase):
    kind = "minecraft-java"
    default_port = 25565
    endpoint_prefix = "3"


class MinecraftBedrockProvider(_MinecraftProviderBase):
    kind = "minecraft-bedrock"
    default_port = 19132
    endpoint_prefix = "bedrock/3"
