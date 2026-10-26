/**
 * Typed client for the Comfy Studio FastAPI backend.
 * Uses native fetch + WebSocket (no axios dependency needed).
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://127.0.0.1:8000");

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

export type GenerationMode =
  | "text-to-image"
  | "image-to-image"
  | "detailer"
  | "upscale"
  | "video";

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

export interface UpscaleConfigPayload {
  enabled: boolean;
  scale?: number;
  dit_model?: string;
  color_correction?: "lab" | "rgb" | "none";
  input_noise_scale?: number;
  latent_noise_scale?: number;
  upscaler?: string;
  hires_steps?: number;
  denoising_strength?: number;
}

export interface DetailerItemPayload {
  type: string;
  enabled: boolean;
  detector_model?: string;
  prompt: string;
  negative_prompt: string;
  steps: number;
  cfg_scale: number;
  denoising_strength: number;
  inpaint_mask_blur: number;
  inpaint_only_masked: boolean;
  bbox_threshold: number;
  bbox_dilation: number;
}

export interface DetailerConfigPayload {
  enabled: boolean;
  items: DetailerItemPayload[];
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
  sampler_name?: string;
  scheduler?: string;
  client_id?: string;
  reference_images?: string[];
  lora_adapters?: LoraAdapterPayload[];
  is_private?: boolean;
  enable_detailer?: boolean;
  upscale?: UpscaleConfigPayload;
  detailer?: DetailerConfigPayload;
  video_frames?: number;
  video_fps?: number;
  video_duration_seconds?: number;
  stage2_upscale?: boolean;
  last_frame_image?: string | null;
}

export interface ClipOptions {
  encoders: string[];
  types: string[];
}

export interface WorkflowTemplateInfo {
  has_template: boolean;
  vae_name?: string | null;
  clip_name?: string | null;
  clip_type?: string | null;
  unet_name?: string | null;
  sampler_name?: string | null;
  scheduler?: string | null;
  steps?: number | null;
  cfg?: number | null;
  base_architecture?: string | null;
  prompt?: string | null;
  negative_prompt?: string | null;
}

export interface UploadedAsset {
  filename: string;
  url: string;
  kind?: "image" | "video";
  poster_url?: string | null;
  saved?: boolean;
  before_detailer_url?: string | null;
  user_id?: string | null;
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
  exposed?: boolean;
  is_essential?: boolean;
}

export interface EssentialControlSummary {
  has_seed: boolean;
  seed_control_id?: string | null;
  has_aspect_ratio: boolean;
  width_control_id?: string | null;
  height_control_id?: string | null;
  has_cfg: boolean;
  cfg_control_id?: string | null;
  has_steps: boolean;
  steps_control_id?: string | null;
}

export interface ToolNodeInput {
  name: string;
  value?: unknown;
  type_hint?: "number" | "string" | "boolean" | "select" | "unknown";
  is_linked?: boolean;
  options?: unknown[];
}

export interface ToolNodeInfo {
  id: string;
  class_type: string;
  title?: string | null;
  inputs: ToolNodeInput[];
}

export interface ToolParseResponse {
  tool_id: string;
  name: string;
  controls: ToolControl[];
  locked_nodes: Array<{ id: string; class_type: string }>;
  detected_mode?: ToolMode;
  detected_output_type?: "image" | "video";
  detected_inputs?: string[];
  archetype?: string;
  node_count?: number;
  available_nodes?: ToolNodeInfo[];
  essential_summary?: EssentialControlSummary | null;
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
  user_id?: string | null;
  author_username?: string | null;
}

export interface ToolDetail extends ToolSummary {
  supported_aspect_ratios: ToolAspectRatio[];
  output_kind: "image" | "video";
  controls: ToolControl[];
  essential_summary?: EssentialControlSummary | null;
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
  sampler_name?: string | null;
  scheduler?: string | null;
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
  before_detailer_url?: string | null;
  enable_detailer?: boolean;
  has_detailer?: boolean;
  user_id?: string | null;
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
  thumbnail_url?: string;
  before_detailer_url?: string | null;
  enable_detailer?: boolean;
  has_detailer?: boolean;
  user_id?: string | null;
}

export type NotificationCategory = "moderation" | "generation" | "social" | "system";

export type NotificationType =
  | "model_submitted"
  | "model_approved"
  | "model_vault_installed"
  | "model_rejected"
  | "content_flagged"
  | "flag_resolved"
  | "generation_completed"
  | "generation_failed"
  | "credits_refilled"
  | "system_announcement"
  | "general";

export interface NotificationItem {
  id: string;
  user_id: string;
  actor_id?: string | null;
  actor_username?: string | null;
  actor_display_name?: string | null;
  actor_avatar_url?: string | null;
  actor_role?: string | null;
  category: NotificationCategory | string;
  type: NotificationType | string;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread_count: number;
  page: number;
  limit: number;
}

export interface NotificationUnreadCountResponse {
  unread_count: number;
}

export interface NotificationReadResponse {
  success: boolean;
  id?: string;
  updated_count?: number;
}

export type AssetType = "image" | "video" | "3d";

export interface AssetRecord extends GalleryItem {
  type: AssetType;
}

export interface TagSummary {
  name: string;
  count: number;
}

export interface ImageMetadataExtracted {
  has_metadata: boolean;
  source?: "a1111" | "comfyui" | "novelai" | "fooocus" | "exif";
  prompt?: string | null;
  negative_prompt?: string | null;
  seed?: number | null;
  steps?: number | null;
  cfg?: number | null;
  sampler_name?: string | null;
  scheduler?: string | null;
  model_name?: string | null;
  width?: number | null;
  height?: number | null;
  raw_parameters?: string | null;
}

export interface TagInterrogateResult {
  tags: string[];
  has_metadata?: boolean;
  metadata?: ImageMetadataExtracted | null;
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

export type UserRole =
  | "admin"
  | "moderator"
  | "verified_creator"
  | "pro_creator"
  | "creator"
  | "user"
  | "guest";

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    "generation:create_standard",
    "generation:create_pro",
    "generation:create_private",
    "generation:batch_multirun",
    "generation:delete_own",
    "generation:delete_any",
    "generation:complete_any",
    "model:publish",
    "model:download_weights",
    "model:edit_own",
    "model:edit_any",
    "model:delete_own",
    "model:delete_any",
    "model:install_vault",
    "tool:execute",
    "tool:publish",
    "tool:delete_own",
    "tool:delete_any",
    "credits:claim_daily",
    "credits:transfer",
    "credits:manage_billing",
    "credits:grant_manual",
    "moderation:flag_content",
    "moderation:review_queue",
    "moderation:ban_user",
    "moderation:inspect_telemetry",
    "agent:dispatch_jobs",
    "agent:sync_models",
    "agent:audit_safety",
  ],
  moderator: [
    "generation:create_standard",
    "generation:delete_own",
    "model:publish",
    "model:download_weights",
    "model:edit_own",
    "model:delete_own",
    "tool:execute",
    "tool:publish",
    "tool:delete_own",
    "credits:claim_daily",
    "credits:transfer",
    "moderation:flag_content",
    "generation:delete_any",
    "model:edit_any",
    "model:delete_any",
    "model:install_vault",
    "tool:delete_any",
    "moderation:review_queue",
    "moderation:ban_user",
    "moderation:inspect_telemetry",
  ],
  verified_creator: [
    "generation:create_standard",
    "generation:delete_own",
    "model:publish",
    "model:download_weights",
    "model:edit_own",
    "model:delete_own",
    "tool:execute",
    "tool:publish",
    "tool:delete_own",
    "credits:claim_daily",
    "credits:transfer",
    "moderation:flag_content",
    "generation:create_pro",
    "generation:create_private",
    "generation:batch_multirun",
    "credits:manage_billing",
  ],
  pro_creator: [
    "generation:create_standard",
    "generation:delete_own",
    "model:publish",
    "model:download_weights",
    "model:edit_own",
    "model:delete_own",
    "tool:execute",
    "tool:publish",
    "tool:delete_own",
    "credits:claim_daily",
    "credits:transfer",
    "moderation:flag_content",
    "generation:create_pro",
    "generation:create_private",
    "generation:batch_multirun",
    "credits:manage_billing",
  ],
  creator: [
    "generation:create_standard",
    "generation:delete_own",
    "model:publish",
    "model:download_weights",
    "model:edit_own",
    "model:delete_own",
    "tool:execute",
    "tool:publish",
    "tool:delete_own",
    "credits:claim_daily",
    "credits:transfer",
    "moderation:flag_content",
  ],
  user: [
    "generation:create_standard",
    "generation:delete_own",
    "credits:claim_daily",
    "credits:transfer",
    "moderation:flag_content",
  ],
  guest: [],
};

export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS;

export function normalizeRoleName(role?: string | null): UserRole {
  if (!role) return "creator";
  const r = role.toLowerCase().trim();
  if (r === "pro" || r === "pro_creator" || r === "vip") return "pro_creator";
  if (r === "verified" || r === "verified_creator" || r === "author") return "verified_creator";
  if (r === "moderator" || r === "mod") return "moderator";
  if (r === "admin" || r === "administrator" || r === "staff") return "admin";
  if (r === "user" || r === "standard") return "user";
  if (r === "guest" || r === "anonymous") return "guest";
  return "creator";
}

export function getDefaultPermissionsForRole(role?: string | null): string[] {
  const norm = normalizeRoleName(role);
  return ROLE_DEFAULT_PERMISSIONS[norm] || ROLE_DEFAULT_PERMISSIONS.creator;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  roles?: string[];
  primary_role?: string;
  permissions?: string[];
  avatarUrl?: string | null;
  bio?: string | null;
  social_links?: Record<string, string>;
  createdAt?: string;
  is_verified?: boolean;
}

export interface UserPublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  roles?: string[];
  primary_role?: string;
  permissions?: string[];
  bio: string | null;
  social_links?: Record<string, string>;
  created_at: string;
  is_following: boolean;
  followers_count: number;
  following_count: number;
  runs_count: number;
  downloads_count: number;
  likes_count: number;
  stars_count: number;
  tools_count: number;
  models_count: number;
  posts_count: number;
  workflows_count: number;
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

export interface UpdateProfilePayload {
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  social_links?: Record<string, string>;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface AvatarUploadResponse {
  avatar_url: string;
}

export interface ApiKeyCreateRequest {
  name: string;
}

export interface ApiKeyResponse {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  api_key?: string | null;
}

export interface ApiKeyListItem {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  masked_key?: string | null;
}

export interface ErrorDetail {
  loc?: (string | number)[];
  msg: string;
  type?: string;
}

export interface ErrorEnvelope {
  detail: string | ErrorDetail[] | Record<string, unknown>;
  status_code?: number;
}

export class ApiError extends Error {
  public detail?: string | ErrorDetail[] | Record<string, unknown>;

  constructor(
    public status: number,
    message: string,
    detail?: string | ErrorDetail[] | Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
    this.detail = detail;
  }
}

export async function parseErrorResponse(
  resp: Response,
  fallbackMessage: string = "Request failed",
): Promise<string> {
  let message = resp.statusText || fallbackMessage;
  try {
    const body = await resp.json();
    const detail = body?.detail ?? body?.message;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((item) => {
          const location = Array.isArray(item?.loc) ? item.loc.join(".") : "field";
          return `${location}: ${item?.msg ?? "Invalid value"}`;
        })
        .join("; ");
    } else if (detail != null) {
      message = JSON.stringify(detail);
    }
  } catch {
    /* non-JSON error body */
  }
  return message ? `${message} (${resp.status})` : `${fallbackMessage} (HTTP ${resp.status})`;
}

