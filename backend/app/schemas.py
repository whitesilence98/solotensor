"""Pydantic request/response schemas for the Comfy Studio API."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class LoraSelection(BaseModel):
    """One ordered entry for rgthree's Power Lora Loader."""

    lora: str = Field(..., min_length=1, max_length=255)
    on: bool = True
    strength: float = Field(1.0, ge=-10.0, le=10.0)

    @field_validator("lora")
    @classmethod
    def lora_name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("LoRA filename cannot be blank")
        return value


class GenerateRequest(BaseModel):
    """Body for POST /api/v1/generate."""

    mode: Literal["text-to-image", "image-to-image"] = "text-to-image"
    prompt: str = Field(..., min_length=1, max_length=50_000)
    negative_prompt: str = ""
    model: Literal["sdxl", "flux", "nano"] = "sdxl"
    unet_name: str = Field(
        "krea2\\krea2_turbo_fp8_scaled.safetensors", min_length=1, max_length=255
    )
    clip_name: str = Field(
        "qwen3vl_4B_Instruct-abliterated-fp8_scaled.safetensors",
        min_length=1,
        max_length=255,
    )
    vae_name: str = Field("wan_2.1_vae.safetensors", min_length=1, max_length=255)
    loras: list[LoraSelection] = Field(default_factory=list, max_length=16)
    seed: Optional[int] = Field(None, ge=0, le=2**32 - 1)
    steps: int = Field(10, ge=1, le=100)
    image_count: int = Field(1, ge=1, le=4)
    width: int = Field(768, ge=64, le=4096)
    height: int = Field(1344, ge=64, le=4096)
    format_name: Literal["1:1", "16:9", "9:16", "4:3", "3:2", "custom"] = "9:16"
    # Legacy controls retained for the deferred Image-to-Image workflow.
    cfg: float = Field(1.0, ge=0.0, le=30.0)
    denoise: float = Field(1.0, ge=0.0, le=1.0)
    aspect_ratio: Literal["1:1", "16:9", "9:16", "4:3", "3:2"] = "1:1"
    style: str = Field("none", max_length=64)
    client_id: Optional[str] = Field(
        None, description="WS /api/v1/ws/progress/{client_id} session id"
    )
    reference_images: list[str] = Field(
        default_factory=list,
        description="Base64-encoded (data URLs allowed) reference images, max 5",
    )

    @field_validator("prompt")
    @classmethod
    def prompt_at_most_one_thousand_words(cls, value: str) -> str:
        if len(value.split()) > 1_000:
            raise ValueError("Prompt must contain at most 1000 words")
        return value

    @field_validator("unet_name", "clip_name", "vae_name")
    @classmethod
    def model_name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Model filename cannot be blank")
        return value

    @field_validator("width", "height")
    @classmethod
    def dimensions_multiple_of_eight(cls, value: int) -> int:
        if value % 8:
            raise ValueError("Dimensions must be divisible by 8")
        return value

    @field_validator("reference_images")
    @classmethod
    def max_five(cls, v: list[str]) -> list[str]:
        if len(v) > 5:
            raise ValueError("At most 5 reference images are allowed")
        return v


class UploadedAsset(BaseModel):
    filename: str
    url: str


class GenerationResult(BaseModel):
    prompt_id: str
    status: Literal["completed", "failed", "timeout"]
    images: list[UploadedAsset]
    error: Optional[str] = None
    elapsed_ms: int


class GenerationMetadata(BaseModel):
    prompt_id: str
    prompt: str
    negative_prompt: str = ""
    seed: int
    steps: int
    image_count: int = 1
    cfg: float = 1.0
    denoise: float = 1.0
    loras: list[LoraSelection] = Field(default_factory=list)
    width: int
    height: int
    format_name: str
    unet_name: str
    clip_name: str
    vae_name: str
    created_at: str
    elapsed_ms: int
    source_filename: str


class GalleryItem(BaseModel):
    key: str
    url: str
    size: int
    last_modified: str
    metadata: Optional[GenerationMetadata] = None


class GalleryResponse(BaseModel):
    items: list[GalleryItem]


class HealthResponse(BaseModel):
    status: str
    comfy: str
    storage: str


class WSProgress(BaseModel):
    """Envelope for every message relayed over the progress WebSocket."""

    type: Literal["queued", "progress", "executing", "executed", "completed", "error"]
    prompt_id: Optional[str] = None
    node: Optional[str] = None
    value: Optional[float] = None
    max: Optional[float] = None
    message: Optional[str] = None
    data: Optional[dict[str, Any]] = None
