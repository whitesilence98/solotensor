"""Runtime-overridable provider settings persisted to a gitignored JSON file.

The admin UI writes here so provider keys, models and the outbound proxy can be
changed without editing ``.env`` and restarting the API. Values are applied onto
the single live ``Settings`` instance (``main.settings``), which every service
already holds a reference to, so mutations take effect immediately.

The file is stored in plaintext by explicit product decision; it is protected by
file permissions and ``.gitignore``. Never log or return a full key value.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from ..config import Settings, get_settings

logger = logging.getLogger("comfy_studio.app_settings")

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PATH = _BACKEND_ROOT / "app_settings.json"

# JSON file key -> Settings attribute
FIELD_MAP: dict[str, str] = {
    "anthropic_api_key": "ANTHROPIC_API_KEY",
    "director_enabled": "DIRECTOR_ENABLED",
    "director_provider": "DIRECTOR_PROVIDER",
    "director_model": "DIRECTOR_MODEL",
    "assistant_enabled": "ASSISTANT_ENABLED",
    "assistant_model": "ANTHROPIC_MODEL",
    "local_llm_url": "LOCAL_LLM_URL",
    "local_llm_model": "LOCAL_LLM_MODEL",
    "local_llm_api_key": "LOCAL_LLM_API_KEY",
    "proxy_url": "PROXY_URL",
    "proxy_bypass_local": "PROXY_BYPASS_LOCAL",
}

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "[::1]"}


def _local_host(url: str) -> bool:
    try:
        host = (urlsplit(url).hostname or "").lower()
    except ValueError:
        return False
    return host in _LOCAL_HOSTS


def proxy_for(url: str, settings: Settings | None = None) -> str | None:
    """Return the configured proxy, unless the target is local and bypass is on."""
    settings = settings or get_settings()
    proxy = (settings.PROXY_URL or "").strip()
    if not proxy:
        return None
    if settings.PROXY_BYPASS_LOCAL and _local_host(url):
        return None
    return proxy


def _mask(value: str | None) -> tuple[bool, str | None]:
    if not value:
        return False, None
    return True, ("…" + value[-4:]) if len(value) >= 8 else "••••"


class AppSettingsService:
    def __init__(self, settings: Settings, path: Path | str | None = None) -> None:
        self.settings = settings
        self.path = Path(path) if path is not None else DEFAULT_PATH
        self._stored: dict[str, Any] = {}

    # --- persistence -----------------------------------------------------
    def load(self) -> None:
        """Read the file and apply it onto the live Settings instance."""
        self._stored = self._read()
        self._apply(self._stored)

    def _read(self) -> dict[str, Any]:
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                raw = json.load(handle)
        except FileNotFoundError:
            return {}
        except (OSError, ValueError) as exc:
            logger.warning("Ignoring unreadable %s: %s", self.path.name, exc)
            return {}
        if not isinstance(raw, dict):
            return {}
        return {k: v for k, v in raw.items() if k in FIELD_MAP}

    def _apply(self, values: dict[str, Any]) -> None:
        for key, attr in FIELD_MAP.items():
            if key in values:
                setattr(self.settings, attr, values[key])

    def _write(self, values: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(self.path.parent), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(values, handle, indent=2, sort_keys=True)
            os.replace(tmp, self.path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    # --- reads -----------------------------------------------------------
    def effective(self, key: str) -> Any:
        attr = FIELD_MAP.get(key)
        return getattr(self.settings, attr, None) if attr else None

    def snapshot(self) -> dict[str, Any]:
        anthropic_set, anthropic_hint = _mask(self.settings.ANTHROPIC_API_KEY)
        local_set, local_hint = _mask(self.settings.LOCAL_LLM_API_KEY)
        sources: dict[str, str] = {}
        for field, attr in FIELD_MAP.items():
            if field in self._stored:
                sources[field] = "file"
            elif os.environ.get(attr):
                sources[field] = "env"
            else:
                sources[field] = "default"
        return {
            "director_enabled": bool(self.settings.DIRECTOR_ENABLED),
            "director_provider": self.settings.DIRECTOR_PROVIDER,
            "director_model": self.settings.DIRECTOR_MODEL,
            "assistant_enabled": bool(self.settings.ASSISTANT_ENABLED),
            "assistant_model": self.settings.ANTHROPIC_MODEL,
            "local_llm_url": self.settings.LOCAL_LLM_URL,
            "local_llm_model": self.settings.LOCAL_LLM_MODEL,
            "anthropic_api_key_set": anthropic_set,
            "anthropic_api_key_hint": anthropic_hint,
            "local_llm_api_key_set": local_set,
            "local_llm_api_key_hint": local_hint,
            "proxy_url": self.settings.PROXY_URL,
            "proxy_bypass_local": bool(self.settings.PROXY_BYPASS_LOCAL),
            "sources": sources,
            "settings_paths": ["app_settings.json", ".env"],
        }

    # --- writes ----------------------------------------------------------
    def update(self, patch: dict[str, Any]) -> dict[str, Any]:
        """Validate, merge, persist and apply a partial update.

        Validation runs before anything mutates the live Settings instance or the
        file, so a rejected patch leaves both untouched.
        """
        merged = dict(self._stored)
        cleared: set[str] = set()
        for field, attr in FIELD_MAP.items():
            is_secret = field.endswith("_api_key")
            if is_secret and patch.get(f"clear_{field}"):
                merged.pop(field, None)
                cleared.add(field)
            elif field in patch:
                value = patch[field]
                # Blank/None secrets mean "leave unchanged"; blank scalars do apply.
                if is_secret:
                    if isinstance(value, str) and value.strip():
                        merged[field] = value.strip()
                elif value is not None:
                    merged[field] = value

        proxy = merged.get("proxy_url")
        if proxy:
            if not proxy.startswith(("http://", "https://")):
                raise ValueError("proxy_url must start with http:// or https://")
            try:
                urlsplit(proxy)
            except ValueError as exc:
                raise ValueError("proxy_url is not a valid URL") from exc

        self._write(merged)
        self._stored = merged
        for field in cleared:
            setattr(self.settings, FIELD_MAP[field], None)
        self._apply(merged)
        return self.snapshot()


_service: AppSettingsService | None = None


def get_app_settings_service(
    settings: Settings | None = None, path: Path | str | None = None
) -> AppSettingsService:
    global _service
    if path is not None:
        return AppSettingsService(settings or get_settings(), path)
    if _service is None:
        _service = AppSettingsService(settings or get_settings())
    return _service
