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

from typing import Annotated, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import Database, get_db
from .routers.auth import router as auth_router, get_current_user, get_optional_user
from .schemas import (
    AssistantRequest,
    AssistantResponse,
    GenerateRequest,
    GenerationResult,
    DeleteAssetResponse,
    GalleryItem,
    GalleryResponse,
    HealthResponse,
    ModelCreateRequest,
    ModelFilePatchRequest,
    ModelFileResponse,
    ModelListResponse,
    ModelPrecision,
    ModelPublishRequest,
    ModelResponse,
    ModelSampleResponse,
    ModelUpdateRequest,
    ModelVersionCreateRequest,
    ModelVersionResponse,
    ModelInstallResponse,
    InstalledGalleryModel,
    InstalledGalleryModelList,
    LocalModelImportRequest,
    LocalModelListResponse,
    PublicModelListResponse,
    TagInterrogateResponse,
    TagSummary,
    TagSummaryList,
    TagUpdateRequest,
    CreateToolRequest,
    DeleteToolResponse,
    ToolAspectRatio,
    ToolCatalogResponse,
    ToolControl,
    ToolDetail,
    ToolExecutionResult,
    ToolMode,
    ToolExecuteRequest,
    ToolParseResponse,
    UploadedAsset,
    UserResponse,
    UserPublicProfileResponse,
    UserFollowResponse,
    GenerationRecordResponse,
    PaginatedGenerationsResponse,
    PaginatedSamplesResponse,
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
from .services.redis_service import get_redis_service
from .services.storage import StorageError, StorageService, get_storage
from .services.tagger import TaggerError, get_tagger_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("comfy_studio")

settings = get_settings()
storage = get_storage()
storage.ensure_root()
model_storage = get_model_service()
model_storage.ensure_root()
code_assistant = get_code_assistant_service(settings)
redis_service = get_redis_service(settings)

# Auto-initialize database on application startup
db = get_db()
db.init_db()
try:
    db.sync_filesystem_to_db(models_dir=model_storage.definitions, storage_dir=storage.root)
except Exception as exc:
    logger.warning("Could not sync filesystem to SQLite on startup: %s", exc)

app = FastAPI(title=settings.APP_NAME, version="1.1.0")

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


# --- Creator Profiles & Social Endpoints ------------------------------------


@app.get("/api/v1/users/{username_or_id}", response_model=UserPublicProfileResponse)
@app.get("/api/users/{username_or_id}", response_model=UserPublicProfileResponse)
async def get_user_public_profile(
    username_or_id: str,
    viewer: Optional[UserResponse] = Depends(get_optional_user),
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
    target = db.get_user_by_id(username_or_id) or db.get_user_by_username(username_or_id)
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
    is_following = db.toggle_follow_user(follower_id=current_user.id, following_id=target_id)
    followers_count = db.get_followers_count(target_id)
    return UserFollowResponse(
        following=is_following,
        is_following=is_following,
        followers_count=followers_count,
        target_user_id=target_id,
    )


@app.on_event("startup")
def startup_event() -> None:
    db.init_db()


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
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Malformed data URL for reference {index}")
        mime = header.removeprefix("data:").split(";", 1)[0].lower()
        ext = ALLOWED_IMAGE_MIME.get(mime)
        if ext is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported image type for reference {index}")
    try:
        decoded = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Reference image {index} is not valid base64")
    if not decoded:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Reference image {index} is empty")
    if len(decoded) > settings.UPLOAD_MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Reference image {index} exceeds size limit")
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
    redis_status = "up" if redis_service.ping() else ("disabled" if not redis_service.is_enabled else "down")
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
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AssistantUpstreamError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AssistantResponse(persona=req.persona, answer=answer)


MODEL_CATEGORIES = {
    "diffusion_models",
    "text_encoders",
    "vae",
    "loras",
    "checkpoints",
    "embeddings",
}



def _model_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ModelNotFound):
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, ModelConflict):
        return HTTPException(status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


@app.get("/api/v1/models/local", response_model=LocalModelListResponse)
async def list_local_models(q: str | None = None, category: str | None = None, limit: int = 50) -> LocalModelListResponse:
    try:
        return LocalModelListResponse(items=model_storage.local_models(q, category, limit))
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post("/api/v1/models/id/{model_id}/versions/{version_id}/files/import-local", response_model=ModelResponse)
async def import_local_model_file(model_id: str, version_id: str, req: LocalModelImportRequest) -> ModelResponse:
    try:
        return model_storage.import_local_file(model_id, version_id, req.category, req.filename, req.precision)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/public", response_model=PublicModelListResponse)
async def list_public_models(q: str | None = None, user_id: str | None = None) -> PublicModelListResponse:
    items = []
    for model in model_storage.public_list(query=q, user_id=user_id):
        public_files = sum(1 for version in model.versions for item in version.files if item.visible)
        public_samples = sum(len(version.samples) for version in model.versions)
        cover = next((sample.url for version in model.versions for sample in version.samples), None)
        items.append({
            "model_id": model.model_id,
            "title": model.title,
            "category": model.category,
            "model_type": model.model_type,
            "tags": model.tags,
            "base_model": model.compatibility.base_model,
            "published_at": model.published_at,
            "updated_at": model.updated_at,
            "cover_url": cover,
            "version_count": len(model.versions),
            "file_count": public_files,
            "sample_count": public_samples,
        })
    return PublicModelListResponse(items=items)


@app.get("/api/v1/models/public/selectable", response_model=InstalledGalleryModelList)
async def list_selectable_public_models() -> InstalledGalleryModelList:
    try:
        return InstalledGalleryModelList(items=[InstalledGalleryModel(**item) for item in model_storage.selectable_gallery_files()])
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/public/{model_id}", response_model=ModelResponse)
async def get_public_model(model_id: str) -> ModelResponse:
    try:
        return model_storage.public_response(model_id)
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post("/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/install", response_model=ModelInstallResponse)
async def install_public_model_file(model_id: str, version_id: str, file_id: str) -> ModelInstallResponse:
    try:
        return ModelInstallResponse(**model_storage.install_file(model_id, version_id, file_id))
    except ModelConflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ModelError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ModelNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@app.get("/api/v1/models", response_model=ModelListResponse)
async def list_creator_models(visibility: str | None = None, q: str | None = None, user_id: str | None = None) -> ModelListResponse:
    return ModelListResponse(items=model_storage.list(visibility=visibility, query=q, user_id=user_id))


@app.post("/api/v1/models", response_model=ModelResponse, status_code=status.HTTP_201_CREATED)
async def create_creator_model(
    req: ModelCreateRequest,
    current_user: Optional[UserResponse] = Depends(get_optional_user),
) -> ModelResponse:
    try:
        user_id = current_user.id if current_user else None
        return model_storage.create(req, user_id=user_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/id/{model_id}", response_model=ModelResponse)
async def get_creator_model(model_id: str) -> ModelResponse:
    try:
        return model_storage.get(model_id)
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.patch("/api/v1/models/id/{model_id}", response_model=ModelResponse)
async def update_creator_model(model_id: str, req: ModelUpdateRequest) -> ModelResponse:
    try:
        return model_storage.update(model_id, req)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.delete("/api/v1/models/id/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_creator_model(model_id: str) -> None:
    try:
        model_storage.delete(model_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post("/api/v1/models/id/{model_id}/versions", response_model=ModelVersionResponse, status_code=status.HTTP_201_CREATED)
async def create_model_version(model_id: str, req: ModelVersionCreateRequest) -> ModelVersionResponse:
    try:
        return model_storage.create_version(model_id, req)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post("/api/v1/models/id/{model_id}/versions/{version_id}/files", response_model=ModelResponse)
async def upload_model_file(model_id: str, version_id: str, file: UploadFile = File(...), precision: ModelPrecision = Form(ModelPrecision.FP16)) -> ModelResponse:
    data = await file.read(settings.MODEL_MAX_BYTES + 1)
    try:
        return model_storage.add_file(model_id, version_id, file.filename or "model.bin", data, precision)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.patch("/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}", response_model=ModelResponse)
async def patch_model_file(model_id: str, version_id: str, file_id: str, req: ModelFilePatchRequest) -> ModelResponse:
    try:
        return model_storage.patch_file(model_id, version_id, file_id, req)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.delete("/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_file(model_id: str, version_id: str, file_id: str) -> None:
    try:
        model_storage.remove_file(model_id, version_id, file_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post("/api/v1/models/id/{model_id}/versions/{version_id}/samples", response_model=ModelResponse)
async def upload_model_sample(model_id: str, version_id: str, file: UploadFile = File(...), metadata: str = Form("{}")) -> ModelResponse:
    try:
        parsed = json.loads(metadata)
        if not isinstance(parsed, dict):
            raise ValueError("Sample metadata must be an object")
        data = await file.read(settings.MODEL_SAMPLE_MAX_BYTES + 1)
        return model_storage.add_sample(model_id, version_id, file.filename or "sample.png", data, parsed)
    except (json.JSONDecodeError, ValueError, ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.delete("/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_sample(model_id: str, version_id: str, sample_id: str) -> None:
    try:
        model_storage.remove_sample(model_id, version_id, sample_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.post("/api/v1/models/id/{model_id}/publish", response_model=ModelResponse)
async def publish_creator_model(model_id: str, req: ModelPublishRequest) -> ModelResponse:
    try:
        return model_storage.publish(model_id, req)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}/download")
@app.head("/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}/download")
@app.get("/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/download")
@app.head("/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/download")
async def download_model_file(model_id: str, version_id: str, file_id: str) -> FileResponse:
    try:
        return FileResponse(model_storage.public_file_path(model_id, version_id, file_id))
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}/download")
@app.head("/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}/download")
@app.get("/api/v1/models/public/{model_id}/versions/{version_id}/samples/{sample_id}/download")
@app.head("/api/v1/models/public/{model_id}/versions/{version_id}/samples/{sample_id}/download")
async def download_model_sample(model_id: str, version_id: str, sample_id: str) -> FileResponse:
    try:
        return FileResponse(model_storage.public_sample_path(model_id, version_id, sample_id))
    except (ModelError, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc


@app.get("/api/v1/models/id/{model_id}/images", response_model=PaginatedGenerationsResponse)
@app.get("/api/v1/models/public/{model_id}/images", response_model=PaginatedGenerationsResponse)
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

    items, total = get_db().get_model_generations(model_id, version_id=version_id, page=page, limit=limit)
    return PaginatedGenerationsResponse.create(
        items=[GenerationRecordResponse(**item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


@app.get("/api/v1/models/id/{model_id}/samples-paginated", response_model=PaginatedSamplesResponse)
@app.get("/api/v1/models/public/{model_id}/samples-paginated", response_model=PaginatedSamplesResponse)
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

    items, total = get_db().get_model_samples(model_id, version_id=version_id, page=page, limit=limit)
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
        return {"encoders": await comfy.list_models("text_encoders"), "types": await comfy.clip_types()}
    except ComfyClientError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ---------------------------------------------------------------------- #
# Generation
# ---------------------------------------------------------------------- #


@app.post("/api/v1/generate", response_model=GenerationResult)
@app.post("/api/generate", response_model=GenerationResult)
async def generate(
    req: GenerateRequest,
    user: Annotated[Optional[UserResponse], Depends(get_optional_user)] = None,
) -> GenerationResult:
    """Queue a workflow on ComfyUI, wait for completion, save images to disk."""
    if req.mode != "text-to-image":
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED,
            detail="Image-to-Image generation is not implemented yet",
        )

    # Deduction for authenticated creators (TensorArt quota model)
    credit_service = get_credit_service()
    cost = settings.DEFAULT_GENERATION_COST
    credits_deducted = False
    if user:
        if not credit_service.deduct_credits(user.id, amount=cost):
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                detail="INSUFFICIENT_CREDITS",
            )
        credits_deducted = True

    try:
        selected_model = model_storage.resolve_installed_gallery_file(req.model_id, req.version_id, req.file_id)
        is_lora = selected_model["model_type"] in {"LoRA", "LyCORIS"}
        if is_lora:
            expected_base = (
                selected_model.get("base_model_id"),
                selected_model.get("base_version_id"),
                selected_model.get("base_file_id"),
            )
            base_ids = (req.base_model_id, req.base_version_id, req.base_file_id)
            if expected_base != base_ids:
                raise ModelConflict("This LoRA is compatible only with its configured base model")
            base_model = model_storage.resolve_installed_gallery_file(*base_ids)  # type: ignore[arg-type]
            if base_model["model_type"] not in {"Checkpoint", "Diffusion Model"}:
                raise ModelConflict("LoRA base must be a Checkpoint or Diffusion Model")
        else:
            if any(value is not None for value in (req.base_model_id, req.base_version_id, req.base_file_id)):
                raise ModelConflict("Base model identity is only valid for LoRA generation")
            base_model = selected_model
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        raise _model_http_error(exc) from exc

    clip_name = base_model.get("text_encoder")
    clip_type = base_model.get("clip_type")
    vae_name = base_model.get("vae")
    if base_model["model_type"] == "Diffusion Model" and (not clip_name or not clip_type or not vae_name):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Configure a text encoder, CLIP type, and VAE for the selected base model before generating",
        )

    comfy = get_comfy_client()
    client_id = req.client_id or str(uuid.uuid4())
    resolved_seed = req.seed if req.seed is not None else random.randint(0, 2**32 - 1)
    started = time.monotonic()

    try:
        active_loras: list[dict[str, Any]] = []
        if is_lora:
            resolved_primary_lora = await comfy.resolve_model_name("loras", selected_model["filename"])
            active_loras.append({
                "lora": resolved_primary_lora,
                "strength": 1.0,
                "on": True,
                "model_id": selected_model.get("model_id"),
                "version_id": selected_model.get("version_id"),
                "file_id": selected_model.get("file_id"),
            })

        for adapter in req.lora_adapters:
            if not adapter.on:
                continue
            adapter_model_id = adapter.model_id
            adapter_version_id = adapter.version_id
            adapter_file_id = adapter.file_id
            if adapter.model_id and adapter.version_id and adapter.file_id:
                adapter_model = model_storage.resolve_installed_gallery_file(
                    adapter.model_id, adapter.version_id, adapter.file_id
                )
                if adapter_model["model_type"] not in {"LoRA", "LyCORIS"}:
                    raise ModelConflict("Adapter model must be a LoRA or LyCORIS")
                raw_filename = adapter_model["filename"]
            elif adapter.lora:
                raw_filename = adapter.lora
            else:
                continue

            resolved_adapter_lora = await comfy.resolve_model_name("loras", raw_filename)
            existing = next((item for item in active_loras if item["lora"] == resolved_adapter_lora), None)
            if existing is not None:
                existing["strength"] = adapter.strength
                existing["on"] = adapter.on
                if adapter_model_id:
                    existing["model_id"] = adapter_model_id
                    existing["version_id"] = adapter_version_id
                    existing["file_id"] = adapter_file_id
            else:
                active_loras.append({
                    "lora": resolved_adapter_lora,
                    "strength": adapter.strength,
                    "on": adapter.on,
                    "model_id": adapter_model_id,
                    "version_id": adapter_version_id,
                    "file_id": adapter_file_id,
                })

        resolved_base = await comfy.resolve_model_name(base_model["category"], base_model["filename"])
        resolved_clip = ""
        resolved_clip_type = ""
        resolved_vae = ""
        if base_model["model_type"] == "Diffusion Model":
            resolved_clip = await comfy.resolve_model_name("text_encoders", clip_name)
            resolved_clip_type = await comfy.resolve_clip_type(clip_type)
            resolved_vae = await comfy.resolve_model_name("vae", vae_name)
        elif clip_name and clip_type:
            resolved_clip = await comfy.resolve_model_name("text_encoders", clip_name)
            resolved_clip_type = await comfy.resolve_clip_type(clip_type)
            if vae_name:
                resolved_vae = await comfy.resolve_model_name("vae", vae_name)

        if is_lora:
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
                width=req.width,
                height=req.height,
                loras=active_loras,
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
                width=req.width,
                height=req.height,
                loras=active_loras,
            )
        prompt_id = await comfy.queue_prompt(graph, client_id)
        final_status = await comfy.wait_until_done(prompt_id, client_id)
    except (ModelError, ModelConflict, ModelNotFound) as exc:
        if credits_deducted and user:
            credit_service.db.update_credits(
                user.id,
                balance=credit_service.get_user_credits(user.id, auto_replenish=False).balance + cost,
            )
        raise _model_http_error(exc) from exc
    except ComfyClientError as exc:
        if credits_deducted and user:
            credit_service.db.update_credits(
                user.id,
                balance=credit_service.get_user_credits(user.id, auto_replenish=False).balance + cost,
            )
        logger.error("ComfyUI error: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    elapsed_ms = int((time.monotonic() - started) * 1000)
    if final_status != "completed":
        if credits_deducted and user:
            credit_service.db.update_credits(
                user.id,
                balance=credit_service.get_user_credits(user.id, auto_replenish=False).balance + cost,
            )
        return GenerationResult(
            prompt_id=prompt_id, status=final_status, images=[], error=final_status, elapsed_ms=elapsed_ms
        )

    user_id = user.id if user else None
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
        "width": req.width,
        "height": req.height,
        "format_name": req.format_name,
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
        "lora_filename": selected_model["filename"] if is_lora else (active_loras[0]["lora"] if active_loras else ""),
        "loras": active_loras,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_ms": elapsed_ms,
        "user_id": user_id,
    }
    try:
        for image in await comfy.list_images(prompt_id):
            blob = await comfy.fetch_image_bytes(image)
            url = await storage.upload_image(
                blob,
                prompt_id,
                image["filename"],
                metadata={**metadata, "source_filename": image["filename"], "user_id": user_id},
                namespace=user_id,
            )
            assets.append(UploadedAsset(filename=image["filename"], url=url))

            # Extract key from url
            rel_key = url.split("/files/")[-1] if "/files/" in url else image["filename"]

            # Prepare LoRAs list for relational DB
            loras_list = []
            for item in active_loras:
                loras_list.append({
                    "lora_name": item.get("lora", ""),
                    "lora_model_id": item.get("model_id"),
                    "lora_version_id": item.get("version_id"),
                    "strength": float(item.get("strength", 1.0)),
                })

            try:
                get_db().insert_generation(
                    {
                        "prompt_id": prompt_id,
                        "user_id": user_id,
                        "model_id": selected_model.get("model_id"),
                        "version_id": selected_model.get("version_id"),
                        "file_id": selected_model.get("file_id"),
                        "filename": image["filename"],
                        "url": url,
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
                        "gallery_saved": 1,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "metadata_json": json.dumps({**metadata, "source_filename": image["filename"], "user_id": user_id}),
                    },
                    loras_list=loras_list,
                )
            except Exception as exc:
                logger.warning("Failed to record generation in relational DB: %s", exc)
    except (ComfyClientError, StorageError) as exc:
        logger.error("Post-processing error: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return GenerationResult(
        prompt_id=prompt_id, status="completed", images=assets, error=None, elapsed_ms=elapsed_ms
    )


# ---------------------------------------------------------------------- #
# AI Tool Studio: isolated workflow parsing and execution
# ---------------------------------------------------------------------- #


@app.post("/api/tools/parse", response_model=ToolParseResponse)
async def parse_tool(
    workflow_api: UploadFile = File(...),
    name: str = Form("Untitled tool"),
) -> ToolParseResponse:
    """Store a server-owned workflow and return only safe editable controls."""
    if workflow_api.filename and workflow_api.filename.lower() != "workflow_api.json":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload a workflow_api.json file")
    payload = await workflow_api.read(settings.TOOL_MAX_WORKFLOW_BYTES + 1)
    if len(payload) > settings.TOOL_MAX_WORKFLOW_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Workflow file is too large")
    try:
        return get_ai_tool_service().parse(payload, name)
    except AIToolError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.post("/api/tools/create", response_model=ToolDetail)
async def create_tool(
    workflow_api: UploadFile = File(...),
    name: str = Form("Untitled tool"),
    mode: ToolMode = Form(...),
    aspect_ratio: ToolAspectRatio = Form(...),
    thumbnail: UploadFile | None = File(None),
    controls: str | None = Form(None),
    user_id: str | None = Form(None),
    author_username: str | None = Form(None),
    current_user: Optional[UserResponse] = Depends(get_optional_user),
) -> ToolDetail:
    if workflow_api.filename and workflow_api.filename.lower() != "workflow_api.json":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload a workflow_api.json file")
    payload = await workflow_api.read(settings.TOOL_MAX_WORKFLOW_BYTES + 1)
    if len(payload) > settings.TOOL_MAX_WORKFLOW_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Workflow file is too large")
    thumbnail_data: bytes | None = None
    thumbnail_ext: str | None = None
    if thumbnail is not None:
        thumbnail_ext = f".{ALLOWED_IMAGE_MIME.get(thumbnail.content_type or '') or ''}".rstrip(".")
        if thumbnail_ext not in {".png", ".jpg", ".webp"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported thumbnail image type")
        thumbnail_data = await thumbnail.read(settings.UPLOAD_MAX_BYTES + 1)
        if len(thumbnail_data) > settings.UPLOAD_MAX_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Thumbnail image is too large")
    custom_controls = None
    if controls:
        try:
            parsed = json.loads(controls)
            if not isinstance(parsed, list):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Controls must be a JSON array")
            custom_controls = [ToolControl.model_validate(c) for c in parsed]
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid controls JSON: {exc}") from exc
    effective_user_id = user_id or (current_user.id if current_user else None)
    effective_author = author_username or (current_user.username if current_user else None)
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
    current_user: Optional[UserResponse] = Depends(get_optional_user),
) -> ToolDetail:
    """Create a tool with optional user-customized controls via JSON payload."""
    raw_workflow = req.workflow_api
    if isinstance(raw_workflow, dict):
        payload = json.dumps(raw_workflow).encode("utf-8")
    elif isinstance(raw_workflow, str):
        payload = raw_workflow.encode("utf-8")
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid workflow_api format")
    effective_user_id = req.user_id or (current_user.id if current_user else None)
    effective_author = req.author_username or (current_user.username if current_user else None)
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
async def delete_tool_endpoint(tool_id: str) -> DeleteToolResponse:
    try:
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
    uploads = ([input_image] if input_image else []) + [file for file in (files or []) if file.filename]
    submitted_image_ids = image_control_ids or []
    if len(submitted_image_ids) != len(uploads):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Each input image must name one image control")
    if len(set(submitted_image_ids)) != len(submitted_image_ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Duplicate image control")
    for upload, field_id in zip(uploads, submitted_image_ids):
        if field_id not in image_ids:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unknown image control")
        if field_id in uploaded_images:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Duplicate image control")
        if upload.content_type not in ALLOWED_IMAGE_MIME:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported input image type")
        image_data = await upload.read(settings.UPLOAD_MAX_BYTES + 1)
        if len(image_data) > settings.UPLOAD_MAX_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Input image is too large")
        try:
            uploaded_images[field_id] = await comfy.upload_image(image_data, upload.filename or "input.png", upload.content_type or "image/png")
        except ComfyClientError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if detail.requires_image and len(uploaded_images) != len(image_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="All input image controls are required")
    try:
        graph, resolved = tools.build_graph(tool_id, prompt, chosen_ratio, values=values, images=uploaded_images)
        session_id = client_id or f"tool-{uuid.uuid4().hex}"
        started = time.monotonic()
        prompt_id = await comfy.queue_prompt(graph, session_id)
        final_status = await comfy.wait_until_done(prompt_id, session_id)
    except AIToolError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ComfyClientError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    elapsed_ms = int((time.monotonic() - started) * 1000)
    if final_status != "completed":
        return ToolExecutionResult(tool_id=tool_id, prompt_id=prompt_id, status=final_status, images=[], error=final_status, elapsed_ms=elapsed_ms, tool_mode=detail.mode, aspect_ratio=chosen_ratio)
    assets: list[UploadedAsset] = []
    kind = detail.output_kind
    metadata_base = {"origin": "ai_tool_studio", "source": "tool", "tool_id": tool_id, "tool_name": detail.name, "tool_type": detail.mode.value, "tool_mode": detail.mode.value, "kind": kind, "gallery_saved": save_to_gallery, "prompt": prompt, "aspect_ratio": chosen_ratio.value, "width": resolved["width"], "height": resolved["height"], "prompt_id": prompt_id, "created_at": datetime.now(timezone.utc).isoformat(), "elapsed_ms": elapsed_ms, "controls": values or {}, "tags": ["ai_tool_studio", detail.mode.value]}
    try:
        for output in await comfy.list_output_files(prompt_id, kind):
            blob = await comfy.fetch_image_bytes(output)
            url = await storage.upload_asset(blob, prompt_id, output["filename"], metadata={**metadata_base, "source_filename": output["filename"]}, namespace=f"tools/{tool_id}")
            assets.append(UploadedAsset(filename=output["filename"], url=url, kind=kind, saved=save_to_gallery))
    except (ComfyClientError, StorageError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="AI Tool output retrieval failed") from exc
    return ToolExecutionResult(tool_id=tool_id, prompt_id=prompt_id, status="completed", images=assets, error=None, elapsed_ms=elapsed_ms, tool_mode=detail.mode, aspect_ratio=chosen_ratio)


@app.post("/api/tools/execute", response_model=ToolExecutionResult)
async def execute_tool(req: ToolExecuteRequest) -> ToolExecutionResult:
    return await _run_tool(req.tool_id, req.prompt, req.aspect_ratio, None, req.values, client_id=req.client_id, save_to_gallery=req.save_to_gallery)


@app.post("/api/tools/{tool_id}/run", response_model=ToolExecutionResult)
async def run_tool(
    tool_id: str,
    prompt: str = Form(""),
    aspect_ratio: ToolAspectRatio | None = Form(None),
    values: str = Form("{}"),
    image_control_ids: str = Form("[]"),
    client_id: str | None = Form(None),
    save_to_gallery: bool = Form(True),
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> ToolExecutionResult:
    try:
        parsed_values = json.loads(values)
        parsed_image_ids = json.loads(image_control_ids)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Values and image control IDs must be valid JSON") from exc
    if not isinstance(parsed_values, dict) or not isinstance(parsed_image_ids, list) or not all(isinstance(item, str) for item in parsed_image_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Values must be an object and image control IDs an array")
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
    )

@app.get("/api/tools/{tool_id}/thumbnail")
async def tool_thumbnail(tool_id: str) -> FileResponse:
    try:
        return FileResponse(get_ai_tool_service().thumbnail_path(tool_id))
    except AIToolNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tool thumbnail not found") from exc


@app.get("/api/tools/{tool_id}/files/{relative_path:path}")
async def tool_file(tool_id: str, relative_path: str) -> FileResponse:
    """Serve tool outputs through a tool-specific namespace."""
    try:
        path = get_ai_tool_service().output_path(tool_id, relative_path)
    except AIToolNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tool output not found") from exc
    return FileResponse(path)


@app.websocket("/api/v1/ws/progress/{client_id}")
async def ws_progress(websocket: WebSocket, client_id: str) -> None:
    """Relay ComfyUI execution events for a given client_id to the browser."""
    await websocket.accept()
    import websockets

    logger.info("WS progress channel opened for %s", client_id)
    try:
        url = f"{settings.comfy_ws}/ws?clientId={client_id}"
        async with websockets.connect(url, max_size=64 * 1024 * 1024) as upstream:
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
            await websocket.send_text(json.dumps({"type": "error", "message": f"Relay lost: {exc}"}))
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
) -> GalleryResponse:
    if limit < 1 or limit > settings.GALLERY_LIMIT:
        limit = settings.GALLERY_LIMIT
    try:
        import asyncio

        parsed_tags = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
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
                user_id=user_id,
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
    items, total = get_db().get_paginated_generations(user_id=user_id, model_id=model_id, page=page, limit=limit)
    return PaginatedGenerationsResponse.create(
        items=[GenerationRecordResponse(**item) for item in items],
        total=total,
        page=page,
        limit=limit,
    )


@app.get("/api/v1/tags", response_model=TagSummaryList)
async def list_popular_tags(limit: int = 50) -> TagSummaryList:
    if limit < 1 or limit > 200:
        limit = 50
    tags = storage.list_popular_tags(limit=limit)
    return TagSummaryList(items=[TagSummary(**item) for item in tags])


@app.post("/api/v1/tagger/interrogate", response_model=TagInterrogateResponse)
async def interrogate_image(file: UploadFile = File(...)) -> TagInterrogateResponse:
    started = time.monotonic()
    content = await file.read(25 * 1024 * 1024)
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty image file")
    tagger = get_tagger_service()
    try:
        tags = await tagger.interrogate_image(content, filename=file.filename or "image.png")
    except TaggerError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    elapsed_ms = int((time.monotonic() - started) * 1000)
    return TagInterrogateResponse(tags=tags, elapsed_ms=elapsed_ms)


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
async def save_asset(key: str, saved: bool) -> GalleryItem:
    try:
        return storage.set_saved(key, saved)
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/api/v1/images/{key:path}", response_model=GalleryItem)
async def image_detail(key: str) -> GalleryItem:
    return await asset_detail(key)


@app.delete("/api/v1/gallery/{key:path}", response_model=DeleteAssetResponse)
async def delete_gallery_asset(key: str) -> DeleteAssetResponse:
    try:
        storage.delete_asset(key)
        return DeleteAssetResponse(deleted=True, key=key)
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found") from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.delete("/api/v1/assets/{key:path}", response_model=DeleteAssetResponse)
async def delete_asset_endpoint(key: str) -> DeleteAssetResponse:
    return await delete_gallery_asset(key)
