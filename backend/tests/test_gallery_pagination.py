"""Focused coverage for the owner-scoped ``GET /api/v1/gallery/me`` page.

The privacy invariant is tested first: visibility (owner + saved) is applied
before search, sorting, the ``total`` and the offset/limit slice, so a page can
never count or reveal another user's private media or an unsaved run.

Everything runs against a temporary storage directory and a temporary SQLite
database; no ComfyUI, network, Anthropic key or developer filesystem is used.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database
from app.main import app
import app.main as main_mod
from app.routers.auth import get_current_user
from app.schemas import CollectionItemsAddRequest, UserResponse
from app.services.collections_service import CollectionsService, get_collections_service
from app.services.storage import StorageService

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"gallery-page-fixture"
MP4_BYTES = b"\x00\x00\x00\x18ftypmp42" + b"gallery-page-video"


def _user(user_id: str) -> UserResponse:
    return UserResponse(
        id=user_id,
        username=user_id,
        email=f"{user_id}@test.com",
        role="creator",
        created_at="2026-01-01T00:00:00Z",
    )


class GalleryPageRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.settings = Settings(
            DB_PATH=str(self.root / "gallery-page.db"),
            STORAGE_DIR=str(self.root / "storage"),
            MODELS_DIR=str(self.root / "models"),
            TOOLS_DIR=str(self.root / "tools"),
            JWT_SECRET="gallery-page-test-secret-32-chars!!",
            FILES_PUBLIC_BASE="http://testserver",
            S3_ENABLED=False,
            GALLERY_LIMIT=50,
        )
        self.storage = StorageService(settings=self.settings)
        self.storage.ensure_root()
        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        for uid in ("alice", "bob"):
            self.db.create_user(
                user_id=uid,
                email=f"{uid}@example.test",
                username=uid,
                hashed_password="x",
            )
        self.collections = CollectionsService(db=self.db, storage=self.storage)

        self._orig_storage = main_mod.storage
        main_mod.storage = self.storage
        app.dependency_overrides[get_current_user] = lambda: _user("alice")
        app.dependency_overrides[get_collections_service] = lambda: self.collections
        self.client = TestClient(app)

    def tearDown(self) -> None:
        main_mod.storage = self._orig_storage
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    # --- fixtures ---------------------------------------------------------

    def seed(
        self,
        rel: str,
        metadata: dict | None = None,
        *,
        mtime: float = 1_700_000_000.0,
        video: bool = False,
    ) -> Path:
        media = self.storage.root / rel
        media.parent.mkdir(parents=True, exist_ok=True)
        media.write_bytes(MP4_BYTES if video else PNG_BYTES)
        (media.with_suffix(media.suffix + ".json")).write_text(
            json.dumps(metadata if metadata is not None else {"user_id": "alice"}),
            encoding="utf-8",
        )
        os.utime(media, (mtime, mtime))
        return media

    def get(self, **params) -> dict:
        resp = self.client.get("/api/v1/gallery/me", params=params)
        self.assertEqual(resp.status_code, 200, resp.text)
        return resp.json()

    # --- paging -----------------------------------------------------------

    def test_offset_limit_and_has_more_with_stable_newest_order(self) -> None:
        for index in range(5):
            self.seed(
                f"alice/p{index}/img{index}.png",
                {"user_id": "alice", "gallery_saved": True},
                mtime=1_700_000_000.0 + index,
            )

        first = self.get(limit=2, offset=0)
        self.assertEqual(first["total"], 5)
        self.assertEqual(first["offset"], 0)
        self.assertEqual(first["limit"], 2)
        self.assertTrue(first["has_more"])
        self.assertEqual(
            [item["key"] for item in first["items"]],
            ["alice/p4/img4.png", "alice/p3/img3.png"],
        )

        last = self.get(limit=2, offset=4)
        self.assertEqual(last["total"], 5)
        self.assertFalse(last["has_more"])
        self.assertEqual([item["key"] for item in last["items"]], ["alice/p0/img0.png"])

        beyond = self.get(limit=2, offset=10)
        self.assertEqual(beyond["items"], [])
        self.assertEqual(beyond["total"], 5)

    def test_sort_orders_are_deterministic_and_tie_broken_by_key(self) -> None:
        same_mtime = 1_700_000_000.0
        self.seed("alice/p/b.png", {"user_id": "alice"}, mtime=same_mtime)
        self.seed("alice/p/a.png", {"user_id": "alice"}, mtime=same_mtime)
        self.seed("alice/p/c.png", {"user_id": "alice"}, mtime=same_mtime + 10)

        newest = [i["key"] for i in self.get(sort="newest")["items"]]
        self.assertEqual(
            newest, ["alice/p/c.png", "alice/p/a.png", "alice/p/b.png"]
        )
        oldest = [i["key"] for i in self.get(sort="oldest")["items"]]
        self.assertEqual(
            oldest, ["alice/p/a.png", "alice/p/b.png", "alice/p/c.png"]
        )
        by_name = [i["key"] for i in self.get(sort="name")["items"]]
        self.assertEqual(
            by_name, ["alice/p/a.png", "alice/p/b.png", "alice/p/c.png"]
        )

    # --- visibility -------------------------------------------------------

    def test_total_excludes_unsaved_and_foreign_private_assets(self) -> None:
        self.seed("alice/p1/pub.png", {"user_id": "alice", "gallery_saved": True})
        self.seed("alice/p2/unsaved.png", {"user_id": "alice", "gallery_saved": False})
        self.seed("alice/p3/priv.png", {"user_id": "alice", "is_private": True})
        self.seed(
            "bob/p1/secret.png",
            {"user_id": "bob", "gallery_saved": True, "is_private": True},
        )

        page = self.get(limit=10)
        self.assertEqual(page["total"], 2)
        self.assertEqual(
            {item["key"] for item in page["items"]},
            {"alice/p1/pub.png", "alice/p3/priv.png"},
        )

    def test_anonymous_owner_page_is_401(self) -> None:
        app.dependency_overrides.pop(get_current_user, None)
        resp = self.client.get("/api/v1/gallery/me")
        self.assertEqual(resp.status_code, 401)

    # --- search / filters -------------------------------------------------

    def test_query_matches_prompt_tool_name_and_tags_case_insensitively(self) -> None:
        self.seed(
            "alice/p1/a.png",
            {"user_id": "alice", "prompt": "Neon City at night"},
        )
        self.seed(
            "alice/p2/b.png",
            {"user_id": "alice", "tool_name": "Upscale Pro"},
        )
        self.seed(
            "alice/p3/c.png",
            {"user_id": "alice", "tags": ["Portrait", "studio"]},
        )
        self.seed("alice/p4/d.png", {"user_id": "alice", "prompt": "nothing"})

        self.assertEqual(
            [i["key"] for i in self.get(q="neon city")["items"]], ["alice/p1/a.png"]
        )
        self.assertEqual(
            [i["key"] for i in self.get(q="upscale")["items"]], ["alice/p2/b.png"]
        )
        self.assertEqual(
            [i["key"] for i in self.get(q="portrait")["items"]], ["alice/p3/c.png"]
        )
        # Key names are searchable too (the fixture directory uses p4).
        self.assertEqual(
            [i["key"] for i in self.get(q="p4")["items"]], ["alice/p4/d.png"]
        )

    def test_source_filter_separates_workspace_and_tool_assets(self) -> None:
        self.seed("alice/p1/gen.png", {"user_id": "alice"})
        self.seed(
            "alice/p2/tool.png",
            {"user_id": "alice", "origin": "ai_tool_studio"},
        )

        workspace = self.get(source="workspace")
        self.assertEqual([i["key"] for i in workspace["items"]], ["alice/p1/gen.png"])
        tools = self.get(source="ai_tool_studio")
        self.assertEqual([i["key"] for i in tools["items"]], ["alice/p2/tool.png"])
        everything = self.get(source="all")
        self.assertEqual(everything["total"], 2)

    def test_media_type_filter_matches_frontend_asset_type_mapping(self) -> None:
        self.seed("alice/p1/img.png", {"user_id": "alice"})
        self.seed("alice/p2/clip.mp4", {"user_id": "alice"}, video=True)

        images = self.get(media_type="image")
        self.assertEqual([i["key"] for i in images["items"]], ["alice/p1/img.png"])
        videos = self.get(media_type="video")
        self.assertEqual([i["key"] for i in videos["items"]], ["alice/p2/clip.mp4"])
        # The gallery allowlist has no model extensions yet: honest empty page.
        models = self.get(media_type="3d")
        self.assertEqual(models["items"], [])
        self.assertEqual(models["total"], 0)

    def test_invalid_sort_source_and_media_type_are_rejected_by_contract(self) -> None:
        for field in (
            {"sort": "sideways"},
            {"source": "elsewhere"},
            {"media_type": "audio"},
        ):
            with self.subTest(field=field):
                resp = self.client.get("/api/v1/gallery/me", params=field)
                self.assertEqual(resp.status_code, 422)

    # --- collections ------------------------------------------------------

    def test_collection_filter_intersects_and_unknown_id_is_404(self) -> None:
        self.seed("alice/p1/one.png", {"user_id": "alice"})
        self.seed("alice/p2/two.png", {"user_id": "alice"})

        collection = self.collections.create_collection("alice", "Picks")
        self.collections.add_items(
            "alice",
            collection.id,
            CollectionItemsAddRequest(keys=["alice/p2/two.png"]),
        )

        page = self.get(collection_id=collection.id)
        self.assertEqual([i["key"] for i in page["items"]], ["alice/p2/two.png"])
        self.assertEqual(page["total"], 1)

        missing = self.client.get(
            "/api/v1/gallery/me", params={"collection_id": "no-such-collection"}
        )
        self.assertEqual(missing.status_code, 404)

    def test_foreign_collection_id_is_404(self) -> None:
        self.seed("bob/p1/bob.png", {"user_id": "bob"})
        bob_collection = self.collections.create_collection("bob", "Bob Picks")

        resp = self.client.get(
            "/api/v1/gallery/me", params={"collection_id": bob_collection.id}
        )
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
