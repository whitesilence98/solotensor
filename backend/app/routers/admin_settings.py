"""Admin-managed AI provider settings.

Lets an administrator set provider keys, models and the outbound proxy at runtime
instead of editing ``backend/.env`` and restarting the API. Every mutation is
audited by field name only — a key value is never written to the audit log, the
response, or a logger.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..dependencies.permissions import RequirePermission
from ..schemas import (
    AppSettingsSnapshot,
    AppSettingsTestRequest,
    AppSettingsTestResult,
    AppSettingsUpdate,
    DirectorMessage,
    DirectorRole,
    UserResponse,
)
from ..services.app_settings import get_app_settings_service
from ..services.director import DirectorError
from ..services.rbac_service import RBACService, get_rbac_service

logger = logging.getLogger("solotensor.router.admin_settings")

router = APIRouter(tags=["admin-settings"])


async def _reset_clients() -> None:
    """Drop cached SDK clients so a key/proxy change takes effect immediately."""
    from .. import main as main_module

    await main_module.code_assistant.reset_client()
    await main_module.director.reset_client()


@router.get(
    "",
    response_model=AppSettingsSnapshot,
    summary="Read the live provider settings (keys masked)",
)
async def read_app_settings(
    user: UserResponse = Depends(RequirePermission("admin:full_access")),
) -> AppSettingsSnapshot:
    return AppSettingsSnapshot(**get_app_settings_service().snapshot())


@router.patch(
    "",
    response_model=AppSettingsSnapshot,
    summary="Update provider settings; blank keys mean 'leave unchanged'",
)
async def update_app_settings(
    req: AppSettingsUpdate,
    user: UserResponse = Depends(RequirePermission("admin:full_access")),
    rbac: RBACService = Depends(get_rbac_service),
) -> AppSettingsSnapshot:
    patch = req.model_dump(exclude_none=True)
    # `clear_*` flags must survive even though their value is False by default.
    if req.clear_anthropic_api_key:
        patch["clear_anthropic_api_key"] = True
    if req.clear_local_llm_api_key:
        patch["clear_local_llm_api_key"] = True
    if req.proxy_bypass_local is not None:
        patch["proxy_bypass_local"] = req.proxy_bypass_local

    try:
        snapshot = get_app_settings_service().update(patch)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await _reset_clients()

    changed = sorted(
        field
        for field, value in patch.items()
        if field in AppSettingsUpdate.model_fields
        and not field.startswith("clear_")
        # A blank secret was ignored by the service, so it did not change.
        and not (field.endswith("_api_key") and not str(value or "").strip())
    )
    await rbac.log_audit(
        actor_id=user.id,
        action="settings:update",
        resource_type="app_settings",
        resource_id="app_settings",
        details={
            "fields": changed,
            "keys_cleared": [
                name
                for name, flag in (
                    ("anthropic_api_key", req.clear_anthropic_api_key),
                    ("local_llm_api_key", req.clear_local_llm_api_key),
                )
                if flag
            ],
        },
    )
    return AppSettingsSnapshot(**snapshot)


@router.delete(
    "/keys/{provider}",
    response_model=AppSettingsSnapshot,
    summary="Delete a stored provider API key",
)
async def clear_provider_key(
    provider: str,
    user: UserResponse = Depends(RequirePermission("admin:full_access")),
    rbac: RBACService = Depends(get_rbac_service),
) -> AppSettingsSnapshot:
    field = {"anthropic": "anthropic_api_key", "local": "local_llm_api_key"}.get(provider)
    if field is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown provider")

    snapshot = get_app_settings_service().update({field: None, f"clear_{field}": True})
    await _reset_clients()
    await rbac.log_audit(
        actor_id=user.id,
        action="settings:key_cleared",
        resource_type="app_settings",
        resource_id="app_settings",
        details={"fields": [field]},
    )
    return AppSettingsSnapshot(**snapshot)


@router.post(
    "/test",
    response_model=AppSettingsTestResult,
    summary="Probe a provider with a one-token prompt",
)
async def test_app_provider(
    req: AppSettingsTestRequest,
    user: UserResponse = Depends(RequirePermission("admin:full_access")),
) -> AppSettingsTestResult:
    from .. import main as main_module

    probe = [DirectorMessage(role=DirectorRole.USER, content="ping")]
    try:
        if req.provider == "anthropic":
            await main_module.director._reply_anthropic(probe)
        else:
            await main_module.director._reply_local(probe)
    except DirectorError as exc:
        return AppSettingsTestResult(provider=req.provider, ok=False, detail=str(exc))
    except Exception as exc:  # a failed probe is a result, never a 5xx
        logger.warning("Provider probe failed: %s", type(exc).__name__)
        return AppSettingsTestResult(
            provider=req.provider, ok=False, detail="The provider could not be reached."
        )
    return AppSettingsTestResult(provider=req.provider, ok=True, detail="Connection OK.")
