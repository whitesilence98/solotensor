import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.services.storage import StorageService
from app.services.tagger import TaggerService


class TaggerServiceUnitTests(unittest.TestCase):
    def test_clean_tags_formatting(self) -> None:
        raw = "outdoors, Sky, day, blurry, NO humans, animal, cat, building, scenery, motor_vehicle, city, car, cat"
        tags = TaggerService.clean_tags(raw)
        expected = [
            "outdoors",
            "sky",
            "day",
            "blurry",
            "no humans",
            "animal",
            "cat",
            "building",
            "scenery",
            "motor vehicle",
            "city",
            "car",
        ]
        self.assertEqual(tags, expected)

    def test_clean_tags_list_input(self) -> None:
        raw = ["cyberpunk_city, neon_lights", "rain, 1girl"]
        tags = TaggerService.clean_tags(raw)
        self.assertEqual(tags, ["cyberpunk city", "neon lights", "rain", "1girl"])

    def test_clean_tags_empty(self) -> None:
        self.assertEqual(TaggerService.clean_tags(""), [])
        self.assertEqual(TaggerService.clean_tags(", , ,"), [])


class StorageTagTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(
            STORAGE_DIR=self.temp.name,
            FILES_PUBLIC_BASE="http://test",
        )
        self.storage = StorageService(self.settings)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_update_tags_and_retrieve(self) -> None:
        asset_dir = Path(self.temp.name) / "workspace" / "p1"
        asset_dir.mkdir(parents=True, exist_ok=True)
        img = asset_dir / "test.png"
        img.write_bytes(b"data")

        key = "workspace/p1/test.png"
        item = self.storage.update_tags(key, ["cat", "cityscape"])
        self.assertEqual(item.metadata.get("tags"), ["cat", "cityscape"])

        # Retrieve again
        fetched = self.storage.get_asset(key)
        self.assertEqual(fetched.metadata.get("tags"), ["cat", "cityscape"])

    def test_list_popular_tags_aggregation(self) -> None:
        for idx, tag_set in enumerate([["cat", "cyberpunk"], ["cat", "scenery"], ["cyberpunk", "neon"]]):
            p = Path(self.temp.name) / f"prompt_{idx}"
            p.mkdir(parents=True, exist_ok=True)
            (p / "out.png").write_bytes(b"img")
            (p / "out.png.json").write_text(json.dumps({"tags": tag_set}), encoding="utf-8")

        popular = self.storage.list_popular_tags(limit=10)
        self.assertEqual(popular[0]["name"], "cat")
        self.assertEqual(popular[0]["count"], 2)
        self.assertEqual(popular[1]["name"], "cyberpunk")
        self.assertEqual(popular[1]["count"], 2)

    def test_list_recent_tag_filtering(self) -> None:
        p1 = Path(self.temp.name) / "p1"
        p1.mkdir(parents=True, exist_ok=True)
        (p1 / "a.png").write_bytes(b"a")
        (p1 / "a.png.json").write_text(json.dumps({"tags": ["cat", "cityscape"]}), encoding="utf-8")

        p2 = Path(self.temp.name) / "p2"
        p2.mkdir(parents=True, exist_ok=True)
        (p2 / "b.png").write_bytes(b"b")
        (p2 / "b.png.json").write_text(json.dumps({"tags": ["dog", "forest"]}), encoding="utf-8")

        # Match any
        matched_any = self.storage.list_recent(tags=["cat", "dog"], tag_mode="any")
        self.assertEqual(len(matched_any), 2)

        # Match all
        matched_all = self.storage.list_recent(tags=["cat", "cityscape"], tag_mode="all")
        self.assertEqual(len(matched_all), 1)
        self.assertEqual(matched_all[0].key, "p1/a.png")

        # Match none
        matched_none = self.storage.list_recent(tags=["cat", "forest"], tag_mode="all")
        self.assertEqual(len(matched_none), 0)


class TaggerApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(
            STORAGE_DIR=self.temp.name,
            FILES_PUBLIC_BASE="http://test",
        )
        self.storage = StorageService(self.settings)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_put_tags_endpoint(self) -> None:
        p = Path(self.temp.name) / "sample"
        p.mkdir(parents=True, exist_ok=True)
        (p / "img.png").write_bytes(b"data")

        with patch("app.main.storage", self.storage):
            client = TestClient(app)
            resp = client.put("/api/v1/assets/sample/img.png/tags", json={"tags": ["portrait", "cinematic"]})
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["metadata"]["tags"], ["portrait", "cinematic"])

    def test_get_tags_endpoint(self) -> None:
        p = Path(self.temp.name) / "sample"
        p.mkdir(parents=True, exist_ok=True)
        (p / "img.png").write_bytes(b"data")
        (p / "img.png.json").write_text(json.dumps({"tags": ["anime", "1girl"]}), encoding="utf-8")

        with patch("app.main.storage", self.storage):
            client = TestClient(app)
            resp = client.get("/api/v1/tags?limit=5")
            self.assertEqual(resp.status_code, 200)
            items = resp.json()["items"]
            self.assertEqual(len(items), 2)
            self.assertEqual(items[0]["name"], "anime")

    @patch("app.main.get_tagger_service")
    def test_auto_tag_endpoint(self, mock_tagger_get) -> None:
        mock_tagger = mock_tagger_get.return_value
        mock_tagger.auto_tag_asset = AsyncMock(return_value=["cyberpunk", "city"])

        p = Path(self.temp.name) / "sample"
        p.mkdir(parents=True, exist_ok=True)
        (p / "img.png").write_bytes(b"data")
        self.storage.update_tags("sample/img.png", ["cyberpunk", "city"])

        with patch("app.main.storage", self.storage):
            client = TestClient(app)
            resp = client.post("/api/v1/assets/sample/img.png/tags/auto")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["metadata"]["tags"], ["cyberpunk", "city"])

    @patch("app.main.get_tagger_service")
    def test_save_asset_triggers_background_auto_tag_when_no_tags(self, mock_tagger_get) -> None:
        mock_tagger = mock_tagger_get.return_value
        mock_tagger.auto_tag_asset = AsyncMock(return_value=["vintage", "portrait"])

        p = Path(self.temp.name) / "sample"
        p.mkdir(parents=True, exist_ok=True)
        (p / "img2.png").write_bytes(b"data")

        with patch("app.main.storage", self.storage):
            client = TestClient(app)
            # Patching saved=true on an asset with no tags should trigger background auto-tag
            resp = client.patch("/api/v1/assets/sample/img2.png?saved=true")
            self.assertEqual(resp.status_code, 200)
            mock_tagger.auto_tag_asset.assert_called_once_with("sample/img2.png")

    @patch("app.main.get_tagger_service")
    def test_save_asset_does_not_tag_when_saved_is_false(self, mock_tagger_get) -> None:
        mock_tagger = mock_tagger_get.return_value
        mock_tagger.auto_tag_asset = AsyncMock()

        p = Path(self.temp.name) / "sample"
        p.mkdir(parents=True, exist_ok=True)
        (p / "img3.png").write_bytes(b"data")

        with patch("app.main.storage", self.storage):
            client = TestClient(app)
            resp = client.patch("/api/v1/assets/sample/img3.png?saved=false")
            self.assertEqual(resp.status_code, 200)
            mock_tagger.auto_tag_asset.assert_not_called()

    @patch("app.main.get_tagger_service")
    def test_bg_auto_tag_helper_handles_exceptions_gracefully(self, mock_tagger_get) -> None:
        import asyncio
        from app.main import _bg_auto_tag_asset

        mock_tagger = mock_tagger_get.return_value
        mock_tagger.auto_tag_asset = AsyncMock(side_effect=RuntimeError("ComfyUI unreachable"))

        # Should not raise exception
        asyncio.run(_bg_auto_tag_asset("sample/failed.png"))
        mock_tagger.auto_tag_asset.assert_called_once_with("sample/failed.png")

    def test_interrogate_image_with_embedded_metadata(self) -> None:
        import io
        from PIL import Image
        from PIL.PngImagePlugin import PngInfo

        buf = io.BytesIO()
        im = Image.new("RGB", (64, 64), color="red")
        info = PngInfo()
        info.add_text(
            "parameters",
            "masterpiece, best quality, 1girl, cyberpunk city\nNegative prompt: worst quality, blurry\nSteps: 28, Sampler: DPM++ 2M Karras, CFG scale: 6.5, Seed: 987654321, Size: 832x1216, Model: animeIllust_v1",
        )
        im.save(buf, format="PNG", pnginfo=info)
        png_bytes = buf.getvalue()

        client = TestClient(app)
        files = {"file": ("test_ai.png", png_bytes, "image/png")}
        resp = client.post("/api/v1/tagger/interrogate", files=files)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["has_metadata"])
        self.assertIsNotNone(data["metadata"])
        self.assertEqual(data["metadata"]["prompt"], "masterpiece, best quality, 1girl, cyberpunk city")
        self.assertEqual(data["metadata"]["negative_prompt"], "worst quality, blurry")
        self.assertEqual(data["metadata"]["seed"], 987654321)
        self.assertEqual(data["metadata"]["steps"], 28)
        self.assertEqual(data["metadata"]["cfg"], 6.5)
        self.assertEqual(data["metadata"]["width"], 832)
        self.assertEqual(data["metadata"]["height"], 1216)
        self.assertIn("cyberpunk city", data["tags"])

    @patch("app.main.get_tagger_service")
    def test_interrogate_image_without_metadata_falls_back_to_wd14(self, mock_tagger_get) -> None:
        import io
        from PIL import Image

        mock_tagger = mock_tagger_get.return_value
        mock_tagger.interrogate_image = AsyncMock(return_value=["solo", "outdoors", "scenery"])

        buf = io.BytesIO()
        im = Image.new("RGB", (64, 64), color="blue")
        im.save(buf, format="PNG")
        plain_png = buf.getvalue()

        client = TestClient(app)
        files = {"file": ("plain.png", plain_png, "image/png")}
        resp = client.post("/api/v1/tagger/interrogate", files=files)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["has_metadata"])
        self.assertIsNone(data["metadata"])
        self.assertEqual(data["tags"], ["solo", "outdoors", "scenery"])
        mock_tagger.interrogate_image.assert_called_once()