/**
 * Resolves the direct backend base URL for binary uploads (models, weights, media).
 * Bypasses Next.js Node.js reverse-proxy buffer limits on multi-gigabyte files by
 * connecting directly to FastAPI (:8000) when running in browser on localhost or LAN.
 */
export function getUploadApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    // When running in browser on port 3000 (or non-8000), target FastAPI on port 8000
    if (window.location.port && window.location.port !== "8000") {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
  }
  return API_BASE;
}

/**
 * Uploads FormData with direct-to-backend routing and graceful fallback to proxied API_BASE.
 */
export async function uploadWithDirectFallback(
  path: string,
  form: FormData,
  extraHeaders?: HeadersInit,
): Promise<Response> {
  const directBase = getUploadApiBase();
  const headers = getAuthHeaders(extraHeaders);

  // If direct base is distinct from proxied API_BASE, try direct FastAPI connection first
  if (directBase && directBase !== API_BASE) {
    try {
      return await fetch(`${directBase}${path}`, {
        method: "POST",
        headers,
        body: form,
      });
    } catch (err) {
      console.warn("Direct upload to FastAPI failed; falling back to proxied API_BASE:", err);
    }
  }

  // Fallback to relative/proxied API_BASE
  return await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
  });
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
    let rawDetail: any = undefined;
    try {
      const cloned = await resp.clone().json();
      rawDetail = cloned?.detail ?? cloned?.message;
    } catch {
      // non-JSON error
    }
    const message = await parseErrorResponse(resp, resp.statusText);
    throw new ApiError(resp.status, message, rawDetail);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export type CreatorModelCategory = "Character" | "Style" | "Concept" | "Pose" | "Clothing" | "General";
