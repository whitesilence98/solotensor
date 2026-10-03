/**
 * Typed client for the Comfy Studio FastAPI backend.
 * Uses native fetch + WebSocket (no axios dependency needed).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type AssistantPersona = "backend" | "frontend";

export interface AssistantResponse {
  persona: AssistantPersona;
  answer: string;
}

export type GenerationMode = "text-to-image" | "image-to-image";

export type ModelCategory = "diffusion_models" | "text_encoders" | "vae" | "loras";

export interface LoraSelection {
  lora: string;
  on: boolean;
  strength: number;
}

export interface GeneratePayload {
  model_id: string;
  version_id: string;
  file_id: string;
  mode: GenerationMode;
  prompt: string;
  negative_prompt?: string;
  seed?: number;
  steps: number;
  image_count: number;
  width: number;
  height: number;
  format_name: "1:1" | "16:9" | "9:16" | "4:3" | "3:2" | "custom";
  cfg: number;
  denoise: number;
  client_id?: string;
  reference_images?: string[];
}

export interface UploadedAsset {
  filename: string;
  url: string;
  kind?: "image" | "video";
  poster_url?: string | null;
  saved?: boolean;
}

export interface ToolControl {
  id: string;
  path: string;
  label: string;
  meta_title: string | null;
  kind: "prompt" | "text" | "seed" | "number" | "select" | "boolean" | "image";
  value: string | number | boolean;
  numeric: boolean;
  seed: boolean;
  options: Array<string | number>;
  minimum: number | null;
  maximum: number | null;
  step: number | null;
  node_id: string;
  input_name: string;
}

export interface ToolParseResponse {
  tool_id: string;
  name: string;
  controls: ToolControl[];
  locked_nodes: Array<{ id: string; class_type: string }>;
}

export interface ToolExecutionResult {
  tool_id: string;
  prompt_id: string;
  status: "completed" | "failed" | "timeout";
  images: UploadedAsset[];
  error: string | null;
  elapsed_ms: number;
}


export type ToolMode = "text-to-image" | "image-to-image" | "text-to-video" | "image-to-video";
export type ToolAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "21:9";

export interface ToolSummary {
  tool_id: string;
  name: string;
  mode: ToolMode;
  default_aspect_ratio: ToolAspectRatio;
  requires_image: boolean;
  has_prompt: boolean;
  created_at: string;
  thumbnail_url: string | null;
}

export interface ToolDetail extends ToolSummary {
  supported_aspect_ratios: ToolAspectRatio[];
  output_kind: "image" | "video";
  controls: ToolControl[];
}

export interface ToolRunResult extends ToolExecutionResult {
  tool_mode: ToolMode | null;
  aspect_ratio: ToolAspectRatio | null;
}

export interface GenerationResult {
  prompt_id: string;
  status: "completed" | "failed" | "timeout";
  images: UploadedAsset[];
  error: string | null;
  elapsed_ms: number;
}

export interface GenerationMetadata {
  prompt_id: string;
  prompt: string;
  negative_prompt?: string;
  seed?: number | null;
  steps?: number | null;
  image_count?: number;
  cfg?: number | null;
  denoise?: number | null;
  width?: number | null;
  height?: number | null;
  format_name?: string;
  model_id?: string;
  version_id?: string;
  file_id?: string;
  model_title?: string;
  model_type?: string;
  model_version?: string;
  model_category?: string;
  model_filename?: string;
  unet_name?: string;
  clip_name?: string;
  vae_name?: string;
  loras?: LoraSelection[];
  created_at: string;
  elapsed_ms: number;
  source_filename?: string;
}

export interface GalleryMetadata extends GenerationMetadata {
  source?: "workspace" | "tool";
  origin?: string;
  tool_id?: string;
  tool_name?: string;
  tool_mode?: ToolMode;
  tool_type?: ToolMode;
  aspect_ratio?: ToolAspectRatio;
  tags?: string[];
}

export interface GalleryItem {
  key: string;
  url: string;
  size: number;
  last_modified: string;
  metadata: GalleryMetadata | null;
}

export type AssetType = "image" | "video" | "3d";

export interface AssetRecord extends GalleryItem {
  type: AssetType;
}

/** Known video / 3D file extensions, for when the backend grows those types. */
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".mkv"]);
const MODEL_EXT = new Set([".glb", ".gltf", ".obj", ".fbx", ".blend", ".splat"]);

export function assetTypeOf(item: GalleryItem): AssetType {
  const ext = item.key.slice(item.key.lastIndexOf(".")).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (MODEL_EXT.has(ext)) return "3d";
  return "image";
}

