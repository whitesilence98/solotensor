import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from app.config import Settings
from app.schemas import (
    CreatorModelType,
    ModelCompatibility,
    ModelCreateRequest,
    ModelFilePatchRequest,
    ModelGenerationSettings,
    ModelModerationStatus,
    ModelPendingReviewItem,
    ModelPendingReviewQueueResponse,
    ModelPrecision,
    ModelPublishRequest,
    ModelReviewAction,
    ModelReviewRequest,
    ModelReviewResponse,
    ModelUpdateRequest,
    ModelVisibility,
    ModelVersionCreateRequest,
)
import app.services.model_storage as model_storage_module
from app.services.models import ModelConflict, ModelError, ModelNotFound, ModelService


class ModelServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.comfy = tempfile.TemporaryDirectory()
        self.settings = Settings(MODELS_DIR=self.temp.name, COMFY_MODEL_ROOT=self.comfy.name, FILES_PUBLIC_BASE="http://test")
        self.service = ModelService(self.settings)
        self.model = self.service.create(ModelCreateRequest(title="Demo", tags=["style"]))
        self.version = self.model.versions[0]

    def tearDown(self) -> None:
        self.temp.cleanup()
        self.comfy.cleanup()

    def _published_file(self, model_type: CreatorModelType = CreatorModelType.CHECKPOINT) -> tuple[str, bytes]:
        if model_type != CreatorModelType.CHECKPOINT:
            self.service.update(self.model.model_id, ModelUpdateRequest(model_type=model_type))
        data = b"gallery weights"
        updated = self.service.add_file(self.model.model_id, self.version.version_id, "demo.safetensors", data, ModelPrecision.FP16)
        file_id = updated.versions[0].files[0].file_id
        self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=True)
        return file_id, data

    def test_install_categories(self) -> None:
        self.assertEqual(self.service.install_category("ControlNet"), "controlnet")
        self.assertEqual(self.service.install_category("Hyper Network"), "hypernetworks")
        self.assertEqual(self.service.install_category("DoRA"), "loras")
        self.assertEqual(self.service.install_category("SVD"), "checkpoints")
        self.assertEqual(self.service.install_category("Diffusion Model"), "diffusion_models")

    def test_resolves_installed_public_gallery_file(self) -> None:
        file_id, data = self._published_file(CreatorModelType.SVD)
        target = Path(self.comfy.name) / "models" / "checkpoints" / "demo.safetensors"
        target.parent.mkdir(parents=True)
        target.write_bytes(data)

        resolved = self.service.resolve_installed_gallery_file(self.model.model_id, self.version.version_id, file_id)

        self.assertEqual(resolved["model_type"], "SVD")
        self.assertEqual(resolved["category"], "checkpoints")
        self.assertEqual(resolved["filename"], "demo.safetensors")
        self.assertEqual(self.service.selectable_gallery_files(), [resolved])

    def test_selectable_listing_skips_hash_and_fails_on_size_drift(self) -> None:
        file_id, data = self._published_file()
        target = Path(self.comfy.name) / "models" / "checkpoints" / "demo.safetensors"
        target.parent.mkdir(parents=True)
        target.write_bytes(data)
        listing = self.service.selectable_gallery_files()
        self.assertEqual(len(listing), 1)
        self.assertEqual(listing[0]["model_id"], self.model.model_id)
        self.assertEqual(listing[0]["filename"], "demo.safetensors")

        target.touch()  # change mtime but keep size — listing must still accept
        self.assertEqual(len(self.service.selectable_gallery_files()), 1)

        target.write_bytes(data[:3])  # size drift — listing must reject
        self.assertEqual(self.service.selectable_gallery_files(), [])

    def test_resolver_rejects_private_hidden_unsupported_missing_and_hash_mismatch(self) -> None:
        file_id, data = self._published_file()
        target = Path(self.comfy.name) / "models" / "checkpoints" / "demo.safetensors"
        target.parent.mkdir(parents=True)

        with self.assertRaises(ModelConflict):
            self.service.resolve_installed_gallery_file(self.model.model_id, self.version.version_id, file_id)

        target.write_bytes(b"different")
        with self.assertRaises(ModelConflict):
            self.service.resolve_installed_gallery_file(self.model.model_id, self.version.version_id, file_id)

        target.write_bytes(data)
        self.service.patch_file(self.model.model_id, self.version.version_id, file_id, ModelFilePatchRequest(visible=False))
        with self.assertRaises(ModelNotFound):
            self.service.resolve_installed_gallery_file(self.model.model_id, self.version.version_id, file_id)

        self.service.patch_file(self.model.model_id, self.version.version_id, file_id, ModelFilePatchRequest(visible=True))
        adapter = self.service.create(ModelCreateRequest(
            title="Adapter",
            model_type=CreatorModelType.LORA,
            compatibility={
                "base_model_id": self.model.model_id,
                "base_version_id": self.version.version_id,
                "base_file_id": file_id,
            },
        ))
        adapter_file = self.service.add_file(adapter.model_id, adapter.versions[0].version_id, "adapter.safetensors", data, ModelPrecision.FP16).versions[0].files[0]
        self.service.publish(adapter.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=True)
        adapter_path = Path(self.comfy.name) / "models" / "loras" / "adapter.safetensors"
        adapter_path.parent.mkdir(parents=True)
        adapter_path.write_bytes(data)
        resolved_adapter = self.service.resolve_installed_gallery_file(adapter.model_id, adapter.versions[0].version_id, adapter_file.file_id)
        self.assertEqual(resolved_adapter["category"], "loras")
        self.assertIsNone(resolved_adapter["text_encoder"])
        private_model = self.service.create(ModelCreateRequest(title="Private"))
        private_file = self.service.add_file(private_model.model_id, private_model.versions[0].version_id, "private.safetensors", data, ModelPrecision.FP16).versions[0].files[0]
        with self.assertRaises(ModelNotFound):
            self.service.resolve_installed_gallery_file(private_model.model_id, private_model.versions[0].version_id, private_file.file_id)

    def test_legacy_unet_records_migrate_to_checkpoint(self) -> None:
        record = json.loads((Path(self.temp.name) / "definitions" / f"{self.model.model_id}.json").read_text(encoding="utf-8"))
        record["model_type"] = "UNET"
        (Path(self.temp.name) / "definitions" / f"{self.model.model_id}.json").write_text(json.dumps(record), encoding="utf-8")

        reloaded = ModelService(self.settings).get(self.model.model_id)

        self.assertEqual(reloaded.model_type.value, "Checkpoint")

    def test_metadata_survives_reload(self) -> None:
        updated = self.service.update(self.model.model_id, ModelUpdateRequest(title="Updated"))
        reloaded = ModelService(self.settings).get(self.model.model_id)
        self.assertEqual(updated.title, reloaded.title)

    def test_multiple_models_have_independent_records(self) -> None:
        second = self.service.create(ModelCreateRequest(title="Second"))
        self.assertEqual({item.model_id for item in self.service.list()}, {self.model.model_id, second.model_id})
        self.assertNotEqual(self.model.versions[0].version_id, second.versions[0].version_id)

    def test_file_hash_and_visibility(self) -> None:
        data = b"weights"
        result = self.service.add_file(self.model.model_id, self.version.version_id, "demo.safetensors", data, ModelPrecision.FP16)
        file = result.versions[0].files[0]
        self.assertEqual(file.sha256, hashlib.sha256(data).hexdigest())
        self.service.patch_file(self.model.model_id, self.version.version_id, file.file_id, ModelFilePatchRequest(visible=False))
        self.assertFalse(self.service.get(self.model.model_id).versions[0].files[0].visible)

    def test_rejects_duplicate_versions_and_publish_without_file(self) -> None:
        with self.assertRaises(ModelConflict):
            self.service.create_version(self.model.model_id, ModelVersionCreateRequest(name="v1.0"))
        with self.assertRaises(ModelConflict):
            self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC))

    def test_sample_upload(self) -> None:
        result = self.service.add_sample(self.model.model_id, self.version.version_id, "sample.png", b"png")
        self.assertEqual(result.versions[0].samples[0].kind, "image")

    def test_local_search_and_nested_import_preserve_filename(self) -> None:
        source = Path(self.comfy.name) / "models" / "checkpoints" / "nested"
        source.mkdir(parents=True)
        (source / "dream.safetensors").write_bytes(b"local weights")
        matches = self.service.local_models("dream")
        self.assertEqual(matches[0]["filename"], "nested/dream.safetensors")
        self.assertEqual(matches[0]["size"], len(b"local weights"))
        result = self.service.import_local_file(self.model.model_id, self.version.version_id, "checkpoints", "nested/dream.safetensors", ModelPrecision.FP16)
        self.assertEqual(result.versions[0].files[0].filename, "nested/dream.safetensors")

    def test_local_import_registers_in_place_without_copying(self) -> None:
        data = b"comfy resident weights"
        source = Path(self.comfy.name) / "models" / "checkpoints" / "nested"
        source.mkdir(parents=True)
        (source / "dream.safetensors").write_bytes(data)
        result = self.service.import_local_file(self.model.model_id, self.version.version_id, "checkpoints", "nested/dream.safetensors", ModelPrecision.FP16)
        self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=True)
        file = result.versions[0].files[0]
        self.assertTrue(file.visible)

        files_dir = Path(self.temp.name) / self.model.model_id / self.version.version_id / "files"
        self.assertFalse(files_dir.exists() and any(files_dir.iterdir()))

        resolved = self.service.resolve_installed_gallery_file(self.model.model_id, self.version.version_id, file.file_id)
        self.assertEqual(resolved["filename"], "nested/dream.safetensors")
        self.assertEqual(resolved["category"], "checkpoints")
        self.assertEqual(resolved["sha256"], hashlib.sha256(data).hexdigest())

        served = self.service.file_path(self.model.model_id, self.version.version_id, file.file_id)
        self.assertEqual(served, (source / "dream.safetensors").resolve())

        install = self.service.install_file(self.model.model_id, self.version.version_id, file.file_id)
        self.assertTrue(install["already_present"])

        self.service.remove_file(self.model.model_id, self.version.version_id, file.file_id)
        self.assertTrue((source / "dream.safetensors").is_file())

    def test_in_place_install_conflicts_when_file_moved_or_changed(self) -> None:
        data = b"comfy resident weights"
        source = Path(self.comfy.name) / "models" / "checkpoints" / "dream.safetensors"
        source.parent.mkdir(parents=True)
        source.write_bytes(data)
        result = self.service.import_local_file(self.model.model_id, self.version.version_id, "checkpoints", "dream.safetensors", ModelPrecision.FP16)
        self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=True)
        file_id = result.versions[0].files[0].file_id

        source.unlink()
        with self.assertRaises(ModelConflict) as moved:
            self.service.install_file(self.model.model_id, self.version.version_id, file_id)
        self.assertIn("registered in place", str(moved.exception))
        with self.assertRaises(ModelConflict):
            self.service.resolve_installed_gallery_file(self.model.model_id, self.version.version_id, file_id)

        source.write_bytes(b"edited weights")
        with self.assertRaises(ModelConflict) as changed:
            self.service.install_file(self.model.model_id, self.version.version_id, file_id)
        self.assertIn("changed since it was registered", str(changed.exception))
        with self.assertRaises(ModelConflict):
            self.service.resolve_installed_gallery_file(self.model.model_id, self.version.version_id, file_id)

    def test_local_search_allows_vae_and_text_encoders_explicitly_and_unfiltered(self) -> None:
        root = Path(self.comfy.name) / "models"
        for category in ("vae", "text_encoders"):
            directory = root / category
            directory.mkdir(parents=True)
            (directory / f"{category}.safetensors").write_bytes(category.encode())
            self.assertEqual(self.service.local_models(category=category)[0]["category"], category)
        self.assertEqual({item["category"] for item in self.service.local_models()}, {"vae", "text_encoders"})

    def test_local_search_limits_suggestions(self) -> None:
        source = Path(self.comfy.name) / "models" / "checkpoints"
        source.mkdir(parents=True)
        for index in range(4):
            (source / f"model-{index}.safetensors").write_bytes(str(index).encode())
        self.assertEqual(len(self.service.local_models(category="checkpoints", limit=2)), 2)

    def test_local_import_rejects_empty_and_oversized_files_before_storing(self) -> None:
        source = Path(self.comfy.name) / "models" / "checkpoints"
        source.mkdir(parents=True)
        (source / "empty.safetensors").write_bytes(b"")
        (source / "large.safetensors").write_bytes(b"large")
        self.service.settings.MODEL_MAX_BYTES = 4

        for filename in ("empty.safetensors", "large.safetensors"):
            with self.subTest(filename=filename), self.assertRaises(ModelError):
                self.service.import_local_file(
                    self.model.model_id,
                    self.version.version_id,
                    "checkpoints",
                    filename,
                    ModelPrecision.FP16,
                )

        self.assertEqual(self.service.get(self.model.model_id).versions[0].files, [])
        stored = Path(self.temp.name) / self.model.model_id / self.version.version_id / "files"
        self.assertEqual(list(stored.iterdir()), [])

    def test_local_import_rejects_symlinked_category(self) -> None:
        external = Path(self.comfy.name) / "external"
        external.mkdir()
        (external / "outside.safetensors").write_bytes(b"outside")
        category = Path(self.comfy.name) / "models" / "checkpoints"
        category.parent.mkdir()
        try:
            category.symlink_to(external, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"Directory symlinks are unavailable: {exc}")

        with self.assertRaises(ModelError):
            self.service.import_local_file(
                self.model.model_id,
                self.version.version_id,
                "checkpoints",
                "outside.safetensors",
                ModelPrecision.FP16,
            )

    def test_local_import_rejects_traversal(self) -> None:
        with self.assertRaises(ModelError):
            self.service.import_local_file(self.model.model_id, self.version.version_id, "checkpoints", "../secret.safetensors", ModelPrecision.FP16)

    def test_local_search_and_import_accepts_sft_extension(self) -> None:
        vae_dir = Path(self.comfy.name) / "models" / "vae"
        vae_dir.mkdir(parents=True, exist_ok=True)
        (vae_dir / "ae.sft").write_bytes(b"ae-sft-data")

        local_vaes = self.service.local_models(category="vae")
        filenames = [item["filename"] for item in local_vaes]
        self.assertIn("ae.sft", filenames)

        result = self.service.import_local_file(
            self.model.model_id,
            self.version.version_id,
            "vae",
            "ae.sft",
            ModelPrecision.FP16,
        )
        imported_files = [f.filename for f in result.versions[0].files]
        self.assertIn("ae.sft", imported_files)

        uploaded = self.service.add_file(
            self.model.model_id,
            self.version.version_id,
            "custom_encoder.sft",
            b"custom-sft-bytes",
            ModelPrecision.FP16,
        )
        uploaded_files = [f.filename for f in uploaded.versions[0].files]
        self.assertIn("custom_encoder.sft", uploaded_files)

    def test_local_search_comma_separated_categories_and_deduplication(self) -> None:
        ckpt_dir = Path(self.comfy.name) / "models" / "checkpoints"
        diff_dir = Path(self.comfy.name) / "models" / "diffusion_models"
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        diff_dir.mkdir(parents=True, exist_ok=True)

        (ckpt_dir / "monolith.safetensors").write_bytes(b"monolith")
        (diff_dir / "modular.safetensors").write_bytes(b"modular")
        # Duplicate filename in both folders
        (ckpt_dir / "duplicate.safetensors").write_bytes(b"dup-ckpt")
        (diff_dir / "duplicate.safetensors").write_bytes(b"dup-diff")

        results = self.service.list_local_models(category="checkpoints,diffusion_models")
        filenames = [item["filename"] for item in results]
        categories_by_fn = {item["filename"]: item["category"] for item in results}

        self.assertIn("monolith.safetensors", filenames)
        self.assertIn("modular.safetensors", filenames)
        self.assertEqual(categories_by_fn["monolith.safetensors"], "checkpoints")
        self.assertEqual(categories_by_fn["modular.safetensors"], "diffusion_models")
        # duplicate.safetensors should only appear once (deduplicated), taking category "checkpoints"
        self.assertEqual(filenames.count("duplicate.safetensors"), 1)
        self.assertEqual(categories_by_fn["duplicate.safetensors"], "checkpoints")

    def test_local_category_resilience_and_aliases(self) -> None:
        self.assertEqual(self.service._local_category("CHECKPOINTS "), "checkpoints")
        self.assertEqual(self.service._local_category("checkpoint"), "checkpoints")
        self.assertEqual(self.service._local_category("svd"), "checkpoints")
        self.assertEqual(self.service._local_category("lora"), "loras")
        self.assertEqual(self.service._local_category("LOKr"), "loras")
        self.assertEqual(self.service._local_category("Diffusion Model"), "diffusion_models")
        self.assertEqual(self.service._local_category("diffusion_model"), "diffusion_models")
        self.assertEqual(self.service._local_category("vae"), "vae")
        self.assertEqual(self.service._local_category("controlnet"), "controlnet")
        self.assertEqual(self.service._local_category("pose"), "poses")
        self.assertEqual(self.service._local_category("wildcard"), "wildcards")
        self.assertEqual(self.service._local_category("stylemodel"), "style_models")
        self.assertEqual(self.service._local_category("embedding"), "embeddings")
        self.assertEqual(self.service._local_category("hypernetwork"), "hypernetworks")
        with self.assertRaises(ModelError):
            self.service._local_category("unknown_category_xyz")

    def test_local_models_comma_separated_resilience(self) -> None:
        ckpt_dir = Path(self.comfy.name) / "models" / "checkpoints"
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        (ckpt_dir / "resilient.safetensors").write_bytes(b"resilient")

        # Mixed cases, aliases, and an invalid category ignored
        results = self.service.list_local_models(category=" Checkpoint, non_existent_cat ")
        self.assertTrue(any(item["filename"] == "resilient.safetensors" for item in results))

        # All invalid categories should raise ModelError
        with self.assertRaises(ModelError):
            self.service.list_local_models(category="invalid_cat1, invalid_cat2")

    def test_import_local_file_persists_category(self) -> None:
        diff_dir = Path(self.comfy.name) / "models" / "diffusion_models"
        diff_dir.mkdir(parents=True, exist_ok=True)
        (diff_dir / "dit.safetensors").write_bytes(b"dit-bytes")

        res = self.service.import_local_file(
            self.model.model_id,
            self.version.version_id,
            "diffusion_models",
            "dit.safetensors",
            ModelPrecision.FP16,
        )
        file_obj = res.versions[0].files[0]
        self.assertEqual(file_obj.category, "diffusion_models")

        # Verify persisted record on disk
        stored_rec = self.service._read(self.model.model_id)
        self.assertEqual(stored_rec["versions"][0]["files"][0]["category"], "diffusion_models")

    def test_resolve_installed_gallery_file_dual_folder_probing(self) -> None:
        # Create a Checkpoint model whose file is located in diffusion_models
        data = b"modular weights"
        diff_dir = Path(self.comfy.name) / "models" / "diffusion_models"
        diff_dir.mkdir(parents=True, exist_ok=True)
        (diff_dir / "modular_ckpt.safetensors").write_bytes(data)

        res = self.service.import_local_file(
            self.model.model_id,
            self.version.version_id,
            "diffusion_models",
            "modular_ckpt.safetensors",
            ModelPrecision.FP16,
        )
        self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=True)
        file_id = res.versions[0].files[0].file_id

        resolved = self.service.resolve_installed_gallery_file(
            self.model.model_id, self.version.version_id, file_id
        )
        self.assertEqual(resolved["model_type"], "Checkpoint")
        self.assertEqual(resolved["category"], "diffusion_models")
        self.assertEqual(resolved["filename"], "modular_ckpt.safetensors")

        # Now test fallback probing: file record has category None or checkpoints, but file is in diffusion_models
        rec = self.service._read(self.model.model_id)
        rec["versions"][0]["files"][0]["category"] = None
        self.service._write(rec)

        resolved_fallback = self.service.resolve_installed_gallery_file(
            self.model.model_id, self.version.version_id, file_id
        )
        self.assertEqual(resolved_fallback["category"], "diffusion_models")

    def test_install_file_diffusion_models_destination(self) -> None:
        # Uploaded file registered with category diffusion_models installs to models/diffusion_models
        data = b"raw diffusion bytes"
        uploaded = self.service.add_file(
            self.model.model_id,
            self.version.version_id,
            "unet_upload.safetensors",
            data,
            ModelPrecision.FP16,
        )
        file_id = uploaded.versions[0].files[0].file_id
        rec = self.service._read(self.model.model_id)
        rec["versions"][0]["files"][0]["category"] = "diffusion_models"
        self.service._write(rec)
        self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=True)

        install = self.service.install_file(self.model.model_id, self.version.version_id, file_id)
        self.assertEqual(install["category"], "diffusion_models")
        expected_dest = Path(self.comfy.name) / "models" / "diffusion_models" / "unet_upload.safetensors"
        self.assertTrue(expected_dest.is_file())
 
    def test_create_non_promptable_models_without_presets(self) -> None:
        target_types = [
            CreatorModelType.VAE,
            CreatorModelType.WILDCARDS,
            CreatorModelType.POSES,
            CreatorModelType.CONTROLNET,
            CreatorModelType.STYLE_MODEL,
        ]
        for m_type in target_types:
            # 1. Created without explicit generation settings (omitted / default)
            created = self.service.create(
                ModelCreateRequest(
                    title=f"Test {m_type.value}",
                    model_type=m_type,
                    compatibility=ModelCompatibility(
                        vae="extraneous_vae.safetensors",
                        text_encoder="extraneous_te.safetensors",
                        clip_type="sdxl",
                    ),
                )
            )
            self.assertEqual(created.model_type, m_type)
            self.assertEqual(created.generation.prompt, "")
            self.assertEqual(created.generation.negative_prompt, "")
            self.assertEqual(created.generation.trigger_words, [])
            # Sanitization strips VAE decoder and text encoders for non-supporting tiers
            self.assertIsNone(created.compatibility.vae)
            self.assertIsNone(created.compatibility.text_encoder)
            self.assertIsNone(created.compatibility.clip_type)

            # Persisted cleanly on disk and reloadable
            reloaded = self.service.get(created.model_id)
            self.assertEqual(reloaded.model_type, m_type)
            self.assertEqual(reloaded.generation.prompt, "")
            self.assertIsNone(reloaded.compatibility.vae)

            # 2. Created with explicit empty generation presets
            empty_gen_model = self.service.create(
                ModelCreateRequest(
                    title=f"Test Empty {m_type.value}",
                    model_type=m_type,
                    generation=ModelGenerationSettings(prompt="", negative_prompt="", trigger_words=[]),
                )
            )
            self.assertEqual(empty_gen_model.generation.prompt, "")
            self.assertEqual(empty_gen_model.generation.negative_prompt, "")
            self.assertEqual(empty_gen_model.generation.trigger_words, [])

    def test_description_create_and_update(self) -> None:
        created = self.service.create(
            ModelCreateRequest(
                title="Model with Desc",
                description="Initial model description text",
            )
        )
        self.assertEqual(created.description, "Initial model description text")
        reloaded = self.service.get(created.model_id)
        self.assertEqual(reloaded.description, "Initial model description text")

        updated = self.service.update(
            created.model_id,
            ModelUpdateRequest(description="Updated description text"),
        )
        self.assertEqual(updated.description, "Updated description text")
        reloaded2 = self.service.get(created.model_id)
        self.assertEqual(reloaded2.description, "Updated description text")

    def test_version_deletion_guards_and_success(self) -> None:
        # 1. Deleting only version raises ModelConflict
        with self.assertRaises(ModelConflict) as ctx:
            self.service.remove_version(self.model.model_id, self.version.version_id)
        self.assertIn("only version", str(ctx.exception))

        # 2. Adding a second version
        v2 = self.service.create_version(
            self.model.model_id,
            ModelVersionCreateRequest(name="v2.0"),
        )
        self.assertEqual(len(self.service.get(self.model.model_id).versions), 2)

        # 3. Deleting non-existent version raises ModelNotFound
        with self.assertRaises(ModelNotFound):
            self.service.remove_version(self.model.model_id, "nonexistent_version_id")

        # 4. Deleting second version succeeds
        resp = self.service.remove_version(self.model.model_id, v2.version_id)
        self.assertEqual(len(resp.versions), 1)
        self.assertEqual(resp.versions[0].version_id, self.version.version_id)

        # 5. Reloaded model reflects deletion
        reloaded = self.service.get(self.model.model_id)
        self.assertEqual(len(reloaded.versions), 1)

    def test_version_renaming(self) -> None:
        # 1. Update version name cleanly
        updated = self.service.update_version(
            self.model.model_id,
            self.version.version_id,
            "v1.0-RC1",
        )
        self.assertEqual(updated.versions[0].name, "v1.0-RC1")
        reloaded = self.service.get(self.model.model_id)
        self.assertEqual(reloaded.versions[0].name, "v1.0-RC1")

        # 2. Reject blank/empty name
        with self.assertRaises(ModelError):
            self.service.update_version(
                self.model.model_id,
                self.version.version_id,
                "   ",
            )

        # 3. Reject duplicate name
        self.service.create_version(
            self.model.model_id,
            ModelVersionCreateRequest(name="v2.0"),
        )
        with self.assertRaises(ModelConflict):
            self.service.update_version(
                self.model.model_id,
                self.version.version_id,
                "v2.0",
            )




class ModelModerationLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.comfy = tempfile.TemporaryDirectory()
        self.settings = Settings(
            MODELS_DIR=self.temp.name,
            COMFY_MODEL_ROOT=self.comfy.name,
            FILES_PUBLIC_BASE="http://test",
        )
        self.service = ModelService(self.settings)

    def tearDown(self) -> None:
        self.temp.cleanup()
        self.comfy.cleanup()

    def _create_model_with_file(
        self,
        title: str = "Test Model",
        is_moderator: bool = False,
        visibility: ModelVisibility = ModelVisibility.PRIVATE,
    ):
        model = self.service.create(
            ModelCreateRequest(title=title, tags=["tag1"], visibility=visibility),
            is_moderator=is_moderator,
        )
        version_id = model.versions[0].version_id
        data = b"dummy safetensors weight content"
        updated = self.service.add_file(
            model.model_id,
            version_id,
            "weights.safetensors",
            data,
            ModelPrecision.FP16,
        )
        file_id = updated.versions[0].files[0].file_id
        return model, file_id, data

    def test_model_storage_reexports_and_aliases(self) -> None:
        self.assertIs(model_storage_module.ModelService, ModelService)
        self.assertIs(model_storage_module.ModelModerationStatus, ModelModerationStatus)
        self.assertIs(model_storage_module.ModelReviewAction, ModelReviewAction)
        self.assertIs(model_storage_module.ModelReviewRequest, ModelReviewRequest)
        self.assertIs(model_storage_module.ModelReviewResponse, ModelReviewResponse)
        self.assertIs(model_storage_module.ModelPendingReviewItem, ModelPendingReviewItem)
        self.assertIs(model_storage_module.ModelPendingReviewQueueResponse, ModelPendingReviewQueueResponse)

    def test_create_model_moderation_status_lifecycle(self) -> None:
        # 1. Default Private model -> DRAFT
        private_model = self.service.create(
            ModelCreateRequest(title="Private Model", visibility=ModelVisibility.PRIVATE)
        )
        self.assertEqual(private_model.moderation_status, ModelModerationStatus.DRAFT)
        self.assertIsNone(private_model.published_at)

        # 2. Public model created by normal user (non-moderator) -> PENDING_REVIEW
        user_public_model = self.service.create(
            ModelCreateRequest(title="User Public Model", visibility=ModelVisibility.PUBLIC),
            is_moderator=False,
        )
        self.assertEqual(user_public_model.moderation_status, ModelModerationStatus.PENDING_REVIEW)
        self.assertIsNone(user_public_model.published_at)

        # 3. Public model created by moderator -> APPROVED
        mod_public_model = self.service.create(
            ModelCreateRequest(title="Mod Public Model", visibility=ModelVisibility.PUBLIC),
            is_moderator=True,
        )
        self.assertEqual(mod_public_model.moderation_status, ModelModerationStatus.APPROVED)
        self.assertIsNotNone(mod_public_model.published_at)

    def test_legacy_record_defaults_to_approved(self) -> None:
        # Create a record directly on disk without moderation_status and moderation_notes
        legacy_id = "0123456789abcdef0123456789abcdef"
        legacy_dir = Path(self.temp.name) / "definitions"
        legacy_dir.mkdir(parents=True, exist_ok=True)
        raw_record = {
            "model_id": legacy_id,
            "title": "Legacy Checkpoint",
            "category": "Character",
            "model_type": "Checkpoint",
            "visibility": "Public",
            "published_at": "2025-01-01T00:00:00Z",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z",
            "tags": ["legacy"],
            "versions": [],
        }
        (legacy_dir / f"{legacy_id}.json").write_text(json.dumps(raw_record), encoding="utf-8")

        loaded = self.service.get(legacy_id)
        self.assertEqual(loaded.moderation_status, ModelModerationStatus.APPROVED)
        self.assertIsNone(loaded.moderation_notes)

    def test_publish_workflow_transitions(self) -> None:
        model, file_id, data = self._create_model_with_file("Publish Workflow Model")

        # Regular user publishing to Public -> PENDING_REVIEW, published_at is None
        pub_pending = self.service.publish(
            model.model_id,
            ModelPublishRequest(visibility=ModelVisibility.PUBLIC),
            is_moderator=False,
        )
        self.assertEqual(pub_pending.moderation_status, ModelModerationStatus.PENDING_REVIEW)
        self.assertEqual(pub_pending.visibility, ModelVisibility.PUBLIC)
        self.assertIsNone(pub_pending.published_at)

        # Moderator publishing to Public -> APPROVED, published_at is set
        pub_mod = self.service.publish(
            model.model_id,
            ModelPublishRequest(visibility=ModelVisibility.PUBLIC),
            is_moderator=True,
        )
        self.assertEqual(pub_mod.moderation_status, ModelModerationStatus.APPROVED)
        self.assertEqual(pub_mod.visibility, ModelVisibility.PUBLIC)
        self.assertIsNotNone(pub_mod.published_at)

        # Unpublishing back to Private -> DRAFT, published_at is cleared
        pub_priv = self.service.publish(
            model.model_id,
            ModelPublishRequest(visibility=ModelVisibility.PRIVATE),
        )
        self.assertEqual(pub_priv.moderation_status, ModelModerationStatus.DRAFT)
        self.assertEqual(pub_priv.visibility, ModelVisibility.PRIVATE)
        self.assertIsNone(pub_priv.published_at)

    def test_publish_validation_guards(self) -> None:
        # Cannot publish without files
        empty_model = self.service.create(
            ModelCreateRequest(title="Empty Model", visibility=ModelVisibility.PRIVATE)
        )
        with self.assertRaises(ModelConflict) as ctx:
            self.service.publish(
                empty_model.model_id,
                ModelPublishRequest(visibility=ModelVisibility.PUBLIC),
            )
        self.assertIn("at least one model file", str(ctx.exception).lower())

        # Cannot publish without title
        model_no_title, file_id, data = self._create_model_with_file("Valid Title")
        raw_path = Path(self.temp.name) / "definitions" / f"{model_no_title.model_id}.json"
        raw_data = json.loads(raw_path.read_text(encoding="utf-8"))
        raw_data["title"] = "   "
        raw_path.write_text(json.dumps(raw_data), encoding="utf-8")

        with self.assertRaises(ModelConflict) as ctx:
            self.service.publish(
                model_no_title.model_id,
                ModelPublishRequest(visibility=ModelVisibility.PUBLIC),
            )
        self.assertIn("title is required", str(ctx.exception).lower())

    def test_public_listing_filters_unapproved_models(self) -> None:
        # Model 1: Private draft
        m_private, _, _ = self._create_model_with_file("Model Private")

        # Model 2: Submitted for review by non-mod -> Public, PENDING_REVIEW
        m_pending, _, _ = self._create_model_with_file("Model Pending")
        self.service.publish(
            m_pending.model_id,
            ModelPublishRequest(visibility=ModelVisibility.PUBLIC),
            is_moderator=False,
        )

        # Model 3: Published and approved by mod -> Public, APPROVED
        m_approved, f3_id, _ = self._create_model_with_file("Model Approved")
        self.service.publish(
            m_approved.model_id,
            ModelPublishRequest(visibility=ModelVisibility.PUBLIC),
            is_moderator=True,
        )
        self.service.install_file(m_approved.model_id, m_approved.versions[0].version_id, f3_id)

        # Model 4: Rejected
        m_rejected, _, _ = self._create_model_with_file("Model Rejected")
        self.service.publish(
            m_rejected.model_id,
            ModelPublishRequest(visibility=ModelVisibility.PUBLIC),
            is_moderator=False,
        )
        self.service.review_model(m_rejected.model_id, action="reject", notes="Bad model")

        # Verify public listing only includes Model 3
        public_models = self.service.list_public()
        public_ids = [m.model_id for m in public_models]
        self.assertIn(m_approved.model_id, public_ids)
        self.assertNotIn(m_private.model_id, public_ids)
        self.assertNotIn(m_pending.model_id, public_ids)
        self.assertNotIn(m_rejected.model_id, public_ids)

        # Verify public_list alias
        alias_models = self.service.public_list()
        self.assertEqual([m.model_id for m in alias_models], public_ids)

        # Verify selectable_gallery_files only includes files from Model 3
        selectable = self.service.selectable_gallery_files()
        selectable_file_ids = [f["file_id"] for f in selectable]
        self.assertIn(f3_id, selectable_file_ids)
        self.assertEqual(len(selectable), 1)

        # public_response on pending or rejected model raises ModelNotFound
        with self.assertRaises(ModelNotFound):
            self.service.public_response(m_pending.model_id)
        with self.assertRaises(ModelNotFound):
            self.service.public_response(m_rejected.model_id)

    def test_list_pending_review_queue(self) -> None:
        self.assertEqual(len(self.service.list_pending_review()), 0)

        # Create two models submitted for review
        m1, _, _ = self._create_model_with_file("Queue Model 1")
        self.service.publish(m1.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=False)

        m2, _, _ = self._create_model_with_file("Queue Model 2")
        self.service.publish(m2.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=False)

        # Create one model approved immediately by moderator
        m3, _, _ = self._create_model_with_file("Queue Model 3")
        self.service.publish(m3.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=True)

        pending = self.service.list_pending_review()
        self.assertEqual(len(pending), 2)
        pending_ids = [item["model_id"] for item in pending]
        self.assertIn(m1.model_id, pending_ids)
        self.assertIn(m2.model_id, pending_ids)
        self.assertNotIn(m3.model_id, pending_ids)

        # Validate with ModelPendingReviewQueueResponse schema
        queue_resp = ModelPendingReviewQueueResponse(items=pending, total=len(pending))
        self.assertEqual(queue_resp.total, 2)
        self.assertEqual(queue_resp.items[0].moderation_status, ModelModerationStatus.PENDING_REVIEW)

    def test_review_model_approve_action(self) -> None:
        model, file_id, data = self._create_model_with_file("Pending Approve")
        self.service.publish(model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=False)

        res = self.service.review_model(
            model.model_id,
            action="approve",
            notes="LGTM, approved for catalog",
        )

        self.assertEqual(res["model_id"], model.model_id)
        self.assertEqual(res["moderation_status"], "approved")
        self.assertEqual(res["moderation_notes"], "LGTM, approved for catalog")
        self.assertEqual(res["action_taken"], "approve")
        self.assertFalse(res["installed"])
        self.assertIsNone(res["installed_file"])
        self.assertIsNotNone(res["reviewed_at"])

        # Validate against schema
        review_schema = ModelReviewResponse(**res)
        self.assertEqual(review_schema.moderation_status, ModelModerationStatus.APPROVED)

        # Reloaded model is public and approved
        reloaded = self.service.get(model.model_id)
        self.assertEqual(reloaded.moderation_status, ModelModerationStatus.APPROVED)
        self.assertEqual(reloaded.visibility, ModelVisibility.PUBLIC)
        self.assertIsNotNone(reloaded.published_at)

        # Now shows up in public list
        self.assertIn(model.model_id, [m.model_id for m in self.service.list_public()])

    def test_review_model_approve_with_install_to_comfy(self) -> None:
        model, file_id, data = self._create_model_with_file("Pending Approve Install")
        version_id = model.versions[0].version_id
        self.service.publish(model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=False)

        res = self.service.review_model(
            model.model_id,
            action="approve",
            notes="Approved and installed to ComfyUI",
            install_to_comfy=True,
            version_id=version_id,
            file_id=file_id,
        )

        self.assertTrue(res["installed"])
        self.assertIsNotNone(res["installed_file"])

        destination_path = Path(self.comfy.name) / "models" / "checkpoints" / "weights.safetensors"
        self.assertTrue(destination_path.is_file())
        self.assertEqual(destination_path.read_bytes(), data)

    def test_review_model_reject_action(self) -> None:
        model, file_id, data = self._create_model_with_file("Pending Reject")
        self.service.publish(model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=False)

        res = self.service.review_model(
            model.model_id,
            action="reject",
            notes="Violates terms of use",
        )

        self.assertEqual(res["moderation_status"], "rejected")
        self.assertEqual(res["action_taken"], "reject")
        self.assertEqual(res["moderation_notes"], "Violates terms of use")

        reloaded = self.service.get(model.model_id)
        self.assertEqual(reloaded.moderation_status, ModelModerationStatus.REJECTED)
        self.assertEqual(reloaded.visibility, ModelVisibility.PRIVATE)
        self.assertIsNone(reloaded.published_at)

        self.assertNotIn(model.model_id, [m.model_id for m in self.service.list_public()])
        self.assertNotIn(model.model_id, [item["model_id"] for item in self.service.list_pending_review()])

    def test_review_model_request_changes_action(self) -> None:
        model, file_id, data = self._create_model_with_file("Pending Changes")
        self.service.publish(model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=False)

        res = self.service.review_model(
            model.model_id,
            action="request_changes",
            notes="Please add sample images and describe prompt triggers",
        )

        self.assertEqual(res["moderation_status"], "draft")
        self.assertEqual(res["action_taken"], "request_changes")
        self.assertEqual(res["moderation_notes"], "Please add sample images and describe prompt triggers")

        reloaded = self.service.get(model.model_id)
        self.assertEqual(reloaded.moderation_status, ModelModerationStatus.DRAFT)
        self.assertEqual(reloaded.visibility, ModelVisibility.PRIVATE)
        self.assertIsNone(reloaded.published_at)

    def test_vault_source_and_installation_flags(self) -> None:
        base_model = self.service.create(
            ModelCreateRequest(title="Vault Model", visibility=ModelVisibility.PRIVATE)
        )
        data = b"local vault weights"
        source = Path(self.comfy.name) / "models" / "checkpoints"
        source.mkdir(parents=True, exist_ok=True)
        (source / "vault_model.safetensors").write_bytes(data)

        local_res = self.service.import_local_file(
            base_model.model_id,
            base_model.versions[0].version_id,
            "checkpoints",
            "vault_model.safetensors",
            ModelPrecision.FP16,
        )
        local_file = local_res.versions[0].files[-1]
        self.assertTrue(local_file.from_vault)
        self.assertTrue(local_file.in_vault)
        self.assertTrue(local_res.from_vault)
        self.assertTrue(local_res.in_vault)

        up_model, up_file_id, up_data = self._create_model_with_file("Uploaded Test Model")
        up_reloaded = self.service.get(up_model.model_id)
        up_file = up_reloaded.versions[0].files[0]
        self.assertFalse(up_file.from_vault)
        self.assertFalse(up_file.in_vault)
        self.assertFalse(up_reloaded.from_vault)
        self.assertFalse(up_reloaded.in_vault)

        self.service.publish(up_model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC), is_moderator=True)
        self.service.install_file(up_model.model_id, up_model.versions[0].version_id, up_file_id)

        installed_reloaded = self.service.get(up_model.model_id)
        installed_file = installed_reloaded.versions[0].files[0]
        self.assertFalse(installed_file.from_vault)
        self.assertTrue(installed_file.in_vault)
        self.assertFalse(installed_reloaded.from_vault)
        self.assertTrue(installed_reloaded.in_vault)

    def test_review_model_invalid_action(self) -> None:
        model, file_id, data = self._create_model_with_file("Invalid Action Model")
        with self.assertRaises(ModelConflict) as ctx:
            self.service.review_model(
                model.model_id,
                action="invalid_action",
            )
        self.assertIn("Invalid review action", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

