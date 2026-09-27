"""AI Tool Studio workflow parsing, catalog, execution preparation, and storage."""

from __future__ import annotations

import copy
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..config import Settings, get_settings
from ..schemas import ToolAspectRatio, ToolDetail, ToolMode, ToolParseResponse, ToolSummary

Workflow = dict[str, dict[str, Any]]
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
TOOL_ID_RE = re.compile(r"^[0-9a-f]{32}$")
MAX_NODES = 2_000
MAX_INPUTS_PER_NODE = 100
MAX_VALUE_DEPTH = 12
MAX_STRING_LENGTH = 50_000
ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
    "4:3": (1152, 864),
    "21:9": (1536, 656),
}
INFRASTRUCTURE_MARKERS = (
    "loader", "checkpoint", "lora", "controlnet", "ipadapter", "upscalemodel",
    "unet", "vae", "clipvision", "encoder", "randomnoise",
)
LOCKED_EXECUTION_MARKERS = ("sampler", "ksampler", "scheduler", "noise")
TEXT_CLASSES = {"cliptextencode", "cliptextencodeflux", "cliptextencodecontrolnet"}


class AIToolError(RuntimeError):
    """Raised when an AI Tool workflow or input is invalid."""


class AIToolNotFound(AIToolError):
    """Raised when a requested stored tool does not exist."""


def _copy(value: Any) -> Any:
    return copy.deepcopy(value)


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _label(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("_", " ").strip()).title()


def _is_infrastructure(class_type: str) -> bool:
    normalized = _norm(class_type)
    return any(marker in normalized for marker in INFRASTRUCTURE_MARKERS)


def _validate_json_value(value: Any, depth: int = 0) -> None:
    if depth > MAX_VALUE_DEPTH:
        raise AIToolError("Workflow value nesting is too deep")
    if isinstance(value, str):
        if len(value) > MAX_STRING_LENGTH:
            raise AIToolError("Workflow text value is too long")
    elif isinstance(value, (list, tuple)):
        for item in value:
            _validate_json_value(item, depth + 1)
    elif isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 256:
                raise AIToolError("Workflow input key is invalid")
            _validate_json_value(item, depth + 1)
    elif value is not None and not isinstance(value, (bool, int, float)):
        raise AIToolError("Workflow contains an unsupported value")


def _prompt_roles(workflow: Workflow) -> dict[str, str]:
    roles: dict[str, str] = {}
    for node in workflow.values():
        if "sampler" not in _norm(str(node.get("class_type", ""))):
            continue
        for key, role in (("positive", "Positive"), ("negative", "Negative")):
            ref = node.get("inputs", {}).get(key)
            if isinstance(ref, list) and ref and isinstance(ref[0], str):
                roles.setdefault(ref[0], role)
    return roles


def extract_controls(workflow: Workflow) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    controls: list[dict[str, Any]] = []
    locked: list[dict[str, str]] = []
    seen: set[str] = set()
    roles = _prompt_roles(workflow)

    def add(node_id: str, node: dict[str, Any], input_name: str, *, kind: str, label: str, numeric: bool = False, seed: bool = False, minimum: float | None = None, maximum: float | None = None, step: float | None = None) -> None:
        path = f"nodes.{node_id}.inputs.{input_name}"
        raw = node.get("inputs", {}).get(input_name)
        if path in seen or isinstance(raw, list):
            return
        options: list[Any] = []
        current = raw
        if isinstance(raw, dict):
            current = raw.get("default", raw.get("value"))
            options = raw.get("options", raw.get("values", []))
            if not isinstance(options, list):
                options = []
        controls.append({"id": path, "path": path, "label": label, "kind": kind, "value": current, "numeric": numeric, "seed": seed, "options": options, "minimum": minimum, "maximum": maximum, "step": step, "node_id": node_id, "input_name": input_name})
        seen.add(path)

    for node_id in sorted(workflow):
        node = workflow[node_id]
        class_type = str(node.get("class_type", ""))
        inputs = node["inputs"]
        normalized = _norm(class_type)
        if _is_infrastructure(class_type):
            locked.append({"id": node_id, "class_type": class_type})
            continue
        if any(marker in normalized for marker in LOCKED_EXECUTION_MARKERS):
            continue
        if normalized in TEXT_CLASSES or "cliptextencode" in normalized or "prompttext" in normalized:
            for input_name in ("text", "prompt"):
                if isinstance(inputs.get(input_name), str):
                    role = roles.get(node_id)
                    add(node_id, node, input_name, kind="prompt", label=f"{role} prompt" if role else "Prompt")
                    break
        if "seed" in normalized and isinstance(inputs.get("seed"), int):
            add(node_id, node, "seed", kind="seed", label="Seed", numeric=True, seed=True, minimum=-1, maximum=2**32 - 1, step=1)
        elif "int" in normalized and isinstance(inputs.get("value"), (int, float)):
            add(node_id, node, "value", kind="number", label="Value", numeric=True, minimum=1, maximum=100, step=1)
        if any(token in normalized for token in ("string", "text", "prompt")):
            for input_name, value in inputs.items():
                if input_name.lower() in {"text", "prompt", "value", "string"} and isinstance(value, str):
                    add(node_id, node, input_name, kind="prompt", label=f"{roles[node_id]} prompt" if node_id in roles else _label(input_name))
        if "emptylatent" in normalized and isinstance(inputs.get("width"), (int, float)) and isinstance(inputs.get("height"), (int, float)):
            add(node_id, node, "width", kind="number", label="Width", numeric=True, minimum=64, maximum=4096, step=8)
            add(node_id, node, "height", kind="number", label="Height", numeric=True, minimum=64, maximum=4096, step=8)
    if not controls:
        raise AIToolError("Workflow contains no supported editable controls")
    return controls, locked


