"""Pydantic request/response schemas for the Comfy Studio API."""

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


SUPPORTED_BASE_MODELS = (
    "FLUX.1",
    "Stable Diffusion XL (SDXL)",
    "Stable Diffusion 1.5 (SD 1.5)",
    "Stable Diffusion 3.5",
    "Pony Diffusion V6 XL",
    "Illustrious XL",
    "KREA_2",
    "Wan 2.1 / Wan 2.8",
    "Z-Image / Z-Image-Turbo",
    "Qwen-Image-2.1",
    "Hunyuan-DiT",
    "CogVideoX",
    "Anima",
    "Realistic Vision",
)


class AssistantPersona(str, Enum):
    BACKEND = "backend"
    FRONTEND = "frontend"


class AssistantRequest(BaseModel):
    """Body for POST /api/v1/assist."""

    model_config = {"extra": "forbid"}

    persona: AssistantPersona
    message: str = Field(..., min_length=1, max_length=12_000)

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be blank")
        return value


class AssistantResponse(BaseModel):
    persona: AssistantPersona
    answer: str


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


class LoraAdapterSelection(BaseModel):
    """An active LoRA adapter with weight and optional gallery identity."""

    model_config = {"extra": "forbid"}

    lora: Optional[str] = None
    model_id: Optional[str] = Field(None, pattern=r"^[0-9a-f]{32}$")
    version_id: Optional[str] = Field(None, pattern=r"^[0-9a-f]{32}$")
    file_id: Optional[str] = Field(None, pattern=r"^[0-9a-f]{32}$")
    strength: float = Field(1.0, ge=-10.0, le=10.0)
    on: bool = True

    @model_validator(mode="after")
    def validate_identifier(self) -> "LoraAdapterSelection":
        has_file = self.file_id is not None
        has_name = bool(self.lora and self.lora.strip())
        if not has_file and not has_name:
            raise ValueError("LoRA adapter requires either a gallery file identity or a lora name")
        if (self.model_id is not None or self.version_id is not None or self.file_id is not None) and not (
            self.model_id and self.version_id and self.file_id
        ):
            raise ValueError("model_id, version_id, and file_id must be provided together")
        return self


class GenerateRequest(BaseModel):
    """Body for POST /api/v1/generate."""

    model_config = {"extra": "forbid"}

    model_id: str = Field(..., pattern=r"^[0-9a-f]{32}$")
    version_id: str = Field(..., pattern=r"^[0-9a-f]{32}$")
    file_id: str = Field(..., pattern=r"^[0-9a-f]{32}$")
    base_model_id: str | None = Field(None, pattern=r"^[0-9a-f]{32}$")
    base_version_id: str | None = Field(None, pattern=r"^[0-9a-f]{32}$")
    base_file_id: str | None = Field(None, pattern=r"^[0-9a-f]{32}$")
    mode: Literal["text-to-image", "image-to-image"] = "text-to-image"
    prompt: str = Field(..., min_length=1, max_length=50_000)
    negative_prompt: str = ""
    seed: Optional[int] = Field(None, ge=0, le=2**32 - 1)
    steps: int = Field(10, ge=1, le=100)
    image_count: int = Field(1, ge=1, le=4)
    width: int = Field(768, ge=64, le=4096)
    height: int = Field(1344, ge=64, le=4096)
    format_name: Literal["1:1", "16:9", "9:16", "4:3", "3:2", "custom"] = "9:16"
    cfg: float = Field(1.0, ge=0.0, le=30.0)
    denoise: float = Field(1.0, ge=0.0, le=1.0)
    aspect_ratio: Literal["1:1", "16:9", "9:16", "4:3", "3:2"] = "1:1"
    style: str = Field("none", max_length=64)
    client_id: Optional[str] = Field(None, description="WS /api/v1/ws/progress/{client_id} session id")
    reference_images: list[str] = Field(default_factory=list)
    lora_adapters: list[LoraAdapterSelection] = Field(default_factory=list)

    @field_validator("prompt")
    @classmethod
    def prompt_at_most_one_thousand_words(cls, value: str) -> str:
        if len(value.split()) > 1_000:
            raise ValueError("Prompt must contain at most 1000 words")
        return value

    @model_validator(mode="after")
    def validate_base_identity(self) -> "GenerateRequest":
        base_ids = (self.base_model_id, self.base_version_id, self.base_file_id)
        if any(value is not None for value in base_ids) and not all(value is not None for value in base_ids):
            raise ValueError("base_model_id, base_version_id, and base_file_id must be set together")
        return self

    @field_validator("width", "height")
    @classmethod
    def dimensions_multiple_of_eight(cls, value: int) -> int:
        if value % 8:
            raise ValueError("Dimensions must be divisible by 8")
        return value

    @field_validator("reference_images")
    @classmethod
    def max_five(cls, value: list[str]) -> list[str]:
        if len(value) > 5:
            raise ValueError("At most 5 reference images are allowed")
        return value


