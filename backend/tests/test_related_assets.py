"""Regression tests for related-asset discovery and the gallery related endpoint.

Scope:
- ``StorageService.list_related`` (sidecar-driven model/tag relations, ranking,
  stable pagination, ownership and visibility filters, containment guards).
- Authenticated ``GET /api/v1/gallery/related``.

Everything runs against a temporary ``STORAGE_DIR`` and a temporary SQLite
database. No ComfyUI, network, Anthropic key, GPU or local model files are used.
"""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app
import app.main as main_mod
from app.services.auth_service import LocalAuthProvider, hash_password, set_auth_provider
from app.services.credit_service import CreditService
from app.services.storage import StorageError, StorageService


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"related-asset-fixture"
MTIME_BASE = 1_700_000_000.0


def _seed(root: Path, rel: str, metadata, *, mtime=None, raw=None, sidecar=True) -> Path:
    """Write a media file plus sidecar under ``root`` and return the media path."""
    media = root / rel
    media.parent.mkdir(parents=True, exist_ok=True)
    media.write_bytes(PNG_BYTES)
    if sidecar:
        sidecar_path = media.with_suffix(media.suffix + ".json")
        sidecar_path.write_text(
            raw if raw is not None else json.dumps(metadata),
            encoding="utf-8",
        )
    if mtime is not None:
        os.utime(media, (mtime, mtime))
    return media


