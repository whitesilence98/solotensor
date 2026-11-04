"""Guarded media access policy and short-lived media capabilities.

Generated assets live under ``STORAGE_DIR`` and are served only through
``GET/HEAD /files/{key}``. A sidecar (*.png.json) is the authorization source:

* public:     sidecar is a dict, owner is a non-empty string,
              ``gallery_saved is not False`` and ``is_private is not True``;
* owner:      private/unsaved assets are readable by their owner, for whom the
              response URLs carry a short-lived ``asset-read`` capability.

Capabilities are HMAC-SHA256 tokens scoped to the exact key and viewer with a
purpose separation so a session JWT can never be replayed as a media credential.
Serving re-reads the sidecar, so an owner/privacy change defeats a stale token.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Optional
from urllib.parse import quote

from ..config import Settings, get_settings

CAPABILITY_PURPOSE = "asset-read"
CAPABILITY_TTL_SECONDS = 300
MAX_CAPABILITY_TTL_SECONDS = 600
CAPABILITY_PARAM = "cap"

PUBLIC_AVATAR_PREFIX = "avatars/"


class MediaAccessError(Exception):
    """Base class for media authorization failures."""


class MediaNotFound(MediaAccessError):
    """The key does not resolve to a readable media file."""


class MediaForbidden(MediaAccessError):
    """The key exists but the caller may not read it."""


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def capability_secret(settings: Optional[Settings] = None) -> bytes:
    """Derive a purpose-separated key so JWTs cannot be used as media tokens."""
    settings = settings or get_settings()
    return hmac.new(
        str(settings.JWT_SECRET).encode("utf-8"),
        CAPABILITY_PURPOSE.encode("utf-8"),
        hashlib.sha256,
    ).digest()


def sign_capability(
    key: str,
    viewer_id: str,
    *,
    settings: Optional[Settings] = None,
    ttl_seconds: int = CAPABILITY_TTL_SECONDS,
    now: Optional[int] = None,
) -> tuple[str, int]:
    """Return ``(token, expires_at_epoch)`` for the exact key and viewer."""
    issued = int(time.time() if now is None else now)
    ttl = max(1, min(int(ttl_seconds), MAX_CAPABILITY_TTL_SECONDS))
    payload = {
        "p": CAPABILITY_PURPOSE,
        "k": key,
        "v": viewer_id,
        "iat": issued,
        "exp": issued + ttl,
    }
    body = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    sig = hmac.new(
        capability_secret(settings), body.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{body}.{_b64url_encode(sig)}", payload["exp"]


def verify_capability(
    token: str,
    key: str,
    *,
    settings: Optional[Settings] = None,
    now: Optional[int] = None,
) -> Optional[str]:
    """Return the viewer id for a valid capability, else ``None``."""
    if not token or not key or "." not in token:
        return None
    body, _, sig_b64 = token.partition(".")
    try:
        actual = _b64url_decode(sig_b64)
        expected = hmac.new(
            capability_secret(settings), body.encode("ascii"), hashlib.sha256
        ).digest()
    except Exception:
        # A malformed/unicode token must fail closed, never 500.
        return None
    if not hmac.compare_digest(expected, actual):
        return None
    try:
        payload = json.loads(_b64url_decode(body).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("p") != CAPABILITY_PURPOSE:
        return None
    if payload.get("k") != key:
        return None
    viewer = payload.get("v")
    if not isinstance(viewer, str) or not viewer.strip():
        return None
    try:
        exp = int(payload.get("exp", 0))
    except (TypeError, ValueError):
        return None
    current = int(time.time() if now is None else now)
    # Expiry is exclusive: a token is unusable from its ``exp`` second onward.
    if exp <= current or exp > current + MAX_CAPABILITY_TTL_SECONDS:
        return None
    return viewer


def signed_media_url(
    key: str,
    viewer_id: str,
    *,
    settings: Optional[Settings] = None,
    ttl_seconds: int = CAPABILITY_TTL_SECONDS,
) -> tuple[str, str]:
    """Return ``(url, expires_at_iso)`` for a capability-protected key."""
    from datetime import datetime, timezone

    token, expires_at = sign_capability(
        key, viewer_id, settings=settings, ttl_seconds=ttl_seconds
    )
    base = str(settings.FILES_PUBLIC_BASE if settings else get_settings().FILES_PUBLIC_BASE)
    url = f"{base.rstrip('/')}/files/{quote(key, safe='/')}?{CAPABILITY_PARAM}={token}"
    iso = datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat()
    return url, iso


def is_public_metadata(metadata: Any) -> bool:
    """Fail-closed public visibility test for a generation sidecar."""
    if not isinstance(metadata, dict):
        return False
    owner = metadata.get("user_id")
    if not isinstance(owner, str) or not owner.strip():
        return False
    if metadata.get("gallery_saved", True) is False:
        return False
    if metadata.get("is_private") is True:
        return False
    return True


def metadata_owner(metadata: Any) -> Optional[str]:
    if not isinstance(metadata, dict):
        return None
    owner = metadata.get("user_id")
    if isinstance(owner, str) and owner.strip():
        return owner
    return None


def is_public_avatar(key: str) -> bool:
    """Avatars are the only public storage media namespace.

    ``routers/auth.upload_avatar`` is the sole writer and stores
    ``<owner>/avatars/<uuid>.<ext>``; the legacy top-level ``avatars/`` prefix is
    accepted too. Tool thumbnails and model samples have dedicated routes;
    everything else, including JSON artifacts, fails closed here.
    """
    if key.startswith(PUBLIC_AVATAR_PREFIX):
        return True
    segments = key.split("/")
    return len(segments) == 3 and segments[1] == "avatars" and bool(segments[0])


def is_forbidden_artifact(key: str) -> bool:
    """Sidecars, configs and workflows must never be served as media."""
    lowered = key.lower()
    if lowered.endswith(".json"):
        return True
    if "/." in f"/{lowered}" or lowered.startswith("."):
        return True
    name = lowered.rsplit("/", 1)[-1]
    if name in {"workflow_api.json", "workflow.json", "config.json"}:
        return True
    return False
