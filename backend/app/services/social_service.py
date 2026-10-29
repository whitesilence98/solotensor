"""SoloTensor Social Service.

Business rules for model stars, comments, comment likes, gallery-asset likes,
download events, and the social notifications those actions emit.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from ..db import Database, get_db
from .notification_service import NotificationService, get_notification_service

logger = logging.getLogger("solotensor.service.social")

MAX_COMMENT_LENGTH = 2000
COMMENT_NOTIFICATION_PREVIEW = 140


class SocialError(Exception):
    """Base error for social interactions."""


class SocialNotFound(SocialError):
    """Raised when the target model, comment, or asset does not exist or is not visible."""


class SocialForbidden(SocialError):
    """Raised when a viewer is not allowed to perform a social action."""


class SocialValidationError(SocialError):
    """Raised when social input fails validation."""


class SocialService:
    """Service layer for model stars, comments, likes, and download events."""

    def __init__(
        self,
        db: Optional[Database] = None,
        notifications: Optional[NotificationService] = None,
    ) -> None:
        self._db: Optional[Database] = db
        self._notifications: Optional[NotificationService] = notifications

    @property
    def db(self) -> Database:
        return self._db if self._db is not None else get_db()

    @db.setter
    def db(self, val: Optional[Database]) -> None:
        self._db = val

    @property
    def notifications(self) -> NotificationService:
        return self._notifications if self._notifications is not None else get_notification_service()

    @notifications.setter
    def notifications(self, val: Optional[NotificationService]) -> None:
        self._notifications = val

    def get_model_social(self, model_id: str, viewer_id: Optional[str] = None) -> dict[str, Any]:
        """Return public star/comment/download counts and the viewer's star state."""
        self._require_public_model(model_id)
        runs = self.db.get_model_run_count_map([model_id]) or {}
        return {
            "model_id": model_id,
            "star_count": int(self.db.get_model_star_count(model_id)),
            "comment_count": int(self.db.get_model_comment_count(model_id)),
            "download_count": int(self.db.get_model_download_count(model_id)),
            "run_count": int(runs.get(model_id) or 0),
            "viewer_starred": bool(
                viewer_id and self.db.has_model_star(viewer_id, model_id)
            ),
        }

    def get_stats_map(self, model_ids: list[str]) -> dict[str, dict[str, int]]:
        """Return merged social and run counts for each model, defaulting missing keys to zero."""
        social = self.db.get_model_social_map(model_ids) or {}
        runs = self.db.get_model_run_count_map(model_ids) or {}
        stats: dict[str, dict[str, int]] = {}
        for model_id in model_ids:
            entry = social.get(model_id) or {}
            stats[model_id] = {
                "star_count": int(entry.get("star_count") or 0),
                "comment_count": int(entry.get("comment_count") or 0),
                "download_count": int(entry.get("download_count") or 0),
                "run_count": int(runs.get(model_id) or 0),
            }
        return stats

    def list_comments(
        self,
        model_id: str,
        viewer_id: Optional[str],
        sort: str = "latest",
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int]:
        """Return a page of visible comments for a public model plus the total count."""
        self._require_public_model(model_id)
        safe_page = max(1, int(page or 1))
        safe_limit = min(max(1, int(limit or 20)), 100)
        return self.db.list_model_comments(model_id, viewer_id, sort, safe_page, safe_limit)

    def toggle_star(self, viewer_id: str, model_id: str) -> dict[str, Any]:
        """Toggle the viewer's star on a public model and notify the owner on a new star."""
        owner_id = self._require_public_model(model_id)
        starred, star_count = self.db.toggle_model_star(viewer_id, model_id)
        if starred:
            self._notify_model_star(owner_id, viewer_id, model_id)
        return {"model_id": model_id, "starred": bool(starred), "star_count": int(star_count)}

    def add_comment(self, viewer_id: str, model_id: str, body: str) -> dict[str, Any]:
        """Normalize and validate a comment body, store it, and notify the model owner."""
        owner_id = self._require_public_model(model_id)
        normalized = " ".join(str(body or "").split())
        if not normalized:
            raise SocialValidationError("Comment body cannot be empty.")
        if len(normalized) > MAX_COMMENT_LENGTH:
            raise SocialValidationError(f"Comment body cannot exceed {MAX_COMMENT_LENGTH} characters.")
        comment = self.db.add_model_comment(model_id, viewer_id, normalized)
        self._notify_model_comment(owner_id, viewer_id, model_id, comment)
        return comment

    def delete_comment(self, comment_id: str, requester_id: str) -> bool:
        """Soft-delete a comment on a visible model; ownership/moderation is enforced by the route."""
        comment = self.db.get_model_comment(comment_id)
        if not comment or comment.get("is_deleted"):
            raise SocialNotFound("Comment not found.")
        self._require_public_model(comment["model_id"])
        return bool(self.db.soft_delete_model_comment(comment_id))

    def toggle_comment_like(self, viewer_id: str, comment_id: str) -> dict[str, Any]:
        """Toggle the viewer's like on an existing, non-deleted comment on a visible model."""
        comment = self.db.get_model_comment(comment_id)
        if not comment or comment.get("is_deleted"):
            raise SocialNotFound("Comment not found.")
        self._require_public_model(comment["model_id"])
        liked, like_count = self.db.toggle_comment_like(viewer_id, comment_id)
        return {"comment_id": comment_id, "liked": bool(liked), "like_count": int(like_count)}

    def toggle_asset_like(self, viewer_id: str, asset_key: str) -> dict[str, Any]:
        """Toggle the viewer's like on a gallery asset key."""
        if not asset_key or not str(asset_key).strip():
            raise SocialValidationError("Asset key cannot be empty.")
        liked, like_count = self.db.toggle_asset_like(viewer_id, asset_key)
        return {"key": asset_key, "liked": bool(liked), "like_count": int(like_count)}

    def record_download(
        self,
        model_id: str,
        version_id: Optional[str],
        file_id: Optional[str],
        viewer_id: Optional[str],
    ) -> None:
        """Record a model download event without ever failing the download itself."""
        try:
            self.db.record_model_download(model_id, version_id, file_id, viewer_id)
        except Exception:
            logger.warning("Failed to record download for model %s", model_id, exc_info=True)

    def on_asset_deleted(self, asset_key: str) -> None:
        """Best-effort removal of likes for a deleted gallery asset."""
        try:
            self.db.delete_asset_likes(asset_key)
        except Exception:
            logger.warning("Failed to clear likes for asset %s", asset_key, exc_info=True)

    def _require_public_model(self, model_id: str) -> str:
        """Return the owner of a public published model or raise SocialNotFound."""
        owner_id = self.db.get_public_model_owner(model_id)
        if owner_id is None:
            raise SocialNotFound("Model not found.")
        return owner_id

    def _actor_name(self, user_id: str) -> str:
        """Return a display name for the acting user, falling back to a neutral label."""
        user = self.db.get_user_by_id(user_id) or {}
        return str(user.get("username") or user.get("display_name") or "Someone")

    def _notify_model_star(self, owner_id: Optional[str], viewer_id: str, model_id: str) -> None:
        """Emit a model_starred notification, never failing the star action."""
        if owner_id is None or owner_id == viewer_id:
            return
        try:
            actor = self._actor_name(viewer_id)
            self.notifications.notify_user(
                user_id=owner_id,
                title="New star on your model",
                message=f"{actor} starred your model.",
                category="social",
                type="model_starred",
                actor_id=viewer_id,
                link=f"/models/{model_id}",
                metadata={"model_id": model_id},
            )
        except Exception:
            logger.warning("Failed to emit star notification for model %s", model_id, exc_info=True)

    def _notify_model_comment(
        self,
        owner_id: Optional[str],
        viewer_id: str,
        model_id: str,
        comment: dict[str, Any],
    ) -> None:
        """Emit a model_commented notification, never failing the comment action."""
        if owner_id is None or owner_id == viewer_id:
            return
        try:
            actor = self._actor_name(viewer_id)
            preview = " ".join(str(comment.get("body") or "").split())
            message = f'{actor} commented: "{preview}"'[:COMMENT_NOTIFICATION_PREVIEW]
            self.notifications.notify_user(
                user_id=owner_id,
                title="New comment on your model",
                message=message,
                category="social",
                type="model_commented",
                actor_id=viewer_id,
                link=f"/models/{model_id}",
                metadata={"model_id": model_id, "comment_id": comment.get("id")},
            )
        except Exception:
            logger.warning("Failed to emit comment notification for model %s", model_id, exc_info=True)


_default_social_service: Optional[SocialService] = None


def get_social_service() -> SocialService:
    """Return singleton SocialService instance."""
    global _default_social_service
    if _default_social_service is None:
        _default_social_service = SocialService()
    return _default_social_service


def set_social_service(service: Optional[SocialService]) -> None:
    """Setter for testing and runtime mock overrides."""
    global _default_social_service
    _default_social_service = service
