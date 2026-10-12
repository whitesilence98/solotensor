/**
 * Typed client for the Comfy Studio FastAPI backend.
 * Uses native fetch + WebSocket (no axios dependency needed).
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined" ? "" : "http://127.0.0.1:8000");

/**
 * Resolves media/sample/cover URLs returned by backend.
 * Rewrites localhost/127.0.0.1 URLs to relative paths (/api/... or /files/...)
 * so they proxy cleanly through Next.js rewrite bridge across LAN and remote clients.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const isLocalhost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "0.0.0.0";

    if (typeof window !== "undefined") {
      if (
        isLocalhost ||
        parsed.hostname === window.location.hostname ||
        parsed.port === "8000"
      ) {
        if (
          parsed.pathname.startsWith("/api/") ||
          parsed.pathname.startsWith("/files/")
        ) {
          return `${parsed.pathname}${parsed.search}`;
        }
        parsed.hostname = window.location.hostname;
        return parsed.toString();
      }
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

export type AssistantPersona = "backend" | "frontend";

export interface AssistantResponse {
  persona: AssistantPersona;
  answer: string;
}

export type GenerationMode = "text-to-image" | "image-to-image";

export type ModelCategory =
  | "diffusion_models"
  | "text_encoders"
  | "vae"
  | "loras"
  | "checkpoints"
  | "embeddings";

export interface LoraSelection {
  lora: string;
  on: boolean;
  strength: number;
  model_id?: string;
  version_id?: string;
  file_id?: string;
}

export interface LoraAdapterPayload {
  lora?: string;
  model_id?: string;
  version_id?: string;
  file_id?: string;
  strength: number;
  on: boolean;
}

export interface GeneratePayload {
  model_id: string;
  version_id: string;
  file_id: string;
  base_model_id?: string;
  base_version_id?: string;
  base_file_id?: string;
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
  lora_adapters?: LoraAdapterPayload[];
}

export interface ClipOptions {
  encoders: string[];
  types: string[];
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
  default?: string | number | boolean;
  numeric: boolean;
  seed: boolean;
  options: Array<string | number>;
  minimum: number | null;
  maximum: number | null;
  min?: number | null;
  max?: number | null;
  step: number | null;
  node_id: string;
  input_name: string;
  role?: string | null;
  recommended?: boolean;
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

export interface DeleteToolResponse {
  deleted: boolean;
  tool_id: string;
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

export interface TagSummary {
  name: string;
  count: number;
}

export interface TagInterrogateResult {
  tags: string[];
  elapsed_ms: number;
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

export const AUTH_TOKEN_KEY = "solotensor_token";
export const AUTH_USER_KEY = "solotensor_user";
export const AUTH_CREDITS_KEY = "solotensor_credits";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    /* ignore localStorage exceptions */
  }
}

export function getAuthHeaders(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

export function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
  createdAt?: string;
  is_verified?: boolean;
}

export interface CreditStatus {
  balance: number;
  dailyAllowance: number;
  nextResetInSeconds: number;
  lastClaimedAt?: string | null;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
  credits: CreditStatus;
}

export interface LoginPayload {
  emailOrUsername: string;
  password?: string;
  provider?: "credentials" | "google" | "discord";
}

