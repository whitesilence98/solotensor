"""Focused coverage for authenticated owner mutations and reference-key reads.

Two trust boundaries the privacy batch must hold, tested without ComfyUI,
network, Anthropic or the developer filesystem:

* Authenticated asset mutations (PATCH saved, PUT tags, auto-tag, DELETE) are
  owner-authorized: the owner may mutate their own private/unsaved asset, a
  foreign *visible* asset is a 403, and an asset the caller cannot see must not
  reveal its existence through a read or a mutation.
* A stored ``/files/<key>`` reference passed into generation inputs (image,
  audio) is re-read through the same visibility policy, so a foreign private
  key -- with or without a stale ``?cap=`` query -- cannot be laundered into
  the caller's own run.

All storage lives in a temporary directory with a temporary SQLite DB.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app, _resolve_upload_bytes
import app.main as main_mod
from app.routers.auth import get_current_user, get_optional_user
from app.schemas import UserResponse
from app.services.media_access import MediaNotFound
from app.services.rbac_service import get_rbac_service
from app.services.storage import StorageService

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"mutation-reference-fixture"


def _user(user_id: str) -> UserResponse:
    return UserResponse(
        id=user_id,
        username=user_id,
        email=f"{user_id}@test.com",
        role="creator",
        created_at="2026-01-01T00:00:00Z",
    )


class _MockRBAC:
    def __init__(self, permissions=()):
        self.permissions = set(permissions)

    async def has_permission(self, user_id: str, permission: str) -> bool:
        return "*" in self.permissions or permission in self.permissions


class _IsolatedStorageCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.settings = Settings(
            DB_PATH=str(self.root / "mutations.db"),
            STORAGE_DIR=str(self.root / "storage"),
            MODELS_DIR=str(self.root / "models"),
            TOOLS_DIR=str(self.root / "tools"),
            JWT_SECRET="mutation-reference-test-secret!!",
            FILES_PUBLIC_BASE="http://testserver",
            S3_ENABLED=False,
        )
        self.storage = StorageService(settings=self.settings)
        self.storage.ensure_root()
        self._orig_storage = main_mod.storage
        main_mod.storage = self.storage
        # Never consult a live RBAC database: every check is a pure mock.
        app.dependency_overrides[get_rbac_service] = lambda: _MockRBAC()
        app.dependency_overrides[get_optional_user] = lambda: None
        self.client = TestClient(app)
        self.addCleanup(self._cleanup)

    def _cleanup(self) -> None:
        main_mod.storage = self._orig_storage
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def seed(self, rel: str, metadata: dict) -> Path:
        media = self.storage.root / rel
        media.parent.mkdir(parents=True, exist_ok=True)
        media.write_bytes(PNG_BYTES)
        (media.with_suffix(media.suffix + ".json")).write_text(
            json.dumps(metadata, ensure_ascii=False), encoding="utf-8"
        )
        return media

    def as_user(self, user_id: str) -> None:
        viewer = _user(user_id)
        app.dependency_overrides[get_current_user] = lambda: viewer
        app.dependency_overrides[get_optional_user] = lambda: viewer

    def as_user_with(self, user_id: str, permissions=()) -> None:
        self.as_user(user_id)
        app.dependency_overrides[get_rbac_service] = lambda: _MockRBAC(permissions)


class OwnerMutationAuthorizationTests(_IsolatedStorageCase):
    def test_owner_can_mutate_their_private_and_unsaved_assets(self) -> None:
        self.seed(
            "owner_a/p1/priv.png",
            {"user_id": "owner_a", "is_private": True, "tags": ["keep"]},
        )
        self.seed(
            "owner_a/p2/unsaved.png",
            {"user_id": "owner_a", "gallery_saved": False, "tags": ["keep"]},
        )
        self.as_user("owner_a")

        saved = self.client.patch(
            "/api/v1/assets/owner_a/p1/priv.png", params={"saved": "true"}
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertFalse(saved.json()["metadata"]["gallery_saved"] is False)

        tagged = self.client.put(
            "/api/v1/assets/owner_a/p1/priv.png/tags",
            json={"tags": ["portrait", "cinematic"]},
        )
        self.assertEqual(tagged.status_code, 200, tagged.text)
        self.assertEqual(
            tagged.json()["metadata"]["tags"], ["portrait", "cinematic"]
        )

        # Unsaved asset is mutable by its owner too.
        unsaved_patch = self.client.patch(
            "/api/v1/assets/owner_a/p2/unsaved.png", params={"saved": "true"}
        )
        self.assertEqual(unsaved_patch.status_code, 200, unsaved_patch.text)

        deleted = self.client.delete("/api/v1/assets/owner_a/p1/priv.png")
        self.assertEqual(deleted.status_code, 200, deleted.text)
        self.assertTrue(deleted.json()["deleted"])
        self.assertFalse(
            (self.storage.root / "owner_a/p1/priv.png").exists(),
            "owner delete must remove the media file",
        )

    def test_foreign_private_asset_is_404_for_reads_and_mutations(self) -> None:
        """Existence is hidden on read, media, save, tags, auto-tag and DELETE.

        DELETE now reuses ``_authorize_asset_mutation`` (visibility first), so a
        foreign private/unsaved key and an unknown key both answer ``404``
        instead of the old ``403`` existence oracle.
        """
        for rel, meta in (
            ("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True}),
            ("owner_a/p2/unsaved.png", {"user_id": "owner_a", "gallery_saved": False}),
        ):
            self.seed(rel, meta)

        self.as_user("owner_b")
        probes = {
            "detail": ("get", "/api/v1/assets/{key}"),
            "media": ("get", "/api/v1/assets/{key}/media"),
            "save": ("patch", "/api/v1/assets/{key}?saved=true"),
            "tags": ("put", "/api/v1/assets/{key}/tags"),
            "auto": ("post", "/api/v1/assets/{key}/tags/auto"),
            "delete_assets": ("delete", "/api/v1/assets/{key}"),
            "delete_gallery": ("delete", "/api/v1/gallery/{key}"),
        }
        for rel in (
            "owner_a/p1/priv.png",
            "owner_a/p2/unsaved.png",
            "owner_a/p1/does-not-exist.png",
        ):
            for label, (verb, template) in probes.items():
                url = template.format(key=rel)
                with self.subTest(key=rel, probe=label):
                    if verb == "put":
                        resp = self.client.put(url, json={"tags": ["x"]})
                    elif verb == "patch":
                        resp = self.client.patch(url)
                    else:
                        resp = getattr(self.client, verb)(url)
                    self.assertEqual(resp.status_code, 404, resp.text)
                    self.assertEqual(resp.json()["detail"], "Asset not found")

        # A denied DELETE must leave the foreign media and sidecar on disk.
        for rel in ("owner_a/p1/priv.png", "owner_a/p2/unsaved.png"):
            with self.subTest(still_present=rel):
                self.assertTrue((self.storage.root / rel).exists())
                self.assertTrue(
                    (self.storage.root / (rel + ".json")).exists()
                )

    def test_foreign_public_asset_delete_is_403_and_moderator_can_delete(self) -> None:
        """A visible foreign asset is 403 for DELETE, not hidden; override deletes."""
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a"})

        self.as_user_with("owner_b", permissions=[])
        for verb in ("assets", "gallery"):
            with self.subTest(route=verb):
                resp = self.client.delete(f"/api/v1/{verb}/owner_a/p1/pub.png")
                self.assertEqual(resp.status_code, 403, resp.text)
        self.assertTrue((self.storage.root / "owner_a/p1/pub.png").exists())

        self.as_user_with("moderator", permissions=["generation:delete_any"])
        resp = self.client.delete("/api/v1/assets/owner_a/p1/pub.png")
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertTrue(resp.json()["deleted"])
        self.assertFalse((self.storage.root / "owner_a/p1/pub.png").exists())

    def test_visible_foreign_asset_mutation_requires_override(self) -> None:
        """A public foreign asset is visible (403), not hidden (404)."""
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a"})

        self.as_user_with("owner_b", permissions=[])
        self.assertEqual(
            self.client.get("/api/v1/assets/owner_a/p1/pub.png").status_code, 200
        )
        self.assertEqual(
            self.client.patch(
                "/api/v1/assets/owner_a/p1/pub.png", params={"saved": "true"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.put(
                "/api/v1/assets/owner_a/p1/pub.png/tags", json={"tags": ["x"]}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete("/api/v1/assets/owner_a/p1/pub.png").status_code, 403
        )

        # The moderator override path is unchanged.
        self.as_user_with("moderator", permissions=["generation:delete_any"])
        self.assertEqual(
            self.client.patch(
                "/api/v1/assets/owner_a/p1/pub.png", params={"saved": "true"}
            ).status_code,
            200,
        )


class ReferenceKeyReadPolicyTests(_IsolatedStorageCase):
    """``_resolve_upload_bytes`` must not launder a foreign private key."""

    def setUp(self) -> None:
        super().setUp()
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a"})
        self.seed(
            "owner_a/p1/unsaved.png",
            {"user_id": "owner_a", "gallery_saved": False},
        )
        audio = self.storage.root / "owner_a/p1/voice.mp3"
        audio.parent.mkdir(parents=True, exist_ok=True)
        audio.write_bytes(b"ID3fakeaudio")
        (audio.with_suffix(audio.suffix + ".json")).write_text(
            json.dumps({"user_id": "owner_a", "gallery_saved": False}),
            encoding="utf-8",
        )

    def resolve(self, raw: str, **kwargs) -> bytes:
        return asyncio.run(_resolve_upload_bytes(self.storage, raw, **kwargs))

    def test_public_key_resolves_without_a_viewer(self) -> None:
        self.assertEqual(self.resolve("owner_a/p1/pub.png"), PNG_BYTES)
        self.assertEqual(
            self.resolve("http://testserver/files/owner_a/p1/pub.png"), PNG_BYTES
        )

    def test_owner_private_and_unsaved_keys_resolve_for_the_owner(self) -> None:
        self.assertEqual(
            self.resolve("owner_a/p1/priv.png", viewer_id="owner_a"), PNG_BYTES
        )
        self.assertEqual(
            self.resolve(
                "/files/owner_a/p1/unsaved.png?foo=1", viewer_id="owner_a"
            ),
            PNG_BYTES,
        )

    def test_foreign_private_key_is_denied_with_or_without_a_cap_query(self) -> None:
        for raw in (
            "owner_a/p1/priv.png",
            "/files/owner_a/p1/priv.png",
            # A stale/foreign capability in the query is discarded, not honored.
            "/files/owner_a/p1/priv.png?cap=deadbeef",
            "http://testserver/files/owner_a/p1/unsaved.png",
        ):
            with self.subTest(raw=raw):
                with self.assertRaises(MediaNotFound):
                    self.resolve(raw, viewer_id="owner_b")
                with self.assertRaises(MediaNotFound):
                    self.resolve(raw)

    def test_traversal_in_a_reference_key_is_rejected(self) -> None:
        for raw in (
            "/files/owner_a/../../etc/passwd",
            "/files/..%2F..%2Fetc%2Fpasswd",
            "..\\..\\windows\\system32\\config",
        ):
            with self.subTest(raw=raw):
                with self.assertRaises(MediaNotFound):
                    self.resolve(raw, viewer_id="owner_a")

    def test_audio_reference_requires_the_audio_opt_in(self) -> None:
        with self.assertRaises(MediaNotFound):
            self.resolve("owner_a/p1/voice.mp3", viewer_id="owner_a")
        self.assertEqual(
            self.resolve(
                "/files/owner_a/p1/voice.mp3", viewer_id="owner_a", allow_audio=True
            ),
            b"ID3fakeaudio",
        )
        with self.assertRaises(MediaNotFound):
            self.resolve(
                "owner_a/p1/voice.mp3", viewer_id="owner_b", allow_audio=True
            )


class DerivativeUrlPolicyTests(_IsolatedStorageCase):
    """A derivative URL must not widen the parent's authorization."""

    def test_derivative_url_of_a_private_parent_is_not_served_anonymously(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed(
            "owner_a/p1/pub.png",
            {
                "user_id": "owner_a",
                "before_detailer_url": "http://testserver/files/owner_a/p1/priv.png",
                "has_detailer": True,
            },
        )

        # The public asset's detail response exposes a derivative URL that
        # points at the private parent. Serving must re-check the parent's
        # sidecar, so the URL stays 404 for anyone but the owner.
        detail = self.client.get("/api/v1/assets/owner_a/p1/pub.png")
        self.assertEqual(detail.status_code, 200, detail.text)
        derivative_url = detail.json()["before_detailer_url"]
        self.assertIsNotNone(derivative_url)
        self.assertNotIn("cap=", derivative_url)

        anonymous = self.client.get(derivative_url)
        self.assertEqual(anonymous.status_code, 404)

        self.as_user("owner_b")
        self.assertEqual(self.client.get(derivative_url).status_code, 404)

        self.as_user("owner_a")
        self.assertEqual(self.client.get(derivative_url).status_code, 200)


class CollectionPrivacyInteractionTests(_IsolatedStorageCase):
    """Collections intersect with, but never override, gallery visibility."""

    def setUp(self) -> None:
        super().setUp()
        from app.db import Database
        from app.services.collections_service import CollectionsService

        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        for uid in ("owner_a", "owner_b"):
            self.db.create_user(
                user_id=uid,
                email=f"{uid}@example.test",
                username=uid,
                hashed_password="x",
            )
        self.collections = CollectionsService(db=self.db, storage=self.storage)
        from app.services.collections_service import get_collections_service

        app.dependency_overrides[get_collections_service] = lambda: self.collections

    def test_collection_page_still_hides_unsaved_members(self) -> None:
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a", "gallery_saved": True})
        self.seed(
            "owner_a/p2/unsaved.png",
            {"user_id": "owner_a", "gallery_saved": False},
        )
        from app.schemas import CollectionItemsAddRequest

        collection = self.collections.create_collection("owner_a", "Picks")
        added = self.collections.add_items(
            "owner_a",
            collection.id,
            CollectionItemsAddRequest(
                keys=["owner_a/p1/pub.png", "owner_a/p2/unsaved.png"]
            ),
        )
        self.assertEqual(len(added.added), 2)

        self.as_user("owner_a")
        page = self.client.get(
            "/api/v1/gallery/me", params={"collection_id": collection.id, "limit": 10}
        )
        self.assertEqual(page.status_code, 200, page.text)
        body = page.json()
        self.assertEqual([i["key"] for i in body["items"]], ["owner_a/p1/pub.png"])
        self.assertEqual(body["total"], 1)


if __name__ == "__main__":
    unittest.main()
