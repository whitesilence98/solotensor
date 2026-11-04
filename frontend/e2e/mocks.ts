import type { Page, Route, WebSocketRoute } from "@playwright/test";

/**
 * FastAPI boundary stubs for the browser regression suite.
 *
 * The app is configured (NEXT_PUBLIC_API_URL) to send every API call to the
 * Next origin itself, so each request is same-origin, interceptable and never
 * reaches the real FastAPI service, ComfyUI, a database or the internet. Only
 * the shapes from `backend/app/schemas.py` / `frontend/src/lib/api.ts` are
 * reproduced here; no production code is imported.
 */

export interface SeedUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
}

export const ALICE: SeedUser = {
  id: "user-alice",
  username: "alice",
  displayName: "Alice",
  email: "alice@example.test",
};

export const BOB: SeedUser = {
  id: "user-bob",
  username: "bob",
  displayName: "Bob",
  email: "bob@example.test",
};

/** Normalized `UserProfile` exactly as `normalizeAuthResponse` stores it. */
export function storedUser(user: SeedUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: "creator",
    roles: ["creator"],
    primary_role: "creator",
    permissions: [],
    avatarUrl: null,
    bio: null,
    social_links: {},
    createdAt: "2026-01-01T00:00:00Z",
    is_verified: true,
  };
}

/** Server (snake_case) user envelope. */
export function serverUser(user: SeedUser) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    display_name: user.displayName,
    primary_role: "creator",
    roles: ["creator"],
    permissions: [],
    avatar_url: null,
    bio: null,
    social_links: {},
    created_at: "2026-01-01T00:00:00Z",
    is_verified: true,
  };
}

export function serverCredits(balance = 40) {
  return {
    balance,
    daily_allowance: 40,
    seconds_until_next_reset: 3600,
    last_claimed_at: null,
  };
}

export function storedCredits(balance = 40) {
  return {
    balance,
    dailyAllowance: 40,
    nextResetInSeconds: 3600,
    lastClaimedAt: null,
  };
}

export const HEALTH_OK = {
  status: "ok",
  comfy: "up",
  storage: "up",
  database: "postgres",
  redis: null,
  s3: null,
  database_status: "up",
};

export const SELECTABLE_MODEL = {
  model_id: "model-sdxl",
  version_id: "version-sdxl",
  file_id: "file-sdxl",
  title: "SDXL Studio",
  model_type: "Checkpoint",
  version_name: "SDXL 1.0",
  filename: "sdxl_studio.safetensors",
  category: "checkpoints",
  sha256: "0".repeat(64),
  vae: null,
  text_encoder: null,
  text_encoder_2: null,
  clip_type: null,
  base_model: "SDXL",
  base_model_id: null,
  base_version_id: null,
  base_file_id: null,
  cover_url: null,
  video_family: null,
  media_type: "image",
  supported_modes: ["text-to-image"],
};

export interface GalleryItemStub {
  key: string;
  url: string;
  size?: number;
  last_modified?: string;
  thumbnail_url?: string | null;
  metadata?: Record<string, unknown> | null;
  is_private?: boolean | null;
  url_expires_at?: string | null;
  user_id?: string | null;
}

export function galleryItem(key: string, url = `/files/demo/${key}`, extra: Partial<GalleryItemStub> = {}): GalleryItemStub {
  return {
    key,
    url,
    size: 1024,
    last_modified: "2026-01-01T00:00:00Z",
    thumbnail_url: null,
    metadata: {
      prompt: `Prompt for ${key}`,
      width: 768,
      height: 1024,
      created_at: "2026-01-01T00:00:00Z",
      elapsed_ms: 1200,
    },
    is_private: false,
    url_expires_at: null,
    ...extra,
  };
}

