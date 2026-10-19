"""Comprehensive unit and integration tests for the SoloTensor Notification System.

Validates:
1. DB storage layer: CRUD, category filtering, unread counting, user isolation, and role lookup.
2. Service layer: notify_user, notify_role fan-out, unread counting, and mark-as-read.
3. API endpoints: /api/v1/notifications, /unread-count, /{id}/read, /read-all, and /{id} deletion.
4. Security & Isolation: 401 unauthenticated enforcement and strict cross-user ownership checks.
"""

from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app
from app.schemas import (
    NotificationCategory,
    NotificationItem,
    NotificationListResponse,
    NotificationReadResponse,
    NotificationType,
    NotificationUnreadCountResponse,
)
from app.services.auth_service import LocalAuthProvider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.notification_service import (
    NotificationService,
    get_notification_service,
    set_notification_service,
)
from app.services.rbac_service import RBACService, set_rbac_service


class NotificationSystemTests(unittest.TestCase):
    """Integration test suite for the In-App Notification System."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_path = Path(self.temp_dir.name)
        self.db_path = str(self.base_path / "test_notifications.db")

        self.settings = Settings(
            DB_PATH=self.db_path,
            JWT_SECRET="notification-test-jwt-secret-key-32chars!",
        )

        self.db = Database(db_path=self.db_path, settings=self.settings)
        self.db.init_db()

        self.credits = CreditService(db=self.db, settings=self.settings)
        self.auth = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)
        self.rbac = RBACService(db=self.db)
        self.notification_service = NotificationService(db=self.db)

        set_db(self.db)
        set_auth_provider(self.auth)
        set_credit_service(self.credits)
        set_rbac_service(self.rbac)
        set_notification_service(self.notification_service)

        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_notification_service] = lambda: self.notification_service

        self.client = TestClient(app)

        # Create test users
        self.creator = self.auth.create_user(
            email="creator@solotensor.ai",
            username="notif_creator",
            password="Password123!",
            display_name="Notification Creator",
        )
        self.moderator = self.auth.create_user(
            email="moderator@solotensor.ai",
            username="notif_mod",
            password="Password123!",
            display_name="Notification Moderator",
        )
        self.db.assign_user_role(self.moderator.id, "moderator")
        self.moderator.role = "moderator"
        self.moderator.roles = ["moderator", "creator"]

        self.user2 = self.auth.create_user(
            email="user2@solotensor.ai",
            username="other_user",
            password="Password123!",
            display_name="Other User",
        )

        # Issue tokens
        self.creator_token = self.auth.create_token(self.creator)
        self.mod_token = self.auth.create_token(self.moderator)
        self.user2_token = self.auth.create_token(self.user2)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        set_notification_service(None)
        self.temp_dir.cleanup()

    # --- DB Layer Unit Tests ------------------------------------------------

    def test_db_create_and_fetch_notification(self) -> None:
        """Verify DB layer creates notification and correctly populates actor join."""
        notif = self.db.create_notification(
            user_id=self.creator.id,
            title="Model Approved",
            message="Your model Cyberpunk LoRA has been approved.",
            category="moderation",
            type="model_approved",
            actor_id=self.moderator.id,
            link="/models/model-123",
            metadata={"model_id": "model-123"},
        )

        self.assertIsNotNone(notif["id"])
        self.assertEqual(notif["user_id"], self.creator.id)
        self.assertEqual(notif["actor_id"], self.moderator.id)
        self.assertEqual(notif["actor_username"], "notif_mod")
        self.assertEqual(notif["category"], "moderation")
        self.assertEqual(notif["type"], "model_approved")
        self.assertFalse(notif["is_read"])
        self.assertEqual(notif["metadata"]["model_id"], "model-123")

    def test_db_category_filtering_and_counts(self) -> None:
        """Verify notifications can be filtered by category and unread state."""
        # Create 2 moderation, 1 system for creator
        self.db.create_notification(
            user_id=self.creator.id,
            title="Mod Alert 1",
            message="Alert 1",
            category="moderation",
        )
        self.db.create_notification(
            user_id=self.creator.id,
            title="Mod Alert 2",
            message="Alert 2",
            category="moderation",
        )
        self.db.create_notification(
            user_id=self.creator.id,
            title="System Alert",
            message="Sys Alert",
            category="system",
        )

        # Check total
        items, total, unread = self.db.get_notifications(self.creator.id)
        self.assertEqual(total, 3)
        self.assertEqual(unread, 3)

        # Check category filter
        mod_items, mod_total, _ = self.db.get_notifications(
            self.creator.id, category="moderation"
        )
        self.assertEqual(mod_total, 2)
        self.assertEqual(len(mod_items), 2)

    def test_db_mark_read_and_mark_all_read(self) -> None:
        """Verify single mark read and bulk mark-all-as-read."""
        n1 = self.db.create_notification(
            user_id=self.creator.id, title="Note 1", message="Msg 1"
        )
        n2 = self.db.create_notification(
            user_id=self.creator.id, title="Note 2", message="Msg 2"
        )

        self.assertEqual(self.db.get_unread_notification_count(self.creator.id), 2)

        # Mark n1 as read
        ok = self.db.mark_notification_as_read(n1["id"], self.creator.id)
        self.assertTrue(ok)
        self.assertEqual(self.db.get_unread_notification_count(self.creator.id), 1)

        # Mark all as read
        count = self.db.mark_all_notifications_as_read(self.creator.id)
        self.assertEqual(count, 1)
        self.assertEqual(self.db.get_unread_notification_count(self.creator.id), 0)

    # --- Service Layer Fan-Out Tests ----------------------------------------

    def test_service_notify_role_fanout(self) -> None:
        """Verify notify_role fans out to moderators and skips excluded actor."""
        # Create a second moderator
        mod2 = self.auth.create_user(
            email="mod2@solotensor.ai",
            username="second_mod",
            password="Password123!",
        )
        self.db.assign_user_role(mod2.id, "moderator")
        mod2.role = "moderator"
        mod2.roles = ["moderator", "creator"]

        # Moderator 1 triggers notification for review
        results = self.notification_service.notify_role(
            role="moderator",
            title="New Submission",
            message="A model was submitted.",
            actor_id=self.moderator.id,
            exclude_user_ids=[self.moderator.id],
        )

        # mod2 should receive it, but self.moderator should not
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["user_id"], mod2.id)

        # Creator should have 0 notifications
        self.assertEqual(self.db.get_unread_notification_count(self.creator.id), 0)
        # Mod2 should have 1
        self.assertEqual(self.db.get_unread_notification_count(mod2.id), 1)

    # --- API Endpoints Integration Tests -----------------------------------

    def test_api_requires_authentication(self) -> None:
        """Unauthenticated requests must be rejected with 401."""
        res = self.client.get("/api/v1/notifications")
        self.assertEqual(res.status_code, 401)

        res_count = self.client.get("/api/v1/notifications/unread-count")
        self.assertEqual(res_count.status_code, 401)

    def test_api_list_and_unread_count(self) -> None:
        """Verify authenticated retrieval of notification list and unread count."""
        self.notification_service.notify_user(
            user_id=self.creator.id,
            title="Welcome to SoloTensor",
            message="Your account is active.",
            category="system",
            type="system_announcement",
        )

        headers = {"Authorization": f"Bearer {self.creator_token}"}
        res = self.client.get("/api/v1/notifications", headers=headers)
        self.assertEqual(res.status_code, 200)

        data = res.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["unread_count"], 1)
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["title"], "Welcome to SoloTensor")
        self.assertFalse(data["items"][0]["is_read"])

        # Verify quick badge endpoint
        badge_res = self.client.get("/api/v1/notifications/unread-count", headers=headers)
        self.assertEqual(badge_res.status_code, 200)
        self.assertEqual(badge_res.json()["unread_count"], 1)

    def test_api_mark_read_and_read_all(self) -> None:
        """Verify marking single notification and all notifications as read via API."""
        n1 = self.notification_service.notify_user(
            user_id=self.creator.id,
            title="Signal 1",
            message="Message 1",
        )
        n2 = self.notification_service.notify_user(
            user_id=self.creator.id,
            title="Signal 2",
            message="Message 2",
        )

        headers = {"Authorization": f"Bearer {self.creator_token}"}

        # Mark single
        res_single = self.client.post(f"/api/v1/notifications/{n1['id']}/read", headers=headers)
        self.assertEqual(res_single.status_code, 200)
        self.assertTrue(res_single.json()["success"])

        # Check count is now 1
        badge_res = self.client.get("/api/v1/notifications/unread-count", headers=headers)
        self.assertEqual(badge_res.json()["unread_count"], 1)

        # Mark all
        res_all = self.client.post("/api/v1/notifications/read-all", headers=headers)
        self.assertEqual(res_all.status_code, 200)
        self.assertTrue(res_all.json()["success"])
        self.assertEqual(res_all.json()["updated_count"], 1)

        # Check count is now 0
        badge_res2 = self.client.get("/api/v1/notifications/unread-count", headers=headers)
        self.assertEqual(badge_res2.json()["unread_count"], 0)

    def test_api_delete_notification(self) -> None:
        """Verify deletion of notification via DELETE endpoint."""
        notif = self.notification_service.notify_user(
            user_id=self.creator.id,
            title="To Be Deleted",
            message="Temp note",
        )

        headers = {"Authorization": f"Bearer {self.creator_token}"}
        del_res = self.client.delete(f"/api/v1/notifications/{notif['id']}", headers=headers)
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["success"])

        # Listing should now return 0
        list_res = self.client.get("/api/v1/notifications", headers=headers)
        self.assertEqual(list_res.json()["total"], 0)

    def test_cross_user_isolation(self) -> None:
        """Verify users cannot read, mark, or delete other users' notifications."""
        creator_notif = self.notification_service.notify_user(
            user_id=self.creator.id,
            title="Private Creator Alert",
            message="Confidential",
        )

        other_headers = {"Authorization": f"Bearer {self.user2_token}"}

        # User 2 list should be empty
        u2_list = self.client.get("/api/v1/notifications", headers=other_headers)
        self.assertEqual(u2_list.json()["total"], 0)

        # User 2 cannot mark creator's notification read
        mark_res = self.client.post(
            f"/api/v1/notifications/{creator_notif['id']}/read", headers=other_headers
        )
        self.assertEqual(mark_res.status_code, 404)

        # User 2 cannot delete creator's notification
        del_res = self.client.delete(
            f"/api/v1/notifications/{creator_notif['id']}", headers=other_headers
        )
        self.assertEqual(del_res.status_code, 404)


if __name__ == "__main__":
    unittest.main()