class GalleryItem(BaseModel):
    """Stored asset descriptor returned by gallery and asset APIs."""

    key: str
    url: str
    size: int
    last_modified: str
    metadata: dict[str, Any] | None = None


class GalleryResponse(BaseModel):
    """Paginated gallery payload."""

    items: list[GalleryItem] = Field(default_factory=list)


class DeleteAssetResponse(BaseModel):
    """Response returned after deleting an asset."""

    deleted: bool = True
    key: str


class GeneratedAsset(BaseModel):
    """A generated file that can be previewed or downloaded."""

    filename: str
    url: str
    kind: Literal["image", "video"] = "image"
    poster_url: str | None = None
    saved: bool = True


# Kept as an import-compatible name for existing callers.
UploadedAsset = GeneratedAsset


class GenerationResult(BaseModel):
    prompt_id: str
    status: Literal["completed", "failed", "timeout"]
    images: list[GeneratedAsset]
    error: Optional[str] = None
    elapsed_ms: int


class GenerationMetadata(BaseModel):
    prompt_id: str = ""
    prompt: str = ""
    negative_prompt: str = ""
    seed: int | None = None
    steps: int | None = None
    image_count: int = 1
    cfg: float | None = None
    denoise: float | None = None
    loras: list[LoraSelection] = Field(default_factory=list)
    width: int | None = None
    height: int | None = None
    format_name: str = ""
    model_id: str = ""
    version_id: str = ""
    file_id: str = ""
    model_title: str = ""
    model_type: str = ""
    model_version: str = ""
    model_category: str = ""
    model_filename: str = ""
    unet_name: str = ""
    clip_name: str = ""
    vae_name: str = ""
    created_at: str = ""
    elapsed_ms: int = 0
    source_filename: str = ""
    source: Literal["workspace", "tool"] = "workspace"
    tags: list[str] = Field(default_factory=list)
    tool_id: str | None = None
    tool_name: str | None = None
    tool_mode: str | None = None
    tool_type: str | None = None
    aspect_ratio: str | None = None
    kind: Literal["image", "video"] = "image"
    gallery_saved: bool = True
    controls: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    comfy: str
    storage: str


class ToolMode(str, Enum):
    TEXT_TO_IMAGE = "text-to-image"
    IMAGE_TO_IMAGE = "image-to-image"
    TEXT_TO_VIDEO = "text-to-video"
    IMAGE_TO_VIDEO = "image-to-video"


class ToolAspectRatio(str, Enum):
    SQUARE = "1:1"
    LANDSCAPE = "16:9"
    PORTRAIT = "9:16"
    CLASSIC = "4:3"
    ULTRAWIDE = "21:9"


