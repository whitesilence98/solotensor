"""Async HTTP + WebSocket client for a headless ComfyUI instance.

Queues API-format workflows, streams execution progress, and fetches the
generated images from /history and /view.
"""

import asyncio
import json
import logging
import random
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, Optional

import httpx
import websockets

from ..config import Settings, get_settings

logger = logging.getLogger(__name__)

STYLE_SUFFIXES: dict[str, str] = {
    "none": "",
    "photoreal": "photorealistic, ultra detailed, 8k, professional photography, natural lighting",
    "anime": "anime style, cel shaded, vibrant colors, studio ghibli inspired, clean lineart",
    "cinematic": "cinematic film still, dramatic lighting, shallow depth of field, color graded, 35mm",
    "3d_render": "3d render, octane render, subsurface scattering, studio lighting, high detail",
    "concept_art": "concept art, digital painting, artstation trending, dramatic composition",
}

# Model key -> (checkpoint filename in ComfyUI models/checkpoints, sampler settings)
MODEL_PRESETS: dict[str, dict[str, Any]] = {
    "sdxl": {
        "checkpoint": "sd_xl_base_1.0.safetensors",
        "sampler": "dpmpp_2m",
        "scheduler": "karras",
        "steps": 30,
        "cfg": 7.0,
    },
    "flux": {
        "checkpoint": "flux1-dev.safetensors",
        "sampler": "euler",
        "scheduler": "simple",
        "steps": 20,
        "cfg": 3.5,
    },
    "nano": {
        "checkpoint": "nano_banana_pro.safetensors",
        "sampler": "dpmpp_sde",
        "scheduler": "karras",
        "steps": 25,
        "cfg": 6.0,
    },
}


class ComfyClientError(RuntimeError):
    """Raised when ComfyUI is unreachable or a workflow fails."""