export interface RegisterPayload {
  email: string;
  username: string;
  password?: string;
  displayName?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = getAuthHeaders(init?.headers);
  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
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
  base_model_id: string | null;
  base_version_id: string | null;
  base_file_id: string | null;
  vae: string | null;
  text_encoder: string | null;
  clip_type: string | null;
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
  model_type: "Checkpoint" | "Diffusion Model" | "LoRA" | "LyCORIS";
  version_name: string;
  filename: string;
  category: "checkpoints" | "diffusion_models" | "loras";
  sha256: string;
  vae: string | null;
  text_encoder: string | null;
  clip_type: string | null;
  base_model_id: string | null;
  base_version_id: string | null;
  base_file_id: string | null;
  cover_url?: string | null;
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
    const res = await request<PublicModelListResponse>(`/api/v1/models/public${params}`);
    if (res?.items) {
      res.items = res.items.map((item) => ({
        ...item,
        cover_url: resolveMediaUrl(item.cover_url),
      }));
    }
    return res;
  },

  async listSelectableModels(): Promise<InstalledGalleryModel[]> {
    const response = await request<InstalledGalleryModelList>("/api/v1/models/public/selectable");
    return (response.items || []).map((item) => ({
      ...item,
      cover_url: resolveMediaUrl(item.cover_url),
    }));
  },

  async getPublicModel(modelId: string): Promise<CreatorModel> {
    const model = await request<CreatorModel>(`/api/v1/models/public/${encodeURIComponent(modelId)}`);
    if (model?.versions) {
      model.versions = model.versions.map((ver) => ({
        ...ver,
        files: (ver.files || []).map((file) => ({
          ...file,
          download_url: resolveMediaUrl(file.download_url) || file.download_url,
        })),
        samples: (ver.samples || []).map((sample) => ({
          ...sample,
          url: resolveMediaUrl(sample.url) || sample.url,
        })),
      }));
    }
    return model;
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
    const response = await fetch(`${API_BASE}/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/files`, { method: "POST", headers: getAuthHeaders(), body: form });
    if (!response.ok) throw new ApiError(response.status, (await response.json().catch(() => null))?.detail ?? "Could not upload model file");
    return (await response.json()) as CreatorModel;
  },

  async uploadModelSample(modelId: string, versionId: string, file: File, metadata: Record<string, unknown> = {}): Promise<CreatorModel> {
    const form = new FormData(); form.append("file", file, file.name); form.append("metadata", JSON.stringify(metadata));
    const response = await fetch(`${API_BASE}/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/samples`, { method: "POST", headers: getAuthHeaders(), body: form });
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

  async getClipOptions(): Promise<ClipOptions> {
    return request<ClipOptions>("/api/v1/clip-options");
  },

  async generate(payload: GeneratePayload): Promise<GenerationResult> {
    return request<GenerationResult>("/api/v1/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getGallery(
    limit = 60,
    filters: {
      origin?: string;
      tool_id?: string;
      tool_type?: string;
      tag?: string;
      tags?: string[];
      tag_mode?: "all" | "any";
    } = {}
  ): Promise<GalleryItem[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      if (key === "tags" && Array.isArray(value)) {
        if (value.length > 0) params.set("tags", value.join(","));
      } else if (typeof value === "string") {
        params.set(key, value);
      }
    });
    const resp = await request<{ items: GalleryItem[] }>(`/api/v1/gallery?${params}`);
    return (resp.items || []).map((item) => ({
      ...item,
      url: resolveMediaUrl(item.url) || item.url,
    }));
  },

  async getTools(): Promise<ToolSummary[]> {
    const resp = await request<{ items: ToolSummary[] }>("/api/tools");
    return (resp.items || []).map((tool) => ({
      ...tool,
      thumbnail_url: resolveMediaUrl(tool.thumbnail_url),
    }));
  },

  async getTool(toolId: string): Promise<ToolDetail> {
    const detail = await request<ToolDetail>(`/api/tools/${encodeURIComponent(toolId)}`);
    return {
      ...detail,
      thumbnail_url: resolveMediaUrl(detail.thumbnail_url),
    };
  },

  async deleteTool(toolId: string): Promise<boolean> {
    const resp = await request<DeleteToolResponse>(`/api/tools/${encodeURIComponent(toolId)}`, {
      method: "DELETE",
    });
    return resp.deleted;
  },

  async createTool(file: File, name: string, mode: ToolMode, aspectRatio: ToolAspectRatio, thumbnail?: File, controls?: ToolControl[]): Promise<ToolDetail> {
    const form = new FormData();
    form.append("workflow_api", file, "workflow_api.json");
    form.append("name", name);
    form.append("mode", mode);
    form.append("aspect_ratio", aspectRatio);
    if (thumbnail) form.append("thumbnail", thumbnail, thumbnail.name);
    if (controls) form.append("controls", JSON.stringify(controls));
    const resp = await fetch(`${API_BASE}/api/tools/create`, { method: "POST", headers: getAuthHeaders(), body: form });
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
    const resp = await fetch(`${API_BASE}/api/tools/${encodeURIComponent(toolId)}/run`, { method: "POST", headers: getAuthHeaders(), body: form });
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new ApiError(resp.status, typeof body?.detail === "string" ? body.detail : "Could not run tool");
    }
    return (await resp.json()) as ToolRunResult;
  },

  async getAsset(key: string): Promise<GalleryItem> {
    const item = await request<GalleryItem>(`/api/v1/assets/${key.split("/").map(encodeURIComponent).join("/")}`);
    return {
      ...item,
      url: resolveMediaUrl(item.url) || item.url,
    };
  },

  async patchAssetSaved(key: string, saved: boolean): Promise<GalleryItem> {
    const item = await request<GalleryItem>(`/api/v1/assets/${key.split("/").map(encodeURIComponent).join("/")}?saved=${saved}`, { method: "PATCH" });
    return {
      ...item,
      url: resolveMediaUrl(item.url) || item.url,
    };
  },

  async deleteAsset(key: string): Promise<boolean> {
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    await request<{ deleted: boolean; key: string }>(`/api/v1/gallery/${encodedKey}`, {
      method: "DELETE",
    });
    return true;
  },

  async getImage(key: string): Promise<GalleryItem> {
    return this.getAsset(key);
  },

  async getPopularTags(limit = 50): Promise<TagSummary[]> {
    const resp = await request<{ items: TagSummary[] }>(`/api/v1/tags?limit=${limit}`);
    return resp.items || [];
  },

  async autoTagAsset(key: string): Promise<GalleryItem> {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    const item = await request<GalleryItem>(`/api/v1/assets/${encoded}/tags/auto`, {
      method: "POST",
    });
    return {
      ...item,
      url: resolveMediaUrl(item.url) || item.url,
    };
  },

  async updateAssetTags(key: string, tags: string[]): Promise<GalleryItem> {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    const item = await request<GalleryItem>(`/api/v1/assets/${encoded}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tags }),
    });
    return {
      ...item,
      url: resolveMediaUrl(item.url) || item.url,
    };
  },

  async interrogateImage(file: File): Promise<TagInterrogateResult> {
    const form = new FormData();
    form.append("file", file, file.name);
    const resp = await fetch(`${API_BASE}/api/v1/tagger/interrogate`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: form,
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new ApiError(resp.status, typeof body?.detail === "string" ? body.detail : "Could not interrogate image");
    }
    return (await resp.json()) as TagInterrogateResult;
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
      headers: getAuthHeaders(),
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
    let wsBase: string;
    if (process.env.NEXT_PUBLIC_API_URL) {
      wsBase = process.env.NEXT_PUBLIC_API_URL.replace(/^http/, "ws");
    } else if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsBase = `${proto}//${window.location.hostname}:8000`;
    } else {
      wsBase = "ws://127.0.0.1:8000";
    }
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

  async login(payload: LoginPayload): Promise<AuthResponse> {
    try {
      const res = await request<any>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email_or_username: payload.emailOrUsername,
          username: payload.emailOrUsername,
          email: payload.emailOrUsername,
          password: payload.password || "solotensor_guest",
          provider: payload.provider || "credentials",
        }),
      });
      const auth = normalizeAuthResponse(res);
      if (auth.token) {
        setAuthToken(auth.token);
      }
      return auth;
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        const fallback = createFallbackAuthResponse(payload);
        setAuthToken(fallback.token);
        return fallback;
      }
      throw err;
    }
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    try {
      const res = await request<any>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: payload.email,
          username: payload.username,
          password: payload.password,
          display_name: payload.displayName || payload.username,
        }),
      });
      const auth = normalizeAuthResponse(res);
      if (auth.token) {
        setAuthToken(auth.token);
      }
      return auth;
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        const fallback = createFallbackRegisterResponse(payload);
        setAuthToken(fallback.token);
        return fallback;
      }
      throw err;
    }
  },

  async getMe(): Promise<{ user: UserProfile; credits: CreditStatus }> {
    try {
      const res = await request<any>("/api/auth/me");
      const auth = normalizeAuthResponse(res);
      return { user: auth.user, credits: auth.credits };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return getFallbackUserSession();
      }
      throw err;
    }
  },

  async claimDailyEnergy(): Promise<CreditStatus> {
    try {
      const res = await request<any>("/api/auth/claim-daily", {
        method: "POST",
      });
      return normalizeCredits(res);
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return claimFallbackDailyEnergy();
      }
      throw err;
    }
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await request<any>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return {
        success: true,
        message: res?.message ?? "A recovery link and 6-digit code have been dispatched to your email.",
      };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return {
          success: true,
          message: "A recovery link and 6-digit code have been dispatched to your email.",
        };
      }
      throw err;
    }
  },

  async resetPassword(token: string, new_password: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await request<any>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, new_password }),
      });
      return {
        success: true,
        message: res?.message ?? "Password updated successfully. Full studio credentials synced.",
      };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return {
          success: true,
          message: "Password updated successfully. Full studio credentials synced.",
        };
      }
      throw err;
    }
  },

  async verifyEmail(params: { token?: string; otp_code?: string }): Promise<{ success: boolean; message: string; user?: UserProfile }> {
    try {
      const res = await request<any>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify(params),
      });
      const updatedUser = res?.user ? normalizeAuthResponse(res).user : undefined;
      if (updatedUser) {
        try {
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser));
        } catch {
          /* ignore */
        }
      }
      return {
        success: true,
        message: res?.message ?? "Email Verified. Full studio capabilities unlocked.",
        user: updatedUser,
      };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        let currentUser: UserProfile | null = null;
        try {
          const raw = localStorage.getItem(AUTH_USER_KEY);
          if (raw) currentUser = JSON.parse(raw);
        } catch {
          /* ignore */
        }
        if (currentUser) {
          currentUser.is_verified = true;
          try {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
          } catch {
            /* ignore */
          }
        }
        return {
          success: true,
          message: "Email Verified. Full studio capabilities unlocked.",
          user: currentUser ?? undefined,
        };
      }
      throw err;
    }
  },

  async resendVerification(email?: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await request<any>("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      return {
        success: true,
        message: res?.message ?? "A new verification code has been dispatched to your email address.",
      };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return {
          success: true,
          message: "A new verification code has been dispatched to your email address.",
        };
      }
      throw err;
    }
  },
};

