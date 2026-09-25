"""Local filesystem storage: images saved under STORAGE_DIR, served by FastAPI.

Replaces the previous MinIO/S3 service with plain disk writes plus a
StaticFiles mount — no external object store required.
"""

import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..config import Settings, get_settings
from ..schemas import GalleryItem

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


class StorageError(RuntimeError):
    """Raised when the storage directory is unusable or an IO operation fails."""


class StorageService:
    """Writes generated images to disk and lists them for the gallery."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.root = Path(self.settings.STORAGE_DIR).resolve()

    # ------------------------------------------------------------------ #
    # Directory management
    # ------------------------------------------------------------------ #

    def ensure_root(self) -> Path:
        try:
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise StorageError(f"Cannot create storage dir {self.root}: {exc}") from exc
        return self.root

    # ------------------------------------------------------------------ #
    # Object operations
    # ------------------------------------------------------------------ #

    def _file_url(self, key: str) -> str:
        return f"{self.settings.FILES_PUBLIC_BASE}/files/{key}"

    async def upload_image(
        self,
        data: bytes,
        prompt_id: str,
        filename: str = "image.png",
        content_type: str = "image/png",
    ) -> str:
        """Write one generated image to disk and return its public /files URL."""
        ext = Path(filename).suffix.lower() or ".png"
        key = f"{prompt_id}/{uuid.uuid4().hex[:12]}{ext}"
        dest = self.root / key

        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        except OSError as exc:
            raise StorageError(f"Write failed for {dest}: {exc}") from exc

        logger.info("Saved %s (%d bytes, %s)", dest, len(data), content_type)
        return self._file_url(key)

    def list_recent(self, limit: int = 60) -> list[GalleryItem]:
        """List the most recently saved images (newest first)."""
        self.ensure_root()
        files = [p for p in self.root.rglob("*") if p.suffix.lower() in IMAGE_EXTENSIONS and p.is_file()]
        files.sort(key=lambda p: p.stat().st_mtime, reverse=True)

        items: list[GalleryItem] = []
        for path in files[:limit]:
            stat = path.stat()
            rel = path.relative_to(self.root).as_posix()
            items.append(
                GalleryItem(
                    key=rel,
                    url=self._file_url(rel),
                    size=stat.st_size,
                    last_modified=datetime.fromtimestamp(
                        stat.st_mtime, tz=timezone.utc
                    ).isoformat(),
                )
            )
        return items

    # Kept for API-shape parity with the previous S3 service — unused.
    def purge_prompt(self, prompt_id: str) -> int:
        """Delete all files for a prompt_id; returns the number removed."""
        target = self.root / prompt_id
        if not target.is_dir():
            return 0
        count = sum(1 for p in target.rglob("*") if p.is_file())
        shutil.rmtree(target, ignore_errors=True)
        return count


def get_storage() -> StorageService:
    return StorageService()