class ComfyClient:
    """Talks to ComfyUI over its native HTTP + WebSocket API."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()

    # ------------------------------------------------------------------ #
    # Low-level helpers
    # ------------------------------------------------------------------ #

    def _http(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.settings.comfy_http, timeout=30.0)

    @staticmethod
    async def _drain(resp: httpx.Response) -> None:
        await resp.aread()
        if resp.status_code >= 400:
            raise ComfyClientError(f"ComfyUI returned HTTP {resp.status_code}: {resp.text[:300]}")

    async def ping(self) -> bool:
        """Check whether ComfyUI is reachable."""
        try:
            async with self._http() as client:
                resp = await client.get("/system_stats")
                return resp.status_code == 200
        except (httpx.HTTPError, OSError):
            return False

    async def list_models(self, category: str) -> list[str]:
        """Return model filenames from an allowlisted ComfyUI category."""
        async with self._http() as client:
            try:
                resp = await client.get(f"/models/{category}")
                await self._drain(resp)
                data = resp.json()
            except (httpx.HTTPError, ValueError, ComfyClientError) as exc:
                raise ComfyClientError(f"Could not list ComfyUI models ({category}): {exc}") from exc
        if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
            raise ComfyClientError(f"ComfyUI returned an invalid model list for {category}")
        return data

    # ------------------------------------------------------------------ #
    # Workflow graph
    # ------------------------------------------------------------------ #

    def load_workflow_template(self) -> Optional[dict[str, Any]]:
        """Load workflows/workflow_api.json if present (exported from the ComfyUI UI).

        When a template exists it is used for every generation, patched by
        class_type/node lookup; the built-in txt2img graph is only a fallback.
        """
        path = Path(__file__).resolve().parents[2] / "workflows" / "workflow_api.json"
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) and data else None
        except (OSError, json.JSONDecodeError):
            return None

    def patch_workflow_template(
        self,
        template: dict[str, Any],
        *,
        prompt: str,
        negative_prompt: str = "",
        seed: Optional[int] = None,
        steps: int = 10,
        cfg: float = 1.0,
        aspect_ratio: str = "1:1",
        style: str = "none",
        unet_name: str = "krea2\\krea2_turbo_fp8_scaled.safetensors",
        clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        vae_name: str = "wan_2.1_vae.safetensors",
        width: int = 768,
        height: int = 1344,
    ) -> dict[str, Any]:
        """Patch the exported Text-to-Image graph by its stable node IDs."""
        graph = json.loads(json.dumps(template))
        required = {
            "621": "prompt",
            "618:615": "unet_name",
            "618:616": "clip_name",
            "618:617": "vae_name",
            "867": "seed",
            "897": "value",
            "903": "width/height",
        }
        for node_id, field in required.items():
            if node_id not in graph or not isinstance(graph[node_id], dict):
                raise ComfyClientError(f"Workflow is missing required node {node_id} ({field})")
            if not isinstance(graph[node_id].get("inputs"), dict):
                raise ComfyClientError(f"Workflow node {node_id} has no inputs")

        final_seed = seed if seed is not None else random.randint(0, 2**32 - 1)
        graph["621"]["inputs"]["prompt"] = prompt
        graph["618:615"]["inputs"]["unet_name"] = unet_name
        graph["618:616"]["inputs"]["clip_name"] = clip_name
        graph["618:617"]["inputs"]["vae_name"] = vae_name
        graph["867"]["inputs"]["seed"] = final_seed
        graph["897"]["inputs"]["value"] = steps
        graph["903"]["inputs"]["width"] = width
        graph["903"]["inputs"]["height"] = height
        return graph

    def build_workflow(
        self,
        *,
        prompt: str,
        negative_prompt: str = "",
        model: str = "sdxl",
        seed: Optional[int] = None,
        steps: int = 10,
        cfg: float = 1.0,
        aspect_ratio: str = "1:1",
        style: str = "none",
        unet_name: str = "krea2\\krea2_turbo_fp8_scaled.safetensors",
        clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        vae_name: str = "wan_2.1_vae.safetensors",
        width: int = 768,
        height: int = 1344,
    ) -> dict[str, Any]:
        """Build the exported Text-to-Image workflow."""
        template = self.load_workflow_template()
        if template is not None:
            return self.patch_workflow_template(
                template,
                prompt=prompt,
                negative_prompt=negative_prompt,
                seed=seed,
                steps=steps,
                cfg=cfg,
                aspect_ratio=aspect_ratio,
                style=style,
                unet_name=unet_name,
                clip_name=clip_name,
                vae_name=vae_name,
                width=width,
                height=height,
            )
        return self._build_builtin_workflow(
            prompt=prompt,
            negative_prompt=negative_prompt,
            model=model,
            seed=seed,
            steps=steps,
            cfg=cfg,
            aspect_ratio=aspect_ratio,
            style=style,
            width=width,
            height=height,
        )

    def _build_builtin_workflow(
        self,
        *,
        prompt: str,
        negative_prompt: str = "",
        model: str = "sdxl",
        seed: Optional[int] = None,
        steps: int = 25,
        cfg: float = 7.0,
        aspect_ratio: str = "1:1",
        style: str = "none",
        width: int = 768,
        height: int = 1344,
    ) -> dict[str, Any]:
        preset = MODEL_PRESETS.get(model, MODEL_PRESETS["sdxl"])
        suffix = STYLE_SUFFIXES.get(style, "")
        full_prompt = f"{prompt}, {suffix}" if suffix else prompt
        final_seed = seed if seed is not None else random.randint(0, 2**32 - 1)

        graph: dict[str, Any] = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": preset["checkpoint"]},
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": full_prompt, "clip": ["1", 0]},
            },
            "3": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": negative_prompt or "worst quality, low quality, blurry", "clip": ["1", 0]},
            },
            "4": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
            "5": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": final_seed,
                    "steps": steps or preset["steps"],
                    "cfg": cfg if cfg is not None else preset["cfg"],
                    "sampler_name": preset["sampler"],
                    "scheduler": preset["scheduler"],
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "latent_image": ["4", 0],
                },
            },
            "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
            "7": {
                "class_type": "SaveImage",
                "inputs": {"filename_prefix": "comfy_studio", "images": ["6", 0]},
            },
        }
        return graph

    # ------------------------------------------------------------------ #
    # Queue / history / fetch
    # ------------------------------------------------------------------ #

    async def queue_prompt(self, graph: dict[str, Any], client_id: str) -> str:
        """POST the workflow to /prompt and return the assigned prompt_id."""
        payload = {"prompt": graph, "client_id": client_id}
        async with self._http() as client:
            resp = await client.post("/prompt", json=payload)
            await self._drain(resp)
            data: dict[str, Any] = resp.json()
        prompt_id = data.get("prompt_id")
        if not prompt_id:
            raise ComfyClientError(f"ComfyUI did not return a prompt_id: {data}")
        return str(prompt_id)

    async def get_history(self, prompt_id: str) -> dict[str, Any]:
        async with self._http() as client:
            resp = await client.get(f"/history/{prompt_id}")
            await self._drain(resp)
            history: dict[str, Any] = resp.json()
        return history.get(prompt_id, {})

    async def list_images(self, prompt_id: str) -> list[dict[str, str]]:
        """Return {"filename", "subfolder", "folder_type"} for each output image."""
        history = await self.get_history(prompt_id)
        outputs = history.get("outputs", {})
        images: list[dict[str, str]] = []
        for node_output in outputs.values():
            for img in node_output.get("images", []):
                if img.get("type") == "temp":
                    continue
                images.append(
                    {
                        "filename": img.get("filename", ""),
                        "subfolder": img.get("subfolder", ""),
                        "folder_type": img.get("type", "output"),
                    }
                )
        return images

    async def fetch_image_bytes(self, image: dict[str, str]) -> bytes:
        """Download one output image via GET /view."""
        params = {
            "filename": image["filename"],
            "subfolder": image["subfolder"],
            "type": image.get("folder_type", "output"),
        }
        async with self._http() as client:
            resp = await client.get("/view", params=params)
            await self._drain(resp)
            return resp.content

    # ------------------------------------------------------------------ #
    # WebSocket progress stream
    # ------------------------------------------------------------------ #

    async def stream_progress(
        self, prompt_id: str, client_id: str
    ) -> AsyncIterator[dict[str, Any]]:
        """Connect to ComfyUI's /ws and yield normalized progress events for prompt_id.

        Terminates with a {"type": "completed"} or {"type": "error"} event.
        """
        url = f"{self.settings.comfy_ws}/ws?clientId={client_id}"
        try:
            async with websockets.connect(url, max_size=64 * 1024 * 1024) as ws:
                deadline = asyncio.get_running_loop().time() + self.settings.COMFY_TIMEOUT
                while True:
                    remaining = deadline - asyncio.get_running_loop().time()
                    if remaining <= 0:
                        yield {"type": "error", "message": "Generation timed out"}
                        return
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 30.0))
                    except (asyncio.TimeoutError, TimeoutError):
                        continue
                    except websockets.ConnectionClosed:
                        break

                    # Binary frames are previews — ignore them for progress purposes.
                    if isinstance(raw, (bytes, bytearray)):
                        continue

                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    mtype = msg.get("type")
                    data = msg.get("data", {}) or {}

                    if data.get("prompt_id") not in (None, prompt_id):
                        continue

                    if mtype == "progress":
                        yield {
                            "type": "progress",
                            "node": data.get("node"),
                            "value": data.get("value"),
                            "max": data.get("max"),
                        }
                    elif mtype == "executing":
                        node = data.get("node")
                        if node is None:  # None node => this prompt finished executing
                            yield {"type": "completed"}
                            return
                        yield {"type": "executing", "node": node}
                    elif mtype == "execution_error":
                        yield {
                            "type": "error",
                            "node": data.get("node_id"),
                            "message": data.get("exception_message", "Execution error"),
                        }
                        return
                    elif mtype == "execution_success":
                        yield {"type": "completed"}
                        return
        except (websockets.WebSocketException, OSError, asyncio.TimeoutError) as exc:
            logger.warning("ComfyUI websocket error: %s", exc)
            yield {"type": "error", "message": f"Lost connection to ComfyUI: {exc}"}

    async def wait_until_done(self, prompt_id: str, client_id: str) -> str:
        """Consume the progress stream and return the final status ("completed"/"failed"/"timeout")."""
        async for event in self.stream_progress(prompt_id, client_id):
            if event["type"] == "error":
                return "failed"
            if event["type"] == "completed":
                return "completed"
        return "timeout"


def get_comfy_client() -> ComfyClient:
    return ComfyClient()