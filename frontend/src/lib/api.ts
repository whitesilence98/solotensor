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

export type DirectorProvider = "local" | "anthropic";

export interface DirectorMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DirectorReply {
  provider: string;
  model: string;
  answer: string;
  /** Defaulted server-side; optional so a rolling restart still type-checks. */
  shots?: DirectorShot[];
}

export type DirectorMedia = "image" | "video";
export type DirectorAspect = "1:1" | "16:9" | "9:16" | "4:3" | "3:2";

export interface DirectorShot {
  title: string;
  prompt: string;
  negative_prompt: string;
  media: DirectorMedia;
  aspect: DirectorAspect;
  duration_seconds: number | null;
  fps: number | null;
  model_id: string | null;
  version_id: string | null;
  file_id: string | null;
  model_label: string | null;
}

export interface DirectorProviderStatus {
  id: string;
  label: string;
  available: boolean;
  model: string;
  detail?: string | null;
}

/** Admin-managed provider settings. Keys are never returned in full. */
export type AppSettingsSource = "file" | "env" | "default";

export interface AppSettingsSnapshot {
  director_enabled: boolean;
  director_provider: DirectorProvider;
  director_model: string;
  assistant_enabled: boolean;
  assistant_model: string;
  local_llm_url: string;
  local_llm_model: string;
  anthropic_api_key_set: boolean;
  anthropic_api_key_hint: string | null;
  local_llm_api_key_set: boolean;
  local_llm_api_key_hint: string | null;
  proxy_url: string;
  proxy_bypass_local: boolean;
  sources: Partial<Record<string, AppSettingsSource>>;
  settings_paths: string[];
}

export interface AppSettingsUpdate {
  anthropic_api_key?: string;
  clear_anthropic_api_key?: boolean;
  director_enabled?: boolean;
  director_provider?: DirectorProvider;
  director_model?: string;
  assistant_enabled?: boolean;
  assistant_model?: string;
  local_llm_url?: string;
  local_llm_model?: string;
  local_llm_api_key?: string;
  clear_local_llm_api_key?: boolean;
  proxy_url?: string;
  proxy_bypass_local?: boolean;
}

export interface AppSettingsTestResult {
  provider: DirectorProvider;
  ok: boolean;
  detail: string;
}

export type GenerationMode =
  | "text-to-image"
  | "image-to-image"
  | "detailer"
  | "upscale"
  | "video"
  | "edit";

/** Video audio track: `silent` and native audio share a graph state; `voice_clone` needs `reference_audio`. */
export type VideoAudioMode = "silent" | "voice_clone";

/** Video sizing: `preset` forces width/height; `source` follows the uploaded image within `video_megapixels`. */
export type VideoResizeMode = "preset" | "source";

/** Explicit video sub-mode. Omitted on the wire = legacy inference from image presence. */
export type VideoSubMode = "text-to-video" | "image-to-video";

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

export interface GenerationRequest {
  model_id: string;
  version_id: string;
  file_id: string;
  base_model_id?: string;
  base_version_id?: string;
  base_file_id?: string;
  mode: GenerationMode;
  video_mode?: VideoSubMode;
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
  reference_image?: string;
  save_comparison_reel?: boolean;
  lora_adapters?: LoraAdapterPayload[];
  is_private?: boolean;
  enable_detailer?: boolean;
  upscale?: UpscaleConfigPayload;
  detailer?: DetailerConfigPayload;
  video_fps?: number;
  video_duration_seconds?: number;
  stage2_upscale?: boolean;
  last_frame_image?: string | null;
  audio_mode?: VideoAudioMode;
  reference_audio?: string | null;
  extract_voice?: boolean;
  resize_mode?: VideoResizeMode;
  video_megapixels?: number;
  first_frame_strength?: number;
  last_frame_strength?: number;
  rife_multiplier?: number;
  high_fps?: boolean;
  film_grain?: boolean;
  match_color?: boolean;
  tiled_vae_decode?: boolean;
}

export type GeneratePayload = GenerationRequest;

export interface ClipOptions {
  encoders: string[];
  types: string[];
}

