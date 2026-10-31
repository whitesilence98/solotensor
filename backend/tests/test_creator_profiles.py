"""Tests for User Ownership, Creator Profiles, and Follow/Unfollow Social endpoints."""

from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
import uuid

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app, model_storage
from app.schemas import (
    ModelCreateRequest,
    ToolAspectRatio,
    ToolMode,
    UserPublicProfileResponse,
    UserFollowResponse,
)
from app.services.ai_tools import (
    AIToolService,
    get_ai_tool_service,
    set_ai_tool_service,
)
from app.services.auth_service import LocalAuthProvider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.models import ModelService


SAMPLE_WORKFLOW = {
    "1": {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": "cyberpunk city"},
        "_meta": {"title": "Prompt"},
    },
    "2": {
        "class_type": "KSampler",
        "inputs": {"seed": 42, "steps": 20, "cfg": 8.0, "sampler_name": "euler", "scheduler": "normal"},
    },
    "3": {
        "class_type": "SaveImage",
        "inputs": {"filename_prefix": "out"},
    },
}


class CreatorProfilesAndOwnershipTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root_path = Path(self.temp_dir.name)
        self.db_path = str(self.root_path / "creator_test.db")
        self.models_dir = self.root_path / "models"
        self.tools_dir = self.root_path / "tools"

        self.settings = Settings(
            DB_PATH=self.db_path,
            MODELS_DIR=str(self.models_dir),
            TOOLS_DIR=str(self.tools_dir),
        )

        self.db = Database(db_path=self.db_path, settings=self.settings)
        self.db.init_db()
        set_db(self.db)

        self.credits = CreditService(db=self.db, settings=self.settings)
        set_credit_service(self.credits)

        self.auth_provider = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)
        set_auth_provider(self.auth_provider)

        # Set up ModelService and AIToolService with test settings
        self.orig_models_root = model_storage.root
        self.orig_models_definitions = model_storage.definitions
        self.orig_models_settings_dir = model_storage.settings.MODELS_DIR
        model_storage.root = self.models_dir
        model_storage.definitions = self.models_dir / "definitions"
        model_storage.settings.MODELS_DIR = str(self.models_dir)
        model_storage.ensure_root()
        self.models_service = model_storage

        self.tools_service = AIToolService(self.settings)
        set_ai_tool_service(self.tools_service)

        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        model_storage.root = self.orig_models_root
        model_storage.definitions = self.orig_models_definitions
        model_storage.settings.MODELS_DIR = self.orig_models_settings_dir

        set_ai_tool_service(None)

        app.dependency_overrides.clear()
        set_db(None)
        set_auth_provider(None)
        set_credit_service(None)
        self.temp_dir.cleanup()

    def test_user_followers_table_created(self) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row["name"] for row in cursor.fetchall()}
            self.assertIn("user_followers", tables)

    def test_create_user_with_avatar_and_bio(self) -> None:
        user = self.db.create_user(
            user_id="u-alice",
            email="alice@test.com",
            username="alice",
            hashed_password="pw",
            display_name="Alice Wonder",
            avatar_url="http://example.com/alice.png",
            bio="AI artist & model trainer",
        )
        self.assertEqual(user["avatar_url"], "http://example.com/alice.png")
        self.assertEqual(user["bio"], "AI artist & model trainer")

        fetched = self.db.get_user_by_id("u-alice")
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["avatar_url"], "http://example.com/alice.png")
        self.assertEqual(fetched["bio"], "AI artist & model trainer")

    def test_toggle_follow_and_is_following(self) -> None:
        self.db.create_user("u-1", "user1@test.com", "user1", "pw")
        self.db.create_user("u-2", "user2@test.com", "user2", "pw")

        # Initially not following
        self.assertFalse(self.db.is_following("u-1", "u-2"))
        self.assertEqual(self.db.get_followers_count("u-2"), 0)
        self.assertEqual(self.db.get_following_count("u-1"), 0)

        # Toggle -> followed
        followed = self.db.toggle_follow_user("u-1", "u-2")
        self.assertTrue(followed)
        self.assertTrue(self.db.is_following("u-1", "u-2"))
        self.assertEqual(self.db.get_followers_count("u-2"), 1)
        self.assertEqual(self.db.get_following_count("u-1"), 1)

        # Toggle again -> unfollowed
        unfollowed = self.db.toggle_follow_user("u-1", "u-2")
        self.assertFalse(unfollowed)
        self.assertFalse(self.db.is_following("u-1", "u-2"))
        self.assertEqual(self.db.get_followers_count("u-2"), 0)
        self.assertEqual(self.db.get_following_count("u-1"), 0)

    def test_get_user_public_profile_aggregates(self) -> None:
        u_creator = self.db.create_user(
            "u-creator",
            "creator@test.com",
            "artcreator",
            "pw",
            display_name="Art Creator",
            avatar_url="http://art.com/avatar.jpg",
            bio="Creating fine-tuned diffusion models",
        )
        u_follower = self.db.create_user("u-fan", "fan@test.com", "fan1", "pw")

        # 1. Add models (1 public, 1 private)
        self.db.upsert_model({
            "model_id": uuid.uuid4().hex,
            "user_id": "u-creator",
            "title": "Public Model 1",
            "visibility": "Public",
            "published_at": datetime.now(timezone.utc).isoformat(),
        })
        self.db.upsert_model({
            "model_id": uuid.uuid4().hex,
            "user_id": "u-creator",
            "title": "Private Model 1",
            "visibility": "Private",
        })

        # 2. Add generations
        now_iso = datetime.now(timezone.utc).isoformat()
        self.db.insert_generation({
            "id": uuid.uuid4().hex,
            "prompt_id": "prompt-1",
            "user_id": "u-creator",
            "filename": "img1.png",
            "url": "http://img1.png",
            "key": "img1.png",
            "created_at": now_iso,
        })
        self.db.insert_generation({
            "id": uuid.uuid4().hex,
            "prompt_id": "prompt-2",
            "user_id": "u-creator",
            "filename": "img2.png",
            "url": "http://img2.png",
            "key": "img2.png",
            "created_at": now_iso,
        })

        # 3. Add follow
        self.db.toggle_follow_user("u-fan", "u-creator")

        # 4. Check profile with viewer
        profile = self.db.get_user_public_profile("artcreator", viewer_id="u-fan")
        self.assertIsNotNone(profile)
        self.assertEqual(profile["id"], "u-creator")
        self.assertEqual(profile["username"], "artcreator")
        self.assertEqual(profile["display_name"], "Art Creator")
        self.assertEqual(profile["avatar_url"], "http://art.com/avatar.jpg")
        self.assertEqual(profile["bio"], "Creating fine-tuned diffusion models")
        self.assertEqual(profile["models_count"], 1)
        self.assertEqual(profile["posts_count"], 2)
        self.assertEqual(profile["runs_count"], 2)
        self.assertEqual(profile["followers_count"], 1)
        self.assertEqual(profile["following_count"], 0)
        self.assertTrue(profile["is_following"])

        # Check by user id without viewer
        profile_by_id = self.db.get_user_public_profile("u-creator")
        self.assertIsNotNone(profile_by_id)
        self.assertFalse(profile_by_id["is_following"])

        # Check nonexistent user
        self.assertIsNone(self.db.get_user_public_profile("non_existent"))

    def test_model_service_user_id_filtering(self) -> None:
        m1 = self.models_service.create(ModelCreateRequest(title="User1 Model"), user_id="user-1")
        m2 = self.models_service.create(ModelCreateRequest(title="User2 Model"), user_id="user-2")

        # List all
        all_models = self.models_service.list()
        self.assertEqual(len(all_models), 2)

        # Filter by user-1
        u1_models = self.models_service.list(user_id="user-1")
        self.assertEqual(len(u1_models), 1)
        self.assertEqual(u1_models[0].title, "User1 Model")

        # Filter by user-2
        u2_models = self.models_service.list(user_id="user-2")
        self.assertEqual(len(u2_models), 1)
        self.assertEqual(u2_models[0].title, "User2 Model")

        # Filter by nonexistent user
        u3_models = self.models_service.list(user_id="user-3")
        self.assertEqual(len(u3_models), 0)

    def test_ai_tools_user_id_ownership_and_filtering(self) -> None:
        tools_service = self.tools_service

        wf_bytes = json.dumps(SAMPLE_WORKFLOW).encode("utf-8")

        # Create tool with user_id & author_username
        t1 = tools_service.create(
            payload=wf_bytes,
            name="Tool By User 1",
            mode=ToolMode.TEXT_TO_IMAGE,
            aspect_ratio=ToolAspectRatio.SQUARE,
            user_id="user-1",
            author_username="author1",
        )
        self.assertEqual(t1.user_id, "user-1")
        self.assertEqual(t1.author_username, "author1")

        t2 = tools_service.create(
            payload=wf_bytes,
            name="Tool By User 2",
            mode=ToolMode.TEXT_TO_IMAGE,
            aspect_ratio=ToolAspectRatio.SQUARE,
            user_id="user-2",
            author_username="author2",
        )

        # Verify filtering in list_public
        public_all = tools_service.list_public()
        self.assertEqual(len(public_all), 2)

        public_u1 = tools_service.list_public(user_id="user-1")
        self.assertEqual(len(public_u1), 1)
        self.assertEqual(public_u1[0].name, "Tool By User 1")

        public_u2 = tools_service.list_public(user_id="user-2")
        self.assertEqual(len(public_u2), 1)
        self.assertEqual(public_u2[0].name, "Tool By User 2")

    def test_api_get_user_public_profile(self) -> None:
        user = self.auth_provider.create_user("star@test.com", "starcreator", "secret123", "Star Creator")
        token = self.auth_provider.create_token(user)

        # 1. Unauthenticated request to GET /api/v1/users/{username_or_id}
        res = self.client.get("/api/v1/users/starcreator")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["username"], "starcreator")
        self.assertEqual(data["display_name"], "Star Creator")
        self.assertFalse(data["is_following"])
        self.assertEqual(data["followers_count"], 0)

        # 2. Get by user id
        res_id = self.client.get(f"/api/v1/users/{user.id}")
        self.assertEqual(res_id.status_code, 200)
        self.assertEqual(res_id.json()["username"], "starcreator")

        # 3. Nonexistent user -> 404
        res_404 = self.client.get("/api/v1/users/nobody_here")
        self.assertEqual(res_404.status_code, 404)

    def test_api_follow_and_unfollow_flow(self) -> None:
        user_a = self.auth_provider.create_user("alice@flow.com", "alice", "pw123")
        token_a = self.auth_provider.create_token(user_a)

        user_b = self.auth_provider.create_user("bob@flow.com", "bob", "pw123")
        token_b = self.auth_provider.create_token(user_b)

        # 1. Unauthenticated follow -> 401
        res_unauth = self.client.post("/api/v1/users/bob/follow")
        self.assertEqual(res_unauth.status_code, 401)

        # 2. User cannot follow self -> 400
        res_self = self.client.post(
            "/api/v1/users/alice/follow",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        self.assertEqual(res_self.status_code, 400)
        self.assertIn("cannot follow yourself", res_self.json()["detail"].lower())

        # 3. Follow nonexistent user -> 404
        res_notfound = self.client.post(
            "/api/v1/users/nonexistent/follow",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        self.assertEqual(res_notfound.status_code, 404)

        # 4. Alice follows Bob -> 200 (following = True)
        res_follow = self.client.post(
            "/api/v1/users/bob/follow",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        self.assertEqual(res_follow.status_code, 200)
        data = res_follow.json()
        self.assertTrue(data["following"])
        self.assertEqual(data["followers_count"], 1)

        # Check Bob's profile as Alice (is_following should be True)
        res_bob_profile = self.client.get(
            "/api/v1/users/bob",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        self.assertEqual(res_bob_profile.status_code, 200)
        self.assertTrue(res_bob_profile.json()["is_following"])
        self.assertEqual(res_bob_profile.json()["followers_count"], 1)

        # Check Bob's profile as anonymous (is_following should be False)
        res_bob_anon = self.client.get("/api/v1/users/bob")
        self.assertEqual(res_bob_anon.status_code, 200)
        self.assertFalse(res_bob_anon.json()["is_following"])
        self.assertEqual(res_bob_anon.json()["followers_count"], 1)

        # 5. Alice unfollows Bob (toggle) -> following = False
        res_unfollow = self.client.post(
            "/api/v1/users/bob/follow",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        self.assertEqual(res_unfollow.status_code, 200)
        data_unfollow = res_unfollow.json()
        self.assertFalse(data_unfollow["following"])
        self.assertEqual(data_unfollow["followers_count"], 0)

        # Profile is now updated
        res_bob_after = self.client.get(
            "/api/v1/users/bob",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        self.assertFalse(res_bob_after.json()["is_following"])
        self.assertEqual(res_bob_after.json()["followers_count"], 0)

    def test_api_models_and_tools_user_filtering(self) -> None:
        user_c = self.auth_provider.create_user("c@test.com", "creator_c", "pw")
        token_c = self.auth_provider.create_token(user_c)

        # 1. Create model via API with auth
        res_m = self.client.post(
            "/api/v1/models",
            json={"title": "Model C", "visibility": "Public"},
            headers={"Authorization": f"Bearer {token_c}"},
        )
        self.assertEqual(res_m.status_code, 201)
        model_id = res_m.json()["model_id"]
        self.assertEqual(res_m.json()["user_id"], user_c.id)

        # Mark model published
        rec = model_storage._read(model_id)
        rec["published_at"] = datetime.now(timezone.utc).isoformat()
        model_storage._write(rec)

        # 2. Query public models with user_id
        res_pub_c = self.client.get(f"/api/v1/models/public?user_id={user_c.id}")
        self.assertEqual(res_pub_c.status_code, 200)
        self.assertEqual(len(res_pub_c.json()["items"]), 1)
        self.assertEqual(res_pub_c.json()["items"][0]["model_id"], model_id)

        res_pub_other = self.client.get("/api/v1/models/public?user_id=nonexistent")
        self.assertEqual(res_pub_other.status_code, 200)
        self.assertEqual(len(res_pub_other.json()["items"]), 0)

        # 3. Create tool via JSON API with auth
        res_t = self.client.post(
            "/api/tools",
            json={
                "workflow_api": SAMPLE_WORKFLOW,
                "name": "Tool C",
                "mode": "text-to-image",
                "aspect_ratio": "1:1",
            },
            headers={"Authorization": f"Bearer {token_c}"},
        )
        self.assertEqual(res_t.status_code, 200)
        tool_id = res_t.json()["tool_id"]
        self.assertEqual(res_t.json()["user_id"], user_c.id)

        # 4. Query tools with user_id
        res_tools_c = self.client.get(f"/api/tools?user_id={user_c.id}")
        self.assertEqual(res_tools_c.status_code, 200)
        self.assertEqual(len(res_tools_c.json()["items"]), 1)
        self.assertEqual(res_tools_c.json()["items"][0]["tool_id"], tool_id)

        res_tools_other = self.client.get("/api/tools?user_id=nonexistent")
        self.assertEqual(res_tools_other.status_code, 200)
        self.assertEqual(len(res_tools_other.json()["items"]), 0)


if __name__ == "__main__":
    unittest.main()
