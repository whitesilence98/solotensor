import hashlib
import tempfile
import unittest
from pathlib import Path

from app.config import Settings
from app.schemas import ModelCreateRequest, ModelFilePatchRequest, ModelPrecision, ModelPublishRequest, ModelUpdateRequest, ModelVisibility, ModelVersionCreateRequest
from app.services.models import ModelConflict, ModelError, ModelService


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
