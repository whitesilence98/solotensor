"""Owner-scoped generation preset routes.

Presets carry only the deep-link vocabulary; a stored payload that no longer
validates is returned with ``payload=null`` and an explicit warning so the UI
cannot silently apply an empty generation.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies.permissions import get_current_user
from ..schemas import (
    DeletePresetResponse,
    GenerationPresetCreateRequest,
    GenerationPresetListResponse,
    GenerationPresetResponse,
    GenerationPresetUpdateRequest,
    UserResponse,
)
from ..services.presets_service import (
    PresetConflictError,
    PresetError,
    PresetNotFoundError,
    PresetsService,
    get_presets_service,
)

logger = logging.getLogger("solotensor.router.presets")
router = APIRouter(tags=["presets"])

PresetsServiceDep = Depends(get_presets_service)
CurrentUserDep = Depends(get_current_user)


def _error(exc: Exception) -> HTTPException:
    if isinstance(exc, PresetNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail="Preset not found")
    if isinstance(exc, PresetConflictError):
        return HTTPException(status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=GenerationPresetListResponse)
async def list_presets(
    user: UserResponse = CurrentUserDep,
    service: PresetsService = PresetsServiceDep,
) -> GenerationPresetListResponse:
    return GenerationPresetListResponse(items=service.list_presets(user.id))


@router.post("", response_model=GenerationPresetResponse, status_code=status.HTTP_201_CREATED)
async def create_preset(
    req: GenerationPresetCreateRequest,
    user: UserResponse = CurrentUserDep,
    service: PresetsService = PresetsServiceDep,
) -> GenerationPresetResponse:
    try:
        return service.create_preset(user.id, req.name, req.payload)
    except (PresetError, PresetConflictError) as exc:
        raise _error(exc) from exc


@router.get("/{preset_id}", response_model=GenerationPresetResponse)
async def get_preset(
    preset_id: str,
    user: UserResponse = CurrentUserDep,
    service: PresetsService = PresetsServiceDep,
) -> GenerationPresetResponse:
    try:
        return service.get_preset(user.id, preset_id)
    except PresetNotFoundError as exc:
        raise _error(exc) from exc


@router.patch("/{preset_id}", response_model=GenerationPresetResponse)
async def update_preset(
    preset_id: str,
    req: GenerationPresetUpdateRequest,
    user: UserResponse = CurrentUserDep,
    service: PresetsService = PresetsServiceDep,
) -> GenerationPresetResponse:
    try:
        return service.update_preset(user.id, preset_id, req)
    except (PresetError, PresetConflictError, PresetNotFoundError) as exc:
        raise _error(exc) from exc


@router.delete("/{preset_id}", response_model=DeletePresetResponse)
async def delete_preset(
    preset_id: str,
    user: UserResponse = CurrentUserDep,
    service: PresetsService = PresetsServiceDep,
) -> DeletePresetResponse:
    try:
        service.delete_preset(user.id, preset_id)
    except PresetNotFoundError as exc:
        raise _error(exc) from exc
    return DeletePresetResponse(deleted=True, id=preset_id)
