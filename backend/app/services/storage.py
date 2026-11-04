"""Local filesystem storage: generated assets plus safe gallery metadata."""

import json
import logging
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote

from ..config import Settings, get_settings
from ..schemas import GalleryItem
from .media_access import (
    MediaNotFound,
    is_forbidden_artifact,
    is_public_avatar,
    is_public_metadata,
    metadata_owner,
    signed_media_url,
    verify_capability,
)

logger = logging.getLogger(__name__)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"}
ASSET_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS
# Readable uploads are a superset of gallery assets: reference audio is read back for
# video conditioning but must never surface as a gallery item.
READABLE_EXTENSIONS = ASSET_EXTENSIONS | AUDIO_EXTENSIONS

RELATED_MODES = frozenset({"all", "model", "tags"})
RELATED_SCOPES = frozenset({"own", "public"})
MAX_RELATED_PAGE_SIZE = 100

GALLERY_SOURCE_FILTERS = frozenset({"all", "workspace", "ai_tool_studio"})
GALLERY_SORT_ORDERS = frozenset({"newest", "oldest", "name"})
# Legacy sidecars predate origin/source; they are local generations ("workspace").
WORKSPACE_SOURCES = frozenset({"", "generation", "workspace"})
TOOL_SOURCES = frozenset({"ai_tool_studio", "tool"})
# Must match ``assetTypeOf`` in frontend/src/lib/api.ts.
GALLERY_MEDIA_TYPES = frozenset({"image", "video", "3d"})
VIDEO_MEDIA_EXTENSIONS = frozenset({".mp4", ".webm", ".mov", ".mkv"})
MODEL_MEDIA_EXTENSIONS = frozenset({".glb", ".gltf", ".obj", ".fbx", ".blend", ".splat"})


class StorageError(RuntimeError):
    """Raised when the storage directory is unusable or an IO operation fails."""


@dataclass(frozen=True)
class MediaAccess:
    """Serve-time authorization result for one stored media key."""

    key: str
    path: Path
    owner_id: Optional[str]
    is_private: bool
    is_public: bool
    is_saved: bool = True


def _metadata_is_private(metadata: Any) -> bool:
    return isinstance(metadata, dict) and (
        metadata.get("gallery_saved") is False or metadata.get("is_private") is True
    )


def _normalized_source(metadata: dict[str, Any]) -> str:
    value = metadata.get("origin")
    if not isinstance(value, str) or not value.strip():
        value = metadata.get("source")
    return value.strip().lower() if isinstance(value, str) else ""


def _gallery_matches_source(
    metadata: dict[str, Any], source: str, origin: str | None
) -> bool:
    """Source filter, with the legacy exact-``origin`` filter retained.

    ``source != "all"`` replaces ``origin``; both are exact sidecar matches and
    a legacy sidecar without either field counts as a workspace generation.
    """
    if source != "all":
        normalized = _normalized_source(metadata)
        if source == "workspace":
            return normalized in WORKSPACE_SOURCES
        return normalized in TOOL_SOURCES
    if origin:
        return metadata.get("origin", metadata.get("source")) == origin
    return True


def _gallery_matches_media_type(item: GalleryItem, media_type: str | None) -> bool:
    """Gallery tab filter; mirrors ``assetTypeOf`` in the frontend."""
    if not media_type:
        return True
    ext = Path(item.key).suffix.lower()
    if media_type == "video":
        return ext in VIDEO_MEDIA_EXTENSIONS
    if media_type == "3d":
        return ext in MODEL_MEDIA_EXTENSIONS
    return ext not in VIDEO_MEDIA_EXTENSIONS and ext not in MODEL_MEDIA_EXTENSIONS


def _gallery_matches_query(
    item: GalleryItem, metadata: dict[str, Any], needle: str
) -> bool:
    """Case-insensitive substring over key, prompt, tool name and string tags."""
    haystacks = [item.key, metadata.get("prompt"), metadata.get("tool_name")]
    tags = metadata.get("tags")
    if isinstance(tags, (list, tuple, set)):
        haystacks.extend(tags)
    for value in haystacks:
        if isinstance(value, str) and needle in value.casefold():
            return True
    return False


