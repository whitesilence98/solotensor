"""Tests for Role-Based Access Control on ComfyUI vault installation and moderation model reviews.

Validates:
1. DEFAULT_ROLE_PERMISSIONS integrity: admin and moderator have 'model:install_vault', regular roles do not.
2. RBAC protection and audit logging on POST /api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/install.
3. RBAC protection and queue listing on GET /api/v1/moderation/models/pending.
4. Model review actions (approve, reject, request_changes) and install_to_comfy execution with audit logging.
"""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
import uuid

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app, model_storage
from app.schemas import (
    CreatorModelType,
    ModelCategory,
    ModelCreateRequest,
    ModelFilePatchRequest,
    ModelInstallResponse,
    ModelModerationStatus,
    ModelPendingReviewQueueResponse,
    ModelPublishRequest,
    ModelReviewAction,
    ModelReviewRequest,
    ModelReviewResponse,
    ModelVisibility,
)
from app.services.auth_service import LocalAuthProvider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.models import ModelService, get_model_service
from app.services.rbac_service import (
    DEFAULT_ROLE_PERMISSIONS,
    RBACService,
    get_rbac_service,
    set_rbac_service,
)


class ModerationVaultRBACUnitTests(unittest.TestCase):
    """Test RBAC role permission mappings."""

    def test_default_role_permissions_install_vault(self) -> None:
        # Admin and Moderator must possess model:install_vault
        self.assertIn("model:install_vault", DEFAULT_ROLE_PERMISSIONS["admin"])
        self.assertIn("model:install_vault", DEFAULT_ROLE_PERMISSIONS["moderator"])

        # Regular user roles must NOT possess model:install_vault
        self.assertNotIn("model:install_vault", DEFAULT_ROLE_PERMISSIONS["creator"])
        self.assertNotIn("model:install_vault", DEFAULT_ROLE_PERMISSIONS["pro_creator"])
        self.assertNotIn("model:install_vault", DEFAULT_ROLE_PERMISSIONS["verified_creator"])
        self.assertNotIn("model:install_vault", DEFAULT_ROLE_PERMISSIONS["user"])
        self.assertNotIn("model:install_vault", DEFAULT_ROLE_PERMISSIONS["guest"])

    def test_moderation_review_queue_permissions(self) -> None:
        self.assertIn("moderation:review_queue", DEFAULT_ROLE_PERMISSIONS["admin"])
        self.assertIn("moderation:review_queue", DEFAULT_ROLE_PERMISSIONS["moderator"])
        self.assertNotIn("moderation:review_queue", DEFAULT_ROLE_PERMISSIONS["creator"])
        self.assertNotIn("moderation:review_queue", DEFAULT_ROLE_PERMISSIONS["user"])
        self.assertNotIn("moderation:review_queue", DEFAULT_ROLE_PERMISSIONS["guest"])