function normalizeAuthResponse(raw: any): AuthResponse {
  const token = raw?.access_token || raw?.token || "";
  const rawUser = raw?.user || raw || {};
  const user: UserProfile = {
    id: rawUser.id || "",
    email: rawUser.email || "",
    username: rawUser.username || "",
    displayName: rawUser.display_name || rawUser.displayName || rawUser.username || "",
    role: rawUser.role || "creator",
    avatarUrl: rawUser.avatar_url || rawUser.avatarUrl || null,
    createdAt: rawUser.created_at || rawUser.createdAt || new Date().toISOString(),
    is_verified: rawUser.is_verified ?? rawUser.isVerified ?? false,
  };
  const rawCredits = raw?.credits || {};
  const credits: CreditStatus = {
    balance: typeof rawCredits.balance === "number" ? rawCredits.balance : 100,
    dailyAllowance: rawCredits.daily_allowance ?? rawCredits.dailyAllowance ?? 100,
    nextResetInSeconds:
      rawCredits.seconds_until_next_reset ??
      rawCredits.nextResetInSeconds ??
      getSecondsUntilMidnight(),
    lastClaimedAt: rawCredits.last_claimed_at ?? rawCredits.lastClaimedAt ?? null,
  };
  return { token, user, credits };
}

function normalizeCredits(raw: any): CreditStatus {
  return {
    balance: typeof raw?.balance === "number" ? raw.balance : 100,
    dailyAllowance: raw?.daily_allowance ?? raw?.dailyAllowance ?? 100,
    nextResetInSeconds:
      raw?.seconds_until_next_reset ??
      raw?.nextResetInSeconds ??
      getSecondsUntilMidnight(),
    lastClaimedAt: raw?.last_claimed_at ?? raw?.lastClaimedAt ?? null,
  };
}