def _gallery_sort_key(item: GalleryItem, order: str) -> tuple[Any, ...]:
    """Stable ordering with a unique key tie-break so pages never overlap."""
    if order == "name":
        basename = item.key.rsplit("/", 1)[-1].lower()
        return (basename, item.key)
    mtime = _iso_mtime(item.last_modified)
    if order == "oldest":
        return (mtime, item.key)
    # newest: mtime DESC, key ASC. Negate the numeric timestamp so one sort
    # direction keeps the key tie-break ascending.
    return (-mtime, item.key)


def _iso_mtime(value: str) -> float:
    try:
        return datetime.fromisoformat(value).timestamp()
    except (TypeError, ValueError):
        return 0.0


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

    def _read_sidecar(self, path: Path) -> dict[str, Any] | None:
        """Return a dict sidecar or None; malformed JSON/list payloads fail closed."""
        try:
            sidecar = self._metadata_path(path)
            if sidecar.is_file():
                raw = json.loads(sidecar.read_text(encoding="utf-8"))
                return raw if isinstance(raw, dict) else None
        except (OSError, json.JSONDecodeError):
            logger.warning("Could not read metadata for %s", path)
        return None

    def _local_file_url(self, key: str) -> str:
        return f"{self.settings.FILES_PUBLIC_BASE.rstrip('/')}/files/{quote(key, safe='/')}"

    def _signed_url(
        self, key: str, viewer_id: str | None
    ) -> tuple[str, str | None]:
        if not viewer_id:
            return self._local_file_url(key), None
        return signed_media_url(key, viewer_id, settings=self.settings)

    @staticmethod
    def _key_from_url(url: Any) -> str | None:
        """Extract the storage key from a ``/files/<key>`` URL, if present."""
        if not isinstance(url, str) or "/files/" not in url:
            return None
        tail = url.split("/files/", 1)[1]
        tail = tail.split("?", 1)[0].split("#", 1)[0]
        return tail or None

    def _gallery_item(self, path: Path, viewer_id: str | None = None) -> GalleryItem:
        stat = path.stat()
        rel = path.relative_to(self.root).as_posix()
        metadata = self._read_sidecar(path)
        private_like = _metadata_is_private(metadata)
        owner = metadata_owner(metadata)
        sign_for_owner = bool(
            viewer_id and private_like and owner and owner == viewer_id
        )
        if sign_for_owner:
            url, url_expires_at = self._signed_url(rel, viewer_id)
        elif private_like:
            url, url_expires_at = self._local_file_url(rel), None
        else:
            url, url_expires_at = self._file_url(rel), None
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
        is_private = _metadata_is_private(metadata)
        if before_detailer_url:
            # Derivative URLs inherit the parent's authorization. Sign with the
            # parent key for the asset owner so a derivative is never treated as
            # ownerless-public; serving re-checks the parent sidecar, so a
            # capability never grants more than the parent allows.
            parent_key = self._key_from_url(before_detailer_url)
            if parent_key:
                if viewer_id and owner and owner == viewer_id:
                    before_detailer_url, _ = self._signed_url(parent_key, viewer_id)
                else:
                    before_detailer_url = self._local_file_url(parent_key)
        return GalleryItem(
            key=rel,
            url=url,
            url_expires_at=url_expires_at,
            size=stat.st_size,
            last_modified=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            metadata=metadata,
            before_detailer_url=before_detailer_url,
            has_detailer=has_detailer,
            enable_detailer=enable_detailer,
            is_private=is_private,
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

        # Private/unsaved generation media must never surface as a raw public
        # (or S3 public) link; the owner gets a short-lived local capability.
        if _metadata_is_private(metadata):
            owner = metadata_owner(metadata)
            if owner:
                signed, _ = signed_media_url(key, owner, settings=self.settings)
                return signed
            return self._local_file_url(key)
        return self._file_url(key)

    async def upload_image(self, data: bytes, prompt_id: str, filename: str = "image.png", content_type: str = "image/png", metadata: Optional[dict] = None, namespace: str | None = None) -> str:
        """Compatibility wrapper for existing image-generation callers."""
        return await self.upload_asset(data, prompt_id, filename, content_type, metadata, namespace)

    def _asset_files(self) -> list[Path]:
        """Every gallery media file under ``root``, in filesystem order."""
        self.ensure_root()
        return [
            p
            for p in self.root.rglob("*")
            if p.suffix.lower() in ASSET_EXTENSIONS and p.is_file()
        ]

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
        viewer_id: str | None = None,
    ) -> list[GalleryItem]:
        items, _ = self.list_gallery_page(
            user_id=user_id,
            viewer_id=viewer_id,
            offset=0,
            limit=limit,
            origin=origin,
            tool_id=tool_id,
            tool_type=tool_type,
            tag=tag,
            tags=tags,
            tag_mode=tag_mode,
        )
        return items

    def list_gallery_page(
        self,
        *,
        user_id: str | None,
        viewer_id: str | None,
        offset: int = 0,
        limit: int = 60,
        origin: str | None = None,
        tool_id: str | None = None,
        tool_type: str | None = None,
        tag: str | None = None,
        tags: list[str] | None = None,
        tag_mode: str = "all",
        q: str | None = None,
        sort: str = "newest",
        source: str = "all",
        media_type: str | None = None,
        collection_keys: set[str] | None = None,
    ) -> tuple[list[GalleryItem], int]:
        """One owner-scoped page plus the true post-visibility total.

        Order of operations is the privacy contract: visibility first (unsaved
        and foreign private assets never count), then filters, then count, then
        slice. Sorting is stable with a unique key tie-break so pages never
        overlap or skip when timestamps collide.
        """
        normalized_source = (source or "all").strip().lower()
        if normalized_source not in GALLERY_SOURCE_FILTERS:
            normalized_source = "all"
        normalized_sort = (sort or "newest").strip().lower()
        if normalized_sort not in GALLERY_SORT_ORDERS:
            normalized_sort = "newest"
        normalized_media = (media_type or "").strip().lower()
        if normalized_media not in GALLERY_MEDIA_TYPES:
            normalized_media = ""
        needle = (q or "").strip().casefold()

        files = self._asset_files()
        matches: list[tuple[str, GalleryItem]] = []
        for path in files:
            try:
                metadata = self._read_sidecar(path) or {}
                # Visibility precedes every other filter and the total count.
                if metadata.get("gallery_saved", True) is False:
                    continue
                if metadata.get("is_private") is True and not (
                    viewer_id and metadata.get("user_id") == viewer_id
                ):
                    continue
                if user_id and metadata.get("user_id") != user_id:
                    continue
                item = self._gallery_item(
                    path,
                    viewer_id=viewer_id if metadata.get("user_id") == viewer_id else None,
                )
                if collection_keys is not None and item.key not in collection_keys:
                    continue
                if not _gallery_matches_source(
                    metadata, normalized_source, origin
                ):
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
                if needle and not _gallery_matches_query(item, metadata, needle):
                    continue
                if not _gallery_matches_media_type(item, normalized_media or None):
                    continue
                matches.append((_gallery_sort_key(item, normalized_sort), item))
            except (OSError, ValueError) as exc:
                logger.debug(
                    "Skipping unreadable gallery asset during listing (%s)",
                    type(exc).__name__,
                )
                continue

        matches.sort(key=lambda entry: entry[0])
        total = len(matches)
        start = max(0, int(offset))
        stop = start + max(1, int(limit))
        return [item for _, item in matches[start:stop]], total

    def get_asset(self, key: str, viewer_id: str | None = None) -> GalleryItem:
        path = (self.root / key).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise StorageError("Invalid asset key") from exc
        if not path.is_file() or path.suffix.lower() not in ASSET_EXTENSIONS:
            raise FileNotFoundError(key)
        return self._gallery_item(
            path,
            viewer_id=viewer_id
            if viewer_id and metadata_owner(self._read_sidecar(path)) == viewer_id
            else None,
        )

    # ------------------------------------------------------------------ #
    # Guarded media serving
    # ------------------------------------------------------------------ #

    @staticmethod
    def _reject_key(key: str) -> None:
        """Reject paths that are not plain relative POSIX storage keys."""
        if not isinstance(key, str) or not key.strip() or "\x00" in key:
            raise MediaNotFound(key)
        if "\\" in key or key.startswith("/"):
            raise MediaNotFound(key)
        if len(key) > 1 and key[1] == ":":
            raise MediaNotFound(key)
        if any(segment in ("", ".", "..") for segment in key.split("/")):
            raise MediaNotFound(key)
        try:
            decoded = key.encode("latin-1").decode("unicode_escape")
        except (UnicodeEncodeError, UnicodeDecodeError):
            decoded = key
        if decoded != key and ("\\" in decoded or ".." in decoded.split("/")):
            raise MediaNotFound(key)
        if "%" in key:
            from urllib.parse import unquote

            decoded_key = unquote(key)
            if decoded_key != key and (
                "\\" in decoded_key
                or decoded_key.startswith("/")
                or ".." in decoded_key.split("/")
                or (len(decoded_key) > 1 and decoded_key[1] == ":")
            ):
                raise MediaNotFound(key)

    def resolve_media(self, key: str, *, allow_audio: bool = False) -> MediaAccess:
        """Resolve a stored media key to a containment-checked file.

        Raises ``MediaNotFound`` for anything that is not a readable media file
        under ``STORAGE_DIR`` (including encoded traversal and symlink escapes).
        """
        self._reject_key(key)
        if is_forbidden_artifact(key):
            raise MediaNotFound(key)
        candidate = self.root / key
        try:
            path = candidate.resolve(strict=True)
        except (OSError, RuntimeError, ValueError) as exc:
            raise MediaNotFound(key) from exc
        try:
            path.relative_to(self.root)
        except ValueError as exc:
            raise MediaNotFound(key) from exc
        if not path.is_file() or path.suffix.lower() not in READABLE_EXTENSIONS:
            raise MediaNotFound(key)
        if path.suffix.lower() in AUDIO_EXTENSIONS and not allow_audio:
            # Audio is an input-only upload; it never has a media surface.
            raise MediaNotFound(key)
        metadata = self._read_sidecar(path)
        return MediaAccess(
            key=key,
            path=path,
            owner_id=metadata_owner(metadata),
            is_private=_metadata_is_private(metadata),
            is_public=is_public_metadata(metadata),
            is_saved=not (
                isinstance(metadata, dict)
                and metadata.get("gallery_saved") is False
            ),
        )

    def is_asset_reference_visible(self, key: str, viewer_id: str | None) -> bool:
        """Visibility policy for endpoints that only *name* an asset key.

        Likes/remix and tag counts never serve bytes, so they reuse the gallery
        visibility rules rather than the stricter ``/files`` fail-closed rule:
        a foreign private/unsaved asset is hidden, while a public asset or a
        legacy ownerless media file stays addressable (matching ``list_related``
        public scope and the old gallery behavior).
        """
        try:
            access = self.resolve_media(key, allow_audio=True)
        except (MediaNotFound, OSError, ValueError):
            return False
        if access.is_public:
            return True
        if access.owner_id:
            return bool(viewer_id and access.owner_id == viewer_id)
        if access.is_private:
            # Unsaved/private ownerless media has no owner to authorize.
            return False
        return True

    def media_file_exists(self, key: str) -> bool:
        """True when ``key`` names an existing readable media file under root.

        Used only to decide whether a DB row is legacy metadata (no file, no
        sidecar) or points at an existing file whose sidecar visibility must
        win over the DB row's stale flags.
        """
        try:
            self.resolve_media(key, allow_audio=True)
        except (MediaNotFound, OSError, ValueError):
            return False
        return True

    def authorize_media(
        self,
        key: str,
        *,
        viewer_id: str | None = None,
        capability: str | None = None,
        allow_audio: bool = False,
    ) -> MediaAccess:
        """Serve-time authorization; re-reads the sidecar every call.

        Public assets are readable by anyone. Private/unsaved assets require a
        valid ``asset-read`` capability whose viewer is still the owner.
        """
        access = self.resolve_media(key, allow_audio=allow_audio)
        if access.is_public or is_public_avatar(key):
            return access
        if not access.owner_id:
            raise MediaNotFound(key)
        viewer = viewer_id
        if capability:
            capability_viewer = verify_capability(
                capability, key, settings=self.settings
            )
            if capability_viewer and (
                viewer is None or capability_viewer == viewer
            ):
                viewer = capability_viewer
        if viewer and viewer == access.owner_id:
            return access
        raise MediaNotFound(key)

    def get_image(self, key: str) -> GalleryItem:
        return self.get_asset(key)

    @staticmethod
    def _related_model_ids(metadata: dict[str, Any]) -> set[str]:
        """Normalized model ids referenced by an asset's sidecar.

        Covers the base checkpoint (``model_id``), an adapter's linked base
        (``base_model_id``), and every LoRA entry (``model_id`` or the legacy
        ``lora_model_id``). Anything that is not a non-empty string is ignored.
        """
        ids: set[str] = set()
        for field in ("model_id", "base_model_id"):
            value = metadata.get(field)
            if isinstance(value, str) and value.strip():
                ids.add(value.strip().casefold())
        loras = metadata.get("loras")
        if isinstance(loras, list):
            for entry in loras:
                if not isinstance(entry, dict):
                    continue
                for field in ("model_id", "lora_model_id"):
                    value = entry.get(field)
                    if isinstance(value, str) and value.strip():
                        ids.add(value.strip().casefold())
        return ids

    @staticmethod
    def _related_tag_set(metadata: dict[str, Any]) -> set[str]:
        """Normalized tags from a sidecar; non-string entries are ignored."""
        tags = metadata.get("tags")
        if not isinstance(tags, (list, tuple, set)):
            return set()
        return {
            tag.strip().casefold()
            for tag in tags
            if isinstance(tag, str) and tag.strip()
        }

    def _sidecar_escapes_root(self, asset_path: Path) -> bool:
        try:
            self._metadata_path(asset_path).resolve().relative_to(self.root)
        except (OSError, RuntimeError, ValueError):
            return True
        return False

    def _related_anchor(self, key: str) -> tuple[GalleryItem, dict[str, Any]]:
        """Resolve the anchor with strict key checks plus ``get_asset`` containment."""
        if not isinstance(key, str) or not key.strip() or "\x00" in key:
            raise StorageError("Invalid asset key")
        if "\\" in key:
            raise StorageError("Invalid asset key")
        segments = key.split("/")
        if key.startswith("/") or ".." in segments:
            raise StorageError("Invalid asset key")
        if len(key) > 1 and key[1] == ":":
            raise StorageError("Invalid asset key")
        try:
            path = (self.root / key).resolve()
            path.relative_to(self.root)
        except (OSError, RuntimeError, ValueError) as exc:
            raise StorageError("Invalid asset key") from exc
        if self._sidecar_escapes_root(path):
            raise StorageError("Invalid asset key")
        item = self.get_asset(key)
        metadata = item.metadata if isinstance(item.metadata, dict) else None
        if metadata is None:
            raise PermissionError("Asset has no owner")
        return item, metadata

    def list_related(
        self,
        key: str,
        *,
        user_id: str,
        page: int = 1,
        limit: int = 12,
        mode: str = "all",
        scope: str = "own",
    ) -> tuple[list[GalleryItem], int]:
        """Assets related to ``key`` by model usage or shared tags.

        Relations are derived from live sidecars (never the relational DB, whose
        ``metadata_json`` goes stale after tagging). ``scope="own"`` (the default)
        keeps the original contract: the anchor must belong to ``user_id`` and only
        that viewer's gallery-visible assets are candidates, ranked model matches
        first, then shared-tag count, then newest, then key.

        ``scope="public"`` lets a gallery-visible anchor (the viewer's, or one with
        ``gallery_saved`` not ``False`` and no ``is_private``) serve relations from
        every gallery-visible, non-private asset; the viewer's own matches rank
        ahead of foreign ones. Ownerless legacy sidecars count as gallery-visible,
        matching ``list_recent``. ``public`` returns the same ``GalleryItem`` shape
        the unauthenticated ``GET /api/v1/assets/{key}`` already exposes; only the
        relation list is new. Unknown scopes fall back to ``own``.

        ``ponytail``: this rescans ``STORAGE_DIR`` on every call. That is
        acceptable for the local single-user library; if the tree grows past a
        few thousand assets, back it with an mtime-keyed index or a cached scan.
        """
        if scope not in RELATED_SCOPES:
            scope = "own"
        anchor, anchor_meta = self._related_anchor(key)

        anchor_owner = anchor_meta.get("user_id")
        own_anchor = (
            isinstance(user_id, str)
            and bool(user_id.strip())
            and isinstance(anchor_owner, str)
            and anchor_owner == user_id
        )
        if not own_anchor:
            if scope != "public":
                raise PermissionError("Asset does not belong to this user")
            public_anchor = (
                anchor_meta.get("gallery_saved", True) is not False
                and not anchor_meta.get("is_private")
            )
            if not public_anchor:
                raise PermissionError("Asset is not publicly viewable")

        anchor_models = self._related_model_ids(anchor_meta)
        anchor_tags = self._related_tag_set(anchor_meta)

        try:
            page = max(1, int(page))
        except (TypeError, ValueError):
            page = 1
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 12
        limit = min(max(1, limit), MAX_RELATED_PAGE_SIZE)
        if mode not in RELATED_MODES:
            mode = "all"

        candidates: list[tuple[bool, bool, int, float, str, GalleryItem]] = []
        if anchor_models or anchor_tags:
            for path in self._asset_files():
                try:
                    resolved = path.resolve()
                    resolved.relative_to(self.root)
                except (OSError, RuntimeError, ValueError):
                    continue
                if self._sidecar_escapes_root(resolved):
                    continue
                try:
                    item = self._gallery_item(resolved)
                except (OSError, ValueError) as exc:
                    # One vanished/unreadable file must not fail the whole scan.
                    logger.debug(
                        "Skipping unreadable gallery asset during related scan (%s)",
                        type(exc).__name__,
                    )
                    continue
                metadata = item.metadata if isinstance(item.metadata, dict) else None
                if metadata is None:
                    continue
                if item.key == anchor.key:
                    continue
                if metadata.get("gallery_saved", True) is False:
                    continue
                if metadata.get("is_private"):
                    continue
                owner = metadata.get("user_id")
                is_own = isinstance(owner, str) and owner == user_id
                if scope == "own" and not is_own:
                    continue

                model_matched = bool(anchor_models & self._related_model_ids(metadata))
                shared_tags = len(anchor_tags & self._related_tag_set(metadata))
                if mode == "model":
                    matched = model_matched
                elif mode == "tags":
                    matched = shared_tags > 0
                else:
                    matched = model_matched or shared_tags > 0
                if not matched:
                    continue

                try:
                    mtime = resolved.stat().st_mtime
                except OSError as exc:
                    logger.debug(
                        "Skipping vanished gallery asset during related scan (%s)",
                        type(exc).__name__,
                    )
                    continue
                candidates.append((not is_own, model_matched, shared_tags, mtime, item.key, item))

        # Own first (``own`` scope is all-own, so its order is unchanged), then
        # model matches, most shared tags, newest, then key ascending (stable
        # page boundaries when timestamps collide).
        candidates.sort(key=lambda c: (c[0], not c[1], -c[2], -c[3], c[4]))

        total = len(candidates)
        start = (page - 1) * limit
        page_items = [candidate[5] for candidate in candidates[start : start + limit]]
        return page_items, total

    async def get_image_bytes(
        self,
        key: str,
        *,
        viewer_id: str | None = None,
        capability: str | None = None,
        allow_audio: bool = False,
    ) -> bytes:
        """Read a stored upload back into memory for reuse as a ComfyUI input.

        This is a trust boundary too: a caller must not be able to launder a
        foreign private/unsaved asset into their own run by naming its key (or
        an unsigned ``/files`` URL) as a reference image. The same visibility
        policy as ``/files`` applies, so only public media or the viewer's own
        media (bearer or scoped capability) can be read.
        """
        access = self.authorize_media(
            key,
            viewer_id=viewer_id,
            capability=capability,
            allow_audio=allow_audio,
        )
        try:
            return access.path.read_bytes()
        except OSError as exc:
            raise StorageError(f"Could not read stored asset: {exc}") from exc

    def set_saved(
        self, key: str, saved: bool, viewer_id: str | None = None
    ) -> GalleryItem:
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
        return self._gallery_item(path, viewer_id=viewer_id)

    def update_tags(
        self, key: str, tags: list[str], viewer_id: str | None = None
    ) -> GalleryItem:
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
        return self._gallery_item(path, viewer_id=viewer_id)

    def list_popular_tags(
        self,
        limit: int = 50,
        user_id: str | None = None,
        viewer_id: str | None = None,
    ) -> list[dict[str, Any]]:
        self.ensure_root()
        counts: dict[str, int] = {}
        for p in self.root.rglob("*.json"):
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
                if not isinstance(raw, dict):
                    continue
                if user_id and raw.get("user_id") != user_id:
                    continue
                # Tag counts must not reveal another user's private/unsaved
                # assets. Ownerless legacy sidecars stay counted (matching the
                # gallery/related legacy policy); malformed or non-dict
                # sidecars are skipped.
                if raw.get("gallery_saved") is False or raw.get("is_private") is True:
                    owner = metadata_owner(raw)
                    if not (viewer_id and owner and owner == viewer_id):
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
