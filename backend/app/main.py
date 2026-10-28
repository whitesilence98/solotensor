"""Comfy Studio FastAPI application: generate, WS progress relay, gallery.

Generated images are stored on local disk under STORAGE_DIR and served
statically at /files/{key} — no object storage service needed.
"""

import base64
import binascii
import json
import logging
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import Database, get_db
from .dependencies.permissions import RequireOwnerOrPermission, RequirePermission
from .routers.auth import get_current_user, get_optional_user
from .routers.auth import router as auth_router
from .routers.moderation import router as moderation_router
from .routers.notifications import router as notifications_router
from .schemas import (
    is_architecture_compatible,
    ARCHITECTURE_FAMILIES,
    video_family,
    AssistantRequest,
    AssistantResponse,
    CreateToolRequest,
    DeleteAssetResponse,
    DeleteToolResponse,
    GalleryItem,
    GalleryResponse,
    GenerateRequest,
    GeneratedAsset,
    GenerationRecordResponse,
    GenerationResult,
    HealthResponse,
    InstalledGalleryModel,
    InstalledGalleryModelList,
    LocalModelImportRequest,
    LocalModelListResponse,
    ModelCreateRequest,
    ModelFilePatchRequest,
    ModelInstallResponse,
    ModelListResponse,
    ModelPendingReviewQueueResponse,
    ModelPrecision,
    ModelPublishRequest,
    ModelResponse,
    ModelReviewRequest,
    ModelReviewResponse,
    ModelSampleResponse,
    ModelSamplePatchRequest,
    ModelSampleReorderRequest,
    ModelUpdateRequest,
    ModelVersionCreateRequest,
    ModelVersionResponse,
    ModelVersionUpdateRequest,
    PaginatedGenerationsResponse,
    PaginatedSamplesResponse,
    PublicModelListResponse,
    ImageMetadataExtracted,
    TagInterrogateResponse,
    TagSummary,
    TagSummaryList,
    TagUpdateRequest,
    ToolAspectRatio,
    ToolCatalogResponse,
    ToolControl,
    ToolDetail,
    ToolExecuteRequest,
    ToolExecutionResult,
    ToolMode,
    ToolParseResponse,
    UploadedAsset,
    UserFollowResponse,
    UserPublicProfileResponse,
    UserResponse,
)
from .services.ai_tools import AIToolError, AIToolNotFound, get_ai_tool_service
from .services.code_assistant import (
    AssistantRateLimited,
    AssistantUnavailable,
    AssistantUpstreamError,
    get_code_assistant_service,
)
from .services.comfy_client import ComfyClientError, get_comfy_client
from .services.credit_service import get_credit_service
from .services.models import ModelConflict, ModelError, ModelNotFound, get_model_service
from .services.rbac_service import RBACService, get_rbac_service
from .services.redis_service import get_redis_service
from .services.storage import StorageError, get_storage
from .services.tagger import TaggerError, get_tagger_service
from .services.workflow_router import (
    patch_seedvr_upscaler_workflow,
    patch_detailer_workflow,
    patch_video_it2v_workflow,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("comfy_studio")

settings = get_settings()
storage = get_storage()
storage.ensure_root()
model_storage = get_model_service()
model_storage.ensure_root()
code_assistant = get_code_assistant_service(settings)
redis_service = get_redis_service(settings)

db = get_db()

app = FastAPI(title=settings.APP_NAME, version="1.1.0")


@app.on_event("startup")
async def _on_startup_bootstrap() -> None:
    import threading

    def _bg_bootstrap() -> None:
        try:
            db.init_db()
            db.sync_filesystem_to_db(
                models_dir=model_storage.definitions, storage_dir=storage.root
            )
        except Exception as exc:
            logger.warning("Could not sync filesystem to database: %s", exc)

    threading.Thread(target=_bg_bootstrap, daemon=True, name="bg-db-bootstrap").start()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_origin_regex=settings.origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(auth_router, prefix="/api/v1/auth")
app.include_router(moderation_router, prefix="/api/v1/moderation")
app.include_router(moderation_router, prefix="/api/moderation")
app.include_router(moderation_router, prefix="/api/admin/moderation")
app.include_router(notifications_router, prefix="/api/v1/notifications")
app.include_router(notifications_router, prefix="/api/notifications")


# --- Creator Profiles & Social Endpoints ------------------------------------


@app.get("/api/v1/users/{username_or_id}", response_model=UserPublicProfileResponse)
@app.get("/api/users/{username_or_id}", response_model=UserPublicProfileResponse)
async def get_user_public_profile(
    username_or_id: str,
    viewer: UserResponse | None = Depends(get_optional_user),
    db: Database = Depends(get_db),
) -> UserPublicProfileResponse:
    viewer_id = viewer.id if viewer else None
    profile = db.get_user_public_profile(username_or_id, viewer_id=viewer_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{username_or_id}' not found",
        )
    return UserPublicProfileResponse(**profile)


@app.post("/api/v1/users/{username_or_id}/follow", response_model=UserFollowResponse)
@app.post("/api/users/{username_or_id}/follow", response_model=UserFollowResponse)
async def follow_user(
    username_or_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> UserFollowResponse:
    target = db.get_user_by_id(username_or_id) or db.get_user_by_username(
        username_or_id
    )
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{username_or_id}' not found",
        )
    target_id = target["id"]
    if target_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot follow yourself",
        )
    is_following = db.toggle_follow_user(
        follower_id=current_user.id, following_id=target_id
    )
    followers_count = db.get_followers_count(target_id)
    return UserFollowResponse(
        following=is_following,
        is_following=is_following,
        followers_count=followers_count,
        target_user_id=target_id,
    )


@app.on_event("startup")
def startup_event() -> None:
    pass


@app.on_event("shutdown")
async def close_code_assistant() -> None:
    await code_assistant.close()


# Serve saved images: http://localhost:8000/files/<prompt_id>/<hash>.png
app.mount("/files", StaticFiles(directory=str(storage.root)), name="files")

ALLOWED_IMAGE_MIME = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def decode_reference_image(data_url: str, index: int) -> tuple[bytes, str]:
    """Decode a base64 (optionally data-URL prefixed) reference image -> (bytes, ext)."""
    payload = data_url.strip()
    ext = "png"
    if payload.startswith("data:"):
        try:
            header, payload = payload.split(",", 1)
        except ValueError:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Malformed data URL for reference {index}"
            )
        mime = header.removeprefix("data:").split(";", 1)[0].lower()
        ext = ALLOWED_IMAGE_MIME.get(mime)
        if ext is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported image type for reference {index}",
            )
    try:
        decoded = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Reference image {index} is not valid base64"
        )
    if not decoded:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Reference image {index} is empty"
        )
    if len(decoded) > settings.UPLOAD_MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Reference image {index} exceeds size limit",
        )
    return decoded, ext


# ---------------------------------------------------------------------- #
# Basic endpoints
# ---------------------------------------------------------------------- #


@app.get("/api/v1/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    comfy_ok = await get_comfy_client().ping()
    try:
        storage.ensure_root()
        storage_ok = True
    except StorageError:
        storage_ok = False

    db_driver = "postgresql" if db.is_postgres else "sqlite"
    redis_status = (
        "up"
        if redis_service.ping()
        else ("disabled" if not redis_service.is_enabled else "down")
    )
    s3_status = "enabled" if storage.is_s3_enabled else "disabled"

    return HealthResponse(
        status="ok" if (comfy_ok and storage_ok) else "degraded",
        comfy="up" if comfy_ok else "down",
        storage="up" if storage_ok else "down",
        database=db_driver,
        redis=redis_status,
        s3=s3_status,
    )


@app.post("/api/v1/assist", response_model=AssistantResponse)
async def assist(req: AssistantRequest) -> AssistantResponse:
    """Answer a single code-assistance question without tools or persistence."""
    if not settings.ASSISTANT_ENABLED:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Code Assist is disabled. Set ASSISTANT_ENABLED=true in the backend environment.",
        )
    try:
        answer = await code_assistant.answer(req.persona, req.message)
    except AssistantRateLimited as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except AssistantUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except AssistantUpstreamError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AssistantResponse(persona=req.persona, answer=answer)


MODEL_CATEGORIES = {
    "checkpoints",
    "diffusion_models",
    "loras",
    "vae",
    "text_encoders",
    "embeddings",
    "hypernetworks",
    "controlnet",
    "poses",
    "wildcards",
    "style_models",
}


def _model_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ModelNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, ModelConflict):
        return HTTPException(status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


_AUDIO_SUFFIXES = (".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac")

_VIDEO_CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}


def _video_content_type(filename: str) -> str:
    """Correct MIME type for a generated video; ``.mov`` is QuickTime, not WebM."""
    return _VIDEO_CONTENT_TYPES.get(
        ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else "",
        "video/mp4",
    )



def _audio_suffix(raw: str) -> str:
    """Best-effort extension for an uploaded reference audio blob."""
    if raw.startswith("data:"):
        header = raw[5:].split(",", 1)[0]
        if "ogg" in header:
            return ".ogg"
        if "wav" in header:
            return ".wav"
        if "mp4" in header or "m4a" in header:
            return ".m4a"
        if "flac" in header:
            return ".flac"
        return ".mp3"
    lowered = raw.split("?", 1)[0].lower()
    for suffix in _AUDIO_SUFFIXES:
        if lowered.endswith(suffix):
            return suffix
    return ".mp3"


async def _resolve_upload_bytes(storage_service: Any, raw: str, *, binary: bool = False) -> bytes:
    """Decode a data-URI, a stored ``/files/`` key, or bare base64 into bytes."""
    if raw.startswith("data:"):
        _, _, payload = raw.partition(",")
        try:
            return base64.b64decode(payload)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Malformed data URI payload") from exc
    if "/files/" in raw:
        return await storage_service.get_image_bytes(raw.split("/files/")[-1].split("?")[0])
    if raw.startswith("http://") or raw.startswith("https://"):
        return await storage_service.get_image_bytes(raw.split("/")[-1].split("?")[0])
    try:
        return base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        return await storage_service.get_image_bytes(raw)