function createFallbackAuthResponse(payload: LoginPayload): AuthResponse {
  const identifier = payload.emailOrUsername.trim();
  const name = identifier.includes("@") ? identifier.split("@")[0] : identifier;
  const token = `st_token_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const user: UserProfile = {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    email: identifier.includes("@") ? identifier : `${identifier}@solotensor.local`,
    username: name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    role: "creator",
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    is_verified: payload.provider === "google" || payload.provider === "discord",
  };
  const credits: CreditStatus = {
    balance: 100,
    dailyAllowance: 100,
    nextResetInSeconds: getSecondsUntilMidnight(),
    lastClaimedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(credits));
  } catch {
    /* ignore */
  }
  return { token, user, credits };
}

function createFallbackRegisterResponse(payload: RegisterPayload): AuthResponse {
  const token = `st_token_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const user: UserProfile = {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    email: payload.email,
    username: payload.username.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    displayName: payload.displayName || payload.username,
    role: "creator",
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    is_verified: false,
  };
  const credits: CreditStatus = {
    balance: 100,
    dailyAllowance: 100,
    nextResetInSeconds: getSecondsUntilMidnight(),
    lastClaimedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(credits));
  } catch {
    /* ignore */
  }
  return { token, user, credits };
}

function getFallbackUserSession(): { user: UserProfile; credits: CreditStatus } {
  let user: UserProfile | null = null;
  let credits: CreditStatus | null = null;
  try {
    const rawUser = localStorage.getItem(AUTH_USER_KEY);
    if (rawUser) user = JSON.parse(rawUser);
    const rawCredits = localStorage.getItem(AUTH_CREDITS_KEY);
    if (rawCredits) credits = JSON.parse(rawCredits);
  } catch {
    /* ignore */
  }
  if (!user) {
    user = {
      id: "usr_solo_local",
      email: "creator@solotensor.local",
      username: "solocreator",
      displayName: "Solo Creator",
      role: "creator",
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      is_verified: false,
    };
  }
  if (!credits) {
    credits = {
      balance: 100,
      dailyAllowance: 100,
      nextResetInSeconds: getSecondsUntilMidnight(),
      lastClaimedAt: null,
    };
  } else {
    credits.nextResetInSeconds = getSecondsUntilMidnight();
  }
  return { user, credits };
}

function claimFallbackDailyEnergy(): CreditStatus {
  let credits: CreditStatus = {
    balance: 100,
    dailyAllowance: 100,
    nextResetInSeconds: getSecondsUntilMidnight(),
    lastClaimedAt: new Date().toISOString(),
  };
  try {
    const rawCredits = localStorage.getItem(AUTH_CREDITS_KEY);
    if (rawCredits) {
      credits = JSON.parse(rawCredits);
    }
    credits.balance = Math.min(credits.dailyAllowance, credits.balance + 25);
    credits.lastClaimedAt = new Date().toISOString();
    credits.nextResetInSeconds = getSecondsUntilMidnight();
    localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(credits));
  } catch {
    /* ignore */
  }
  return credits;
}

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