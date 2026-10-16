"""Comprehensive unit and integration tests for SoloTensor RBAC and Security Architecture.

Tests cover:
1. Database Schema & Baseline Seeding (roles, permissions, role_permissions, user_roles, audit logs, content flags).
2. Default role assignment for new users ('creator') and special admin seeding for 'winnguyen282'.
3. RBACService methods, role hierarchy, permission resolution, 5-minute TTL caching & invalidation.
4. Security Dependencies (RequirePermission, RequireOwnerOrPermission).
5. Scoped Agent Service Account API keys (st_agent_* vs st_live_*).
6. Content Moderation Router Endpoints (flag, queue, resolve).
7. Datetime serialization compatibility for PostgreSQL/SQLite across all schemas.
"""

from datetime import datetime, timezone
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.dependencies.permissions import RequireOwnerOrPermission, RequirePermission
from app.main import app
from app.schemas import (
    ContentFlagCreateRequest,
    ContentFlagResolveRequest,
    ContentFlagResponse,
    UserMeResponse,
    UserPublicProfileResponse,
    UserResponse,
)
from app.services.auth_service import LocalAuthProvider, get_auth_provider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.rbac_service import RBACService, get_rbac_service, set_rbac_service


class RBACDatabaseSchemaTests(unittest.TestCase):
    """Test database schema creation, table constraints, and baseline seeding."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = f"{self.temp_dir.name}/test_rbac.db"
        self.db = Database(db_path=self.db_path)
        self.db.init_db()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_tables_created(self) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row["name"] for row in cursor.fetchall()}
            self.assertIn("roles", tables)
            self.assertIn("permissions", tables)
            self.assertIn("role_permissions", tables)
            self.assertIn("user_roles", tables)
            self.assertIn("security_audit_logs", tables)
            self.assertIn("content_flags", tables)

    def test_baseline_roles_seeded(self) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT name, tier_level FROM roles ORDER BY tier_level ASC")
            roles_map = {row["name"]: row["tier_level"] for row in cursor.fetchall()}
            self.assertIn("guest", roles_map)
            self.assertIn("creator", roles_map)
            self.assertIn("pro_creator", roles_map)
            self.assertIn("verified_creator", roles_map)
            self.assertIn("moderator", roles_map)
            self.assertIn("admin", roles_map)

            self.assertEqual(roles_map["guest"], 0)
            self.assertEqual(roles_map["creator"], 1)
            self.assertEqual(roles_map["pro_creator"], 2)
            self.assertEqual(roles_map["verified_creator"], 3)
            self.assertEqual(roles_map["moderator"], 4)
            self.assertEqual(roles_map["admin"], 5)

    def test_baseline_permissions_seeded(self) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT codename FROM permissions")
            perms = {row["codename"] for row in cursor.fetchall()}
            expected_perms = [
                "generation:create_standard",
                "generation:create_pro",
                "generation:create_private",
                "generation:batch_multirun",
                "generation:delete_own",
                "generation:delete_any",
                "model:publish",
                "model:download_weights",
                "model:edit_own",
                "model:edit_any",
                "model:delete_own",
                "model:delete_any",
                "tool:execute",
                "tool:publish",
                "tool:delete_own",
                "tool:delete_any",
                "credits:claim_daily",
                "credits:transfer",
                "credits:manage_billing",
                "credits:grant_manual",
                "moderation:flag_content",
                "moderation:review_queue",
                "moderation:ban_user",
                "moderation:inspect_telemetry",
                "agent:dispatch_jobs",
                "agent:sync_models",
                "agent:audit_safety",
            ]
            for p in expected_perms:
                self.assertIn(p, perms)

    def test_new_user_gets_creator_role_by_default(self) -> None:
        user = self.db.create_user(
            user_id="user_reg_1",
            email="creator@example.com",
            username="creator1",
            hashed_password="pw_hash",
        )
        self.assertEqual(user["role"], "creator")
        roles = self.db.get_user_roles(user["id"])
        self.assertIn("creator", roles)

        perms = self.db.get_user_permissions(user["id"])
        self.assertIn("generation:create_standard", perms)
        self.assertIn("model:publish", perms)
        self.assertIn("moderation:flag_content", perms)
        self.assertNotIn("generation:create_pro", perms)
        self.assertNotIn("moderation:review_queue", perms)

    def test_winnguyen282_admin_and_verified_creator_assignment(self) -> None:
        # Create winnguyen282 with designated UUID
        win_id = "d08abc9c-53af-4576-8074-5da4de0d0723"
        user = self.db.create_user(
            user_id=win_id,
            email="winnguyen282@example.com",
            username="winnguyen282",
            hashed_password="pw_hash",
        )
        self.assertEqual(user["role"], "admin")

        roles = self.db.get_user_roles(win_id)
        self.assertIn("admin", roles)
        self.assertIn("verified_creator", roles)

        # Admin possesses all system permissions
        perms = self.db.get_user_permissions(win_id)
        self.assertIn("credits:grant_manual", perms)
        self.assertIn("moderation:review_queue", perms)
        self.assertIn("agent:dispatch_jobs", perms)


class RBACServiceTests(unittest.IsolatedAsyncioTestCase):
    """Test RBACService permissions resolution, role assignment, and 5-min TTL caching."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = Database(db_path=f"{self.temp_dir.name}/rbac_svc.db")
        self.db.init_db()
        self.rbac = RBACService(db=self.db, ttl_seconds=300)

        # Create a standard creator
        self.user = self.db.create_user(
            user_id="user_test_rbac",
            email="bob@example.com",
            username="bob",
            hashed_password="hashed_pw",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    async def test_has_permission_and_caching(self) -> None:
        # Initial lookup
        has_flag = await self.rbac.has_permission(self.user["id"], "moderation:flag_content")
        has_pro = await self.rbac.has_permission(self.user["id"], "generation:create_pro")
        self.assertTrue(has_flag)
        self.assertFalse(has_pro)

        # Check in-memory cache populated
        self.assertIn(self.user["id"], self.rbac._roles_cache)
        self.assertIn(self.user["id"], self.rbac._perms_cache)

        # Cached call returns without hitting database again
        has_flag_cached = await self.rbac.has_permission(self.user["id"], "moderation:flag_content")
        self.assertTrue(has_flag_cached)

    async def test_role_assignment_and_cache_invalidation(self) -> None:
        # User lacks pro permission
        self.assertFalse(await self.rbac.has_permission(self.user["id"], "generation:create_pro"))

        # Grant pro_creator role
        success = await self.rbac.assign_role(
            user_id=self.user["id"],
            role_name="pro_creator",
            granted_by="admin_user_id",
        )
        self.assertTrue(success)

        # Cache should have been invalidated
        self.assertNotIn(self.user["id"], self.rbac._roles_cache)
        self.assertNotIn(self.user["id"], self.rbac._perms_cache)

        # Now possesses generation:create_pro
        self.assertTrue(await self.rbac.has_permission(self.user["id"], "generation:create_pro"))

        # Primary role is updated to pro_creator
        primary = await self.rbac.get_primary_role(self.user["id"])
        self.assertEqual(primary, "pro_creator")

    async def test_role_revocation(self) -> None:
        # Promote to moderator
        await self.rbac.assign_role(self.user["id"], "moderator")
        self.assertTrue(await self.rbac.has_permission(self.user["id"], "moderation:review_queue"))

        # Revoke moderator role
        revoked = await self.rbac.revoke_role(self.user["id"], "moderator")
        self.assertTrue(revoked)

        # Cache invalidated and permission removed
        self.assertFalse(await self.rbac.has_permission(self.user["id"], "moderation:review_queue"))

    async def test_security_audit_logging(self) -> None:
        log_id = await self.rbac.log_audit(
            actor_id=self.user["id"],
            action="model:delete_override",
            resource_type="model",
            resource_id="model_123",
            details={"reason": "DMCA takedown"},
            ip_address="127.0.0.1",
        )
        self.assertTrue(log_id)

        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT * FROM security_audit_logs WHERE id = ?", (log_id,))
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row["action"], "model:delete_override")
            self.assertEqual(row["resource_id"], "model_123")


