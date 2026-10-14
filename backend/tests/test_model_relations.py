"""Unit tests for relational models, versions, samples, LoRAs, generations, and pagination."""

from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
import uuid

from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, get_db, set_db
from app.main import app, model_storage, storage
from app.schemas import (
    GenerationRecordResponse,
    ModelCreateRequest,
    ModelPrecision,
    PaginatedGenerationsResponse,
    PaginatedSamplesResponse,
)


class DatabaseModelRelationsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = f"{self.temp_dir.name}/relational_test.db"
        self.db = Database(db_path=self.db_path)
        self.db.init_db()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_model_upsert_and_cascade_delete(self) -> None:
        model_id = uuid.uuid4().hex
        version_id_1 = uuid.uuid4().hex
        version_id_2 = uuid.uuid4().hex
        file_id_1 = uuid.uuid4().hex
        sample_id_1 = uuid.uuid4().hex

        record = {
            "model_id": model_id,
            "title": "Cyberpunk Portrait Pro",
            "category": "Style",
            "model_type": "Checkpoint",
            "visibility": "Public",
            "published_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "versions": [
                {
                    "version_id": version_id_1,
                    "name": "v1.0",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "files": [
                        {
                            "file_id": file_id_1,
                            "filename": "cyberpunk_v1.safetensors",
                            "size": 4_000_000_000,
                            "sha256": "abcdef123456",
                            "precision": "FP16",
                            "visible": True,
                            "stored_name": f"{file_id_1}.safetensors",
                        }
                    ],
                    "samples": [
                        {
                            "sample_id": sample_id_1,
                            "filename": "showcase1.png",
                            "kind": "image",
                            "stored_name": f"{sample_id_1}.png",
                            "url": "http://localhost:8000/sample.png",
                            "metadata": {"prompt": "neon girl in rain", "steps": 25},
                        }
                    ],
                },
                {
                    "version_id": version_id_2,
                    "name": "v2.0 Turbo",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "files": [],
                    "samples": [],
                },
            ],
        }

        # 1. Upsert model
        upsert_res = self.db.upsert_model(record)
        self.assertEqual(upsert_res["model_id"], model_id)
        self.assertEqual(upsert_res["title"], "Cyberpunk Portrait Pro")

        # 2. Verify relational rows in SQLite
        with self.db.get_connection() as conn:
            m_row = conn.execute("SELECT * FROM models WHERE id = ?", (model_id,)).fetchone()
            self.assertIsNotNone(m_row)
            self.assertEqual(m_row["title"], "Cyberpunk Portrait Pro")
            self.assertEqual(m_row["visibility"], "Public")

            v_rows = conn.execute("SELECT * FROM model_versions WHERE model_id = ?", (model_id,)).fetchall()
            self.assertEqual(len(v_rows), 2)

            f_rows = conn.execute("SELECT * FROM model_files WHERE model_id = ?", (model_id,)).fetchall()
            self.assertEqual(len(f_rows), 1)
            self.assertEqual(f_rows[0]["filename"], "cyberpunk_v1.safetensors")

            s_rows = conn.execute("SELECT * FROM model_samples WHERE model_id = ?", (model_id,)).fetchall()
            self.assertEqual(len(s_rows), 1)
            self.assertEqual(s_rows[0]["filename"], "showcase1.png")

        # 3. Cascade deletion
        self.assertTrue(self.db.delete_model(model_id))
        with self.db.get_connection() as conn:
            self.assertIsNone(conn.execute("SELECT id FROM models WHERE id = ?", (model_id,)).fetchone())
            self.assertEqual(len(conn.execute("SELECT id FROM model_versions WHERE model_id = ?", (model_id,)).fetchall()), 0)
            self.assertEqual(len(conn.execute("SELECT id FROM model_files WHERE model_id = ?", (model_id,)).fetchall()), 0)
            self.assertEqual(len(conn.execute("SELECT id FROM model_samples WHERE model_id = ?", (model_id,)).fetchall()), 0)

    def test_sample_upsert_and_delete(self) -> None:
        model_id = uuid.uuid4().hex
        version_id = uuid.uuid4().hex
        self.db.upsert_model({
            "model_id": model_id,
            "title": "Test Model",
            "category": "General",
            "model_type": "Checkpoint",
            "versions": [{"version_id": version_id, "name": "v1.0", "files": [], "samples": []}],
        })

        sample_id = uuid.uuid4().hex
        res = self.db.upsert_sample(
            model_id,
            version_id,
            {
                "sample_id": sample_id,
                "filename": "test.png",
                "kind": "image",
                "url": "http://localhost:8000/test.png",
                "metadata": {"prompt": "sample prompt"},
            },
        )
        self.assertEqual(res["sample_id"], sample_id)

        items, total = self.db.get_model_samples(model_id)
        self.assertEqual(total, 1)
        self.assertEqual(items[0]["filename"], "test.png")
        self.assertEqual(items[0]["metadata"]["prompt"], "sample prompt")

        # Delete sample
        self.assertTrue(self.db.delete_sample(sample_id))
        items, total = self.db.get_model_samples(model_id)
        self.assertEqual(total, 0)

    def test_insert_generation_with_loras(self) -> None:
        base_model_id = uuid.uuid4().hex
        lora_model_id = uuid.uuid4().hex

        self.db.upsert_model({
            "model_id": base_model_id,
            "title": "SDXL Base",
            "category": "General",
            "model_type": "Checkpoint",
            "versions": [{"version_id": "v1", "name": "v1.0", "files": [], "samples": []}],
        })
        self.db.upsert_model({
            "model_id": lora_model_id,
            "title": "Detail Tweaker LoRA",
            "category": "Style",
            "model_type": "LoRA",
            "versions": [{"version_id": "lv1", "name": "v1.0", "files": [], "samples": []}],
        })

        gen_id = uuid.uuid4().hex
        gen_data = {
            "id": gen_id,
            "prompt_id": "prompt-xyz-123",
            "model_id": base_model_id,
            "version_id": "v1",
            "file_id": "f1",
            "filename": "result.png",
            "url": "http://localhost:8000/files/result.png",
            "key": "result.png",
            "prompt": "futuristic city, highly detailed",
            "negative_prompt": "blurry, low quality",
            "seed": 42,
            "steps": 30,
            "cfg": 7.0,
            "width": 1024,
            "height": 1024,
            "elapsed_ms": 1500,
        }
        loras = [
            {
                "lora_name": "detail_tweaker.safetensors",
                "lora_model_id": lora_model_id,
                "lora_version_id": "lv1",
                "strength": 0.8,
            }
        ]

        inserted = self.db.insert_generation(gen_data, loras_list=loras)
        self.assertEqual(inserted["id"], gen_id)

        # 1. Query by base model_id
        items_base, total_base = self.db.get_model_generations(base_model_id)
        self.assertEqual(total_base, 1)
        self.assertEqual(items_base[0]["id"], gen_id)
        self.assertEqual(len(items_base[0]["loras"]), 1)
        self.assertEqual(items_base[0]["loras"][0]["lora_model_id"], lora_model_id)
        self.assertEqual(items_base[0]["loras"][0]["strength"], 0.8)

        # 2. Query by LoRA model_id (proves images created by this LoRA are returned!)
        items_lora, total_lora = self.db.get_model_generations(lora_model_id)
        self.assertEqual(total_lora, 1)
        self.assertEqual(items_lora[0]["id"], gen_id)

        # 3. Query with version_id filter
        items_v1, total_v1 = self.db.get_model_generations(base_model_id, version_id="v1")
        self.assertEqual(total_v1, 1)
        items_v2, total_v2 = self.db.get_model_generations(base_model_id, version_id="v2_nonexistent")
        self.assertEqual(total_v2, 0)

    def test_get_paginated_generations_filtering(self) -> None:
        user1 = self.db.create_user("user-1", "user1@test.com", "user1", "pass")["id"]
        user2 = self.db.create_user("user-2", "user2@test.com", "user2", "pass")["id"]
        model1 = uuid.uuid4().hex
        self.db.upsert_model({
            "model_id": model1,
            "title": "Model 1",
            "category": "General",
            "model_type": "Checkpoint",
            "versions": [{"version_id": "v1", "name": "v1", "files": [], "samples": []}],
        })

        for i in range(5):
            self.db.insert_generation({
                "prompt_id": f"prompt-u1-{i}",
                "user_id": user1,
                "model_id": model1,
                "filename": f"img_u1_{i}.png",
                "url": f"http://localhost:8000/files/u1_{i}.png",
                "key": f"u1_{i}.png",
                "prompt": f"prompt {i}",
            })

        for i in range(3):
            self.db.insert_generation({
                "prompt_id": f"prompt-u2-{i}",
                "user_id": user2,
                "model_id": None,
                "filename": f"img_u2_{i}.png",
                "url": f"http://localhost:8000/files/u2_{i}.png",
                "key": f"u2_{i}.png",
                "prompt": f"guest prompt {i}",
            })

        # All generations: 8 total
        _, total_all = self.db.get_paginated_generations()
        self.assertEqual(total_all, 8)

        # Filter by user1: 5 total
        items_u1, total_u1 = self.db.get_paginated_generations(user_id=user1, page=1, limit=3)
        self.assertEqual(total_u1, 5)
        self.assertEqual(len(items_u1), 3)

        # Page 2 for user1: 2 items
        items_u1_p2, _ = self.db.get_paginated_generations(user_id=user1, page=2, limit=3)
        self.assertEqual(len(items_u1_p2), 2)

        # Filter by model1: 5 total
        items_m1, total_m1 = self.db.get_paginated_generations(model_id=model1)
        self.assertEqual(total_m1, 5)

    def test_sync_filesystem_to_db(self) -> None:
        models_dir = Path(self.temp_dir.name) / "definitions"
        models_dir.mkdir(parents=True, exist_ok=True)
        storage_dir = Path(self.temp_dir.name) / "storage"
        storage_dir.mkdir(parents=True, exist_ok=True)

        model_id = uuid.uuid4().hex
        model_json = models_dir / f"{model_id}.json"
        model_json.write_text(
            json.dumps({
                "model_id": model_id,
                "title": "Filesystem Model",
                "category": "Style",
                "model_type": "LoRA",
                "versions": [{"version_id": "v1", "name": "v1", "files": [], "samples": []}],
            }),
            encoding="utf-8",
        )

        img_file = storage_dir / "gen1.png"
        img_file.write_bytes(b"dummy image bytes")
        sidecar_file = storage_dir / "gen1.png.json"
        sidecar_file.write_text(
            json.dumps({
                "prompt_id": "prompt-fs-1",
                "model_id": model_id,
                "prompt": "landscape from filesystem",
                "seed": 999,
                "steps": 20,
            }),
            encoding="utf-8",
        )

        stats = self.db.sync_filesystem_to_db(models_dir=models_dir, storage_dir=storage_dir)
        self.assertEqual(stats["synced_models"], 1)
        self.assertEqual(stats["synced_generations"], 1)

        # Second sync should skip existing
        stats2 = self.db.sync_filesystem_to_db(models_dir=models_dir, storage_dir=storage_dir)
        self.assertEqual(stats2["synced_generations"], 0)


class ModelRelationsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = f"{self.temp_dir.name}/api_relations.db"
        self.db = Database(db_path=self.db_path)
        self.db.init_db()

        self.orig_models_root = model_storage.root
        self.orig_definitions = model_storage.definitions
        model_storage.root = Path(self.temp_dir.name) / "models"
        model_storage.definitions = model_storage.root / "definitions"
        model_storage.ensure_root()

        set_db(self.db)
        app.dependency_overrides[get_db] = lambda: self.db

        self.client = TestClient(app)

    def tearDown(self) -> None:
        model_storage.root = self.orig_models_root
        model_storage.definitions = self.orig_definitions
        set_db(None)
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def test_api_get_model_images_paginated(self) -> None:
        # 1. Create model via API
        create_res = self.client.post(
            "/api/v1/models",
            json={
                "title": "Neon Cyberpunk V1",
                "category": "Style",
                "model_type": "Checkpoint",
                "visibility": "Private",
            },
        )
        self.assertEqual(create_res.status_code, 201)
        model_data = create_res.json()
        model_id = model_data["model_id"]
        version_id = model_data["versions"][0]["version_id"]

        # 2. Insert 3 generations in DB linked to this model
        for i in range(3):
            self.db.insert_generation({
                "prompt_id": f"prompt-api-{i}",
                "model_id": model_id,
                "version_id": version_id,
                "filename": f"output_{i}.png",
                "url": f"http://localhost:8000/files/output_{i}.png",
                "key": f"output_{i}.png",
                "prompt": f"Neon style image {i}",
                "seed": 100 + i,
            })

        # 3. Query page 1 with limit 2
        res_p1 = self.client.get(f"/api/v1/models/id/{model_id}/images?page=1&limit=2")
        self.assertEqual(res_p1.status_code, 200)
        p1 = res_p1.json()
        self.assertEqual(p1["total"], 3)
        self.assertEqual(p1["page"], 1)
        self.assertEqual(p1["limit"], 2)
        self.assertEqual(p1["total_pages"], 2)
        self.assertTrue(p1["has_more"])
        self.assertEqual(len(p1["items"]), 2)
        self.assertEqual(p1["items"][0]["model_id"], model_id)

        # 4. Query page 2 with limit 2
        res_p2 = self.client.get(f"/api/v1/models/id/{model_id}/images?page=2&limit=2")
        self.assertEqual(res_p2.status_code, 200)
        p2 = res_p2.json()
        self.assertEqual(p2["total"], 3)
        self.assertEqual(p2["page"], 2)
        self.assertEqual(len(p2["items"]), 1)
        self.assertFalse(p2["has_more"])

        # 5. Public route also works
        res_pub = self.client.get(f"/api/v1/models/public/{model_id}/images?page=1&limit=10")
        self.assertEqual(res_pub.status_code, 200)
        self.assertEqual(res_pub.json()["total"], 3)

    def test_api_get_model_samples_paginated(self) -> None:
        # Create model
        create_res = self.client.post(
            "/api/v1/models",
            json={"title": "Anime Watercolor", "category": "Style", "model_type": "Checkpoint"},
        )
        self.assertEqual(create_res.status_code, 201)
        model_id = create_res.json()["model_id"]
        version_id = create_res.json()["versions"][0]["version_id"]

        # Add 2 showcase samples via API
        for i in range(2):
            sample_res = self.client.post(
                f"/api/v1/models/id/{model_id}/versions/{version_id}/samples",
                files={"file": (f"sample_{i}.png", b"fake image bytes", "image/png")},
                data={"metadata": json.dumps({"prompt": f"watercolor girl {i}"})},
            )
            self.assertEqual(sample_res.status_code, 200)

        # Query paginated samples
        res = self.client.get(f"/api/v1/models/id/{model_id}/samples-paginated?page=1&limit=1")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total"], 2)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["limit"], 1)
        self.assertEqual(data["total_pages"], 2)
        self.assertTrue(data["has_more"])
        self.assertEqual(len(data["items"]), 1)
        self.assertIn("sample_id", data["items"][0])
        self.assertIn("url", data["items"][0])

    def test_api_paginated_gallery(self) -> None:
        model_id = uuid.uuid4().hex
        self.db.upsert_model({
            "model_id": model_id,
            "title": "Flux Photorealism",
            "category": "General",
            "model_type": "Checkpoint",
            "versions": [{"version_id": "v1", "name": "v1", "files": [], "samples": []}],
        })

        for i in range(4):
            self.db.insert_generation({
                "prompt_id": f"prompt-gallery-{i}",
                "model_id": model_id if i < 2 else None,
                "filename": f"gal_{i}.png",
                "url": f"http://localhost:8000/files/gal_{i}.png",
                "key": f"gal_{i}.png",
                "prompt": f"gallery art {i}",
            })

        # All gallery items paginated
        res = self.client.get("/api/v1/gallery/paginated?page=1&limit=10")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total"], 4)
        self.assertEqual(len(data["items"]), 4)

        # Filter by model_id
        res_filtered = self.client.get(f"/api/v1/gallery/paginated?model_id={model_id}")
        self.assertEqual(res_filtered.status_code, 200)
        data_f = res_filtered.json()
        self.assertEqual(data_f["total"], 2)
        self.assertEqual(len(data_f["items"]), 2)


if __name__ == "__main__":
    unittest.main()