class ToolControl(BaseModel):
    id: str
    path: str
    label: str
    meta_title: str | None = None
    kind: Literal["prompt", "text", "seed", "number", "select", "boolean", "image"]
    value: Any = None
    default: Any = None
    numeric: bool = False
    seed: bool = False
    options: list[Any] = Field(default_factory=list)
    minimum: float | None = None
    maximum: float | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    node_id: str
    input_name: str
    role: str | None = None
    recommended: bool = True

    model_config = {"extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        res = dict(data)
        if "value" in res and res.get("default") is None:
            res["default"] = res["value"]
        elif "default" in res and res.get("value") is None:
            res["value"] = res["default"]
        if "minimum" in res and res.get("min") is None:
            res["min"] = res["minimum"]
        elif "min" in res and res.get("minimum") is None:
            res["minimum"] = res["min"]
        if "maximum" in res and res.get("max") is None:
            res["max"] = res["maximum"]
        elif "max" in res and res.get("maximum") is None:
            res["maximum"] = res["max"]
        if "id" in res and not res.get("path"):
            res["path"] = res["id"]
        elif "path" in res and not res.get("id"):
            res["id"] = res["path"]
        return res


class CreateToolRequest(BaseModel):
    workflow_api: dict[str, Any] | str
    name: str = Field("Untitled tool", min_length=1, max_length=120)
    mode: ToolMode = ToolMode.TEXT_TO_IMAGE
    aspect_ratio: ToolAspectRatio = ToolAspectRatio.SQUARE
    controls: list[ToolControl] | None = None
    thumbnail_base64: str | None = None

    model_config = {"extra": "forbid"}


class ToolParseResponse(BaseModel):
    tool_id: str
    name: str
    controls: list[ToolControl]
    locked_nodes: list[dict[str, str]]


class ToolSummary(BaseModel):
    tool_id: str
    name: str
    mode: ToolMode
    default_aspect_ratio: ToolAspectRatio
    requires_image: bool
    has_prompt: bool
    created_at: str
    thumbnail_url: str | None = None


class ToolDetail(ToolSummary):
    supported_aspect_ratios: list[ToolAspectRatio]
    output_kind: Literal["image", "video"]
    controls: list[ToolControl] = Field(default_factory=list)


class ToolCatalogResponse(BaseModel):
    items: list[ToolSummary]


class ToolExecuteRequest(BaseModel):
    tool_id: str = Field(..., min_length=32, max_length=32)
    prompt: str = Field("", max_length=50_000)
    aspect_ratio: ToolAspectRatio | None = None
    values: dict[str, Any] = Field(default_factory=dict)
    client_id: str | None = Field(None, min_length=1, max_length=128)
    save_to_gallery: bool = True

    model_config = {"extra": "forbid"}


class ToolExecutionResult(BaseModel):
    tool_id: str
    prompt_id: str
    status: Literal["completed", "failed", "timeout"]
    images: list[UploadedAsset]
    error: Optional[str] = None
    elapsed_ms: int
    tool_mode: ToolMode | None = None
    aspect_ratio: ToolAspectRatio | None = None


class DeleteToolResponse(BaseModel):
    deleted: bool = True
    tool_id: str


# ---------------------------------------------------------------------------
# Creator model publishing
# ---------------------------------------------------------------------------


class ModelCategory(str, Enum):
    CHARACTER = "Character"
    STYLE = "Style"
    CONCEPT = "Concept"
    POSE = "Pose"
    CLOTHING = "Clothing"
    GENERAL = "General"


class CreatorModelType(str, Enum):
    CHECKPOINT = "Checkpoint"
    DIFFUSION_MODEL = "Diffusion Model"
    LORA = "LoRA"
    LYCORIS = "LyCORIS"
    VAE = "VAE"
    EMBEDDING = "Embedding"


class ModelVisibility(str, Enum):
    PUBLIC = "Public"
    UNLISTED = "Unlisted"
    PRIVATE = "Private"


class ModelPrecision(str, Enum):
    FP16 = "FP16"
    FP32 = "FP32"
    BF16 = "BF16"
    QUANTIZED = "Quantized"


class ModelCompatibility(BaseModel):
    model_config = {"extra": "forbid"}

    base_model: str = Field("Stable Diffusion XL (SDXL)", min_length=1, max_length=80)
    base_model_id: str | None = Field(None, pattern=r"^[0-9a-f]{32}$")
    base_version_id: str | None = Field(None, pattern=r"^[0-9a-f]{32}$")
    base_file_id: str | None = Field(None, pattern=r"^[0-9a-f]{32}$")
    vae: str | None = None
    text_encoder: str | None = Field(None, min_length=1, max_length=255)
    clip_type: str | None = Field(None, min_length=1, max_length=64)
    parent_model: str | None = Field(None, max_length=255)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_encoder(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        data = dict(value)
        legacy = data.pop("text_encoders", None)
        if "text_encoder" not in data and isinstance(legacy, list) and legacy:
            data["text_encoder"] = legacy[0]
        return data

    @model_validator(mode="after")
    def validate_base_identity(self) -> "ModelCompatibility":
        base_ids = (self.base_model_id, self.base_version_id, self.base_file_id)
        if any(value is not None for value in base_ids) and not all(value is not None for value in base_ids):
            raise ValueError("base_model_id, base_version_id, and base_file_id must be set together")
        return self

    @model_validator(mode="after")
    def validate_encoder_stack(self) -> "ModelCompatibility":
        if (self.text_encoder is None) != (self.clip_type is None):
            raise ValueError("text_encoder and clip_type must be set together")
        return self

    @field_validator("base_model", mode="before")
    @classmethod
    def normalize_base_model(cls, value: Any) -> Any:
        if value == "SDXL 1.0":
            value = "Stable Diffusion XL (SDXL)"
        if value not in SUPPORTED_BASE_MODELS:
            raise ValueError("Unsupported base model")
        return value


class ModelGenerationSettings(BaseModel):
    model_config = {"extra": "forbid"}

    trigger_words: list[str] = Field(default_factory=list, max_length=32)
    sampler: str = Field("DPM++ 2M Karras", min_length=1, max_length=80)
    steps_min: int = Field(20, ge=1, le=100)
    steps_max: int = Field(30, ge=1, le=100)
    cfg_min: float = Field(3.5, ge=0, le=30)
    cfg_max: float = Field(7.0, ge=0, le=30)
    clip_skip: int = Field(1, ge=1, le=2)
    prompt: str = Field("", max_length=50_000)
    negative_prompt: str = Field("", max_length=50_000)

    @field_validator("steps_max")
    @classmethod
    def steps_ordered(cls, value: int, info: Any) -> int:
        minimum = info.data.get("steps_min")
        if minimum is not None and value < minimum:
            raise ValueError("steps_max must be greater than or equal to steps_min")
        return value

    @field_validator("cfg_max")
    @classmethod
    def cfg_ordered(cls, value: float, info: Any) -> float:
        minimum = info.data.get("cfg_min")
        if minimum is not None and value < minimum:
            raise ValueError("cfg_max must be greater than or equal to cfg_min")
        return value


class ModelPermissions(BaseModel):
    model_config = {"extra": "forbid"}

    commercial: bool = True
    remix: bool = False
    generation_services: bool = True
    credit_required: bool = True


class ModelCreateRequest(BaseModel):
    model_config = {"extra": "forbid"}

    title: str = Field("Untitled model", min_length=1, max_length=160)
    category: ModelCategory = ModelCategory.GENERAL
    model_type: CreatorModelType = CreatorModelType.CHECKPOINT
    tags: list[str] = Field(default_factory=list, max_length=32)
    compatibility: ModelCompatibility = Field(default_factory=ModelCompatibility)
    generation: ModelGenerationSettings = Field(default_factory=ModelGenerationSettings)
    permissions: ModelPermissions = Field(default_factory=ModelPermissions)
    visibility: ModelVisibility = ModelVisibility.PRIVATE

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Model title cannot be blank")
        return value

    @field_validator("tags", "generation")
    @classmethod
    def trim_tags(cls, value: Any) -> Any:
        if isinstance(value, list):
            cleaned = [" ".join(item.split()) for item in value if isinstance(item, str) and item.strip()]
            if len(cleaned) != len(set(cleaned)):
                raise ValueError("Tags must be unique")
            return cleaned
        return value


class ModelUpdateRequest(BaseModel):
    model_config = {"extra": "forbid"}

    title: str | None = Field(None, min_length=1, max_length=160)
    category: ModelCategory | None = None
    model_type: CreatorModelType | None = None
    tags: list[str] | None = Field(None, max_length=32)
    compatibility: ModelCompatibility | None = None
    generation: ModelGenerationSettings | None = None
    permissions: ModelPermissions | None = None
    visibility: ModelVisibility | None = None

    @field_validator("title")
    @classmethod
    def update_title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = " ".join(value.split())
        if not value:
            raise ValueError("Model title cannot be blank")
        return value


class ModelFileResponse(BaseModel):
    file_id: str
    filename: str
    size: int
    sha256: str
    precision: ModelPrecision
    visible: bool
    download_url: str


class ModelSampleResponse(BaseModel):
    sample_id: str
    filename: str
    url: str
    kind: Literal["image", "video"]
    metadata: dict[str, Any] = Field(default_factory=dict)


class ModelVersionResponse(BaseModel):
    version_id: str
    name: str
    created_at: str
    files: list[ModelFileResponse] = Field(default_factory=list)
    samples: list[ModelSampleResponse] = Field(default_factory=list)


class ModelResponse(ModelCreateRequest):
    model_id: str
    created_at: str
    updated_at: str
    published_at: str | None = None
    versions: list[ModelVersionResponse] = Field(default_factory=list)


class ModelListResponse(BaseModel):
    items: list[ModelResponse]


class ModelVersionCreateRequest(BaseModel):
    model_config = {"extra": "forbid"}

    name: str = Field(..., min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def version_name_not_blank(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Version name cannot be blank")
        return value


class ModelPublishRequest(BaseModel):
    model_config = {"extra": "forbid"}

    visibility: ModelVisibility


class ModelFilePatchRequest(BaseModel):
    model_config = {"extra": "forbid"}

    visible: bool
    precision: ModelPrecision | None = None


class PublicModelSummary(BaseModel):
    model_id: str
    title: str
    category: ModelCategory
    model_type: CreatorModelType
    tags: list[str]
    base_model: str
    published_at: str
    updated_at: str
    cover_url: str | None = None
    version_count: int
    file_count: int
    sample_count: int


class PublicModelResponse(BaseModel):
    model_id: str
    title: str
    category: ModelCategory
    model_type: CreatorModelType
    tags: list[str]
    compatibility: ModelCompatibility
    generation: ModelGenerationSettings
    permissions: ModelPermissions
    published_at: str
    updated_at: str
    versions: list[ModelVersionResponse]


class PublicModelListResponse(BaseModel):
    items: list[PublicModelSummary]


class ModelInstallResponse(BaseModel):
    model_id: str
    version_id: str
    file_id: str
    filename: str
    category: str
    destination: str
    installed: bool
    already_present: bool
    sha256: str


class InstalledGalleryModel(BaseModel):
    model_id: str
    version_id: str
    file_id: str
    title: str
    model_type: Literal["Checkpoint", "Diffusion Model", "LoRA", "LyCORIS"]
    version_name: str
    filename: str
    category: Literal["checkpoints", "diffusion_models", "loras"]
    sha256: str
    vae: str | None = None
    text_encoder: str | None = None
    clip_type: str | None = None
    base_model_id: str | None = None
    base_version_id: str | None = None
    base_file_id: str | None = None
    cover_url: str | None = None


class InstalledGalleryModelList(BaseModel):
    items: list[InstalledGalleryModel]


class LocalModelSummary(BaseModel):
    category: str
    filename: str
    size: int


class LocalModelListResponse(BaseModel):
    items: list[LocalModelSummary]


class LocalModelImportRequest(BaseModel):
    model_config = {"extra": "forbid"}

    category: str = Field(..., min_length=1, max_length=64)
    filename: str = Field(..., min_length=1, max_length=512)
    precision: ModelPrecision = ModelPrecision.FP16
