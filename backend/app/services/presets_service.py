"""Owner-scoped generation presets.

Stored payloads are validated on write and again on read against
``GenerationPresetPayload`` (the deep-link vocabulary only). A stored payload
that no longer validates is reported with ``payload=None`` plus an explicit
warning so the UI can refuse to apply it instead of silently generating with
defaults.
"""

import json
import logging
from typing import Any, Optional

from pydantic import ValidationError

from ..db import Database, get_db
from ..schemas import (
    GenerationPresetPayload,
    GenerationPresetResponse,
    GenerationPresetUpdateRequest,
)

logger = logging.getLogger("solotensor.service.presets")

CORRUPT_WARNING = "Stored preset payload is invalid; re-save to repair."


class PresetError(Exception):
    """Raised for invalid preset input (maps to HTTP 400/422)."""


class PresetNotFoundError(Exception):
    """Raised when a preset is unknown or not owned by the caller (404)."""


class PresetConflictError(Exception):
    """Raised when the (user_id, name) pair already exists (409)."""


class PresetsService:
    def __init__(self, db: Optional[Database] = None) -> None:
        self._db = db

    @property
    def db(self) -> Database:
        return self._db if self._db is not None else get_db()

    # --- helpers -----------------------------------------------------------

    @staticmethod
    def _parse_payload(raw: Any) -> Optional[GenerationPresetPayload]:
        try:
            data = raw if isinstance(raw, (dict, list)) else json.loads(raw or "{}")
            return GenerationPresetPayload.model_validate(data)
        except (ValidationError, ValueError, TypeError):
            return None

    def _response(self, row: dict[str, Any]) -> GenerationPresetResponse:
        payload = self._parse_payload(row.get("payload_json"))
        return GenerationPresetResponse(
            id=str(row["id"]),
            name=str(row["name"]),
            payload=payload,
            warning=None if payload is not None else CORRUPT_WARNING,
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    def _require(self, user_id: str, preset_id: str) -> dict[str, Any]:
        row = self.db.get_preset(user_id, preset_id)
        if not row:
            raise PresetNotFoundError("Preset not found")
        return row

    @staticmethod
    def _dump(payload: GenerationPresetPayload) -> str:
        return json.dumps(payload.model_dump(exclude_none=True))

    # --- operations --------------------------------------------------------

    def list_presets(self, user_id: str) -> list[GenerationPresetResponse]:
        return [self._response(r) for r in self.db.list_presets(user_id)]

    def get_preset(self, user_id: str, preset_id: str) -> GenerationPresetResponse:
        return self._response(self._require(user_id, preset_id))

    def create_preset(
        self, user_id: str, name: str, payload: GenerationPresetPayload
    ) -> GenerationPresetResponse:
        row = self.db.create_preset(user_id, name, self._dump(payload))
        if not row:
            raise PresetConflictError("A preset with that name already exists")
        return self._response(row)

    def update_preset(
        self, user_id: str, preset_id: str, req: GenerationPresetUpdateRequest
    ) -> GenerationPresetResponse:
        provided = req.model_fields_set
        if not provided:
            raise PresetError("Provide a name or payload to update")
        if "name" in provided and req.name is None:
            raise PresetError("name must be a non-empty string, not null")
        if "payload" in provided and req.payload is None:
            raise PresetError("payload must be an object, not null")
        status, row = self.db.update_preset(
            user_id,
            preset_id,
            name=req.name if "name" in provided else Database._UNSET,
            payload_json=self._dump(req.payload) if "payload" in provided else Database._UNSET,
        )
        if status == "not_found":
            raise PresetNotFoundError("Preset not found")
        if status == "conflict" or not row:
            raise PresetConflictError("A preset with that name already exists")
        return self._response(row)

    def delete_preset(self, user_id: str, preset_id: str) -> bool:
        self._require(user_id, preset_id)
        return self.db.delete_preset(user_id, preset_id)


_service: Optional[PresetsService] = None


def get_presets_service() -> PresetsService:
    global _service
    if _service is None:
        _service = PresetsService()
    return _service
