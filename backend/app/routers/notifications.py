"""SoloTensor Notification API Routes.

Provides endpoints for retrieving user notifications, querying unread badge counts,
marking notifications as read, and deleting notifications.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..routers.auth import get_current_user
from ..schemas import (
    NotificationItem,
    NotificationListResponse,
    NotificationReadResponse,
    NotificationUnreadCountResponse,
    UserResponse,
)
from ..services.notification_service import (
    NotificationService,
    get_notification_service,
)

logger = logging.getLogger("solotensor.router.notifications")

router = APIRouter(tags=["notifications"])


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="List in-app notifications for authenticated user",
)
async def list_notifications(
    unread_only: bool = Query(False, description="Filter only unread notifications"),
    category: Optional[str] = Query(None, description="Filter by category (moderation, generation, social, system)"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    user: UserResponse = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationListResponse:
    """Retrieve paginated notifications for the authenticated user."""
    items_raw, total, unread_count = service.list_notifications(
        user_id=user.id,
        unread_only=unread_only,
        category=category,
        page=page,
        limit=limit,
    )
    items = [NotificationItem(**item) for item in items_raw]
    return NotificationListResponse(
        items=items,
        total=total,
        unread_count=unread_count,
        page=page,
        limit=limit,
    )


@router.get(
    "/unread-count",
    response_model=NotificationUnreadCountResponse,
    summary="Get unread notification count for badge rendering",
)
async def get_unread_notification_count(
    user: UserResponse = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationUnreadCountResponse:
    """Retrieve unread notification count for notification bells and badges."""
    count = service.get_unread_count(user_id=user.id)
    return NotificationUnreadCountResponse(unread_count=count)


@router.post(
    "/{notification_id}/read",
    response_model=NotificationReadResponse,
    summary="Mark a specific notification as read",
)
async def mark_notification_read(
    notification_id: str,
    user: UserResponse = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationReadResponse:
    """Mark a single notification as read if owned by the current user."""
    updated = service.mark_as_read(notification_id=notification_id, user_id=user.id)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification '{notification_id}' not found or already read",
        )
    return NotificationReadResponse(success=True, id=notification_id)


@router.post(
    "/read-all",
    response_model=NotificationReadResponse,
    summary="Mark all unread notifications as read",
)
async def mark_all_notifications_read(
    user: UserResponse = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationReadResponse:
    """Mark all unread notifications for the authenticated user as read."""
    count = service.mark_all_as_read(user_id=user.id)
    return NotificationReadResponse(success=True, updated_count=count)


@router.delete(
    "/{notification_id}",
    response_model=NotificationReadResponse,
    summary="Delete/dismiss a notification",
)
async def delete_notification(
    notification_id: str,
    user: UserResponse = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationReadResponse:
    """Delete a notification owned by the current user."""
    deleted = service.delete_notification(notification_id=notification_id, user_id=user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification '{notification_id}' not found",
        )
    return NotificationReadResponse(success=True, id=notification_id)
