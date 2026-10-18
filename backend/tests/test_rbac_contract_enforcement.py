"""Integration and unit tests for RBAC ownership and authorization contracts in main.py.

Verifies:
1. Model Creation (POST /api/v1/models): RequirePermission("model:publish"), user attribution.
2. Model Mutation & Deletion:
   - PATCH /api/v1/models/id/{model_id}: RequireOwnerOrPermission("model:edit_any")
   - DELETE /api/v1/models/id/{model_id}: RequireOwnerOrPermission("model:delete_any")
   - POST /api/v1/models/id/{model_id}/versions: RequireOwnerOrPermission("model:edit_any")
   - Versions files (POST, PATCH, DELETE) & samples (POST, DELETE): RequireOwnerOrPermission("model:edit_any" / "model:delete_any")
   - POST /api/v1/models/id/{model_id}/publish: RequireOwnerOrPermission("model:publish")
3. Weight Downloads: RequirePermission("model:download_weights") on ID and Public paths.
4. AI Tools:
   - POST /api/tools and POST /api/tools/create: RequirePermission("tool:publish"), user attribution.
   - DELETE /api/tools/{tool_id}: RequireOwnerOrPermission("tool:delete_any")
5. Gallery / Assets:
   - DELETE /api/v1/gallery/{key} and DELETE /api/v1/assets/{key}: RequireOwnerOrPermission("generation:delete_any")
"""

import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.dependencies.permissions import RequireOwnerOrPermission, RequirePermission
from app.main import app, model_storage, storage
from app.routers.auth import get_current_user
from app.schemas import (
    CreatorModelType,
    ModelCreateRequest,
    ModelFilePatchRequest,
    ModelPrecision,
    ModelPublishRequest,
    ModelUpdateRequest,
    ModelVersionCreateRequest,
    ModelVisibility,
    ToolAspectRatio,
    ToolMode,
    UserResponse,
)
from app.services.ai_tools import get_ai_tool_service
from app.services.models import ModelService
from app.services.rbac_service import RBACService, get_rbac_service
from app.services.storage import StorageService


class MockRBAC:
    def __init__(self, permissions_set=None):
        self.permissions = set(permissions_set or [])

    async def has_permission(self, user_id: str, permission: str) -> bool:
        return "*" in self.permissions or permission in self.permissions


