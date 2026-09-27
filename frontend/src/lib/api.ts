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
  negative_prompt: string;
  seed: number;
  steps: number;
  image_count?: number;
  cfg?: number;
  denoise?: number;
  width: number;
  height: number;
  format_name: string;
  unet_name: string;
  clip_name: string;
  vae_name: string;
  loras?: LoraSelection[];
  created_at: string;
  elapsed_ms: number;
  source_filename: string;
}

export interface GalleryItem {
  key: string;
  url: string;
  size: number;
  last_modified: string;
  metadata: GenerationMetadata | null;
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

  async getGallery(limit = 60): Promise<GalleryItem[]> {
    const resp = await request<{ items: GalleryItem[] }>(
      `/api/v1/gallery?limit=${limit}`
    );
    return resp.items;
  },

  async getImage(key: string): Promise<GalleryItem> {
    return request<GalleryItem>(`/api/v1/images/${key.split("/").map(encodeURIComponent).join("/")}`);
  },

  async getModels(category: ModelCategory): Promise<string[]> {
    return request<string[]>(`/api/v1/models/${category}`);
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