class AIToolService:
    """Owns immutable tool definitions and private output files."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self.root = Path(self.settings.TOOLS_DIR).resolve()
        self.definitions = self.root / "definitions"
        self.outputs = self.root / "outputs"
        self.definitions.mkdir(parents=True, exist_ok=True)
        self.outputs.mkdir(parents=True, exist_ok=True)

    def _thumbnail_path(self, tool_id: str, filename: str = "thumbnail.png") -> Path:
        if not TOOL_ID_RE.fullmatch(tool_id) or Path(filename).name != filename:
            raise AIToolNotFound("Invalid tool thumbnail path")
        path = (self.root / "thumbnails" / tool_id / filename).resolve()
        try:
            path.relative_to(self.root.resolve())
        except ValueError as exc:
            raise AIToolNotFound("Invalid tool thumbnail path") from exc
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def thumbnail_path(self, tool_id: str) -> Path:
        record = self.get(tool_id)
        filename = record.get("thumbnail")
        if not isinstance(filename, str):
            raise AIToolNotFound("Tool thumbnail not found")
        path = self._thumbnail_path(tool_id, filename)
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise AIToolNotFound("Tool thumbnail not found")
        return path

    def thumbnail_url(self, tool_id: str, record: dict[str, Any] | None = None) -> str | None:
        record = record or self.get(tool_id)
        filename = record.get("thumbnail")
        if not isinstance(filename, str):
            return None
        return f"{self.settings.FILES_PUBLIC_BASE}/api/tools/{tool_id}/thumbnail"

    def _path(self, tool_id: str) -> Path:
        if not TOOL_ID_RE.fullmatch(tool_id):
            raise AIToolNotFound("Invalid tool id")
        return self.definitions / f"{tool_id}.json"

    def _write_record(self, record: dict[str, Any]) -> None:
        path = self._path(record["tool_id"])
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(path)

    @staticmethod
    def _safe_controls(workflow: Workflow) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
        locked = [
            {"id": node_id, "class_type": str(node.get("class_type", ""))}
            for node_id, node in sorted(workflow.items())
            if _is_infrastructure(str(node.get("class_type", "")))
        ]
        return [], locked

    def parse(self, payload: bytes, name: str = "Untitled tool", *, require_controls: bool = True) -> ToolParseResponse:
        try:
            workflow = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AIToolError("Workflow must be valid UTF-8 JSON") from exc
        if not isinstance(workflow, dict) or not workflow:
            raise AIToolError("Workflow must be a non-empty API-format object")
        if len(workflow) > MAX_NODES:
            raise AIToolError("Workflow contains too many nodes")
        for node_id, node in workflow.items():
            if not isinstance(node_id, str) or not node or len(node_id) > 128:
                raise AIToolError("Workflow node id is invalid")
            if not isinstance(node, dict) or not isinstance(node.get("class_type"), str) or not isinstance(node.get("inputs"), dict):
                raise AIToolError("Workflow nodes must contain class_type and inputs objects")
            if len(node["inputs"]) > MAX_INPUTS_PER_NODE:
                raise AIToolError("Workflow node has too many inputs")
            _validate_json_value(node)
        controls, locked = extract_controls(workflow) if require_controls else self._safe_controls(workflow)
        tool_id = uuid.uuid4().hex
        clean_name = re.sub(r"\s+", " ", name.strip())[:120] or "Untitled tool"
        record = {"tool_id": tool_id, "name": clean_name, "created_at": datetime.now(timezone.utc).isoformat(), "workflow": _copy(workflow), "controls": controls, "locked_nodes": locked}
        self._write_record(record)
        return ToolParseResponse(tool_id=tool_id, name=clean_name, controls=controls, locked_nodes=locked)

    @staticmethod
    def _find_prompt_binding(workflow: Workflow) -> dict[str, str] | None:
        for node_id in sorted(workflow):
            node = workflow[node_id]
            normalized = _norm(str(node.get("class_type", "")))
            if ("cliptextencode" in normalized or "prompt" in normalized) and isinstance(node["inputs"].get("text"), str):
                return {"node_id": node_id, "input_name": "text"}
        return None

    @staticmethod
    def _find_image_binding(workflow: Workflow) -> dict[str, str] | None:
        for node_id in sorted(workflow):
            node = workflow[node_id]
            if "loadimage" in _norm(str(node.get("class_type", ""))) and isinstance(node["inputs"].get("image"), str):
                return {"node_id": node_id, "input_name": "image"}
        return None

    @staticmethod
    def _find_dimension_bindings(workflow: Workflow) -> dict[str, str]:
        """Find an optional server-controlled latent/video size target."""
        for node_id in sorted(workflow):
            node = workflow[node_id]
            normalized = _norm(str(node.get("class_type", "")))
            inputs = node["inputs"]
            if (
                "latent" in normalized
                and "width" in inputs
                and "height" in inputs
                and isinstance(inputs["width"], (int, float))
                and isinstance(inputs["height"], (int, float))
            ):
                return {"node_id": node_id, "width": "width", "height": "height"}
        return {}

    def create(
        self,
        payload: bytes,
        name: str,
        mode: ToolMode,
        aspect_ratio: ToolAspectRatio,
        thumbnail_data: bytes | None = None,
        thumbnail_ext: str | None = None,
    ) -> ToolSummary:
        parsed = self.parse(payload, name, require_controls=False)
        record = self.get(parsed.tool_id)
        workflow = record["workflow"]
        prompt_binding = self._find_prompt_binding(workflow)
        image_binding = self._find_image_binding(workflow)
        dimension_bindings = self._find_dimension_bindings(workflow)
        requires_image = mode in {ToolMode.IMAGE_TO_IMAGE, ToolMode.IMAGE_TO_VIDEO}
        if requires_image and image_binding is None:
            raise AIToolError("Image-based tools require a LoadImage input node")
        # Image-conditioned graphs may derive dimensions from the reference image.
        # A latent size node is patched only when the uploaded graph provides one.
        thumbnail_name = None
        if thumbnail_data is not None:
            if thumbnail_ext not in IMAGE_EXTENSIONS:
                raise AIToolError("Unsupported thumbnail image type")
            thumbnail_name = f"thumbnail{thumbnail_ext}"
            thumbnail_path = self._thumbnail_path(parsed.tool_id, thumbnail_name)
            temp = thumbnail_path.with_suffix(".tmp")
            try:
                temp.write_bytes(thumbnail_data)
                temp.replace(thumbnail_path)
            except OSError as exc:
                raise AIToolError("Could not save tool thumbnail") from exc
        record.update({"mode": mode.value, "default_aspect_ratio": aspect_ratio.value, "supported_aspect_ratios": list(ASPECT_DIMENSIONS), "prompt_binding": prompt_binding, "image_binding": image_binding if requires_image else None, "dimension_bindings": dimension_bindings, "requires_image": requires_image, "output_kind": "video" if mode in {ToolMode.TEXT_TO_VIDEO, ToolMode.IMAGE_TO_VIDEO} else "image", "thumbnail": thumbnail_name})
        self._write_record(record)
        return self._summary(record)

    def inject(self, tool_id: str, values: dict[str, Any]) -> dict[str, Any]:
        """Compatibility path for the legacy parser endpoint.

        New Tool Studio runs use ``build_graph`` and never accept arbitrary paths.
        """
        record = self.get(tool_id)
        controls = {control["path"]: control for control in record.get("controls", [])}
        graph = _copy(record["workflow"])
        for path, value in values.items():
            control = controls.get(path)
            if control is None:
                raise AIToolError(f"Unknown or locked control: {path}")
            if isinstance(value, bool) or not isinstance(value, (str, int, float)):
                raise AIToolError(f"Invalid value for {path}")
            minimum = control.get("minimum")
            maximum = control.get("maximum")
            if minimum is not None and value < minimum:
                raise AIToolError(f"Value below minimum for {path}")
            if maximum is not None and value > maximum:
                raise AIToolError(f"Value above maximum for {path}")
        if control.get("numeric"):
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise AIToolError(f"Value must be numeric for {path}")
            if isinstance(value, float) and not value.is_integer():
                raise AIToolError(f"Value must be an integer for {path}")
            step = control.get("step")
            if step == 8 and int(value) % 8:
                raise AIToolError(f"Value must be divisible by 8 for {path}")
        node_id = control["node_id"]
        input_name = control["input_name"]
        graph[node_id]["inputs"][input_name] = value
        return graph

    def get(self, tool_id: str) -> dict[str, Any]:
        path = self._path(tool_id)
        if not path.is_file():
            raise AIToolNotFound("Tool not found")
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise AIToolError("Stored tool is unreadable") from exc
        if record.get("tool_id") != tool_id or not isinstance(record.get("workflow"), dict):
            raise AIToolError("Stored tool is invalid")
        return record

    def _summary(self, record: dict[str, Any]) -> ToolSummary:
        return ToolSummary(tool_id=record["tool_id"], name=record["name"], mode=record["mode"], default_aspect_ratio=record["default_aspect_ratio"], requires_image=bool(record.get("requires_image")), has_prompt=record.get("prompt_binding") is not None, created_at=record["created_at"], thumbnail_url=self.thumbnail_url(record["tool_id"], record))

    def list_public(self) -> list[ToolSummary]:
        items: list[ToolSummary] = []
        for path in self.definitions.glob("*.json"):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
                if record.get("mode") and record.get("default_aspect_ratio"):
                    items.append(self._summary(record))
            except (OSError, json.JSONDecodeError, KeyError, ValueError):
                continue
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def detail(self, tool_id: str) -> ToolDetail:
        record = self.get(tool_id)
        return ToolDetail(**self._summary(record).model_dump(), supported_aspect_ratios=record.get("supported_aspect_ratios", list(ASPECT_DIMENSIONS)), output_kind=record.get("output_kind", "image"))

    def build_graph(self, tool_id: str, prompt: str, aspect_ratio: ToolAspectRatio, image_filename: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
        record = self.get(tool_id)
        if bool(record.get("requires_image")) != bool(image_filename):
            raise AIToolError("Input image does not match this tool mode")
        graph = _copy(record["workflow"])
        binding = record.get("prompt_binding")
        if binding:
            graph[binding["node_id"]]["inputs"][binding["input_name"]] = prompt
        image_binding = record.get("image_binding")
        if image_binding and image_filename:
            graph[image_binding["node_id"]]["inputs"][image_binding["input_name"]] = image_filename
        dimensions = ASPECT_DIMENSIONS.get(aspect_ratio.value)
        if not dimensions:
            raise AIToolError("Unsupported aspect ratio")
        dimension = record.get("dimension_bindings") or {}
        if dimension:
            node_inputs = graph[dimension["node_id"]]["inputs"]
            node_inputs[dimension["width"]], node_inputs[dimension["height"]] = dimensions
        return graph, {"width": dimensions[0], "height": dimensions[1], "seed": None}

    async def save_output(self, data: bytes, tool_id: str, prompt_id: str, filename: str, metadata: dict[str, Any]) -> str:
        suffix = Path(filename).suffix.lower()
        if suffix not in IMAGE_EXTENSIONS:
            raise AIToolError("Tool output is not an approved image type")
        safe_prompt = re.sub(r"[^a-zA-Z0-9_-]", "", prompt_id)[:80] or "result"
        dest_dir = self.outputs / tool_id / safe_prompt
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{uuid.uuid4().hex[:12]}{suffix}"
        dest.write_bytes(data)
        dest.with_suffix(dest.suffix + ".json").write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
        relative = dest.relative_to(self.outputs).as_posix()
        return f"{self.settings.FILES_PUBLIC_BASE}/api/tools/{tool_id}/files/{relative}"

    def output_path(self, tool_id: str, relative_path: str) -> Path:
        if not TOOL_ID_RE.fullmatch(tool_id):
            raise AIToolNotFound("Invalid tool id")
        root = (self.outputs / tool_id).resolve()
        path = (root / relative_path).resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise AIToolNotFound("Invalid tool output path") from exc
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise AIToolNotFound("Tool output not found")
        return path


def get_ai_tool_service() -> AIToolService:
    return AIToolService()


__all__ = ["AIToolError", "AIToolNotFound", "AIToolService", "ASPECT_DIMENSIONS", "extract_controls", "get_ai_tool_service"]