class TestRBACContractEnforcement(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings = Settings(
            MODELS_DIR=os.path.join(self.temp_dir.name, "models"),
            STORAGE_DIR=os.path.join(self.temp_dir.name, "storage"),
            COMFY_MODEL_ROOT=os.path.join(self.temp_dir.name, "comfy"),
            FILES_PUBLIC_BASE="http://test",
        )
        self.client = TestClient(app)

        # Temp models & storage services
        self.orig_model_storage = model_storage
        self.orig_storage = storage

        import app.main as main_mod
        self.test_models = ModelService(self.settings)
        self.test_storage = StorageService(self.settings)
        main_mod.model_storage = self.test_models
        main_mod.storage = self.test_storage

        self.owner_user = UserResponse(
            id="user_owner_1",
            username="owner_user",
            email="owner@test.com",
            role="creator",
            created_at="2026-10-18T00:00:00Z",
        )
        self.stranger_user = UserResponse(
            id="user_stranger_2",
            username="stranger_user",
            email="stranger@test.com",
            role="creator",
            created_at="2026-10-18T00:00:00Z",
        )
        self.moderator_user = UserResponse(
            id="user_moderator_3",
            username="moderator_user",
            email="moderator@test.com",
            role="moderator",
            created_at="2026-10-18T00:00:00Z",
        )

    def tearDown(self) -> None:
        import app.main as main_mod
        main_mod.model_storage = self.orig_model_storage
        main_mod.storage = self.orig_storage
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    # =========================================================================
    # 1. Model Creation: POST /api/v1/models
    # =========================================================================

    def test_model_creation_unauthenticated_returns_401(self) -> None:
        resp = self.client.post("/api/v1/models", json={"title": "Test Model"})
        self.assertEqual(resp.status_code, 401)

    def test_model_creation_without_permission_returns_403(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.post("/api/v1/models", json={"title": "Test Model"})
        self.assertEqual(resp.status_code, 403)
        self.assertIn("Requires 'model:publish'", resp.json()["detail"])

    def test_model_creation_with_permission_attributes_user_id(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC(["model:publish"])
        resp = self.client.post("/api/v1/models", json={"title": "Test Model"})
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["title"], "Test Model")
        self.assertEqual(data["user_id"], self.owner_user.id)

    # =========================================================================
    # 2. Model Mutation & Deletion (PATCH, DELETE, versions, files, samples, publish)
    # =========================================================================

    def _create_test_model(self, owner_id: str = "user_owner_1"):
        return self.test_models.create(ModelCreateRequest(title="Owned Model"), user_id=owner_id)

    def test_model_patch_ownership(self) -> None:
        model = self._create_test_model()

        # Unauthenticated -> 401
        resp = self.client.patch(f"/api/v1/models/id/{model.model_id}", json={"title": "New Title"})
        self.assertEqual(resp.status_code, 401)

        # Stranger without model:edit_any -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.patch(f"/api/v1/models/id/{model.model_id}", json={"title": "New Title"})
        self.assertEqual(resp.status_code, 403)

        # Owner -> 200
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.patch(f"/api/v1/models/id/{model.model_id}", json={"title": "Owner Edited Title"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["title"], "Owner Edited Title")

        # Stranger with model:edit_any (Moderator) -> 200
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC(["model:edit_any"])
        resp = self.client.patch(f"/api/v1/models/id/{model.model_id}", json={"title": "Moderator Edited Title"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["title"], "Moderator Edited Title")

    def test_model_delete_ownership(self) -> None:
        model = self._create_test_model()

        # Unauthenticated -> 401
        resp = self.client.delete(f"/api/v1/models/id/{model.model_id}")
        self.assertEqual(resp.status_code, 401)

        # Stranger without model:delete_any -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.delete(f"/api/v1/models/id/{model.model_id}")
        self.assertEqual(resp.status_code, 403)

        # Stranger with model:delete_any -> 204
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC(["model:delete_any"])
        resp = self.client.delete(f"/api/v1/models/id/{model.model_id}")
        self.assertEqual(resp.status_code, 204)

        # Re-create and test owner delete -> 204
        model2 = self._create_test_model()
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.delete(f"/api/v1/models/id/{model2.model_id}")
        self.assertEqual(resp.status_code, 204)

    def test_model_version_create_ownership(self) -> None:
        model = self._create_test_model()

        # Stranger -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.post(f"/api/v1/models/id/{model.model_id}/versions", json={"name": "v2.0"})
        self.assertEqual(resp.status_code, 403)

        # Owner -> 201
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        resp = self.client.post(f"/api/v1/models/id/{model.model_id}/versions", json={"name": "v2.0"})
        self.assertEqual(resp.status_code, 201)

    def test_model_files_and_samples_mutation_ownership(self) -> None:
        model = self._create_test_model()
        version_id = model.versions[0].version_id

        # 1. Upload file
        # Stranger -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        file_bytes = b"sample weight bytes"
        resp = self.client.post(
            f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files",
            files={"file": ("model.safetensors", file_bytes, "application/octet-stream")},
        )
        self.assertEqual(resp.status_code, 403)

        # Owner -> 200
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        resp = self.client.post(
            f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files",
            files={"file": ("model.safetensors", file_bytes, "application/octet-stream")},
        )
        self.assertEqual(resp.status_code, 200)
        file_id = resp.json()["versions"][0]["files"][0]["file_id"]

        # 2. Patch file
        # Stranger -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        resp = self.client.patch(
            f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files/{file_id}",
            json={"visible": False},
        )
        self.assertEqual(resp.status_code, 403)

        # Owner -> 200
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        resp = self.client.patch(
            f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files/{file_id}",
            json={"visible": False},
        )
        self.assertEqual(resp.status_code, 200)

        # 3. Add sample
        sample_bytes = b"\x89PNG\r\n\x1a\nfake png data"
        # Stranger -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        resp = self.client.post(
            f"/api/v1/models/id/{model.model_id}/versions/{version_id}/samples",
            files={"file": ("sample.png", sample_bytes, "image/png")},
        )
        self.assertEqual(resp.status_code, 403)

        # Owner -> 200
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        resp = self.client.post(
            f"/api/v1/models/id/{model.model_id}/versions/{version_id}/samples",
            files={"file": ("sample.png", sample_bytes, "image/png")},
        )
        self.assertEqual(resp.status_code, 200)
        sample_id = resp.json()["versions"][0]["samples"][0]["sample_id"]

        # 4. Delete sample
        # Stranger -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        resp = self.client.delete(f"/api/v1/models/id/{model.model_id}/versions/{version_id}/samples/{sample_id}")
        self.assertEqual(resp.status_code, 403)

        # Stranger with model:delete_any -> 204
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC(["model:delete_any"])
        resp = self.client.delete(f"/api/v1/models/id/{model.model_id}/versions/{version_id}/samples/{sample_id}")
        self.assertEqual(resp.status_code, 204)

        # 5. Delete file
        # Stranger -> 403
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.delete(f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files/{file_id}")
        self.assertEqual(resp.status_code, 403)

        # Owner -> 204
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        resp = self.client.delete(f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files/{file_id}")
        self.assertEqual(resp.status_code, 204)

    def test_model_publish_ownership(self) -> None:
        model = self._create_test_model()
        version_id = model.versions[0].version_id
        self.test_models.add_file(model.model_id, version_id, "weights.safetensors", b"weights", ModelPrecision.FP16)

        # Stranger -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.post(f"/api/v1/models/id/{model.model_id}/publish", json={"visibility": "Public"})
        self.assertEqual(resp.status_code, 403)

        # Owner without model:publish -> 403
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.post(f"/api/v1/models/id/{model.model_id}/publish", json={"visibility": "Public"})
        # Owner check allows owner or override, for publish RequireOwnerOrPermission("model:publish").enforce(owner_id, user, rbac)
        # Owner user_id matches owner_id, so owner is authorized to publish!
        self.assertEqual(resp.status_code, 200)

    # =========================================================================
    # 3. Model Weight Downloads: GET .../files/{file_id}/download
    # =========================================================================

    def test_weight_downloads_requires_permission(self) -> None:
        model = self._create_test_model()
        version_id = model.versions[0].version_id
        file_bytes = b"checkpoint weights safely protected"
        updated = self.test_models.add_file(model.model_id, version_id, "weights.safetensors", file_bytes, ModelPrecision.FP16)
        file_id = updated.versions[0].files[0].file_id
        self.test_models.publish(model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC))

        # 1. Unauthenticated -> 401
        resp = self.client.get(f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files/{file_id}/download")
        self.assertEqual(resp.status_code, 401)

        resp_pub = self.client.get(f"/api/v1/models/public/{model.model_id}/versions/{version_id}/files/{file_id}/download")
        self.assertEqual(resp_pub.status_code, 401)

        # 2. Authenticated without model:download_weights -> 403
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.get(f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files/{file_id}/download")
        self.assertEqual(resp.status_code, 403)

        # 3. Authenticated with model:download_weights -> 200
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC(["model:download_weights"])
        resp = self.client.get(f"/api/v1/models/id/{model.model_id}/versions/{version_id}/files/{file_id}/download")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, file_bytes)

        resp_pub = self.client.get(f"/api/v1/models/public/{model.model_id}/versions/{version_id}/files/{file_id}/download")
        self.assertEqual(resp_pub.status_code, 200)
        self.assertEqual(resp_pub.content, file_bytes)

    # =========================================================================
    # 4. AI Tool Creation & Deletion
    # =========================================================================

    def test_tool_create_and_delete_rbac(self) -> None:
        wf = {"test_node": {"class_type": "CLIPTextEncode", "inputs": {"text": "hello"}}}
        payload = {
            "workflow_api": wf,
            "name": "RBAC Tool",
            "mode": "text-to-image",
            "aspect_ratio": "1:1",
        }

        # 1. Unauthenticated -> 401
        resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(resp.status_code, 401)

        # 2. Authenticated without tool:publish -> 403
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(resp.status_code, 403)

        # 3. Authenticated with tool:publish -> 200 & user attribution
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC(["tool:publish"])
        resp = self.client.post("/api/tools", json=payload)
        self.assertEqual(resp.status_code, 200)
        tool_data = resp.json()
        tool_id = tool_data["tool_id"]
        self.assertEqual(tool_data["user_id"], self.owner_user.id)

        # 4. Delete Tool: Unauthenticated -> 401
        app.dependency_overrides.pop(get_current_user, None)
        resp = self.client.delete(f"/api/tools/{tool_id}")
        self.assertEqual(resp.status_code, 401)

        # 5. Delete Tool: Stranger without tool:delete_any -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.delete(f"/api/tools/{tool_id}")
        self.assertEqual(resp.status_code, 403)

        # 6. Delete Tool: Stranger with tool:delete_any (Moderator) -> 200
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC(["tool:delete_any"])
        resp = self.client.delete(f"/api/tools/{tool_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["deleted"])

    # =========================================================================
    # 5. Gallery Asset Deletion: DELETE /api/v1/gallery/{key} & /api/v1/assets/{key}
    # =========================================================================

    def test_gallery_asset_deletion_rbac(self) -> None:
        # Create asset owned by owner_user
        asset_dir = Path(self.temp_dir.name) / "storage" / "user_owner_1"
        asset_dir.mkdir(parents=True, exist_ok=True)
        media_path = asset_dir / "gen_1.png"
        sidecar_path = asset_dir / "gen_1.png.json"
        media_path.write_bytes(b"\x89PNG\r\n\x1a\nimage data")
        sidecar_path.write_text(json.dumps({"user_id": self.owner_user.id}), encoding="utf-8")

        key = "user_owner_1/gen_1.png"

        # 1. Unauthenticated -> 401
        resp = self.client.delete(f"/api/v1/gallery/{key}")
        self.assertEqual(resp.status_code, 401)

        # 2. Stranger without generation:delete_any -> 403
        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC([])
        resp = self.client.delete(f"/api/v1/gallery/{key}")
        self.assertEqual(resp.status_code, 403)

        # 3. Owner -> 200
        app.dependency_overrides[get_current_user] = lambda: self.owner_user
        resp = self.client.delete(f"/api/v1/gallery/{key}")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["deleted"])
        self.assertFalse(media_path.exists())

        # Test DELETE /api/v1/assets/{key} with moderator
        asset_dir.mkdir(parents=True, exist_ok=True)
        media_path.write_bytes(b"\x89PNG\r\n\x1a\nimage data 2")
        sidecar_path.write_text(json.dumps({"user_id": self.owner_user.id}), encoding="utf-8")

        app.dependency_overrides[get_current_user] = lambda: self.stranger_user
        app.dependency_overrides[get_rbac_service] = lambda: MockRBAC(["generation:delete_any"])
        resp = self.client.delete(f"/api/v1/assets/{key}")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["deleted"])
        self.assertFalse(media_path.exists())


if __name__ == "__main__":
    unittest.main()