def _ensure_video_capable(selected_model: dict, base_model: dict, is_lora: bool) -> None:
    """Reject video requests for models the bundled LTX-2.3 graph cannot honour.

    The graph hardcodes the LTX-2.3 22B transformer plus its LTX-2.3 VAE and text
    encoders, so the selected weights never reach the renderer. Requiring an LTX
    architecture keeps the picker honest instead of silently ignoring it.

    This is the hard LTX generation gate. `schemas.video_family` is the shared
    vocabulary for non-blocking, advisory checks (gallery labels, picker
    affordances); it must not replace this matcher, whose 409 boundary is fixed.
    """
    target = base_model if is_lora else selected_model
    architecture = str(target.get("base_model") or "").strip().lower()
    # An unrecorded architecture is treated as compatible, matching
    # is_architecture_compatible; only a known non-LTX family is rejected.
    if not architecture:
        return
    families = ARCHITECTURE_FAMILIES["ltx"]
    if architecture in families or any(member in architecture for member in families):
        return
    raise ModelConflict(
        "Video generation runs the bundled LTX-Video 2.3 pipeline; "
        f"'{target.get('title') or 'the selected model'}' is not an LTX model. "
        "Select an LTX-base model to generate video."
    )


@app.get("/api/v1/models/local", response_model=LocalModelListResponse)
async def list_local_models(
    q: str | None = None, category: str | None = None, limit: int = 50
) -> LocalModelListResponse:
    try:
        return LocalModelListResponse(
            items=model_storage.list_local_models(q, category, limit)
        )
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post(
    "/api/v1/models/id/{model_id}/versions/{version_id}/files/import-local",
    response_model=ModelResponse,
)
async def import_local_model_file(
    model_id: str,
    version_id: str,
    req: LocalModelImportRequest,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.import_local_file(
            model_id, version_id, req.category, req.filename, req.precision
        )
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/public", response_model=PublicModelListResponse)
async def list_public_models(
    q: str | None = None, user_id: str | None = None
) -> PublicModelListResponse:
    items = []
    for model in model_storage.public_list(query=q, user_id=user_id):
        public_files = sum(
            1 for version in model.versions for item in version.files if item.visible
        )
        public_samples = sum(len(version.samples) for version in model.versions)
        cover = next(
            (sample.url for version in model.versions for sample in version.samples),
            None,
        )
        items.append(
            {
                "model_id": model.model_id,
                "title": model.title,
                "category": model.category,
                "model_type": model.model_type,
                "description": getattr(model, "description", "") or "",
                "author_username": getattr(model, "author_username", None),
                "author_display_name": getattr(model, "author_display_name", None),
                "author_avatar_url": getattr(model, "author_avatar_url", None),
                "tags": model.tags,
                "base_model": model.compatibility.base_model,
                "published_at": model.published_at,
                "updated_at": model.updated_at,
                "cover_url": cover,
                "version_count": len(model.versions),
                "file_count": public_files,
                "sample_count": public_samples,
                "video_family": video_family(model.compatibility.base_model),
            }
        )
    return PublicModelListResponse(items=items)


@app.get("/api/v1/models/public/selectable", response_model=InstalledGalleryModelList)
async def list_selectable_public_models() -> InstalledGalleryModelList:
    try:
        return InstalledGalleryModelList(
            items=[
                InstalledGalleryModel(**item)
                for item in model_storage.selectable_gallery_files()
            ]
        )
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/public/{model_id}", response_model=ModelResponse)
async def get_public_model(model_id: str) -> ModelResponse:
    try:
        return model_storage.public_response(model_id)
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post(
    "/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/install",
    response_model=ModelInstallResponse,
)
async def install_public_model_file(
    model_id: str,
    version_id: str,
    file_id: str,
    current_user: UserResponse = Depends(RequirePermission("model:install_vault")),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelInstallResponse:
    try:
        result = model_storage.install_file(model_id, version_id, file_id)
        await rbac.log_audit(
            actor_id=current_user.id,
            action="model:install_vault",
            resource_type="model",
            resource_id=model_id,
            details={
                "version_id": version_id,
                "file_id": file_id,
                "filename": result.get("filename"),
                "destination": result.get("destination"),
                "installed": result.get("installed"),
            },
        )
        return ModelInstallResponse(**result)
    except ModelConflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ModelError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except ModelNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@app.get("/api/v1/models", response_model=ModelListResponse)
async def list_creator_models(
    visibility: str | None = None, q: str | None = None, user_id: str | None = None
) -> ModelListResponse:
    return ModelListResponse(
        items=model_storage.list(visibility=visibility, query=q, user_id=user_id)
    )


@app.post(
    "/api/v1/models", response_model=ModelResponse, status_code=status.HTTP_201_CREATED
)
async def create_creator_model(
    req: ModelCreateRequest,
    current_user: UserResponse = Depends(RequirePermission("model:publish")),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        user_id = current_user.id
        is_mod = (
            getattr(current_user, "role", None) in ("admin", "moderator")
            or any(r in ("admin", "moderator") for r in (getattr(current_user, "roles", []) or []))
        )
        return model_storage.create(req, user_id=user_id, is_moderator=is_mod)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/id/{model_id}", response_model=ModelResponse)
async def get_creator_model(model_id: str) -> ModelResponse:
    try:
        return model_storage.get(model_id)
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.patch("/api/v1/models/id/{model_id}", response_model=ModelResponse)
async def update_creator_model(
    model_id: str,
    req: ModelUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.update(model_id, req)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.delete("/api/v1/models/id/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_creator_model(
    model_id: str,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> None:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:delete_any").enforce(
            existing.user_id, current_user, rbac
        )
        model_storage.delete(model_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post(
    "/api/v1/models/id/{model_id}/versions",
    response_model=ModelVersionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_model_version(
    model_id: str,
    req: ModelVersionCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelVersionResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.create_version(model_id, req)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.delete(
    "/api/v1/models/id/{model_id}/versions/{version_id}",
    response_model=ModelResponse,
)
async def delete_model_version(
    model_id: str,
    version_id: str,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:delete_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.remove_version(model_id, version_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.patch(
    "/api/v1/models/id/{model_id}/versions/{version_id}",
    response_model=ModelResponse,
)
async def update_model_version(
    model_id: str,
    version_id: str,
    req: ModelVersionUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.update_version(model_id, version_id, req.name)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post(
    "/api/v1/models/id/{model_id}/versions/{version_id}/files",
    response_model=ModelResponse,
)
async def upload_model_file(
    model_id: str,
    version_id: str,
    file: UploadFile = File(...),
    precision: ModelPrecision = Form(ModelPrecision.FP16),
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        data = await file.read(settings.MODEL_MAX_BYTES + 1)
        return model_storage.add_file(
            model_id, version_id, file.filename or "model.bin", data, precision
        )
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.patch(
    "/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}",
    response_model=ModelResponse,
)
async def patch_model_file(
    model_id: str,
    version_id: str,
    file_id: str,
    req: ModelFilePatchRequest,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.patch_file(model_id, version_id, file_id, req)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.delete(
    "/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_model_file(
    model_id: str,
    version_id: str,
    file_id: str,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> None:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:delete_any").enforce(
            existing.user_id, current_user, rbac
        )
        model_storage.remove_file(model_id, version_id, file_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post(
    "/api/v1/models/id/{model_id}/versions/{version_id}/samples",
    response_model=ModelResponse,
)
async def upload_model_sample(
    model_id: str,
    version_id: str,
    file: UploadFile = File(...),
    metadata: str = Form("{}"),
    is_cover: bool = Form(False),
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        parsed = json.loads(metadata)
        if not isinstance(parsed, dict):
            raise ValueError("Sample metadata must be an object")
        data = await file.read(settings.MODEL_SAMPLE_MAX_BYTES + 1)
        return model_storage.add_sample(
            model_id, version_id, file.filename or "sample.png", data, parsed, is_cover=is_cover
        )
    except (
        json.JSONDecodeError,
        ValueError,
        ModelError,
        ModelConflict,
        ModelNotFound,
    ) as exc:
        raise _model_http_error(exc) from exc


@app.delete(
    "/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_model_sample(
    model_id: str,
    version_id: str,
    sample_id: str,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> None:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:delete_any").enforce(
            existing.user_id, current_user, rbac
        )
        model_storage.remove_sample(model_id, version_id, sample_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post(
    "/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}/set-cover",
    response_model=ModelResponse,
)
async def set_model_sample_cover(
    model_id: str,
    version_id: str,
    sample_id: str,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.set_cover_sample(model_id, version_id, sample_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.patch(
    "/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}",
    response_model=ModelResponse,
)
async def patch_model_sample(
    model_id: str,
    version_id: str,
    sample_id: str,
    req: ModelSamplePatchRequest,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.patch_sample(model_id, version_id, sample_id, req.metadata)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.put(
    "/api/v1/models/id/{model_id}/versions/{version_id}/samples/order",
    response_model=ModelResponse,
)
async def reorder_model_samples(
    model_id: str,
    version_id: str,
    req: ModelSampleReorderRequest,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:edit_any").enforce(
            existing.user_id, current_user, rbac
        )
        return model_storage.reorder_samples(model_id, version_id, req.sample_ids)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post("/api/v1/models/id/{model_id}/publish", response_model=ModelResponse)
async def publish_creator_model(
    model_id: str,
    req: ModelPublishRequest,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
    db: Database = Depends(get_db),
) -> ModelResponse:
    try:
        existing = model_storage.get(model_id)
        await RequireOwnerOrPermission("model:publish").enforce(
            existing.user_id, current_user, rbac
        )
        is_mod = (
            getattr(current_user, "role", None) in ("admin", "moderator")
            or any(r in ("admin", "moderator") for r in (getattr(current_user, "roles", []) or []))
        )
        published = model_storage.publish(model_id, req, is_moderator=is_mod)
        if published.moderation_status == "pending_review":
            try:
                from .services.notification_service import NotificationService

                notif_svc = NotificationService(db=db)
                creator_name = getattr(current_user, "username", "Creator")
                m_title = published.title or "New Model"
                for target_role in ("moderator", "admin"):
                    notif_svc.notify_role(
                        role=target_role,
                        title="New Model Pending Review",
                        message=f"@{creator_name} submitted '{m_title}' for moderation review.",
                        category="moderation",
                        type="model_submitted",
                        actor_id=current_user.id,
                        link="/admin/moderation",
                        metadata={"model_id": model_id, "creator_id": current_user.id},
                    )
            except Exception as n_exc:
                logger.warning("Could not dispatch mod notification on model submit: %s", n_exc)
        return published
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get(
    "/api/v1/models/moderation/pending",
    response_model=ModelPendingReviewQueueResponse,
)
async def list_pending_review_models(
    current_user: UserResponse = Depends(RequirePermission("moderation:review_queue")),
) -> ModelPendingReviewQueueResponse:
    items = model_storage.list_pending_review()
    return ModelPendingReviewQueueResponse(items=items, total=len(items))


@app.post(
    "/api/v1/models/id/{model_id}/review",
    response_model=ModelReviewResponse,
)
async def review_creator_model(
    model_id: str,
    req: ModelReviewRequest,
    current_user: UserResponse = Depends(RequirePermission("moderation:review_queue")),
    rbac: RBACService = Depends(get_rbac_service),
) -> ModelReviewResponse:
    try:
        result = model_storage.review_model(
            model_id=model_id,
            action=req.action.value if hasattr(req.action, "value") else str(req.action),
            notes=req.notes,
            install_to_comfy=req.install_to_comfy,
            version_id=req.version_id,
            file_id=req.file_id,
        )
        await rbac.log_audit(
            actor_id=current_user.id,
            action=f"model:review_{req.action.value if hasattr(req.action, 'value') else str(req.action)}",
            resource_type="model",
            resource_id=model_id,
            details={
                "action": req.action.value if hasattr(req.action, "value") else str(req.action),
                "notes": req.notes,
                "moderation_status": result["moderation_status"],
            },
        )
        return ModelReviewResponse(**result)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}/download")
@app.head("/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}/download")
@app.get(
    "/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/download"
)
@app.head(
    "/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/download"
)
async def download_model_file(
    model_id: str,
    version_id: str,
    file_id: str,
    current_user: UserResponse = Depends(RequirePermission("model:download_weights")),
) -> FileResponse:
    try:
        record = model_storage._read(model_id)
        perms = record.get("permissions", {})
        if not perms.get("allow_download", True):
            user_roles = getattr(current_user, "roles", []) or []
            is_admin_or_mod = any(r in ("admin", "moderator") for r in user_roles)
            if current_user.id != record.get("user_id") and not is_admin_or_mod:
                raise HTTPException(
                    status_code=403,
                    detail="Direct weight download is disabled by the model creator",
                )
        return FileResponse(
            model_storage.public_file_path(model_id, version_id, file_id)
        )
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get(
    "/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}/download"
)
@app.head(
    "/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}/download"
)
@app.get(
    "/api/v1/models/public/{model_id}/versions/{version_id}/samples/{sample_id}/download"
)
@app.head(
    "/api/v1/models/public/{model_id}/versions/{version_id}/samples/{sample_id}/download"
)
async def download_model_sample(
    model_id: str, version_id: str, sample_id: str
) -> FileResponse:
    try:
        return FileResponse(
            model_storage.public_sample_path(model_id, version_id, sample_id)
        )
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get(
    "/api/v1/models/id/{model_id}/images", response_model=PaginatedGenerationsResponse
)
@app.get(
    "/api/v1/models/public/{model_id}/images",
    response_model=PaginatedGenerationsResponse,
)
async def list_model_generations(
    model_id: str,
    page: int = 1,
    limit: int = 20,
    version_id: str | None = None,
) -> PaginatedGenerationsResponse:
    """Return paginated list of all images created with this model (as base model or LoRA adapter)."""
    try:
        model_storage.get(model_id)
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc

    items, total = get_db().get_model_generations(
        model_id, version_id=version_id, page=page, limit=limit
    )
    return PaginatedGenerationsResponse.create(
        items=[GenerationRecordResponse(**item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


@app.get(
    "/api/v1/models/id/{model_id}/samples-paginated",
    response_model=PaginatedSamplesResponse,
)
@app.get(
    "/api/v1/models/public/{model_id}/samples-paginated",
    response_model=PaginatedSamplesResponse,
)
async def list_model_samples_paginated(
    model_id: str,
    page: int = 1,
    limit: int = 20,
    version_id: str | None = None,
) -> PaginatedSamplesResponse:
    """Return paginated list of showcase samples associated with this model."""
    try:
        model_storage.get(model_id)
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc

    items, total = get_db().get_model_samples(
        model_id, version_id=version_id, page=page, limit=limit
    )
    return PaginatedSamplesResponse.create(
        items=[ModelSampleResponse(**item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


@app.get("/api/v1/models/{category}", response_model=list[str])
async def models(category: str) -> list[str]:
    if category not in MODEL_CATEGORIES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown model category")
    try:
        return await get_comfy_client().list_models(category)
    except ComfyClientError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@app.get("/api/v1/clip-options")
async def clip_options() -> dict[str, list[str]]:
    try:
        comfy = get_comfy_client()
        return {
            "encoders": await comfy.list_models("text_encoders"),
            "types": await comfy.clip_types(),
        }
    except ComfyClientError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@app.get("/api/v1/workflow/template-info")
async def workflow_template_info(mode: str = "text-to-image") -> dict[str, Any]:
    try:
        comfy = get_comfy_client()
        # The scan below keys off node class, not graph shape, because the two
        # templates differ: image graphs use CLIPLoader + a single VAELoader,
        # while video graphs use DualCLIPLoader (two encoders, the second fed to
        # the text projection) and VAELoaderKJ. Video also loads preview and
        # audio VAEs alongside the decode VAE, so the VAE branch skips nodes by
        # title rather than taking the first loader it sees.
        if mode == "video":
            template = comfy.load_video_it2v_template()
        else:
            template = comfy.load_workflow_template()
        if not template or not isinstance(template, dict):
            return {"has_template": False}

        vae_name = None
        clip_name = None
        clip_name2 = None
        clip_type = None
        unet_name = None
        sampler_name = None
        scheduler = None
        steps = None
        cfg = None
        base_architecture = None
        prompt = None
        negative_prompt = None

        def resolve_text(val: Any, depth: int = 0) -> str | None:
            if depth > 6:
                return None
            if isinstance(val, str) and val.strip():
                return val.strip()
            if isinstance(val, list) and len(val) >= 1:
                ref_id = str(val[0])
                ref_node = template.get(ref_id)
                if isinstance(ref_node, dict):
                    ref_inputs = ref_node.get("inputs", {})
                    if isinstance(ref_inputs, dict):
                        return (
                            resolve_text(ref_inputs.get("prompt"), depth + 1)
                            or resolve_text(ref_inputs.get("text"), depth + 1)
                            or resolve_text(ref_inputs.get("string"), depth + 1)
                        )
            return None

        for _, node in template.items():
            if not isinstance(node, dict):
                continue
            c_type = node.get("class_type", "")
            inputs = node.get("inputs", {})
            if not isinstance(inputs, dict):
                continue

            if c_type in ("VAELoader", "VAELoaderKJ") and not vae_name:
                title = str(node.get("_meta", {}).get("title", "")).lower()
                if "preview" not in title and "audio" not in title:
                    vae_name = inputs.get("vae_name")
            elif c_type == "DualCLIPLoader":
                # Independent of the primary guard so a graph mixing both loader
                # classes still reports its second encoder.
                clip_name2 = inputs.get("clip_name2") or clip_name2
                if not clip_name:
                    clip_name = inputs.get("clip_name1") or inputs.get("clip_name2")
                    clip_type = inputs.get("type")
            elif c_type == "CLIPLoader" and not clip_name:
                clip_name = inputs.get("clip_name")
                clip_type = inputs.get("type")
            elif c_type in ("UNETLoader", "CheckpointLoaderSimple") and not unet_name:
                unet_name = inputs.get("unet_name") or inputs.get("ckpt_name")
            elif "sampler" in c_type.lower() or c_type in (
                "KSampler",
                "KSamplerAdvanced",
            ):
                if "sampler_name" in inputs and not sampler_name:
                    sampler_name = inputs.get("sampler_name")
                if "scheduler" in inputs and not scheduler:
                    scheduler = inputs.get("scheduler")
                if (
                    "steps" in inputs
                    and steps is None
                    and isinstance(inputs.get("steps"), (int, float))
                ):
                    steps = int(inputs.get("steps"))
                if (
                    "cfg" in inputs
                    and cfg is None
                    and isinstance(inputs.get("cfg"), (int, float))
                ):
                    cfg = float(inputs.get("cfg"))
                if not prompt and "positive" in inputs:
                    prompt = resolve_text(inputs.get("positive"))
                if not negative_prompt and "negative" in inputs:
                    negative_prompt = resolve_text(inputs.get("negative"))

        if not prompt:
            for _, node in template.items():
                if not isinstance(node, dict):
                    continue
                c_type = node.get("class_type", "")
                inputs = node.get("inputs", {})
                if not isinstance(inputs, dict):
                    continue
                if (
                    c_type in ("CR Prompt Text", "CLIPTextEncode")
                    or "prompt" in c_type.lower()
                ):
                    meta_title = str(node.get("_meta", {}).get("title", "")).lower()
                    if "neg" in meta_title:
                        if not negative_prompt:
                            negative_prompt = resolve_text(
                                inputs.get("text") or inputs.get("prompt")
                            )
                    else:
                        if not prompt:
                            prompt = resolve_text(
                                inputs.get("prompt") or inputs.get("text")
                            )

        lower_ref = f"{unet_name or ''} {clip_name or ''} {vae_name or ''}".lower()
        if "flux" in lower_ref:
            base_architecture = "FLUX.1"
        elif "wan" in lower_ref:
            base_architecture = "Wan 2.1 / Wan 2.8"
        elif "z-image" in lower_ref or "z_image" in lower_ref:
            base_architecture = "Z-Image / Z-Image-Turbo"
        elif "sdxl" in lower_ref or "pony" in lower_ref:
            base_architecture = "Stable Diffusion XL (SDXL)"
        elif "sd3" in lower_ref:
            base_architecture = "Stable Diffusion 3.5"

        return {
            "has_template": True,
            "vae_name": vae_name,
            "clip_name": clip_name,
            "clip_name2": clip_name2,
            "clip_type": clip_type,
            "unet_name": unet_name,
            "sampler_name": sampler_name,
            "scheduler": scheduler,
            "steps": steps,
            "cfg": cfg,
            "base_architecture": base_architecture,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
        }
    except Exception as exc:
        return {"has_template": False, "error": str(exc)}


async def _bg_auto_tag_asset(key: str) -> None:
    """Non-blocking background auto-tagger running WD14 interrogation for public assets."""
    try:
        tagger = get_tagger_service()
        tags = await tagger.auto_tag_asset(key)
        logger.info("Background auto-tag completed for %s (%d tags detected)", key, len(tags))
    except Exception as exc:
        logger.warning("Background auto-tag skipped/failed for %s: %s", key, exc)


# ---------------------------------------------------------------------- #
# Generation
# ---------------------------------------------------------------------- #


@app.post("/api/v1/generate", response_model=GenerationResult)
@app.post("/api/generate", response_model=GenerationResult)
async def generate(
    req: GenerateRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user),
) -> GenerationResult:
    """Queue a workflow on ComfyUI, wait for completion, save images to disk."""
    if req.mode not in ("text-to-image", "image-to-image", "detailer", "upscale", "video"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported generation mode: {req.mode}",
        )

    if req.mode in ("image-to-image", "detailer", "upscale") and not req.reference_images:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"{req.mode} mode requires at least one reference image",
        )

    # Deduction for authenticated creators (TensorArt quota model)
    credit_service = get_credit_service()
    cost = (
        settings.DEFAULT_STANDALONE_FEATURE_COST
        if req.mode in ("detailer", "upscale")
        else settings.DEFAULT_GENERATION_COST
    )
    credits_deducted = False
    if not credit_service.deduct_credits(user.id, amount=cost):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            detail="INSUFFICIENT_CREDITS",
        )
    credits_deducted = True

    try:
        selected_model = model_storage.resolve_installed_gallery_file(
            req.model_id, req.version_id, req.file_id
        )
        is_lora = selected_model["model_type"] in {"LoRA", "LyCORIS"}
        if is_lora:
            base_ids = (req.base_model_id, req.base_version_id, req.base_file_id)
            if any(b is None for b in base_ids):
                raise ModelConflict(
                    "A base checkpoint must be specified when generating with a primary LoRA"
                )
            base_model = model_storage.resolve_installed_gallery_file(*base_ids)  # type: ignore[arg-type]
            if base_model["model_type"] not in {"Checkpoint", "Diffusion Model"}:
                raise ModelConflict("LoRA base must be a Checkpoint or Diffusion Model")

            lora_arch = selected_model.get("base_model")
            base_arch = base_model.get("base_model")
            if not is_architecture_compatible(base_arch, lora_arch):
                raise ModelConflict(
                    f"Architecture mismatch: LoRA '{selected_model.get('title')}' ({lora_arch}) is incompatible with Checkpoint '{base_model.get('title')}' ({base_arch})"
                )
        else:
            if any(
                value is not None
                for value in (req.base_model_id, req.base_version_id, req.base_file_id)
            ):
                raise ModelConflict(
                    "Base model identity is only valid for LoRA generation"
                )
            base_model = selected_model
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc

    clip_name = base_model.get("text_encoder")
    clip_type = base_model.get("clip_type")
    vae_name = base_model.get("vae")
    base_category = base_model.get("category")
    is_modular = (
        base_category == "diffusion_models"
        or base_model.get("model_type") == "Diffusion Model"
    )

    if is_modular and (not clip_name or not vae_name):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Modular UNET/DiT checkpoints require external VAE and text encoder",
        )

    comfy = get_comfy_client()
    client_id = req.client_id or str(uuid.uuid4())
    resolved_seed = req.seed if req.seed is not None else random.randint(0, 2**32 - 1)
    started = time.monotonic()

    try:
        active_loras: list[dict[str, Any]] = []
        if is_lora:
            resolved_primary_lora = await comfy.resolve_model_name(
                "loras", selected_model["filename"]
            )
            active_loras.append(
                {
                    "lora": resolved_primary_lora,
                    "title": selected_model.get("title", ""),
                    "strength": 1.0,
                    "on": True,
                    "model_id": selected_model.get("model_id"),
                    "version_id": selected_model.get("version_id"),
                    "file_id": selected_model.get("file_id"),
                }
            )

        for adapter in req.lora_adapters:
            if not adapter.on:
                continue
            adapter_model_id = adapter.model_id
            adapter_version_id = adapter.version_id
            adapter_file_id = adapter.file_id
            adapter_title = ""
            if adapter.model_id and adapter.version_id and adapter.file_id:
                adapter_model = model_storage.resolve_installed_gallery_file(
                    adapter.model_id, adapter.version_id, adapter.file_id
                )
                if adapter_model["model_type"] not in {"LoRA", "LyCORIS"}:
                    raise ModelConflict("Adapter model must be a LoRA or LyCORIS")
                adapter_arch = adapter_model.get("base_model")
                base_arch = base_model.get("base_model")
                if not is_architecture_compatible(base_arch, adapter_arch):
                    raise ModelConflict(
                        f"Architecture mismatch: Secondary LoRA '{adapter_title or adapter_model.get('title')}' ({adapter_arch}) is incompatible with Checkpoint '{base_model.get('title')}' ({base_arch})"
                    )
                raw_filename = adapter_model["filename"]
                adapter_title = adapter_model.get("title", "")
            elif adapter.lora:
                raw_filename = adapter.lora
            else:
                continue

            if not adapter_title and raw_filename:
                norm_raw = raw_filename.replace("\\", "/").lower()
                for gal_model in model_storage.selectable_gallery_files():
                    if gal_model.get("filename", "").replace("\\", "/").lower() == norm_raw:
                        adapter_title = gal_model.get("title", "")
                        if not adapter_model_id:
                            adapter_model_id = gal_model.get("model_id")
                            adapter_version_id = gal_model.get("version_id")
                            adapter_file_id = gal_model.get("file_id")
                        break

            resolved_adapter_lora = await comfy.resolve_model_name(
                "loras", raw_filename
            )
            existing = next(
                (
                    item
                    for item in active_loras
                    if item["lora"] == resolved_adapter_lora
                ),
                None,
            )
            if existing is not None:
                existing["strength"] = adapter.strength
                existing["on"] = adapter.on
                if adapter_title:
                    existing["title"] = adapter_title
                if adapter_model_id:
                    existing["model_id"] = adapter_model_id
                    existing["version_id"] = adapter_version_id
                    existing["file_id"] = adapter_file_id
            else:
                active_loras.append(
                    {
                        "lora": resolved_adapter_lora,
                        "title": adapter_title,
                        "strength": adapter.strength,
                        "on": adapter.on,
                        "model_id": adapter_model_id,
                        "version_id": adapter_version_id,
                        "file_id": adapter_file_id,
                    }
                )

        resolved_clip = ""
        resolved_clip_type = ""
        resolved_vae = ""
        if is_modular:
            resolved_base = await comfy.resolve_model_name(
                "diffusion_models", base_model["filename"]
            )
            resolved_clip = (
                await comfy.resolve_model_name("text_encoders", clip_name)
                if clip_name
                else ""
            )
            resolved_clip_type = (
                await comfy.resolve_clip_type(clip_type) if clip_type else ""
            )
            resolved_vae = (
                await comfy.resolve_model_name("vae", vae_name) if vae_name else ""
            )
        else:
            resolved_base = await comfy.resolve_model_name(
                "checkpoints", base_model["filename"]
            )
            resolved_clip = (
                await comfy.resolve_model_name("text_encoders", clip_name)
                if clip_name
                else ""
            )
            resolved_clip_type = (
                await comfy.resolve_clip_type(clip_type) if clip_type else ""
            )
            resolved_vae = (
                await comfy.resolve_model_name("vae", vae_name) if vae_name else ""
            )

        source_image_filename = None
        if req.mode in ("image-to-image", "detailer", "upscale") or (req.mode == "video" and req.reference_images):
            if req.mode in ("image-to-image", "detailer", "upscale") and not req.reference_images:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"{req.mode} mode requires at least one reference image",
                )
            raw_ref = req.reference_images[0]
            try:
                if raw_ref.startswith("data:image/"):
                    _, b64_data = raw_ref.split(",", 1)
                    source_bytes = base64.b64decode(b64_data)
                elif "/files/" in raw_ref:
                    rel_key = raw_ref.split("/files/")[-1].split("?")[0]
                    source_bytes = await storage.get_image_bytes(rel_key)
                elif raw_ref.startswith("http://") or raw_ref.startswith("https://"):
                    rel_key = raw_ref.split("/")[-1].split("?")[0]
                    source_bytes = await storage.get_image_bytes(rel_key)
                else:
                    try:
                        source_bytes = base64.b64decode(raw_ref)
                    except Exception:
                        source_bytes = await storage.get_image_bytes(raw_ref)

                source_image_filename = await comfy.upload_image(
                    source_bytes, f"input_{req.mode}_{client_id or uuid.uuid4().hex[:8]}.png"
                )
            except HTTPException:
                raise
            except Exception as exc:
                logger.error("Failed to process reference image for %s: %s", req.mode, exc)
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to process reference image: {exc}",
                ) from exc

        # Video-only inputs: a closing frame and (optionally) a reference voice.
        last_frame_filename = None
        reference_audio_filename = None
        if req.mode == "video":
            if req.last_frame_image:
                try:
                    last_frame_filename = await comfy.upload_image(
                        await _resolve_upload_bytes(storage, req.last_frame_image, binary=True),
                        f"input_video_last_{client_id or uuid.uuid4().hex[:8]}.png",
                    )
                except HTTPException:
                    raise
                except Exception as exc:
                    logger.error("Failed to process last frame: %s", exc)
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        detail=f"Failed to process last frame image: {exc}",
                    ) from exc
            if req.audio_mode == "voice_clone" and req.reference_audio:
                try:
                    audio_bytes = await _resolve_upload_bytes(
                        storage, req.reference_audio, binary=True
                    )
                    reference_audio_filename = await comfy.upload_audio(
                        audio_bytes,
                        f"input_video_voice_{client_id or uuid.uuid4().hex[:8]}{_audio_suffix(req.reference_audio)}",
                    )
                except HTTPException:
                    raise
                except Exception as exc:
                    logger.error("Failed to process reference audio: %s", exc)
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        detail=f"Failed to process reference audio: {exc}",
                    ) from exc

        if req.mode == "detailer":
            detailer_template = (
                comfy.load_modular_detailer_template()
                or comfy.load_detailer_template()
            )
            if not detailer_template:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Detailer workflow template not found",
                )
            graph = patch_detailer_workflow(
                detailer_template,
                image_filename=source_image_filename,
                detailer_cfg=req.detailer,
                prompt=req.prompt,
                negative_prompt=req.negative_prompt,
                unet_name=resolved_base,
                clip_name=resolved_clip,
                clip_type=resolved_clip_type,
                vae_name=resolved_vae,
                loras=active_loras,
            )
        elif req.mode == "upscale":
            upscale_template = comfy.load_seedvr_upscaler_template()
            if not upscale_template:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="SeedVR2 upscaler workflow template not found",
                )
            graph = patch_seedvr_upscaler_workflow(
                upscale_template,
                image_filename=source_image_filename,
                upscale_cfg=req.upscale,
                base_width=req.width,
                base_height=req.height,
            )
        elif req.mode == "video":
            _ensure_video_capable(selected_model, base_model, is_lora)
            video_template = comfy.load_video_it2v_template()
            if not video_template:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Video IT2V workflow template not found",
                )
            graph = patch_video_it2v_workflow(
                video_template,
                prompt=req.prompt,
                negative_prompt=req.negative_prompt,
                seed=resolved_seed,
                duration_seconds=req.video_duration_seconds or 3,
                video_fps=req.video_fps or 25,
                width=req.width,
                height=req.height,
                steps=req.steps,
                cfg=req.cfg,
                sampler_name=req.sampler_name,
                scheduler=req.scheduler,
                loras=active_loras,
                source_image_filename=source_image_filename,
                last_frame_filename=last_frame_filename,
                video_mode=req.video_mode,
                stage2_upscale=req.stage2_upscale,
                audio_mode=req.audio_mode,
                reference_audio_filename=reference_audio_filename,
                extract_voice=req.extract_voice,
                resize_mode=req.resize_mode,
                video_megapixels=req.video_megapixels,
                first_frame_strength=req.first_frame_strength,
                last_frame_strength=req.last_frame_strength,
                rife_multiplier=req.rife_multiplier,
                high_fps=req.high_fps,
                film_grain=req.film_grain,
                match_color=req.match_color,
                tiled_vae_decode=req.tiled_vae_decode,
            )
        elif is_lora:
            graph = comfy.build_lora_workflow(
                base_model_type=base_model["model_type"],
                base_filename=resolved_base,
                lora_filename=active_loras[0]["lora"] if active_loras else "",
                clip_name=resolved_clip,
                clip_type=resolved_clip_type,
                vae_name=resolved_vae,
                prompt=req.prompt,
                negative_prompt=req.negative_prompt,
                seed=resolved_seed,
                steps=req.steps,
                image_count=req.image_count,
                cfg=req.cfg,
                denoise=req.denoise,
                sampler_name=req.sampler_name,
                scheduler=req.scheduler,
                width=req.width,
                height=req.height,
                loras=active_loras,
                category=base_category
                or ("diffusion_models" if is_modular else "checkpoints"),
                is_modular=is_modular,
                enable_detailer=req.enable_detailer,
                upscale=req.upscale,
                detailer=req.detailer,
                source_image_filename=source_image_filename,
            )
        else:
            graph = comfy.build_gallery_workflow(
                model_type=selected_model["model_type"],
                filename=resolved_base,
                clip_name=resolved_clip,
                clip_type=resolved_clip_type,
                vae_name=resolved_vae,
                prompt=req.prompt,
                negative_prompt=req.negative_prompt,
                seed=resolved_seed,
                steps=req.steps,
                image_count=req.image_count,
                cfg=req.cfg,
                denoise=req.denoise,
                sampler_name=req.sampler_name,
                scheduler=req.scheduler,
                width=req.width,
                height=req.height,
                loras=active_loras,
                category=selected_model.get("category")
                or ("diffusion_models" if is_modular else "checkpoints"),
                is_modular=is_modular,
                enable_detailer=req.enable_detailer,
                upscale=req.upscale,
                detailer=req.detailer,
                source_image_filename=source_image_filename,
            )
        prompt_id = await comfy.queue_prompt(graph, client_id)
        final_status = await comfy.wait_until_done(prompt_id, client_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        if credits_deducted:
            credit_service.db.update_credits(
                user.id,
                balance=credit_service.get_user_credits(
                    user.id, auto_replenish=False
                ).balance
                + cost,
            )
        raise _model_http_error(exc) from exc
    except ComfyClientError as exc:
        if credits_deducted:
            credit_service.db.update_credits(
                user.id,
                balance=credit_service.get_user_credits(
                    user.id, auto_replenish=False
                ).balance
                + cost,
            )
        logger.error("ComfyUI error: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    elapsed_ms = int((time.monotonic() - started) * 1000)
    if final_status != "completed":
        if credits_deducted:
            credit_service.db.update_credits(
                user.id,
                balance=credit_service.get_user_credits(
                    user.id, auto_replenish=False
                ).balance
                + cost,
            )
        return GenerationResult(
            prompt_id=prompt_id,
            status=final_status,
            images=[],
            error=final_status,
            elapsed_ms=elapsed_ms,
        )

    user_id = user.id
    is_public = not req.is_private
    assets: list[UploadedAsset] = []
    metadata = {
        "prompt_id": prompt_id,
        "prompt": req.prompt,
        "negative_prompt": req.negative_prompt,
        "seed": resolved_seed,
        "steps": req.steps,
        "image_count": req.image_count,
        "cfg": req.cfg,
        "denoise": req.denoise,
        "sampler_name": req.sampler_name or "euler",
        "scheduler": req.scheduler or "normal",
        "width": req.width,
        "height": req.height,
        "format_name": req.format_name,
        "enable_detailer": bool(req.enable_detailer),
        "model_id": selected_model["model_id"],
        "version_id": selected_model["version_id"],
        "file_id": selected_model["file_id"],
        "model_title": selected_model["title"],
        "model_type": selected_model["model_type"],
        "model_version": selected_model["version_name"],
        "model_category": selected_model["category"],
        "model_filename": selected_model["filename"],
        "clip_name": clip_name or "",
        "clip_type": clip_type or "",
        "base_model_id": base_model["model_id"] if is_lora else "",
        "base_version_id": base_model["version_id"] if is_lora else "",
        "base_file_id": base_model["file_id"] if is_lora else "",
        "base_model_filename": base_model["filename"] if is_lora else "",
        "lora_filename": selected_model["filename"]
        if is_lora
        else (active_loras[0]["lora"] if active_loras else ""),
        "loras": active_loras,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_ms": elapsed_ms,
        "user_id": user_id,
    }
    try:
        if req.mode == "video":
            raw_videos = await comfy.list_output_files(prompt_id, expected_kind="video")
            if not raw_videos:
                raw_videos = await comfy.list_images(prompt_id)
            if not raw_videos:
                return GenerationResult(
                    prompt_id=prompt_id,
                    status="completed",
                    images=[],
                    elapsed_ms=elapsed_ms,
                )
            video_item = raw_videos[-1]
            video_blob = await comfy.fetch_image_bytes(video_item)
            content_type = _video_content_type(video_item["filename"])
            video_url = await storage.upload_asset(
                video_blob,
                prompt_id,
                video_item["filename"],
                content_type=content_type,
                metadata={
                    **metadata,
                    "kind": "video",
                    "source_filename": video_item["filename"],
                    "user_id": user_id,
                    "gallery_saved": is_public,
                    "is_private": req.is_private,
                    "mode": req.mode,
                    "stage2_upscale": req.stage2_upscale,
                    "source_image_filename": source_image_filename or "",
                    "last_frame_filename": last_frame_filename or "",
                    "video_mode": req.video_mode
                    or ("image-to-video" if source_image_filename else "text-to-video"),
                    "audio_mode": req.audio_mode,
                    "resolved_reference_audio": reference_audio_filename or "",
                    "extract_voice": req.extract_voice,
                    "resize_mode": req.resize_mode,
                    "video_megapixels": req.video_megapixels,
                    "first_frame_strength": req.first_frame_strength,
                    "last_frame_strength": req.last_frame_strength,
                    "rife_multiplier": req.rife_multiplier,
                    "high_fps": req.high_fps,
                    "film_grain": req.film_grain,
                    "match_color": req.match_color,
                    "tiled_vae_decode": req.tiled_vae_decode,
                    "video_fps": req.video_fps,
                    "video_duration_seconds": req.video_duration_seconds,
                    "video_frames": (req.video_duration_seconds or 3) * (req.video_fps or 25) + 1,
                },
                namespace=user_id,
            )
            video_asset = GeneratedAsset(
                filename=video_item["filename"],
                url=video_url,
                kind="video",
                saved=True,
            )
            # Record the video in the relational DB alongside images so gallery
            # listings, credits history and remix see it.
            try:
                rel_key = (
                    video_url.split("/files/")[-1]
                    if "/files/" in video_url
                    else video_item["filename"]
                )
                get_db().insert_generation(
                    {
                        "prompt_id": prompt_id,
                        "user_id": user_id,
                        "model_id": selected_model.get("model_id"),
                        "version_id": selected_model.get("version_id"),
                        "file_id": selected_model.get("file_id"),
                        "filename": video_item["filename"],
                        "url": video_url,
                        "key": rel_key,
                        "prompt": req.prompt,
                        "negative_prompt": req.negative_prompt,
                        "seed": resolved_seed,
                        "steps": req.steps,
                        "cfg": req.cfg,
                        "denoise": req.denoise,
                        "width": req.width,
                        "height": req.height,
                        "format_name": req.format_name,
                        "status": "completed",
                        "elapsed_ms": elapsed_ms,
                        "origin": "generation",
                        "gallery_saved": 1 if is_public else 0,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "metadata_json": json.dumps(
                            {
                                **metadata,
                                "kind": "video",
                                "source_filename": video_item["filename"],
                                "user_id": user_id,
                                "gallery_saved": is_public,
                                "is_private": req.is_private,
                                "mode": req.mode,
                                "video_mode": req.video_mode
                                or (
                                    "image-to-video"
                                    if source_image_filename
                                    else "text-to-video"
                                ),
                                "stage2_upscale": req.stage2_upscale,
                            }
                        ),
                    }
                )
            except Exception as exc:
                logger.warning(
                    "Failed to insert video generation record into DB: %s", exc
                )
            if is_public:
                background_tasks.add_task(_bg_auto_tag_asset, rel_key)
            return GenerationResult(
                prompt_id=prompt_id,
                status="completed",
                images=[video_asset],
                elapsed_ms=elapsed_ms,
            )

        raw_images = await comfy.list_images(prompt_id)
        if not raw_images:
            return GenerationResult(
                prompt_id=prompt_id,
                status="completed",
                images=[],
                elapsed_ms=elapsed_ms,
            )

        # 1. Base Image: upload and preserve in local storage
        base_img = raw_images[0]
        base_blob = await comfy.fetch_image_bytes(base_img)
        has_upscale = bool(
            req.upscale
            and req.upscale.enabled
            and req.mode not in ("detailer", "upscale")
        )
        has_detailer = bool(
            ((req.detailer and req.detailer.enabled) or req.enable_detailer)
            and req.mode not in ("detailer", "upscale")
        )

        # Hide base image from public gallery if downstream stages (upscale/detailer) are active
        base_url = await storage.upload_image(
            base_blob,
            prompt_id,
            base_img["filename"],
            metadata={
                **metadata,
                "source_filename": base_img["filename"],
                "user_id": user_id,
                "gallery_saved": is_public if not (has_upscale or has_detailer) else False,
                "is_private": req.is_private,
                "is_base_pre_detailer": bool(has_upscale or has_detailer),
                "mode": req.mode,
                "source_image_filename": source_image_filename or "",
            },
            namespace=user_id,
        )

        active_blob = base_blob
        active_url = base_url
        active_filename = base_img["filename"]
        before_detailer_url = None

        # 2. Sequential Stage 2: SeedVR2 DiT Super-Resolution (if enabled)
        if has_upscale:
            upscaler_template = comfy.load_seedvr_upscaler_template()
            if upscaler_template:
                try:
                    uploaded_input_name = await comfy.upload_image(
                        active_blob, f"input_upscale_{prompt_id}.png"
                    )
                    upscale_graph = patch_seedvr_upscaler_workflow(
                        upscaler_template,
                        image_filename=uploaded_input_name,
                        upscale_cfg=req.upscale,
                        base_width=req.width,
                        base_height=req.height,
                    )
                    upscale_pid = await comfy.queue_prompt(upscale_graph, client_id)
                    up_status = await comfy.wait_until_done(upscale_pid, client_id)
                    if up_status == "completed":
                        up_raw = await comfy.list_images(upscale_pid)
                        if up_raw:
                            up_img = up_raw[0]
                            up_blob = await comfy.fetch_image_bytes(up_img)
                            up_url = await storage.upload_image(
                                up_blob,
                                upscale_pid,
                                up_img["filename"],
                                metadata={
                                    **metadata,
                                    "source_filename": up_img["filename"],
                                    "user_id": user_id,
                                    "gallery_saved": is_public if not has_detailer else False,
                                    "is_private": req.is_private,
                                    "is_upscaled": True,
                                    "before_upscale_url": base_url,
                                },
                                namespace=user_id,
                            )
                            before_detailer_url = base_url
                            active_blob = up_blob
                            active_url = up_url
                            active_filename = up_img["filename"]
                except Exception as exc:
                    logger.warning("Stage 2 SeedVR2 upscaler pass failed, retaining base image: %s", exc)

        # 3. Sequential Stage 3: Cascading Detailers & Styling (if enabled)
        if has_detailer:
            detailer_template = comfy.load_modular_detailer_template() or comfy.load_detailer_template()
            if detailer_template:
                try:
                    uploaded_input_name = await comfy.upload_image(
                        active_blob, f"input_detail_{prompt_id}.png"
                    )
                    detail_graph = patch_detailer_workflow(
                        detailer_template,
                        image_filename=uploaded_input_name,
                        detailer_cfg=req.detailer,
                        prompt=req.prompt,
                        negative_prompt=req.negative_prompt,
                        unet_name=resolved_base,
                        clip_name=resolved_clip,
                        clip_type=resolved_clip_type,
                        vae_name=resolved_vae,
                        loras=active_loras,
                    )
                    detail_pid = await comfy.queue_prompt(detail_graph, client_id)
                    det_status = await comfy.wait_until_done(detail_pid, client_id)
                    if det_status == "completed":
                        det_raw = await comfy.list_images(detail_pid)
                        if det_raw:
                            det_img = det_raw[0]
                            det_blob = await comfy.fetch_image_bytes(det_img)
                            det_url = await storage.upload_image(
                                det_blob,
                                detail_pid,
                                det_img["filename"],
                                metadata={
                                    **metadata,
                                    "source_filename": det_img["filename"],
                                    "user_id": user_id,
                                    "gallery_saved": is_public,
                                    "is_private": req.is_private,
                                    "has_detailer": True,
                                    "before_detailer_url": active_url,
                                },
                                namespace=user_id,
                            )
                            before_detailer_url = active_url
                            active_blob = det_blob
                            active_url = det_url
                            active_filename = det_img["filename"]
                except Exception as exc:
                    logger.warning("Stage 3 Detailer pass failed, retaining current image: %s", exc)

        assets.append(
            UploadedAsset(
                filename=active_filename,
                url=active_url,
                before_detailer_url=before_detailer_url,
            )
        )

        for asset in assets:
            # Extract key from url
            rel_key = (
                asset.url.split("/files/")[-1] if "/files/" in asset.url else asset.filename
            )

            # Auto-tag public generations in background
            if is_public:
                background_tasks.add_task(_bg_auto_tag_asset, rel_key)

            # Prepare LoRAs list for relational DB
            loras_list = []
            for item in active_loras:
                loras_list.append(
                    {
                        "lora_name": item.get("lora", ""),
                        "lora_model_id": item.get("model_id"),
                        "lora_version_id": item.get("version_id"),
                        "strength": float(item.get("strength", 1.0)),
                    }
                )

            try:
                get_db().insert_generation(
                    {
                        "prompt_id": prompt_id,
                        "user_id": user_id,
                        "model_id": selected_model.get("model_id"),
                        "version_id": selected_model.get("version_id"),
                        "file_id": selected_model.get("file_id"),
                        "filename": asset.filename,
                        "url": asset.url,
                        "key": rel_key,
                        "prompt": req.prompt,
                        "negative_prompt": req.negative_prompt,
                        "seed": resolved_seed,
                        "steps": req.steps,
                        "cfg": req.cfg,
                        "denoise": req.denoise,
                        "width": req.width,
                        "height": req.height,
                        "format_name": req.format_name,
                        "status": "completed",
                        "elapsed_ms": elapsed_ms,
                        "origin": "generation",
                        "gallery_saved": 1 if is_public else 0,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "metadata_json": json.dumps(
                            {
                                **metadata,
                                "source_filename": asset.filename,
                                "user_id": user_id,
                                "has_detailer": bool(has_detailer),
                                **(
                                    {"before_detailer_url": asset.before_detailer_url}
                                    if asset.before_detailer_url
                                    else {}
                                ),
                            }
                        ),
                    },
                    loras_list=loras_list,
                )
            except Exception as exc:
                logger.warning("Failed to record generation in relational DB: %s", exc)
    except (ComfyClientError, StorageError) as exc:
        logger.error("Post-processing error: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return GenerationResult(
        prompt_id=prompt_id,
        status="completed",
        images=assets,
        error=None,
        elapsed_ms=elapsed_ms,
    )


generate_images = generate


# ---------------------------------------------------------------------- #
# AI Tool Studio: isolated workflow parsing and execution
# ---------------------------------------------------------------------- #


@app.post("/api/tools/parse", response_model=ToolParseResponse)
async def parse_tool(
    workflow_api: UploadFile = File(...),
    name: str = Form("Untitled tool"),
) -> ToolParseResponse:
    """Store a server-owned workflow and return only safe editable controls."""
    if workflow_api.filename and not workflow_api.filename.lower().endswith(".json"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Upload a valid ComfyUI JSON file"
        )
    payload = await workflow_api.read(settings.TOOL_MAX_WORKFLOW_BYTES + 1)
    if len(payload) > settings.TOOL_MAX_WORKFLOW_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Workflow file is too large"
        )
    try:
        return get_ai_tool_service().parse(payload, name)
    except AIToolError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.post("/api/tools/create", response_model=ToolDetail)
async def create_tool(
    workflow_api: UploadFile = File(...),
    name: str = Form("Untitled tool"),
    mode: ToolMode | None = Form(None),
    aspect_ratio: ToolAspectRatio = Form(ToolAspectRatio.SQUARE),
    thumbnail: UploadFile | None = File(None),
    controls: str | None = Form(None),
    user_id: str | None = Form(None),
    author_username: str | None = Form(None),
    current_user: UserResponse = Depends(RequirePermission("tool:publish")),
) -> ToolDetail:
    if workflow_api.filename and not workflow_api.filename.lower().endswith(".json"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Upload a valid ComfyUI JSON file"
        )
    payload = await workflow_api.read(settings.TOOL_MAX_WORKFLOW_BYTES + 1)
    if len(payload) > settings.TOOL_MAX_WORKFLOW_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Workflow file is too large"
        )
    thumbnail_data: bytes | None = None
    thumbnail_ext: str | None = None
    if thumbnail is not None:
        thumbnail_ext = (
            f".{ALLOWED_IMAGE_MIME.get(thumbnail.content_type or '') or ''}".rstrip(".")
        )
        if thumbnail_ext not in {".png", ".jpg", ".webp"}:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Unsupported thumbnail image type"
            )
        thumbnail_data = await thumbnail.read(settings.UPLOAD_MAX_BYTES + 1)
        if len(thumbnail_data) > settings.UPLOAD_MAX_BYTES:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Thumbnail image is too large"
            )
    custom_controls = None
    if controls:
        try:
            parsed = json.loads(controls)
            if not isinstance(parsed, list):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "Controls must be a JSON array",
                )
            custom_controls = [ToolControl.model_validate(c) for c in parsed]
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid controls JSON: {exc}",
            ) from exc
    effective_user_id = current_user.id
    effective_author = author_username or current_user.username
    try:
        summary = get_ai_tool_service().create(
            payload,
            name,
            mode,
            aspect_ratio,
            thumbnail_data,
            thumbnail_ext,
            custom_controls=custom_controls,
            user_id=effective_user_id,
            author_username=effective_author,
        )
        return get_ai_tool_service().detail(summary.tool_id)
    except AIToolError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.post("/api/tools", response_model=ToolDetail)
async def create_tool_json(
    req: CreateToolRequest,
    current_user: UserResponse = Depends(RequirePermission("tool:publish")),
) -> ToolDetail:
    """Create a tool with optional user-customized controls via JSON payload."""
    raw_workflow = req.workflow_api
    if isinstance(raw_workflow, dict):
        payload = json.dumps(raw_workflow).encode("utf-8")
    elif isinstance(raw_workflow, str):
        payload = raw_workflow.encode("utf-8")
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid workflow_api format")
    effective_user_id = current_user.id
    effective_author = req.author_username or current_user.username
    try:
        summary = get_ai_tool_service().create(
            payload,
            req.name,
            req.mode,
            req.aspect_ratio,
            custom_controls=req.controls,
            user_id=effective_user_id,
            author_username=effective_author,
        )
        return get_ai_tool_service().detail(summary.tool_id)
    except AIToolError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/api/tools", response_model=ToolCatalogResponse)
async def list_tools(user_id: str | None = None) -> ToolCatalogResponse:
    return ToolCatalogResponse(items=get_ai_tool_service().list_public(user_id=user_id))


@app.get("/api/tools/{tool_id}", response_model=ToolDetail)
async def get_tool(tool_id: str) -> ToolDetail:
    try:
        return get_ai_tool_service().detail(tool_id)
    except AIToolNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tool not found") from exc
    except AIToolError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.delete("/api/tools/{tool_id}", response_model=DeleteToolResponse)
async def delete_tool_endpoint(
    tool_id: str,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> DeleteToolResponse:
    try:
        tool = get_ai_tool_service().detail(tool_id)
        await RequireOwnerOrPermission("tool:delete_any").enforce(
            tool.user_id, current_user, rbac
        )
        get_ai_tool_service().delete(tool_id)
        return DeleteToolResponse(deleted=True, tool_id=tool_id)
    except AIToolNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AIToolError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


async def _run_tool(
    tool_id: str,
    prompt: str,
    aspect_ratio: ToolAspectRatio | None,
    input_image: UploadFile | None,
    values: dict[str, object] | None = None,
    files: list[UploadFile] | None = None,
    image_control_ids: list[str] | None = None,
    client_id: str | None = None,
    save_to_gallery: bool = True,
    user_id: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> ToolExecutionResult:
    tools = get_ai_tool_service()
    try:
        record = tools.get(tool_id)
        detail = tools.detail(tool_id)
        chosen_ratio = aspect_ratio or ToolAspectRatio(record["default_aspect_ratio"])
    except (AIToolNotFound, ValueError) as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tool not found") from exc
    comfy = get_comfy_client()
    uploaded_images: dict[str, str] = {}
    image_ids = {control.id for control in detail.controls if control.kind == "image"}
    uploads = ([input_image] if input_image else []) + [
        file for file in (files or []) if file.filename
    ]
    submitted_image_ids = image_control_ids or []
    if len(submitted_image_ids) != len(uploads):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Each input image must name one image control",
        )
    if len(set(submitted_image_ids)) != len(submitted_image_ids):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Duplicate image control"
        )
    for upload, field_id in zip(uploads, submitted_image_ids):
        if field_id not in image_ids:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Unknown image control"
            )
        if field_id in uploaded_images:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Duplicate image control"
            )
        if upload.content_type not in ALLOWED_IMAGE_MIME:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="Unsupported input image type"
            )
        image_data = await upload.read(settings.UPLOAD_MAX_BYTES + 1)
        if len(image_data) > settings.UPLOAD_MAX_BYTES:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Input image is too large",
            )
        try:
            uploaded_images[field_id] = await comfy.upload_image(
                image_data,
                upload.filename or "input.png",
                upload.content_type or "image/png",
            )
        except ComfyClientError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if detail.requires_image and len(uploaded_images) != len(image_ids):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="All input image controls are required",
        )
    try:
        graph, resolved = tools.build_graph(
            tool_id, prompt, chosen_ratio, values=values, images=uploaded_images
        )
        session_id = client_id or f"tool-{uuid.uuid4().hex}"
        started = time.monotonic()
        prompt_id = await comfy.queue_prompt(graph, session_id)
        final_status = await comfy.wait_until_done(prompt_id, session_id)
    except AIToolError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except ComfyClientError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    elapsed_ms = int((time.monotonic() - started) * 1000)
    if final_status != "completed":
        return ToolExecutionResult(
            tool_id=tool_id,
            prompt_id=prompt_id,
            status=final_status,
            images=[],
            error=final_status,
            elapsed_ms=elapsed_ms,
            tool_mode=detail.mode,
            aspect_ratio=chosen_ratio,
        )
    assets: list[UploadedAsset] = []
    kind = detail.output_kind
    metadata_base = {
        "origin": "ai_tool_studio",
        "source": "tool",
        "tool_id": tool_id,
        "tool_name": detail.name,
        "tool_type": detail.mode.value,
        "tool_mode": detail.mode.value,
        "kind": kind,
        "gallery_saved": save_to_gallery,
        "prompt": prompt,
        "aspect_ratio": chosen_ratio.value,
        "width": resolved["width"],
        "height": resolved["height"],
        "prompt_id": prompt_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_ms": elapsed_ms,
        "controls": values or {},
        "tags": ["ai_tool_studio", detail.mode.value],
        "user_id": user_id,
    }
    try:
        for output in await comfy.list_output_files(prompt_id, kind):
            blob = await comfy.fetch_image_bytes(output)
            asset_meta = {
                **metadata_base,
                "source_filename": output["filename"],
                "user_id": user_id,
            }
            url = await storage.upload_asset(
                blob,
                prompt_id,
                output["filename"],
                metadata=asset_meta,
                namespace=f"tools/{tool_id}",
            )
            assets.append(
                UploadedAsset(
                    filename=output["filename"],
                    url=url,
                    kind=kind,
                    saved=save_to_gallery,
                )
            )
            if "/files/" in url:
                rel_key = url.split("/files/")[-1]
            elif f"tools/{tool_id}/" in url:
                rel_key = "tools/" + tool_id + "/" + url.split(f"tools/{tool_id}/")[-1]
            else:
                rel_key = output["filename"]

            # Auto-tag public tool output in background
            if save_to_gallery and background_tasks is not None:
                background_tasks.add_task(_bg_auto_tag_asset, rel_key)
            try:
                get_db().insert_generation(
                    {
                        "prompt_id": prompt_id,
                        "user_id": user_id,
                        "filename": output["filename"],
                        "url": url,
                        "key": rel_key,
                        "prompt": prompt,
                        "width": resolved["width"],
                        "height": resolved["height"],
                        "status": "completed",
                        "elapsed_ms": elapsed_ms,
                        "origin": "ai_tool_studio",
                        "gallery_saved": 1 if save_to_gallery else 0,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "metadata_json": json.dumps(asset_meta),
                    }
                )
            except Exception as exc:
                logger.warning(
                    "Failed to insert tool generation record into DB: %s", exc
                )
    except (ComfyClientError, StorageError) as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail="AI Tool output retrieval failed"
        ) from exc
    return ToolExecutionResult(
        tool_id=tool_id,
        prompt_id=prompt_id,
        status="completed",
        images=assets,
        error=None,
        elapsed_ms=elapsed_ms,
        tool_mode=detail.mode,
        aspect_ratio=chosen_ratio,
    )


@app.post("/api/tools/execute", response_model=ToolExecutionResult)
async def execute_tool(
    req: ToolExecuteRequest,
    background_tasks: BackgroundTasks,
    user: UserResponse = Depends(get_current_user),
) -> ToolExecutionResult:
    return await _run_tool(
        req.tool_id,
        req.prompt,
        req.aspect_ratio,
        None,
        req.values,
        client_id=req.client_id,
        save_to_gallery=req.save_to_gallery,
        user_id=user.id,
        background_tasks=background_tasks,
    )


@app.post("/api/tools/{tool_id}/run", response_model=ToolExecutionResult)
async def run_tool(
    tool_id: str,
    background_tasks: BackgroundTasks,
    prompt: str = Form(""),
    aspect_ratio: ToolAspectRatio | None = Form(None),
    values: str = Form("{}"),
    image_control_ids: str = Form("[]"),
    client_id: str | None = Form(None),
    save_to_gallery: bool = Form(True),
    files: Annotated[list[UploadFile] | None, File()] = None,
    user: UserResponse = Depends(get_current_user),
) -> ToolExecutionResult:
    try:
        parsed_values = json.loads(values)
        parsed_image_ids = json.loads(image_control_ids)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Values and image control IDs must be valid JSON",
        ) from exc
    if (
        not isinstance(parsed_values, dict)
        or not isinstance(parsed_image_ids, list)
        or not all(isinstance(item, str) for item in parsed_image_ids)
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Values must be an object and image control IDs an array",
        )
    return await _run_tool(
        tool_id,
        prompt,
        aspect_ratio,
        None,
        values=parsed_values,
        files=files,
        image_control_ids=parsed_image_ids,
        client_id=client_id,
        save_to_gallery=save_to_gallery,
        user_id=user.id,
        background_tasks=background_tasks,
    )


run_tool_endpoint = run_tool


@app.get("/api/tools/{tool_id}/thumbnail")
async def tool_thumbnail(tool_id: str) -> FileResponse:
    try:
        return FileResponse(get_ai_tool_service().thumbnail_path(tool_id))
    except AIToolNotFound as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Tool thumbnail not found"
        ) from exc