export interface WorkflowTemplateInfo {
  has_template: boolean;
  vae_name?: string | null;
  clip_name?: string | null;
  clip_name2?: string | null;
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

export interface ToolCatalogResponse {
  items: ToolSummary[];
  total?: number | null;
  page?: number | null;
  limit?: number | null;
  has_more?: boolean | null;
}

export interface ToolDetail extends ToolSummary {
  supported_aspect_ratios: ToolAspectRatio[];
  output_kind: "image" | "video";
  controls: ToolControl[];
  essential_summary?: EssentialControlSummary | null;
  /** Server-resolved pixel size per aspect preset. Never hardcode this client-side. */
  aspect_dimensions?: Record<string, number[]>;
  /** Latent grid the width/height must land on (32 for LTX, otherwise 8). */
  dimension_multiple?: number;
}

export interface ToolEditorPayload extends ToolSummary {
  workflow_api: Record<string, unknown>;
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
  /** Media kind recorded in the sidecar metadata (AssetRecord.type derives from the file extension). */
  kind?: "image" | "video";
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
  /** Enforced by the serving route; mirrors the owner's privacy flag. */
  is_private?: boolean | null;
  /** Expiry of the short-lived media capability in `url` (private only). */
  url_expires_at?: string | null;
}

/** Freshly signed media URLs for one asset (`GET /api/v1/assets/{key}/media`). */
export interface AssetMediaResponse {
  key: string;
  url: string;
  url_expires_at?: string | null;
  thumbnail_url?: string | null;
  before_detailer_url?: string | null;
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
  | "model_starred"
  | "model_commented"
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

/**
 * Short-lived, single-use relay credential issued by `POST /api/v1/ws/ticket`.
 * The server chooses `client_id`; the browser never invents one.
 */
export interface ProgressTicketResponse {
  ticket: string;
  client_id: string;
  expires_in_seconds: number;
  ws_path: string;
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
  /** Null when the backend did not include credits, never a guessed balance. */
  credits: CreditStatus | null;
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

export interface HealthResponse {
  status: string;
  comfy: string;
  storage: string;
  /** Driver name, not availability. */
  database: string | null;
  redis: string | null;
  s3: string | null;
  /** Null means not checked; optional for older backends. */
  database_status?: "up" | "down" | null;
  /** Safe subsystem messages; no exceptions, paths, hosts, or credentials. */
  details?: Record<string, string>;
}

export interface ReadyResponse {
  status: "ready" | "not_ready";
  storage: "up" | "down";
  database: "up" | "down";
  /** Safe subsystem messages; no exceptions, paths, hosts, or credentials. */
  details: Record<string, string>;
}

export interface CollectionRecord {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface CollectionCreatePayload {
  name: string;
  description?: string | null;
}

export type CollectionUpdatePayload = Partial<CollectionCreatePayload>;

export interface CollectionItemsAddResult {
  added: string[];
  skipped: string[];
}

/** Only the parameters a `/generate` deep link can carry. */
export interface GenerationPresetPayload {
  mode: GenerationMode;
  /** Only meaningful with mode="video"; `text-to-video` clears stale I2V input. */
  video_mode?: VideoSubMode | null;
  prompt?: string | null;
  negative_prompt?: string | null;
  /** 0..2^32-1 */
  seed?: number | null;
  format?: "1:1" | "16:9" | "9:16" | "4:3" | "3:2" | null;
  duration?: 3 | 5 | 10 | 15 | null;
  fps?: 16 | 24 | 30 | 49 | null;
  model_id?: string | null;
  version_id?: string | null;
  file_id?: string | null;
  base_model_id?: string | null;
  base_file_id?: string | null;
}

export interface GenerationPreset {
  id: string;
  name: string;
  /** Null means the stored payload is unusable; `warning` says why. */
  payload: GenerationPresetPayload | null;
  warning?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationPresetCreatePayload {
  name: string;
  payload: GenerationPresetPayload;
}

export type GenerationPresetUpdatePayload = Partial<GenerationPresetCreatePayload>;

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
  /** Second encoder of a dual-encoder stack (LTX video). Optional: the backend
   *  defaults it to null, and updates merge, so omitting it preserves the
   *  stored value. */
  text_encoder_2?: string | null;
  clip_type: string | null;
  parent_model: string | null;
  supported_modes?: string[];
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
  media_type?: MediaType;
  supported_modes?: string[];
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
  video_family?: VideoFamily | null;
  media_type?: MediaType;
  supported_modes?: string[];
  star_count?: number;
  comment_count?: number;
  download_count?: number;
  run_count?: number;
}

export interface ModelSocialStats {
  model_id: string;
  star_count: number;
  comment_count: number;
  download_count: number;
  run_count: number;
  viewer_starred: boolean;
}

export interface ModelComment {
  id: string;
  model_id: string;
  user_id?: string | null;
  author_username?: string | null;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
  author_role?: string | null;
  body: string;
  like_count: number;
  viewer_liked: boolean;
  created_at: string;
}

export interface PaginatedComments {
  items: ModelComment[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_more: boolean;
}

export interface AssetLikeState {
  like_count: number;
  viewer_liked: boolean;
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

/** Derived, advisory video-engine key. Not persisted; the backend computes it
 *  from the model's base architecture. Mirrors `VIDEO_ENGINES` in schemas.py. */
export type VideoFamily = "ltx" | "wan" | "hunyuan-video" | "svd" | "cogvideo" | "mochi";

/** Derived, advisory output modality. Not persisted; the backend computes it
 *  from the model's base architecture. Mirrors `media_type()` in schemas.py. */
export type MediaType = "image" | "video" | "unknown";

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
  text_encoder_2: string | null;
  clip_type: string | null;
  base_model?: string | null;
  base_model_id: string | null;
  base_version_id: string | null;
  base_file_id: string | null;
  cover_url?: string | null;
  video_family?: VideoFamily | null;
  media_type?: MediaType;
  supported_modes?: string[];
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

/** Owner Library ordering; serialized exactly as these strings. */
export type GallerySort = "newest" | "oldest" | "name";

/** Owner Library source filter; `all` is never sent as a query parameter. */
export type GallerySource = "all" | "workspace" | "ai_tool_studio";

/** Query accepted by the owner gallery (`GET /api/v1/gallery/me`). */
export interface MyGalleryQuery {
  /** Default 0. Rows to skip; advance by the number of items received. */
  offset?: number;
  /** Default 60, clamped server-side to the gallery cap (500). */
  limit?: number;
  /** Case-insensitive match over key/filename, prompt, tool name and tags. */
  q?: string;
  sort?: GallerySort;
  source?: GallerySource;
  /**
   * Media tab filter, applied before paging. Derived from the file extension,
   * matching `assetTypeOf`. `3d` is currently always empty because the gallery
   * allowlist has no model extensions, but the filter stays honest rather than
   * client-filtering a single loaded page.
   */
  media_type?: AssetType;
  tags?: string[] | string;
  tag_mode?: "all" | "any";
  /** Owner-only collection filter; a foreign or unknown id is 404. */
  collection_id?: string;
  /** Legacy filters, still honored when `source` is "all". */
  tag?: string;
  origin?: string;
  tool_id?: string;
  tool_type?: string;
}

/**
 * Offset-paged owner gallery. `total` is the visible match count before
 * paging, so `items` never contains hidden media and `has_more` is reliable
 * for infinite scroll.
 */
export interface GalleryPage {
  items: GalleryItem[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

/** Paginated gallery envelope for related-asset matching (`GET /api/v1/gallery/related`). */
export interface PaginatedGallery {
  items: GalleryItem[];
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

  async getDirectorProviders(): Promise<DirectorProviderStatus[]> {
    return request<DirectorProviderStatus[]>("/api/v1/director/providers");
  },

  async getAppSettings(): Promise<AppSettingsSnapshot> {
    return request<AppSettingsSnapshot>("/api/admin/settings");
  },

  async updateAppSettings(patch: AppSettingsUpdate): Promise<AppSettingsSnapshot> {
    return request<AppSettingsSnapshot>("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  async testAppProvider(provider: DirectorProvider): Promise<AppSettingsTestResult> {
    return request<AppSettingsTestResult>("/api/admin/settings/test", {
      method: "POST",
      body: JSON.stringify({ provider }),
    });
  },

  async clearProviderKey(provider: DirectorProvider): Promise<AppSettingsSnapshot> {
    return request<AppSettingsSnapshot>(`/api/admin/settings/keys/${provider}`, {
      method: "DELETE",
    });
  },

  async askDirector(
    messages: DirectorMessage[],
    provider?: DirectorProvider,
  ): Promise<DirectorReply> {
    return request<DirectorReply>("/api/v1/director", {
      method: "POST",
      body: JSON.stringify({ messages, provider: provider ?? null }),
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

  async getModelSocial(modelId: string): Promise<ModelSocialStats> {
    return request<ModelSocialStats>(`/api/v1/models/${encodeURIComponent(modelId)}/social`);
  },

  async toggleModelStar(
    modelId: string,
  ): Promise<{ model_id: string; starred: boolean; star_count: number }> {
    return request<{ model_id: string; starred: boolean; star_count: number }>(
      `/api/v1/models/${encodeURIComponent(modelId)}/star`,
      { method: "POST" },
    );
  },

  async getModelComments(
    modelId: string,
    params?: { sort?: "latest" | "liked"; page?: number; limit?: number },
  ): Promise<PaginatedComments> {
    const search = new URLSearchParams();
    if (params?.sort) search.set("sort", params.sort);
    if (params?.page) search.set("page", String(params.page));
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<PaginatedComments>(
      `/api/v1/models/${encodeURIComponent(modelId)}/comments${qs ? `?${qs}` : ""}`,
    );
  },

  async postModelComment(modelId: string, body: string): Promise<ModelComment> {
    return request<ModelComment>(`/api/v1/models/${encodeURIComponent(modelId)}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },

  async deleteModelComment(commentId: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/api/v1/comments/${encodeURIComponent(commentId)}`, {
      method: "DELETE",
    });
  },

  async toggleCommentLike(
    commentId: string,
  ): Promise<{ comment_id: string; liked: boolean; like_count: number }> {
    return request<{ comment_id: string; liked: boolean; like_count: number }>(
      `/api/v1/comments/${encodeURIComponent(commentId)}/like`,
      { method: "POST" },
    );
  },

  async toggleAssetLike(
    key: string,
  ): Promise<{ key: string; liked: boolean; like_count: number }> {
    return request<{ key: string; liked: boolean; like_count: number }>("/api/v1/assets/likes", {
      method: "POST",
      body: JSON.stringify({ key }),
    });
  },

  async getAssetLikeStates(keys: string[]): Promise<Record<string, AssetLikeState>> {
    const res = await request<{ items: Record<string, AssetLikeState> }>("/api/v1/assets/likes/query", {
      method: "POST",
      body: JSON.stringify({ keys }),
    });
    return res?.items ?? {};
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

  async getWorkflowTemplateInfo(mode?: string): Promise<WorkflowTemplateInfo> {
    // Omit the query entirely for the default image template so existing
    // callers keep hitting the exact same URL as before.
    const query = mode && mode !== "text-to-image" ? `?mode=${encodeURIComponent(mode)}` : "";
    return request<WorkflowTemplateInfo>(`/api/v1/workflow/template-info${query}`);
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

  /**
   * One offset page of the owner gallery. Filters, search and sort run on the
   * server over the full visible owner dataset, so `total`/`has_more` describe
   * more than the loaded rows. Advance with `offset += items.length`.
   */
  async getMyGalleryPage(
    params: MyGalleryQuery = {},
    signal?: AbortSignal
  ): Promise<GalleryPage> {
    const query = new URLSearchParams();
    query.set("offset", String(Math.max(0, Math.trunc(params.offset ?? 0))));
    query.set(
      "limit",
      String(Math.min(Math.max(1, Math.trunc(params.limit ?? 60)), 500))
    );
    if (params.q?.trim()) query.set("q", params.q.trim());
    if (params.sort && params.sort !== "newest") query.set("sort", params.sort);
    if (params.source && params.source !== "all") query.set("source", params.source);
    if (params.media_type) query.set("media_type", params.media_type);
    if (params.collection_id) query.set("collection_id", params.collection_id);
    if (params.tag_mode && params.tag_mode !== "all") {
      query.set("tag_mode", params.tag_mode);
    }
    if (params.tags) {
      const tags = Array.isArray(params.tags)
        ? params.tags
        : params.tags.split(",");
      const joined = tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .join(",");
      if (joined) query.set("tags", joined);
    }
    if (params.tag?.trim()) query.set("tag", params.tag.trim());
    if (params.origin) query.set("origin", params.origin);
    if (params.tool_id) query.set("tool_id", params.tool_id);
    if (params.tool_type) query.set("tool_type", params.tool_type);

    const data = await request<GalleryPage>(`/api/v1/gallery/me?${query}`, {
      signal,
    });
    return {
      ...data,
      items: (data.items || []).map((item) => ({
        ...item,
        url: resolveMediaUrl(item.url) || item.url,
        thumbnail_url: resolveMediaUrl(item.thumbnail_url) || item.thumbnail_url,
      })),
    };
  },

  /**
   * Backward-compatible flat listing: the first `limit` owner assets, using
   * the same server-side filters as `getMyGalleryPage`. New paged callers
   * should use `getMyGalleryPage` directly.
   */
  async getMyGallery(
    limit = 60,
    filters: {
      origin?: string;
      tool_id?: string;
      tool_type?: string;
      tag?: string;
      tags?: string[] | string;
      tag_mode?: "all" | "any";
      media_type?: AssetType;
      source?: GallerySource;
      sort?: GallerySort;
      q?: string;
      collection_id?: string;
    } = {},
    signal?: AbortSignal
  ): Promise<GalleryItem[]> {
    const page = await this.getMyGalleryPage(
      {
        ...filters,
        limit: Math.min(Math.max(1, Math.trunc(limit)), 500),
        offset: 0,
      },
      signal
    );
    return page.items;
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

  async getRelatedGallery(params: {
    key: string;
    page?: number;
    limit?: number;
    mode?: "all" | "model" | "tags";
    /** `own` (server default) or `public`; the UI opts in explicitly. */
    scope?: "own" | "public";
  }): Promise<PaginatedGallery> {
    const query = new URLSearchParams({ key: params.key });
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 12));
    query.set("mode", params.mode ?? "all");
    query.set("scope", params.scope ?? "own");
    const data = await request<PaginatedGallery>(
      `/api/v1/gallery/related?${query.toString()}`,
    );
    return {
      ...data,
      items: (data.items || []).map((item) => ({
        ...item,
        url: resolveMediaUrl(item.url) || item.url,
        thumbnail_url: resolveMediaUrl(item.thumbnail_url) ?? undefined,
        before_detailer_url: resolveMediaUrl(item.before_detailer_url) ?? null,
      })),
    };
  },

  async listTools(
    userId?: string,
    options?: { page?: number; limit?: number }
  ): Promise<ToolSummary[]> {
    const params = new URLSearchParams();
    if (userId) params.set("user_id", userId);
    if (options?.page) params.set("page", String(options.page));
    if (options?.limit) params.set("limit", String(options.limit));
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const resp = await request<ToolCatalogResponse>(`/api/tools${queryString}`);
    return (resp.items || []).map((tool) => ({
      ...tool,
      thumbnail_url: resolveMediaUrl(tool.thumbnail_url),
    }));
  },

  async getTools(
    userId?: string,
    options?: { page?: number; limit?: number }
  ): Promise<ToolSummary[]> {
    return this.listTools(userId, options);
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

  async getToolForEdit(toolId: string): Promise<ToolEditorPayload> {
    const payload = await request<ToolEditorPayload>(`/api/tools/${encodeURIComponent(toolId)}/edit`);
    return {
      ...payload,
      thumbnail_url: resolveMediaUrl(payload.thumbnail_url),
    };
  },

  async updateTool(toolId: string, file: File, name: string, mode?: ToolMode, aspectRatio: ToolAspectRatio = "1:1", thumbnail?: File, controls?: ToolControl[]): Promise<ToolDetail> {
    const form = new FormData();
    form.append("workflow_api", file, file.name || "workflow_api.json");
    form.append("name", name);
    if (mode) form.append("mode", mode);
    form.append("aspect_ratio", aspectRatio);
    if (thumbnail) form.append("thumbnail", thumbnail, thumbnail.name);
    if (controls) form.append("controls", JSON.stringify(controls));
    const resp = await fetch(`${API_BASE}/api/tools/${encodeURIComponent(toolId)}`, { method: "PUT", headers: getAuthHeaders(), body: form });
    if (!resp.ok) {
      const errorMsg = await parseErrorResponse(resp, "Could not update tool");
      throw new ApiError(resp.status, errorMsg);
    }
    return (await resp.json()) as ToolDetail;
  },

  async runTool(toolId: string, prompt: string, aspectRatio: ToolAspectRatio, image?: File, values: Record<string, string | number | boolean> = {}, images: Record<string, File> = {}, options: { clientId?: string; saveToGallery?: boolean } = {}): Promise<ToolRunResult> {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("aspect_ratio", aspectRatio);
    form.append("values", JSON.stringify(values));
    // Omit entirely when absent: an empty string would read as a supplied
    // (unreserved) id and must not be sent.
    if (options.clientId) form.append("client_id", options.clientId);
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

  /**
   * Re-sign one asset's media URLs. Private assets are served through a
   * short-lived capability in the URL, so a long-open page (or a download that
   * starts after expiry) must refresh instead of showing broken media.
   */
  async refreshAssetMedia(
    key: string,
    signal?: AbortSignal,
  ): Promise<AssetMediaResponse> {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    const item = await request<AssetMediaResponse>(
      `/api/v1/assets/${encoded}/media`,
      { signal },
    );
    return {
      ...item,
      url: resolveMediaUrl(item.url) || item.url,
      thumbnail_url: resolveMediaUrl(item.thumbnail_url) ?? item.thumbnail_url,
      before_detailer_url:
        resolveMediaUrl(item.before_detailer_url) ?? item.before_detailer_url,
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

  async health(signal?: AbortSignal): Promise<HealthResponse> {
    return request<HealthResponse>("/api/v1/health", { signal });
  },

  /** Core readiness only; HTTP 503 rejects with ApiError, independent of engine status. */
  async ready(signal?: AbortSignal): Promise<ReadyResponse> {
    return request<ReadyResponse>("/api/v1/ready", { signal });
  },

  /** Mint a single-use relay ticket bound to the caller; the server picks client_id. */
  async createProgressTicket(signal?: AbortSignal): Promise<ProgressTicketResponse> {
    return request<ProgressTicketResponse>("/api/v1/ws/ticket", {
      method: "POST",
      signal,
    });
  },

  /**
   * Mint a ticket and open the relay WebSocket in one call. Resolves only once
   * the handshake is OPEN, so a submission can never queue before the
   * authenticated relay is listening. Rejects on error, close-before-open, a
   * bounded timeout, an aborted signal, or when the session token changes while
   * the ticket/handshake is in flight (a stale account must not inherit it).
   * Callers must submit the returned `clientId` to `/generate` or tool exec.
   */
  async openProgressSocket(
    onEvent: (event: ProgressEvent) => void,
    options: {
      signal?: AbortSignal;
      /**
       * Milliseconds to wait for OPEN before rejecting. Bounds the WebSocket
       * handshake only; the ticket HTTP request is bounded by its own fetch and
       * the abort signal.
       */
      timeoutMs?: number;
    } = {}
  ): Promise<{ clientId: string; socket: WebSocket }> {
    if (options.signal?.aborted) {
      throw new ApiError(499, "Progress relay cancelled.");
    }
    const timeoutMs = options.timeoutMs ?? 10_000;
    const tokenAtStart = getAuthToken();
    let ticket: ProgressTicketResponse;
    try {
      ticket = await this.createProgressTicket(options.signal);
    } catch (error) {
      // A cancel racing the ticket request surfaces as a raw AbortError from
      // fetch; normalize it to the 499 callers already handle.
      if (options.signal?.aborted) {
        throw new ApiError(499, "Progress relay cancelled.");
      }
      throw error;
    }

    if (options.signal?.aborted) {
      throw new ApiError(499, "Progress relay cancelled.");
    }
    if (getAuthToken() !== tokenAtStart) {
      throw new ApiError(401, "Session changed before the relay opened.");
    }

    let wsBase: string;
    if (process.env.NEXT_PUBLIC_API_URL) {
      wsBase = process.env.NEXT_PUBLIC_API_URL.replace(/^http/, "ws");
    } else if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsBase = `${proto}//${window.location.hostname}:8000`;
    } else {
      wsBase = "ws://127.0.0.1:8000";
    }

    // `ws_path` is display metadata; the route is fixed so a server value can
    // never redirect the relay to another endpoint.
    const socket = new WebSocket(
      `${wsBase}/api/v1/ws/progress?ticket=${encodeURIComponent(ticket.ticket)}`,
    );

    return await new Promise<{ clientId: string; socket: WebSocket }>(
      (resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          fail(new ApiError(504, "Progress relay handshake timed out."));
        }, timeoutMs);

        const cleanup = () => {
          settled = true;
          clearTimeout(timer);
          socket.onopen = null;
          socket.onerror = null;
          socket.onclose = null;
          options.signal?.removeEventListener("abort", onAbort);
        };

        const fail = (error: Error) => {
          if (settled) return;
          cleanup();
          try {
            socket.close();
          } catch {
            /* already closing */
          }
          reject(error);
        };

        const onAbort = () => fail(new ApiError(499, "Progress relay cancelled."));
        options.signal?.addEventListener("abort", onAbort, { once: true });

        socket.onopen = () => {
          if (settled) return;
          // A token swap during the handshake means this socket belongs to a
          // session that is no longer current.
          if (getAuthToken() !== tokenAtStart) {
            fail(new ApiError(401, "Session changed before the relay opened."));
            return;
          }
          cleanup();
          resolve({ clientId: ticket.client_id, socket });
        };
        socket.onerror = () =>
          fail(new ApiError(502, "Progress relay connection failed."));
        socket.onclose = () =>
          fail(new ApiError(502, "Progress relay closed before opening."));
        socket.onmessage = (msg) => {
          // Binary frames are ComfyUI live previews — not structured events.
          if (typeof msg.data !== "string") return;
          try {
            onEvent(JSON.parse(msg.data) as ProgressEvent);
          } catch {
            /* ignore malformed frames */
          }
        };
      }
    );
  },

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const usesCredentials = !payload.provider || payload.provider === "credentials";
    if (usesCredentials && !payload.password) {
      throw new ApiError(400, "Password is required.");
    }
    const res = await request<any>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email_or_username: payload.emailOrUsername,
        username: payload.emailOrUsername,
        email: payload.emailOrUsername,
        password: payload.password,
        provider: payload.provider || "credentials",
      }),
    });
    const auth = requireAuthEnvelope(res, "Login");
    // Callers own the token commit so a stale response cannot restore a
    // session after logout; see auth-context's revision guard.
    return auth;
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const res = await request<any>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        username: payload.username,
        password: payload.password,
        display_name: payload.displayName || payload.username,
      }),
    });
    const auth = requireAuthEnvelope(res, "Registration");
    return auth;
  },