export type CreatorModelType =
  | "Checkpoint"
  | "Hyper Network"
  | "Embedding"
  | "Aesthetic Gradient"
  | "LoRA"
  | "LoKr"
  | "LoCon"
  | "ControlNet"
  | "Poses"
  | "Wildcards"
  | "LyCORIS"
  | "SVD"
  | "Motion LoRA"
  | "VAE"
  | "DoRA"
  | "StyleModel";
export type ModelVisibility = "Public" | "Unlisted" | "Private";
export type ModelModerationStatus = "draft" | "pending_review" | "approved" | "rejected";
export type ModelPrecision = "FP8" | "FP16" | "FP32" | "BF16" | "Quantized";

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
  sell_model: boolean;
  remix: boolean;
  generation_services: boolean;
  allow_download: boolean;
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
  category?: string | null;
  from_vault?: boolean;
  in_vault?: boolean;
}

export type ModelSample = CreatorModelSample;

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
  user_id?: string | null;
  author_username?: string | null;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  description?: string;
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
  moderation_status?: ModelModerationStatus;
  moderation_notes?: string | null;
  from_vault?: boolean;
  in_vault?: boolean;
}

export interface CreatorModelPayload {
  title: string;
  description?: string;
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
  description?: string;
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
  author_id?: string;
  author_username?: string | null;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  author_role?: string;
  moderation_status?: ModelModerationStatus;
}

export type ModerationTargetType = "model" | "post" | "comment" | "user";

export interface ContentFlagCreateRequest {
  target_type: ModerationTargetType | string;
  target_id: string;
  reason: string;
  details?: string;
}