@app.get("/api/tools/{tool_id}/files/{relative_path:path}")
async def tool_file(tool_id: str, relative_path: str) -> FileResponse:
    """Serve tool outputs through a tool-specific namespace."""
    try:
        path = get_ai_tool_service().output_path(tool_id, relative_path)
    except AIToolNotFound as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Tool output not found"
        ) from exc
    return FileResponse(path)


@app.websocket("/api/v1/ws/progress/{client_id}")
async def ws_progress(websocket: WebSocket, client_id: str) -> None:
    """Relay ComfyUI execution events for a given client_id to the browser."""
    await websocket.accept()
    import websockets

    logger.info("WS progress channel opened for %s", client_id)
    try:
        url = f"{settings.comfy_ws}/ws?clientId={client_id}"
        async with websockets.connect(
            url, max_size=64 * 1024 * 1024, ping_interval=30, ping_timeout=120
        ) as upstream:
            async for raw in upstream:
                if isinstance(raw, (bytes, bytearray)):
                    # Binary frames = live preview images; forward as-is.
                    await websocket.send_bytes(raw)
                    continue
                await websocket.send_text(raw)
    except WebSocketDisconnect:
        logger.info("WS progress channel closed by browser: %s", client_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("WS relay error for %s: %s", client_id, exc)
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": f"Relay lost: {exc}"})
            )
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------------- #
# Gallery
# ---------------------------------------------------------------------- #


