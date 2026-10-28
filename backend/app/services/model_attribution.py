"""Map a ComfyUI API-format graph's model inputs back to installed Solo vault files."""

MODEL_INPUT_CATEGORIES: dict[str, str] = {
    "ckpt_name": "checkpoints",
    "unet_name": "diffusion_models",
    "lora_name": "loras",
    "vae_name": "vae",
    "clip_name": "text_encoders",
    "clip_name1": "text_encoders",
    "clip_name2": "text_encoders",
    "clip_name3": "text_encoders",
    "control_net_name": "controlnet",
    "style_model_name": "style_models",
}


def _normalize(filename: str) -> str:
    return filename.replace("\\", "/").strip().lower()


def build_index(model_service) -> dict[tuple[str, str], dict]:
    """(category, normalized filename) -> installed model file descriptor."""
    return {
        (entry["category"], _normalize(entry["filename"])): entry
        for entry in model_service.selectable_gallery_files()
    }


def attribute_graph(
    workflow: dict, index: dict[tuple[str, str], dict]
) -> tuple[dict, list[dict]]:
    """Return (base_model_fields, loras) for the graph's literal model inputs."""
    base_fields: dict = {}
    loras: list[dict] = []
    for node_id in sorted(workflow):
        node = workflow[node_id]
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for input_name, value in inputs.items():
            category = MODEL_INPUT_CATEGORIES.get(input_name)
            if category is None or isinstance(value, list) or not isinstance(value, str):
                continue
            if not value:
                continue
            match = index.get((category, _normalize(value)))
            if match is None:
                continue
            if input_name == "lora_name":
                strength = inputs.get("strength_model")
                loras.append(
                    {
                        "lora_name": match["filename"],
                        "lora_model_id": match["model_id"],
                        "lora_version_id": match["version_id"],
                        "strength": float(strength)
                        if isinstance(strength, (int, float))
                        else 1.0,
                    }
                )
            elif input_name in ("ckpt_name", "unet_name") and not base_fields:
                base_fields = {
                    "model_id": match["model_id"],
                    "version_id": match["version_id"],
                    "file_id": match["file_id"],
                    "model_title": match["title"],
                    "model_type": match["model_type"],
                    "model_filename": match["filename"],
                    "model_category": match["category"],
                }
    return base_fields, loras