class SecurityDependenciesTests(unittest.IsolatedAsyncioTestCase):
    """Test RequirePermission and RequireOwnerOrPermission dependencies."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = Database(db_path=f"{self.temp_dir.name}/deps.db")
        self.db.init_db()
        self.rbac = RBACService(db=self.db)

        self.db.create_user(
            user_id="u_creator",
            email="creator@example.com",
            username="creator",
            hashed_password="pw",
            role="creator",
        )
        self.db.create_user(
            user_id="u_mod",
            email="mod@example.com",
            username="mod",
            hashed_password="pw",
            role="moderator",
        )

        self.creator = UserResponse(
            id="u_creator",
            email="creator@example.com",
            username="creator",
            role="creator",
            roles=["creator"],
            primary_role="creator",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.moderator = UserResponse(
            id="u_mod",
            email="mod@example.com",
            username="mod",
            role="moderator",
            roles=["moderator"],
            primary_role="moderator",
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        self.db.assign_user_role("u_creator", "creator")
        self.db.assign_user_role("u_mod", "moderator")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    async def test_require_permission_allows_authorized_user(self) -> None:
        dep = RequirePermission("moderation:flag_content")
        result = await dep(user=self.creator, rbac=self.rbac)
        self.assertEqual(result.id, self.creator.id)

    async def test_require_permission_raises_403_for_unauthorized_user(self) -> None:
        dep = RequirePermission("moderation:review_queue")
        with self.assertRaises(HTTPException) as ctx:
            await dep(user=self.creator, rbac=self.rbac)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("PERMISSION_DENIED", ctx.exception.detail)

    async def test_require_owner_or_permission(self) -> None:
        guard = RequireOwnerOrPermission(override_permission="model:delete_any")

        # Owner has access regardless of permission
        owner_check = await guard.check("u_creator", self.creator, self.rbac)
        self.assertTrue(owner_check)

        # Moderator has access via override permission
        mod_check = await guard.check("u_creator", self.moderator, self.rbac)
        self.assertTrue(mod_check)

        # Another creator has no access
        self.db.create_user(
            user_id="u_other",
            email="other@example.com",
            username="other",
            hashed_password="pw",
            role="creator",
        )
        other_creator = UserResponse(
            id="u_other",
            email="other@example.com",
            username="other",
            role="creator",
            roles=["creator"],
            primary_role="creator",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.db.assign_user_role("u_other", "creator")
        other_check = await guard.check("u_creator", other_creator, self.rbac)
        self.assertFalse(other_check)

        # Enforce raises 403
        with self.assertRaises(HTTPException) as ctx:
            await guard.enforce("u_creator", other_creator, self.rbac)
        self.assertEqual(ctx.exception.status_code, 403)


class AgentServiceAccountApiKeysTests(unittest.TestCase):
    """Test scoped service account agent keys (st_agent_*) vs standard user keys (st_live_*)."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = Database(db_path=f"{self.temp_dir.name}/agent_auth.db")
        self.db.init_db()
        self.settings = Settings()
        self.credits = CreditService(db=self.db, settings=self.settings)
        self.auth = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_dispatcher_service_account_key(self) -> None:
        sa_user = self.auth.verify_api_key("st_agent_dispatcher_secret_worker_token_123")
        self.assertIsNotNone(sa_user)
        self.assertEqual(sa_user.role, "agent:dispatcher")
        self.assertIn("agent:dispatcher", sa_user.roles)
        self.assertIn("agent:dispatch_jobs", sa_user.permissions)
        self.assertIn("generation:complete_any", sa_user.permissions)

    def test_safety_scanner_service_account_key(self) -> None:
        sa_user = self.auth.verify_api_key("st_agent_safety_scanner_token_xyz")
        self.assertIsNotNone(sa_user)
        self.assertEqual(sa_user.role, "agent:safety_scanner")
        self.assertIn("agent:audit_safety", sa_user.permissions)
        self.assertIn("moderation:flag_content", sa_user.permissions)

    def test_model_sync_service_account_key(self) -> None:
        sa_user = self.auth.verify_api_key("st_agent_model_sync_token_456")
        self.assertIsNotNone(sa_user)
        self.assertEqual(sa_user.role, "agent:model_sync")
        self.assertIn("agent:sync_models", sa_user.permissions)
        self.assertIn("model:publish", sa_user.permissions)

    def test_user_live_api_key(self) -> None:
        user_record = self.db.create_user(
            user_id="user_live_k",
            email="live@example.com",
            username="live_user",
            hashed_password="pw",
        )
        _, raw_key = self.auth.create_api_key("user_live_k", "My CLI Key")
        self.assertTrue(raw_key.startswith("st_live_"))

        user = self.auth.verify_api_key(raw_key)
        self.assertIsNotNone(user)
        self.assertEqual(user.id, "user_live_k")
        self.assertEqual(user.role, "creator")

    def test_invalid_api_key_rejected(self) -> None:
        self.assertIsNone(self.auth.verify_api_key("invalid_key_prefix"))
        self.assertIsNone(self.auth.verify_api_key("st_live_nonexistent_key_hash_abc"))


