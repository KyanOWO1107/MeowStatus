from __future__ import annotations

import logging
import threading

from .plugins import ProviderError, ProviderRegistry
from .store import StatusStore

logger = logging.getLogger(__name__)


class WidgetPoller(threading.Thread):
    def __init__(self, store: StatusStore, registry: ProviderRegistry, interval_sec: int) -> None:
        super().__init__(name="widget-poller", daemon=True)
        self.store = store
        self.registry = registry
        self.interval_sec = max(5, interval_sec)
        self.stop_event = threading.Event()

    def run(self) -> None:
        self.poll_once()
        while not self.stop_event.wait(self.interval_sec):
            self.poll_once()

    def shutdown(self) -> None:
        self.stop_event.set()

    def poll_once(self) -> None:
        widgets = self.store.list_widgets(enabled_only=True)
        for widget in widgets:
            self.refresh_widget(widget["id"])

    def refresh_widget(self, widget_id: str) -> dict | None:
        widget = self.store.get_widget(widget_id)
        if widget is None:
            return None

        provider = self.registry.get(widget["kind"])
        if provider is None:
            return self.store.update_widget_snapshot(
                widget_id,
                payload=None,
                error=f"No provider registered for kind '{widget['kind']}'",
            )

        try:
            payload = provider.fetch_status(widget["config"])
            return self.store.update_widget_snapshot(widget_id, payload=payload, error=None)
        except ProviderError as exc:
            logger.warning("Widget %s refresh failed: %s", widget_id, exc)
            return self.store.update_widget_snapshot(widget_id, payload=None, error=str(exc))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Widget %s refresh failed with unexpected error", widget_id)
            return self.store.update_widget_snapshot(widget_id, payload=None, error=f"Unexpected error: {exc}")