export interface RecordedCall {
  method: string;
  path: string;
  search: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface ToolControlStub {
  id: string;
  path: string;
  label: string;
  meta_title: string | null;
  kind: string;
  value: string | number | boolean;
  default?: string | number | boolean;
  numeric: boolean;
  seed: boolean;
  options: Array<string | number>;
  minimum: number | null;
  maximum: number | null;
  step: number | null;
  node_id: string;
  input_name: string;
  role?: string | null;
}

function control(overrides: Partial<ToolControlStub> & { id: string; kind: string; value: string }): ToolControlStub {
  return {
    path: `nodes.${overrides.id}.inputs.${overrides.kind}`,
    label: overrides.id,
    meta_title: null,
    default: overrides.value,
    numeric: overrides.kind === "number",
    seed: false,
    options: [],
    minimum: null,
    maximum: null,
    step: null,
    node_id: "1",
    input_name: overrides.kind,
    role: null,
    ...overrides,
  };
}

export const TOOL_DETAIL = {
  tool_id: "t-demo",
  name: "Demo Tool",
  mode: "text-to-image",
  default_aspect_ratio: "1:1",
  supported_aspect_ratios: ["1:1", "16:9"],
  requires_image: false,
  has_prompt: true,
  created_at: "2026-01-01T00:00:00Z",
  thumbnail_url: null,
  output_kind: "image",
  controls: [
    control({ id: "prompt", kind: "prompt", value: "A brass lighthouse", role: "positive_prompt", input_name: "text" }),
    control({ id: "steps", kind: "number", value: "20", role: "steps", input_name: "steps" }),
  ],
  essential_summary: {
    has_seed: false,
    has_aspect_ratio: false,
    has_cfg: false,
    has_steps: true,
    steps_control_id: "steps",
  },
  aspect_dimensions: { "1:1": [1024, 1024], "16:9": [1344, 768] },
  dimension_multiple: 8,
};

export interface MockOptions {
  user?: SeedUser;
  health?: Record<string, unknown> | null;
  /** Return null to simulate an unreachable health probe (network failure). */
  healthFailure?: boolean;
  /** Owner gallery rows; the handler slices them by the real offset/limit. */
  galleryItems?: GalleryItemStub[];
  /** Force the owner gallery to fail with this HTTP status (e.g. 401). */
  galleryStatus?: number;
  generate?: () => Promise<unknown> | unknown;
  /** Abort `/api/v1/generate` at the network layer (no HTTP response). */
  generateNetworkFailure?: boolean;
  toolRun?: (body: string) => Promise<unknown> | unknown;
  /** Force `/api/tools/{id}/run` to fail with this HTTP status. */
  runStatus?: number;
  runErrorDetail?: string;
  /** Abort `/api/tools/{id}/run` at the network layer (no HTTP response). */
  runNetworkFailure?: boolean;
  media?: (key: string) => { status?: number; body?: unknown } | null;
  /** Override the `/files/*` response (default: a 1x1 transparent PNG). */
  fileResponse?: { status: number; contentType: string; body: Buffer };
}

/**
 * Installs every stub on a page. `state` is mutable so a test can flip an
 * account, hold a completion, or make the engine unreachable mid-test.
 */
export class BackendMock {
  calls: RecordedCall[] = [];
  sockets: WebSocketRoute[] = [];
  closedSockets = 0;
  user: SeedUser;
  health: Record<string, unknown> | null;
  healthFailure: boolean;
  galleryItems: GalleryItemStub[];
  galleryStatus: number | null;
  generate: NonNullable<MockOptions["generate"]>;
  generateNetworkFailure: boolean;
  generateCalls = 0;
  toolRun: NonNullable<MockOptions["toolRun"]>;
  runStatus: number | null;
  runErrorDetail: string;
  runNetworkFailure: boolean;
  media: NonNullable<MockOptions["media"]>;
  fileResponse: NonNullable<MockOptions["fileResponse"]>;
  attach: (page: Page) => Promise<void>;

