"""Durable local storage for creator-managed model metadata and uploads."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import Settings, get_settings
from ..schemas import (
    ModelCreateRequest,
    ModelFilePatchRequest,
    ModelFileResponse,
    ModelPrecision,
    ModelPublishRequest,
    ModelResponse,
    ModelSampleResponse,
    ModelUpdateRequest,
    ModelVersionCreateRequest,
    ModelVersionResponse,
)

MODEL_ID_RE = re.compile(r"^[0-9a-f]{32}$")
MODEL_EXTENSIONS = {".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf"}
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
)


class ModelError(RuntimeError):
    pass


class ModelNotFound(ModelError):
    pass


class ModelConflict(ModelError):
    pass


class ModelService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.root = Path(self.settings.MODELS_DIR).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.definitions = self.root / "definitions"
        self.definitions.mkdir(parents=True, exist_ok=True)

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
        if record.get("model_type") == "UNET":
            record["model_type"] = "Diffusion Model"
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
        return ModelResponse(
            model_id=record["model_id"],
            title=record["title"],
            category=record["category"],
            model_type=record["model_type"],
            tags=record.get("tags", []),
            compatibility=record["compatibility"],
            generation=record["generation"],
            permissions=record["permissions"],
            visibility=record["visibility"],
            created_at=record["created_at"],
            updated_at=record["updated_at"],
            published_at=record.get("published_at"),
            versions=versions,
        )

    def create(self, payload: ModelCreateRequest) -> ModelResponse:
        model_id = uuid.uuid4().hex
        now = self._now()
        version_id = uuid.uuid4().hex
        record = {
            **payload.model_dump(mode="json"),
            "model_id": model_id,
            "created_at": now,
            "updated_at": now,
            "published_at": None,
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
        (self.root / model_id / version_id / "files").mkdir(parents=True, exist_ok=True)
        (self.root / model_id / version_id / "samples").mkdir(
            parents=True, exist_ok=True
        )
        self._write(record)
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
    ) -> list[ModelResponse]:
        items: list[ModelResponse] = []
        for path in self.definitions.glob("*.json"):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(record, dict):
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
        record["updated_at"] = self._now()
        self._write(record)
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

    def public_list(self, query: str | None = None) -> list[ModelResponse]:
        return self.list(query=query, public=True)

    def resolve_installed_gallery_file(
        self,
        model_id: str,
        version_id: str,
        file_id: str,
        verify_hash: bool = True,
    ) -> dict[str, str]:
        record = self._read(model_id)
        if record.get("visibility") != "Public" or not record.get("published_at"):
            raise ModelNotFound("Model not found")
        model_type = record.get("model_type")
        if model_type not in {"Checkpoint", "Diffusion Model"}:
            raise ModelConflict("Only Checkpoint and Diffusion Model gallery models can generate")
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
        category = self.install_category(model_type)
        root = self._comfy_root()
        category_path = root / "models" / category
        category_root = category_path.resolve()
        if category_root != category_path or not category_root.is_dir():
            raise ModelConflict("Gallery model file is not installed")
        filename = self._clean_relative_filename(item["filename"])
        destination = (category_root / filename).resolve()
        if destination != category_root and category_root not in destination.parents:
            raise ModelError("Unsafe ComfyUI model path")
        if not destination.is_file() or destination.is_symlink():
            raise ModelConflict("Gallery model file is not installed")
        if verify_hash:
            digest = hashlib.sha256()
            try:
                with destination.open("rb") as source:
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
            except OSError as exc:
                raise ModelError("Installed model file is unreadable") from exc
            if digest.hexdigest() != item.get("sha256"):
                raise ModelConflict(
                    "Installed model file does not match the gallery version"
                )
        elif destination.stat().st_size != item.get("size"):
            raise ModelConflict("Gallery model file is not installed")
        return {
            "model_id": model_id,
            "version_id": version_id,
            "file_id": file_id,
            "title": record["title"],
            "model_type": model_type,
            "version_name": version["name"],
            "filename": filename,
            "category": category,
            "sha256": item["sha256"],
        }

    def selectable_gallery_files(self) -> list[dict[str, str]]:
        items: list[dict[str, str]] = []
        for model in self.public_list():
            if model.model_type.value not in {"Checkpoint", "Diffusion Model"}:
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
        return sorted(
            items,
            key=lambda item: (
                item["title"].lower(),
                item["version_name"].lower(),
                item["filename"].lower(),
            ),
        )

    @staticmethod
    def install_category(model_type: str) -> str:
        categories = {
            "Checkpoint": "checkpoints",
            "Diffusion Model": "diffusion_models",
            "LoRA": "loras",
            "LyCORIS": "loras",
            "VAE": "vae",
            "Embedding": "embeddings",
        }
        try:
            return categories[model_type]
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
        if category not in LOCAL_MODEL_CATEGORIES:
            raise ModelError("Unsupported ComfyUI model category")
        return category

    def local_models(
        self, query: str | None = None, category: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        root = self._comfy_root()
        categories = (
            [self._local_category(category)] if category else LOCAL_MODEL_CATEGORIES
        )
        needle = (query or "").strip().lower()
        limit = max(1, min(limit, 100))
        items: list[dict[str, Any]] = []
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
            }
        )
        record["updated_at"] = self._now()
        self._write(record)
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
        return ModelVersionResponse(
            version_id=version_id, name=payload.name, created_at=now
        )

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
                return self._response(record)
        raise ModelNotFound("Model file not found")

    def remove_file(self, model_id: str, version_id: str, file_id: str) -> None:
        record = self._read(model_id)
        version = self._version(record, version_id)
        for index, item in enumerate(version.get("files", [])):
            if item.get("file_id") == file_id:
                stored_name = item.get("stored_name")
                if stored_name:
                    (
                        self.root / model_id / version_id / "files" / stored_name
                    ).unlink(missing_ok=True)
                # In-place registrations ("Use an existing ComfyUI model") only
                # remove the record — the ComfyUI file itself stays untouched.
                version["files"].pop(index)
                record["updated_at"] = self._now()
                self._write(record)
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
                return
        raise ModelNotFound("Model sample not found")

    def publish(self, model_id: str, payload: ModelPublishRequest) -> ModelResponse:
        record = self._read(model_id)
        if payload.visibility == "Public":
            if not record.get("title", "").strip():
                raise ModelConflict("A title is required before publishing")
            if not any(version.get("files") for version in record.get("versions", [])):
                raise ModelConflict("Upload at least one model file before publishing")
            record["published_at"] = self._now()
        else:
            record["published_at"] = None
        record["visibility"] = payload.visibility.value
        record["updated_at"] = self._now()
        self._write(record)
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
        category = self.install_category(record["model_type"])
        category_path = root / "models" / category
        category_root = category_path.resolve()
        if category_root != category_path or not category_root.is_dir():
            raise ModelConflict("Local ComfyUI model category not found")
        filename = self._clean_relative_filename(item["filename"])
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