class RelatedAssetsStorageTests(unittest.TestCase):
    """Unit coverage for ``StorageService.list_related`` on an isolated tree."""

    USER_A = "user_related_a"

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.outside_dir = tempfile.TemporaryDirectory()
        self.storage_root = Path(self.temp_dir.name) / "storage"
        self.settings = Settings(
            STORAGE_DIR=str(self.storage_root),
            DB_PATH=str(Path(self.temp_dir.name) / "related.db"),
            FILES_PUBLIC_BASE="http://testserver",
            S3_ENABLED=False,
        )
        self.service = StorageService(settings=self.settings)
        self.service.ensure_root()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()
        self.outside_dir.cleanup()

    def _anchor(self, *, tags=("neon",), model_id="m1", loras=None, user_id=None):
        metadata = {
            "user_id": user_id or self.USER_A,
            "gallery_saved": True,
            "tags": list(tags),
        }
        if model_id is not None:
            metadata["model_id"] = model_id
        if loras is not None:
            metadata["loras"] = loras
        _seed(self.storage_root, "anchor/anchor.png", metadata)
        return "anchor/anchor.png"

    # --- Matching surface: base model, LoRA, legacy LoRA ---------------------

    def test_model_matching_covers_base_lora_and_legacy_fields(self) -> None:
        anchor = self._anchor(
            tags=(),
            model_id="flux-core",
            loras=[{"model_id": "detail-tweak"}, {"lora_model_id": "legacy-lora"}],
        )
        _seed(
            self.storage_root,
            "candidates/base.png",
            {"user_id": self.USER_A, "base_model_id": "  FLUX-CORE ", "model_id": "other"},
        )
        _seed(
            self.storage_root,
            "candidates/lora.png",
            {"user_id": self.USER_A, "loras": [{"model_id": " Detail-Tweak "}]},
        )
        _seed(
            self.storage_root,
            "candidates/legacy.png",
            {"user_id": self.USER_A, "loras": [{"lora_model_id": "Legacy-Lora"}]},
        )
        _seed(
            self.storage_root,
            "candidates/junk.png",
            {"user_id": self.USER_A, "loras": [None, 7, {"model_id": 5}, "nope"]},
        )

        items, total = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(total, 3)
        self.assertEqual(
            {item.key for item in items},
            {"candidates/base.png", "candidates/lora.png", "candidates/legacy.png"},
        )

    def test_tag_normalization_strips_and_casefolds(self) -> None:
        anchor = self._anchor(tags=("  Neon ", "Cyber", 7, None, ""), model_id=None)
        _seed(self.storage_root, "candidates/list.png", {"user_id": self.USER_A, "tags": ["NEON"]})
        _seed(self.storage_root, "candidates/tuple.png", {"user_id": self.USER_A, "tags": (" cyber ",)})
        _seed(self.storage_root, "candidates/string.png", {"user_id": self.USER_A, "tags": " neon "})
        _seed(self.storage_root, "candidates/dict.png", {"user_id": self.USER_A, "tags": {"neon": True}})
        _seed(self.storage_root, "candidates/unrelated.png", {"user_id": self.USER_A, "tags": ["other"]})

        items, total = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(total, 2)
        self.assertEqual(
            {item.key for item in items},
            {"candidates/list.png", "candidates/tuple.png"},
        )

    def test_mixed_and_malformed_metadata_is_skipped_safely(self) -> None:
        anchor = self._anchor()
        _seed(self.storage_root, "bad/invalid_json.png", None, raw="{not valid json")
        _seed(self.storage_root, "bad/list_payload.png", ["neon"], raw=json.dumps(["neon"]))
        _seed(self.storage_root, "bad/no_sidecar.png", None, sidecar=False)
        _seed(self.storage_root, "bad/no_owner.png", {"tags": ["neon"]})
        _seed(self.storage_root, "bad/int_owner.png", {"user_id": 42, "tags": ["neon"]})
        _seed(
            self.storage_root,
            "good/match.png",
            {"user_id": self.USER_A, "tags": ["neon"], "loras": "malformed"},
        )

        items, total = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(total, 1)
        self.assertEqual([item.key for item in items], ["good/match.png"])
        self.assertIsInstance(items[0].metadata, dict)

    # --- Ranking ---------------------------------------------------------------

    def test_model_match_outranks_many_shared_tags(self) -> None:
        anchor = self._anchor(tags=("a", "b", "c", "d", "e"), model_id="rank-model")
        _seed(
            self.storage_root,
            "rank/tag_rich.png",
            {"user_id": self.USER_A, "tags": ["a", "b", "c", "d", "e"]},
        )
        _seed(
            self.storage_root,
            "rank/model_only.png",
            {"user_id": self.USER_A, "model_id": "rank-model"},
        )

        items, total = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(total, 2)
        self.assertEqual(
            [item.key for item in items],
            ["rank/model_only.png", "rank/tag_rich.png"],
        )

    def test_tag_count_then_mtime_then_key_ordering(self) -> None:
        anchor = self._anchor(tags=("a", "b", "c"), model_id=None)
        _seed(
            self.storage_root,
            "order/two_tags.png",
            {"user_id": self.USER_A, "tags": ["a", "b"]},
            mtime=MTIME_BASE,
        )
        _seed(
            self.storage_root,
            "order/one_tag_old.png",
            {"user_id": self.USER_A, "tags": ["a"]},
            mtime=MTIME_BASE - 100,
        )
        _seed(
            self.storage_root,
            "order/one_tag_new.png",
            {"user_id": self.USER_A, "tags": ["b"]},
            mtime=MTIME_BASE + 100,
        )
        # Two assets sharing one tag and the exact same mtime: key ascending.
        _seed(
            self.storage_root,
            "order/zzz_tie.png",
            {"user_id": self.USER_A, "tags": ["c"]},
            mtime=MTIME_BASE + 200,
        )
        _seed(
            self.storage_root,
            "order/aaa_tie.png",
            {"user_id": self.USER_A, "tags": ["c"]},
            mtime=MTIME_BASE + 200,
        )

        items, _ = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(
            [item.key for item in items],
            [
                "order/two_tags.png",
                "order/aaa_tie.png",
                "order/zzz_tie.png",
                "order/one_tag_new.png",
                "order/one_tag_old.png",
            ],
        )

    # --- Pagination ------------------------------------------------------------

    def test_pagination_is_deterministic_without_repeats(self) -> None:
        anchor = self._anchor(tags=("page",), model_id=None)
        # Same mtime everywhere so ordering falls through to key ascending.
        for name in ("p03", "p01", "p02", "p08", "p07", "p04", "p06", "p05"):
            _seed(
                self.storage_root,
                f"pages/{name}.png",
                {"user_id": self.USER_A, "tags": ["page"]},
                mtime=MTIME_BASE,
            )

        collected: list[str] = []
        totals = set()
        for page in (1, 2, 3):
            first, total = self.service.list_related(
                anchor, user_id=self.USER_A, page=page, limit=3
            )
            again, _ = self.service.list_related(
                anchor, user_id=self.USER_A, page=page, limit=3
            )
            totals.add(total)
            self.assertEqual([i.key for i in first], [i.key for i in again])
            collected.extend(item.key for item in first)

        self.assertEqual(totals, {8})
        self.assertEqual(len(collected), 8)
        self.assertEqual(len(set(collected)), 8)
        self.assertEqual(
            collected,
            [f"pages/p{index:02d}.png" for index in range(1, 9)],
        )

    # --- Visibility and ownership filters --------------------------------------

    def test_excludes_self_unsaved_private_foreign_and_ownerless(self) -> None:
        anchor = self._anchor(tags=("share",), model_id=None)
        _seed(
            self.storage_root,
            "visible/own.png",
            {"user_id": self.USER_A, "tags": ["share"]},
        )
        _seed(
            self.storage_root,
            "hidden/unsaved.png",
            {"user_id": self.USER_A, "tags": ["share"], "gallery_saved": False},
        )
        _seed(
            self.storage_root,
            "hidden/private.png",
            {"user_id": self.USER_A, "tags": ["share"], "is_private": True},
        )
        _seed(
            self.storage_root,
            "hidden/foreign.png",
            {"user_id": "someone_else", "tags": ["share"]},
        )
        _seed(self.storage_root, "hidden/ownerless.png", {"tags": ["share"]})
        _seed(self.storage_root, "hidden/no_sidecar.png", None, sidecar=False)

        items, total = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(total, 1)
        self.assertEqual([item.key for item in items], ["visible/own.png"])

    def test_anchor_ownership_missing_anchor_and_bad_keys(self) -> None:
        foreign_anchor = self._anchor(user_id="someone_else")
        with self.assertRaises(PermissionError):
            self.service.list_related(foreign_anchor, user_id=self.USER_A)

        ownerless = _seed(self.storage_root, "anchor/ownerless.png", None, sidecar=False)
        self.assertTrue(ownerless.is_file())
        with self.assertRaises(PermissionError):
            self.service.list_related("anchor/ownerless.png", user_id=self.USER_A)

        with self.assertRaises(FileNotFoundError):
            self.service.list_related("anchor/missing.png", user_id=self.USER_A)

        for key in ("../escape.png", "a/../../escape.png", "..\\escape.png", "/abs.png", "C:/abs.png", "\x00"):
            with self.subTest(key=key):
                with self.assertRaises(StorageError):
                    self.service.list_related(key, user_id=self.USER_A)

    # --- Live state, empty relations, clamps ------------------------------------

    def test_live_sidecar_updates_are_reflected(self) -> None:
        anchor = self._anchor(tags=("neon",), model_id=None)
        candidate = _seed(
            self.storage_root,
            "live/candidate.png",
            {"user_id": self.USER_A, "tags": ["other"]},
        )

        first, total_before = self.service.list_related(anchor, user_id=self.USER_A)
        self.assertEqual((first, total_before), ([], 0))

        candidate.with_suffix(".png.json").write_text(
            json.dumps({"user_id": self.USER_A, "tags": ["  NEON "]}),
            encoding="utf-8",
        )
        second, total_after = self.service.list_related(anchor, user_id=self.USER_A)
        self.assertEqual(total_after, 1)
        self.assertEqual([item.key for item in second], ["live/candidate.png"])

    def test_empty_relations_return_empty_page(self) -> None:
        anchor = self._anchor(tags=(), model_id=None)
        _seed(self.storage_root, "empty/unrelated.png", {"user_id": self.USER_A, "tags": ["x"]})

        items, total = self.service.list_related(anchor, user_id=self.USER_A)
        self.assertEqual((items, total), ([], 0))

        # Anchor with a model but no candidates referencing it.
        model_anchor = self._anchor(tags=(), model_id="lonely-model")
        items, total = self.service.list_related(model_anchor, user_id=self.USER_A)
        self.assertEqual((items, total), ([], 0))

    def test_limit_clamp_page_bounds_and_mode_fallback(self) -> None:
        anchor = self._anchor(tags=("clamp",), model_id=None)
        for index in range(5):
            _seed(
                self.storage_root,
                f"clamp/c{index}.png",
                {"user_id": self.USER_A, "tags": ["clamp"]},
                mtime=MTIME_BASE + index,
            )

        items, total = self.service.list_related(anchor, user_id=self.USER_A, limit=0)
        self.assertEqual((len(items), total), (1, 5))

        items, _ = self.service.list_related(anchor, user_id=self.USER_A, limit=-4)
        self.assertEqual(len(items), 1)

        items, _ = self.service.list_related(anchor, user_id=self.USER_A, limit=1000)
        self.assertEqual(len(items), 5)

        items, _ = self.service.list_related(anchor, user_id=self.USER_A, limit="junk")
        self.assertEqual(len(items), 5)

        items, _ = self.service.list_related(anchor, user_id=self.USER_A, page=0, limit=3)
        self.assertEqual(len(items), 3)

        items, _ = self.service.list_related(anchor, user_id=self.USER_A, page=-2, limit=3)
        self.assertEqual(len(items), 3)

        items, total = self.service.list_related(anchor, user_id=self.USER_A, page=99, limit=3)
        self.assertEqual((items, total), ([], 5))

        items, _ = self.service.list_related(anchor, user_id=self.USER_A, mode="bogus")
        self.assertEqual(len(items), 5)

    def test_mode_filter_selects_model_or_tags_only(self) -> None:
        anchor = self._anchor(tags=("mode-tag",), model_id="mode-model")
        _seed(
            self.storage_root,
            "modes/both.png",
            {"user_id": self.USER_A, "model_id": "mode-model", "tags": ["mode-tag"]},
        )
        _seed(
            self.storage_root,
            "modes/model_only.png",
            {"user_id": self.USER_A, "model_id": "mode-model"},
        )
        _seed(
            self.storage_root,
            "modes/tags_only.png",
            {"user_id": self.USER_A, "tags": ["mode-tag"]},
        )

        model_items, _ = self.service.list_related(
            anchor, user_id=self.USER_A, mode="model"
        )
        self.assertEqual(
            {item.key for item in model_items},
            {"modes/both.png", "modes/model_only.png"},
        )

        tag_items, _ = self.service.list_related(anchor, user_id=self.USER_A, mode="tags")
        self.assertEqual(
            {item.key for item in tag_items},
            {"modes/both.png", "modes/tags_only.png"},
        )

    # --- Scope: own (default) vs public ----------------------------------------

    def test_public_scope_serves_foreign_public_anchor(self) -> None:
        foreign_anchor = self._anchor(user_id="someone_else", tags=("scope",), model_id=None)
        _seed(
            self.storage_root,
            "scope/foreign_match.png",
            {"user_id": "someone_else", "tags": ["scope"]},
        )

        items, total = self.service.list_related(
            foreign_anchor, user_id=self.USER_A, scope="public"
        )

        self.assertEqual(total, 1)
        self.assertEqual([item.key for item in items], ["scope/foreign_match.png"])

    def test_public_scope_keeps_ownerless_dict_anchor(self) -> None:
        _seed(
            self.storage_root,
            "scope/ownerless_anchor.png",
            {"gallery_saved": True, "tags": ["scope"]},
        )
        _seed(
            self.storage_root,
            "scope/visible.png",
            {"user_id": "other", "tags": ["scope"]},
        )

        items, total = self.service.list_related(
            "scope/ownerless_anchor.png", user_id=self.USER_A, scope="public"
        )
        self.assertEqual(total, 1)
        self.assertEqual([item.key for item in items], ["scope/visible.png"])

        with self.assertRaises(PermissionError):
            self.service.list_related(
                "scope/ownerless_anchor.png", user_id=self.USER_A, scope="own"
            )

    def test_public_scope_rejects_private_and_unsaved_anchor(self) -> None:
        private_anchor = _seed(
            self.storage_root,
            "scope/private_anchor.png",
            {"user_id": "someone_else", "tags": ["scope"], "is_private": True},
        )
        unsaved_anchor = _seed(
            self.storage_root,
            "scope/unsaved_anchor.png",
            {"user_id": "someone_else", "tags": ["scope"], "gallery_saved": False},
        )
        _seed(self.storage_root, "scope/match.png", {"user_id": "someone_else", "tags": ["scope"]})

        for key in (private_anchor, unsaved_anchor):
            rel = key.relative_to(self.storage_root).as_posix()
            with self.subTest(key=rel):
                with self.assertRaises(PermissionError):
                    self.service.list_related(rel, user_id=self.USER_A, scope="public")

    def test_own_scope_resolution_of_hidden_anchor(self) -> None:
        # Own scope has no visibility gate on the anchor (unchanged): a hidden own
        # anchor resolves, while a foreign hidden anchor is a visibility failure.
        own_hidden = _seed(
            self.storage_root,
            "scope/own_hidden_anchor.png",
            {
                "user_id": self.USER_A,
                "tags": ["scope-hidden"],
                "gallery_saved": False,
                "is_private": True,
            },
        )
        rel = own_hidden.relative_to(self.storage_root).as_posix()
        items, total = self.service.list_related(rel, user_id=self.USER_A)
        self.assertEqual((items, total), ([], 0))

        foreign = self._anchor(user_id="someone_else", tags=("scope-hidden",), model_id=None)
        with self.assertRaises(PermissionError) as own_ctx:
            self.service.list_related(foreign, user_id=self.USER_A)
        self.assertIn("does not belong", str(own_ctx.exception))

        hidden_foreign = _seed(
            self.storage_root,
            "scope/hidden_foreign.png",
            {"user_id": "someone_else", "tags": ["scope-hidden"], "is_private": True},
        )
        rel = hidden_foreign.relative_to(self.storage_root).as_posix()
        with self.assertRaises(PermissionError) as public_exc:
            self.service.list_related(rel, user_id=self.USER_A, scope="public")
        self.assertIn("publicly viewable", str(public_exc.exception))

    def test_public_scope_candidate_visibility_filters(self) -> None:
        anchor = self._anchor(tags=("cand",), model_id=None)
        _seed(
            self.storage_root,
            "cand/foreign_public.png",
            {"user_id": "someone_else", "tags": ["cand"]},
        )
        _seed(
            self.storage_root,
            "cand/foreign_private.png",
            {"user_id": "someone_else", "tags": ["cand"], "is_private": True},
        )
        _seed(
            self.storage_root,
            "cand/foreign_unsaved.png",
            {"user_id": "someone_else", "tags": ["cand"], "gallery_saved": False},
        )
        _seed(
            self.storage_root,
            "cand/ownerless.png",
            {"tags": ["cand"]},
        )

        items, total = self.service.list_related(
            anchor, user_id=self.USER_A, scope="public"
        )

        self.assertEqual(total, 2)
        self.assertEqual(
            {item.key for item in items},
            {"cand/foreign_public.png", "cand/ownerless.png"},
        )

    def test_public_scope_ranks_own_before_stronger_foreign(self) -> None:
        anchor = self._anchor(tags=("ownfirst", "extra"), model_id=None)
        # Foreign shares both tags (stronger relation) ...
        _seed(
            self.storage_root,
            "ownfirst/foreign_strong.png",
            {"user_id": "someone_else", "tags": ["ownfirst", "extra"]},
            mtime=MTIME_BASE + 1000,
        )
        # ... the viewer's own shares only one tag.
        _seed(
            self.storage_root,
            "ownfirst/own_weak.png",
            {"user_id": self.USER_A, "tags": ["ownfirst"]},
            mtime=MTIME_BASE,
        )

        items, total = self.service.list_related(
            anchor, user_id=self.USER_A, scope="public"
        )

        self.assertEqual(total, 2)
        self.assertEqual(
            [item.key for item in items],
            ["ownfirst/own_weak.png", "ownfirst/foreign_strong.png"],
        )

    def test_unknown_scope_falls_back_to_own(self) -> None:
        anchor = self._anchor(tags=("fallback-scope",), model_id=None)
        _seed(
            self.storage_root,
            "fallback/foreign.png",
            {"user_id": "someone_else", "tags": ["fallback-scope"]},
        )

        items, total = self.service.list_related(
            anchor, user_id=self.USER_A, scope="bogus"
        )
        self.assertEqual((items, total), ([], 0))

    def test_candidate_removed_during_scan_is_skipped(self) -> None:
        anchor = self._anchor(tags=("scan",), model_id=None)
        _seed(self.storage_root, "scan/kept.png", {"user_id": self.USER_A, "tags": ["scan"]})
        victim = _seed(self.storage_root, "scan/vanished.png", {"user_id": self.USER_A, "tags": ["scan"]})

        snapshot = self.service._asset_files()
        self.assertIn(victim.name, {path.name for path in snapshot})
        victim.unlink()

        with patch.object(self.service, "_asset_files", return_value=snapshot):
            items, total = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(total, 1)
        self.assertEqual([item.key for item in items], ["scan/kept.png"])

    def test_sidecar_escape_is_rejected_before_any_external_read(self) -> None:
        anchor = self._anchor(tags=("escape",), model_id=None)
        _seed(self.storage_root, "scan/legit.png", {"user_id": self.USER_A, "tags": ["escape"]})
        evil_media = _seed(
            self.storage_root,
            "scan/evil.png",
            {"user_id": self.USER_A, "tags": ["escape"]},
        )

        # Simulate a sidecar path that resolves outside the storage root.
        outside_sidecar = Path(self.outside_dir.name) / "evil.png.json"
        outside_sidecar.write_text(
            json.dumps(
                {
                    "user_id": self.USER_A,
                    "tags": ["escape"],
                    "model_id": "must-never-be-parsed",
                }
            ),
            encoding="utf-8",
        )

        real_metadata_path = StorageService._metadata_path

        def fake_metadata_path(asset_path: Path):
            if asset_path.name == "evil.png":
                return outside_sidecar
            return real_metadata_path(asset_path)

        with patch.object(self.service, "_metadata_path", side_effect=fake_metadata_path):
            with patch.object(
                self.service, "_gallery_item", wraps=self.service._gallery_item
            ) as gallery_spy:
                items, total = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(total, 1)
        self.assertEqual([item.key for item in items], ["scan/legit.png"])
        self.assertEqual(evil_media.name, "evil.png")
        scanned = {call.args[0].name for call in gallery_spy.call_args_list}
        self.assertNotIn("evil.png", scanned)
        self.assertIn("legit.png", scanned)

    def test_media_resolving_outside_root_is_rejected(self) -> None:
        anchor = self._anchor(tags=("media-escape",), model_id=None)
        _seed(
            self.storage_root,
            "media/legit.png",
            {"user_id": self.USER_A, "tags": ["media-escape"]},
        )
        _seed(
            self.storage_root,
            "media/escape.png",
            {"user_id": self.USER_A, "tags": ["media-escape"]},
        )

        outside_media = Path(self.outside_dir.name) / "escape.png"
        outside_media.write_bytes(PNG_BYTES)
        Path(str(outside_media) + ".json").write_text(
            json.dumps({"user_id": self.USER_A, "tags": ["media-escape"]}),
            encoding="utf-8",
        )

        real_resolve = Path.resolve

        def fake_resolve(path_obj: Path, *args, **kwargs):
            if path_obj.name == "escape.png":
                return outside_media
            return real_resolve(path_obj, *args, **kwargs)

        with patch.object(Path, "resolve", fake_resolve):
            with patch.object(
                self.service, "_gallery_item", wraps=self.service._gallery_item
            ) as gallery_spy:
                items, total = self.service.list_related(anchor, user_id=self.USER_A)

        self.assertEqual(total, 1)
        self.assertEqual([item.key for item in items], ["media/legit.png"])
        scanned = {call.args[0].name for call in gallery_spy.call_args_list}
        self.assertNotIn("escape.png", scanned)


