"""Unit tests for image generation metadata extraction."""

import io
import unittest
from PIL import Image, PngImagePlugin

from app.services.image_metadata import (
    ExtractedMetadata,
    extract_image_metadata,
    tokenize_prompt_to_tags,
)


class TestImageMetadata(unittest.TestCase):
    def test_empty_bytes_returns_no_metadata(self):
        res = extract_image_metadata(b"")
        self.assertFalse(res.has_metadata)
        self.assertIsNone(res.prompt)

    def test_plain_image_returns_no_metadata(self):
        im = Image.new("RGB", (64, 64), color="red")
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        res = extract_image_metadata(buf.getvalue())
        self.assertFalse(res.has_metadata)
        self.assertIsNone(res.prompt)

    def test_a1111_parameters_chunk_extraction(self):
        im = Image.new("RGB", (100, 100))
        pnginfo = PngImagePlugin.PngInfo()
        raw_text = (
            "a cinematic cyberpunk female warrior, neon atmosphere\n"
            "Negative prompt: low quality, blurry, extra fingers\n"
            "Steps: 25, Sampler: Euler a, Schedule type: Karras, CFG scale: 7.5, Seed: 987654321, Size: 768x1344, Model: test_checkpoint"
        )
        pnginfo.add_text("parameters", raw_text)
        buf = io.BytesIO()
        im.save(buf, format="PNG", pnginfo=pnginfo)

        res = extract_image_metadata(buf.getvalue())
        self.assertTrue(res.has_metadata)
        self.assertEqual(res.source, "a1111")
        self.assertEqual(res.prompt, "a cinematic cyberpunk female warrior, neon atmosphere")
        self.assertEqual(res.negative_prompt, "low quality, blurry, extra fingers")
        self.assertEqual(res.steps, 25)
        self.assertEqual(res.cfg, 7.5)
        self.assertEqual(res.seed, 987654321)
        self.assertEqual(res.width, 768)
        self.assertEqual(res.height, 1344)
        self.assertEqual(res.sampler_name, "Euler a")
        self.assertEqual(res.scheduler, "Karras")
        self.assertEqual(res.model_name, "test_checkpoint")
        self.assertIn("a cinematic cyberpunk female warrior", res.tags)
        self.assertIn("neon atmosphere", res.tags)

    def test_comfyui_prompt_chunk_extraction(self):
        im = Image.new("RGB", (100, 100))
        pnginfo = PngImagePlugin.PngInfo()
        prompt_graph = {
            "10": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Positive Prompt"},
                "inputs": {"text": "serene mountain lake at dawn, mist, 8k"},
            },
            "11": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Negative Prompt"},
                "inputs": {"text": "ugly, blurry"},
            },
            "20": {
                "class_type": "KSampler",
                "inputs": {"seed": 123456, "steps": 20, "cfg": 8.0, "sampler_name": "dpmpp_2m", "scheduler": "karras"},
            },
            "30": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 1024, "height": 1024},
            },
        }
        import json
        pnginfo.add_text("prompt", json.dumps(prompt_graph))
        buf = io.BytesIO()
        im.save(buf, format="PNG", pnginfo=pnginfo)

        res = extract_image_metadata(buf.getvalue())
        self.assertTrue(res.has_metadata)
        self.assertEqual(res.source, "comfyui")
        self.assertEqual(res.prompt, "serene mountain lake at dawn, mist, 8k")
        self.assertEqual(res.negative_prompt, "ugly, blurry")
        self.assertEqual(res.seed, 123456)
        self.assertEqual(res.steps, 20)
        self.assertEqual(res.cfg, 8.0)
        self.assertEqual(res.sampler_name, "dpmpp_2m")
        self.assertEqual(res.scheduler, "karras")
        self.assertEqual(res.width, 1024)
        self.assertEqual(res.height, 1024)

    def _png_with_chunks(self, chunks):
        """Build PNG bytes carrying the given text chunks."""
        im = Image.new("RGB", (100, 100))
        pnginfo = PngImagePlugin.PngInfo()
        for key, value in chunks.items():
            pnginfo.add_text(key, value)
        buf = io.BytesIO()
        im.save(buf, format="PNG", pnginfo=pnginfo)
        return buf.getvalue()

    def test_a1111_composite_sampler_is_corrected_by_graph(self):
        """comfyui-image-saver writes f"{sampler}_{scheduler}" when it cannot map a
        sampler, producing e.g. "exponential/ddim_beta57". The lossless graph chunk
        must correct that pair without disturbing the rest of the A1111 result."""
        import json
        raw_text = (
            "a cinematic cyberpunk female warrior, neon atmosphere\n"
            "Negative prompt: low quality, blurry\n"
            "Steps: 25, Sampler: exponential/ddim_beta57, Schedule type: beta57, "
            "CFG scale: 7.5, Seed: 987654321, Size: 768x1344, Model: test_checkpoint"
        )
        prompt_graph = {
            "20": {
                "class_type": "ClownsharKSampler_Beta",
                "inputs": {
                    "seed": 987654321,
                    "steps": 25,
                    "cfg": 7.5,
                    "sampler_name": "exponential/ddim",
                    "scheduler": "beta57",
                },
            },
        }
        png_bytes = self._png_with_chunks({
            "parameters": raw_text,
            "prompt": json.dumps(prompt_graph),
        })

        res = extract_image_metadata(png_bytes)
        self.assertTrue(res.has_metadata)
        self.assertEqual(res.source, "a1111")
        self.assertEqual(res.sampler_name, "exponential/ddim")
        self.assertEqual(res.scheduler, "beta57")
        # The rest of the A1111 record is untouched, so model matching still works.
        self.assertEqual(
            res.prompt, "a cinematic cyberpunk female warrior, neon atmosphere"
        )
        self.assertEqual(res.negative_prompt, "low quality, blurry")
        self.assertEqual(res.model_name, "test_checkpoint")
        self.assertEqual(res.steps, 25)
        self.assertEqual(res.cfg, 7.5)
        self.assertEqual(res.seed, 987654321)
        self.assertEqual(res.width, 768)
        self.assertEqual(res.height, 1344)
        self.assertEqual(res.raw_parameters, raw_text)
        self.assertIn("neon atmosphere", res.tags)

    def test_a1111_sampler_survives_graph_without_sampler_node(self):
        """A graph that yields no sampler value must not blank the A1111 pair."""
        import json
        raw_text = (
            "a quiet forest\n"
            "Steps: 20, Sampler: Euler a, Schedule type: Karras, CFG scale: 7, "
            "Seed: 42, Size: 512x512, Model: test_checkpoint"
        )
        prompt_graph = {
            "10": {
                "class_type": "CLIPTextEncode",
                "_meta": {"title": "Positive Prompt"},
                "inputs": {"text": "a quiet forest"},
            },
        }
        png_bytes = self._png_with_chunks({
            "parameters": raw_text,
            "prompt": json.dumps(prompt_graph),
        })

        res = extract_image_metadata(png_bytes)
        self.assertTrue(res.has_metadata)
        self.assertEqual(res.source, "a1111")
        self.assertEqual(res.sampler_name, "Euler a")
        self.assertEqual(res.scheduler, "Karras")
        self.assertEqual(res.model_name, "test_checkpoint")

    def _assert_flat_sampler_wins(self, node_order):
        import json
        nodes = {
            "1056": {
                "class_type": "KSamplerAdvanced",
                "inputs": {
                    "noise_seed": 11,
                    "steps": 20,
                    "cfg": 7.0,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                },
            },
            "1059": {
                "class_type": "ClownsharKSampler_Beta",
                "inputs": {
                    "seed": 11,
                    "steps": 20,
                    "cfg": 7.0,
                    "sampler_name": "exponential/ddim",
                    "scheduler": "beta57",
                },
            },
        }
        prompt_graph = {nid: nodes[nid] for nid in node_order}
        png_bytes = self._png_with_chunks({"prompt": json.dumps(prompt_graph)})

        res = extract_image_metadata(png_bytes)
        self.assertTrue(res.has_metadata)
        self.assertEqual(res.source, "comfyui")
        self.assertEqual(res.sampler_name, "euler")
        self.assertEqual(res.scheduler, "normal")

    def test_comfyui_flat_sampler_beats_family_sampler_flat_first(self):
        """Both node classes run; the flat (KSampler*) vocabulary must win
        regardless of JSON key order."""
        self._assert_flat_sampler_wins(["1056", "1059"])

    def test_comfyui_flat_sampler_beats_family_sampler_family_first(self):
        self._assert_flat_sampler_wins(["1059", "1056"])

    def test_novelai_comment_chunk_extraction(self):
        im = Image.new("RGB", (100, 100))
        pnginfo = PngImagePlugin.PngInfo()
        import json
        comment_data = {
            "prompt": "masterpiece, 1girl, space background",
            "uc": "lowres, bad anatomy",
            "steps": 28,
            "scale": 6.5,
            "seed": 555666777,
        }
        pnginfo.add_text("Comment", json.dumps(comment_data))
        buf = io.BytesIO()
        im.save(buf, format="PNG", pnginfo=pnginfo)

        res = extract_image_metadata(buf.getvalue())
        self.assertTrue(res.has_metadata)
        self.assertEqual(res.source, "novelai")
        self.assertEqual(res.prompt, "masterpiece, 1girl, space background")
        self.assertEqual(res.negative_prompt, "lowres, bad anatomy")
        self.assertEqual(res.steps, 28)
        self.assertEqual(res.cfg, 6.5)
        self.assertEqual(res.seed, 555666777)

    def test_tokenize_prompt_to_tags(self):
        prompt = "(masterpiece:1.2), 1girl, [solo:0.8], blue_eyes, cinematic lighting"
        tags = tokenize_prompt_to_tags(prompt)
        self.assertIn("masterpiece", tags)
        self.assertIn("1girl", tags)
        self.assertIn("solo", tags)
        self.assertIn("blue eyes", tags)
        self.assertIn("cinematic lighting", tags)


if __name__ == "__main__":
    unittest.main()