class ModerationEndpointsIntegrationTests(unittest.TestCase):
    """Integration tests for POST /api/v1/moderation/flag, GET /api/v1/moderation/queue, POST /api/v1/moderation/resolve."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = Database(db_path=f"{self.temp_dir.name}/mod_api.db")
        self.db.init_db()

        self.settings = Settings()
        self.credits = CreditService(db=self.db, settings=self.settings)
        self.auth = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)
        self.rbac = RBACService(db=self.db)

        # Wire singletons
        set_db(self.db)
        set_auth_provider(self.auth)
        set_credit_service(self.credits)
        set_rbac_service(self.rbac)

        self.client = TestClient(app)

        # Create standard creator
        self.creator = self.auth.create_user(
            email="reporter@example.com",
            username="reporter",
            password="password123",
        )
        self.creator_token = self.auth.create_token(self.creator)

        # Create moderator user
        self.moderator = self.auth.create_user(
            email="mod@example.com",
            username="moderator",
            password="password123",
        )
        self.db.assign_user_role(self.moderator.id, "moderator")
        self.moderator.roles = ["moderator", "creator"]
        self.moderator.role = "moderator"
        self.moderator.primary_role = "moderator"
        self.moderator_token = self.auth.create_token(self.moderator)

    def tearDown(self) -> None:
        set_db(None)
        set_auth_provider(None)
        set_credit_service(None)
        set_rbac_service(None)
        self.temp_dir.cleanup()

    def test_creator_can_flag_content(self) -> None:
        resp = self.client.post(
            "/api/v1/moderation/flag",
            headers={"Authorization": f"Bearer {self.creator_token}"},
            json={
                "target_type": "model",
                "target_id": "model_bad_123",
                "reason": "Explicit NSFW content violating community guidelines",
            },
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["target_type"], "model")
        self.assertEqual(data["target_id"], "model_bad_123")
        self.assertEqual(data["status"], "pending")
        self.assertEqual(data["user_id"], self.creator.id)

    def test_unauthenticated_cannot_flag_content(self) -> None:
        resp = self.client.post(
            "/api/v1/moderation/flag",
            json={
                "target_type": "model",
                "target_id": "model_bad_123",
                "reason": "Test",
            },
        )
        self.assertEqual(resp.status_code, 401)

    def test_moderation_queue_forbidden_for_standard_creator(self) -> None:
        resp = self.client.get(
            "/api/v1/moderation/queue",
            headers={"Authorization": f"Bearer {self.creator_token}"},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn("PERMISSION_DENIED", resp.json()["detail"])

    def test_moderation_queue_and_resolution_for_moderator(self) -> None:
        # 1. Creator flags content
        flag_resp = self.client.post(
            "/api/v1/moderation/flag",
            headers={"Authorization": f"Bearer {self.creator_token}"},
            json={
                "target_type": "generation",
                "target_id": "gen_violating_456",
                "reason": "Spam and watermark",
            },
        )
        self.assertEqual(flag_resp.status_code, 201)
        flag_id = flag_resp.json()["id"]

        # 2. Moderator views queue
        queue_resp = self.client.get(
            "/api/v1/moderation/queue?status=pending",
            headers={"Authorization": f"Bearer {self.moderator_token}"},
        )
        self.assertEqual(queue_resp.status_code, 200)
        queue_data = queue_resp.json()
        self.assertGreaterEqual(queue_data["total"], 1)
        ids = [it["id"] for it in queue_data["items"]]
        self.assertIn(flag_id, ids)

        # 3. Moderator resolves the flag
        resolve_resp = self.client.post(
            "/api/v1/moderation/resolve",
            headers={"Authorization": f"Bearer {self.moderator_token}"},
            json={
                "flag_id": flag_id,
                "status": "resolved",
                "resolution_notes": "Asset removed and user warned.",
            },
        )
        self.assertEqual(resolve_resp.status_code, 200)
        resolved_data = resolve_resp.json()
        self.assertEqual(resolved_data["status"], "resolved")
        self.assertEqual(resolved_data["resolved_by"], self.moderator.id)
        self.assertEqual(resolved_data["resolution_notes"], "Asset removed and user warned.")

        # 4. Verify audit log created
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT action FROM security_audit_logs WHERE resource_id = ?",
                (flag_id,),
            )
            actions = [r["action"] for r in cursor.fetchall()]
            self.assertIn("moderation:flag_resolved", actions)


class SchemaDatetimeSerializationTests(unittest.TestCase):
    """Test PostgreSQL datetime object mode='before' serialization to ISO strings."""

    def test_user_response_datetime_serialization(self) -> None:
        dt = datetime(2026, 10, 17, 1, 30, 0, tzinfo=timezone.utc)
        user = UserResponse(
            id="u_dt",
            email="dt@example.com",
            username="dt_user",
            created_at=dt,  # Passes python datetime object as returned by psycopg
        )
        self.assertEqual(user.created_at, "2026-10-17T01:30:00+00:00")
        self.assertEqual(user.roles, ["creator"])
        self.assertEqual(user.primary_role, "creator")

    def test_user_me_response_datetime_serialization(self) -> None:
        dt = datetime(2026, 10, 17, 1, 30, 0, tzinfo=timezone.utc)
        user_me = UserMeResponse(
            id="u_me",
            email="me@example.com",
            username="me_user",
            created_at=dt,
            credits={"user_id": "u_me", "balance": 100, "daily_allowance": 100},
        )
        self.assertEqual(user_me.created_at, "2026-10-17T01:30:00+00:00")
        self.assertEqual(user_me.roles, ["creator"])

    def test_user_public_profile_datetime_serialization(self) -> None:
        dt = datetime(2026, 10, 17, 1, 30, 0, tzinfo=timezone.utc)
        profile = UserPublicProfileResponse(
            id="u_prof",
            username="prof_user",
            created_at=dt,
        )
        self.assertEqual(profile.created_at, "2026-10-17T01:30:00+00:00")
        self.assertEqual(profile.roles, ["creator"])

    def test_content_flag_response_datetime_serialization(self) -> None:
        dt1 = datetime(2026, 10, 17, 1, 0, 0, tzinfo=timezone.utc)
        dt2 = datetime(2026, 10, 17, 2, 0, 0, tzinfo=timezone.utc)
        flag = ContentFlagResponse(
            id="flag_dt",
            target_type="model",
            target_id="m1",
            reason="Violation",
            created_at=dt1,
            resolved_at=dt2,
        )
        self.assertEqual(flag.created_at, "2026-10-17T01:00:00+00:00")
        self.assertEqual(flag.resolved_at, "2026-10-17T02:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
