"""Dynamic ComfyUI workflow loader / runner.

Load a workflow in ComfyUI API format (workflow_api.json) from a file or a
raw dict, patch standard nodes by *class_type* (never by hardcoded node id),
queue it, poll history until completion, and download the rendered images.

Self-contained: only depends on httpx + standard library.

    python comfy_workflow_runner.py                    # run the built-in demo
    python comfy_workflow_runner.py path/to/workflow_api.json \
        --prompt "a red fox in snow" --steps 30 --seed 7 --out ./out
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger("comfy_runner")

# --------------------------------------------------------------------------- #
# Types
# --------------------------------------------------------------------------- #

WorkflowDict = dict[str, dict[str, Any]]


@dataclass
class WorkflowOverrides:
    """Runtime parameters patched into the workflow before queueing.

    Any field left as None is simply not touched.
    """

    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    steps: Optional[int] = None
    cfg: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    checkpoint: Optional[str] = None
    # Extra raw per-node patches: {"5": {"sampler_name": "euler"}}
    node_patches: dict[str, dict[str, Any]] = field(default_factory=dict)


class WorkflowError(RuntimeError):
    """Raised for malformed workflows or missing target nodes."""


class ComfyExecutionError(RuntimeError):
    """Raised when ComfyUI reports an execution failure for the prompt."""


# --------------------------------------------------------------------------- #
# Node lookup helpers — patch by class_type, not numeric node id
# --------------------------------------------------------------------------- #


def find_nodes(workflow: WorkflowDict, class_type: str) -> list[str]:
    """Return the ids of every node whose class_type matches (exact)."""
    return sorted(
        node_id
        for node_id, node in workflow.items()
        if node.get("class_type") == class_type
    )


def find_first(workflow: WorkflowDict, class_type: str) -> str:
    """Return the first node id with the given class_type, or raise."""
    ids = find_nodes(workflow, class_type)
    if not ids:
        raise WorkflowError(f"Workflow has no node of class_type '{class_type}'")
    return ids[0]


def _set_input(node: dict[str, Any], key: str, value: Any) -> None:
    node.setdefault("inputs", {})[key] = value


def apply_overrides(workflow: WorkflowDict, overrides: WorkflowOverrides) -> WorkflowDict:
    """Patch standard nodes by their class_type and return the workflow.

    Standard nodes handled:
      - CLIPTextEncode            -> positive / negative prompt
      - KSampler                  -> seed, steps, cfg
      - EmptyLatentImage          -> width, height
      - CheckpointLoaderSimple    -> checkpoint name
      - EmptySD3LatentImage       -> width, height (FLUX-style graphs)

    Prompt sign detection: with a KSampler present, the node wired to its
    "positive" input is the positive prompt and the "negative" input is the
    negative one. Without a KSampler, nodes are patched in graph order.
    """
    workflow = json.loads(json.dumps(workflow))  # deep copy, don't mutate input

    # --- Prompt nodes (positive vs negative via KSampler wiring) ----------
    prompt_ids = find_nodes(workflow, "CLIPTextEncode")
    positive_id: Optional[str] = None
    negative_id: Optional[str] = None
    if overrides.prompt is not None or overrides.negative_prompt is not None:
        sampler_ids = find_nodes(workflow, "KSampler")
        if sampler_ids and prompt_ids:
            sampler = workflow[sampler_ids[0]]["inputs"]
            pos_ref = sampler.get("positive")  # e.g. ["2", 0]
            neg_ref = sampler.get("negative")
            positive_id = pos_ref[0] if isinstance(pos_ref, list) else None
            negative_id = neg_ref[0] if isinstance(neg_ref, list) else None
        if overrides.prompt is not None:
            target = positive_id or (prompt_ids[0] if prompt_ids else None)
            if target is None:
                raise WorkflowError("No CLIPTextEncode node found for prompt override")
            _set_input(workflow[target], "text", overrides.prompt)
        if overrides.negative_prompt is not None:
            remaining = [pid for pid in prompt_ids if pid != (positive_id or prompt_ids[0])]
            target = negative_id or (remaining[0] if remaining else None)
            if target is not None:
                _set_input(workflow[target], "text", overrides.negative_prompt)

    # --- Sampler -----------------------------------------------------------
    sampler_ids_found = find_nodes(workflow, "KSampler")
    if sampler_ids_found:
        sampler_node = workflow[sampler_ids_found[0]]
        if overrides.seed is not None:
            _set_input(sampler_node, "seed", overrides.seed)
        elif "seed" in sampler_node.get("inputs", {}):
            _set_input(sampler_node, "seed", random.randint(0, 2**32 - 1))
        if overrides.steps is not None:
            _set_input(sampler_node, "steps", overrides.steps)
        if overrides.cfg is not None:
            _set_input(sampler_node, "cfg", overrides.cfg)

    # --- Latent dimensions ---------------------------------------------------
    for latent_type in ("EmptyLatentImage", "EmptySD3LatentImage"):
        for node_id in find_nodes(workflow, latent_type):
            if overrides.width is not None:
                _set_input(workflow[node_id], "width", overrides.width)
            if overrides.height is not None:
                _set_input(workflow[node_id], "height", overrides.height)

    # --- Checkpoint ----------------------------------------------------------
    if overrides.checkpoint is not None:
        for node_id in find_nodes(workflow, "CheckpointLoaderSimple"):
            _set_input(workflow[node_id], "ckpt_name", overrides.checkpoint)

    # --- Raw per-node patches -------------------------------------------------
    for node_id, patch in overrides.node_patches.items():
        if node_id not in workflow:
            raise WorkflowError(f"node_patches: node '{node_id}' not in workflow")
        for key, value in patch.items():
            _set_input(workflow[node_id], key, value)

    return workflow


# --------------------------------------------------------------------------- #
# Runner
# --------------------------------------------------------------------------- #


@dataclass
class ComfyWorkflowRunner:
    """Load, patch, queue, and retrieve results from a ComfyUI server."""

    base_url: str = "http://127.0.0.1:8188"
    timeout: float = 600.0
    poll_interval: float = 1.0
    client: httpx.Client = field(default_factory=httpx.Client, init=False)

    def __post_init__(self) -> None:
        self.client = httpx.Client(base_url=self.base_url, timeout=30.0)

    # -- Loading -----------------------------------------------------------

    @staticmethod
    def load_workflow(source: str | Path | WorkflowDict) -> WorkflowDict:
        """Accept a file path (str/Path) or an already-parsed workflow dict."""
        if isinstance(source, dict):
            return json.loads(json.dumps(source))  # deep copy
        path = Path(source)
        if not path.is_file():
            raise WorkflowError(f"Workflow file not found: {path}")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise WorkflowError(f"Invalid JSON in {path}: {exc}") from exc
        if not isinstance(data, dict) or not data:
            raise WorkflowError(f"{path} is not a non-empty workflow object")
        return data

    # -- Execution -----------------------------------------------------------

    def run(
        self,
        source: str | Path | WorkflowDict,
        overrides: Optional[WorkflowOverrides] = None,
        download_dir: str | Path = "output",
        save_images: bool = True,
    ) -> list[Path]:
        """Queue the workflow and return local paths of the rendered images."""
        workflow = self.load_workflow(source)
        if overrides is not None:
            workflow = apply_overrides(workflow, overrides)

        prompt_id = self._queue(workflow)
        logger.info("Queued prompt_id=%s", prompt_id)
        history = self._wait_for_completion(prompt_id)
        images = self._extract_images(prompt_id, history)

        outputs: list[Path] = []
        out_dir = Path(download_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for image in images:
            blob = self._fetch_image(image)
            name = f"{prompt_id[:8]}_{uuid.uuid4().hex[:8]}_{image['filename']}"
            dest = out_dir / name
            dest.write_bytes(blob)
            logger.info("Saved %s (%d bytes)", dest, len(blob))
            outputs.append(dest)

        if not outputs:
            logger.warning("Execution finished but no images were produced")
        return outputs

    # -- HTTP steps -----------------------------------------------------------

    def _queue(self, workflow: WorkflowDict) -> str:
        client_id = str(uuid.uuid4())
        try:
            resp = self.client.post(
                "/prompt", json={"prompt": workflow, "client_id": client_id}
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ComfyExecutionError(f"Failed to queue workflow: {exc}") from exc
        prompt_id = resp.json().get("prompt_id")
        if not prompt_id:
            raise ComfyExecutionError(f"ComfyUI returned no prompt_id: {resp.text[:300]}")
        return str(prompt_id)

    def _wait_for_completion(self, prompt_id: str) -> dict[str, Any]:
        """Poll /history/{prompt_id} until the workflow finishes or times out."""
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            try:
                resp = self.client.get(f"/history/{prompt_id}")
                resp.raise_for_status()
                history: dict[str, Any] = resp.json().get(prompt_id, {})
            except httpx.HTTPError as exc:
                logger.warning("History poll failed, retrying: %s", exc)
                time.sleep(self.poll_interval)
                continue

            if history:
                status = history.get("status", {})
                if status.get("status_str") == "error":
                    raise ComfyExecutionError(
                        f"Execution failed: {json.dumps(status.get('messages', []))[:500]}"
                    )
                return history

            time.sleep(self.poll_interval)

        raise ComfyExecutionError(
            f"Timed out after {self.timeout:.0f}s waiting for prompt_id={prompt_id}"
        )

    def _extract_images(self, prompt_id: str, history: dict[str, Any]) -> list[dict[str, str]]:
        """Pull {"filename", "subfolder", "folder_type"} entries from history."""
        images: list[dict[str, str]] = []
        for node_output in history.get("outputs", {}).values():
            for image in node_output.get("images", []):
                if image.get("type") == "temp":
                    continue  # skip live-preview frames
                images.append(
                    {
                        "filename": image.get("filename", ""),
                        "subfolder": image.get("subfolder", ""),
                        "folder_type": image.get("type", "output"),
                    }
                )
        if not images:
            raise ComfyExecutionError(f"No output images found in history for {prompt_id}")
        return images

    def _fetch_image(self, image: dict[str, str]) -> bytes:
        resp = self.client.get(
            "/view",
            params={
                "filename": image["filename"],
                "subfolder": image["subfolder"],
                "type": image["folder_type"],
            },
        )
        resp.raise_for_status()
        return resp.content

    def close(self) -> None:
        self.client.close()


# --------------------------------------------------------------------------- #
# Demo
# --------------------------------------------------------------------------- #


def _demo_workflow() -> WorkflowDict:
    """Minimal txt2img graph used when no workflow file is supplied."""
    return {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
        "2": {"class_type": "CLIPTextEncode",
              "inputs": {"text": "placeholder positive", "clip": ["1", 0]}},
        "3": {"class_type": "CLIPTextEncode",
              "inputs": {"text": "placeholder negative", "clip": ["1", 0]}},
        "4": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "5": {"class_type": "KSampler",
              "inputs": {
                  "seed": 0, "steps": 25, "cfg": 7.0,
                  "sampler_name": "dpmpp_2m", "scheduler": "karras",
                  "denoise": 1.0,
                  "model": ["1", 0], "positive": ["2", 0],
                  "negative": ["3", 0], "latent_image": ["4", 0],
              }},
        "6": {"class_type": "VAEDecode",
              "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "comfy_runner", "images": ["6", 0]}},
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Run a ComfyUI workflow with runtime overrides")
    parser.add_argument("workflow", nargs="?", help="Path to workflow_api.json (omit for built-in demo)")
    parser.add_argument("--prompt", help="Override positive prompt")
    parser.add_argument("--negative", help="Override negative prompt")
    parser.add_argument("--seed", type=int, help="Override seed")
    parser.add_argument("--steps", type=int, help="Override steps")
    parser.add_argument("--cfg", type=float, help="Override CFG")
    parser.add_argument("--width", type=int, help="Override latent width")
    parser.add_argument("--height", type=int, help="Override latent height")
    parser.add_argument("--checkpoint", help="Override checkpoint filename")
    parser.add_argument("--out", default="output", help="Directory for downloaded images")
    parser.add_argument("--comfy", default="http://127.0.0.1:8188", help="ComfyUI base URL")
    args = parser.parse_args()

    overrides = WorkflowOverrides(
        prompt=args.prompt,
        negative_prompt=args.negative,
        seed=args.seed,
        steps=args.steps,
        cfg=args.cfg,
        width=args.width,
        height=args.height,
        checkpoint=args.checkpoint,
    )

    runner = ComfyWorkflowRunner(base_url=args.comfy)
    try:
        source = args.workflow if args.workflow else _demo_workflow()
        saved = runner.run(source, overrides, download_dir=args.out)
        print(f"\nDone — {len(saved)} image(s) saved:")
        for path in saved:
            print(f"  {path.resolve()}")
    except (WorkflowError, ComfyExecutionError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        runner.close()