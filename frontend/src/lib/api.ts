/**
 * Typed client for the Comfy Studio FastAPI backend.
 * Uses native fetch + WebSocket (no axios dependency needed).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type GenerationMode = "text-to-image" | "image-to-image";

export type ModelCategory = "diffusion_models" | "text_encoders" | "vae" | "loras";

export interface LoraSelection {
  lora: string;
  on: boolean;
  strength: number;
}

export interface GeneratePayload {
  mode: GenerationMode;
  prompt: string;
  negative_prompt?: string;
  unet_name: string;
  clip_name: string;
  vae_name: string;
  loras: LoraSelection[];
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
}

export interface ToolControl {
  id: string;
  path: string;
  label: string;
  kind: "prompt" | "text" | "seed" | "number" | "sampler";
  value: string | number;
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
  return (await resp.json()) as T;
}

export const api = {
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

  async runTool(toolId: string, prompt: string, aspectRatio: ToolAspectRatio, image?: File): Promise<ToolRunResult> {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("aspect_ratio", aspectRatio);
    if (image) form.append("input_image", image, image.name);
    const resp = await fetch(`${API_BASE}/api/tools/${encodeURIComponent(toolId)}/run`, { method: "POST", body: form });
    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new ApiError(resp.status, typeof body?.detail === "string" ? body.detail : "Could not run tool");
    }
    return (await resp.json()) as ToolRunResult;
  },

  async getImage(key: string): Promise<GalleryItem> {
    return request<GalleryItem>(`/api/v1/images/${key.split("/").map(encodeURIComponent).join("/")}`);
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