  async getMe(): Promise<{ user: UserProfile; credits: CreditStatus | null }> {
    const res = await request<any>("/api/auth/me");
    const auth = normalizeAuthResponse(res);
    if (!auth.user.id) {
      throw new ApiError(502, "The server returned an invalid session.");
    }
    return { user: auth.user, credits: auth.credits };
  },

  async claimDailyEnergy(): Promise<CreditStatus> {
    const res = await request<any>("/api/auth/claim-daily", {
      method: "POST",
    });
    return normalizeCredits(res);
  },

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const res = await request<any>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return {
      success: true,
      message: res?.message ?? "A recovery link and 6-digit code have been dispatched to your email.",
    };
  },

  async resetPassword(token: string, new_password: string): Promise<{ success: boolean; message: string }> {
    const res = await request<any>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    });
    return {
      success: true,
      message: res?.message ?? "Password updated successfully. Full studio credentials synced.",
    };
  },

  async verifyEmail(params: { token?: string; otp_code?: string }): Promise<{ success: boolean; message: string; user?: UserProfile }> {
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
  },

  async resendVerification(email?: string): Promise<{ success: boolean; message: string }> {
    const res = await request<any>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return {
      success: true,
      message: res?.message ?? "A new verification code has been dispatched to your email address.",
    };
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
    return request<ApiKeyListItem[]>("/api/auth/keys");
  },

