"""Durable local storage for creator-managed model metadata and uploads."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Any

from ..config import Settings, get_settings
from ..db import get_db
from ..schemas import (
    ModelCompatibility,
    ModelCreateRequest,
    ModelFilePatchRequest,
    ModelFileResponse,
    ModelGenerationSettings,
    ModelModerationStatus,
    ModelPendingReviewItem,
    ModelPendingReviewQueueResponse,
    ModelPermissions,
    ModelPrecision,
    ModelPublishRequest,
    ModelResponse,
    ModelReviewAction,
    ModelReviewRequest,
    ModelReviewResponse,
    ModelSampleResponse,
    ModelUpdateRequest,
    ModelVersionCreateRequest,
    ModelVersionResponse,
    ModelVisibility,
)
from app.services.model_factory import ModelHandlerFactory, ModelTier

MODEL_ID_RE = re.compile(r"^[0-9a-f]{32}$")
MODEL_EXTENSIONS = {".safetensors", ".sft", ".ckpt", ".pt", ".pth", ".bin", ".gguf"}
SAMPLE_EXTENSIONS = {
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".webp": "image",
    ".gif": "image",
    ".mp4": "video",
    ".webm": "video",
    ".mov": "video",
}
LOCAL_MODEL_CATEGORIES = (
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
)
ADAPTER_MODEL_TYPES = {
    m for m in ModelHandlerFactory.all_types() if ModelHandlerFactory.is_adapter(m)
}
BASE_MODEL_TYPES = {"Checkpoint", "SVD", "Diffusion Model"}
SUPPORTED_GENERATION_TYPES = {
    m for m in ModelHandlerFactory.all_types() if ModelHandlerFactory.is_generation_supported(m)
} | {"Diffusion Model"}


class ModelError(RuntimeError):
    pass


class ModelNotFound(ModelError):
    pass


class ModelConflict(ModelError):
    pass


logger = logging.getLogger("solotensor.models")


class ModelService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.root = Path(self.settings.MODELS_DIR).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.definitions = self.root / "definitions"
        self.definitions.mkdir(parents=True, exist_ok=True)

    def _sync_to_db(self, record: dict[str, Any]) -> None:
        try:
            get_db().upsert_model(record)
        except Exception as exc:
            logger.warning("Could not sync model to database: %s", exc)

    def _delete_from_db(self, model_id: str) -> None:
        try:
            get_db().delete_model(model_id)
        except Exception as exc:
            logger.warning("Could not delete model from database: %s", exc)

    def ensure_root(self) -> None:
        self.definitions.mkdir(parents=True, exist_ok=True)

    def _path(self, model_id: str) -> Path:
        if not MODEL_ID_RE.fullmatch(model_id):
            raise ModelNotFound("Invalid model id")
        return self.definitions / f"{model_id}.json"

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _clean_relative_filename(filename: str) -> str:
        path = Path(filename.replace("\\", "/"))
        if (
            path.is_absolute()
            or not path.parts
            or ".." in path.parts
            or any(not part or part in {".", ".."} for part in path.parts)
        ):
            raise ModelError("Invalid model filename")
        value = "/".join(path.parts)
        if len(value) > 512:
            raise ModelError("Invalid model filename")
        return value

    @staticmethod
    def _clean_filename(filename: str) -> str:
        name = Path(filename or "upload").name
        if not name or name in {".", ".."} or len(name) > 180:
            raise ModelError("Invalid filename")
        return name

    def _write(self, record: dict[str, Any]) -> None:
        path = self._path(record["model_id"])
        temp = path.with_suffix(".tmp")
        try:
            temp.write_text(
                json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            temp.replace(path)
        except OSError as exc:
            raise ModelError("Could not save model metadata") from exc

    def _read(self, model_id: str) -> dict[str, Any]:
        path = self._path(model_id)
        if not path.is_file():
            raise ModelNotFound("Model not found")
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ModelError("Stored model is unreadable") from exc
        if not isinstance(record, dict) or record.get("model_id") != model_id:
            raise ModelError("Stored model is invalid")
        if record.get("model_type") in ("UNET", "Diffusion Model"):
            record["model_type"] = "Checkpoint"
        compatibility = record.get("compatibility")
        if isinstance(compatibility, dict):
            legacy = compatibility.pop("text_encoders", None)
            if (
                "text_encoder" not in compatibility
                and isinstance(legacy, list)
                and legacy
            ):
                compatibility["text_encoder"] = legacy[0]
            compatibility.setdefault("text_encoder", None)
            compatibility.setdefault("clip_type", None)
        if "compatibility" not in record or not isinstance(record.get("compatibility"), dict):
            record["compatibility"] = ModelCompatibility().model_dump()
        if "generation" not in record or not isinstance(record.get("generation"), dict):
            record["generation"] = ModelGenerationSettings().model_dump()
        if "permissions" not in record or not isinstance(record.get("permissions"), dict):
            record["permissions"] = ModelPermissions().model_dump()
        if "moderation_status" not in record:
            record["moderation_status"] = ModelModerationStatus.APPROVED.value
        if "moderation_notes" not in record:
            record["moderation_notes"] = None
        return record

    def _version(self, record: dict[str, Any], version_id: str) -> dict[str, Any]:
        for version in record.get("versions", []):
            if version.get("version_id") == version_id:
                return version
        raise ModelNotFound("Model version not found")

    def _file_url(self, model_id: str, version_id: str, file_id: str) -> str:
        return f"{self.settings.FILES_PUBLIC_BASE}/api/v1/models/id/{model_id}/versions/{version_id}/files/{file_id}/download"

    def _sample_url(self, model_id: str, version_id: str, sample_id: str) -> str:
        return f"{self.settings.FILES_PUBLIC_BASE}/api/v1/models/id/{model_id}/versions/{version_id}/samples/{sample_id}/download"

    def _public_file_url(self, model_id: str, version_id: str, file_id: str) -> str:
        return f"{self.settings.FILES_PUBLIC_BASE}/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/download"

    def _public_sample_url(self, model_id: str, version_id: str, sample_id: str) -> str:
        return f"{self.settings.FILES_PUBLIC_BASE}/api/v1/models/public/{model_id}/versions/{version_id}/samples/{sample_id}/download"

    def _response(
        self, record: dict[str, Any], *, public_urls: bool = False
    ) -> ModelResponse:
        versions: list[ModelVersionResponse] = []
        for version in record.get("versions", []):
            files = [
                ModelFileResponse(
                    **{
                        key: item[key]
                        for key in (
                            "file_id",
                            "filename",
                            "size",
                            "sha256",
                            "precision",
                            "visible",
                        )
                    },
                    category=item.get("category"),
                    download_url=(
                        self._public_file_url(
                            record["model_id"], version["version_id"], item["file_id"]
                        )
                        if public_urls
                        else self._file_url(
                            record["model_id"], version["version_id"], item["file_id"]
                        )
                    ),
                )
                for item in version.get("files", [])
            ]
            samples = [
                ModelSampleResponse(
                    sample_id=item["sample_id"],
                    filename=item["filename"],
                    url=(
                        self._public_sample_url(
                            record["model_id"], version["version_id"], item["sample_id"]
                        )
                        if public_urls
                        else self._sample_url(
                            record["model_id"], version["version_id"], item["sample_id"]
                        )
                    ),
                    kind=item["kind"],
                    metadata=item.get("metadata", {}),
                )
                for item in version.get("samples", [])
            ]
            versions.append(
                ModelVersionResponse(
                    version_id=version["version_id"],
                    name=version["name"],
                    created_at=version["created_at"],
                    files=files,
                    samples=samples,
                )
            )

        user_id = record.get("user_id")
        author_username = None
        author_display_name = None
        author_avatar_url = None
        if user_id:
            try:
                user = get_db().get_user_by_id(user_id)
                if user:
                    author_username = user.get("username")
                    author_display_name = user.get("display_name") or user.get("username")
                    author_avatar_url = user.get("avatar_url")
            except Exception as exc:
                logger.warning("Could not resolve author info for user %s: %s", user_id, exc)

        return ModelResponse(
            model_id=record["model_id"],
            user_id=user_id,
            title=record["title"],
            category=record["category"],
            model_type=record["model_type"],
            description=record.get("description", "") or "",
            author_username=author_username,
            author_display_name=author_display_name,
            author_avatar_url=author_avatar_url,
            tags=record.get("tags", []),
            compatibility=record["compatibility"],
            generation=record["generation"],
            permissions=record["permissions"],
            visibility=record["visibility"],
            created_at=record["created_at"],
            updated_at=record["updated_at"],
            published_at=record.get("published_at"),
            versions=versions,
            moderation_status=record.get("moderation_status", ModelModerationStatus.APPROVED.value),
            moderation_notes=record.get("moderation_notes"),
        )

    def _validate_base_association(
        self,
        model_type: str,
        compatibility: dict[str, Any],
        *,
        require_public: bool = False,
    ) -> None:
        if not ModelHandlerFactory.is_adapter(model_type):
            return
        base_ids = tuple(compatibility.get(key) for key in ("base_model_id", "base_version_id", "base_file_id"))
        if any(value is None for value in base_ids):
            raise ModelConflict("Adapter models require a concrete base model")
        base_record = self._read(base_ids[0])
        if require_public and (base_record.get("visibility") != "Public" or not base_record.get("published_at")):
            raise ModelConflict("The adapter base model must be public before publishing this adapter")
        if not ModelHandlerFactory.is_base_model(base_record.get("model_type", "")):
            raise ModelConflict("Adapter base must be a Checkpoint or SVD model")
        base_version = self._version(base_record, base_ids[1])
        base_file = next((item for item in base_version.get("files", []) if item.get("file_id") == base_ids[2]), None)
        if base_file is None or not base_file.get("visible", False):
            raise ModelConflict("The configured adapter base file is unavailable")
        if require_public:
            self.resolve_installed_gallery_file(*base_ids)

    def create(
        self,
        payload: ModelCreateRequest,
        user_id: str | None = None,
        is_moderator: bool = False,
    ) -> ModelResponse:
        model_id = uuid.uuid4().hex
        now = self._now()
        version_id = uuid.uuid4().hex
        effective_user_id = user_id or getattr(payload, "user_id", None)
        dumped = payload.model_dump(mode="json")
        if "compatibility" in dumped and dumped["compatibility"]:
            m_type = payload.model_type.value if hasattr(payload.model_type, "value") else str(payload.model_type)
            dumped["compatibility"] = ModelHandlerFactory.sanitize_compatibility(m_type, dumped["compatibility"])

        raw_vis = payload.visibility
        is_public = (
            raw_vis == ModelVisibility.PUBLIC
            or raw_vis == ModelVisibility.PUBLIC.value
            or str(raw_vis).lower() == "public"
        )
        if is_public:
            if is_moderator:
                mod_status = ModelModerationStatus.APPROVED.value
                published_at = now
            else:
                mod_status = ModelModerationStatus.PENDING_REVIEW.value
                published_at = None
        else:
            mod_status = ModelModerationStatus.DRAFT.value
            published_at = None

        record = {
            **dumped,
            "model_id": model_id,
            "created_at": now,
            "updated_at": now,
            "published_at": published_at,
            "moderation_status": mod_status,
            "moderation_notes": None,
            "versions": [
                {
                    "version_id": version_id,
                    "name": "v1.0",
                    "created_at": now,
                    "files": [],
                    "samples": [],
                }
            ],
        }
        if effective_user_id:
            record["user_id"] = effective_user_id
        (self.root / model_id / version_id / "files").mkdir(parents=True, exist_ok=True)
        (self.root / model_id / version_id / "samples").mkdir(
            parents=True, exist_ok=True
        )
        self._write(record)
        self._sync_to_db(record)
        return self._response(record)

    def get(self, model_id: str, *, public: bool = False) -> ModelResponse:
        record = self._read(model_id)
        if public and record.get("visibility") != "Public":
            raise ModelNotFound("Model not found")
        return self._response(record)

    def list(
        self,
        *,
        visibility: str | None = None,
        query: str | None = None,
        public: bool = False,
        user_id: str | None = None,
    ) -> list[ModelResponse]:
        items: list[ModelResponse] = []
        for path in self.definitions.glob("*.json"):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(record, dict):
                    continue
                if user_id and record.get("user_id") != user_id:
                    continue
                if public and (
                    record.get("visibility") != "Public"
                    or not record.get("published_at")
                ):
                    continue
                if visibility and record.get("visibility") != visibility:
                    continue
                if query and query.lower() not in str(record.get("title", "")).lower():
                    continue
                items.append(self._response(record, public_urls=public))
            except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
        return sorted(items, key=lambda item: item.updated_at, reverse=True)

    def update(self, model_id: str, payload: ModelUpdateRequest) -> ModelResponse:
        record = self._read(model_id)
        changes = payload.model_dump(mode="json", exclude_unset=True)
        for key, value in changes.items():
            if isinstance(value, dict) and isinstance(record.get(key), dict):
                record[key] = {**record[key], **value}
            else:
                record[key] = value
        if "compatibility" in record and record["compatibility"]:
            record["compatibility"] = ModelHandlerFactory.sanitize_compatibility(
                record.get("model_type", ""),
                record["compatibility"],
            )
        self._validate_base_association(record.get("model_type", ""), record.get("compatibility", {}))
        record["updated_at"] = self._now()
        self._write(record)
        self._sync_to_db(record)
        return self._response(record)

    def public_response(self, model_id: str) -> ModelResponse:
        record = self._read(model_id)
        if record.get("visibility") != "Public" or not record.get("published_at"):
            raise ModelNotFound("Model not found")
        response = self._response(record, public_urls=True)
        response.versions = [
            version.model_copy(
                update={"files": [item for item in version.files if item.visible]}
            )
            for version in response.versions
        ]
        return response

    def public_list(self, query: str | None = None, user_id: str | None = None) -> list[ModelResponse]:
        return self.list(query=query, public=True, user_id=user_id)

    list_public = public_list

    def list_pending_review(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for path in self.definitions.glob("*.json"):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(record, dict):
                    continue
                if record.get("moderation_status") != ModelModerationStatus.PENDING_REVIEW.value:
                    continue
                author_id = record.get("user_id") or ""
                author_username = None
                author_display_name = None
                author_avatar_url = None
                author_role = None
                if author_id:
                    try:
                        u = get_db().get_user_by_id(author_id)
                        if u:
                            author_username = u.get("username")
                            author_display_name = u.get("display_name") or u.get("username")
                            author_avatar_url = u.get("avatar_url")
                            author_role = u.get("role")
                    except Exception as exc:
                        logger.warning("Could not resolve author info for user %s: %s", author_id, exc)

                resp = self._response(record)
                cover_url = None
                for v in resp.versions:
                    if v.samples:
                        cover_url = v.samples[0].url
                        break

                compat = record.get("compatibility") or {}
                base_model = compat.get("base_model") or "Stable Diffusion XL (SDXL)"

                item = ModelPendingReviewItem(
                    model_id=record["model_id"],
                    title=record.get("title", ""),
                    category=record.get("category", "Checkpoints"),
                    model_type=record.get("model_type", "Checkpoint"),
                    description=record.get("description", "") or "",
                    author_id=author_id,
                    author_username=author_username,
                    author_display_name=author_display_name,
                    author_avatar_url=author_avatar_url,
                    author_role=author_role,
                    created_at=record.get("created_at", self._now()),
                    updated_at=record.get("updated_at", self._now()),
                    tags=record.get("tags", []),
                    base_model=base_model,
                    permissions=record.get("permissions", {}),
                    version_count=len(resp.versions),
                    file_count=sum(len(v.files) for v in resp.versions),
                    sample_count=sum(len(v.samples) for v in resp.versions),
                    cover_url=cover_url,
                    versions=resp.versions,
                    moderation_status=record.get("moderation_status", ModelModerationStatus.PENDING_REVIEW.value),
                    moderation_notes=record.get("moderation_notes"),
                )
                items.append(item.model_dump(mode="json"))
            except Exception as exc:
                logger.warning("Could not parse pending model from %s: %s", path, exc)
                continue
        return sorted(items, key=lambda x: x.get("created_at", ""), reverse=True)

    def review_model(
        self,
        model_id: str,
        action: str,
        notes: str | None = None,
        install_to_comfy: bool = False,
        version_id: str | None = None,
        file_id: str | None = None,
    ) -> dict[str, Any]:
        record = self._read(model_id)
        action_lower = action.lower()
        reviewed_at = datetime.now(timezone.utc).isoformat()
        now_str = self._now()

        if action_lower == "approve":
            new_status = ModelModerationStatus.APPROVED.value
            record["visibility"] = "Public"
            record["published_at"] = reviewed_at
        elif action_lower == "reject":
            new_status = ModelModerationStatus.REJECTED.value
            record["visibility"] = "Private"
            record["published_at"] = None
        elif action_lower == "request_changes":
            new_status = ModelModerationStatus.DRAFT.value
            record["visibility"] = "Private"
            record["published_at"] = None
        else:
            raise ModelConflict(f"Invalid review action: {action}")

        record["moderation_status"] = new_status
        record["moderation_notes"] = notes
        record["reviewed_at"] = reviewed_at
        record["updated_at"] = now_str
        self._write(record)
        self._sync_to_db(record)

        installed = False
        installed_file = None

        if install_to_comfy and action_lower == "approve" and version_id and file_id:
            install_res = self.install_file(model_id, version_id, file_id)
            installed = install_res.get("installed", False)
            installed_file = install_res.get("destination") or install_res.get("filename")

        return {
            "model_id": model_id,
            "moderation_status": new_status,
            "moderation_notes": notes,
            "action_taken": action,
            "installed": installed,
            "installed_file": installed_file,
            "reviewed_at": reviewed_at,
        }

    def resolve_installed_gallery_file(
        self,
        model_id: str,
        version_id: str,
        file_id: str,
        verify_hash: bool = True,
    ) -> dict[str, Any]:
        record = self._read(model_id)
        if record.get("visibility") != "Public" or not record.get("published_at"):
            raise ModelNotFound("Model not found")
        model_type = record.get("model_type")
        if model_type not in SUPPORTED_GENERATION_TYPES:
            raise ModelConflict(
                "Only Checkpoint, SVD, LoRA, and adapter gallery models can generate"
            )
        version = self._version(record, version_id)
        item = next(
            (
                entry
                for entry in version.get("files", [])
                if entry.get("file_id") == file_id
            ),
            None,
        )
        if item is None or not item.get("visible", False):
            raise ModelNotFound("Model file not found")
        filename = self._clean_relative_filename(item["filename"])
        root = self._comfy_root()

        candidate_folders: list[str] = []
        item_cat = item.get("category")
        if item_cat:
            candidate_folders.append(item_cat)

        if model_type == "Checkpoint":
            for cat in ("checkpoints", "diffusion_models"):
                if cat not in candidate_folders:
                    candidate_folders.append(cat)
        else:
            default_cat = self.install_category(model_type)
            if default_cat not in candidate_folders:
                candidate_folders.append(default_cat)

        found_category: str | None = None
        found_destination: Path | None = None

        for cat in candidate_folders:
            cat_path = root / "models" / cat
            cat_root = cat_path.resolve()
            if cat_root != cat_path or not cat_root.is_dir():
                continue
            cand_dest = (cat_root / filename).resolve()
            if cand_dest != cat_root and cat_root not in cand_dest.parents:
                raise ModelError("Unsafe ComfyUI model path")
            if cand_dest.is_file() and not cand_dest.is_symlink():
                found_category = cat
                found_destination = cand_dest
                break

        if found_category is None or found_destination is None:
            raise ModelConflict("Gallery model file is not installed")

        if verify_hash:
            digest = hashlib.sha256()
            try:
                with found_destination.open("rb") as source:
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
            except OSError as exc:
                raise ModelError("Installed model file is unreadable") from exc
            if digest.hexdigest() != item.get("sha256"):
                raise ModelConflict(
                    "Installed model file does not match the gallery version"
                )
        elif found_destination.stat().st_size != item.get("size"):
            raise ModelConflict("Gallery model file is not installed")
        compatibility = record.get("compatibility", {})
        cover_url = None
        for ver in record.get("versions", []):
            for sample in ver.get("samples", []):
                if sample.get("sample_id"):
                    cover_url = self._public_sample_url(
                        model_id, ver.get("version_id", version_id), sample["sample_id"]
                    )
                    break
            if cover_url:
                break
        return {
            "model_id": model_id,
            "version_id": version_id,
            "file_id": file_id,
            "title": record["title"],
            "model_type": model_type,
            "version_name": version["name"],
            "filename": filename,
            "category": found_category,
            "sha256": item["sha256"],
            "vae": compatibility.get("vae"),
            "text_encoder": compatibility.get("text_encoder"),
            "clip_type": compatibility.get("clip_type"),
            "base_model_id": compatibility.get("base_model_id"),
            "base_version_id": compatibility.get("base_version_id"),
            "base_file_id": compatibility.get("base_file_id"),
            "cover_url": cover_url,
        }

    def selectable_gallery_files(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for model in self.public_list():
            if model.model_type.value not in SUPPORTED_GENERATION_TYPES:
                continue
            for version in model.versions:
                for item in version.files:
                    try:
                        items.append(
                            self.resolve_installed_gallery_file(
                                model.model_id,
                                version.version_id,
                                item.file_id,
                                verify_hash=False,
                            )
                        )
                    except (ModelError, ModelConflict, ModelNotFound):
                        continue
        base_keys = {
            (item["model_id"], item["version_id"], item["file_id"])
            for item in items
            if item["model_type"] in BASE_MODEL_TYPES
        }
        items = [
            item for item in items
            if item["model_type"] in BASE_MODEL_TYPES
            or (
                item.get("base_model_id"),
                item.get("base_version_id"),
                item.get("base_file_id"),
            ) in base_keys
        ]
        return sorted(
            items,
            key=lambda item: (
                item["model_type"] not in BASE_MODEL_TYPES,
                item["title"].lower(),
                item["version_name"].lower(),
                item["filename"].lower(),
            ),
        )

    @staticmethod
    def install_category(model_type: str) -> str:
        try:
            return ModelHandlerFactory.install_category(model_type)
        except KeyError as exc:
            raise ModelError("Unsupported creator model type") from exc

    def _comfy_root(self) -> Path:
        root_value = self.settings.COMFY_MODEL_ROOT
        if not root_value:
            raise ModelConflict(
                "ComfyUI model browsing is not configured; set COMFY_MODEL_ROOT"
            )
        root = Path(root_value).expanduser().resolve()
        if not root.is_dir():
            raise ModelError("Configured COMFY_MODEL_ROOT does not exist")
        return root

    @staticmethod
    def _local_category(category: str) -> str:
        clean = category.strip().lower()
        if clean not in LOCAL_MODEL_CATEGORIES:
            # If it matches any alias or model type, map it cleanly
            mapping = {
                "checkpoint": "checkpoints",
                "svd": "checkpoints",
                "lora": "loras",
                "lokr": "loras",
                "locon": "loras",
                "lycoris": "loras",
                "dora": "loras",
                "motion lora": "loras",
                "motion_lora": "loras",
                "vae": "vae",
                "controlnet": "controlnet",
                "poses": "poses",
                "pose": "poses",
                "wildcard": "wildcards",
                "wildcards": "wildcards",
                "stylemodel": "style_models",
                "style_model": "style_models",
                "style_models": "style_models",
                "embedding": "embeddings",
                "embeddings": "embeddings",
                "aesthetic gradient": "embeddings",
                "aesthetic_gradient": "embeddings",
                "hyper network": "hypernetworks",
                "hypernetwork": "hypernetworks",
                "hypernetworks": "hypernetworks",
                "diffusion model": "diffusion_models",
                "diffusion_model": "diffusion_models",
                "diffusion_models": "diffusion_models",
            }
            if clean in mapping:
                return mapping[clean]
            raise ModelError("Unsupported ComfyUI model category")
        return clean

    def local_models(
        self, query: str | None = None, category: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        root = self._comfy_root()
        if category:
            cat_list = [c.strip() for c in category.split(",") if c.strip()]
            categories = []
            for c in cat_list:
                try:
                    valid_cat = self._local_category(c)
                    if valid_cat not in categories:
                        categories.append(valid_cat)
                except ModelError:
                    continue
            if not categories:
                raise ModelError("Unsupported ComfyUI model category")
        else:
            categories = list(LOCAL_MODEL_CATEGORIES)
        needle = (query or "").strip().lower()
        limit = max(1, min(limit, 100))
        items: list[dict[str, Any]] = []
        seen_candidates: set[str] = set()
        for name in categories:
            base = (root / "models" / name).resolve()
            if not base.is_dir() or base != root / "models" / name:
                continue
            for path in base.rglob("*"):
                if (
                    not path.is_file()
                    or path.is_symlink()
                    or path.suffix.lower() not in MODEL_EXTENSIONS
                ):
                    continue
                resolved = path.resolve()
                if resolved != base and base not in resolved.parents:
                    continue
                relative = path.relative_to(base).as_posix()
                if needle and needle not in relative.lower():
                    continue
                if len(categories) > 1 and category is not None:
                    if relative in seen_candidates:
                        continue
                    seen_candidates.add(relative)
                items.append(
                    {
                        "category": name,
                        "filename": relative,
                        "size": path.stat().st_size,
                    }
                )
        return sorted(
            items, key=lambda item: (item["category"], item["filename"].lower())
        )[:limit]

    def list_local_models(
        self, query: str | None = None, category: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        return self.local_models(query=query, category=category, limit=limit)

    def import_local_file(
        self,
        model_id: str,
        version_id: str,
        category: str,
        filename: str,
        precision: ModelPrecision,
    ) -> ModelResponse:
        root = self._comfy_root()
        category = self._local_category(category)
        relative = Path(filename)
        if relative.is_absolute() or ".." in relative.parts:
            raise ModelError("Unsafe ComfyUI model filename")
        category_path = root / "models" / category
        category_root = category_path.resolve()
        if category_root != category_path or not category_root.is_dir():
            raise ModelNotFound("Local ComfyUI model category not found")
        candidate = category_root / relative
        source = candidate.resolve()
        if source.parent != category_root and category_root not in source.parents:
            raise ModelError("Unsafe ComfyUI model filename")
        if candidate.is_symlink() or not source.is_file():
            raise ModelNotFound("Local ComfyUI model not found")
        size = source.stat().st_size
        if size == 0:
            raise ModelError("Model file is empty")
        if size > self.settings.MODEL_MAX_BYTES:
            raise ModelError("Model file is too large")

        record = self._read(model_id)
        version = self._version(record, version_id)
        suffix = source.suffix.lower()
        if suffix not in MODEL_EXTENSIONS:
            raise ModelError("Unsupported model file type")

        digest = hashlib.sha256()
        try:
            with source.open("rb") as source_file:
                while chunk := source_file.read(1024 * 1024):
                    digest.update(chunk)
        except OSError as exc:
            raise ModelError("Could not read local ComfyUI model file") from exc

        # Registered in place: no copy is made, the stored hash+size track the
        # original ComfyUI file and "Install to ComfyUI" restores the same
        # category path if it is later removed.
        file_id = uuid.uuid4().hex
        version.setdefault("files", []).append(
            {
                "file_id": file_id,
                "filename": self._clean_relative_filename(relative.as_posix()),
                "size": size,
                "sha256": digest.hexdigest(),
                "precision": precision.value,
                "visible": True,
                "stored_name": "",
                "category": category,
            }
        )
        record["updated_at"] = self._now()
        self._write(record)
        self._sync_to_db(record)
        return self._response(record)

    def install_file(
        self, model_id: str, version_id: str, file_id: str
    ) -> dict[str, Any]:
        record = self._read(model_id)
        if record.get("visibility") != "Public" or not record.get("published_at"):
            raise ModelNotFound("Model not found")
        version = self._version(record, version_id)
        item = next(
            (
                entry
                for entry in version.get("files", [])
                if entry.get("file_id") == file_id
            ),
            None,
        )
        if item is None:
            raise ModelNotFound("Model file not found")
        if not item.get("visible", False):
            raise ModelConflict("Model file is not public")
        root_value = self.settings.COMFY_MODEL_ROOT
        if not root_value:
            raise ModelConflict(
                "ComfyUI installation is not configured; set COMFY_MODEL_ROOT"
            )
        root = Path(root_value).expanduser().resolve()
        if not root.is_dir():
            raise ModelError("Configured COMFY_MODEL_ROOT does not exist")
        if item.get("category") == "diffusion_models":
            category = "diffusion_models"
        else:
            category = self.install_category(record["model_type"])
        destination_root = (root / "models" / category).resolve()
        destination_root.mkdir(parents=True, exist_ok=True)
        filename = self._clean_relative_filename(item["filename"])
        destination = (destination_root / filename).resolve()
        if (
            destination != destination_root
            and destination_root not in destination.parents
        ):
            raise ModelError("Unsafe ComfyUI destination")
        destination.parent.mkdir(parents=True, exist_ok=True)
        source_hash = item["sha256"]
        if not item.get("stored_name"):
            # In-place registration: the only thing to verify is that the file
            # still sits at its registered ComfyUI path with its registered hash.
            if not destination.is_file():
                raise ModelConflict(
                    "This file is registered in place; it is already at "
                    f"{destination.relative_to(root)} but it was moved or renamed"
                )
            existing_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
            if existing_hash == source_hash:
                return {
                    "model_id": model_id,
                    "version_id": version_id,
                    "file_id": file_id,
                    "filename": filename,
                    "category": category,
                    "destination": str(destination.relative_to(root)),
                    "installed": True,
                    "already_present": True,
                    "sha256": source_hash,
                }
            raise ModelConflict(
                "This file is registered in place; the file at "
                f"{destination.relative_to(root)} changed since it was registered"
            )
        if destination.is_file():
            existing_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
            if existing_hash == source_hash:
                return {
                    "model_id": model_id,
                    "version_id": version_id,
                    "file_id": file_id,
                    "filename": filename,
                    "category": category,
                    "destination": str(destination.relative_to(root)),
                    "installed": True,
                    "already_present": True,
                    "sha256": source_hash,
                }
            raise ModelConflict("A different ComfyUI file already uses that filename")
        source = self.file_path(model_id, version_id, file_id)
        temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
        try:
            with source.open("rb") as src, temporary.open("xb") as dst:
                shutil.copyfileobj(src, dst, length=1024 * 1024)
                dst.flush()
                os.fsync(dst.fileno())
            temporary.replace(destination)
        except FileExistsError as exc:
            raise ModelConflict("ComfyUI installation is already in progress") from exc
        except OSError as exc:
            temporary.unlink(missing_ok=True)
            raise ModelError("Could not install model into ComfyUI") from exc
        return {
            "model_id": model_id,
            "version_id": version_id,
            "file_id": file_id,
            "filename": filename,
            "category": category,
            "destination": str(destination.relative_to(root)),
            "installed": True,
            "already_present": False,
            "sha256": source_hash,
        }

    def delete(self, model_id: str) -> None:
        record = self._read(model_id)
        if record.get("visibility") == "Public":
            raise ModelConflict("Unpublish the model before deleting it")
        import shutil

        shutil.rmtree(self.root / model_id, ignore_errors=True)
        self._path(model_id).unlink(missing_ok=True)
        self._delete_from_db(model_id)

    def create_version(
        self, model_id: str, payload: ModelVersionCreateRequest
    ) -> ModelVersionResponse:
        record = self._read(model_id)
        if any(item.get("name") == payload.name for item in record.get("versions", [])):
            raise ModelConflict("Version name already exists")
        version_id = uuid.uuid4().hex
        now = self._now()
        version = {
            "version_id": version_id,
            "name": payload.name,
            "created_at": now,
            "files": [],
            "samples": [],
        }
        record.setdefault("versions", []).append(version)
        record["updated_at"] = now
        (self.root / model_id / version_id / "files").mkdir(parents=True, exist_ok=True)
        (self.root / model_id / version_id / "samples").mkdir(
            parents=True, exist_ok=True
        )
        self._write(record)
        self._sync_to_db(record)
        return ModelVersionResponse(
            version_id=version_id, name=payload.name, created_at=now
        )

    def remove_version(self, model_id: str, version_id: str) -> ModelResponse:
        record = self._read(model_id)
        versions = record.get("versions", [])
        if len(versions) <= 1:
            raise ModelConflict("Cannot delete the only version of a model")

        target_version = next((v for v in versions if v.get("version_id") == version_id), None)
        if target_version is None:
            raise ModelNotFound("Model version not found")

        version_dir = self.root / model_id / version_id
        if version_dir.exists():
            shutil.rmtree(version_dir, ignore_errors=True)

        record["versions"] = [v for v in versions if v.get("version_id") != version_id]
        record["updated_at"] = self._now()
        self._write(record)

        try:
            with get_db().get_connection() as conn:
                conn.execute(
                    "DELETE FROM model_versions WHERE id = ? AND model_id = ?",
                    (version_id, model_id),
                )
        except Exception as exc:
            logger.warning("Could not delete model version from database: %s", exc)

        self._sync_to_db(record)
        return self._response(record)

    def update_version(
        self, model_id: str, version_id: str, name: str
    ) -> ModelResponse:
        clean_name = " ".join((name or "").split())
        if not clean_name or len(clean_name) > 64:
            raise ModelError("Invalid version name")

        record = self._read(model_id)
        version = self._version(record, version_id)

        if any(
            v.get("version_id") != version_id and v.get("name") == clean_name
            for v in record.get("versions", [])
        ):
            raise ModelConflict("Version name already exists")

        version["name"] = clean_name
        record["updated_at"] = self._now()
        self._write(record)

        try:
            with get_db().get_connection() as conn:
                conn.execute(
                    "UPDATE model_versions SET name = ? WHERE id = ? AND model_id = ?",
                    (clean_name, version_id, model_id),
                )
        except Exception as exc:
            logger.warning("Could not update model version in database: %s", exc)

        self._sync_to_db(record)
        return self._response(record)

    def add_file(
        self,
        model_id: str,
        version_id: str,
        filename: str,
        data: bytes,
        precision: ModelPrecision,
    ) -> ModelResponse:
        record = self._read(model_id)
        version = self._version(record, version_id)
        name = self._clean_filename(filename)
        suffix = Path(name).suffix.lower()
        if suffix not in MODEL_EXTENSIONS:
            raise ModelError("Unsupported model file type")
        if not data:
            raise ModelError("Model file is empty")
        if len(data) > self.settings.MODEL_MAX_BYTES:
            raise ModelError("Model file is too large")
        file_id = uuid.uuid4().hex
        target = self.root / model_id / version_id / "files" / f"{file_id}{suffix}"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        version.setdefault("files", []).append(
            {
                "file_id": file_id,
                "filename": name,
                "size": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "precision": precision.value,
                "visible": True,
                "stored_name": target.name,
            }
        )
        record["updated_at"] = self._now()
        self._write(record)
        self._sync_to_db(record)
        return self._response(record)

    def patch_file(
        self,
        model_id: str,
        version_id: str,
        file_id: str,
        payload: ModelFilePatchRequest,
    ) -> ModelResponse:
        record = self._read(model_id)
        version = self._version(record, version_id)
        for item in version.get("files", []):
            if item.get("file_id") == file_id:
                item.update(payload.model_dump(exclude_unset=True))
                record["updated_at"] = self._now()
                self._write(record)
                self._sync_to_db(record)
                return self._response(record)
        raise ModelNotFound("Model file not found")

    def remove_file(self, model_id: str, version_id: str, file_id: str) -> None:
        record = self._read(model_id)
        version = self._version(record, version_id)
        for index, item in enumerate(version.get("files", [])):
            if item.get("file_id") == file_id:
                stored_name = item.get("stored_name")
                if stored_name:
                    (self.root / model_id / version_id / "files" / stored_name).unlink(
                        missing_ok=True
                    )
                # In-place registrations ("Use an existing ComfyUI model") only
                # remove the record — the ComfyUI file itself stays untouched.
                version["files"].pop(index)
                record["updated_at"] = self._now()
                self._write(record)
                self._sync_to_db(record)
                return
        raise ModelNotFound("Model file not found")

    def add_sample(
        self,
        model_id: str,
        version_id: str,
        filename: str,
        data: bytes,
        metadata: dict[str, Any] | None = None,
    ) -> ModelResponse:
        record = self._read(model_id)
        version = self._version(record, version_id)
        name = self._clean_filename(filename)
        suffix = Path(name).suffix.lower()
        kind = SAMPLE_EXTENSIONS.get(suffix)
        if kind is None:
            raise ModelError("Unsupported sample media type")
        if not data or len(data) > self.settings.MODEL_SAMPLE_MAX_BYTES:
            raise ModelError("Sample media is empty or too large")
        sample_id = uuid.uuid4().hex
        target = self.root / model_id / version_id / "samples" / f"{sample_id}{suffix}"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        version.setdefault("samples", []).append(
            {
                "sample_id": sample_id,
                "filename": name,
                "kind": kind,
                "stored_name": target.name,
                "metadata": metadata or {},
            }
        )
        record["updated_at"] = self._now()
        self._write(record)
        self._sync_to_db(record)
        return self._response(record)

    def remove_sample(self, model_id: str, version_id: str, sample_id: str) -> None:
        record = self._read(model_id)
        version = self._version(record, version_id)
        for index, item in enumerate(version.get("samples", [])):
            if item.get("sample_id") == sample_id:
                (
                    self.root / model_id / version_id / "samples" / item["stored_name"]
                ).unlink(missing_ok=True)
                version["samples"].pop(index)
                record["updated_at"] = self._now()
                self._write(record)
                self._sync_to_db(record)
                return
        raise ModelNotFound("Model sample not found")

    def publish(
        self,
        model_id: str,
        payload: ModelPublishRequest | dict[str, Any] | None = None,
        is_moderator: bool = True,
        *,
        req: ModelPublishRequest | dict[str, Any] | None = None,
    ) -> ModelResponse:
        effective_req = payload if req is None else req
        if effective_req is None:
            raise ModelError("Publish request payload is required")

        record = self._read(model_id)
        raw_vis = (
            effective_req.visibility
            if hasattr(effective_req, "visibility")
            else (effective_req.get("visibility") if isinstance(effective_req, dict) else effective_req)
        )
        is_public = (
            raw_vis == ModelVisibility.PUBLIC
            or raw_vis == ModelVisibility.PUBLIC.value
            or str(raw_vis).lower() == "public"
        )

        if is_public:
            if not record.get("title", "").strip():
                raise ModelConflict("A title is required before publishing")
            if not any(version.get("files") for version in record.get("versions", [])):
                raise ModelConflict("Upload at least one model file before publishing")
            compatibility = record.get("compatibility", {})
            self._validate_base_association(
                record.get("model_type", ""),
                compatibility,
                require_public=True,
            )
            if is_moderator:
                record["moderation_status"] = ModelModerationStatus.APPROVED.value
                record["published_at"] = self._now()
            else:
                record["moderation_status"] = ModelModerationStatus.PENDING_REVIEW.value
                record["published_at"] = None
            record["visibility"] = ModelVisibility.PUBLIC.value
        else:
            record["published_at"] = None
            record["moderation_status"] = ModelModerationStatus.DRAFT.value
            vis_val = raw_vis.value if hasattr(raw_vis, "value") else str(raw_vis)
            record["visibility"] = vis_val

        record["updated_at"] = self._now()
        self._write(record)
        self._sync_to_db(record)
        return self._response(record)

    def public_file_path(self, model_id: str, version_id: str, file_id: str) -> Path:
        self.public_response(model_id)
        return self.file_path(model_id, version_id, file_id)

    def public_sample_path(
        self, model_id: str, version_id: str, sample_id: str
    ) -> Path:
        self.public_response(model_id)
        return self.sample_path(model_id, version_id, sample_id)

    def file_path(self, model_id: str, version_id: str, file_id: str) -> Path:
        record = self._read(model_id)
        version = self._version(record, version_id)
        for item in version.get("files", []):
            if item.get("file_id") == file_id:
                if not item.get("stored_name"):
                    # Registered in place: served straight from its ComfyUI location.
                    return self._registered_path(record, item)
                path = (
                    self.root / model_id / version_id / "files" / item["stored_name"]
                ).resolve()
                if (
                    path.is_file()
                    and path.parent
                    == (self.root / model_id / version_id / "files").resolve()
                ):
                    return path
        raise ModelNotFound("Model file not found")

    def _registered_path(self, record: dict[str, Any], item: dict[str, Any]) -> Path:
        """Locate an in-place-registered file inside its ComfyUI category folder."""
        root = self._comfy_root()
        category = item.get("category")
        if not category:
            category = self.install_category(record["model_type"])
        category_path = root / "models" / category
        category_root = category_path.resolve()
        filename = self._clean_relative_filename(item["filename"])
        if record.get("model_type") == "Checkpoint":
            candidate_cats = [category]
            for c in ("checkpoints", "diffusion_models"):
                if c not in candidate_cats:
                    candidate_cats.append(c)
            for c in candidate_cats:
                c_root = (root / "models" / c).resolve()
                if c_root.is_dir():
                    cand = (c_root / filename).resolve()
                    if (cand == c_root or c_root in cand.parents) and cand.is_file() and not cand.is_symlink():
                        return cand
        if category_root != category_path or not category_root.is_dir():
            raise ModelConflict("Local ComfyUI model category not found")
        candidate = (category_root / filename).resolve()
        if candidate != category_root and category_root not in candidate.parents:
            raise ModelError("Unsafe ComfyUI model path")
        if candidate.is_symlink() or not candidate.is_file():
            raise ModelNotFound(
                "This file is registered in place and was removed from its ComfyUI folder"
            )
        return candidate

    def sample_path(self, model_id: str, version_id: str, sample_id: str) -> Path:
        record = self._read(model_id)
        version = self._version(record, version_id)
        for item in version.get("samples", []):
            if item.get("sample_id") == sample_id:
                path = (
                    self.root / model_id / version_id / "samples" / item["stored_name"]
                ).resolve()
                if (
                    path.is_file()
                    and path.parent
                    == (self.root / model_id / version_id / "samples").resolve()
                ):
                    return path
        raise ModelNotFound("Model sample not found")


def get_model_service() -> ModelService:
    return ModelService()


ModelStorage = ModelService
