"""Local filesystem storage: generated assets plus safe gallery metadata."""

import json
import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..config import Settings, get_settings
from ..schemas import GalleryItem

logger = logging.getLogger(__name__)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"}
ASSET_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS
# Readable uploads are a superset of gallery assets: reference audio is read back for
# video conditioning but must never surface as a gallery item.
READABLE_EXTENSIONS = ASSET_EXTENSIONS | AUDIO_EXTENSIONS


class StorageError(RuntimeError):
    """Raised when the storage directory is unusable or an IO operation fails."""


class StorageService:
    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.root = Path(self.settings.STORAGE_DIR).resolve()
        self.is_s3_enabled = bool(
            self.settings.S3_ENABLED or (self.settings.S3_BUCKET and self.settings.S3_ACCESS_KEY_ID)
        )
        self._s3_client: Any = None

    @property
    def s3_client(self) -> Any:
        if self._s3_client is None and self.is_s3_enabled:
            try:
                import boto3
                from botocore.config import Config

                self._s3_client = boto3.client(
                    "s3",
                    endpoint_url=self.settings.S3_ENDPOINT_URL,
                    aws_access_key_id=self.settings.S3_ACCESS_KEY_ID,
                    aws_secret_access_key=self.settings.S3_SECRET_ACCESS_KEY,
                    region_name=self.settings.S3_REGION or "auto",
                    config=Config(signature_version="s3v4"),
                )
                logger.info("Initialized S3/R2 client for bucket %s", self.settings.S3_BUCKET)
            except Exception as exc:
                logger.warning("Could not initialize S3 client: %s", exc)
                self._s3_client = None
        return self._s3_client

    def ensure_root(self) -> Path:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise StorageError(f"Cannot create storage dir {self.root}: {exc}") from exc
        return self.root

    def _file_url(self, key: str) -> str:
        if self.is_s3_enabled:
            if self.settings.S3_PUBLIC_BASE_URL:
                return f"{self.settings.S3_PUBLIC_BASE_URL.rstrip('/')}/{key}"
            if self.settings.S3_ENDPOINT_URL:
                return f"{self.settings.S3_ENDPOINT_URL.rstrip('/')}/{self.settings.S3_BUCKET}/{key}"
            return f"https://{self.settings.S3_BUCKET}.s3.amazonaws.com/{key}"
        return f"{self.settings.FILES_PUBLIC_BASE}/files/{key}"

    @staticmethod
    def _metadata_path(asset_path: Path) -> Path:
        return asset_path.with_suffix(f"{asset_path.suffix}.json")

    def _gallery_item(self, path: Path) -> GalleryItem:
        stat = path.stat()
        rel = path.relative_to(self.root).as_posix()
        metadata = None
        try:
            sidecar = self._metadata_path(path)
            if sidecar.is_file():
                raw = json.loads(sidecar.read_text(encoding="utf-8"))
                metadata = raw if isinstance(raw, dict) else None
        except (OSError, json.JSONDecodeError):
            logger.warning("Could not read metadata for %s", path)
        before_detailer_url = (
            metadata.get("before_detailer_url") if isinstance(metadata, dict) else None
        )
        has_detailer = (
            bool(metadata.get("has_detailer"))
            if isinstance(metadata, dict) and "has_detailer" in metadata
            else (bool(before_detailer_url) if before_detailer_url else False)
        )
        enable_detailer = (
            bool(metadata.get("enable_detailer"))
            if isinstance(metadata, dict) and "enable_detailer" in metadata
            else has_detailer
        )
        return GalleryItem(
            key=rel,
            url=self._file_url(rel),
            size=stat.st_size,
            last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            metadata=metadata,
            before_detailer_url=before_detailer_url,
            has_detailer=has_detailer,
            enable_detailer=enable_detailer,
        )

    async def upload_asset(
        self,
        data: bytes,
        prompt_id: str,
        filename: str = "image.png",
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
        namespace: str | None = None,
    ) -> str:
        ext = Path(filename).suffix.lower()
        if ext not in ASSET_EXTENSIONS:
            raise StorageError("Unsupported asset extension")
        safe_prompt = "".join(ch for ch in prompt_id if ch.isalnum() or ch in "-_")[:80] or "result"
        prefix = namespace.strip("/\\") if namespace else ""
        key = "/".join(part for part in (prefix, safe_prompt, f"{uuid.uuid4().hex[:12]}{ext}") if part)
        dest = (self.root / key).resolve()
        try:
            dest.relative_to(self.root)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            if metadata is not None:
                self._metadata_path(dest).write_text(
                    json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
                )
        except (OSError, ValueError) as exc:
            raise StorageError(f"Write failed for {dest}: {exc}") from exc
        logger.info("Saved %s (%d bytes, %s)", dest, len(data), content_type)

        if self.is_s3_enabled and self.s3_client:
            try:
                self.s3_client.put_object(
                    Bucket=self.settings.S3_BUCKET,
                    Key=key,
                    Body=data,
                    ContentType=content_type,
                )
                if metadata is not None:
                    self.s3_client.put_object(
                        Bucket=self.settings.S3_BUCKET,
                        Key=f"{key}.json",
                        Body=json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"),
                        ContentType="application/json",
                    )
                logger.info("Uploaded %s to S3 bucket %s", key, self.settings.S3_BUCKET)
            except Exception as exc:
                logger.error("Failed to upload to S3 (%s): %s", key, exc)

        return self._file_url(key)

    async def upload_image(self, data: bytes, prompt_id: str, filename: str = "image.png", content_type: str = "image/png", metadata: Optional[dict] = None, namespace: str | None = None) -> str:
        """Compatibility wrapper for existing image-generation callers."""
        return await self.upload_asset(data, prompt_id, filename, content_type, metadata, namespace)

    def list_recent(
        self,
        limit: int = 60,
        *,
        origin: str | None = None,
        tool_id: str | None = None,
        tool_type: str | None = None,
        tag: str | None = None,
        tags: list[str] | None = None,
        tag_mode: str = "all",
        user_id: str | None = None,
    ) -> list[GalleryItem]:
        self.ensure_root()
        files = [p for p in self.root.rglob("*") if p.suffix.lower() in ASSET_EXTENSIONS and p.is_file()]
        files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        items: list[GalleryItem] = []
        for path in files:
            item = self._gallery_item(path)
            metadata = item.metadata or {}
            if metadata.get("gallery_saved", True) is False:
                continue
            if user_id and metadata.get("user_id") != user_id:
                continue
            item_origin = metadata.get("origin", metadata.get("source"))
            if origin and item_origin != origin:
                continue
            if tool_id and metadata.get("tool_id") != tool_id:
                continue
            if tool_type and metadata.get("tool_type", metadata.get("tool_mode")) != tool_type:
                continue
            if tag and tag not in (metadata.get("tags") or []):
                continue
            if tags:
                item_tags = {str(t).lower() for t in (metadata.get("tags") or [])}
                req_tags = [str(t).lower() for t in tags if str(t).strip()]
                if req_tags:
                    if tag_mode == "any":
                        if not any(t in item_tags for t in req_tags):
                            continue
                    else:  # "all"
                        if not all(t in item_tags for t in req_tags):
                            continue
            items.append(item)
            if len(items) >= limit:
                break
        return items

    def get_asset(self, key: str) -> GalleryItem:
        path = (self.root / key).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise StorageError("Invalid asset key") from exc
        if not path.is_file() or path.suffix.lower() not in ASSET_EXTENSIONS:
            raise FileNotFoundError(key)
        return self._gallery_item(path)

    def get_image(self, key: str) -> GalleryItem:
        return self.get_asset(key)

    async def get_image_bytes(self, key: str) -> bytes:
        """Read a stored upload back into memory for reuse as a ComfyUI input.

        Accepts images, videos and audio; the key is resolved under ``root`` so a
        traversal attempt (``..``) cannot escape storage.
        """
        path = (self.root / key).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise StorageError("Invalid asset key") from exc
        if path == self.root or not path.is_file() or path.suffix.lower() not in READABLE_EXTENSIONS:
            raise FileNotFoundError(key)
        try:
            return path.read_bytes()
        except OSError as exc:
            raise StorageError(f"Could not read stored asset: {exc}") from exc

    def set_saved(self, key: str, saved: bool) -> GalleryItem:
        path = (self.root / key).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise StorageError("Invalid asset key") from exc
        if not path.is_file() or path.suffix.lower() not in ASSET_EXTENSIONS:
            raise FileNotFoundError(key)
        sidecar = self._metadata_path(path)
        try:
            raw = json.loads(sidecar.read_text(encoding="utf-8")) if sidecar.is_file() else {}
            if not isinstance(raw, dict):
                raw = {}
            raw["gallery_saved"] = saved
            temp = sidecar.with_suffix(sidecar.suffix + ".tmp")
            temp.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
            temp.replace(sidecar)
        except (OSError, json.JSONDecodeError) as exc:
            raise StorageError("Could not update asset visibility") from exc
        return self._gallery_item(path)

    def update_tags(self, key: str, tags: list[str]) -> GalleryItem:
        path = (self.root / key).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise StorageError("Invalid asset key") from exc
        if not path.is_file() or path.suffix.lower() not in ASSET_EXTENSIONS:
            raise FileNotFoundError(key)
        sidecar = self._metadata_path(path)
        try:
            raw = json.loads(sidecar.read_text(encoding="utf-8")) if sidecar.is_file() else {}
            if not isinstance(raw, dict):
                raw = {}
            raw["tags"] = tags
            temp = sidecar.with_suffix(sidecar.suffix + ".tmp")
            temp.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
            temp.replace(sidecar)
        except (OSError, json.JSONDecodeError) as exc:
            raise StorageError("Could not update asset tags") from exc
        return self._gallery_item(path)

    def list_popular_tags(
        self, limit: int = 50, user_id: str | None = None
    ) -> list[dict[str, Any]]:
        self.ensure_root()
        counts: dict[str, int] = {}
        for p in self.root.rglob("*.json"):
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    if user_id and raw.get("user_id") != user_id:
                        continue
                    for tag in raw.get("tags") or []:
                        if isinstance(tag, str) and tag.strip():
                            norm = tag.strip().lower()
                            counts[norm] = counts.get(norm, 0) + 1
            except Exception:
                continue
        sorted_tags = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]
        return [{"name": name, "count": count} for name, count in sorted_tags]

    def delete_asset(self, key: str) -> bool:
        if not key or not str(key).strip():
            raise StorageError("Invalid asset key")
        path = (self.root / key).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise StorageError("Invalid asset key") from exc
        if path == self.root:
            raise StorageError("Invalid asset key")
        if not path.is_file() or path.suffix.lower() not in ASSET_EXTENSIONS:
            raise FileNotFoundError(key)

        sidecar = self._metadata_path(path)
        try:
            if sidecar.is_file():
                sidecar.unlink(missing_ok=True)
            path.unlink()
        except OSError as exc:
            raise StorageError(f"Could not delete asset {key}: {exc}") from exc

        try:
            parent = path.parent
            if parent != self.root and parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
        except OSError:
            pass

        logger.info("Deleted asset %s", key)

        if self.is_s3_enabled and self.s3_client:
            try:
                self.s3_client.delete_object(Bucket=self.settings.S3_BUCKET, Key=key)
                self.s3_client.delete_object(Bucket=self.settings.S3_BUCKET, Key=f"{key}.json")
            except Exception as exc:
                logger.warning("Could not delete %s from S3: %s", key, exc)

        return True

    def purge_prompt(self, prompt_id: str) -> int:
        target = self.root / prompt_id
        if not target.is_dir():
            return 0
        count = sum(1 for p in target.rglob("*") if p.is_file())
        shutil.rmtree(target, ignore_errors=True)
        return count


def get_storage() -> StorageService:
    return StorageService()
