"""Local filesystem storage: generated assets plus safe gallery metadata."""

import json
import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..config import Settings, get_settings
from ..schemas import GalleryItem

logger = logging.getLogger(__name__)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
ASSET_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS


class StorageError(RuntimeError):
    """Raised when the storage directory is unusable or an IO operation fails."""


class StorageService:
    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.root = Path(self.settings.STORAGE_DIR).resolve()

    def ensure_root(self) -> Path:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise StorageError(f"Cannot create storage dir {self.root}: {exc}") from exc
        return self.root

    def _file_url(self, key: str) -> str:
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
        return GalleryItem(
            key=rel,
            url=self._file_url(rel),
            size=stat.st_size,
            last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            metadata=metadata,
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
        return self._file_url(key)

    async def upload_image(self, data: bytes, prompt_id: str, filename: str = "image.png", content_type: str = "image/png", metadata: Optional[dict] = None, namespace: str | None = None) -> str:
        """Compatibility wrapper for existing image-generation callers."""
        return await self.upload_asset(data, prompt_id, filename, content_type, metadata, namespace)

    def list_recent(self, limit: int = 60, *, origin: str | None = None, tool_id: str | None = None, tool_type: str | None = None, tag: str | None = None) -> list[GalleryItem]:
        self.ensure_root()
        files = [p for p in self.root.rglob("*") if p.suffix.lower() in ASSET_EXTENSIONS and p.is_file()]
        files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        items: list[GalleryItem] = []
        for path in files:
            item = self._gallery_item(path)
            metadata = item.metadata or {}
            if metadata.get("gallery_saved", True) is False:
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

    def purge_prompt(self, prompt_id: str) -> int:
        target = self.root / prompt_id
        if not target.is_dir():
            return 0
        count = sum(1 for p in target.rglob("*") if p.is_file())
        shutil.rmtree(target, ignore_errors=True)
        return count


def get_storage() -> StorageService:
    return StorageService()
