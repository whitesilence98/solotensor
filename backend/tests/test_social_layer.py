"""Social layer persistence and route tests. No network."""

from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
import uuid

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app, model_storage, storage
from app.routers.auth import get_current_user, get_optional_user
from app.schemas import (
    ModelCreateRequest,
    ModelModerationStatus,
    ModelPrecision,
    ModelVisibility,
    UserResponse,
)
from app.services.auth_service import LocalAuthProvider, set_auth_provider
from app.services.credit_service import CreditService, set_credit_service
from app.services.models import ModelService
from app.services.notification_service import set_notification_service
from app.services.rbac_service import RBACService, set_rbac_service
from app.services.social_service import get_social_service, set_social_service


SOCIAL_TABLES = {
    "model_stars",
    "model_comments",
    "model_comment_likes",
    "asset_likes",
    "model_downloads",
}


class SocialLayerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        self.settings = Settings(
            DB_PATH=str(self.root / "social.db"),
            MODELS_DIR=str(self.root / "models"),
            TOOLS_DIR=str(self.root / "tools"),
            STORAGE_DIR=str(self.root / "generated"),
        )

        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        set_db(self.db)

        self.credits = CreditService(db=self.db, settings=self.settings)
        set_credit_service(self.credits)

        self.auth = LocalAuthProvider(
            db=self.db, settings=self.settings, credits=self.credits
        )
        set_auth_provider(self.auth)

        # Keep every service singleton bound to this test's database.
        self.rbac = RBACService(db=self.db)
        set_rbac_service(self.rbac)
        set_notification_service(None)
        set_social_service(None)

        # Model storage (definition JSON + weights) lives under the temp root.
        self.orig_models_root = model_storage.root
        self.orig_models_definitions = model_storage.definitions
        model_storage.root = Path(self.settings.MODELS_DIR).resolve()
        model_storage.definitions = model_storage.root / "definitions"
        model_storage.ensure_root()
        model_storage.invalidate_public_cache()
        self.models_service: ModelService = model_storage

        # Gallery storage lives under the temp root too, and S3 stays offline.
        self.orig_storage_root = storage.root
        self.orig_storage_s3 = storage.is_s3_enabled
        self.orig_storage_s3_client = storage._s3_client
        storage.root = Path(self.settings.STORAGE_DIR).resolve()
        storage.ensure_root()
        storage.is_s3_enabled = False
        storage._s3_client = None

        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        model_storage.root = self.orig_models_root
        model_storage.definitions = self.orig_models_definitions
        model_storage.invalidate_public_cache()

        storage.root = self.orig_storage_root
        storage.is_s3_enabled = self.orig_storage_s3
        storage._s3_client = self.orig_storage_s3_client

        app.dependency_overrides.clear()
        set_db(None)
        set_auth_provider(None)
        set_credit_service(None)
        set_rbac_service(None)
        set_notification_service(None)
        set_social_service(None)
        self.temp_dir.cleanup()

    # --- helpers ----------------------------------------------------------

    def _user(self, user_id: str, username: str, role: str = "creator") -> UserResponse:
        return UserResponse(
            id=user_id,
            username=username,
            email=f"{username}@test.com",
            role=role,
            created_at="2026-01-01T00:00:00Z",
        )

    def _create_user(self, user_id: str, username: str, role: str = "creator") -> UserResponse:
        self.db.create_user(
            user_id=user_id,
            email=f"{username}@test.com",
            username=username,
            hashed_password="pw",
            display_name=username.title(),
            role=role,
        )
        return self._user(user_id, username, role)

    def _as(self, user: UserResponse) -> None:
        """Authenticate subsequent requests as ``user`` (both auth dependencies)."""
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_optional_user] = lambda: user

    def _as_anonymous(self) -> None:
        # Drop the overrides so the real bearer-token dependency chain runs.
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_optional_user, None)

    def _seed_public_model(self, user_id: str, title: str = "Seed Model") -> str:
        model_id = uuid.uuid4().hex
        self.db.upsert_model(
            {
                "model_id": model_id,
                "user_id": user_id,
                "title": title,
                "visibility": "Public",
                "published_at": datetime.now(timezone.utc).isoformat(),
                "versions": [],
            }
        )
        return model_id

    def _seed_private_model(self, user_id: str, title: str = "Private Model") -> str:
        model_id = uuid.uuid4().hex
        self.db.upsert_model(
            {
                "model_id": model_id,
                "user_id": user_id,
                "title": title,
                "visibility": "Private",
                "versions": [],
            }
        )
        return model_id

    def _count_rows(self, table: str, where: str, params: tuple) -> int:
        with self.db.get_connection() as conn:
            row = conn.execute(
                f"SELECT COUNT(*) AS cnt FROM {table} WHERE {where}", params
            ).fetchone()
            return int(row["cnt"]) if row else 0

    def _write_asset(self, key: str, user_id: str | None = None) -> Path:
        path = storage.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"\x89PNG\r\n\x1a\nfake-image-bytes")
        if user_id is not None:
            (path.parent / f"{path.name}.json").write_text(
                '{"user_id": "%s"}' % user_id, encoding="utf-8"
            )
        return path

    # --- tests ------------------------------------------------------------

    def test_social_tables_created(self) -> None:
        with self.db.get_connection() as conn:
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row["name"] for row in cursor.fetchall()}
        for table in SOCIAL_TABLES:
            self.assertIn(table, tables)

    def test_star_toggle_round_trip(self) -> None:
        alice = self._create_user("u-a", "alice")
        bob = self._create_user("u-b", "bob")
        model_id = self._seed_public_model(alice.id)
        self._as(bob)

        first = self.client.post(f"/api/v1/models/{model_id}/star")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(
            first.json(),
            {"model_id": model_id, "starred": True, "star_count": 1},
        )

        second = self.client.post(f"/api/v1/models/{model_id}/star")
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.json()["starred"])
        self.assertEqual(second.json()["star_count"], 0)

        # The unversioned alias must drive the same behaviour.
        alias_on = self.client.post(f"/api/models/{model_id}/star")
        self.assertEqual(alias_on.status_code, 200)
        self.assertTrue(alias_on.json()["starred"])
        self.assertEqual(alias_on.json()["star_count"], 1)

        alias_off = self.client.post(f"/api/models/{model_id}/star")
        self.assertEqual(alias_off.status_code, 200)
        self.assertFalse(alias_off.json()["starred"])
        self.assertEqual(alias_off.json()["star_count"], 0)

    def test_star_requires_auth(self) -> None:
        alice = self._create_user("u-a", "alice")
        model_id = self._seed_public_model(alice.id)
        self._as_anonymous()

        response = self.client.post(f"/api/v1/models/{model_id}/star")
        self.assertEqual(response.status_code, 401)

    def test_star_unknown_and_private_model_404(self) -> None:
        alice = self._create_user("u-a", "alice")
        bob = self._create_user("u-b", "bob")
        private_id = self._seed_private_model(alice.id)
        self._as(bob)

        for target in ("does-not-exist", private_id):
            star = self.client.post(f"/api/v1/models/{target}/star")
            self.assertEqual(star.status_code, 404, target)
            social = self.client.get(f"/api/v1/models/{target}/social")
            self.assertEqual(social.status_code, 404, target)

        public_id = self._seed_public_model(alice.id)
        self.assertEqual(
            self.client.get(f"/api/v1/models/{public_id}/social").status_code, 200
        )

    def test_star_notifies_owner_but_not_on_self(self) -> None:
        alice = self._create_user("u-a", "alice")
        bob = self._create_user("u-b", "bob")
        model_id = self._seed_public_model(alice.id)
        own_model_id = self._seed_public_model(alice.id, "Alice Own Model")

        self._as(bob)
        self.assertEqual(
            self.client.post(f"/api/v1/models/{model_id}/star").status_code, 200
        )

        items, total, _unread = self.db.get_notifications(alice.id, limit=50)
        self.assertEqual(total, 1)
        self.assertEqual(items[0]["type"], "model_starred")
        self.assertEqual(items[0]["actor_id"], bob.id)

        # Starring one's own model must not notify the actor.
        self._as(alice)
        self.assertEqual(
            self.client.post(f"/api/v1/models/{own_model_id}/star").status_code, 200
        )
        items_after, total_after, _unread = self.db.get_notifications(alice.id, limit=50)
        self.assertEqual(total_after, 1)
        self.assertEqual(len(items_after), 1)

    def test_add_and_list_comments(self) -> None:
        alice = self._create_user("u-a", "alice")
        bob = self._create_user("u-b", "bob")
        model_id = self._seed_public_model(alice.id)
        self._as(bob)

        created = self.client.post(
            f"/api/v1/models/{model_id}/comments", json={"body": "  Great   work  "}
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["body"], "Great work")
        self.assertEqual(created.json()["author_username"], "bob")
        self.assertEqual(created.json()["like_count"], 0)
        self.assertFalse(created.json()["viewer_liked"])

        listed = self.client.get(f"/api/v1/models/{model_id}/comments?sort=latest")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["total"], 1)
        self.assertEqual(listed.json()["items"][0]["body"], "Great work")

        blank = self.client.post(
            f"/api/v1/models/{model_id}/comments", json={"body": "   "}
        )
        self.assertEqual(blank.status_code, 422)

        extra = self.client.post(
            f"/api/v1/models/{model_id}/comments",
            json={"body": "hi", "unexpected": True},
        )
        self.assertEqual(extra.status_code, 422)

        for body in ("second", "third"):
            self.assertEqual(
                self.client.post(
                    f"/api/v1/models/{model_id}/comments", json={"body": body}
                ).status_code,
                201,
            )

        paged = self.client.get(
            f"/api/v1/models/{model_id}/comments?page=2&limit=1"
        )
        self.assertEqual(paged.status_code, 200)
        data = paged.json()
        self.assertEqual(data["total"], 3)
        self.assertEqual(data["total_pages"], 3)
        self.assertEqual(data["page"], 2)
        self.assertEqual(data["limit"], 1)
        self.assertEqual(len(data["items"]), 1)
        self.assertTrue(data["has_more"])

    def test_comment_liked_sort_and_per_viewer_state(self) -> None:
        alice = self._create_user("u-a", "alice")
        bob = self._create_user("u-b", "bob")
        carol = self._create_user("u-c", "carol")
        model_id = self._seed_public_model(alice.id)
        self._as(bob)

        first = self.client.post(
            f"/api/v1/models/{model_id}/comments", json={"body": "first"}
        ).json()
        second = self.client.post(
            f"/api/v1/models/{model_id}/comments", json={"body": "second"}
        ).json()

        self._as(carol)
        liked = self.client.post(f"/api/v1/comments/{second['id']}/like")
        self.assertEqual(liked.status_code, 200)
        self.assertEqual(liked.json()["comment_id"], second["id"])
        self.assertTrue(liked.json()["liked"])
        self.assertEqual(liked.json()["like_count"], 1)

        sorted_as_carol = self.client.get(
            f"/api/v1/models/{model_id}/comments?sort=liked"
        ).json()
        self.assertEqual(sorted_as_carol["items"][0]["id"], second["id"])
        self.assertEqual(sorted_as_carol["items"][0]["like_count"], 1)
        self.assertTrue(sorted_as_carol["items"][0]["viewer_liked"])
        self.assertFalse(sorted_as_carol["items"][1]["viewer_liked"])
        self.assertEqual(sorted_as_carol["items"][1]["id"], first["id"])

        self._as(bob)
        sorted_as_bob = self.client.get(
            f"/api/v1/models/{model_id}/comments?sort=liked"
        ).json()
        self.assertEqual(sorted_as_bob["items"][0]["id"], second["id"])
        self.assertEqual(sorted_as_bob["items"][0]["like_count"], 1)
        self.assertFalse(sorted_as_bob["items"][0]["viewer_liked"])

        self._as(carol)
        unliked = self.client.post(f"/api/v1/comments/{second['id']}/like")
        self.assertEqual(unliked.status_code, 200)
        self.assertFalse(unliked.json()["liked"])
        self.assertEqual(unliked.json()["like_count"], 0)

    def test_comment_delete_permissions(self) -> None:
        alice = self._create_user("u-a", "alice")
        bob = self._create_user("u-b", "bob")
        carol = self._create_user("u-c", "carol")
        moderator = self._create_user("u-mod", "mod", role="moderator")
        model_id = self._seed_public_model(alice.id)

        self._as(bob)
        own_comment = self.client.post(
            f"/api/v1/models/{model_id}/comments", json={"body": "author comment"}
        ).json()

        deleted = self.client.delete(f"/api/v1/comments/{own_comment['id']}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(
            deleted.json(), {"deleted": True, "comment_id": own_comment["id"]}
        )
        self._as_anonymous()
        listing = self.client.get(f"/api/v1/models/{model_id}/comments").json()
        self.assertEqual(listing["total"], 0)
        self.assertEqual(listing["items"], [])

        self._as(bob)
        foreign_comment = self.client.post(
            f"/api/v1/models/{model_id}/comments", json={"body": "bob comment"}
        ).json()

        self._as(carol)
        forbidden = self.client.delete(f"/api/v1/comments/{foreign_comment['id']}")
        self.assertEqual(forbidden.status_code, 403)

        self._as(moderator)
        moderated = self.client.delete(f"/api/v1/comments/{foreign_comment['id']}")
        self.assertEqual(moderated.status_code, 200)
        self.assertTrue(moderated.json()["deleted"])

        # Deleting a comment that never existed is a 404, as is double-deleting.
        missing = self.client.delete("/api/v1/comments/does-not-exist")
        self.assertEqual(missing.status_code, 404)

    def test_asset_like_toggle_and_query(self) -> None:
        bob = self._create_user("u-b", "bob")
        key = "prompt-abc/asset.png"
        self._write_asset(key)
        self._as(bob)

        first = self.client.post("/api/v1/assets/likes", json={"key": key})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(
            first.json(), {"key": key, "liked": True, "like_count": 1}
        )

        second = self.client.post("/api/v1/assets/likes", json={"key": key})
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.json()["liked"])
        self.assertEqual(second.json()["like_count"], 0)

        # Re-like so the query endpoint has real state to report.
        self.assertEqual(
            self.client.post("/api/v1/assets/likes", json={"key": key}).status_code,
            200,
        )

        unknown = self.client.post(
            "/api/v1/assets/likes", json={"key": "missing/nope.png"}
        )
        self.assertEqual(unknown.status_code, 404)

        traversal = self.client.post(
            "/api/v1/assets/likes", json={"key": "../../../etc/passwd"}
        )
        self.assertEqual(traversal.status_code, 400)

        self._as_anonymous()
        unauthenticated = self.client.post("/api/v1/assets/likes", json={"key": key})
        self.assertEqual(unauthenticated.status_code, 401)

        # The query endpoint is viewer-aware but works anonymously too.
        anon_query = self.client.post(
            "/api/v1/assets/likes/query", json={"keys": [key]}
        )
        self.assertEqual(anon_query.status_code, 200)
        self.assertEqual(anon_query.json()["items"][key]["like_count"], 1)
        self.assertFalse(anon_query.json()["items"][key]["viewer_liked"])

        self._as(bob)
        viewer_query = self.client.post(
            "/api/v1/assets/likes/query", json={"keys": [key]}
        )
        self.assertEqual(viewer_query.status_code, 200)
        self.assertEqual(viewer_query.json()["items"][key]["like_count"], 1)
        self.assertTrue(viewer_query.json()["items"][key]["viewer_liked"])

    def test_download_counter_get_only_and_owner_skip(self) -> None:
        owner = self._create_user("u-owner", "owner")
        viewer = self._create_user("u-viewer", "viewer")

        created = self.models_service.create(
            ModelCreateRequest(title="Downloadable", visibility=ModelVisibility.PUBLIC),
            user_id=owner.id,
        )
        model_id = created.model_id
        version_id = created.versions[0].version_id

        with_file = self.models_service.add_file(
            model_id, version_id, "weights.safetensors", b"fake-weights", ModelPrecision.FP16
        )
        file_id = with_file.versions[0].files[0].file_id

        # Publish the definition (the public download route requires published_at).
        record = self.models_service._read(model_id)
        record["published_at"] = datetime.now(timezone.utc).isoformat()
        record["moderation_status"] = ModelModerationStatus.APPROVED.value
        self.models_service._write(record)
        self.db.upsert_model(record)
        self.models_service.invalidate_public_cache()

        url = (
            f"/api/v1/models/public/{model_id}/versions/{version_id}"
            f"/files/{file_id}/download"
        )

        self._as(viewer)
        first = self.client.get(url)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.content, b"fake-weights")
        self.assertEqual(self.db.get_model_download_count(model_id), 1)

        head = self.client.head(url)
        self.assertEqual(head.status_code, 200)
        self.assertEqual(self.db.get_model_download_count(model_id), 1)

        self._as(owner)
        owned = self.client.get(url)
        self.assertEqual(owned.status_code, 200)
        self.assertEqual(self.db.get_model_download_count(model_id), 1)

        # The public social surface reports the same counter.
        social = self.client.get(f"/api/v1/models/{model_id}/social")
        self.assertEqual(social.status_code, 200)
        self.assertEqual(social.json()["download_count"], 1)

    def test_public_models_carry_real_counts(self) -> None:
        alice = self._create_user("u-a", "alice")
        bob = self._create_user("u-b", "bob")
        carol = self._create_user("u-c", "carol")

        def create_public(title: str) -> str:
            created = self.models_service.create(
                ModelCreateRequest(title=title, visibility=ModelVisibility.PUBLIC),
                user_id=alice.id,
            )
            record = self.models_service._read(created.model_id)
            record["published_at"] = datetime.now(timezone.utc).isoformat()
            record["moderation_status"] = ModelModerationStatus.APPROVED.value
            self.models_service._write(record)
            self.db.upsert_model(record)
            self.models_service.invalidate_public_cache()
            return created.model_id

        active_id = create_public("Active Model")
        quiet_id = create_public("Quiet Model")

        self._as(bob)
        self.assertEqual(
            self.client.post(f"/api/v1/models/{active_id}/star").json()["star_count"], 1
        )
        self._as(carol)
        self.assertEqual(
            self.client.post(f"/api/v1/models/{active_id}/star").json()["star_count"], 2
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/models/{active_id}/comments", json={"body": "nice"}
            ).status_code,
            201,
        )

        now_iso = datetime.now(timezone.utc).isoformat()
        for index in range(2):
            self.db.insert_generation(
                {
                    "id": uuid.uuid4().hex,
                    "prompt_id": f"prompt-{index}",
                    "user_id": alice.id,
                    "model_id": active_id,
                    "filename": f"img{index}.png",
                    "url": f"http://img{index}.png",
                    "key": f"gen-active-{index}.png",
                    "created_at": now_iso,
                }
            )

        self._as_anonymous()
        response = self.client.get("/api/v1/models/public")
        self.assertEqual(response.status_code, 200)
        items = {item["model_id"]: item for item in response.json()["items"]}
        self.assertIn(active_id, items)
        self.assertIn(quiet_id, items)

        active = items[active_id]
        self.assertEqual(active["star_count"], 2)
        self.assertEqual(active["comment_count"], 1)
        self.assertEqual(active["run_count"], 2)
        self.assertEqual(active["author_id"], alice.id)

        quiet = items[quiet_id]
        self.assertEqual(quiet["star_count"], 0)
        self.assertEqual(quiet["comment_count"], 0)
        self.assertEqual(quiet["download_count"], 0)
        self.assertEqual(quiet["run_count"], 0)

    def test_profile_aggregates_are_real(self) -> None:
        alice = self._create_user("u-a", "alice")
        bob = self._create_user("u-b", "bob")
        carol = self._create_user("u-c", "carol")
        model_id = self._seed_public_model(alice.id)

        self.db.toggle_model_star(bob.id, model_id)
        self.db.toggle_model_star(carol.id, model_id)

        self.db.record_model_download(model_id, "v1", "f1", bob.id)
        self.db.record_model_download(model_id, "v1", "f1", carol.id)

        asset_key = "alice-assets/pic.png"
        self.db.insert_generation(
            {
                "id": uuid.uuid4().hex,
                "prompt_id": "prompt-asset",
                "user_id": alice.id,
                "filename": "pic.png",
                "url": "http://pic.png",
                "key": asset_key,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        self.db.toggle_asset_like(bob.id, asset_key)
        self.db.toggle_asset_like(carol.id, asset_key)

        profile = self.client.get("/api/v1/users/alice")
        self.assertEqual(profile.status_code, 200)
        body = profile.json()
        self.assertEqual(body["stars_count"], 2)
        self.assertEqual(body["downloads_count"], 2)
        self.assertEqual(body["likes_count"], 2)

        fresh = self._create_user("u-new", "newbie")
        blank = self.client.get("/api/v1/users/newbie")
        self.assertEqual(blank.status_code, 200)
        self.assertEqual(blank.json()["id"], fresh.id)
        self.assertEqual(blank.json()["stars_count"], 0)
        self.assertEqual(blank.json()["downloads_count"], 0)
        self.assertEqual(blank.json()["likes_count"], 0)

    def test_asset_delete_clears_likes(self) -> None:
        owner = self._create_user("u-owner", "owner")
        bob = self._create_user("u-b", "bob")
        carol = self._create_user("u-c", "carol")
        key = "prompt-del/asset.png"
        self._write_asset(key, user_id=owner.id)

        self.db.toggle_asset_like(bob.id, key)
        self.db.toggle_asset_like(carol.id, key)
        self.assertEqual(
            self._count_rows("asset_likes", "asset_key = ?", (key,)), 2
        )

        self._as(owner)
        deleted = self.client.delete(f"/api/v1/gallery/{key}")
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.json()["deleted"])
        self.assertEqual(
            self._count_rows("asset_likes", "asset_key = ?", (key,)), 0
        )

        # The service hook clears likes even without a physical file.
        orphan_key = "prompt-del/orphan.png"
        self.db.toggle_asset_like(bob.id, orphan_key)
        get_social_service().on_asset_deleted(orphan_key)
        self.assertEqual(
            self._count_rows("asset_likes", "asset_key = ?", (orphan_key,)), 0
        )


if __name__ == "__main__":
    unittest.main()
