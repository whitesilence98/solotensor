"""Model Type Handler & Compatibility Factory.

Implements the Factory Pattern to manage SoloTensor's 16 model types,
their functional tiers, ComfyUI folder destinations, and compatibility rules.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, ClassVar


class ModelTier(str, Enum):
    """The 6 functional tiers of generative diffusion assets."""

    CORE_BASE = "Core Base"
    ADAPTER = "Adapter"
    AUTOENCODER = "Autoencoder"
    GUIDANCE = "Guidance"
    INVERSION = "Inversion"
    PROMPT_ASSET = "Prompt Asset"


class BaseModelHandler(ABC):
    """Abstract base handler defining the contract for a model type."""

    model_type: ClassVar[str]
    tier: ClassVar[ModelTier]
    install_category: ClassVar[str]
    allowed_extensions: ClassVar[set[str]] = {
        ".safetensors",
        ".sft",
        ".ckpt",
        ".pt",
        ".pth",
        ".bin",
        ".gguf",
    }
    supports_generation: ClassVar[bool] = False
    requires_base_association: ClassVar[bool] = False
    supports_vae_decoder: ClassVar[bool] = False
    supports_text_encoder: ClassVar[bool] = False
    candidate_categories: ClassVar[tuple[str, ...]] = ()

    def validate_compatibility(self, compatibility: dict[str, Any]) -> None:
        """Validate model-specific compatibility rules."""
        if self.requires_base_association:
            base_ids = tuple(
                compatibility.get(key)
                for key in ("base_model_id", "base_version_id", "base_file_id")
            )
            has_any = any(value is not None for value in base_ids)
            has_all = all(value is not None for value in base_ids)
            if has_any and not has_all:
                raise ValueError(
                    f"{self.model_type} requires base_model_id, base_version_id, and base_file_id together"
                )

    def sanitize_compatibility(self, compatibility: dict[str, Any]) -> dict[str, Any]:
        """Normalize compatibility fields according to tier requirements."""
        data = dict(compatibility)
        if not self.supports_vae_decoder:
            data["vae"] = None
        if not self.supports_text_encoder:
            data["text_encoder"] = None
            data["clip_type"] = None
        return data


# ----------------------------------------------------------------------
# Concrete Model Handlers by Tier
# ----------------------------------------------------------------------


class CheckpointModelHandler(BaseModelHandler):
    """Core Base Checkpoint model handler.

    Supports dual folder resolution across both monolithic checkpoints
    ('checkpoints') and modular UNET/DiT models ('diffusion_models').
    """

    model_type = "Checkpoint"
    tier = ModelTier.CORE_BASE
    install_category = "checkpoints"
    candidate_categories: ClassVar[tuple[str, ...]] = ("checkpoints", "diffusion_models")
    supports_generation = True
    supports_vae_decoder = True
    supports_text_encoder = True


class SVDModelHandler(BaseModelHandler):
    model_type = "SVD"
    tier = ModelTier.CORE_BASE
    install_category = "checkpoints"
    supports_generation = True
    supports_vae_decoder = True
    supports_text_encoder = True


class LoraModelHandler(BaseModelHandler):
    model_type = "LoRA"
    tier = ModelTier.ADAPTER
    install_category = "loras"
    supports_generation = True
    requires_base_association = True
    allowed_extensions = {".safetensors", ".sft"}


class LoKrModelHandler(BaseModelHandler):
    model_type = "LoKr"
    tier = ModelTier.ADAPTER
    install_category = "loras"
    supports_generation = True
    requires_base_association = True
    allowed_extensions = {".safetensors", ".sft"}


class LoConModelHandler(BaseModelHandler):
    model_type = "LoCon"
    tier = ModelTier.ADAPTER
    install_category = "loras"
    supports_generation = True
    requires_base_association = True
    allowed_extensions = {".safetensors", ".sft"}


class LycorisModelHandler(BaseModelHandler):
    model_type = "LyCORIS"
    tier = ModelTier.ADAPTER
    install_category = "loras"
    supports_generation = True
    requires_base_association = True
    allowed_extensions = {".safetensors", ".sft"}


class DoraModelHandler(BaseModelHandler):
    model_type = "DoRA"
    tier = ModelTier.ADAPTER
    install_category = "loras"
    supports_generation = True
    requires_base_association = True
    allowed_extensions = {".safetensors", ".sft"}


class MotionLoraModelHandler(BaseModelHandler):
    model_type = "Motion LoRA"
    tier = ModelTier.ADAPTER
    install_category = "loras"
    supports_generation = True
    requires_base_association = True
    allowed_extensions = {".safetensors", ".sft"}


class VaeModelHandler(BaseModelHandler):
    model_type = "VAE"
    tier = ModelTier.AUTOENCODER
    install_category = "vae"
    allowed_extensions = {".safetensors", ".sft", ".pt"}
    # VAE itself does NOT need a separate VAE decoder or text encoder
    supports_vae_decoder = False
    supports_text_encoder = False


class ControlNetModelHandler(BaseModelHandler):
    model_type = "ControlNet"
    tier = ModelTier.GUIDANCE
    install_category = "controlnet"
    allowed_extensions = {".safetensors", ".pth", ".bin"}


class PosesModelHandler(BaseModelHandler):
    model_type = "Poses"
    tier = ModelTier.GUIDANCE
    install_category = "poses"
    allowed_extensions = {".safetensors", ".json", ".png"}


class StyleModelHandler(BaseModelHandler):
    model_type = "StyleModel"
    tier = ModelTier.GUIDANCE
    install_category = "style_models"
    allowed_extensions = {".safetensors", ".bin"}


class EmbeddingModelHandler(BaseModelHandler):
    model_type = "Embedding"
    tier = ModelTier.INVERSION
    install_category = "embeddings"
    allowed_extensions = {".safetensors", ".pt", ".bin"}


class AestheticGradientModelHandler(BaseModelHandler):
    model_type = "Aesthetic Gradient"
    tier = ModelTier.INVERSION
    install_category = "embeddings"
    allowed_extensions = {".safetensors", ".pt", ".bin"}


class HyperNetworkModelHandler(BaseModelHandler):
    model_type = "Hyper Network"
    tier = ModelTier.INVERSION
    install_category = "hypernetworks"
    allowed_extensions = {".safetensors", ".pt"}


class WildcardsModelHandler(BaseModelHandler):
    model_type = "Wildcards"
    tier = ModelTier.PROMPT_ASSET
    install_category = "wildcards"
    allowed_extensions = {".txt", ".yaml", ".json"}


# Legacy fallbacks for historical records
class LegacyDiffusionModelHandler(BaseModelHandler):
    model_type = "Diffusion Model"
    tier = ModelTier.CORE_BASE
    install_category = "diffusion_models"
    candidate_categories: ClassVar[tuple[str, ...]] = ("diffusion_models", "checkpoints")
    supports_generation = True
    supports_vae_decoder = True
    supports_text_encoder = True


# ----------------------------------------------------------------------
# Model Handler Factory
# ----------------------------------------------------------------------


class ModelHandlerFactory:
    """Factory creating and querying handlers for all 16 model types."""

    _HANDLERS: ClassVar[dict[str, type[BaseModelHandler]]] = {
        "Checkpoint": CheckpointModelHandler,
        "SVD": SVDModelHandler,
        "LoRA": LoraModelHandler,
        "LoKr": LoKrModelHandler,
        "LoCon": LoConModelHandler,
        "LyCORIS": LycorisModelHandler,
        "DoRA": DoraModelHandler,
        "Motion LoRA": MotionLoraModelHandler,
        "VAE": VaeModelHandler,
        "ControlNet": ControlNetModelHandler,
        "Poses": PosesModelHandler,
        "StyleModel": StyleModelHandler,
        "Embedding": EmbeddingModelHandler,
        "Aesthetic Gradient": AestheticGradientModelHandler,
        "Hyper Network": HyperNetworkModelHandler,
        "Wildcards": WildcardsModelHandler,
        # Legacy
        "Diffusion Model": LegacyDiffusionModelHandler,
        "UNET": LegacyDiffusionModelHandler,
    }

    _INSTANCES: ClassVar[dict[str, BaseModelHandler]] = {}

    @classmethod
    def get_handler(cls, model_type: str) -> BaseModelHandler:
        """Return the singleton handler for a given model type."""
        clean = (model_type or "").strip()
        if clean not in cls._HANDLERS:
            raise KeyError(f"Unsupported model type: {model_type}")
        if clean not in cls._INSTANCES:
            cls._INSTANCES[clean] = cls._HANDLERS[clean]()
        return cls._INSTANCES[clean]

    @classmethod
    def install_category(cls, model_type: str) -> str:
        """Return ComfyUI installation folder name for model type."""
        return cls.get_handler(model_type).install_category

    @classmethod
    def candidate_categories(cls, model_type: str) -> tuple[str, ...]:
        """Return candidate folder categories for model type resolution."""
        handler = cls.get_handler(model_type)
        if hasattr(handler, "candidate_categories") and handler.candidate_categories:
            return handler.candidate_categories
        return (handler.install_category,)

    @classmethod
    def is_generation_supported(cls, model_type: str) -> bool:
        """Check if model type directly supports generation."""
        try:
            return cls.get_handler(model_type).supports_generation
        except KeyError:
            return False

    @classmethod
    def is_adapter(cls, model_type: str) -> bool:
        """Check if model type is in the adapter tier."""
        try:
            return cls.get_handler(model_type).tier == ModelTier.ADAPTER
        except KeyError:
            return False

    @classmethod
    def is_base_model(cls, model_type: str) -> bool:
        """Check if model type is a core base generation model."""
        try:
            return cls.get_handler(model_type).tier == ModelTier.CORE_BASE
        except KeyError:
            return False

    @classmethod
    def get_tier(cls, model_type: str) -> ModelTier:
        """Return functional tier for model type."""
        return cls.get_handler(model_type).tier

    @classmethod
    def allowed_extensions(cls, model_type: str) -> set[str]:
        """Return allowed file extensions for model type."""
        return cls.get_handler(model_type).allowed_extensions

    @classmethod
    def sanitize_compatibility(cls, model_type: str, compatibility: dict[str, Any]) -> dict[str, Any]:
        """Sanitize compatibility payload according to model handler rules."""
        try:
            handler = cls.get_handler(model_type)
            return handler.sanitize_compatibility(compatibility)
        except KeyError:
            return compatibility

    @classmethod
    def validate_compatibility(cls, model_type: str, compatibility: dict[str, Any]) -> None:
        """Validate compatibility requirements for model type."""
        handler = cls.get_handler(model_type)
        handler.validate_compatibility(compatibility)

    @classmethod
    def all_types(cls) -> list[str]:
        """List all 16 canonical model types (excluding legacy)."""
        return [
            "Checkpoint",
            "Hyper Network",
            "Embedding",
            "Aesthetic Gradient",
            "LoRA",
            "LoKr",
            "LoCon",
            "ControlNet",
            "Poses",
            "Wildcards",
            "LyCORIS",
            "SVD",
            "Motion LoRA",
            "VAE",
            "DoRA",
            "StyleModel",
        ]