class ModerationAndVaultEndpointsTests(unittest.TestCase):
    """Integration tests for ComfyUI install endpoint and moderation review queue endpoints."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base_path = Path(self.temp_dir.name)

        self.db_path = str(self.base_path / "mod_test.db")
        self.models_dir = str(self.base_path / "models")
        self.storage_dir = str(self.base_path / "storage")
        self.comfy_root = str(self.base_path / "comfy")

        # Create comfy directory structure
        os.makedirs(os.path.join(self.comfy_root, "models", "checkpoints"), exist_ok=True)

        self.settings = Settings(
            DB_PATH=self.db_path,
            MODELS_DIR=self.models_dir,
            STORAGE_DIR=self.storage_dir,
            COMFY_MODEL_ROOT=self.comfy_root,
            JWT_SECRET="moderation-test-jwt-secret-key-32chars!",
        )

        self.db = Database(db_path=self.db_path, settings=self.settings)
        self.db.init_db()

        self.credits = CreditService(db=self.db, settings=self.settings)
        self.auth = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)
        self.rbac = RBACService(db=self.db)
        self.model_service = ModelService(settings=self.settings)

        set_db(self.db)
        set_auth_provider(self.auth)
        set_credit_service(self.credits)
        set_rbac_service(self.rbac)

        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_rbac_service] = lambda: self.rbac
        app.dependency_overrides[get_model_service] = lambda: self.model_service

        self.orig_models_root = model_storage.root
        self.orig_definitions = model_storage.definitions
        self.orig_comfy = model_storage.settings.COMFY_MODEL_ROOT

        model_storage.root = Path(self.models_dir)
        model_storage.definitions = model_storage.root / "definitions"
        model_storage.settings.COMFY_MODEL_ROOT = self.comfy_root
        model_storage.ensure_root()

        self.client = TestClient(app)

        # 1. Create standard creator user (role: creator)
        self.creator_user = self.auth.create_user(
            email="creator@example.com",
            username="testcreator",
            password="password123",
        )
        self.creator_token = self.auth.create_token(self.creator_user)

        # 2. Create moderator user (role: moderator)
        self.mod_user = self.auth.create_user(
            email="mod@example.com",
            username="testmoderator",
            password="password123",
        )
        self.db.assign_user_role(self.mod_user.id, "moderator")
        self.mod_user.roles = ["moderator", "creator"]
        self.mod_user.role = "moderator"
        self.mod_user.primary_role = "moderator"
        self.mod_token = self.auth.create_token(self.mod_user)

        # 3. Create admin user (role: admin)
        self.admin_user = self.auth.create_user(
            email="admin@example.com",
            username="testadmin",
            password="password123",
        )
        self.db.assign_user_role(self.admin_user.id, "admin")
        self.admin_user.roles = ["admin", "creator"]
        self.admin_user.role = "admin"
        self.admin_user.primary_role = "admin"
        self.admin_token = self.auth.create_token(self.admin_user)

    def tearDown(self) -> None:
        model_storage.root = self.orig_models_root
        model_storage.definitions = self.orig_definitions
        model_storage.settings.COMFY_MODEL_ROOT = self.orig_comfy
        app.dependency_overrides.clear()
        set_db(None)
        set_auth_provider(None)
        set_credit_service(None)
        set_rbac_service(None)
        self.temp_dir.cleanup()

    def _create_public_model_with_file(self) -> tuple[str, str, str]:
        """Helper to create and publish a model with a real file on disk."""
        model_resp = self.model_service.create(
            ModelCreateRequest(
                title="Public Test Model",
                category=ModelCategory.GENERAL,
                model_type=CreatorModelType.CHECKPOINT,
                visibility=ModelVisibility.PUBLIC,
            ),
            user_id=self.creator_user.id,
        )
        model_id = model_resp.model_id
        version_id = model_resp.versions[0].version_id

        # Write dummy file payload
        file_bytes = b"fake safetensors weights 12345"
        file_sha256 = hashlib.sha256(file_bytes).hexdigest()
        file_id = uuid.uuid4().hex
        filename = "test_model_weights.safetensors"

        files_dir = Path(self.models_dir) / model_id / version_id / "files"
        files_dir.mkdir(parents=True, exist_ok=True)
        stored_path = files_dir / f"{file_id}_{filename}"
        stored_path.write_bytes(file_bytes)

        # Add file entry to model record
        record = self.model_service._read(model_id)
        record["versions"][0]["files"].append(
            {
                "file_id": file_id,
                "filename": filename,
                "size": len(file_bytes),
                "sha256": file_sha256,
                "precision": "FP16",
                "visible": True,
                "stored_name": f"{file_id}_{filename}",
            }
        )
        record["visibility"] = "Public"
        record["published_at"] = self.model_service._now()
        self.model_service._write(record)
        self.model_service._sync_to_db(record)

        return model_id, version_id, file_id

    # --- 1. ComfyUI Vault Install RBAC Protection Tests ---

    def test_install_vault_endpoint_unauthorized(self) -> None:
        model_id, version_id, file_id = self._create_public_model_with_file()
        resp = self.client.post(
            f"/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/install"
        )
        self.assertEqual(resp.status_code, 401)

    def test_install_vault_endpoint_forbidden_for_regular_creator(self) -> None:
        model_id, version_id, file_id = self._create_public_model_with_file()
        resp = self.client.post(
            f"/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/install",
            headers={"Authorization": f"Bearer {self.creator_token}"},
        )
        self.assertEqual(resp.status_code, 403)

    def test_install_vault_endpoint_allowed_for_moderator_and_audited(self) -> None:
        model_id, version_id, file_id = self._create_public_model_with_file()
        resp = self.client.post(
            f"/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/install",
            headers={"Authorization": f"Bearer {self.mod_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["installed"])
        self.assertEqual(data["model_id"], model_id)
        self.assertEqual(data["file_id"], file_id)

        # Verify audit log in SQLite
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM security_audit_logs WHERE action = 'model:install_vault' AND actor_id = ?",
                (self.mod_user.id,),
            )
            audit_log = cursor.fetchone()
            self.assertIsNotNone(audit_log)
            self.assertEqual(audit_log["resource_type"], "model")
            self.assertEqual(audit_log["resource_id"], model_id)
            details = json.loads(audit_log["details"])
            self.assertEqual(details["version_id"], version_id)
            self.assertEqual(details["file_id"], file_id)

    def test_install_vault_endpoint_allowed_for_admin_and_audited(self) -> None:
        model_id, version_id, file_id = self._create_public_model_with_file()
        resp = self.client.post(
            f"/api/v1/models/public/{model_id}/versions/{version_id}/files/{file_id}/install",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["installed"])

        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM security_audit_logs WHERE action = 'model:install_vault' AND actor_id = ?",
                (self.admin_user.id,),
            )
            audit_log = cursor.fetchone()
            self.assertIsNotNone(audit_log)

    # --- 2. Moderation Model Pending Review Queue Tests ---

    def test_models_pending_unauthorized(self) -> None:
        resp = self.client.get("/api/v1/moderation/models/pending")
        self.assertEqual(resp.status_code, 401)

    def test_models_pending_forbidden_for_creator(self) -> None:
        resp = self.client.get(
            "/api/v1/moderation/models/pending",
            headers={"Authorization": f"Bearer {self.creator_token}"},
        )
        self.assertEqual(resp.status_code, 403)

    def test_models_pending_returns_queue_for_moderator(self) -> None:
        # Initially empty queue
        resp = self.client.get(
            "/api/v1/moderation/models/pending",
            headers={"Authorization": f"Bearer {self.mod_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["items"], [])
        self.assertEqual(data["total"], 0)

        # Create a model and flag it as pending_review
        model_resp = self.model_service.create(
            ModelCreateRequest(
                title="Anime Diffusion v2",
                category=ModelCategory.GENERAL,
                model_type=CreatorModelType.CHECKPOINT,
                description="Community pending review model",
            ),
            user_id=self.creator_user.id,
        )
        record = self.model_service._read(model_resp.model_id)
        record["moderation_status"] = "pending_review"
        self.model_service._write(record)
        self.model_service._sync_to_db(record)

        # Now query pending queue
        resp = self.client.get(
            "/api/v1/moderation/models/pending",
            headers={"Authorization": f"Bearer {self.mod_token}"},
        )
        self.assertEqual(resp.status_code, 200)
        queue_data = resp.json()
        self.assertEqual(queue_data["total"], 1)
        item = queue_data["items"][0]
        self.assertEqual(item["model_id"], model_resp.model_id)
        self.assertEqual(item["title"], "Anime Diffusion v2")
        self.assertEqual(item["author_id"], self.creator_user.id)
        self.assertEqual(item["author_username"], "testcreator")
        self.assertEqual(item["moderation_status"], "pending_review")

    # --- 3. Moderation Model Review Endpoint Tests ---

    def test_review_model_unauthorized(self) -> None:
        resp = self.client.post(
            "/api/v1/moderation/models/nonexistent/review",
            json={"action": "approve"},
        )
        self.assertEqual(resp.status_code, 401)

    def test_review_model_forbidden_for_creator(self) -> None:
        resp = self.client.post(
            "/api/v1/moderation/models/nonexistent/review",
            headers={"Authorization": f"Bearer {self.creator_token}"},
            json={"action": "approve"},
        )
        self.assertEqual(resp.status_code, 403)

    def test_review_model_not_found(self) -> None:
        resp = self.client.post(
            "/api/v1/moderation/models/12345678901234567890123456789012/review",
            headers={"Authorization": f"Bearer {self.mod_token}"},
            json={"action": "approve"},
        )
        self.assertEqual(resp.status_code, 404)

    def test_review_model_approve(self) -> None:
        model_id, version_id, file_id = self._create_public_model_with_file()
        # Mark pending
        record = self.model_service._read(model_id)
        record["moderation_status"] = "pending_review"
        self.model_service._write(record)

        resp = self.client.post(
            f"/api/v1/moderation/models/{model_id}/review",
            headers={"Authorization": f"Bearer {self.mod_token}"},
            json={
                "action": "approve",
                "notes": "Verified high quality and safe.",
                "install_to_comfy": False,
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["model_id"], model_id)
        self.assertEqual(data["moderation_status"], "approved")
        self.assertEqual(data["action_taken"], "approve")
        self.assertEqual(data["moderation_notes"], "Verified high quality and safe.")
        self.assertFalse(data["installed"])

        # Storage check
        updated = self.model_service._read(model_id)
        self.assertEqual(updated["moderation_status"], "approved")
        self.assertEqual(updated["visibility"], "Public")

        # Audit log check
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM security_audit_logs WHERE action = 'model:moderation_approve' AND resource_id = ?",
                (model_id,),
            )
            audit = cursor.fetchone()
            self.assertIsNotNone(audit)
            self.assertEqual(audit["actor_id"], self.mod_user.id)
            details = json.loads(audit["details"])
            self.assertEqual(details["action"], "approve")
            self.assertEqual(details["notes"], "Verified high quality and safe.")

    def test_review_model_reject(self) -> None:
        model_id, version_id, file_id = self._create_public_model_with_file()

        resp = self.client.post(
            f"/api/v1/moderation/models/{model_id}/review",
            headers={"Authorization": f"Bearer {self.mod_token}"},
            json={
                "action": "reject",
                "notes": "Violates safety guidelines on copyright.",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["moderation_status"], "rejected")
        self.assertEqual(data["action_taken"], "reject")
        self.assertEqual(data["moderation_notes"], "Violates safety guidelines on copyright.")

        # Storage check
        updated = self.model_service._read(model_id)
        self.assertEqual(updated["moderation_status"], "rejected")
        self.assertEqual(updated["visibility"], "Private")
        self.assertIsNone(updated["published_at"])

        # Audit log check
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM security_audit_logs WHERE action = 'model:moderation_reject' AND resource_id = ?",
                (model_id,),
            )
            audit = cursor.fetchone()
            self.assertIsNotNone(audit)
            self.assertEqual(audit["actor_id"], self.mod_user.id)

    def test_review_model_request_changes(self) -> None:
        model_id, version_id, file_id = self._create_public_model_with_file()

        resp = self.client.post(
            f"/api/v1/moderation/models/{model_id}/review",
            headers={"Authorization": f"Bearer {self.mod_token}"},
            json={
                "action": "request_changes",
                "notes": "Please provide clearer sample images and trigger words.",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["moderation_status"], "draft")
        self.assertEqual(data["action_taken"], "request_changes")

        updated = self.model_service._read(model_id)
        self.assertEqual(updated["moderation_status"], "draft")
        self.assertEqual(updated["visibility"], "Private")

        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM security_audit_logs WHERE action = 'model:moderation_request_changes' AND resource_id = ?",
                (model_id,),
            )
            audit = cursor.fetchone()
            self.assertIsNotNone(audit)

    def test_review_model_approve_with_install_to_comfy(self) -> None:
        model_id, version_id, file_id = self._create_public_model_with_file()

        resp = self.client.post(
            f"/api/v1/moderation/models/{model_id}/review",
            headers={"Authorization": f"Bearer {self.mod_token}"},
            json={
                "action": "approve",
                "notes": "Approved and installing to studio comfyui vault.",
                "install_to_comfy": True,
                "version_id": version_id,
                "file_id": file_id,
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["moderation_status"], "approved")
        self.assertTrue(data["installed"])
        self.assertIsNotNone(data["installed_file"])

        # Check file was copied into comfy models directory
        dest_path = Path(self.comfy_root) / data["installed_file"]
        self.assertTrue(dest_path.is_file())
        self.assertEqual(dest_path.read_bytes(), b"fake safetensors weights 12345")

        # Audit log verification
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM security_audit_logs WHERE action = 'model:moderation_approve' AND resource_id = ?",
                (model_id,),
            )
            audit = cursor.fetchone()
            self.assertIsNotNone(audit)
            details = json.loads(audit["details"])
            self.assertTrue(details["install_to_comfy"])
            self.assertTrue(details["installed"])
            self.assertEqual(details["installed_file"], data["installed_file"])

    def test_security_audit_logs_endpoints(self) -> None:
        """Test GET /api/v1/moderation/audit-logs and /api/admin/moderation/audit-logs."""
        # Unauthenticated request fails
        unauth_resp = self.client.get("/api/v1/moderation/audit-logs")
        self.assertEqual(unauth_resp.status_code, 401)

        # Creator role without moderation:review_queue is forbidden (403)
        creator_headers = {"Authorization": f"Bearer {self.creator_token}"}
        forbidden_resp = self.client.get("/api/v1/moderation/audit-logs", headers=creator_headers)
        self.assertEqual(forbidden_resp.status_code, 403)

        # Moderator role can access audit-logs via /api/v1/moderation/audit-logs
        mod_headers = {"Authorization": f"Bearer {self.mod_token}"}
        resp_v1 = self.client.get("/api/v1/moderation/audit-logs", headers=mod_headers)
        self.assertEqual(resp_v1.status_code, 200)
        logs_v1 = resp_v1.json()
        self.assertIsInstance(logs_v1, list)

        # Admin role can access audit-logs via /api/admin/moderation/audit-logs
        admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        resp_admin = self.client.get("/api/admin/moderation/audit-logs", headers=admin_headers)
        self.assertEqual(resp_admin.status_code, 200)
        logs_admin = resp_admin.json()
        self.assertIsInstance(logs_admin, list)
        self.assertEqual(len(logs_v1), len(logs_admin))


if __name__ == "__main__":
    unittest.main()
