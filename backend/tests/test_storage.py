import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.services.storage import StorageError, StorageService


class StorageServiceDeleteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(
            STORAGE_DIR=self.temp.name,
            FILES_PUBLIC_BASE="http://test",
        )
        self.service = StorageService(self.settings)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_delete_asset_success_with_metadata(self) -> None:
        # Create an asset and metadata sidecar
        asset_dir = Path(self.temp.name) / "workspace" / "prompt123"
        asset_dir.mkdir(parents=True, exist_ok=True)
        media_file = asset_dir / "image.png"
        sidecar_file = asset_dir / "image.png.json"

        media_file.write_bytes(b"fake image data")
        sidecar_file.write_text(json.dumps({"prompt": "sunset"}), encoding="utf-8")

        key = "workspace/prompt123/image.png"
        self.assertTrue(media_file.is_file())
        self.assertTrue(sidecar_file.is_file())

        result = self.service.delete_asset(key)
        self.assertTrue(result)
        self.assertFalse(media_file.exists())
        self.assertFalse(sidecar_file.exists())

    def test_delete_asset_not_found(self) -> None:
        with self.assertRaises(FileNotFoundError):
            self.service.delete_asset("workspace/missing.png")

    def test_delete_asset_path_traversal_rejected(self) -> None:
        # Attempts to escape STORAGE_DIR
        with self.assertRaises(StorageError):
            self.service.delete_asset("../../etc/passwd")

        with self.assertRaises(StorageError):
            self.service.delete_asset("../outside.png")

        with self.assertRaises(StorageError):
            self.service.delete_asset("")

        with self.assertRaises(StorageError):
            self.service.delete_asset("   ")

    def test_delete_asset_api_endpoint(self) -> None:
        # Test the FastAPI endpoints via TestClient
        import app.main as main_mod

        # Inject our temp storage service into main module
        old_storage = main_mod.storage
        main_mod.storage = self.service
        try:
            client = TestClient(app)

            # Create an asset
            asset_dir = Path(self.temp.name) / "tools" / "sample"
            asset_dir.mkdir(parents=True, exist_ok=True)
            media = asset_dir / "output.png"
            sidecar = asset_dir / "output.png.json"
            media.write_bytes(b"sample tool output")
            sidecar.write_text(json.dumps({"tool_id": "test"}), encoding="utf-8")

            # 1. Successful DELETE via /api/v1/gallery/{key:path}
            resp = client.delete("/api/v1/gallery/tools/sample/output.png")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertTrue(data.get("deleted"))
            self.assertEqual(data.get("key"), "tools/sample/output.png")
            self.assertFalse(media.exists())
            self.assertFalse(sidecar.exists())

            # 2. Deleting nonexistent file returns 404
            resp_404 = client.delete("/api/v1/gallery/tools/sample/output.png")
            self.assertEqual(resp_404.status_code, 404)

            # 3. Path traversal attempts return 400
            resp_400 = client.delete("/api/v1/gallery/..%2F..%2Fetc%2Fpasswd")
            self.assertEqual(resp_400.status_code, 400)
        finally:
            main_mod.storage = old_storage


if __name__ == "__main__":
    unittest.main()