class RelatedAssetsRouteTests(unittest.TestCase):
    """End-to-end coverage for authenticated ``GET /api/v1/gallery/related``."""

    USER_A = "user_rel_route_a"
    USER_B = "user_rel_route_b"

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.storage_root = Path(self.temp_dir.name) / "storage"
        self.settings = Settings(
            STORAGE_DIR=str(self.storage_root),
            DB_PATH=str(Path(self.temp_dir.name) / "related_route.db"),
            TOOLS_DIR=str(Path(self.temp_dir.name) / "tools"),
            JWT_SECRET="related-assets-route-secret-32chars!",
            FILES_PUBLIC_BASE="http://testserver",
            S3_ENABLED=False,
        )

        self.db = Database(db_path=self.settings.DB_PATH, settings=self.settings)
        self.db.init_db()
        set_db(self.db)

        self.credits = CreditService(db=self.db, settings=self.settings)
        self.provider = LocalAuthProvider(
            db=self.db, settings=self.settings, credits=self.credits
        )
        set_auth_provider(self.provider)

        self.orig_storage = main_mod.storage
        self.orig_db = main_mod.db
        self.storage = StorageService(settings=self.settings)
        self.storage.ensure_root()
        main_mod.storage = self.storage
        # Keep the startup bootstrap thread off the real DB/STORAGE_DIR.
        main_mod.db = self.db

        for user_id, email, name, password in (
            (self.USER_A, "related-a@test.com", "related_a", "related_password_a"),
            (self.USER_B, "related-b@test.com", "related_b", "related_password_b"),
        ):
            row = self.db.create_user(
                user_id=user_id,
                email=email,
                username=name,
                hashed_password=hash_password(password),
                display_name=name,
            )
            self.credits.init_user_credits(user_id=user_id)
            user = self.provider._build_user_response(row)
            if user_id == self.USER_A:
                self.user_a = user
                self.token_a = self.provider.create_token(user)
            else:
                self.user_b = user
                self.token_b = self.provider.create_token(user)

        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        main_mod.storage = self.orig_storage
        main_mod.db = self.orig_db
        app.dependency_overrides.pop(get_db, None)
        set_auth_provider(None)
        set_db(None)
        self.temp_dir.cleanup()

    def _seed(self, rel: str, metadata, *, raw=None, sidecar=True) -> Path:
        return _seed(self.storage_root, rel, metadata, raw=raw, sidecar=sidecar)

    def _headers(self, token: str | None = None) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"} if token else {}

    def _related(self, key: str, token: str | None = None, **params):
        query = {"key": key, **params}
        return self.client.get(
            "/api/v1/gallery/related", params=query, headers=self._headers(token)
        )

    def test_requires_authentication(self) -> None:
        self._seed(
            "u_a/p1/anchor.png",
            {"user_id": self.USER_A, "tags": ["neon"], "gallery_saved": True},
        )

        resp = self._related("u_a/p1/anchor.png")
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json().get("detail"), "INVALID_OR_MISSING_AUTHENTICATION")

        bad = self._related("u_a/p1/anchor.png", token="not.a.jwt")
        self.assertEqual(bad.status_code, 401)

    def test_returns_viewer_relations_and_ignores_user_id_query_spoof(self) -> None:
        self._seed(
            "u_a/p1/anchor.png",
            {
                "user_id": self.USER_A,
                "model_id": "spoof-model",
                "tags": ["neon"],
                "gallery_saved": True,
            },
        )
        self._seed(
            "u_a/p2/model_match.png",
            {"user_id": self.USER_A, "model_id": "spoof-model"},
        )
        self._seed(
            "u_a/p3/tag_match.png",
            {"user_id": self.USER_A, "tags": ["NEON"]},
        )
        self._seed(
            "u_b/p1/foreign.png",
            {"user_id": self.USER_B, "model_id": "spoof-model", "tags": ["neon"]},
        )

        resp = self._related(
            "u_a/p1/anchor.png", token=self.token_a, user_id=self.USER_B
        )
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertEqual(payload["total"], 2)
        keys = {item["key"] for item in payload["items"]}
        self.assertEqual(keys, {"u_a/p2/model_match.png", "u_a/p3/tag_match.png"})
        self.assertNotIn("u_a/p1/anchor.png", keys)
        for item in payload["items"]:
            self.assertEqual(item["metadata"]["user_id"], self.USER_A)

    def test_foreign_and_ownerless_anchors_are_forbidden(self) -> None:
        self._seed(
            "u_b/p1/anchor.png",
            {"user_id": self.USER_B, "tags": ["neon"]},
        )
        self._seed("u_a/p1/ownerless.png", None, sidecar=False)
        self._seed("u_a/p1/malformed.png", None, raw="{not json")

        for key in ("u_b/p1/anchor.png", "u_a/p1/ownerless.png", "u_a/p1/malformed.png"):
            with self.subTest(key=key):
                resp = self._related(key, token=self.token_a)
                self.assertEqual(resp.status_code, 403)

    def test_scope_public_foreign_anchor_and_403_mapping(self) -> None:
        self._seed(
            "u_b/p1/anchor.png",
            {"user_id": self.USER_B, "model_id": "pub-model", "gallery_saved": True},
        )
        self._seed(
            "u_a/p2/own_match.png",
            {"user_id": self.USER_A, "model_id": "pub-model"},
        )
        self._seed(
            "u_b/p2/foreign_match.png",
            {"user_id": self.USER_B, "model_id": "pub-model"},
        )

        own = self._related("u_b/p1/anchor.png", token=self.token_a)
        self.assertEqual(own.status_code, 403)
        self.assertEqual(own.json().get("detail"), "Asset is not owned by the current user")

        public = self._related("u_b/p1/anchor.png", token=self.token_a, scope="public")
        self.assertEqual(public.status_code, 200)
        payload = public.json()
        self.assertEqual(payload["total"], 2)
        self.assertEqual(
            [item["key"] for item in payload["items"]],
            ["u_a/p2/own_match.png", "u_b/p2/foreign_match.png"],
        )

    def test_scope_public_private_and_unsaved_anchor_return_403(self) -> None:
        self._seed(
            "u_b/p1/private.png",
            {"user_id": self.USER_B, "tags": ["neon"], "is_private": True},
        )
        self._seed(
            "u_b/p1/unsaved.png",
            {"user_id": self.USER_B, "tags": ["neon"], "gallery_saved": False},
        )

        for key in ("u_b/p1/private.png", "u_b/p1/unsaved.png"):
            with self.subTest(key=key):
                resp = self._related(key, token=self.token_a, scope="public")
                self.assertEqual(resp.status_code, 403)
                self.assertEqual(
                    resp.json().get("detail"), "Asset is not publicly viewable"
                )

    def test_invalid_scope_returns_422(self) -> None:
        self._seed(
            "u_a/p1/anchor.png",
            {"user_id": self.USER_A, "tags": ["neon"]},
        )
        resp = self._related("u_a/p1/anchor.png", token=self.token_a, scope="bogus")
        self.assertEqual(resp.status_code, 422)

    def test_scope_default_remains_own(self) -> None:
        self._seed(
            "u_b/p1/anchor.png",
            {"user_id": self.USER_B, "tags": ["neon"]},
        )
        self._seed("u_a/p2/own.png", {"user_id": self.USER_A, "tags": ["neon"]})

        explicit_own = self._related("u_b/p1/anchor.png", token=self.token_a, scope="own")
        default = self._related("u_b/p1/anchor.png", token=self.token_a)
        self.assertEqual(explicit_own.status_code, 403)
        self.assertEqual(default.status_code, 403)
        self.assertEqual(
            default.json().get("detail"), "Asset is not owned by the current user"
        )

    def test_missing_anchor_returns_404(self) -> None:
        resp = self._related("u_a/none/missing.png", token=self.token_a)
        self.assertEqual(resp.status_code, 404)

    def test_bad_traversal_backslash_and_absolute_keys_return_400(self) -> None:
        keys = (
            "../outside.png",
            "u_a/../../outside.png",
            "..\\Windows\\System32\\config",
            "/etc/passwd",
            "C:/Windows/win.ini",
            "   ",
        )
        for key in keys:
            with self.subTest(key=key):
                resp = self._related(key, token=self.token_a)
                self.assertEqual(
                    resp.status_code,
                    400,
                    msg=f"key={key!r} body={resp.text}",
                )

    def test_invalid_paging_mode_and_empty_key_return_422(self) -> None:
        cases = (
            {"page": 0},
            {"page": -1},
            {"page": "abc"},
            {"limit": 0},
            {"limit": 101},
            {"limit": "abc"},
            {"mode": "bogus"},
            {"key": ""},
        )
        for extra in cases:
            with self.subTest(extra=extra):
                params = {"key": "u_a/p1/anchor.png", **extra}
                resp = self.client.get(
                    "/api/v1/gallery/related",
                    params=params,
                    headers=self._headers(self.token_a),
                )
                self.assertEqual(
                    resp.status_code,
                    422,
                    msg=f"params={params!r} body={resp.text}",
                )

    def test_page_beyond_total_and_limit_boundary(self) -> None:
        self._seed(
            "u_a/p1/anchor.png",
            {"user_id": self.USER_A, "tags": ["neon"]},
        )
        for index in range(2):
            self._seed(
                f"u_a/p{index + 2}/match_{index}.png",
                {"user_id": self.USER_A, "tags": ["neon"]},
            )

        beyond = self._related(
            "u_a/p1/anchor.png", token=self.token_a, page=99, limit=12
        )
        self.assertEqual(beyond.status_code, 200)
        payload = beyond.json()
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["total"], 2)
        self.assertFalse(payload["has_more"])
        self.assertEqual(payload["total_pages"], 1)

        boundary = self._related(
            "u_a/p1/anchor.png", token=self.token_a, page=1, limit=100
        )
        self.assertEqual(boundary.status_code, 200)
        boundary_payload = boundary.json()
        self.assertEqual(boundary_payload["limit"], 100)
        self.assertEqual(boundary_payload["total"], 2)
        self.assertEqual(len(boundary_payload["items"]), 2)


if __name__ == "__main__":
    unittest.main()
