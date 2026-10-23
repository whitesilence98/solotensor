import asyncio
import json
import unittest
from pathlib import Path

from app.services.comfy_client import ComfyClient, ComfyClientError


class WorkflowPatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        path = Path(__file__).parents[1] / "workflows" / "workflow_api.json"
        cls.template = json.loads(path.read_text(encoding="utf-8"))
        cls.client = ComfyClient()

    def test_patches_exported_node_mappings_without_mutating_template(self) -> None:
        original = json.loads(json.dumps(self.template))
        graph = self.client.patch_workflow_template(
            self.template,
            prompt="a red fox",
            negative_prompt="blurry",
            unet_name="custom\\model.safetensors",
            clip_name="custom_clip.safetensors",
            clip_type="custom_type",
            vae_name="custom_vae.safetensors",
            seed=123,
            steps=17,
            image_count=3,
            cfg=1.5,
            denoise=0.8,
            loras=[
                {"lora": "style\\first.safetensors", "on": True, "strength": 0.8},
                {"lora": "second.safetensors", "on": False, "strength": -0.25},
            ],
            width=1024,
            height=768,
        )
        self.assertEqual(graph["621"]["inputs"]["prompt"], "a red fox")
        self.assertEqual(graph["700"]["inputs"]["text"], "blurry")
        self.assertEqual(graph["618:615"]["inputs"]["unet_name"], "custom\\model.safetensors")
        self.assertEqual(graph["618:616"]["inputs"]["clip_name"], "custom_clip.safetensors")
        self.assertEqual(graph["618:616"]["inputs"]["type"], "custom_type")
        self.assertEqual(graph["618:617"]["inputs"]["vae_name"], "custom_vae.safetensors")
        self.assertEqual(graph["867"]["inputs"]["seed"], 123)
        self.assertEqual(graph["1028"]["inputs"]["noise_seed"], 123)
        self.assertEqual(graph["1028"]["inputs"]["cfg"], 1.5)
        self.assertEqual(graph["1029"]["inputs"]["cfg"], 1.5)
        self.assertEqual(graph["1029"]["inputs"]["denoise"], 0.8)
        self.assertEqual(graph["1025:2"]["inputs"]["modelname"], "custom\\model.safetensors")
        self.assertEqual(graph["1025:2"]["inputs"]["positive"], "a red fox")
        self.assertEqual(graph["1025:2"]["inputs"]["negative"], "blurry")
        self.assertEqual(graph["1025:2"]["inputs"]["seed_value"], 123)
        self.assertEqual(graph["1025:2"]["inputs"]["steps"], 17)
        self.assertEqual(graph["1025:2"]["inputs"]["cfg"], 1.5)
        self.assertEqual(graph["1025:2"]["inputs"]["denoise"], 0.8)
        self.assertEqual(graph["1025:2"]["inputs"]["sampler_name"], "exponential/ddim")
        self.assertEqual(graph["1025:2"]["inputs"]["scheduler_name"], "beta57")
        self.assertEqual(graph["1025:2"]["inputs"]["positive"], "a red fox")
        self.assertEqual(graph["1025:1"]["inputs"]["metadata"], ["1025:2", 0])
        self.assertEqual(graph["903"]["inputs"]["width"], 1024)
        self.assertEqual(graph["903"]["inputs"]["height"], 768)
        self.assertEqual(graph["903"]["inputs"]["batch_size"], 3)
        self.assertEqual(graph["1043"]["inputs"]["lora_1"], {"on": True, "lora": "style\\first.safetensors", "strength": 0.8})
        self.assertEqual(graph["1043"]["inputs"]["lora_2"], {"on": False, "lora": "second.safetensors", "strength": -0.25})
        self.assertEqual(self.template, original)

    def test_empty_loras_clear_baked_template_rows(self) -> None:
        graph = self.client.patch_workflow_template(self.template, prompt="test", loras=[])
        self.assertFalse(any(key.lower().startswith("lora_") for key in graph["1043"]["inputs"]))
        self.assertEqual(graph["1043"]["inputs"]["➕ Add Lora"], "")

        graph = self.client._build_builtin_workflow(
            prompt="test",
            image_count=4,
            denoise=0.65,
            width=1536,
            height=640,
        )
        self.assertEqual(graph["4"]["inputs"]["width"], 1536)
        self.assertEqual(graph["4"]["inputs"]["height"], 640)
        self.assertEqual(graph["4"]["inputs"]["batch_size"], 4)
        self.assertEqual(graph["5"]["inputs"]["denoise"], 0.65)

    def test_resolve_model_name_matches_comfyui_enumeration(self) -> None:
        async def run() -> str:
            async def fake_list(category: str) -> list[str]:
                self.assertEqual(category, "diffusion_models")
                return [
                    "krea2\\krea2_turbo_fp8_scaled.safetensors",
                    "z-image\\z_image_turbo_bf16.safetensors",
                ]

            client = ComfyClient()
            client.list_models = fake_list  # type: ignore[method-assign]
            return await client.resolve_model_name(
                "diffusion_models", "z-image/z_image_turbo_bf16.safetensors"
            )

        self.assertEqual(asyncio.run(run()), "z-image\\z_image_turbo_bf16.safetensors")

        async def run_missing() -> None:
            async def fake_list(category: str) -> list[str]:
                return ["other\\model.safetensors"]

            client = ComfyClient()
            client.list_models = fake_list  # type: ignore[method-assign]
            await client.resolve_model_name(
                "diffusion_models", "z-image/z_image_turbo_bf16.safetensors"
            )

        with self.assertRaises(ComfyClientError):
            asyncio.run(run_missing())

    def test_gallery_workflows_use_resolved_filename(self) -> None:
        checkpoint = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            filename="nested/checkpoint.safetensors",
            prompt="test",
        )
        self.assertEqual(checkpoint["1"]["inputs"]["ckpt_name"], "nested/checkpoint.safetensors")

        unet = self.client.build_gallery_workflow(
            model_type="Diffusion Model",
            filename="nested/unet.safetensors",
            prompt="test",
        )
        self.assertEqual(unet["618:615"]["inputs"]["unet_name"], "nested/unet.safetensors")
        self.assertFalse(any(key.lower().startswith("lora_") for key in unet["1043"]["inputs"]))

        with self.assertRaises(ComfyClientError):
            self.client.build_gallery_workflow(model_type="LoRA", filename="adapter.safetensors", prompt="test")

    def test_lora_workflows_use_selected_base_and_adapter(self) -> None:
        diffusion = self.client.build_lora_workflow(
            base_model_type="Diffusion Model",
            base_filename="base\\model.safetensors",
            lora_filename="style\\adapter.safetensors",
            clip_name="encoder.safetensors",
            clip_type="custom_type",
            vae_name="vae.safetensors",
            prompt="test",
        )
        self.assertEqual(diffusion["618:615"]["inputs"]["unet_name"], "base\\model.safetensors")
        self.assertEqual(diffusion["1043"]["inputs"]["lora_1"]["lora"], "style\\adapter.safetensors")
        self.assertEqual(diffusion["1043"]["inputs"]["lora_1"]["strength"], 1.0)

        checkpoint = self.client.build_lora_workflow(
            base_model_type="Checkpoint",
            base_filename="base.safetensors",
            lora_filename="adapter.safetensors",
            prompt="test",
        )
        self.assertEqual(checkpoint["1"]["class_type"], "CheckpointLoaderSimple")
        self.assertEqual(checkpoint["1"]["inputs"]["ckpt_name"], "base.safetensors")
        self.assertEqual(checkpoint["2"]["class_type"], "LoraLoader")
        self.assertEqual(checkpoint["2"]["inputs"]["lora_name"], "adapter.safetensors")

    def test_lora_builder_rejects_non_base_model(self) -> None:
        with self.assertRaises(ComfyClientError):
            self.client.build_lora_workflow(
                base_model_type="LoRA",
                base_filename="base.safetensors",
                lora_filename="adapter.safetensors",
                prompt="test",
            )

    def test_missing_required_node_fails(self) -> None:
        template = json.loads(json.dumps(self.template))
        del template["621"]
        with self.assertRaises(ComfyClientError):
            self.client.patch_workflow_template(template, prompt="test")

    def test_omitted_seed_is_generated(self) -> None:
        graph = self.client.patch_workflow_template(self.template, prompt="test")
        seed = graph["867"]["inputs"]["seed"]
        self.assertEqual(graph["1028"]["inputs"]["noise_seed"], seed)
        self.assertIsInstance(seed, int)
        self.assertGreaterEqual(seed, 0)
        self.assertLessEqual(seed, 2**32 - 1)

    def test_missing_lora_node_fails(self) -> None:
        template = json.loads(json.dumps(self.template))
        del template["1043"]
        with self.assertRaises(ComfyClientError):
            self.client.patch_workflow_template(template, prompt="test")

    def test_multi_lora_checkpoint_chaining(self) -> None:
        loras = [
            {"lora": "style\\cyberpunk.safetensors", "strength": 0.7, "on": True},
            {"lora": "character\\hero.safetensors", "strength": 0.5, "on": True},
        ]
        graph = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            filename="base.safetensors",
            clip_name="",
            clip_type="",
            vae_name="",
            prompt="cyber hero",
            negative_prompt="blurry",
            loras=loras,
        )
        self.assertEqual(graph["1"]["class_type"], "CheckpointLoaderSimple")
        self.assertEqual(graph["lora_1"]["class_type"], "LoraLoader")
        self.assertEqual(graph["lora_1"]["inputs"]["lora_name"], "style\\cyberpunk.safetensors")
        self.assertEqual(graph["lora_1"]["inputs"]["strength_model"], 0.7)
        self.assertEqual(graph["lora_1"]["inputs"]["model"], ["1", 0])
        self.assertEqual(graph["lora_1"]["inputs"]["clip"], ["1", 1])

        self.assertEqual(graph["lora_2"]["class_type"], "LoraLoader")
        self.assertEqual(graph["lora_2"]["inputs"]["lora_name"], "character\\hero.safetensors")
        self.assertEqual(graph["lora_2"]["inputs"]["strength_model"], 0.5)
        self.assertEqual(graph["lora_2"]["inputs"]["model"], ["lora_1", 0])
        self.assertEqual(graph["lora_2"]["inputs"]["clip"], ["lora_1", 1])

        self.assertEqual(graph["3"]["inputs"]["clip"], ["lora_2", 1])
        self.assertEqual(graph["4"]["inputs"]["clip"], ["lora_2", 1])
        self.assertEqual(graph["6"]["inputs"]["model"], ["lora_2", 0])

    def test_gallery_workflow_with_loras_diffusion_model(self) -> None:
        loras = [
            {"lora": "style\\anime.safetensors", "strength": 0.8, "on": True},
            {"lora": "concept\\lighting.safetensors", "strength": 0.6, "on": True},
        ]
        graph = self.client.build_gallery_workflow(
            model_type="Diffusion Model",
            filename="flux_unet.safetensors",
            clip_name="clip_l.safetensors",
            clip_type="flux",
            vae_name="ae.safetensors",
            prompt="anime girl",
            negative_prompt="",
            loras=loras,
        )
        self.assertEqual(graph["1043"]["inputs"]["lora_1"], {"on": True, "lora": "style\\anime.safetensors", "strength": 0.8})
        self.assertEqual(graph["1043"]["inputs"]["lora_2"], {"on": True, "lora": "concept\\lighting.safetensors", "strength": 0.6})

    def test_checkpoint_gallery_workflow_custom_vae_wires_vae_loader(self) -> None:
        graph = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            filename="sd15.safetensors",
            prompt="test prompt",
            vae_name="custom_vae.safetensors",
            is_modular=False,
        )
        self.assertEqual(graph["1"]["class_type"], "CheckpointLoaderSimple")
        self.assertIn("vae_loader", graph)
        self.assertEqual(graph["vae_loader"]["class_type"], "VAELoader")
        self.assertEqual(graph["vae_loader"]["inputs"]["vae_name"], "custom_vae.safetensors")
        self.assertEqual(graph["6"]["inputs"]["vae"], ["vae_loader", 0])

    def test_checkpoint_gallery_workflow_default_vae_wires_checkpoint_loader(self) -> None:
        graph = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            filename="sd15.safetensors",
            prompt="test prompt",
            is_modular=False,
        )
        self.assertEqual(graph["1"]["class_type"], "CheckpointLoaderSimple")
        self.assertNotIn("vae_loader", graph)
        self.assertEqual(graph["6"]["inputs"]["vae"], ["1", 2])

    def test_checkpoint_lora_workflow_custom_vae_wires_vae_loader(self) -> None:
        graph = self.client.build_lora_workflow(
            base_model_type="Checkpoint",
            base_filename="sd15.safetensors",
            lora_filename="style.safetensors",
            prompt="test prompt",
            vae_name="custom_vae.safetensors",
            is_modular=False,
        )
        self.assertEqual(graph["1"]["class_type"], "CheckpointLoaderSimple")
        self.assertIn("vae_loader", graph)
        self.assertEqual(graph["vae_loader"]["class_type"], "VAELoader")
        self.assertEqual(graph["vae_loader"]["inputs"]["vae_name"], "custom_vae.safetensors")
        self.assertEqual(graph["7"]["inputs"]["vae"], ["vae_loader", 0])

    def test_checkpoint_lora_workflow_default_vae_wires_checkpoint_loader(self) -> None:
        graph = self.client.build_lora_workflow(
            base_model_type="Checkpoint",
            base_filename="sd15.safetensors",
            lora_filename="style.safetensors",
            prompt="test prompt",
            is_modular=False,
        )
        self.assertEqual(graph["1"]["class_type"], "CheckpointLoaderSimple")
        self.assertNotIn("vae_loader", graph)
        self.assertEqual(graph["7"]["inputs"]["vae"], ["1", 2])

    def test_checkpoint_modular_workflow_by_category(self) -> None:
        graph = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            category="diffusion_models",
            filename="flux_unet.safetensors",
            clip_name="clip_l.safetensors",
            clip_type="flux",
            vae_name="ae.safetensors",
            prompt="test",
        )
        self.assertEqual(graph["618:615"]["inputs"]["unet_name"], "flux_unet.safetensors")
        self.assertEqual(graph["618:616"]["inputs"]["clip_name"], "clip_l.safetensors")
        self.assertEqual(graph["618:617"]["inputs"]["vae_name"], "ae.safetensors")

    def test_load_detailer_template_returns_valid_graph(self) -> None:
        tmpl = self.client.load_detailer_template()
        self.assertIsNotNone(tmpl)
        self.assertIn("679:654", tmpl)
        self.assertIn("679:659", tmpl)
        self.assertIn("679:660", tmpl)
        self.assertIn("679:661", tmpl)
        self.assertIn("679:662", tmpl)
        self.assertIn("679:665", tmpl)

    def test_attach_detailer_nodes_on_exported_workflow(self) -> None:
        base_graph = self.client.patch_workflow_template(self.template, prompt="portrait of a woman")
        graph_copy = json.loads(json.dumps(base_graph))
        detailed = self.client.attach_detailer_nodes(base_graph, seed=99999)

        # Base graph is not mutated
        self.assertEqual(base_graph, graph_copy)

        # Standalone loaders are omitted
        for redundant in ("681", "1027:615", "1027:616", "1027:617", "682", "683"):
            self.assertNotIn(redundant, detailed)

        # Required detailer nodes are attached
        for node_id in ("679:654", "679:659", "679:660", "679:661", "679:662", "679:665", "save_detailer_output"):
            self.assertIn(node_id, detailed)

        # 679:654 UltralyticsDetectorProvider
        self.assertEqual(detailed["679:654"]["class_type"], "UltralyticsDetectorProvider")
        self.assertEqual(detailed["679:654"]["inputs"]["model_name"], "bbox/yolov11l-face.pt")

        # 679:659 ToDetailerPipe inputs wiring
        pipe_inputs = detailed["679:659"]["inputs"]
        self.assertEqual(pipe_inputs["model"], ["1043", 0])
        self.assertEqual(pipe_inputs["vae"], ["618:617", 0])
        self.assertEqual(pipe_inputs["positive"], ["623", 0])
        self.assertEqual(pipe_inputs["negative"], ["700", 0])
        self.assertEqual(pipe_inputs["bbox_detector"], ["679:654", 0])

        # 679:660 FaceDetailerPipe inputs wiring
        face_inputs = detailed["679:660"]["inputs"]
        self.assertEqual(face_inputs["image"], ["1027", 0])
        self.assertEqual(face_inputs["detailer_pipe"], ["679:659", 0])
        self.assertEqual(face_inputs["seed"], ["679:665", 0])

        # 679:661 ImageAddNoise inputs wiring
        noise_inputs = detailed["679:661"]["inputs"]
        self.assertEqual(noise_inputs["image"], ["679:660", 0])
        self.assertEqual(noise_inputs["seed"], ["679:665", 0])
        self.assertEqual(noise_inputs["strength"], 0.02)

        # 679:662 Image Style Filter inputs wiring
        filter_inputs = detailed["679:662"]["inputs"]
        self.assertEqual(filter_inputs["image"], ["679:661", 0])
        self.assertEqual(filter_inputs["style"], "clarendon")

        # 679:665 SeedSelector inputs wiring
        seed_inputs = detailed["679:665"]["inputs"]
        self.assertEqual(seed_inputs["seed"], 99999)

        # save_detailer_output SaveImage
        save_inputs = detailed["save_detailer_output"]["inputs"]
        self.assertEqual(detailed["save_detailer_output"]["class_type"], "SaveImage")
        self.assertEqual(save_inputs["filename_prefix"], "detailer_studio")
        self.assertEqual(save_inputs["images"], ["679:662", 0])

    def test_attach_detailer_nodes_fallback_model_and_vae_and_prompts(self) -> None:
        custom_graph = {
            "unet": {"class_type": "UNETLoader", "inputs": {"unet_name": "model.safetensors"}},
            "vae": {"class_type": "VAELoader", "inputs": {"vae_name": "vae.safetensors"}},
            "pos": {"class_type": "CLIPTextEncode", "inputs": {"text": "nice face"}, "_meta": {"title": "Positive Prompt"}},
            "neg": {"class_type": "CLIPTextEncode", "inputs": {"text": "bad face"}, "_meta": {"title": "Negative Prompt"}},
            "decode": {"class_type": "VAEDecode", "inputs": {"samples": ["sampler", 0], "vae": ["vae", 0]}},
        }
        detailed = self.client.attach_detailer_nodes(custom_graph, seed=42)
        pipe_inputs = detailed["679:659"]["inputs"]
        self.assertEqual(pipe_inputs["model"], ["unet", 0])
        self.assertEqual(pipe_inputs["vae"], ["vae", 0])
        self.assertEqual(pipe_inputs["positive"], ["pos", 0])
        self.assertEqual(pipe_inputs["negative"], ["neg", 0])
        self.assertEqual(detailed["679:660"]["inputs"]["image"], ["decode", 0])
        self.assertEqual(detailed["679:665"]["inputs"]["seed"], 42)

    def test_attach_detailer_nodes_random_seed_generation(self) -> None:
        base_graph = self.client.patch_workflow_template(self.template, prompt="portrait")
        detailed = self.client.attach_detailer_nodes(base_graph, seed=None)
        det_seed = detailed["679:665"]["inputs"]["seed"]
        self.assertIsInstance(det_seed, int)
        self.assertGreaterEqual(det_seed, 0)
        self.assertLessEqual(det_seed, 2**32 - 1)

    def test_attach_detailer_missing_template_raises(self) -> None:
        client = ComfyClient()
        client.load_detailer_template = lambda: None  # type: ignore[method-assign]
        with self.assertRaises(ComfyClientError):
            client.attach_detailer_nodes({"1027": {"class_type": "VAEDecode"}})

    def test_patch_detailer_template_standalone(self) -> None:
        detailer_tmpl = self.client.load_detailer_template()
        self.assertIsNotNone(detailer_tmpl)
        original = json.loads(json.dumps(detailer_tmpl))
        patched = self.client.patch_detailer_template(
            detailer_tmpl,
            image="test_input.png",
            prompt="detailed face",
            negative_prompt="blurry face",
            seed=55555,
            steps=8,
            cfg=1.2,
            denoise=0.35,
            style="vintage",
            unet_name="custom_unet.safetensors",
            clip_name="custom_clip.safetensors",
            clip_type="custom_type",
            vae_name="custom_vae.safetensors",
        )
        self.assertEqual(detailer_tmpl, original)
        self.assertEqual(patched["681"]["inputs"]["image"], "test_input.png")
        self.assertEqual(patched["682"]["inputs"]["text"], "detailed face")
        self.assertEqual(patched["683"]["inputs"]["text"], "blurry face")
        self.assertEqual(patched["1027:615"]["inputs"]["unet_name"], "custom_unet.safetensors")
        self.assertEqual(patched["1027:616"]["inputs"]["clip_name"], "custom_clip.safetensors")
        self.assertEqual(patched["1027:616"]["inputs"]["type"], "custom_type")
        self.assertEqual(patched["1027:617"]["inputs"]["vae_name"], "custom_vae.safetensors")
        self.assertEqual(patched["679:660"]["inputs"]["steps"], 8)
        self.assertEqual(patched["679:660"]["inputs"]["cfg"], 1.2)
        self.assertEqual(patched["679:660"]["inputs"]["denoise"], 0.35)
        self.assertEqual(patched["679:662"]["inputs"]["style"], "vintage")
        self.assertEqual(patched["679:665"]["inputs"]["seed"], 55555)
        self.assertIn("save_detailer_output", patched)
        self.assertEqual(patched["save_detailer_output"]["inputs"]["filename_prefix"], "detailer_studio")

    def test_build_detailer_workflow_helper(self) -> None:
        graph = self.client.build_detailer_workflow(
            image="portrait.png",
            prompt="sharpen details",
            seed=777,
        )
        self.assertEqual(graph["681"]["inputs"]["image"], "portrait.png")
        self.assertEqual(graph["682"]["inputs"]["text"], "sharpen details")
        self.assertEqual(graph["679:665"]["inputs"]["seed"], 777)
        self.assertIn("save_detailer_output", graph)

    def test_patch_workflow_template_enable_detailer_flag(self) -> None:
        without_det = self.client.patch_workflow_template(self.template, prompt="test")
        self.assertNotIn("679:660", without_det)
        self.assertNotIn("save_detailer_output", without_det)

        with_det = self.client.patch_workflow_template(self.template, prompt="test", enable_detailer=True, seed=888)
        self.assertIn("679:660", with_det)
        self.assertIn("save_detailer_output", with_det)
        self.assertEqual(with_det["679:665"]["inputs"]["seed"], 888)
        self.assertIn("679:659", with_det)
        self.assertEqual(with_det["679:659"]["inputs"]["clip"], ["1043", 1])
        self.assertIn(with_det["679:659"]["inputs"]["clip"][0], with_det)

    def test_build_gallery_workflow_enable_detailer(self) -> None:
        # Modular workflow
        mod_graph = self.client.build_gallery_workflow(
            model_type="Diffusion Model",
            filename="flux_unet.safetensors",
            prompt="cyber woman",
            enable_detailer=True,
            seed=12345,
        )
        self.assertIn("679:660", mod_graph)
        self.assertIn("save_detailer_output", mod_graph)
        self.assertEqual(mod_graph["679:665"]["inputs"]["seed"], 12345)

        # Builtin checkpoint workflow
        ckpt_graph = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            filename="sd15.safetensors",
            prompt="cyber woman",
            is_modular=False,
            enable_detailer=True,
            seed=23456,
        )
        self.assertIn("679:660", ckpt_graph)
        self.assertIn("save_detailer_output", ckpt_graph)
        self.assertEqual(ckpt_graph["679:665"]["inputs"]["seed"], 23456)

        # Checkpoint with LoRAs
        lora_graph = self.client.build_gallery_workflow(
            model_type="Checkpoint",
            filename="sd15.safetensors",
            prompt="cyber woman",
            loras=[{"lora": "cyber.safetensors", "strength": 0.8, "on": True}],
            is_modular=False,
            enable_detailer=True,
            seed=34567,
        )
        self.assertIn("679:660", lora_graph)
        self.assertIn("save_detailer_output", lora_graph)
        self.assertEqual(lora_graph["679:665"]["inputs"]["seed"], 34567)

    def test_build_lora_workflow_enable_detailer(self) -> None:
        # Modular LoRA workflow
        mod_lora = self.client.build_lora_workflow(
            base_model_type="Diffusion Model",
            base_filename="flux_unet.safetensors",
            lora_filename="style.safetensors",
            prompt="portrait",
            enable_detailer=True,
            seed=45678,
        )
        self.assertIn("679:660", mod_lora)
        self.assertIn("save_detailer_output", mod_lora)
        self.assertEqual(mod_lora["679:665"]["inputs"]["seed"], 45678)

        # Builtin Checkpoint LoRA workflow
        ckpt_lora = self.client.build_lora_workflow(
            base_model_type="Checkpoint",
            base_filename="base.safetensors",
            lora_filename="style.safetensors",
            prompt="portrait",
            is_modular=False,
            enable_detailer=True,
            seed=56789,
        )
        self.assertIn("679:660", ckpt_lora)
        self.assertIn("save_detailer_output", ckpt_lora)
        self.assertEqual(ckpt_lora["679:665"]["inputs"]["seed"], 56789)


if __name__ == "__main__":
    unittest.main()