@app.get("/api/v1/gallery/me", response_model=GalleryResponse)
async def my_gallery(
    limit: int = 60,
    origin: str | None = None,
    tool_id: str | None = None,
    tool_type: str | None = None,
    tag: str | None = None,
    tags: str | None = None,
    tag_mode: str = "all",
    current_user: UserResponse = Depends(get_current_user),
) -> GalleryResponse:
    if limit < 1 or limit > settings.GALLERY_LIMIT:
        limit = settings.GALLERY_LIMIT
    try:
        import asyncio

        parsed_tags = (
            [t.strip() for t in tags.split(",") if t.strip()] if tags else None
        )
        items = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: storage.list_recent(
                limit=limit,
                origin=origin,
                tool_id=tool_id,
                tool_type=tool_type,
                tag=tag,
                tags=parsed_tags,
                tag_mode=tag_mode,
                user_id=current_user.id,
            ),
        )
    except StorageError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return GalleryResponse(items=items)


@app.get("/api/v1/gallery", response_model=GalleryResponse)
async def gallery(
    limit: int = 60,
    origin: str | None = None,
    tool_id: str | None = None,
    tool_type: str | None = None,
    tag: str | None = None,
    tags: str | None = None,
    tag_mode: str = "all",
    user_id: str | None = None,
    user: Optional[UserResponse] = Depends(get_optional_user),
) -> GalleryResponse:
    if limit < 1 or limit > settings.GALLERY_LIMIT:
        limit = settings.GALLERY_LIMIT
    if user_id == "me":
        if not user:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required for user_id='me'",
            )
        effective_user_id = user.id
    else:
        effective_user_id = user_id
    try:
        import asyncio

        parsed_tags = (
            [t.strip() for t in tags.split(",") if t.strip()] if tags else None
        )
        items = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: storage.list_recent(
                limit=limit,
                origin=origin,
                tool_id=tool_id,
                tool_type=tool_type,
                tag=tag,
                tags=parsed_tags,
                tag_mode=tag_mode,
                user_id=effective_user_id,
            ),
        )
    except StorageError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return GalleryResponse(items=items)