  constructor(options: MockOptions = {}) {
    this.user = options.user ?? ALICE;
    this.health = options.health === undefined ? HEALTH_OK : options.health;
    this.healthFailure = options.healthFailure ?? false;
    this.galleryItems = options.galleryItems ?? [galleryItem("alice-a.png")];
    this.galleryStatus = options.galleryStatus ?? null;
    this.generate = options.generate ?? (() => ({ prompt_id: "prompt-1", status: "completed", images: [], error: null, elapsed_ms: 10 }));
    this.generateNetworkFailure = options.generateNetworkFailure ?? false;
    this.toolRun = options.toolRun ?? (() => ({ tool_id: "t-demo", prompt_id: "tool-prompt-1", status: "completed", images: [{ filename: "demo-output.png", url: "/files/demo/demo-output.png" }], error: null, elapsed_ms: 10 }));
    this.runStatus = options.runStatus ?? null;
    this.runErrorDetail = options.runErrorDetail ?? "Execution rejected by the studio.";
    this.runNetworkFailure = options.runNetworkFailure ?? false;
    this.media = options.media ?? (() => null);
    this.fileResponse =
      options.fileResponse ?? {
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      };

    this.attach = async (page: Page) => {
      await page.route("**/api/**", (route) => this.handleHttp(route));
      await page.route("**/files/**", (route) => this.handleFile(route));
      await page.routeWebSocket(/\/api\/v1\/ws\/progress/, (ws) => {
        this.sockets.push(ws);
        ws.onClose(() => {
          this.closedSockets += 1;
        });
      });
    };
  }

  /** Seed the real storage contract so the app boots already signed in. */
  async seed(page: Page, user: SeedUser = this.user): Promise<void> {
    const payload = {
      solotensor_token: `token-${user.id}`,
      solotensor_user: JSON.stringify(storedUser(user)),
      solotensor_credits: JSON.stringify(storedCredits()),
    };
    await page.addInitScript((values) => {
      try {
        for (const [key, value] of Object.entries(values)) window.localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    }, payload);
  }

  /** Swap the seeded session (the next navigation boots as this user). */
  async switchSession(page: Page, user: SeedUser): Promise<void> {
    await page.addInitScript((values) => {
      try {
        window.localStorage.setItem("solotensor_token", values.token);
        window.localStorage.setItem("solotensor_user", values.user);
      } catch {
        /* ignore */
      }
    }, { token: `token-${user.id}`, user: JSON.stringify(storedUser(user)) });
    this.user = user;
  }

  lastSocket(): WebSocketRoute {
    const socket = this.sockets[this.sockets.length - 1];
    if (!socket) throw new Error("No progress WebSocket was opened");
    return socket;
  }

  callsTo(path: string): RecordedCall[] {
    return this.calls.filter((call) => call.path === path);
  }

  private async handleFile(route: Route): Promise<void> {
    const { status, contentType, body } = this.fileResponse;
    await route.fulfill({ status, contentType, body });
  }

  private async handleHttp(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const bodyText = request.postData() ?? "";
    this.calls.push({
      method,
      path,
      search: Object.fromEntries(url.searchParams.entries()),
      body: bodyText,
      headers: request.headers(),
    });

    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
        body: JSON.stringify(body),
      });

    if (method === "OPTIONS") return json(204, {});

    if (path === "/api/v1/health") {
      if (this.healthFailure) return route.abort("failed");
      return json(200, this.health ?? HEALTH_OK);
    }

    if (path === "/api/auth/me") {
      return json(200, { user: serverUser(this.user), credits: serverCredits() });
    }

    if (path === "/api/auth/login" && method === "POST") {
      const loginUser = this.user;
      return json(200, {
        access_token: `token-${loginUser.id}`,
        user: serverUser(loginUser),
        credits: serverCredits(),
      });
    }

    if (path === "/api/v1/notifications/unread-count") {
      return json(200, { unread_count: 0 });
    }

    if (path === "/api/v1/models/public/selectable") {
      return json(200, { items: [SELECTABLE_MODEL] });
    }

    if (path === "/api/v1/models/public") {
      return json(200, { items: [] });
    }

    if (path === "/api/v1/models") {
      return json(200, { items: [] });
    }