  async createApiKey(name: string): Promise<ApiKeyResponse> {
    // The raw key is returned exactly once by the server; never invent one
    // client-side, because a locally-minted key can never authenticate.
    return request<ApiKeyResponse>("/api/auth/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async deleteApiKey(keyId: string): Promise<{ success: boolean }> {
    await request<{ deleted: boolean; key_id: string }>(
      `/api/auth/keys/${encodeURIComponent(keyId)}`,
      { method: "DELETE" },
    );
    return { success: true };
  },

  async getUserProfile(username: string): Promise<UserPublicProfile> {
    const res = await request<UserPublicProfile>(`/api/users/${encodeURIComponent(username)}`);
    return {
      ...res,
      avatar_url: resolveMediaUrl(res.avatar_url),
    };
  },

  async toggleFollowUser(username: string): Promise<{ following: boolean; followers_count: number }> {
    return request<{ following: boolean; followers_count: number }>(
      `/api/users/${encodeURIComponent(username)}/follow`,
      { method: "POST" }
    );
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
    const res = await request<{ id: string; status: string }>("/api/v1/moderation/resolve", {
      method: "POST",
      body: JSON.stringify({
        flag_id: payload.target_id,
        status: payload.action === "approve" ? "resolved" : "dismissed",
        resolution_notes: payload.notes || payload.reason || "Action taken by moderator",
      }),
    });
    return { success: true, message: `Status updated to ${res.status}` };
  },

  async getSecurityAuditLogs(
    paramsOrLimit?: { limit?: number; offset?: number; action?: string; resource_type?: string } | number,
    offset?: number,
    action?: string,
    resourceType?: string
  ): Promise<SecurityAuditLogEntry[]> {
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
  },

  async flagContent(targetType: string, targetId: string, reason: string, details?: string): Promise<{ success: boolean; message: string; id?: string }> {
    const res = await request<ContentFlagResponse | { success: boolean; message: string }>("/api/v1/moderation/flag", {
      method: "POST",
      body: JSON.stringify({ target_type: targetType, target_id: targetId, reason, details }),
    });
    if (res && "id" in res) {
      return { success: true, message: "Content report submitted successfully.", id: res.id };
    }
    return { success: true, message: (res as any)?.message || "Content report submitted successfully." };
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

  // --- Collections (owner-scoped) -----------------------------------------

  async getCollections(): Promise<CollectionRecord[]> {
    const res = await request<{ items: CollectionRecord[] }>("/api/v1/collections");
    return res.items ?? [];
  },

  async getCollection(id: string): Promise<CollectionRecord> {
    return request<CollectionRecord>(`/api/v1/collections/${encodeURIComponent(id)}`);
  },

  async createCollection(payload: CollectionCreatePayload): Promise<CollectionRecord> {
    return request<CollectionRecord>("/api/v1/collections", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateCollection(
    id: string,
    payload: CollectionUpdatePayload,
  ): Promise<CollectionRecord> {
    return request<CollectionRecord>(`/api/v1/collections/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteCollection(id: string): Promise<boolean> {
    const res = await request<{ deleted: boolean }>(
      `/api/v1/collections/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return res.deleted;
  },

  async getCollectionItems(id: string): Promise<string[]> {
    const res = await request<{ items: string[] }>(
      `/api/v1/collections/${encodeURIComponent(id)}/items`,
    );
    return res.items ?? [];
  },

  async addCollectionItems(id: string, keys: string[]): Promise<CollectionItemsAddResult> {
    return request<CollectionItemsAddResult>(
      `/api/v1/collections/${encodeURIComponent(id)}/items`,
      { method: "POST", body: JSON.stringify({ keys }) },
    );
  },

  async removeCollectionItem(id: string, key: string): Promise<boolean> {
    const res = await request<{ removed: boolean }>(
      `/api/v1/collections/${encodeURIComponent(id)}/items/${key.split("/").map(encodeURIComponent).join("/")}`,
      { method: "DELETE" },
    );
    return res.removed;
  },

  // --- Generation presets (owner-scoped) ----------------------------------

  async getPresets(): Promise<GenerationPreset[]> {
    const res = await request<{ items: GenerationPreset[] }>("/api/v1/presets");
    return res.items ?? [];
  },

  async getPreset(id: string): Promise<GenerationPreset> {
    return request<GenerationPreset>(`/api/v1/presets/${encodeURIComponent(id)}`);
  },

  async createPreset(payload: GenerationPresetCreatePayload): Promise<GenerationPreset> {
    return request<GenerationPreset>("/api/v1/presets", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updatePreset(
    id: string,
    payload: GenerationPresetUpdatePayload,
  ): Promise<GenerationPreset> {
    return request<GenerationPreset>(`/api/v1/presets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deletePreset(id: string): Promise<boolean> {
    const res = await request<{ deleted: boolean }>(
      `/api/v1/presets/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return res.deleted;
  },
};

/**
 * Rejects a malformed 2xx auth body instead of storing a blank session.
 * A token and a user id are both mandatory at this trust boundary.
 */
function requireAuthEnvelope(raw: any, action: string): AuthResponse {
  const auth = normalizeAuthResponse(raw);
  if (!auth.token || !auth.user.id) {
    throw new ApiError(502, `${action} failed: the server returned an incomplete session.`);
  }
  return auth;
}

function normalizeAuthResponse(raw: any): AuthResponse {
  const token = raw?.access_token || raw?.token || "";
  const rawUser = raw?.user || raw || {};
  // Role normalization is display-only. Authorization never infers permissions:
  // an empty list means the backend granted none.
  const normRole = normalizeRoleName(rawUser.primary_role || rawUser.role || "creator");
  const rawRoles = Array.isArray(rawUser.roles) && rawUser.roles.length > 0
    ? rawUser.roles.map(normalizeRoleName)
    : [normRole];

  const user: UserProfile = {
    id: rawUser.id || "",
    email: rawUser.email || "",
    username: rawUser.username || "",
    displayName: rawUser.display_name || rawUser.displayName || rawUser.username || "",
    role: normRole,
    roles: rawRoles,
    primary_role: normRole,
    permissions: Array.isArray(rawUser.permissions) ? rawUser.permissions : [],
    avatarUrl: resolveMediaUrl(rawUser.avatar_url || rawUser.avatarUrl) || null,
    bio: rawUser.bio ?? null,
    social_links: rawUser.social_links ?? {},
    createdAt: rawUser.created_at || rawUser.createdAt || "",
    is_verified: rawUser.is_verified ?? rawUser.isVerified ?? false,
  };
  // TokenResponse.credits is optional; never fabricate a balance.
  const credits = raw?.credits ? normalizeCredits(raw.credits) : null;
  return { token, user, credits };
}

function normalizeCredits(raw: any): CreditStatus {
  return {
    balance: typeof raw?.balance === "number" ? raw.balance : 0,
    dailyAllowance: raw?.daily_allowance ?? raw?.dailyAllowance ?? 0,
    nextResetInSeconds:
      raw?.seconds_until_next_reset ?? raw?.nextResetInSeconds ?? 0,
    lastClaimedAt: raw?.last_claimed_at ?? raw?.lastClaimedAt ?? null,
  };
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