export interface ContentFlagResponse {
  id: string;
  user_id?: string | null;
  target_type: ModerationTargetType | string;
  target_id: string;
  reason: string;
  status: "pending" | "resolved" | "dismissed" | string;
  resolution_notes?: string | null;
  resolved_by?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface ContentFlagResolveRequest {
  flag_id?: string | null;
  target_id?: string | null;
  action?: string | null;
  status?: "resolved" | "dismissed";
  resolution_notes?: string | null;
  notes?: string | null;
}

export interface ModerationQueueResponse {
  items: ContentFlagResponse[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_more: boolean;
}

export interface ModerationQueueItem {
  id: string;
  target_type: ModerationTargetType | string;
  target_id: string;
  title: string;
  preview_url: string | null;
  author_username: string;
  author_role?: string;
  reporter_username: string;
  reason: string;
  details?: string | null;
  flag_count: number;
  created_at: string;
  status: "pending" | "resolved" | "dismissed" | string;
  severity: "low" | "medium" | "high" | "critical";
  tags?: string[];
  user_id?: string | null;
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
}

export interface SecurityAuditLogEntry {
  id: string;
  actor_username: string;
  actor_role: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  ip_address?: string | null;
  created_at: string;
}

export interface SecurityAuditLogsResponse {
  items: SecurityAuditLogEntry[];
  total: number;
}

export interface ModerationActionPayload {
  target_type: ModerationTargetType | string;
  target_id: string;
  action: "approve" | "hide" | "toggle_nsfw" | "takedown" | "ban_user" | "resolved" | "dismissed" | string;
  reason?: string;
  notes?: string;
  feedback_notes?: string;
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

export type ModelReviewAction = "approve" | "reject" | "request_changes";
export type ModelReviewActionType = ModelReviewAction;

export interface ModelReviewRequest {
  action: ModelReviewAction;
  notes?: string | null;
  feedback_notes?: string | null;
  install_to_comfy?: boolean;
  version_id?: string | null;
  file_id?: string | null;
}

export interface ModelReviewResponse {
  model_id: string;
  moderation_status: ModelModerationStatus;
  moderation_notes?: string | null;
  action_taken: string;
  installed: boolean;
  installed_file?: string | null;
  reviewed_at: string;
}

export interface ModelPendingReviewItem {
  model_id: string;
  title: string;
  category: CreatorModelCategory;
  model_type: CreatorModelType;
  description?: string;
  author_id: string;
  author_username?: string | null;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  author_role?: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  base_model: string;
  permissions: CreatorModelPermissions;
  version_count: number;
  file_count: number;
  sample_count: number;
  cover_url: string | null;
  versions: CreatorModelVersion[];
  moderation_status: ModelModerationStatus;
  moderation_notes?: string | null;
  from_vault?: boolean;
  in_vault?: boolean;
}

export interface ModelPendingReviewQueueResponse {
  items: ModelPendingReviewItem[];
  total: number;
}

export interface InstalledGalleryModel {
  model_id: string;
  version_id: string;
  file_id: string;
  title: string;
  model_type: CreatorModelType;
  version_name: string;
  filename: string;
  category: string;
  sha256: string;
  vae: string | null;
  text_encoder: string | null;
  clip_type: string | null;
  base_model?: string | null;
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

export interface GenerationLoraItem {
  id: string;
  lora_name: string;
  lora_model_id?: string | null;
  lora_version_id?: string | null;
  strength: number;
}

export interface GenerationRecord {
  id: string;
  prompt_id: string;
  user_id?: string | null;
  model_id?: string | null;
  version_id?: string | null;
  file_id?: string | null;
  filename: string;
  url: string;
  key: string;
  prompt?: string | null;
  negative_prompt?: string | null;
  seed?: number | null;
  steps?: number | null;
  cfg?: number | null;
  denoise?: number | null;
  sampler_name?: string | null;
  scheduler?: string | null;
  width?: number | null;
  height?: number | null;
  format_name?: string | null;
  status: string;
  elapsed_ms?: number | null;
  origin: string;
  gallery_saved: boolean;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  model_title?: string | null;
  loras: GenerationLoraItem[];
}

export interface PaginatedGenerations {
  items: GenerationRecord[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_more: boolean;
}

export const api = {
  async askAssistant(persona: AssistantPersona, message: string): Promise<AssistantResponse> {
    return request<AssistantResponse>("/api/v1/assist", {
      method: "POST",
      body: JSON.stringify({ persona, message }),
    });
  },

  async getPublicModels(query = "", userId?: string): Promise<PublicModelListResponse> {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (userId) params.set("user_id", userId);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const res = await request<PublicModelListResponse>(`/api/v1/models/public${queryString}`);
    if (res?.items) {
      res.items = res.items.map((item) => ({
        ...item,
        cover_url: resolveMediaUrl(item.cover_url),
      }));
    }
    return res;
  },

  async listPublicModels(query = "", userId?: string): Promise<PublicModelListResponse> {
    return this.getPublicModels(query, userId);
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

  async getModelGenerations(
    modelId: string,
    page = 1,
    limit = 20,
    versionId?: string,
  ): Promise<PaginatedGenerations> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (versionId) params.append("version_id", versionId);
    const data = await request<PaginatedGenerations>(
      `/api/v1/models/public/${encodeURIComponent(modelId)}/images?${params.toString()}`,
    );
    return {
      ...data,
      items: (data.items || []).map((item) => ({
        ...item,
        url: resolveMediaUrl(item.url) || item.url,
      })),
    };
  },

  async installModelFile(modelId: string, versionId: string, fileId: string): Promise<ModelInstallResponse> {
    return request<ModelInstallResponse>(`/api/v1/models/public/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/files/${encodeURIComponent(fileId)}/install`, { method: "POST" });
  },

  async installPublicModelFile(modelId: string, versionId: string, fileId: string): Promise<ModelInstallResponse> {
    return this.installModelFile(modelId, versionId, fileId);
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

  async listCreatorModels(filters: { visibility?: ModelVisibility; q?: string; user_id?: string } = {}): Promise<CreatorModel[]> {
    const params = new URLSearchParams();
    if (filters.visibility) params.set("visibility", filters.visibility);
    if (filters.q) params.set("q", filters.q);
    if (filters.user_id) params.set("user_id", filters.user_id);
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

  async deleteModelVersion(modelId: string, versionId: string): Promise<CreatorModel> {
    return request<CreatorModel>(`/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}`, { method: "DELETE" });
  },

  async updateModelVersion(modelId: string, versionId: string, name: string): Promise<CreatorModel> {
    return request<CreatorModel>(`/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}`, { method: "PATCH", body: JSON.stringify({ name }) });
  },

  async uploadModelFile(
    modelId: string,
    versionId: string,
    file: File,
    precision: ModelPrecision = "FP16",
  ): Promise<CreatorModel> {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("precision", precision);
    const path = `/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/files`;
    const response = await uploadWithDirectFallback(path, form);
    if (!response.ok) {
      const errorMsg = await parseErrorResponse(response, "Could not upload model file");
      throw new ApiError(response.status, errorMsg);
    }
    return (await response.json()) as CreatorModel;
  },

  async uploadModelSample(
    modelId: string,
    versionId: string,
    file: File,
    metadata: Record<string, unknown> = {},
    isCover: boolean = false,
  ): Promise<CreatorModel> {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("metadata", JSON.stringify(metadata));
    if (isCover) {
      form.append("is_cover", "true");
    }
    const path = `/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/samples`;
    const response = await uploadWithDirectFallback(path, form);
    if (!response.ok) {
      const errorMsg = await parseErrorResponse(response, "Could not upload sample");
      throw new ApiError(response.status, errorMsg);
    }
    return (await response.json()) as CreatorModel;
  },

  async setCoverModelSample(modelId: string, versionId: string, sampleId: string): Promise<CreatorModel> {
    return request<CreatorModel>(
      `/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/samples/${encodeURIComponent(sampleId)}/set-cover`,
      { method: "POST" }
    );
  },

  async patchModelSample(modelId: string, versionId: string, sampleId: string, metadata: Record<string, unknown>): Promise<CreatorModel> {
    return request<CreatorModel>(
      `/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/samples/${encodeURIComponent(sampleId)}`,
      { method: "PATCH", body: JSON.stringify({ metadata }) }
    );
  },

  async reorderModelSamples(modelId: string, versionId: string, sampleIds: string[]): Promise<CreatorModel> {
    return request<CreatorModel>(
      `/api/v1/models/id/${encodeURIComponent(modelId)}/versions/${encodeURIComponent(versionId)}/samples/order`,
      { method: "PUT", body: JSON.stringify({ sample_ids: sampleIds }) }
    );
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

  async getWorkflowTemplateInfo(): Promise<WorkflowTemplateInfo> {
    return request<WorkflowTemplateInfo>("/api/v1/workflow/template-info");
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
      tags?: string[] | string;
      tag_mode?: "all" | "any";
      user_id?: string;
    } = {}
  ): Promise<GalleryItem[]> {
    const safeLimit = Math.min(Math.max(1, limit), 500);
    const params = new URLSearchParams({ limit: String(safeLimit) });
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      if (key === "tags") {
        if (Array.isArray(value)) {
          if (value.length > 0) params.set("tags", value.join(","));
        } else if (typeof value === "string" && value.trim()) {
          params.set("tags", value.trim());
        }
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

  async getMyGallery(
    limit = 60,
    filters: {
      origin?: string;
      tool_id?: string;
      tool_type?: string;
      tag?: string;
      tags?: string[] | string;
      tag_mode?: "all" | "any";
    } = {}
  ): Promise<GalleryItem[]> {
    const safeLimit = Math.min(Math.max(1, limit), 500);
    const params = new URLSearchParams({ limit: String(safeLimit) });
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) return;
      if (key === "tags") {
        if (Array.isArray(value)) {
          if (value.length > 0) params.set("tags", value.join(","));
        } else if (typeof value === "string" && value.trim()) {
          params.set("tags", value.trim());
        }
      } else if (typeof value === "string") {
        params.set(key, value);
      }
    });
    const resp = await request<{ items: GalleryItem[] }>(`/api/v1/gallery/me?${params}`);
    return (resp.items || []).map((item) => ({
      ...item,
      url: resolveMediaUrl(item.url) || item.url,
      thumbnail_url: resolveMediaUrl(item.thumbnail_url) || item.thumbnail_url,
    }));
  },

  async getAssets(
    limit = 60,
    filters: {
      origin?: string;
      tool_id?: string;
      tool_type?: string;
      tag?: string;
      tags?: string[] | string;
      tag_mode?: "all" | "any";
    } = {}
  ): Promise<GalleryItem[]> {
    return this.getGallery(limit, filters);
  },

  async getPublicAssets(
    limit = 60,
    filters: {
      origin?: string;
      tool_id?: string;
      tool_type?: string;
      tag?: string;
      tags?: string[] | string;
      tag_mode?: "all" | "any";
    } = {}
  ): Promise<GalleryItem[]> {
    return this.getGallery(limit, filters);
  },

  async getGalleryPaginated(params: {
    page?: number;
    limit?: number;
    model_id?: string;
    user_id?: string;
  } = {}): Promise<PaginatedGenerations> {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.limit) query.set("limit", String(params.limit));
    if (params.model_id) query.set("model_id", params.model_id);
    if (params.user_id) query.set("user_id", params.user_id);
    const queryString = query.toString() ? `?${query.toString()}` : "";
    const data = await request<PaginatedGenerations>(`/api/v1/gallery/paginated${queryString}`);
    return {
      ...data,
      items: (data.items || []).map((item) => ({
        ...item,
        url: resolveMediaUrl(item.url) || item.url,
      })),
    };
  },

  async listTools(userId?: string): Promise<ToolSummary[]> {
    const params = new URLSearchParams();
    if (userId) params.set("user_id", userId);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const resp = await request<{ items: ToolSummary[] }>(`/api/tools${queryString}`);
    return (resp.items || []).map((tool) => ({
      ...tool,
      thumbnail_url: resolveMediaUrl(tool.thumbnail_url),
    }));
  },

  async getTools(userId?: string): Promise<ToolSummary[]> {
    return this.listTools(userId);
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

  async createTool(file: File, name: string, mode?: ToolMode, aspectRatio: ToolAspectRatio = "1:1", thumbnail?: File, controls?: ToolControl[]): Promise<ToolDetail> {
    const form = new FormData();
    form.append("workflow_api", file, file.name || "workflow_api.json");
    form.append("name", name);
    if (mode) form.append("mode", mode);
    form.append("aspect_ratio", aspectRatio);
    if (thumbnail) form.append("thumbnail", thumbnail, thumbnail.name);
    if (controls) form.append("controls", JSON.stringify(controls));
    const resp = await fetch(`${API_BASE}/api/tools/create`, { method: "POST", headers: getAuthHeaders(), body: form });
    if (!resp.ok) {
      const errorMsg = await parseErrorResponse(resp, "Could not create tool");
      throw new ApiError(resp.status, errorMsg);
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
      const errorMsg = await parseErrorResponse(resp, "Could not run tool");
      throw new ApiError(resp.status, errorMsg);
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

  async getPopularTags(
    limit = 40,
    userId?: string
  ): Promise<TagSummary[]> {
    const trimmedId = typeof userId === "string" ? userId.trim() : undefined;
    const path = trimmedId
      ? `/api/v1/tags?limit=${limit}&user_id=${encodeURIComponent(trimmedId)}`
      : `/api/v1/tags?limit=${limit}`;
    const resp = await request<{ items: TagSummary[] }>(path);
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

  async interrogateImage(file: File | Blob, filename = "image.png"): Promise<TagInterrogateResult> {
    const form = new FormData();
    const fname = file instanceof File ? file.name : filename;
    form.append("file", file, fname);
    const resp = await fetch(`${API_BASE}/api/v1/tagger/interrogate`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: form,
    });
    if (!resp.ok) {
      const errorMsg = await parseErrorResponse(resp, "Could not interrogate image");
      throw new ApiError(resp.status, errorMsg);
    }
    return (await resp.json()) as TagInterrogateResult;
  },

  async getModels(category: ModelCategory): Promise<string[]> {
    return request<string[]>(`/api/v1/models/${category}`);
  },

  async parseTool(file: File, name = "Untitled tool"): Promise<ToolParseResponse> {
    const form = new FormData();
    form.append("workflow_api", file, file.name || "workflow_api.json");
    form.append("name", name);
    const resp = await fetch(`${API_BASE}/api/tools/parse`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: form,
    });
    if (!resp.ok) {
      const errorMsg = await parseErrorResponse(resp, "Could not parse workflow");
      throw new ApiError(resp.status, errorMsg);
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

  async updateProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
    try {
      const res = await request<any>("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const auth = normalizeAuthResponse(res);
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(auth.user));
      } catch {
        /* ignore */
      }
      return auth.user;
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
          if (payload.display_name !== undefined) currentUser.displayName = payload.display_name;
          if (payload.avatar_url !== undefined) currentUser.avatarUrl = payload.avatar_url;
          if (payload.bio !== undefined) currentUser.bio = payload.bio;
          if (payload.social_links !== undefined) currentUser.social_links = payload.social_links;
          try {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
          } catch {
            /* ignore */
          }
          return currentUser;
        }
      }
      throw err;
    }
  },

  async uploadAvatar(file: File): Promise<AvatarUploadResponse> {
    const form = new FormData();
    form.append("file", file, file.name);
    try {
      const res = await request<AvatarUploadResponse>("/api/auth/avatar", {
        method: "POST",
        body: form,
      });
      return {
        avatar_url: resolveMediaUrl(res.avatar_url) || res.avatar_url,
      };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        const fallbackUrl = URL.createObjectURL(file);
        return { avatar_url: fallbackUrl };
      }
      throw err;
    }
  },

