"""Offline checks for owner-scoped collections and presets.

Covers auth hotfix behaviour (synthetic agent keys, unknown-user roles) plus
collections/presets ownership, traversal, duplicate and corruption handling.
No live ComfyUI/Anthropic/network; storage is a temporary directory.
"""

import json
import os
import tempfile
import unittest

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app
from app.routers.auth import get_current_user
from app.schemas import UserResponse
from app.services.auth_service import LocalAuthProvider
from app.services.collections_service import CollectionsService, get_collections_service
from app.services.credit_service import CreditService
from app.services.presets_service import PresetsService, get_presets_service
from app.services.storage import StorageService


def _user(uid: str) -> UserResponse:
    return UserResponse(
        id=uid,
        email=f"{uid}@example.test",
        username=uid,
        display_name=uid,
        role="creator",
        roles=["creator"],
        primary_role="creator",
        permissions=[],
        is_verified=True,
        created_at="2024-01-01T00:00:00+00:00",
    )


class TestAuthHotfix(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.settings = Settings(
            DB_PATH=os.path.join(self.tmp.name, "auth.db"),
            STORAGE_DIR=os.path.join(self.tmp.name, "storage"),
            JWT_SECRET="collections-test-secret-key-32chars!",
        )
        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        self.credits = CreditService(db=self.db, settings=self.settings)
        self.provider = LocalAuthProvider(db=self.db, settings=self.settings, credits=self.credits)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_synthetic_agent_keys_rejected(self) -> None:
        # Every st_agent_* shape must be rejected; there is no magic service-account prefix.
        keys = (
            "st_agent_dispatcher",
            "st_agent_safety",
            "st_agent_sync",
            "st_agent_any",
            "st_agent_dispatcher_secret_worker_token_123",
            "st_agent_safety_scanner_token_xyz",
            "st_agent_model_sync_token_456",
            "st_agent_",
            "ST_AGENT_DISPATCHER_SECRET",
        )
        for key in keys:
            with self.subTest(key=key):
                self.assertIsNone(self.provider.verify_api_key(key))

    def test_unknown_user_has_no_roles_or_permissions(self) -> None:
        self.assertEqual(self.db.get_user_roles("ghost-user"), [])
        self.assertEqual(self.db.get_user_permissions("ghost-user"), set())

    def test_username_no_longer_elevates(self) -> None:
        self.db.create_user(
            user_id="u-win",
            email="win@example.test",
            username="winnguyen282",
            hashed_password="x",
        )
        self.assertEqual(self.db.get_user_roles("u-win"), ["creator"])
        self.assertNotIn("credits:grant_manual", self.db.get_user_permissions("u-win"))

    def test_former_special_uuid_no_longer_elevates(self) -> None:
        win_id = "d08abc9c-53af-4576-8074-5da4de0d0723"
        self.db.create_user(
            user_id=win_id,
            email="uuid@example.test",
            username="ordinary_name",
            hashed_password="x",
        )
        self.assertEqual(self.db.get_user_roles(win_id), ["creator"])
        self.assertNotIn("agent:dispatch_jobs", self.db.get_user_permissions(win_id))

    def test_init_db_does_not_restore_special_promotion(self) -> None:
        win_id = "d08abc9c-53af-4576-8074-5da4de0d0723"
        self.db.create_user(
            user_id=win_id,
            email="init@example.test",
            username="winnguyen282",
            hashed_password="x",
        )
        self.db.init_db(force=True)
        self.db.invalidate_user_cache(win_id)
        self.assertEqual(self.db.get_user_roles(win_id), ["creator"])

    def test_valid_db_backed_live_key_still_works(self) -> None:
        self.db.create_user(
            user_id="u-live",
            email="live@example.test",
            username="live_user",
            hashed_password="x",
        )
        record, raw_key = self.provider.create_api_key("u-live", "CLI")
        self.assertTrue(raw_key.startswith("st_live_"))
        user = self.provider.verify_api_key(raw_key)
        self.assertIsNotNone(user)
        self.assertEqual(user.id, "u-live")
        self.assertEqual(user.role, "creator")
        # Revocation is authoritative: a deleted key stops resolving.
        self.assertTrue(self.provider.delete_api_key("u-live", record.id))
        self.assertIsNone(self.provider.verify_api_key(raw_key))

    def test_unsigned_live_looking_key_rejected(self) -> None:
        self.assertIsNone(self.provider.verify_api_key("st_live_not_in_database_123"))
        self.assertIsNone(self.provider.verify_api_key("sk_live_wrong_scheme"))



class TestCollectionsPresetsRoutes(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.settings = Settings(
            DB_PATH=os.path.join(self.tmp.name, "cp.db"),
            STORAGE_DIR=os.path.join(self.tmp.name, "storage"),
            JWT_SECRET="collections-test-secret-key-32chars!",
        )
        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        for uid in ("alice", "bob"):
            self.db.create_user(
                user_id=uid,
                email=f"{uid}@example.test",
                username=uid,
                hashed_password="x",
            )
        self.storage = StorageService(settings=self.settings)
        self.storage.ensure_root()
        set_db(self.db)
        self.collections = CollectionsService(db=self.db, storage=self.storage)
        self.presets = PresetsService(db=self.db)

        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_collections_service] = lambda: self.collections
        app.dependency_overrides[get_presets_service] = lambda: self.presets
        app.dependency_overrides[get_current_user] = lambda: _user("alice")
        self.client = TestClient(app)

        self._seed_asset("alice", "img_a.png", "alice")
        self._seed_asset("bob", "img_b.png", "bob")

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        set_db(None)
        self.tmp.cleanup()

    def _seed_asset(self, namespace: str, filename: str, owner: str) -> str:
        folder = os.path.join(self.settings.STORAGE_DIR, namespace, "p1")
        os.makedirs(folder, exist_ok=True)
        key = f"{namespace}/p1/{filename}"
        media = os.path.join(self.settings.STORAGE_DIR, key)
        with open(media, "wb") as fh:
            fh.write(b"\x89PNG\r\n\x1a\nfake")
        with open(media + ".json", "w", encoding="utf-8") as fh:
            json.dump({"user_id": owner, "prompt": "x"}, fh)
        return key

    def _as(self, uid: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: _user(uid)

    # --- collections ---

    def test_create_list_and_duplicate_name(self) -> None:
        resp = self.client.post("/api/v1/collections", json={"name": "  My  Picks "})
        self.assertEqual(resp.status_code, 201, resp.text)
        self.assertEqual(resp.json()["name"], "My Picks")
        dup = self.client.post("/api/v1/collections", json={"name": "My Picks"})
        self.assertEqual(dup.status_code, 409)
        listing = self.client.get("/api/v1/collections")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()["items"]), 1)

    def test_owner_isolation_on_read_update_delete(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "Shared"}).json()["id"]
        self._as("bob")
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}/items").status_code, 404)
        self.assertEqual(
            self.client.delete(f"/api/v1/collections/{cid}").status_code, 404
        )
        self.assertEqual(
            self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": ["alice/p1/img_a.png"]}).status_code,
            404,
        )

    def test_foreign_collection_patch_is_404_and_unchanged(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "Owned"}).json()["id"]
        self._as("bob")
        resp = self.client.patch(f"/api/v1/collections/{cid}", json={"name": "Hijacked"})
        self.assertEqual(resp.status_code, 404)
        self._as("alice")
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}").json()["name"], "Owned")

    def test_empty_patch_is_400(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "C"}).json()["id"]
        self.assertEqual(self.client.patch(f"/api/v1/collections/{cid}", json={}).status_code, 400)

    def test_explicit_null_name_is_rejected_without_mutation(self) -> None:
        # `name` is nullable at the schema layer so the route can distinguish an
        # omitted field from an explicit null. Explicit null must be a 400 and
        # must never blank the stored name.
        cid = self.client.post("/api/v1/collections", json={"name": "Keep"}).json()["id"]
        resp = self.client.patch(f"/api/v1/collections/{cid}", json={"name": None})
        self.assertEqual(resp.status_code, 400, resp.text)
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}").json()["name"], "Keep")
        # A null description is a legitimate clear.
        cleared = self.client.patch(f"/api/v1/collections/{cid}", json={"description": None})
        self.assertEqual(cleared.status_code, 200)
        self.assertIsNone(cleared.json()["description"])

    def test_update_conflict_and_normalization(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "Alpha"}).json()["id"]
        self.client.post("/api/v1/collections", json={"name": "Beta"})
        self.assertEqual(
            self.client.patch(f"/api/v1/collections/{cid}", json={"name": "Beta"}).status_code,
            409,
        )
        resp = self.client.patch(f"/api/v1/collections/{cid}", json={"name": "  Renamed   Set  "})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Renamed Set")
        # Description-only patch leaves the name untouched.
        desc = self.client.patch(f"/api/v1/collections/{cid}", json={"description": "hello"})
        self.assertEqual(desc.status_code, 200)
        self.assertEqual(desc.json()["description"], "hello")
        self.assertEqual(desc.json()["name"], "Renamed Set")

    def test_create_validation_boundaries(self) -> None:
        # Blank (post-normalization), over-long, unknown fields, oversized description.
        self.assertEqual(self.client.post("/api/v1/collections", json={"name": "   "}).status_code, 422)
        self.assertEqual(self.client.post("/api/v1/collections", json={"name": "x" * 81}).status_code, 422)
        self.assertEqual(
            self.client.post("/api/v1/collections", json={"name": "Ok", "color": "red"}).status_code,
            422,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/collections", json={"name": "Ok2", "description": "d" * 501}
            ).status_code,
            422,
        )
        # Name whitespace collapsing on create.
        created = self.client.post("/api/v1/collections", json={"name": "  A    B  "})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["name"], "A B")

    def test_missing_collection_is_404_on_every_route(self) -> None:
        missing = "00000000-0000-0000-0000-000000000000"
        self.assertEqual(self.client.get(f"/api/v1/collections/{missing}").status_code, 404)
        self.assertEqual(
            self.client.patch(f"/api/v1/collections/{missing}", json={"name": "z"}).status_code,
            404,
        )
        self.assertEqual(self.client.delete(f"/api/v1/collections/{missing}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/collections/{missing}/items").status_code, 404)
        self.assertEqual(
            self.client.post(
                f"/api/v1/collections/{missing}/items", json={"keys": ["alice/p1/img_a.png"]}
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/collections/{missing}/items/alice/p1/img_a.png").status_code,
            404,
        )

    def test_duplicate_create_is_409(self) -> None:
        self.assertEqual(self.client.post("/api/v1/collections", json={"name": "Dup"}).status_code, 201)
        dup = self.client.post("/api/v1/collections", json={"name": "Dup"})
        self.assertEqual(dup.status_code, 409, dup.text)

    def test_bulk_add_cap_100_accepted_101_rejected(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "Cap"}).json()["id"]
        hundred = [f"alice/p1/bulk_{i}.png" for i in range(100)]
        self.assertEqual(
            self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": hundred}).status_code,
            200,
        )
        over = [f"alice/p1/over_{i}.png" for i in range(101)]
        self.assertEqual(
            self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": over}).status_code,
            422,
        )
        self.assertEqual(
            self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": []}).status_code,
            422,
        )

    def test_bulk_add_dedupes_within_single_request(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "Dedupe"}).json()["id"]
        resp = self.client.post(
            f"/api/v1/collections/{cid}/items",
            json={"keys": ["alice/p1/img_a.png", "alice/p1/img_a.png", " alice/p1/img_a.png "]},
        )
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["added"], ["alice/p1/img_a.png"])

    def test_bulk_add_skips_unowned_missing_and_duplicates(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "C"}).json()["id"]
        keys = ["alice/p1/img_a.png", "bob/p1/img_b.png", "alice/p1/missing.png", "alice/p1/img_a.png"]
        resp = self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": keys})
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["added"], ["alice/p1/img_a.png"])
        self.assertIn("bob/p1/img_b.png", resp.json()["skipped"])
        self.assertIn("alice/p1/missing.png", resp.json()["skipped"])
        # Re-adding the same key is a duplicate skip, not an error.
        again = self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": ["alice/p1/img_a.png"]})
        self.assertEqual(again.json(), {"added": [], "skipped": ["alice/p1/img_a.png"]})
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}").json()["item_count"], 1)

    def test_traversal_rejected_at_schema(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "C"}).json()["id"]
        for bad in ["../etc/passwd", "/abs/path.png", "alice/../bob/p1/img_b.png"]:
            with self.subTest(key=bad):
                resp = self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": [bad]})
                self.assertEqual(resp.status_code, 422, resp.text)

    def test_windows_and_abs_style_keys_never_enter_a_collection(self) -> None:
        # Schema only special-cases POSIX traversal; the service + StorageService
        # containment must still refuse these. They are skipped, never added.
        cid = self.client.post("/api/v1/collections", json={"name": "Win"}).json()["id"]
        bad_keys = [
            r"..\Windows\System32",
            r"..\..\etc\passwd",
            "C:/Windows/System32",
            r"C:\Windows\win.ini",
            r"\\server\share\x.png",
            "..%5CWindows",
            "%2e%2e/etc/passwd",
        ]
        resp = self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": bad_keys})
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["added"], [])
        self.assertEqual(len(resp.json()["skipped"]), len(bad_keys))
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}").json()["item_count"], 0)

    def test_encoded_traversal_remove_returns_removed_false(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "Enc"}).json()["id"]
        for encoded in ["..%2F..%2Fetc%2Fpasswd", "%2e%2e%2F%2e%2e%2Fetc%2Fpasswd", "..%5CWindows"]:
            with self.subTest(key=encoded):
                resp = self.client.delete(f"/api/v1/collections/{cid}/items/{encoded}")
                self.assertEqual(resp.status_code, 200, resp.text)
                self.assertFalse(resp.json()["removed"])

    def test_dangling_item_filtered_from_reads(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "C"}).json()["id"]
        self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": ["alice/p1/img_a.png"]})
        os.remove(os.path.join(self.settings.STORAGE_DIR, "alice/p1/img_a.png"))
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}/items").json()["items"], [])
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}").json()["item_count"], 0)

    def test_stale_membership_removed_after_owner_change(self) -> None:
        # Membership is validated against the live sidecar owner on every read.
        cid = self.client.post("/api/v1/collections", json={"name": "Stale"}).json()["id"]
        self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": ["alice/p1/img_a.png"]})
        sidecar = os.path.join(self.settings.STORAGE_DIR, "alice/p1/img_a.png.json")
        with open(sidecar, "w", encoding="utf-8") as fh:
            json.dump({"user_id": "bob", "prompt": "x"}, fh)
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}/items").json()["items"], [])
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}").json()["item_count"], 0)
        # Removing the stale row still works (cleans the DB entry).
        self.assertTrue(
            self.client.delete(f"/api/v1/collections/{cid}/items/alice/p1/img_a.png").json()["removed"]
        )

    def test_remove_absent_and_traversal_returns_removed_false(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "C"}).json()["id"]
        resp = self.client.delete(f"/api/v1/collections/{cid}/items/alice/p1/img_a.png")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["removed"])

    def test_remove_existing_then_absent(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "Rem"}).json()["id"]
        self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": ["alice/p1/img_a.png"]})
        first = self.client.delete(f"/api/v1/collections/{cid}/items/alice/p1/img_a.png")
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.json()["removed"])
        second = self.client.delete(f"/api/v1/collections/{cid}/items/alice/p1/img_a.png")
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.json()["removed"])

    def test_delete_collection_cascades_items(self) -> None:
        cid = self.client.post("/api/v1/collections", json={"name": "Gone"}).json()["id"]
        self.client.post(f"/api/v1/collections/{cid}/items", json={"keys": ["alice/p1/img_a.png"]})
        self.assertEqual(self.client.delete(f"/api/v1/collections/{cid}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/collections/{cid}").status_code, 404)
        with self.db.get_connection() as conn:
            rows = conn.execute(
                "SELECT COUNT(*) AS n FROM collection_items WHERE collection_id = ?", (cid,)
            ).fetchone()["n"]
        self.assertEqual(rows, 0)


    # --- presets ---

    def test_preset_crud_and_conflict(self) -> None:
        created = self.client.post(
            "/api/v1/presets",
            json={"name": "Portrait", "payload": {"mode": "text-to-image", "prompt": "soft light"}},
        )
        self.assertEqual(created.status_code, 201, created.text)
        pid = created.json()["id"]
        self.assertIsNotNone(created.json()["payload"])
        self.assertIsNone(created.json()["warning"])
        self.assertEqual(
            self.client.post(
                "/api/v1/presets", json={"name": "Portrait", "payload": {"mode": "video"}}
            ).status_code,
            409,
        )
        patched = self.client.patch(f"/api/v1/presets/{pid}", json={"name": "Portrait v2"})
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.json()["name"], "Portrait v2")
        self.assertEqual(self.client.patch(f"/api/v1/presets/{pid}", json={}).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/presets/{pid}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/presets/{pid}").status_code, 404)

    def test_preset_update_rejects_null_payload(self) -> None:
        pid = self.client.post(
            "/api/v1/presets", json={"name": "N", "payload": {"mode": "text-to-image"}}
        ).json()["id"]
        resp = self.client.patch(f"/api/v1/presets/{pid}", json={"payload": None})
        self.assertEqual(resp.status_code, 400, resp.text)
        self.assertIsNotNone(self.client.get(f"/api/v1/presets/{pid}").json()["payload"])

    def test_preset_empty_patch_is_400(self) -> None:
        pid = self.client.post(
            "/api/v1/presets", json={"name": "Empty", "payload": {"mode": "video"}}
        ).json()["id"]
        self.assertEqual(self.client.patch(f"/api/v1/presets/{pid}", json={}).status_code, 400)

    def test_preset_explicit_null_name_is_rejected_without_mutation(self) -> None:
        pid = self.client.post(
            "/api/v1/presets", json={"name": "KeepName", "payload": {"mode": "video"}}
        ).json()["id"]
        resp = self.client.patch(f"/api/v1/presets/{pid}", json={"name": None})
        self.assertEqual(resp.status_code, 400, resp.text)
        self.assertEqual(self.client.get(f"/api/v1/presets/{pid}").json()["name"], "KeepName")

    def test_preset_update_conflict_and_normalization(self) -> None:
        pid = self.client.post(
            "/api/v1/presets", json={"name": "First", "payload": {"mode": "video"}}
        ).json()["id"]
        self.client.post("/api/v1/presets", json={"name": "Second", "payload": {"mode": "video"}})
        self.assertEqual(
            self.client.patch(f"/api/v1/presets/{pid}", json={"name": "Second"}).status_code,
            409,
        )
        resp = self.client.patch(f"/api/v1/presets/{pid}", json={"name": "  Renamed   Preset "})
        self.assertEqual(resp.status_code, 200, resp.text)
        self.assertEqual(resp.json()["name"], "Renamed Preset")

    def test_preset_missing_is_404_on_every_route(self) -> None:
        missing = "00000000-0000-0000-0000-000000000000"
        self.assertEqual(self.client.get(f"/api/v1/presets/{missing}").status_code, 404)
        self.assertEqual(
            self.client.patch(f"/api/v1/presets/{missing}", json={"name": "z"}).status_code, 404
        )
        self.assertEqual(self.client.delete(f"/api/v1/presets/{missing}").status_code, 404)

    def test_preset_create_validation_boundaries(self) -> None:
        self.assertEqual(
            self.client.post("/api/v1/presets", json={"name": "  ", "payload": {"mode": "video"}}).status_code,
            422,
        )
        self.assertEqual(
            self.client.post("/api/v1/presets", json={"name": "x" * 81, "payload": {"mode": "video"}}).status_code,
            422,
        )
        # Missing payload and payload-level unknown fields both fail schema validation.
        self.assertEqual(self.client.post("/api/v1/presets", json={"name": "NoPayload"}).status_code, 422)
        self.assertEqual(
            self.client.post(
                "/api/v1/presets",
                json={"name": "BadMode", "payload": {"mode": "unsupported-mode"}},
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/presets",
                json={"name": "Extra", "payload": {"mode": "video"}, "color": "red"},
            ).status_code,
            422,
        )

    def test_preset_rejects_unknown_fields(self) -> None:
        resp = self.client.post(
            "/api/v1/presets",
            json={"name": "Bad", "payload": {"mode": "text-to-image", "steps": 20}},
        )
        self.assertEqual(resp.status_code, 422)

    def test_corrupt_stored_preset_is_explicitly_unusable(self) -> None:
        created = self.client.post(
            "/api/v1/presets",
            json={"name": "Legacy", "payload": {"mode": "text-to-image"}},
        ).json()
        with self.db.get_connection() as conn:
            conn.execute(
                "UPDATE generation_presets SET payload_json = ? WHERE id = ?",
                ('{"mode": "unsupported-mode"}', created["id"]),
            )
        resp = self.client.get(f"/api/v1/presets/{created['id']}")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["payload"])
        self.assertTrue(resp.json()["warning"])

    def test_invalid_json_stored_preset_surfaces_null_and_warning(self) -> None:
        created = self.client.post(
            "/api/v1/presets", json={"name": "BrokenJson", "payload": {"mode": "video"}}
        ).json()
        with self.db.get_connection() as conn:
            conn.execute(
                "UPDATE generation_presets SET payload_json = ? WHERE id = ?",
                ("{not valid json", created["id"]),
            )
        detail = self.client.get(f"/api/v1/presets/{created['id']}").json()
        self.assertIsNone(detail["payload"])
        self.assertIn("invalid", detail["warning"].lower())
        # Listing surfaces the same explicit unusable marker.
        listing = self.client.get("/api/v1/presets").json()["items"]
        listed = next(item for item in listing if item["id"] == created["id"])
        self.assertIsNone(listed["payload"])
        self.assertTrue(listed["warning"])

    def test_corrupt_preset_can_be_repaired_by_patch(self) -> None:
        created = self.client.post(
            "/api/v1/presets", json={"name": "Repair", "payload": {"mode": "video"}}
        ).json()
        with self.db.get_connection() as conn:
            conn.execute(
                "UPDATE generation_presets SET payload_json = ? WHERE id = ?",
                ("[]", created["id"]),
            )
        self.assertIsNone(self.client.get(f"/api/v1/presets/{created['id']}").json()["payload"])
        fixed = self.client.patch(
            f"/api/v1/presets/{created['id']}", json={"payload": {"mode": "text-to-image"}}
        )
        self.assertEqual(fixed.status_code, 200, fixed.text)
        self.assertEqual(fixed.json()["payload"]["mode"], "text-to-image")
        self.assertIsNone(fixed.json()["warning"])

    def test_preset_owner_isolation(self) -> None:
        pid = self.client.post(
            "/api/v1/presets", json={"name": "Mine", "payload": {"mode": "video"}}
        ).json()["id"]
        self._as("bob")
        self.assertEqual(self.client.get(f"/api/v1/presets/{pid}").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/v1/presets/{pid}").status_code, 404)
        self.assertEqual(
            self.client.patch(f"/api/v1/presets/{pid}", json={"name": "Yours"}).status_code,
            404,
        )

    def test_collections_and_presets_require_authentication(self) -> None:
        app.dependency_overrides.pop(get_current_user, None)
        try:
            self.assertEqual(self.client.get("/api/v1/collections").status_code, 401)
            self.assertEqual(self.client.post("/api/v1/collections", json={"name": "Nope"}).status_code, 401)
            self.assertEqual(self.client.get("/api/v1/presets").status_code, 401)
            self.assertEqual(
                self.client.post("/api/v1/presets", json={"name": "Nope", "payload": {"mode": "video"}}).status_code,
                401,
            )
        finally:
            app.dependency_overrides[get_current_user] = lambda: _user("alice")



if __name__ == "__main__":
    unittest.main()
