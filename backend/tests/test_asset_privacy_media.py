"""Focused coverage for guarded media serving and asset privacy.

Covers the asset-privacy batch's trust boundaries:

* ``GET/HEAD /files/{key}`` replaces the old StaticFiles mount and authorizes the
  current sidecar on every request (public, owner-capability, private owner,
  orphan/unsaved fail-closed, sidecar JSON and traversal never served).
* Capabilities are purpose-scoped, expiry-bounded, bound to one exact key and
  viewer, and defeated by a later ownership change.
* ``GET /api/v1/assets/{key}/media`` refreshes URLs and hides foreign assets.
* Local file reads used as generation inputs apply the same visibility policy,
  so a foreign private ``/files`` key cannot be laundered into a run.

Everything runs against a temporary ``STORAGE_DIR`` and a temporary SQLite
database; no ComfyUI, network, Anthropic key or developer filesystem is used.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
import app.main as main_mod
from app.routers.auth import get_optional_user
from app.schemas import UserResponse
from app.services.media_access import (
    MediaNotFound,
    sign_capability,
    verify_capability,
)
from app.services.storage import StorageService

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"asset-privacy-fixture"


def _user(user_id: str) -> UserResponse:
    return UserResponse(
        id=user_id,
        username=user_id,
        email=f"{user_id}@test.com",
        role="creator",
        created_at="2026-01-01T00:00:00Z",
    )


class _StorageTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings = Settings(
            DB_PATH=str(Path(self.temp_dir.name) / "privacy.db"),
            STORAGE_DIR=str(Path(self.temp_dir.name) / "storage"),
            MODELS_DIR=str(Path(self.temp_dir.name) / "models"),
            TOOLS_DIR=str(Path(self.temp_dir.name) / "tools"),
            JWT_SECRET="asset-privacy-test-secret-32-chars!",
            FILES_PUBLIC_BASE="http://testserver",
            S3_ENABLED=False,
        )
        self.storage = StorageService(settings=self.settings)
        self.storage.ensure_root()
        self._orig_storage = main_mod.storage
        main_mod.storage = self.storage
        app.dependency_overrides[get_optional_user] = lambda: None

    def tearDown(self) -> None:
        main_mod.storage = self._orig_storage
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def seed(
        self,
        rel: str,
        metadata: dict | None = None,
        *,
        sidecar: bool = True,
    ) -> Path:
        media = self.storage.root / rel
        media.parent.mkdir(parents=True, exist_ok=True)
        media.write_bytes(PNG_BYTES)
        if sidecar:
            sidecar_path = media.with_suffix(media.suffix + ".json")
            sidecar_path.write_text(json.dumps(metadata), encoding="utf-8")
        return media

    def as_user(self, viewer: UserResponse | None) -> None:
        app.dependency_overrides[get_optional_user] = lambda: viewer


class FilesRouteAuthorizationTests(_StorageTestCase):
    def test_public_generation_is_served_anonymously_with_media_headers(self) -> None:
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a", "gallery_saved": True})

        client = TestClient(app)
        resp = client.get("/files/owner_a/p1/pub.png")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, PNG_BYTES)
        self.assertEqual(resp.headers.get("cache-control"), "no-store")
        self.assertEqual(resp.headers.get("referrer-policy"), "no-referrer")
        self.assertEqual(resp.headers.get("x-content-type-options"), "nosniff")

        head = client.head("/files/owner_a/p1/pub.png")
        self.assertEqual(head.status_code, 200)

    def test_range_errors_keep_media_security_headers(self) -> None:
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a", "gallery_saved": True})
        client = TestClient(app)

        unsatisfiable = client.get(
            "/files/owner_a/p1/pub.png", headers={"Range": "bytes=9999-10000"}
        )
        self.assertEqual(unsatisfiable.status_code, 416)
        self.assertEqual(unsatisfiable.headers.get("cache-control"), "no-store")
        self.assertEqual(unsatisfiable.headers.get("referrer-policy"), "no-referrer")
        self.assertIsNotNone(unsatisfiable.headers.get("content-range"))

        malformed = client.get(
            "/files/owner_a/p1/pub.png", headers={"Range": "bytes=abc"}
        )
        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(malformed.headers.get("cache-control"), "no-store")
        self.assertEqual(malformed.headers.get("referrer-policy"), "no-referrer")

        partial = client.get(
            "/files/owner_a/p1/pub.png", headers={"Range": "bytes=0-9"}
        )
        self.assertEqual(partial.status_code, 206)
        self.assertEqual(partial.headers.get("cache-control"), "no-store")
        self.assertEqual(len(partial.content), 10)

    def test_private_asset_denied_anonymously_and_to_foreign_users(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed("owner_a/p1/unsaved.png", {"user_id": "owner_a", "gallery_saved": False})
        self.seed("owner_a/p1/orphan.png", None, sidecar=False)
        self.seed("owner_a/p1/malformed.png", None, sidecar=True)
        (self.storage.root / "owner_a/p1/malformed.png.json").write_text(
            "[1, 2, 3]", encoding="utf-8"
        )

        client = TestClient(app)
        for key in (
            "owner_a/p1/priv.png",
            "owner_a/p1/unsaved.png",
            "owner_a/p1/orphan.png",
            "owner_a/p1/malformed.png",
        ):
            with self.subTest(key=key):
                anon = client.get(f"/files/{key}")
                self.assertEqual(anon.status_code, 404)
                self.assertEqual(anon.headers.get("cache-control"), "no-store")
                self.assertEqual(anon.headers.get("referrer-policy"), "no-referrer")

                self.as_user(_user("owner_b"))
                foreign = client.get(f"/files/{key}")
                self.assertEqual(foreign.status_code, 404)
                self.as_user(None)

        self.as_user(_user("owner_a"))
        for key in ("owner_a/p1/priv.png", "owner_a/p1/unsaved.png"):
            with self.subTest(owner=key):
                self.assertEqual(client.get(f"/files/{key}").status_code, 200)

    def test_sidecar_json_config_and_traversal_are_never_served(self) -> None:
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a"})
        self.seed("owner_a/p1/workflow.json", {"user_id": "owner_a"})

        client = TestClient(app)
        for key in (
            "owner_a/p1/pub.png.json",
            "owner_a/p1/workflow.json",
            "owner_a/../secret.png",
            "owner_a%2F..%2Fsecret.png",
            "owner_a\\p1\\pub.png",
            "C:/Windows/system.ini",
        ):
            with self.subTest(key=key):
                if ".." in key and "%" not in key and "\\" not in key:
                    # Starlette resolves dot segments before routing; a plain
                    # traversal never reaches the handler as a storage key.
                    resp = client.get(f"/files/{key}")
                else:
                    resp = client.get(f"/files/{key}")
                self.assertEqual(resp.status_code, 404)

    def test_symlink_escape_is_rejected_when_supported(self) -> None:
        outside_dir = tempfile.TemporaryDirectory()
        self.addCleanup(outside_dir.cleanup)
        outside = Path(outside_dir.name) / "outside.png"
        outside.write_bytes(PNG_BYTES)
        (self.storage.root / "owner_a").mkdir(parents=True, exist_ok=True)
        link = self.storage.root / "owner_a" / "link.png"
        try:
            os.symlink(outside, link)
        except (OSError, NotImplementedError):
            self.skipTest("symlink creation is unavailable on this platform")

        with self.assertRaises(MediaNotFound):
            self.storage.authorize_media("owner_a/link.png")

    def test_avatar_namespace_is_public_media(self) -> None:
        self.seed("owner_a/avatars/avatar.png", None, sidecar=False)

        client = TestClient(app)
        self.assertEqual(client.get("/files/owner_a/avatars/avatar.png").status_code, 200)


class CapabilityTokenTests(_StorageTestCase):
    def test_capability_is_key_and_viewer_scoped_and_time_bounded(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed("owner_a/p1/other.png", {"user_id": "owner_a", "is_private": True})

        token, expires = sign_capability(
            "owner_a/p1/priv.png", "owner_a", settings=self.settings
        )
        self.assertLessEqual(expires - __import__("time").time(), 600)
        self.assertEqual(
            verify_capability(token, "owner_a/p1/priv.png", settings=self.settings),
            "owner_a",
        )
        self.assertIsNone(
            verify_capability(token, "owner_a/p1/other.png", settings=self.settings)
        )
        self.assertIsNone(
            verify_capability(token, "owner_a/p1/priv.png", now=expires + 1, settings=self.settings)
        )
        # Expiry is exclusive: the token is already unusable at its exp second.
        self.assertIsNone(
            verify_capability(token, "owner_a/p1/priv.png", now=expires, settings=self.settings)
        )
        self.assertEqual(
            verify_capability(
                token, "owner_a/p1/priv.png", now=expires - 1, settings=self.settings
            ),
            "owner_a",
        )
        self.assertIsNone(verify_capability(token + "x", "owner_a/p1/priv.png", settings=self.settings))

    def test_non_ascii_token_fails_closed_instead_of_raising(self) -> None:
        token, _ = sign_capability("owner_a/p1/priv.png", "owner_a", settings=self.settings)
        body, _, signature = token.partition(".")
        # A unicode body would raise on ``.encode("ascii")``; verify must return
        # None so a crafted query string can never become a 500.
        self.assertIsNone(
            verify_capability(f"{body}\\u00e9.{signature}", "owner_a/p1/priv.png", settings=self.settings)
        )
        self.assertIsNone(
            verify_capability("é.é", "owner_a/p1/priv.png", settings=self.settings)
        )
        self.assertIsNone(
            verify_capability(f"{body}.é", "owner_a/p1/priv.png", settings=self.settings)
        )

        client = TestClient(app)
        resp = client.get(
            "/files/owner_a/p1/priv.png", params={"cap": f"{body}.é"}
        )
        self.assertEqual(resp.status_code, 404)

    def test_capability_url_works_without_bearer(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        token, _ = sign_capability(
            "owner_a/p1/priv.png", "owner_a", settings=self.settings
        )

        client = TestClient(app)
        resp = client.get(f"/files/owner_a/p1/priv.png?cap={token}")
        self.assertEqual(resp.status_code, 200)

        wrong_key, _ = sign_capability(
            "owner_a/p1/other.png", "owner_a", settings=self.settings
        )
        self.assertEqual(
            client.get(f"/files/owner_a/p1/priv.png?cap={wrong_key}").status_code, 404
        )

    def test_ownership_change_defeats_a_stale_capability(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        token, _ = sign_capability(
            "owner_a/p1/priv.png", "owner_a", settings=self.settings
        )

        client = TestClient(app)
        self.assertEqual(client.get(f"/files/owner_a/p1/priv.png?cap={token}").status_code, 200)

        # Reassign the asset to another owner: the old capability is now foreign.
        (self.storage.root / "owner_a/p1/priv.png.json").write_text(
            json.dumps({"user_id": "owner_b", "is_private": True}), encoding="utf-8"
        )
        self.assertEqual(client.get(f"/files/owner_a/p1/priv.png?cap={token}").status_code, 404)


class AssetMediaRefreshRouteTests(_StorageTestCase):
    def test_public_asset_returns_unsigned_url(self) -> None:
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a"})

        client = TestClient(app)
        resp = client.get("/api/v1/assets/owner_a/p1/pub.png/media")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["key"], "owner_a/p1/pub.png")
        self.assertNotIn("cap=", body["url"])
        self.assertIsNone(body["url_expires_at"])

    def test_owner_private_asset_returns_signed_url_foreign_gets_404(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})

        self.as_user(_user("owner_a"))
        client = TestClient(app)
        owner = client.get("/api/v1/assets/owner_a/p1/priv.png/media")
        self.assertEqual(owner.status_code, 200)
        body = owner.json()
        self.assertIn("cap=", body["url"])
        self.assertIsNotNone(body["url_expires_at"])
        self.assertEqual(client.get(body["url"]).status_code, 200)

        self.as_user(_user("owner_b"))
        self.assertEqual(
            client.get("/api/v1/assets/owner_a/p1/priv.png/media").status_code, 404
        )

    def test_unknown_asset_is_404(self) -> None:
        client = TestClient(app)
        self.assertEqual(
            client.get("/api/v1/assets/owner_a/p1/missing.png/media").status_code, 404
        )


class LocalReadAuthorizationTests(_StorageTestCase):
    """Generation inputs must not read foreign private media by key."""

    def test_private_foreign_reference_read_is_denied(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})

        with self.assertRaises(MediaNotFound):
            asyncio.run(
                self.storage.get_image_bytes("owner_a/p1/priv.png", viewer_id="owner_b")
            )

    def test_owner_and_public_reference_reads_succeed(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a"})

        self.assertEqual(
            asyncio.run(
                self.storage.get_image_bytes(
                    "owner_a/p1/priv.png", viewer_id="owner_a"
                )
            ),
            PNG_BYTES,
        )
        self.assertEqual(
            asyncio.run(self.storage.get_image_bytes("owner_a/p1/pub.png")), PNG_BYTES
        )

    def test_reference_audio_read_requires_opt_in(self) -> None:
        audio = self.storage.root / "owner_a/p1/voice.mp3"
        audio.parent.mkdir(parents=True, exist_ok=True)
        audio.write_bytes(b"ID3fakeaudio")
        (audio.with_suffix(audio.suffix + ".json")).write_text(
            json.dumps({"user_id": "owner_a", "gallery_saved": False}), encoding="utf-8"
        )

        with self.assertRaises(MediaNotFound):
            asyncio.run(self.storage.get_image_bytes("owner_a/p1/voice.mp3"))
        self.assertEqual(
            asyncio.run(
                self.storage.get_image_bytes(
                    "owner_a/p1/voice.mp3", viewer_id="owner_a", allow_audio=True
                )
            ),
            b"ID3fakeaudio",
        )


class AssetDeleteAuthorizationTests(_StorageTestCase):
    """DELETE must not confirm a hidden asset's existence.

    A foreign private/unsaved key answers 404 exactly like an unknown key; the
    owner can delete their own hidden asset; a visible foreign public asset
    still answers 403 unless the caller holds ``generation:delete_any``.
    """

    def setUp(self) -> None:
        super().setUp()
        from app.routers.auth import get_current_user
        from app.services.rbac_service import get_rbac_service

        class _NoPermissions:
            async def has_permission(self, user_id: str, permission: str) -> bool:
                return False

        class _DeleteAny:
            async def has_permission(self, user_id: str, permission: str) -> bool:
                return permission == "generation:delete_any"

        self._no_permissions = _NoPermissions()
        self._delete_any = _DeleteAny()
        app.dependency_overrides[get_rbac_service] = lambda: self._no_permissions
        app.dependency_overrides[get_current_user] = lambda: _user("owner_b")
        self.client = TestClient(app)

    def test_hidden_foreign_assets_are_404_like_unknown_keys(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed(
            "owner_a/p2/unsaved.png", {"user_id": "owner_a", "gallery_saved": False}
        )

        for key in (
            "owner_a/p1/priv.png",
            "owner_a/p2/unsaved.png",
            "owner_a/p1/missing.png",
        ):
            with self.subTest(key=key):
                resp = self.client.delete(f"/api/v1/assets/{key}")
                self.assertEqual(resp.status_code, 404, resp.text)
                self.assertEqual(resp.json().get("detail"), "Asset not found")

        # Nothing was removed by the denied probes.
        self.assertTrue((self.storage.root / "owner_a/p1/priv.png").is_file())
        self.assertTrue((self.storage.root / "owner_a/p2/unsaved.png").is_file())

    def test_owner_can_delete_own_private_and_unsaved_assets(self) -> None:
        from app.routers.auth import get_current_user

        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed(
            "owner_a/p2/unsaved.png", {"user_id": "owner_a", "gallery_saved": False}
        )
        app.dependency_overrides[get_current_user] = lambda: _user("owner_a")

        for key in ("owner_a/p1/priv.png", "owner_a/p2/unsaved.png"):
            with self.subTest(key=key):
                resp = self.client.delete(f"/api/v1/assets/{key}")
                self.assertEqual(resp.status_code, 200, resp.text)
                self.assertTrue(resp.json()["deleted"])
                self.assertFalse((self.storage.root / key).exists())

    def test_visible_public_asset_still_403_without_override(self) -> None:
        from app.routers.auth import get_current_user
        from app.services.rbac_service import get_rbac_service

        self.seed("owner_a/p1/pub.png", {"user_id": "owner_a"})

        denied = self.client.delete("/api/v1/assets/owner_a/p1/pub.png")
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertTrue((self.storage.root / "owner_a/p1/pub.png").is_file())

        app.dependency_overrides[get_rbac_service] = lambda: self._delete_any
        app.dependency_overrides[get_current_user] = lambda: _user("moderator")
        allowed = self.client.delete("/api/v1/assets/owner_a/p1/pub.png")
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertFalse((self.storage.root / "owner_a/p1/pub.png").exists())


class GalleryVisibilityTests(_StorageTestCase):
    def test_listing_filters_privacy_before_the_limit(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed("owner_a/p2/unsaved.png", {"user_id": "owner_a", "gallery_saved": False})
        self.seed("owner_a/p3/pub.png", {"user_id": "owner_a"})

        anon = self.storage.list_recent(limit=10)
        self.assertEqual([item.key for item in anon], ["owner_a/p3/pub.png"])

        owner = self.storage.list_recent(limit=10, viewer_id="owner_a")
        self.assertEqual(
            {item.key for item in owner},
            {"owner_a/p1/priv.png", "owner_a/p3/pub.png"},
        )
        private_item = next(
            item for item in owner if item.key == "owner_a/p1/priv.png"
        )
        self.assertTrue(private_item.is_private)
        self.assertIn("cap=", private_item.url)
        self.assertIsNotNone(private_item.url_expires_at)

    def test_anonymous_listing_never_returns_private_assets_even_at_limit_one(self) -> None:
        self.seed("owner_a/p1/priv.png", {"user_id": "owner_a", "is_private": True})
        self.seed("owner_a/p3/pub.png", {"user_id": "owner_a"})

        items = self.storage.list_recent(limit=1)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].key, "owner_a/p3/pub.png")

    def test_tag_counts_hide_private_foreign_assets(self) -> None:
        self.seed(
            "owner_a/p1/priv.png",
            {"user_id": "owner_a", "is_private": True, "tags": ["secret"]},
        )
        self.seed("owner_a/p2/pub.png", {"user_id": "owner_a", "tags": ["shared"]})

        tags = {
            item["name"]: item["count"]
            for item in self.storage.list_popular_tags(limit=20)
        }
        self.assertNotIn("secret", tags)
        self.assertEqual(tags["shared"], 1)


if __name__ == "__main__":
    unittest.main()
