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

    async def clip_types(self) -> list[str]:
        """Return CLIPLoader architecture types advertised by ComfyUI."""
        async with self._http() as client:
            try:
                resp = await client.get("/object_info/CLIPLoader")
                await self._drain(resp)
                data = resp.json()
            except (httpx.HTTPError, ValueError, ComfyClientError) as exc:
                raise ComfyClientError(f"Could not list CLIP loader types: {exc}") from exc
        try:
            values = data["CLIPLoader"]["input"]["required"]["type"][0]
        except (KeyError, IndexError, TypeError):
            raise ComfyClientError("ComfyUI returned no CLIP loader types")
        if not isinstance(values, list) or not all(isinstance(item, str) and item for item in values):
            raise ComfyClientError("ComfyUI returned invalid CLIP loader types")
        return values

    async def resolve_clip_type(self, clip_type: str) -> str:
        """Validate a CLIPLoader type against ComfyUI's node metadata."""
        types = await self.clip_types()
        if clip_type not in types:
            raise ComfyClientError(f"CLIP type {clip_type} is not supported by ComfyUI")
        return clip_type

    # ------------------------------------------------------------------ #
    # Workflow graph
    # ------------------------------------------------------------------

    async def resolve_model_name(self, category: str, filename: str) -> str:
        """Map a normalized gallery filename to the exact name ComfyUI enumerates.

        ComfyUI lists subfolder models with OS separators ("sub\\model.safetensors"
        on Windows) and validates node inputs against that list verbatim, while
        gallery records store forward-slash paths, so translate before queueing.
        """
        wanted = filename.replace("\\", "/").lower()
        names = await self.list_models(category)
        for name in names:
            if name.replace("\\", "/").lower() == wanted:
                return name
        raise ComfyClientError(
            f"Model {filename} is not listed by ComfyUI under {category}"
        )

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
        image_count: int = 1,
        cfg: float = 1.0,
        denoise: float = 1.0,
        aspect_ratio: str = "1:1",
        style: str = "none",
        unet_name: str = "krea2\\krea2_turbo_fp8_scaled.safetensors",
        clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        clip_type: str = "krea2",
        vae_name: str = "wan_2.1_vae.safetensors",
        loras: Optional[list[dict[str, Any]]] = None,
        width: int = 768,
        height: int = 1344,
    ) -> dict[str, Any]:
        """Patch the exported Text-to-Image graph by its stable node IDs."""
        graph = json.loads(json.dumps(template))
        unet_ids = [node_id for node_id, node in graph.items() if node.get("class_type") == "UNETLoader"]
        clip_ids = [node_id for node_id, node in graph.items() if node.get("class_type") == "CLIPLoader"]
        if len(unet_ids) != 1 or len(clip_ids) != 1:
            raise ComfyClientError("Workflow must contain exactly one UNETLoader and one CLIPLoader")
        unet_id, clip_id = unet_ids[0], clip_ids[0]
        required = {
            "621": "prompt",
            "700": "negative_prompt",
            unet_id: "unet_name",
            clip_id: "clip_name/type",
            "618:617": "vae_name",
            "867": "seed",
            "897": "value",
            "903": "width/height/batch_size",
            "1028": "stage-1 sampler",
            "1029": "stage-2 sampler",
            "1043": "Power Lora Loader (rgthree)",
            "1025:1": "Image Saver Simple",
            "1025:2": "Image Saver Metadata",
            "1025:1022": "GetImageSize",
        }
        for node_id, field in required.items():
            if node_id not in graph or not isinstance(graph[node_id], dict):
                raise ComfyClientError(f"Workflow is missing required node {node_id} ({field})")
            if not isinstance(graph[node_id].get("inputs"), dict):
                raise ComfyClientError(f"Workflow node {node_id} has no inputs")
        if graph["1043"].get("class_type") != "Power Lora Loader (rgthree)":
            raise ComfyClientError("Workflow node 1043 is not Power Lora Loader (rgthree)")
        if graph["1025:1"].get("class_type") != "Image Saver Simple":
            raise ComfyClientError("Workflow node 1025:1 is not Image Saver Simple")
        if graph["1025:2"].get("class_type") != "Image Saver Metadata":
            raise ComfyClientError("Workflow node 1025:2 is not Image Saver Metadata")
        if graph["1025:1022"].get("class_type") != "GetImageSize":
            raise ComfyClientError("Workflow node 1025:1022 is not GetImageSize")

        final_seed = seed if seed is not None else random.randint(0, 2**32 - 1)
        graph["621"]["inputs"]["prompt"] = prompt
        graph["700"]["inputs"]["text"] = negative_prompt
        graph[unet_id]["inputs"]["unet_name"] = unet_name
        graph[clip_id]["inputs"]["clip_name"] = clip_name
        graph[clip_id]["inputs"]["type"] = clip_type
        graph["618:617"]["inputs"]["vae_name"] = vae_name
        graph["867"]["inputs"]["seed"] = final_seed
        graph["1028"]["inputs"]["noise_seed"] = final_seed
        graph["1028"]["inputs"]["cfg"] = cfg
        graph["1029"]["inputs"]["cfg"] = cfg
        graph["1029"]["inputs"]["denoise"] = denoise
        graph["897"]["inputs"]["value"] = steps
        graph["903"]["inputs"]["width"] = width
        graph["903"]["inputs"]["height"] = height
        graph["903"]["inputs"]["batch_size"] = image_count

        metadata_inputs = graph["1025:2"]["inputs"]
        metadata_inputs["modelname"] = unet_name
        metadata_inputs["positive"] = prompt
        metadata_inputs["negative"] = negative_prompt
        metadata_inputs["seed_value"] = final_seed
        metadata_inputs["steps"] = steps
        metadata_inputs["cfg"] = cfg
        metadata_inputs["denoise"] = denoise
        metadata_inputs["sampler_name"] = graph["1029"]["inputs"].get("sampler_name", "")
        metadata_inputs["scheduler_name"] = graph["1029"]["inputs"].get("scheduler", "")

        lora_inputs = graph["1043"]["inputs"]
        for key in list(lora_inputs):
            if key.lower().startswith("lora_"):
                del lora_inputs[key]
        for index, selection in enumerate(loras or [], start=1):
            lora_inputs[f"lora_{index}"] = {
                "on": bool(selection.get("on", True)),
                "lora": str(selection["lora"]),
                "strength": float(selection.get("strength", 1.0)),
            }
        return graph

    def build_workflow(
        self,
        *,
        prompt: str,
        negative_prompt: str = "",
        model: str = "sdxl",
        seed: Optional[int] = None,
        steps: int = 10,
        image_count: int = 1,
        cfg: float = 1.0,
        denoise: float = 1.0,
        aspect_ratio: str = "1:1",
        style: str = "none",
        unet_name: str = "krea2\\krea2_turbo_fp8_scaled.safetensors",
        clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        clip_type: str = "krea2",
        vae_name: str = "wan_2.1_vae.safetensors",
        loras: Optional[list[dict[str, Any]]] = None,
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
                image_count=image_count,
                cfg=cfg,
                denoise=denoise,
                aspect_ratio=aspect_ratio,
                style=style,
                unet_name=unet_name,
                clip_name=clip_name,
                clip_type=clip_type,
                vae_name=vae_name,
                loras=loras,
                width=width,
                height=height,
            )
        if loras:
            raise ComfyClientError("LoRAs require the exported Power Lora Loader workflow")
        return self._build_builtin_workflow(
            prompt=prompt,
            negative_prompt=negative_prompt,
            model=model,
            seed=seed,
            steps=steps,
            image_count=image_count,
            cfg=cfg,
            denoise=denoise,
            aspect_ratio=aspect_ratio,
            style=style,
            width=width,
            height=height,
        )

    def build_gallery_workflow(
        self,
        *,
        model_type: str,
        filename: str,
        prompt: str,
        negative_prompt: str = "",
        clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        clip_type: str = "krea2",
        vae_name: str = "wan_2.1_vae.safetensors",
        seed: Optional[int] = None,
        steps: int = 10,
        image_count: int = 1,
        cfg: float = 1.0,
        denoise: float = 1.0,
        width: int = 768,
        height: int = 1344,
        loras: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        if model_type == "Checkpoint":
            if loras:
                active_loras = [item for item in loras if item.get("on", True)]
                if active_loras:
                    return self._build_builtin_lora_workflow(
                        prompt=prompt,
                        negative_prompt=negative_prompt,
                        seed=seed,
                        steps=steps,
                        image_count=image_count,
                        cfg=cfg,
                        denoise=denoise,
                        width=width,
                        height=height,
                        checkpoint_name=filename,
                        lora_name=active_loras[0]["lora"],
                        loras=active_loras,
                    )
            return self._build_builtin_workflow(
                prompt=prompt,
                negative_prompt=negative_prompt,
                seed=seed,
                steps=steps,
                image_count=image_count,
                cfg=cfg,
                denoise=denoise,
                width=width,
                height=height,
                checkpoint_name=filename,
                clip_name=clip_name,
                clip_type=clip_type,
            )
        if model_type == "Diffusion Model":
            template = self.load_workflow_template()
            if template is None:
                raise ComfyClientError("Diffusion Model gallery records require the exported workflow")
            return self.patch_workflow_template(
                template,
                prompt=prompt,
                negative_prompt=negative_prompt,
                seed=seed,
                steps=steps,
                image_count=image_count,
                cfg=cfg,
                denoise=denoise,
                unet_name=filename,
                clip_name=clip_name,
                clip_type=clip_type,
                vae_name=vae_name,
                loras=loras or [],
                width=width,
                height=height,
            )
        raise ComfyClientError("Unsupported gallery model type")

    def build_lora_workflow(
        self,
        *,
        base_model_type: str,
        base_filename: str,
        lora_filename: str,
        prompt: str,
        negative_prompt: str = "",
        clip_name: str = "",
        clip_type: str = "",
        vae_name: str = "",
        seed: Optional[int] = None,
        steps: int = 10,
        image_count: int = 1,
        cfg: float = 1.0,
        denoise: float = 1.0,
        width: int = 768,
        height: int = 1344,
        loras: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        active_loras = loras if loras is not None else [{"lora": lora_filename, "on": True, "strength": 1.0}]
        if base_model_type == "Diffusion Model":
            template = self.load_workflow_template()
            if template is None:
                raise ComfyClientError("Diffusion Model gallery records require the exported workflow")
            return self.patch_workflow_template(
                template,
                prompt=prompt,
                negative_prompt=negative_prompt,
                seed=seed,
                steps=steps,
                image_count=image_count,
                cfg=cfg,
                denoise=denoise,
                unet_name=base_filename,
                clip_name=clip_name,
                clip_type=clip_type,
                vae_name=vae_name,
                loras=active_loras,
                width=width,
                height=height,
            )
        if base_model_type != "Checkpoint":
            raise ComfyClientError("LoRA bases must be Checkpoint or Diffusion Model gallery files")
        return self._build_builtin_lora_workflow(
            prompt=prompt,
            negative_prompt=negative_prompt,
            seed=seed,
            steps=steps,
            image_count=image_count,
            cfg=cfg,
            denoise=denoise,
            width=width,
            height=height,
            checkpoint_name=base_filename,
            lora_name=lora_filename,
            loras=active_loras,
        )

    def _build_builtin_lora_workflow(
        self,
        *,
        prompt: str,
        negative_prompt: str = "",
        seed: Optional[int] = None,
        steps: int = 25,
        image_count: int = 1,
        cfg: float = 7.0,
        denoise: float = 1.0,
        width: int = 768,
        height: int = 1344,
        checkpoint_name: str,
        lora_name: str = "",
        loras: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        final_seed = seed if seed is not None else random.randint(0, 2**32 - 1)
        active_loras = [item for item in (loras or []) if item.get("on", True)]
        if not active_loras and lora_name:
            active_loras = [{"lora": lora_name, "strength": 1.0}]

        graph: dict[str, Any] = {
            "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": checkpoint_name}},
        }

        last_model_ref = ["1", 0]
        last_clip_ref = ["1", 1]

        if active_loras:
            for idx, item in enumerate(active_loras, start=1):
                node_id = f"lora_{idx}" if len(active_loras) > 1 else "2"
                strength = float(item.get("strength", 1.0))
                graph[node_id] = {
                    "class_type": "LoraLoader",
                    "inputs": {
                        "model": last_model_ref,
                        "clip": last_clip_ref,
                        "lora_name": item["lora"],
                        "strength_model": strength,
                        "strength_clip": strength,
                    },
                }
                last_model_ref = [node_id, 0]
                last_clip_ref = [node_id, 1]
        else:
            node_id = "2"
            graph[node_id] = {
                "class_type": "LoraLoader",
                "inputs": {
                    "model": ["1", 0],
                    "clip": ["1", 1],
                    "lora_name": lora_name or "none",
                    "strength_model": 1.0,
                    "strength_clip": 1.0,
                },
            }
            last_model_ref = [node_id, 0]
            last_clip_ref = [node_id, 1]

        graph.update({
            "3": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": last_clip_ref}},
            "4": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_prompt or "worst quality, low quality, blurry", "clip": last_clip_ref}},
            "5": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": image_count}},
            "6": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": final_seed,
                    "steps": steps,
                    "cfg": cfg,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": denoise,
                    "model": last_model_ref,
                    "positive": ["3", 0],
                    "negative": ["4", 0],
                    "latent_image": ["5", 0],
                },
            },
            "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
            "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "comfy_studio", "images": ["7", 0]}},
        })
        return graph

    def _build_builtin_workflow(
        self,
        *,
        prompt: str,
        negative_prompt: str = "",
        model: str = "sdxl",
        seed: Optional[int] = None,
        steps: int = 25,
        image_count: int = 1,
        cfg: float = 7.0,
        denoise: float = 1.0,
        aspect_ratio: str = "1:1",
        style: str = "none",
        width: int = 768,
        height: int = 1344,
        checkpoint_name: str | None = None,
        clip_name: str = "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        clip_type: str = "krea2",
    ) -> dict[str, Any]:
        preset = MODEL_PRESETS.get(model, MODEL_PRESETS["sdxl"])
        checkpoint = checkpoint_name or preset["checkpoint"]
        suffix = STYLE_SUFFIXES.get(style, "")
        full_prompt = f"{prompt}, {suffix}" if suffix else prompt
        final_seed = seed if seed is not None else random.randint(0, 2**32 - 1)

        graph: dict[str, Any] = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": checkpoint},
            },
            "8": {
                "class_type": "CLIPLoader",
                "inputs": {"clip_name": clip_name, "type": clip_type, "device": "default"},
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": full_prompt, "clip": ["8", 0]},
            },
            "3": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": negative_prompt or "worst quality, low quality, blurry", "clip": ["8", 0]},
            },
            "4": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": image_count}},
            "5": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": final_seed,
                    "steps": steps or preset["steps"],
                    "cfg": cfg if cfg is not None else preset["cfg"],
                    "sampler_name": preset["sampler"],
                    "scheduler": preset["scheduler"],
                    "denoise": denoise,
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

    async def upload_image(self, data: bytes, filename: str, content_type: str = "image/png") -> str:
        """Upload an input image through ComfyUI and return its safe server filename."""
        safe_name = Path(filename).name or "input.png"
        async with self._http() as client:
            try:
                resp = await client.post(
                    "/upload/image",
                    files={"image": (safe_name, data, content_type)},
                    data={"overwrite": "false"},
                )
                await self._drain(resp)
                result = resp.json()
            except (httpx.HTTPError, ValueError, ComfyClientError) as exc:
                raise ComfyClientError(f"Could not upload image to ComfyUI: {exc}") from exc
        uploaded = result.get("name")
        if not isinstance(uploaded, str) or not uploaded or Path(uploaded).name != uploaded:
            raise ComfyClientError("ComfyUI returned an invalid uploaded image name")
        return uploaded

    async def queue_prompt(self, graph: dict[str, Any], client_id: str) -> str:
        """POST an API-format workflow to ComfyUI and return its prompt ID."""
        payload = {"prompt": graph, "client_id": client_id}
        async with self._http() as client:
            try:
                resp = await client.post("/prompt", json=payload)
                await self._drain(resp)
                data: dict[str, Any] = resp.json()
            except (httpx.HTTPError, ValueError, ComfyClientError) as exc:
                raise ComfyClientError(f"Could not queue workflow in ComfyUI: {exc}") from exc
        prompt_id = data.get("prompt_id")
        if not isinstance(prompt_id, str) or not prompt_id:
            raise ComfyClientError(f"ComfyUI did not return a prompt_id: {data}")
        return prompt_id

    async def get_history(self, prompt_id: str) -> dict[str, Any]:
        async with self._http() as client:
            resp = await client.get(f"/history/{prompt_id}")
            await self._drain(resp)
            history: dict[str, Any] = resp.json()
        return history.get(prompt_id, {})

    async def list_output_files(self, prompt_id: str, expected_kind: str = "image") -> list[dict[str, str]]:
        """Return allowlisted persisted image/video descriptors from Comfy history."""
        history = await self.get_history(prompt_id)
        outputs = history.get("outputs", {})
        allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"} if expected_kind == "image" else {".mp4", ".webm", ".mov"}
        files: list[dict[str, str]] = []
        for node_output in outputs.values():
            for collection in ("images", "gifs", "videos", "animated"):
                for item in node_output.get(collection, []):
                    filename = item.get("filename", "")
                    if item.get("type") == "temp" or Path(filename).suffix.lower() not in allowed:
                        continue
                    files.append({"filename": filename, "subfolder": item.get("subfolder", ""), "folder_type": item.get("type", "output")})
        return files

    async def list_images(self, prompt_id: str) -> list[dict[str, str]]:
        return await self.list_output_files(prompt_id, "image")

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