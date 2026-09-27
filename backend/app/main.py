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

from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .schemas import (
    GenerateRequest,
    GenerationResult,
    GalleryItem,
    GalleryResponse,
    HealthResponse,
    ToolAspectRatio,
    ToolCatalogResponse,
    ToolDetail,
    ToolExecutionResult,
    ToolMode,
    ToolExecuteRequest,
    ToolParseResponse,
    UploadedAsset,
)
from .services.ai_tools import AIToolError, AIToolNotFound, get_ai_tool_service
from .services.comfy_client import ComfyClientError, get_comfy_client
from .services.storage import StorageError, StorageService, get_storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("comfy_studio")

settings = get_settings()
storage = get_storage()
storage.ensure_root()

app = FastAPI(title=settings.APP_NAME, version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_origin_regex=settings.origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    return HealthResponse(
        status="ok" if (comfy_ok and storage_ok) else "degraded",
        comfy="up" if comfy_ok else "down",
        storage="up" if storage_ok else "down",
    )


MODEL_CATEGORIES = {"diffusion_models", "text_encoders", "vae", "loras"}


@app.get("/api/v1/models/{category}", response_model=list[str])
async def models(category: str) -> list[str]:
    if category not in MODEL_CATEGORIES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown model category")
    try:
        return await get_comfy_client().list_models(category)
    except ComfyClientError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ---------------------------------------------------------------------- #
# Generation
# ---------------------------------------------------------------------- #


@app.post("/api/v1/generate", response_model=GenerationResult)
async def generate(req: GenerateRequest) -> GenerationResult:
    """Queue a workflow on ComfyUI, wait for completion, save images to disk."""
    if req.mode != "text-to-image":
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED,
            detail="Image-to-Image generation is not implemented yet",
        )

    comfy = get_comfy_client()
    client_id = req.client_id or str(uuid.uuid4())
    resolved_seed = req.seed if req.seed is not None else random.randint(0, 2**32 - 1)
    started = time.monotonic()

    try:
        graph = comfy.build_workflow(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            model=req.model,
            seed=resolved_seed,
            steps=req.steps,
            image_count=req.image_count,
            cfg=req.cfg,
            denoise=req.denoise,
            aspect_ratio=req.aspect_ratio,
            style=req.style,
            unet_name=req.unet_name,
            clip_name=req.clip_name,
            vae_name=req.vae_name,
            loras=[item.model_dump() for item in req.loras],
            width=req.width,
            height=req.height,
        )
        prompt_id = await comfy.queue_prompt(graph, client_id)
        final_status = await comfy.wait_until_done(prompt_id, client_id)
    except ComfyClientError as exc:
        logger.error("ComfyUI error: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    elapsed_ms = int((time.monotonic() - started) * 1000)
    if final_status != "completed":
        return GenerationResult(
            prompt_id=prompt_id, status=final_status, images=[], error=final_status, elapsed_ms=elapsed_ms
        )

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
        "loras": [item.model_dump() for item in req.loras],
        "width": req.width,
        "height": req.height,
        "format_name": req.format_name,
        "unet_name": req.unet_name,
        "clip_name": req.clip_name,
        "vae_name": req.vae_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_ms": elapsed_ms,
    }
    try:
        for image in await comfy.list_images(prompt_id):
            blob = await comfy.fetch_image_bytes(image)
            url = await storage.upload_image(
                blob,
                prompt_id,
                image["filename"],
                metadata={**metadata, "source_filename": image["filename"]},
            )
            assets.append(UploadedAsset(filename=image["filename"], url=url))
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
    try:
        summary = get_ai_tool_service().create(
            payload, name, mode, aspect_ratio, thumbnail_data, thumbnail_ext
        )
        return get_ai_tool_service().detail(summary.tool_id)
    except AIToolError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/api/tools", response_model=ToolCatalogResponse)
async def list_tools() -> ToolCatalogResponse:
    return ToolCatalogResponse(items=get_ai_tool_service().list_public())


@app.get("/api/tools/{tool_id}", response_model=ToolDetail)
async def get_tool(tool_id: str) -> ToolDetail:
    try:
        return get_ai_tool_service().detail(tool_id)
    except AIToolNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tool not found") from exc
    except AIToolError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


