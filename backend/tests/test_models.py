import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from app.config import Settings
from app.schemas import CreatorModelType, ModelCreateRequest, ModelFilePatchRequest, ModelPrecision, ModelPublishRequest, ModelUpdateRequest, ModelVisibility, ModelVersionCreateRequest
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
        self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC))
        return file_id, data

    def test_diffusion_model_install_category(self) -> None:
        self.assertEqual(self.service.install_category("Diffusion Model"), "diffusion_models")

    def test_resolves_installed_public_gallery_file(self) -> None:
        file_id, data = self._published_file(CreatorModelType.DIFFUSION_MODEL)
        target = Path(self.comfy.name) / "models" / "diffusion_models" / "demo.safetensors"
        target.parent.mkdir(parents=True)
        target.write_bytes(data)

        resolved = self.service.resolve_installed_gallery_file(self.model.model_id, self.version.version_id, file_id)

        self.assertEqual(resolved["model_type"], "Diffusion Model")
        self.assertEqual(resolved["category"], "diffusion_models")
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
        self.service.publish(adapter.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC))
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

    def test_legacy_unet_records_migrate_to_diffusion_model(self) -> None:
        record = json.loads((Path(self.temp.name) / "definitions" / f"{self.model.model_id}.json").read_text(encoding="utf-8"))
        record["model_type"] = "UNET"
        (Path(self.temp.name) / "definitions" / f"{self.model.model_id}.json").write_text(json.dumps(record), encoding="utf-8")

        reloaded = ModelService(self.settings).get(self.model.model_id)

        self.assertEqual(reloaded.model_type.value, "Diffusion Model")

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
        self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC))
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
        self.service.publish(self.model.model_id, ModelPublishRequest(visibility=ModelVisibility.PUBLIC))
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


if __name__ == "__main__":
    unittest.main()