    if (path === "/api/tools") {
      return json(200, { items: [], total: 0, page: 1, limit: 24, has_more: false });
    }

    if (path === "/api/tools/t-demo" && method === "GET") {
      return json(200, TOOL_DETAIL);
    }

    if (path === "/api/tools/t-demo/run" && method === "POST") {
      if (this.runNetworkFailure) return route.abort("failed");
      if (this.runStatus && this.runStatus >= 400) {
        return json(this.runStatus, { detail: this.runErrorDetail });
      }
      const result = await this.toolRun(bodyText);
      return json(200, result);
    }

    if (path === "/api/v1/tags") {
      return json(200, { items: [] });
    }

    if (path === "/api/v1/collections") {
      return json(200, { items: [] });
    }

    if (path === "/api/v1/assets/likes/query" || path === "/api/v1/assets/likes") {
      return json(200, { items: {} });
    }

    const mediaMatch = path.match(/^\/api\/v1\/assets\/(.+)\/media$/);
    if (mediaMatch) {
      const key = decodeURIComponent(mediaMatch[1]);
      const result = this.media(key);
      if (!result) return json(404, { detail: "Asset not found" });
      if (result.status && result.status >= 400) return json(result.status, result.body ?? { detail: "Forbidden" });
      return json(200, result.body);
    }

    if (path === "/api/v1/gallery/me") {
      if (this.galleryStatus && this.galleryStatus >= 400) {
        return json(this.galleryStatus, { detail: "Your session has expired." });
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 60);
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const mediaType = url.searchParams.get("media_type");
      let rows = this.galleryItems;
      if (q) {
        rows = rows.filter((item) => {
          const prompt = String((item.metadata as { prompt?: string } | null)?.prompt ?? "");
          return `${item.key} ${prompt}`.toLowerCase().includes(q);
        });
      }
      if (mediaType) {
        rows = rows.filter((item) => extensionKind(item.key) === mediaType);
      }
      const items = rows.slice(offset, offset + limit);
      return json(200, {
        items,
        total: rows.length,
        offset,
        limit,
        has_more: offset + items.length < rows.length,
      });
    }

    if (path === "/api/v1/gallery/paginated") {
      return json(200, { items: [], total: 0, page: 1, limit: 60, total_pages: 0, has_more: false });
    }

    if (path === "/api/v1/gallery") {
      return json(200, { items: [] });
    }

    if (path.startsWith("/api/users/")) {
      const username = decodeURIComponent(path.slice("/api/users/".length));
      return json(200, {
        id: this.user.id,
        username,
        display_name: this.user.displayName,
        avatar_url: null,
        role: "creator",
        roles: ["creator"],
        primary_role: "creator",
        permissions: [],
        bio: null,
        social_links: {},
        created_at: "2026-01-01T00:00:00Z",
        is_following: false,
        followers_count: 0,
        following_count: 0,
        runs_count: 0,
        downloads_count: 0,
        likes_count: 0,
        stars_count: 0,
        tools_count: 0,
        models_count: 0,
        posts_count: 0,
        workflows_count: 0,
      });
    }

    if (path === "/api/v1/ws/ticket" && method === "POST") {
      return json(200, {
        ticket: `ticket-${this.sockets.length + 1}`,
        client_id: `client-${this.sockets.length + 1}`,
        expires_in_seconds: 60,
        ws_path: "/api/v1/ws/progress",
      });
    }

    if (path === "/api/v1/generate" && method === "POST") {
      this.generateCalls += 1;
      if (this.generateNetworkFailure) return route.abort("failed");
      const result = await this.generate();
      return json(200, result);
    }

    return json(404, { detail: `Unstubbed endpoint: ${method} ${path}` });
  }
}

const VIDEO_EXT = [".mp4", ".webm", ".mov", ".mkv"];

/** Mirrors `assetTypeOf` so `media_type` filtering honours the real contract. */
export function extensionKind(key: string): "image" | "video" {
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  return VIDEO_EXT.includes(ext) ? "video" : "image";
}
