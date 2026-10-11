"""Tagger service executing WD14 Tagger workflow via ComfyUI."""

import json
import logging
import uuid
from pathlib import Path
from typing import Any, Optional

from .comfy_client import ComfyClient, ComfyClientError
from .storage import StorageService

logger = logging.getLogger(__name__)

WORKFLOW_PATH = (
    Path(__file__).resolve().parent.parent.parent / "workflows" / "workflow_get_tags.json"
)


class TaggerError(RuntimeError):
    """Raised when tagger workflow execution fails."""


class TaggerService:
    def __init__(
        self,
        comfy: Optional[ComfyClient] = None,
        storage: Optional[StorageService] = None,
    ) -> None:
        self.comfy = comfy or ComfyClient()
        self.storage = storage or StorageService()

    def load_workflow(self) -> dict[str, Any]:
        if not WORKFLOW_PATH.is_file():
            raise TaggerError(f"Workflow file not found: {WORKFLOW_PATH}")
        try:
            return json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise TaggerError(f"Could not load tagger workflow: {exc}") from exc

    @staticmethod
    def clean_tags(raw_text: str | list[str]) -> list[str]:
        """Normalize comma-separated Danbooru/WD tags into clean lowercase strings."""
        if isinstance(raw_text, list):
            joined = ",".join(str(item) for item in raw_text)
        elif isinstance(raw_text, str):
            joined = raw_text
        else:
            return []

        cleaned: list[str] = []
        seen: set[str] = set()

        for chunk in joined.split(","):
            tag = chunk.strip().replace("_", " ").lower()
            if tag and tag not in seen:
                seen.add(tag)
                cleaned.append(tag)

        return cleaned

    async def interrogate_image(
        self, image_bytes: bytes, filename: str = "interrogate.png"
    ) -> list[str]:
        """Upload image to ComfyUI, run workflow_get_tags.json, and return detected tags."""
        if not image_bytes:
            raise TaggerError("Image payload is empty")

        safe_name = f"tagger_{uuid.uuid4().hex[:8]}_{Path(filename).name or 'input.png'}"
        try:
            uploaded_name = await self.comfy.upload_image(image_bytes, safe_name)
        except ComfyClientError as exc:
            raise TaggerError(f"Failed to upload image to ComfyUI: {exc}") from exc

        graph = self.load_workflow()
        if "1" not in graph or not isinstance(graph["1"], dict):
            raise TaggerError("Tagger workflow missing LoadImage node '1'")

        graph["1"].setdefault("inputs", {})["image"] = uploaded_name

        client_id = f"tagger-{uuid.uuid4().hex}"
        try:
            prompt_id = await self.comfy.queue_prompt(graph, client_id)
        except ComfyClientError as exc:
            raise TaggerError(f"Failed to queue tagger workflow: {exc}") from exc

        # Stream progress until completion
        try:
            async for event in self.comfy.stream_progress(prompt_id, client_id):
                if event.get("type") == "error":
                    raise TaggerError(event.get("message", "Tagger workflow execution failed"))
                if event.get("type") == "completed":
                    break
        except ComfyClientError as exc:
            raise TaggerError(f"ComfyUI execution error: {exc}") from exc

        # Retrieve outputs from history
        try:
            history = await self.comfy.get_history(prompt_id)
        except ComfyClientError as exc:
            raise TaggerError(f"Could not retrieve history from ComfyUI: {exc}") from exc

        outputs = history.get("outputs", {})
        raw_output: Any = None

        # Prefer Node 29 (ShowText), then Node 23 (WD14Tagger)
        if "29" in outputs:
            raw_output = outputs["29"].get("text")
        elif "23" in outputs:
            raw_output = outputs["23"].get("tags") or outputs["23"].get("text")
        else:
            # Fallback: inspect any node output containing text or tags
            for node_out in outputs.values():
                if isinstance(node_out, dict):
                    if "text" in node_out:
                        raw_output = node_out["text"]
                        break
                    if "tags" in node_out:
                        raw_output = node_out["tags"]
                        break

        if not raw_output:
            logger.warning("No tag output found in ComfyUI execution history for %s", prompt_id)
            return []

        return self.clean_tags(raw_output)

    async def auto_tag_asset(self, key: str) -> list[str]:
        """Load asset from local storage, interrogate via ComfyUI, and update its sidecar."""
        asset = self.storage.get_asset(key)
        path = (self.storage.root / key).resolve()
        if not path.is_file():
            raise TaggerError(f"Asset file not found on disk: {key}")

        image_bytes = path.read_bytes()
        tags = await self.interrogate_image(image_bytes, filename=path.name)
        self.storage.update_tags(key, tags)
        return tags


_tagger_instance: Optional[TaggerService] = None


def get_tagger_service() -> TaggerService:
    global _tagger_instance
    if _tagger_instance is None:
        _tagger_instance = TaggerService()
    return _tagger_instance