export function withTypes(items: GalleryItem[]): AssetRecord[] {
  return items.map((item) => ({ ...item, type: assetTypeOf(item) }));
}

export interface ProgressEvent {
  type: "queued" | "progress" | "executing" | "executed" | "completed" | "error";
  prompt_id?: string | null;
  node?: string | null;
  value?: number | null;
  max?: number | null;
  message?: string | null;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    let message = resp.statusText;
    try {
      const body = await resp.json();
      const detail = body?.detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = detail
          .map((item) => {
            const location = Array.isArray(item?.loc) ? item.loc.join(".") : "request";
            return `${location}: ${item?.msg ?? "Invalid value"}`;
          })
          .join("; ");
      } else if (detail != null) {
        message = JSON.stringify(detail);
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, message);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export type CreatorModelCategory = "Character" | "Style" | "Concept" | "Pose" | "Clothing" | "General";
export type CreatorModelType = "Checkpoint" | "Diffusion Model" | "LoRA" | "LyCORIS" | "VAE" | "Embedding";
export type ModelVisibility = "Public" | "Unlisted" | "Private";
export type ModelPrecision = "FP16" | "FP32" | "BF16" | "Quantized";

export interface CreatorModelCompatibility {
  base_model: string;
  vae: string | null;
  text_encoders: string[];
  parent_model: string | null;
}

export interface CreatorModelGeneration {
  trigger_words: string[];
  sampler: string;
  steps_min: number;
  steps_max: number;
  cfg_min: number;
  cfg_max: number;
  clip_skip: number;
  prompt: string;
  negative_prompt: string;
}

export interface CreatorModelPermissions {
  commercial: boolean;
  remix: boolean;
  generation_services: boolean;
  credit_required: boolean;
}

export interface CreatorModelFile {
  file_id: string;
  filename: string;
  size: number;
  sha256: string;
  precision: ModelPrecision;
  visible: boolean;
  download_url: string;
}

export interface CreatorModelSample {
  sample_id: string;
  filename: string;
  url: string;
  kind: "image" | "video";
  metadata: Record<string, unknown>;
}

export interface CreatorModelVersion {
  version_id: string;
  name: string;
  created_at: string;
  files: CreatorModelFile[];
  samples: CreatorModelSample[];
}

export interface CreatorModel {
  model_id: string;
  title: string;
  category: CreatorModelCategory;
  model_type: CreatorModelType;
  tags: string[];
  compatibility: CreatorModelCompatibility;
  generation: CreatorModelGeneration;
  permissions: CreatorModelPermissions;
  visibility: ModelVisibility;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  versions: CreatorModelVersion[];
}

export interface CreatorModelPayload {
  title: string;
  category: CreatorModelCategory;
  model_type: CreatorModelType;
  tags: string[];
  compatibility: CreatorModelCompatibility;
  generation: CreatorModelGeneration;
  permissions: CreatorModelPermissions;
  visibility: ModelVisibility;
}

export interface ModelPublishPayload { visibility: ModelVisibility; }

export interface PublicModelSummary {
  model_id: string;
  title: string;
  category: CreatorModelCategory;
  model_type: CreatorModelType;
  tags: string[];
  base_model: string;
  published_at: string;
  updated_at: string;
  cover_url: string | null;
  version_count: number;
  file_count: number;
  sample_count: number;
}

export interface ModelInstallResponse {
  model_id: string;
  version_id: string;
  file_id: string;
  filename: string;
  category: string;
  destination: string;
  installed: boolean;
  already_present: boolean;
  sha256: string;
}

export interface InstalledGalleryModel {
  model_id: string;
  version_id: string;
  file_id: string;
  title: string;
  model_type: "Checkpoint" | "Diffusion Model";
  version_name: string;
  filename: string;
  category: "checkpoints" | "diffusion_models";
  sha256: string;
}

export interface InstalledGalleryModelList { items: InstalledGalleryModel[]; }

export interface PublicModelListResponse { items: PublicModelSummary[]; }

export interface LocalModelSummary {
  category: string;
  filename: string;
  size: number;
}

export interface LocalModelListResponse { items: LocalModelSummary[]; }

export const api = {
  async askAssistant(persona: AssistantPersona, message: string): Promise<AssistantResponse> {
    return request<AssistantResponse>("/api/v1/assist", {
      method: "POST",
      body: JSON.stringify({ persona, message }),
    });
  },

  async listPublicModels(query = ""): Promise<PublicModelListResponse> {
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    return request<PublicModelListResponse>(`/api/v1/models/public${params}`);
  },

  async listSelectableModels(): Promise<InstalledGalleryModel[]> {
    const response = await request<InstalledGalleryModelList>("/api/v1/models/public/selectable");
    return response.items;
  },

  async getPublicModel(modelId: string): Promise<CreatorModel> {
    return request<CreatorModel>(`/api/v1/models/public/${encodeURIComponent(modelId)}`);
  },

  async installModelFile(modelId: string, versionId: string, fileId: string): Promise<ModelInstallResponse> {
    return request<ModelInstallResponse>(`/api/v1/models/public/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/files/${encodeURIComponent(fileId)}/install`, { method: "POST" });
  },

  async listLocalModels(query = "", category?: string): Promise<LocalModelListResponse> {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    return request<LocalModelListResponse>(`/api/v1/models/local${params.size ? `?${params}` : ""}`);
  },

  async importLocalModelFile(modelId: string, versionId: string, category: string, filename: string, precision: ModelPrecision = "FP16"): Promise<CreatorModel> {
    return request<CreatorModel>(`/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/files/import-local`, {
      method: "POST",
      body: JSON.stringify({ category, filename, precision }),
    });
  },

  async listCreatorModels(filters: { visibility?: ModelVisibility; q?: string } = {}): Promise<CreatorModel[]> {
    const params = new URLSearchParams();
    if (filters.visibility) params.set("visibility", filters.visibility);
    if (filters.q) params.set("q", filters.q);
    const response = await request<{ items: CreatorModel[] }>(`/api/v1/models${params.size ? `?${params}` : ""}`);
    return response.items;
  },

  async getCreatorModel(modelId: string): Promise<CreatorModel> {
    return request<CreatorModel>(`/api/v1/models/id/${encodeURIComponent(modelId)}`);
  },

  async createCreatorModel(payload: CreatorModelPayload): Promise<CreatorModel> {
    return request<CreatorModel>("/api/v1/models", { method: "POST", body: JSON.stringify(payload) });
  },

  async updateCreatorModel(modelId: string, payload: Partial<CreatorModelPayload>): Promise<CreatorModel> {
    return request<CreatorModel>(`/api/v1/models/id/${encodeURIComponent(modelId)}`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async createModelVersion(modelId: string, name: string): Promise<CreatorModelVersion> {
    return request<CreatorModelVersion>(`/api/v1/models/id/${encodeURIComponent(modelId)}/versions`, { method: "POST", body: JSON.stringify({ name }) });
  },

  async uploadModelFile(modelId: string, versionId: string, file: File, precision: ModelPrecision = "FP16"): Promise<CreatorModel> {
    const form = new FormData(); form.append("file", file, file.name); form.append("precision", precision);
    const response = await fetch(`${API_BASE}/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/files`, { method: "POST", body: form });
    if (!response.ok) throw new ApiError(response.status, (await response.json().catch(() => null))?.detail ?? "Could not upload model file");
    return (await response.json()) as CreatorModel;
  },

  async uploadModelSample(modelId: string, versionId: string, file: File, metadata: Record<string, unknown> = {}): Promise<CreatorModel> {
    const form = new FormData(); form.append("file", file, file.name); form.append("metadata", JSON.stringify(metadata));
    const response = await fetch(`${API_BASE}/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/samples`, { method: "POST", body: form });
    if (!response.ok) throw new ApiError(response.status, (await response.json().catch(() => null))?.detail ?? "Could not upload sample");
    return (await response.json()) as CreatorModel;
  },

  async patchModelFile(modelId: string, versionId: string, fileId: string, payload: { visible: boolean; precision?: ModelPrecision }): Promise<CreatorModel> {
    return request<CreatorModel>(`/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/files/${encodeURIComponent(fileId)}`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  async deleteModelFile(modelId: string, versionId: string, fileId: string): Promise<void> {
    await request<unknown>(`/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  },

  async deleteModelSample(modelId: string, versionId: string, sampleId: string): Promise<void> {
    await request<unknown>(`/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/samples/${encodeURIComponent(sampleId)}`, { method: "DELETE" });
  },

  async publishCreatorModel(modelId: string, visibility: ModelVisibility): Promise<CreatorModel> {
    return request<CreatorModel>(`/api/v1/models/id/${encodeURIComponent(modelId)}/publish`, { method: "POST", body: JSON.stringify({ visibility }) });
  },

  async deleteCreatorModel(modelId: string): Promise<void> {
    await request<unknown>(`/api/v1/models/id/${encodeURIComponent(modelId)}`, { method: "DELETE" });
  },

  async generate(payload: GeneratePayload): Promise<GenerationResult> {
    return request<GenerationResult>("/api/v1/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getGallery(limit = 60, filters: { origin?: string; tool_id?: string; tool_type?: string; tag?: string } = {}): Promise<GalleryItem[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const resp = await request<{ items: GalleryItem[] }>(`/api/v1/gallery?${params}`);
    return resp.items;
  },

  async getTools(): Promise<ToolSummary[]> {
    const resp = await request<{ items: ToolSummary[] }>("/api/tools");
    return resp.items;
  },

  async getTool(toolId: string): Promise<ToolDetail> {
    return request<ToolDetail>(`/api/tools/${encodeURIComponent(toolId)}`);
  },

  async createTool(file: File, name: string, mode: ToolMode, aspectRatio: ToolAspectRatio, thumbnail?: File): Promise<ToolDetail> {
    const form = new FormData();
    form.append("workflow_api", file, "workflow_api.json");
    form.append("name", name);
    form.append("mode", mode);
    form.append("aspect_ratio", aspectRatio);
    if (thumbnail) form.append("thumbnail", thumbnail, thumbnail.name);
    const resp = await fetch(`${API_BASE}/api/tools/create`, { method: "POST", body: form });
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new ApiError(resp.status, typeof body?.detail === "string" ? body.detail : "Could not create tool");
    }
    return (await resp.json()) as ToolDetail;
  },

  async runTool(toolId: string, prompt: string, aspectRatio: ToolAspectRatio, image?: File, values: Record<string, string | number | boolean> = {}, images: Record<string, File> = {}, options: { clientId?: string; saveToGallery?: boolean } = {}): Promise<ToolRunResult> {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("aspect_ratio", aspectRatio);
    form.append("values", JSON.stringify(values));
    form.append("client_id", options.clientId ?? "");
    form.append("save_to_gallery", String(options.saveToGallery ?? true));
    const imageIds = Object.keys(images);
    form.append("image_control_ids", JSON.stringify(imageIds));
    Object.values(images).forEach((file) => form.append("files", file, file.name));
    if (image) form.append("input_image", image, image.name);
    const resp = await fetch(`${API_BASE}/api/tools/${encodeURIComponent(toolId)}/run`, { method: "POST", body: form });
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new ApiError(resp.status, typeof body?.detail === "string" ? body.detail : "Could not run tool");
    }
    return (await resp.json()) as ToolRunResult;
  },

  async getAsset(key: string): Promise<GalleryItem> {
    return request<GalleryItem>(`/api/v1/assets/${key.split("/").map(encodeURIComponent).join("/")}`);
  },

  async patchAssetSaved(key: string, saved: boolean): Promise<GalleryItem> {
    return request<GalleryItem>(`/api/v1/assets/${key.split("/").map(encodeURIComponent).join("/")}?saved=${saved}`, { method: "PATCH" });
  },

  async getImage(key: string): Promise<GalleryItem> {
    return this.getAsset(key);
  },

  async getModels(category: ModelCategory): Promise<string[]> {
    return request<string[]>(`/api/v1/models/${category}`);
  },

  async parseTool(file: File, name = "Untitled tool"): Promise<ToolParseResponse> {
    const form = new FormData();
    form.append("workflow_api", file, "workflow_api.json");
    form.append("name", name);
    const resp = await fetch(`${API_BASE}/api/tools/parse`, {
      method: "POST",
      body: form,
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new ApiError(resp.status, typeof body?.detail === "string" ? body.detail : "Could not parse workflow");
    }
    return (await resp.json()) as ToolParseResponse;
  },

  async executeTool(payload: { tool_id: string; inputs: Record<string, string | number> }): Promise<ToolExecutionResult> {
    return request<ToolExecutionResult>("/api/tools/execute", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async health(): Promise<{ status: string; comfy: string; storage: string }> {
    return request("/api/v1/health");
  },

  /** Open a relay WebSocket to /api/v1/ws/progress/{clientId}. */
  openProgressSocket(
    clientId: string,
    onEvent: (event: ProgressEvent) => void
  ): WebSocket {
    const wsBase = API_BASE.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBase}/api/v1/ws/progress/${clientId}`);
    ws.onmessage = (msg) => {
      // Binary frames are ComfyUI live previews — not structured events.
      if (typeof msg.data !== "string") return;
      try {
        onEvent(JSON.parse(msg.data) as ProgressEvent);
      } catch {
        /* ignore malformed frames */
      }
    };
    return ws;
  },
};

/** crypto.randomUUID needs a secure context (HTTPS / localhost); fall back otherwise. */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    // RFC 4122 v4 from random bytes
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[7] = (bytes[7] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}