@app.get("/api/v1/gallery/paginated", response_model=PaginatedGenerationsResponse)
async def paginated_gallery(
    page: int = 1,
    limit: int = 20,
    model_id: str | None = None,
    user_id: str | None = None,
) -> PaginatedGenerationsResponse:
    """Return paginated gallery with relational filtering by model and user."""
    items, total = get_db().get_paginated_generations(
        user_id=user_id, model_id=model_id, page=page, limit=limit
    )
    return PaginatedGenerationsResponse.create(
        items=[GenerationRecordResponse(**item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


@app.get("/api/v1/tags", response_model=TagSummaryList)
async def list_popular_tags(
    limit: int = 50,
    user_id: str | None = None,
) -> TagSummaryList:
    if limit < 1 or limit > 200:
        limit = 50
    tags = storage.list_popular_tags(limit=limit, user_id=user_id)
    return TagSummaryList(items=[TagSummary(**item) for item in tags])


@app.post("/api/v1/tagger/interrogate", response_model=TagInterrogateResponse)
async def interrogate_image(file: UploadFile = File(...)) -> TagInterrogateResponse:
    started = time.monotonic()
    content = await file.read(25 * 1024 * 1024)
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty image file")

    # Tier 1: Check for embedded generation metadata (instant byte read)
    from .services.image_metadata import extract_image_metadata
    meta = extract_image_metadata(content)
    if meta.has_metadata:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return TagInterrogateResponse(
            tags=meta.tags,
            has_metadata=True,
            metadata=ImageMetadataExtracted(**meta.to_dict()),
            elapsed_ms=elapsed_ms,
        )

    # Tier 2: Fallback to ComfyUI WD14 Vision Tagger
    tagger = get_tagger_service()
    try:
        tags = await tagger.interrogate_image(
            content, filename=file.filename or "image.png"
        )
    except TaggerError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    elapsed_ms = int((time.monotonic() - started) * 1000)
    return TagInterrogateResponse(
        tags=tags,
        has_metadata=False,
        metadata=None,
        elapsed_ms=elapsed_ms,
    )


@app.post("/api/v1/assets/{key:path}/tags/auto", response_model=GalleryItem)
async def auto_tag_asset(key: str) -> GalleryItem:
    tagger = get_tagger_service()
    try:
        await tagger.auto_tag_asset(key)
        return storage.get_asset(key)
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from exc
    except TaggerError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.put("/api/v1/assets/{key:path}/tags", response_model=GalleryItem)
async def update_asset_tags(key: str, req: TagUpdateRequest) -> GalleryItem:
    try:
        return storage.update_tags(key, req.tags)
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/api/v1/assets/{key:path}", response_model=GalleryItem)
async def asset_detail(key: str) -> GalleryItem:
    try:
        return storage.get_asset(key)
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.patch("/api/v1/assets/{key:path}", response_model=GalleryItem)
async def save_asset(
    key: str,
    saved: bool,
    background_tasks: BackgroundTasks,
) -> GalleryItem:
    try:
        item = storage.set_saved(key, saved)
        if saved and not (item.metadata or {}).get("tags"):
            background_tasks.add_task(_bg_auto_tag_asset, key)
        return item
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/api/v1/images/{key:path}", response_model=GalleryItem)
async def image_detail(key: str) -> GalleryItem:
    return await asset_detail(key)


@app.delete("/api/v1/gallery/{key:path}", response_model=DeleteAssetResponse)
async def delete_gallery_asset(
    key: str,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> DeleteAssetResponse:
    try:
        item = storage.get_asset(key)
        asset_user_id = (item.metadata or {}).get("user_id")
        await RequireOwnerOrPermission("generation:delete_any").enforce(
            asset_user_id, current_user, rbac
        )
        storage.delete_asset(key)
        return DeleteAssetResponse(deleted=True, key=key)
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.delete("/api/v1/assets/{key:path}", response_model=DeleteAssetResponse)
async def delete_asset_endpoint(
    key: str,
    current_user: UserResponse = Depends(get_current_user),
    rbac: RBACService = Depends(get_rbac_service),
) -> DeleteAssetResponse:
    return await delete_gallery_asset(key, current_user=current_user, rbac=rbac)