async def _run_tool(
    tool_id: str,
    prompt: str,
    aspect_ratio: ToolAspectRatio | None,
    input_image: UploadFile | None,
) -> ToolExecutionResult:
    tools = get_ai_tool_service()
    try:
        record = tools.get(tool_id)
        detail = tools.detail(tool_id)
        chosen_ratio = aspect_ratio or ToolAspectRatio(record["default_aspect_ratio"])
    except (AIToolNotFound, ValueError) as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tool not found") from exc
    if detail.has_prompt and not prompt.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Prompt is required for this tool")
    if not detail.has_prompt:
        prompt = ""
    comfy = get_comfy_client()
    uploaded_name: str | None = None
    if detail.requires_image:
        if input_image is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Input image is required")
        if input_image.content_type not in ALLOWED_IMAGE_MIME:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported input image type")
        image_data = await input_image.read(settings.UPLOAD_MAX_BYTES + 1)
        if len(image_data) > settings.UPLOAD_MAX_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Input image is too large")
        try:
            uploaded_name = await comfy.upload_image(image_data, input_image.filename or "input.png", input_image.content_type or "image/png")
        except ComfyClientError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    elif input_image is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="This tool does not accept an input image")
    try:
        graph, resolved = tools.build_graph(tool_id, prompt, chosen_ratio, uploaded_name)
        client_id = f"tool-{uuid.uuid4().hex}"
        started = time.monotonic()
        prompt_id = await comfy.queue_prompt(graph, client_id)
        final_status = await comfy.wait_until_done(prompt_id, client_id)
    except (AIToolError, ComfyClientError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    elapsed_ms = int((time.monotonic() - started) * 1000)
    if final_status != "completed":
        return ToolExecutionResult(tool_id=tool_id, prompt_id=prompt_id, status=final_status, images=[], error=final_status, elapsed_ms=elapsed_ms, tool_mode=detail.mode, aspect_ratio=chosen_ratio)
    assets: list[UploadedAsset] = []
    metadata_base = {
        "origin": "ai_tool_studio", "source": "tool", "tool_id": tool_id,
        "tool_name": detail.name, "tool_type": detail.mode.value,
        "tool_mode": detail.mode.value, "prompt": prompt,
        "aspect_ratio": chosen_ratio.value, "width": resolved["width"],
        "height": resolved["height"], "prompt_id": prompt_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_ms": elapsed_ms, "tags": ["ai_tool_studio", detail.mode.value],
    }
    try:
        for image in await comfy.list_images(prompt_id):
            blob = await comfy.fetch_image_bytes(image)
            url = await storage.upload_image(
                blob, prompt_id, image["filename"],
                metadata={**metadata_base, "source_filename": image["filename"]},
                namespace=f"tools/{tool_id}",
            )
            assets.append(UploadedAsset(filename=image["filename"], url=url))
    except (ComfyClientError, StorageError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="AI Tool output retrieval failed") from exc
    return ToolExecutionResult(tool_id=tool_id, prompt_id=prompt_id, status="completed", images=assets, error=None, elapsed_ms=elapsed_ms, tool_mode=detail.mode, aspect_ratio=chosen_ratio)


@app.post("/api/tools/execute", response_model=ToolExecutionResult)
async def execute_tool(req: ToolExecuteRequest) -> ToolExecutionResult:
    return await _run_tool(req.tool_id, req.prompt, req.aspect_ratio, None)


@app.post("/api/tools/{tool_id}/run", response_model=ToolExecutionResult)
async def run_tool(
    tool_id: str,
    prompt: str = Form(""),
    aspect_ratio: ToolAspectRatio | None = Form(None),
    input_image: UploadFile | None = File(None),
) -> ToolExecutionResult:
    return await _run_tool(tool_id, prompt, aspect_ratio, input_image)


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
async def gallery(limit: int = 60) -> GalleryResponse:
    if limit < 1 or limit > settings.GALLERY_LIMIT:
        limit = settings.GALLERY_LIMIT
    try:
        import asyncio

        items = await asyncio.get_running_loop().run_in_executor(
            None, lambda: storage.list_recent(limit=limit)
        )
    except StorageError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return GalleryResponse(items=items)


@app.get("/api/v1/images/{key:path}", response_model=GalleryItem)
async def image_detail(key: str) -> GalleryItem:
    try:
        return storage.get_image(key)
    except FileNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Image not found") from exc
    except StorageError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
