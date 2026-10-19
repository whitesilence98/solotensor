"""SoloTensor Content Moderation and Governance API Routes.

Provides endpoints for community reporting (flagging), moderation queue inspection,
and report resolution with RBAC permission enforcement and audit trails.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db import Database, get_db
from ..dependencies.permissions import RequirePermission
from ..routers.auth import get_current_user
from ..schemas import (
    ContentFlagCreateRequest,
    ContentFlagResolveRequest,
    ContentFlagResponse,
    ModelPendingReviewItem,
    ModelPendingReviewQueueResponse,
    ModelReviewRequest,
    ModelReviewResponse,
    ModerationQueueResponse,
    UserResponse,
)
from ..services.models import (
    ModelConflict,
    ModelError,
    ModelNotFound,
    ModelService,
    get_model_service,
)
from ..services.rbac_service import RBACService, get_rbac_service

logger = logging.getLogger("solotensor.router.moderation")

router = APIRouter(tags=["moderation"])


@router.post(
    "/flag",
    response_model=ContentFlagResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a content safety or violation report",
)
async def submit_content_flag(
    req: ContentFlagCreateRequest,
    user: UserResponse = Depends(RequirePermission("moderation:flag_content")),
    db: Database = Depends(get_db),
    rbac: RBACService = Depends(get_rbac_service),
) -> ContentFlagResponse:
    """Submit a report against a model, generation, tool, or user."""
    flag_dict = db.create_content_flag(
        target_type=req.target_type,
        target_id=req.target_id,
        reason=req.reason,
        user_id=user.id,
    )

    await rbac.log_audit(
        actor_id=user.id,
        action="moderation:flag_created",
        resource_type=req.target_type,
        resource_id=req.target_id,
        details={"flag_id": flag_dict["id"], "reason": req.reason},
    )

    logger.info("User %s flagged %s (%s): %s", user.id, req.target_type, req.target_id, req.reason)
    return ContentFlagResponse(**flag_dict)


@router.get(
    "/queue",
    response_model=ModerationQueueResponse,
    summary="List pending or historical moderation reports",
)
async def get_moderation_queue(
    status_filter: Optional[str] = Query(None, alias="status"),
    target_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: UserResponse = Depends(RequirePermission("moderation:review_queue")),
    db: Database = Depends(get_db),
) -> ModerationQueueResponse:
    """Access the moderation review queue (restricted to moderators and system admins)."""
    items, total = db.get_content_flags(
        status=status_filter,
        target_type=target_type,
        page=page,
        limit=limit,
    )
    total_pages = (total + limit - 1) // limit if total > 0 else 0
    has_more = (page * limit) < total

    return ModerationQueueResponse(
        items=[ContentFlagResponse(**it) for it in items],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
        has_more=has_more,
    )


@router.post(
    "/resolve",
    response_model=ContentFlagResponse,
    summary="Resolve or dismiss a moderation flag",
)
@router.post(
    "/resolve/{flag_id}",
    response_model=ContentFlagResponse,
    summary="Resolve or dismiss a moderation flag by ID",
)
async def resolve_content_flag(
    req: ContentFlagResolveRequest,
    flag_id: Optional[str] = None,
    user: UserResponse = Depends(RequirePermission("moderation:review_queue")),
    db: Database = Depends(get_db),
    rbac: RBACService = Depends(get_rbac_service),
) -> ContentFlagResponse:
    """Resolve or dismiss a report with resolution notes and audit logging."""
    target_id = flag_id or req.flag_id
    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="flag_id must be provided in the path or request body",
        )

    resolved = db.resolve_content_flag(
        flag_id=target_id,
        status=req.status,
        resolved_by=user.id,
        resolution_notes=req.resolution_notes,
    )
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Content flag '{target_id}' not found",
        )

    await rbac.log_audit(
        actor_id=user.id,
        action=f"moderation:flag_{req.status}",
        resource_type="content_flag",
        resource_id=target_id,
        details={
            "status": req.status,
            "resolution_notes": req.resolution_notes,
            "target_type": resolved["target_type"],
            "target_id": resolved["target_id"],
        },
    )

    logger.info("User %s resolved flag %s as %s", user.id, target_id, req.status)
    return ContentFlagResponse(**resolved)


@router.get(
    "/models/pending",
    response_model=ModelPendingReviewQueueResponse,
    summary="List models pending moderation review",
)
async def get_pending_models(
    user: UserResponse = Depends(RequirePermission("moderation:review_queue")),
    model_storage: ModelService = Depends(get_model_service),
) -> ModelPendingReviewQueueResponse:
    """Access the model moderation review queue (restricted to moderators and admins)."""
    items = model_storage.list_pending_review()
    return ModelPendingReviewQueueResponse(
        items=items,
        total=len(items),
    )


@router.post(
    "/models/{model_id}/review",
    response_model=ModelReviewResponse,
    summary="Review a creator model",
)
async def review_model_endpoint(
    model_id: str,
    req: ModelReviewRequest,
    user: UserResponse = Depends(RequirePermission("moderation:review_queue")),
    rbac: RBACService = Depends(get_rbac_service),
    model_storage: ModelService = Depends(get_model_service),
) -> ModelReviewResponse:
    """Submit a moderation review decision for a model."""
    try:
        res = model_storage.review_model(
            model_id=model_id,
            action=req.action.value,
            notes=req.notes,
            install_to_comfy=req.install_to_comfy,
            version_id=req.version_id,
            file_id=req.file_id,
        )
    except ModelNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ModelConflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ModelError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    details = {
        "action": req.action.value,
        "notes": req.notes,
        "install_to_comfy": req.install_to_comfy,
        "version_id": req.version_id,
        "file_id": req.file_id,
    }
    if isinstance(res, dict):
        details["moderation_status"] = res.get("moderation_status")
        details["installed"] = res.get("installed", False)
        details["installed_file"] = res.get("installed_file")
    else:
        details["moderation_status"] = res.moderation_status
        details["installed"] = res.installed
        details["installed_file"] = res.installed_file

    await rbac.log_audit(
        actor_id=user.id,
        action=f"model:moderation_{req.action.value}",
        resource_type="model",
        resource_id=model_id,
        details=details,
    )

    if isinstance(res, ModelReviewResponse):
        return res
    return ModelReviewResponse(**res)

