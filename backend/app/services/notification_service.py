"""SoloTensor Notification Service.

Handles in-app notification creation, user notification dispatch, role-based
fan-out (e.g. notifying all moderators/admins), and notification state management.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from ..db import Database, get_db

logger = logging.getLogger("solotensor.service.notifications")


class NotificationService:
    """Service layer managing in-app notifications and fan-out dispatch."""

    def __init__(self, db: Optional[Database] = None) -> None:
        self.db: Database = db or get_db()

    def notify_user(
        self,
        user_id: str,
        title: str,
        message: str,
        category: str = "system",
        type: str = "general",
        actor_id: Optional[str] = None,
        link: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Dispatch a single in-app notification to a specific user."""
        try:
            return self.db.create_notification(
                user_id=user_id,
                title=title,
                message=message,
                category=category,
                type=type,
                actor_id=actor_id,
                link=link,
                metadata=metadata or {},
            )
        except Exception as exc:
            logger.error("Failed to create notification for user %s: %s", user_id, exc, exc_info=True)
            return {
                "id": "",
                "user_id": user_id,
                "actor_id": actor_id,
                "category": category,
                "type": type,
                "title": title,
                "message": message,
                "link": link,
                "metadata": metadata or {},
                "is_read": False,
                "created_at": "",
            }

    def notify_role(
        self,
        role: str,
        title: str,
        message: str,
        category: str = "moderation",
        type: str = "general",
        actor_id: Optional[str] = None,
        link: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        exclude_user_ids: Optional[list[str]] = None,
    ) -> list[dict[str, Any]]:
        """Fan out a notification to all users possessing a specific role (e.g. moderator, admin)."""
        excluded = set(exclude_user_ids or [])
        if actor_id:
            excluded.add(actor_id)

        target_user_ids = self.db.get_users_by_role(role)
        results: list[dict[str, Any]] = []

        for uid in target_user_ids:
            if uid in excluded:
                continue
            notif = self.notify_user(
                user_id=uid,
                title=title,
                message=message,
                category=category,
                type=type,
                actor_id=actor_id,
                link=link,
                metadata=metadata,
            )
            results.append(notif)

        return results

    def list_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        category: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict[str, Any]], int, int]:
        """Fetch paginated notifications, total matched count, and global unread count."""
        return self.db.get_notifications(
            user_id=user_id,
            unread_only=unread_only,
            category=category,
            page=page,
            limit=limit,
        )

    def get_unread_count(self, user_id: str) -> int:
        """Fetch total unread notification count for a user."""
        return self.db.get_unread_notification_count(user_id)

    def mark_as_read(self, notification_id: str, user_id: str) -> bool:
        """Mark a notification as read if owned by the user."""
        return self.db.mark_notification_as_read(notification_id, user_id)

    def mark_all_as_read(self, user_id: str) -> int:
        """Mark all unread notifications for a user as read."""
        return self.db.mark_all_notifications_as_read(user_id)

    def delete_notification(self, notification_id: str, user_id: str) -> bool:
        """Delete/dismiss a notification record."""
        return self.db.delete_notification(notification_id, user_id)


_default_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Return singleton NotificationService instance."""
    global _default_notification_service
    if _default_notification_service is None:
        _default_notification_service = NotificationService()
    return _default_notification_service


def set_notification_service(service: Optional[NotificationService]) -> None:
    """Setter for testing and runtime mock overrides."""
    global _default_notification_service
    _default_notification_service = service