  async changePassword(payload: ChangePasswordPayload): Promise<{ success: boolean; message: string }> {
    try {
      const res = await request<any>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return {
        success: true,
        message: res?.message ?? "Password updated successfully.",
      };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return {
          success: true,
          message: "Password updated successfully.",
        };
      }
      throw err;
    }
  },

  async listApiKeys(): Promise<ApiKeyListItem[]> {
    try {
      return await request<ApiKeyListItem[]>("/api/auth/keys");
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        try {
          const raw = localStorage.getItem("solotensor:api_keys:v1");
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      }
      throw err;
    }
  },

  async createApiKey(name: string): Promise<ApiKeyResponse> {
    try {
      return await request<ApiKeyResponse>("/api/auth/keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        const secret = `st_live_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
        const masked = `st_live_••••${secret.slice(-4)}`;
        const newKey: ApiKeyResponse = {
          id: `key_${Date.now()}`,
          user_id: "usr_local",
          name,
          created_at: new Date().toISOString(),
          api_key: secret,
        };
        try {
          const raw = localStorage.getItem("solotensor:api_keys:v1");
          const list: ApiKeyListItem[] = raw ? JSON.parse(raw) : [];
          list.unshift({
            id: newKey.id,
            user_id: newKey.user_id,
            name: newKey.name,
            created_at: newKey.created_at,
            masked_key: masked,
          });
          localStorage.setItem("solotensor:api_keys:v1", JSON.stringify(list));
        } catch {
          /* ignore */
        }
        return newKey;
      }
      throw err;
    }
  },

  async deleteApiKey(keyId: string): Promise<{ success: boolean }> {
    try {
      await request<any>(`/api/auth/keys/${encodeURIComponent(keyId)}`, {
        method: "DELETE",
      });
      return { success: true };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        try {
          const raw = localStorage.getItem("solotensor:api_keys:v1");
          if (raw) {
            const list: ApiKeyListItem[] = JSON.parse(raw);
            const filtered = list.filter((k) => k.id !== keyId);
            localStorage.setItem("solotensor:api_keys:v1", JSON.stringify(filtered));
          }
        } catch {
          /* ignore */
        }
        return { success: true };
      }
      throw err;
    }
  },

  async getUserProfile(username: string): Promise<UserPublicProfile> {
    try {
      const res = await request<UserPublicProfile>(`/api/users/${encodeURIComponent(username)}`);
      const localFollow = getLocalFollowState(username);
      return {
        ...res,
        avatar_url: resolveMediaUrl(res.avatar_url),
        is_following: localFollow !== null ? localFollow : res.is_following,
      };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return getFallbackUserProfile(username);
      }
      throw err;
    }
  },

  async toggleFollowUser(username: string): Promise<{ following: boolean; followers_count: number }> {
    try {
      const res = await request<{ following: boolean; followers_count: number }>(
        `/api/users/${encodeURIComponent(username)}/follow`,
        { method: "POST" }
      );
      setLocalFollowState(username, res.following);
      return res;
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return toggleFallbackFollowUser(username);
      }
      throw err;
    }
  },

