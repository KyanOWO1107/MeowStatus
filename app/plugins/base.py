from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ProviderError(Exception):
    """Raised when a widget provider cannot fetch status."""


class WidgetProvider(ABC):
    kind: str

    @abstractmethod
    def validate_config(self, config: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def fetch_status(self, config: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, WidgetProvider] = {}

    def register(self, provider: WidgetProvider) -> None:
        self._providers[provider.kind] = provider

    def get(self, kind: str) -> WidgetProvider | None:
        return self._providers.get(kind)

    def list_kinds(self) -> list[str]:
        return sorted(self._providers.keys())