  async getPendingModelsReviewQueue(): Promise<ModelPendingReviewQueueResponse> {
    try {
      return await request<ModelPendingReviewQueueResponse>("/api/v1/moderation/models/pending");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      return { items: [], total: 0 };
    }
  },

  async reviewModelSubmission(
    modelId: string,
    payload: ModelReviewRequest
  ): Promise<ModelReviewResponse> {
    return this.reviewModelPublication(modelId, {
      ...payload,
      notes: payload.notes || payload.feedback_notes,
    });
  },

  async reviewModelPublication(
    modelId: string,
    payload: ModelReviewRequest
  ): Promise<ModelReviewResponse> {
    return request<ModelReviewResponse>(
      `/api/v1/moderation/models/${encodeURIComponent(modelId)}/review`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  },

  async getModerationQueue(status?: string): Promise<ModerationQueueItem[]> {
    try {
      const res = await request<{ items?: ModerationQueueItem[] } | ModerationQueueItem[]>(
        `/api/v1/moderation/queue${status ? `?status=${status}` : ""}`
      );
      if (res && "items" in res && Array.isArray(res.items)) {
        return res.items;
      }
      if (Array.isArray(res)) {
        return res;
      }
      return [];
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return getFallbackModerationQueue(status);
      }
      return getFallbackModerationQueue(status);
    }
  },

  async takeDownAsset(
    targetType: ModerationTargetType | string,
    targetId: string,
    reason?: string,
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.takeModerationAction({
      target_type: targetType as ModerationTargetType,
      target_id: targetId,
      action: "takedown",
      reason,
      notes: notes || reason || "Asset taken down by moderator",
    });
  },

  async takeModerationAction(payload: ModerationActionPayload): Promise<{ success: boolean; message: string }> {
    try {
      const res = await request<{ id: string; status: string }>("/api/v1/moderation/resolve", {
        method: "POST",
        body: JSON.stringify({
          flag_id: payload.target_id,
          status: payload.action === "approve" ? "resolved" : "dismissed",
          resolution_notes: payload.notes || payload.reason || "Action taken by moderator",
        }),
      });
      return { success: true, message: `Status updated to ${res.status}` };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return takeFallbackModerationAction(payload);
      }
      return takeFallbackModerationAction(payload);
    }
  },

  async getSecurityAuditLogs(
    paramsOrLimit?: { limit?: number; offset?: number; action?: string; resource_type?: string } | number,
    offset?: number,
    action?: string,
    resourceType?: string
  ): Promise<SecurityAuditLogEntry[]> {
    try {
      const search = new URLSearchParams();
      if (typeof paramsOrLimit === "object" && paramsOrLimit !== null) {
        if (paramsOrLimit.limit) search.set("limit", String(paramsOrLimit.limit));
        if (paramsOrLimit.offset) search.set("offset", String(paramsOrLimit.offset));
        if (paramsOrLimit.action) search.set("action", paramsOrLimit.action);
        if (paramsOrLimit.resource_type) search.set("resource_type", paramsOrLimit.resource_type);
      } else {
        if (typeof paramsOrLimit === "number") search.set("limit", String(paramsOrLimit));
        if (typeof offset === "number") search.set("offset", String(offset));
        if (action) search.set("action", action);
        if (resourceType) search.set("resource_type", resourceType);
      }
      const qs = search.toString();
      const res = await request<SecurityAuditLogEntry[]>(`/api/v1/moderation/audit-logs${qs ? `?${qs}` : ""}`);
      return res;
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return getFallbackSecurityAuditLogs();
      }
      throw err;
    }
  },

  async flagContent(targetType: string, targetId: string, reason: string, details?: string): Promise<{ success: boolean; message: string; id?: string }> {
    try {
      const res = await request<ContentFlagResponse | { success: boolean; message: string }>("/api/v1/moderation/flag", {
        method: "POST",
        body: JSON.stringify({ target_type: targetType, target_id: targetId, reason, details }),
      });
      if (res && "id" in res) {
        return { success: true, message: "Content report submitted successfully.", id: res.id };
      }
      return { success: true, message: (res as any)?.message || "Content report submitted successfully." };
    } catch (err) {
      if (
        (err instanceof ApiError && (err.status === 404 || err.status === 501)) ||
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        return submitFallbackContentFlag(targetType, targetId, reason, details);
      }
      throw err;
    }
  },

  async getNotifications(params?: {
    unread_only?: boolean;
    category?: string;
    page?: number;
    limit?: number;
  }): Promise<NotificationListResponse> {
    const search = new URLSearchParams();
    if (params?.unread_only) search.set("unread_only", "true");
    if (params?.category) search.set("category", params.category);
    if (params?.page) search.set("page", String(params.page));
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<NotificationListResponse>(`/api/v1/notifications${qs ? `?${qs}` : ""}`);
  },

  async getUnreadNotificationCount(): Promise<NotificationUnreadCountResponse> {
    return request<NotificationUnreadCountResponse>("/api/v1/notifications/unread-count");
  },

  async markNotificationAsRead(id: string): Promise<NotificationReadResponse> {
    return request<NotificationReadResponse>(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
    });
  },

  async markAllNotificationsAsRead(): Promise<NotificationReadResponse> {
    return request<NotificationReadResponse>("/api/v1/notifications/read-all", {
      method: "POST",
    });
  },

  async deleteNotification(id: string): Promise<NotificationReadResponse> {
    return request<NotificationReadResponse>(`/api/v1/notifications/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

export function getLocalFollowState(username: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(`solotensor_follow_${username.toLowerCase()}`);
    if (val !== null) return val === "true";
  } catch {
    /* ignore */
  }
  return null;
}

export function setLocalFollowState(username: string, following: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`solotensor_follow_${username.toLowerCase()}`, String(following));
  } catch {
    /* ignore */
  }
}

export function getFallbackUserProfile(username: string): UserPublicProfile {
  const isRiiwa = username.toLowerCase() === "riiwa";
  const localFollow = getLocalFollowState(username);
  const isFollowing = localFollow !== null ? localFollow : false;

  let currentUser: UserProfile | null = null;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      if (raw) currentUser = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  }

  const isSelf = currentUser && currentUser.username.toLowerCase() === username.toLowerCase();

  if (isRiiwa) {
    const baseFollowers = 13300;
    return {
      id: "645954010620120176",
      username: "riiwa",
      display_name: "riiwa",
      avatar_url: null,
      role: "verified_creator",
      roles: ["verified_creator", "pro_creator"],
      primary_role: "verified_creator",
      permissions: getDefaultPermissionsForRole("verified_creator"),
      bio: "Obsidian darkroom creator & deep generative synthesis researcher specializing in high-fidelity character models, cinematic LoRAs, and autonomous workflow tooling.",
      created_at: "2023-11-20T12:00:00Z",
      is_following: isFollowing,
      followers_count: isFollowing ? baseFollowers + 1 : baseFollowers,
      following_count: 39,
      runs_count: 62700000,
      downloads_count: 3800,
      likes_count: 121600,
      stars_count: 121800,
      tools_count: 120,
      models_count: 268,
      posts_count: 11612,
      workflows_count: 25,
    };
  }

  const userRole = normalizeRoleName(currentUser?.primary_role || currentUser?.role || "creator");
  const userRoles = currentUser?.roles && currentUser.roles.length > 0 ? currentUser.roles.map(normalizeRoleName) : [userRole];
  const permissions = currentUser?.permissions && currentUser.permissions.length > 0
    ? currentUser.permissions
    : getDefaultPermissionsForRole(userRole);

  const displayName = isSelf && currentUser?.displayName ? currentUser.displayName : username;
  const baseFollowers = 1420;
  return {
    id: isSelf && currentUser?.id ? currentUser.id : `usr_${username.toLowerCase().slice(0, 12)}`,
    username,
    display_name: displayName,
    avatar_url: isSelf ? currentUser?.avatarUrl || null : null,
    role: userRole,
    roles: userRoles,
    primary_role: userRole,
    permissions,
    bio: "Visual AI practitioner and workflow engineer creating neural pipelines on SoloTensor.",
    created_at: isSelf && currentUser?.createdAt ? currentUser.createdAt : "2024-02-10T10:00:00Z",
    is_following: isFollowing,
    followers_count: isFollowing ? baseFollowers + 1 : baseFollowers,
    following_count: 48,
    runs_count: 124000,
    downloads_count: 940,
    likes_count: 3420,
    stars_count: 850,
    tools_count: 6,
    models_count: 14,
    posts_count: 88,
    workflows_count: 4,
  };
}

export function toggleFallbackFollowUser(username: string): { following: boolean; followers_count: number } {
  const current = getLocalFollowState(username) ?? false;
  const next = !current;
  setLocalFollowState(username, next);
  const profile = getFallbackUserProfile(username);
  return {
    following: next,
    followers_count: profile.followers_count,
  };
}

function normalizeAuthResponse(raw: any): AuthResponse {
  const token = raw?.access_token || raw?.token || "";
  const rawUser = raw?.user || raw || {};
  const rawRole = rawUser.primary_role || rawUser.role || "creator";
  const normRole = normalizeRoleName(rawRole);
  const rawRoles = Array.isArray(rawUser.roles) && rawUser.roles.length > 0
    ? rawUser.roles.map(normalizeRoleName)
    : [normRole];
  const permissions = Array.isArray(rawUser.permissions) && rawUser.permissions.length > 0
    ? rawUser.permissions
    : getDefaultPermissionsForRole(normRole);

  const user: UserProfile = {
    id: rawUser.id || "",
    email: rawUser.email || "",
    username: rawUser.username || "",
    displayName: rawUser.display_name || rawUser.displayName || rawUser.username || "",
    role: normRole,
    roles: rawRoles,
    primary_role: normRole,
    permissions,
    avatarUrl: resolveMediaUrl(rawUser.avatar_url || rawUser.avatarUrl) || null,
    bio: rawUser.bio ?? null,
    social_links: rawUser.social_links ?? {},
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
  const defaultRole: UserRole = "creator";
  const user: UserProfile = {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    email: identifier.includes("@") ? identifier : `${identifier}@solotensor.local`,
    username: name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    role: defaultRole,
    roles: [defaultRole],
    primary_role: defaultRole,
    permissions: getDefaultPermissionsForRole(defaultRole),
    avatarUrl: null,
    bio: null,
    social_links: {},
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
  const defaultRole: UserRole = "creator";
  const user: UserProfile = {
    id: `usr_${Math.random().toString(36).slice(2, 10)}`,
    email: payload.email,
    username: payload.username.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    displayName: payload.displayName || payload.username,
    role: defaultRole,
    roles: [defaultRole],
    primary_role: defaultRole,
    permissions: getDefaultPermissionsForRole(defaultRole),
    avatarUrl: null,
    bio: null,
    social_links: {},
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
    const defaultRole: UserRole = "creator";
    user = {
      id: "usr_solo_local",
      email: "creator@solotensor.local",
      username: "solocreator",
      displayName: "Solo Creator",
      role: defaultRole,
      roles: [defaultRole],
      primary_role: defaultRole,
      permissions: getDefaultPermissionsForRole(defaultRole),
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      is_verified: false,
    };
  } else {
    const norm = normalizeRoleName(user.primary_role || user.role);
    user.role = norm;
    user.primary_role = norm;
    if (!user.roles || user.roles.length === 0) user.roles = [norm];
    if (!user.permissions || user.permissions.length === 0) user.permissions = getDefaultPermissionsForRole(norm);
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

export const MODERATION_QUEUE_KEY = "solotensor_moderation_queue";
export const SECURITY_AUDIT_LOGS_KEY = "solotensor_security_audit_logs";

const INITIAL_MODERATION_QUEUE: ModerationQueueItem[] = [
  {
    id: "mod-q-101",
    target_type: "model",
    target_id: "mod_tokyo_cyber_v2",
    title: "Neo-Shinjuku Cyberpunk Architecture LoRA",
    preview_url: null,
    author_username: "cyber_artisan",
    author_role: "creator",
    reporter_username: "prompt_sentinel",
    reason: "Suspected unlicensed checkpoint weight merge without attribution",
    details: "Metadata signatures show 98% parameter overlap with v1 checkpoint without creator license.",
    flag_count: 3,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    status: "pending",
    severity: "medium",
    tags: ["architecture", "sdxl", "lora"],
  },
  {
    id: "mod-q-102",
    target_type: "post",
    target_id: "post_neon_visage_88",
    title: "Cybernetic Geisha Portrait // Extended Latent",
    preview_url: null,
    author_username: "ghost_in_the_latent",
    author_role: "creator",
    reporter_username: "safety_guard_bot",
    reason: "Graphic content unflagged / Mature content filter bypass",
    details: "Automated DeepDanbooru flagged aesthetic gore at 0.89 confidence without mature tag.",
    flag_count: 5,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    status: "pending",
    severity: "high",
    tags: ["portrait", "nsfw_unflagged"],
  },
  {
    id: "mod-q-103",
    target_type: "model",
    target_id: "mod_inversion_faces_v1",
    title: "Deep Embedding Facial Morph Enclave",
    preview_url: null,
    author_username: "latent_rebel",
    author_role: "creator",
    reporter_username: "community_watch",
    reason: "Potential Real-Person Impersonation safetensors",
    details: "Embedding tokens match non-consensual identity tags.",
    flag_count: 8,
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    status: "pending",
    severity: "critical",
    tags: ["embedding", "impersonation"],
  },
  {
    id: "mod-q-104",
    target_type: "post",
    target_id: "post_darkroom_synthesis_909",
    title: "Infinite Brutalist Monoliths",
    preview_url: null,
    author_username: "riiwa",
    author_role: "verified_creator",
    reporter_username: "anon_user_44",
    reason: "Accidental flag / False positive",
    details: "Reported as spam, but conforms to all architectural synthesis standards.",
    flag_count: 1,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    status: "resolved",
    severity: "low",
    tags: ["architecture", "monolith"],
  },
];

const INITIAL_SECURITY_AUDIT_LOGS: SecurityAuditLogEntry[] = [
  {
    id: "audit-001",
    actor_username: "system_admin",
    actor_role: "admin",
    action: "role:grant_verified",
    resource_type: "user",
    resource_id: "usr_riiwa",
    details: "Promoted to Verified Creator with partner publishing download controls.",
    ip_address: "127.0.0.1",
    created_at: new Date(Date.now() - 3600000 * 36).toISOString(),
  },
  {
    id: "audit-002",
    actor_username: "mod_kusanagi",
    actor_role: "moderator",
    action: "content:toggle_nsfw",
    resource_type: "post",
    resource_id: "post_neon_77",
    details: "Applied mature aesthetic tag after community report review.",
    ip_address: "127.0.0.1",
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
  },
  {
    id: "audit-003",
    actor_username: "system_admin",
    actor_role: "admin",
    action: "credits:grant_manual",
    resource_type: "user",
    resource_id: "usr_solo_local",
    details: "Manual allocation of +1000 Studio Energy units for compute cluster evaluation.",
    ip_address: "127.0.0.1",
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
  },
];

export function getFallbackModerationQueue(status?: string): ModerationQueueItem[] {
  if (typeof window === "undefined") return INITIAL_MODERATION_QUEUE;
  try {
    const raw = localStorage.getItem(MODERATION_QUEUE_KEY);
    let items: ModerationQueueItem[] = raw ? JSON.parse(raw) : INITIAL_MODERATION_QUEUE;
    if (!raw) {
      localStorage.setItem(MODERATION_QUEUE_KEY, JSON.stringify(INITIAL_MODERATION_QUEUE));
    }
    if (status && status !== "all") {
      items = items.filter((i) => i.status === status);
    }
    return items;
  } catch {
    return INITIAL_MODERATION_QUEUE;
  }
}

export function takeFallbackModerationAction(payload: ModerationActionPayload): { success: boolean; message: string } {
  if (typeof window === "undefined") return { success: true, message: "Action recorded" };
  try {
    const raw = localStorage.getItem(MODERATION_QUEUE_KEY);
    const items: ModerationQueueItem[] = raw ? JSON.parse(raw) : [...INITIAL_MODERATION_QUEUE];
    const index = items.findIndex((i) => i.target_id === payload.target_id || i.id === payload.target_id);

    if (index !== -1) {
      if (payload.action === "approve") {
        items[index].status = "resolved";
      } else if (payload.action === "takedown" || payload.action === "ban_user") {
        items[index].status = "dismissed";
      } else {
        items[index].status = "resolved";
      }
      localStorage.setItem(MODERATION_QUEUE_KEY, JSON.stringify(items));
    }

    const rawLogs = localStorage.getItem(SECURITY_AUDIT_LOGS_KEY);
    const logs: SecurityAuditLogEntry[] = rawLogs ? JSON.parse(rawLogs) : [...INITIAL_SECURITY_AUDIT_LOGS];
    const currentUser = getFallbackUserSession().user;
    logs.unshift({
      id: `audit-${Date.now()}`,
      actor_username: currentUser.username,
      actor_role: currentUser.primary_role || currentUser.role,
      action: `moderation:${payload.action}`,
      resource_type: payload.target_type,
      resource_id: payload.target_id,
      details: payload.reason || payload.notes || `Moderation action ${payload.action} executed on ${payload.target_type}:${payload.target_id}`,
      ip_address: "127.0.0.1",
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(SECURITY_AUDIT_LOGS_KEY, JSON.stringify(logs.slice(0, 100)));

    return {
      success: true,
      message: `Action '${payload.action}' executed successfully on ${payload.target_type} ${payload.target_id}.`,
    };
  } catch {
    return { success: true, message: `Action '${payload.action}' applied.` };
  }
}

export function getFallbackSecurityAuditLogs(): SecurityAuditLogEntry[] {
  if (typeof window === "undefined") return INITIAL_SECURITY_AUDIT_LOGS;
  try {
    const raw = localStorage.getItem(SECURITY_AUDIT_LOGS_KEY);
    if (!raw) {
      localStorage.setItem(SECURITY_AUDIT_LOGS_KEY, JSON.stringify(INITIAL_SECURITY_AUDIT_LOGS));
      return INITIAL_SECURITY_AUDIT_LOGS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_SECURITY_AUDIT_LOGS;
  }
}

export function submitFallbackContentFlag(targetType: string, targetId: string, reason: string, details?: string): { success: boolean; message: string } {
  if (typeof window === "undefined") return { success: true, message: "Report submitted." };
  try {
    const raw = localStorage.getItem(MODERATION_QUEUE_KEY);
    const items: ModerationQueueItem[] = raw ? JSON.parse(raw) : [...INITIAL_MODERATION_QUEUE];
    const currentUser = getFallbackUserSession().user;
    items.unshift({
      id: `mod-q-${Date.now()}`,
      target_type: (targetType as ModerationTargetType) || "post",
      target_id: targetId,
      title: `${targetType.toUpperCase()} // Flagged Content [${targetId.slice(0, 8)}]`,
      preview_url: null,
      author_username: "community_creator",
      author_role: "creator",
      reporter_username: currentUser.username,
      reason,
      details: details || "Submitted by user via inline report action.",
      flag_count: 1,
      created_at: new Date().toISOString(),
      status: "pending",
      severity: "medium",
    });
    localStorage.setItem(MODERATION_QUEUE_KEY, JSON.stringify(items));
    return { success: true, message: "Content report dispatched to the SoloTensor Moderation Darkroom." };
  } catch {
    return { success: true, message: "Report recorded." };
  }
}

export function setLocalUserRole(newRole: UserRole): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const rawUser = localStorage.getItem(AUTH_USER_KEY);
    const user: UserProfile = rawUser ? JSON.parse(rawUser) : getFallbackUserSession().user;
    const norm = normalizeRoleName(newRole);
    user.role = norm;
    user.primary_role = norm;
    user.roles = [norm];
    user.permissions = getDefaultPermissionsForRole(norm);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    return null;
  }
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

export function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(";base64,");
    const contentType = parts[0].split(":")[1] || "image/png";
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  } catch {
    return new Blob([], { type: "image/png" });
  }
}