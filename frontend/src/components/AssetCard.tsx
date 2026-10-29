"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  Bookmark,
  Box,
  Download,
  Heart,
  Play,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import {
  api,
  ApiError,
  resolveMediaUrl,
  type AssetLikeState,
  type AssetRecord,
  type GalleryItem,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { usePersistentState, STORAGE_KEYS } from "@/lib/storage";

/* Deterministic pseudo-aspect from key so unspecified items vary naturally with zero CLS */
function aspectFromKey(key: string): { w: number; h: number } {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  const ratios = [
    [4, 5], [3, 4], [1, 1], [4, 3], [3, 4], [16, 10], [4, 5], [2, 3],
  ];
  const [w, h] = ratios[Math.abs(hash) % ratios.length];
  return { w, h };
}

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function getAssetType(asset: AssetRecord | GalleryItem): "image" | "video" | "3d" {
  if ("type" in asset && asset.type) {
    return asset.type;
  }
  const key = (asset.key || "").toLowerCase();
  if (key.endsWith(".mp4") || key.endsWith(".webm") || key.endsWith(".mov")) {
    return "video";
  }
  if (key.endsWith(".glb") || key.endsWith(".gltf") || key.endsWith(".obj")) {
    return "3d";
  }
  return "image";
}

const QUICK_BTN =
  "flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-black/50 text-white/80 " +
  "backdrop-blur-md transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-white/40 hover:bg-black/80 hover:text-white active:scale-95 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

const DANGER_BTN =
  "flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-black/50 text-white/70 " +
  "backdrop-blur-md transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-[var(--danger)] hover:bg-[var(--danger)] hover:text-white active:scale-95 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--danger)]";

/* Same chrome as QUICK_BTN; width is driven by whether a count is shown. */
const LIKE_BTN =
  "flex h-7 items-center justify-center gap-1 rounded-lg border border-white/20 bg-black/50 text-white/80 " +
  "backdrop-blur-md transition-[background-color,border-color,color,transform] duration-200 ease-out hover:border-white/40 hover:bg-black/80 hover:text-white active:scale-95 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

/* ------------------------------------------------------------------ *
 * Shared gallery like state.
 *
 * Every gallery mounts many AssetCards at once, so letting each card fetch
 * its own like state would be one request per card. Instead all cards
 * subscribe to this module-level store; keys requested during the same
 * commit are coalesced into a single `getAssetLikeStates` call (chunked to
 * the API's 200-key ceiling). The store only ever holds server-returned
 * values — a key with no entry renders as 0 / not-liked until the batch
 * response lands. The inspection stage reads and writes the same store,
 * so a like toggled in either surface is immediately consistent.
 * ------------------------------------------------------------------ */

const LIKE_QUERY_LIMIT = 200;

const likeStore = new Map<string, AssetLikeState>();
const pendingLikeKeys = new Set<string>();
// key -> ownership token for the in-flight query that claimed it.
const inFlightLikeKeys = new Map<string, symbol>();
// Incremented whenever a toggle lands for a key. A batch query only applies a
// row whose revision it captured at dispatch, so a slow query can never paint
// over a like the server confirmed afterwards.
const likeRevision = new Map<string, number>();
const likeListeners = new Set<() => void>();
let likeFlushScheduled = false;
let likeViewerId: string | null = null;

function notifyLikeListeners() {
  for (const listener of Array.from(likeListeners)) listener();
}

function subscribeLikeStore(listener: () => void) {
  likeListeners.add(listener);
  return () => {
    likeListeners.delete(listener);
  };
}

function applyLikeState(key: string, state: AssetLikeState) {
  const prev = likeStore.get(key);
  if (prev && prev.like_count === state.like_count && prev.viewer_liked === state.viewer_liked) {
    return;
  }
  likeStore.set(key, state);
  notifyLikeListeners();
}

/** Apply a server-confirmed toggle result, stamping a fresh revision. */
function applyToggledLikeState(key: string, state: AssetLikeState) {
  likeRevision.set(key, (likeRevision.get(key) ?? 0) + 1);
  applyLikeState(key, state);
}

function scheduleLikeFlush() {
  if (likeFlushScheduled) return;
  likeFlushScheduled = true;
  const run = () => {
    likeFlushScheduled = false;
    void flushLikeQueries();
  };
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

async function flushLikeQueries() {
  if (pendingLikeKeys.size === 0) return;
  const viewerAtFlush = likeViewerId;
  const token = Symbol("like-flush");
  const keys = Array.from(pendingLikeKeys).slice(0, LIKE_QUERY_LIMIT);
  const revisionsAtFlush = new Map<string, number>();
  for (const key of keys) {
    pendingLikeKeys.delete(key);
    inFlightLikeKeys.set(key, token);
    revisionsAtFlush.set(key, likeRevision.get(key) ?? 0);
  }
  try {
    const states = await api.getAssetLikeStates(keys);
    // A session switch mid-flight invalidates the response; drop it rather
    // than paint another viewer's like state.
    if (viewerAtFlush !== likeViewerId) return;
    for (const key of keys) {
      const next = states[key];
      if (!next) continue;
      // A toggle confirmed while this query was in flight is newer truth.
      if ((likeRevision.get(key) ?? 0) !== revisionsAtFlush.get(key)) continue;
      applyLikeState(key, {
        like_count: Number(next.like_count) || 0,
        viewer_liked: Boolean(next.viewer_liked),
      });
    }
  } catch {
    // Leave the keys absent so the cards honestly render 0 / not-liked.
    // They are re-requested when a card remounts.
  } finally {
    for (const key of keys) {
      if (inFlightLikeKeys.get(key) === token) inFlightLikeKeys.delete(key);
    }
    if (pendingLikeKeys.size > 0) scheduleLikeFlush();
  }
}

function requestLikeState(key: string, viewerId: string | null) {
  if (likeViewerId !== viewerId) {
    // New viewer (sign in / sign out): every cached answer belongs to the old
    // session. `flushLikeQueries` drops any response that outlives this flip.
    likeViewerId = viewerId;
    likeStore.clear();
    pendingLikeKeys.clear();
    inFlightLikeKeys.clear();
    likeRevision.clear();
    notifyLikeListeners();
  }
  if (likeStore.has(key) || pendingLikeKeys.has(key) || inFlightLikeKeys.has(key)) return;
  pendingLikeKeys.add(key);
  scheduleLikeFlush();
}

export interface AssetLikeControl {
  liked: boolean;
  likeCount: number;
  pending: boolean;
  error: string | null;
  toggle: () => void;
}

export function useAssetLike(key: string | undefined): AssetLikeControl {
  const { user, isAuthenticated, isLoading, openAuthModal } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerId = user?.id ?? null;

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  // Drop a stale failure message when the card is recycled onto another asset.
  useEffect(() => {
    setError(null);
  }, [key]);

  const subscribe = useCallback(
    (listener: () => void) => subscribeLikeStore(listener),
    []
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (key ? likeStore.get(key) : undefined),
    () => undefined
  );

  // Wait for the session to resolve so the first batch already knows who the
  // viewer is; otherwise every signed-in gallery would issue two queries.
  useEffect(() => {
    if (!key || isLoading) return;
    requestLikeState(key, viewerId);
  }, [key, viewerId, isLoading]);

  const toggle = useCallback(() => {
    if (!key || pending) return;
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    setError(null);
    setPending(true);
    void (async () => {
      try {
        const res = await api.toggleAssetLike(key);
        applyToggledLikeState(key, {
          like_count: Number(res.like_count) || 0,
          viewer_liked: Boolean(res.liked),
        });
      } catch (err) {
        // Nothing was applied optimistically, so the control already shows
        // the last server-confirmed state; just tell the viewer it failed.
        if (err instanceof ApiError && err.status === 401) {
          // Session expired between page load and click — re-open the modal
          // instead of showing a raw "Unauthorized".
          openAuthModal();
          setError(null);
          return;
        }
        setError(err instanceof Error && err.message ? err.message : "Like failed");
      } finally {
        setPending(false);
      }
    })();
  }, [key, pending, isAuthenticated, openAuthModal]);

  return {
    liked: Boolean(snapshot?.viewer_liked),
    likeCount: Math.max(0, Number(snapshot?.like_count) || 0),
    pending,
    error,
    toggle,
  };
}

export function formatLikeCount(count: number): string {
  // Render the server's exact figure — no abbreviations, no rounding.
  return String(Math.max(0, Math.trunc(count)));
}

export interface AssetCardProps {
  asset: AssetRecord | GalleryItem;
  saved?: boolean;
  onBookmark?: () => void;
  onOpen: () => void;
  onDelete?: () => void;
  aspectRatio?: string; // e.g. "3/4", "1/1", or "natural"
  showRemix?: boolean; // default: true
  remixModelId?: string; // optional override for model context
}

export default function AssetCard({
  asset,
  saved = false,
  onBookmark,
  onOpen,
  onDelete,
  aspectRatio = "natural",
  showRemix = true,
  remixModelId,
}: AssetCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [naturalAspect, setNaturalAspect] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const [persistedBookmarks, setPersistedBookmarks] = usePersistentState<string[]>(
    STORAGE_KEYS.ASSETS_BOOKMARKS,
    []
  );

  const isControlledBookmark = onBookmark !== undefined;
  const isSaved = isControlledBookmark
    ? Boolean(saved)
    : persistedBookmarks.includes(asset.key);

  const like = useAssetLike(asset.key);

  const handleBookmarkToggle = useCallback(() => {
    if (isControlledBookmark) {
      onBookmark();
    } else {
      setPersistedBookmarks((prev) =>
        prev.includes(asset.key) ? prev.filter((k) => k !== asset.key) : [...prev, asset.key]
      );
    }
  }, [isControlledBookmark, onBookmark, setPersistedBookmarks, asset.key]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const type = getAssetType(asset);
  const mediaUrl = resolveMediaUrl(asset.url) || asset.url;

  const isDetailer = Boolean(
    (asset as any)?.before_detailer_url ||
    (asset as any)?.has_detailer ||
    asset.metadata?.before_detailer_url ||
    asset.metadata?.has_detailer ||
    (asset.metadata as any)?.enable_detailer
  );

  // Resolve aspect ratio deterministically to prevent CLS
  const computedAspect = useMemo(() => {
    if (aspectRatio && aspectRatio !== "natural") {
      return aspectRatio.includes("/") ? aspectRatio : aspectRatio.replace(":", " / ");
    }
    if (naturalAspect) {
      return naturalAspect;
    }
    const width = asset.metadata?.width;
    const height = asset.metadata?.height;
    if (width && height && width > 0 && height > 0) {
      return `${width} / ${height}`;
    }
    const { w, h } = aspectFromKey(asset.key || "");
    return `${w} / ${h}`;
  }, [aspectRatio, naturalAspect, asset.metadata?.width, asset.metadata?.height, asset.key]);

  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = mediaUrl;
    a.download = (asset.key || "").split("/").pop() ?? (type === "video" ? "asset.mp4" : "asset.png");
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }, [mediaUrl, asset.key, type]);

  const filename = (asset.key || "").split("/").pop() ?? asset.key;
  const promptText = asset.metadata?.prompt || filename;

  const modelTitle = asset.metadata?.model_title;

  // Local generations are authored by "You"; when the sidecar carries no
  // author we say so honestly rather than inventing a handle.
  const creatorHandle = useMemo(() => {
    const meta = asset.metadata as unknown as Record<string, unknown> | null;
    const raw = meta?.author_username || meta?.author_display_name;
    return typeof raw === "string" && raw.trim().length > 0 ? raw : "";
  }, [asset]);

  const creatorInitials = (creatorHandle[0] || "U").toUpperCase();

  // Build Remix Studio link
  const effectiveModelId = remixModelId || asset.metadata?.model_id;
  const canRemix = showRemix && (Boolean(asset.metadata?.prompt) || Boolean(effectiveModelId));

  const remixHref = useMemo(() => {
    if (!canRemix) return "/generate";
    const params = new URLSearchParams();
    if (effectiveModelId) params.set("model_id", effectiveModelId);
    if (asset.metadata?.prompt) params.set("prompt", asset.metadata.prompt);
    if (asset.metadata?.seed !== undefined && asset.metadata?.seed !== null) {
      params.set("seed", String(asset.metadata.seed));
    }
    return `/generate?${params.toString()}`;
  }, [canRemix, effectiveModelId, asset.metadata?.prompt, asset.metadata?.seed]);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)] hover:border-[var(--accent)]/50 transition-all duration-300 shadow-sm hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
      {/* Click target wrapper for stage modal */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open asset ${asset.key}`}
        className="block w-full cursor-zoom-in text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <div style={{ aspectRatio: computedAspect }} className="relative w-full overflow-hidden">
          {/* Shimmer Placeholder with zero CLS */}
          <div
            className={`absolute inset-0 shimmer transition-opacity duration-300 ${isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
          />

          {/* Full-Bleed Media: 100% Solid Artwork at Rest */}
          {type === "video" ? (
            <video
              src={mediaUrl}
              aria-label={asset.key}
              autoPlay={!reduceMotion}
              muted
              loop
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => {
                setIsLoaded(true);
                const vid = e.currentTarget;
                if (vid.videoWidth && vid.videoHeight) {
                  setNaturalAspect(`${vid.videoWidth} / ${vid.videoHeight}`);
                }
              }}
              onLoadedData={() => setIsLoaded(true)}
              className={`asset-zoom-media h-full w-full object-cover ${isLoaded ? "opacity-100" : "opacity-0"
                }`}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={mediaUrl}
              alt={promptText}
              loading="lazy"
              onLoad={(e) => {
                setIsLoaded(true);
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setNaturalAspect(`${img.naturalWidth} / ${img.naturalHeight}`);
                }
              }}
              className={`asset-zoom-media h-full w-full object-cover ${isLoaded ? "opacity-100" : "opacity-0"
                }`}
            />
          )}
        </div>
      </button>

      {/* Top-left Specs / Type Badges (Always visible at rest, with high-contrast obsidian styling) */}
      <div className="absolute top-2.5 left-2.5 z-20 flex flex-wrap items-center gap-1 pointer-events-auto">
        {asset.metadata?.source === "tool" && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-md border border-white/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-white/90 shadow-sm"
            title={asset.metadata?.tool_name ? `Built with ${asset.metadata.tool_name}` : "Built with a Solo Tool"}
          >
            <Wand2 className="h-2.5 w-2.5 text-[var(--accent)]" />
            <span>TOOL</span>
          </span>
        )}
        {type === "video" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-md border border-white/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white/90 shadow-sm">
            <Play className="h-2.5 w-2.5 text-[var(--accent)] fill-current" />
            <span>Motion</span>
          </span>
        )}
        {type === "3d" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-md border border-white/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-white/90 shadow-sm">
            <Box className="h-2.5 w-2.5 text-[var(--accent)]" />
            <span>3D</span>
          </span>
        )}
        {isDetailer && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-black/75 backdrop-blur-md border border-[var(--accent)]/40 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[var(--accent)] shadow-sm"
            title="Processed with Face & Image Detailer (2-Pass)"
          >
            <Sparkles className="h-2.5 w-2.5 text-[var(--accent)] fill-current" />
            <span>Detailer</span>
          </span>
        )}
      </div>

      {/* Top-right Quick Actions (Smooth fade and slide-down on hover) */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 opacity-0 -translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-300 ease-out pointer-events-none">
        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            type="button"
            aria-label={
              like.liked
                ? `Unlike asset${like.likeCount > 0 ? ` (${like.likeCount} likes)` : ""}`
                : `Like asset${like.likeCount > 0 ? ` (${like.likeCount} likes)` : ""}`
            }
            aria-pressed={like.liked}
            aria-busy={like.pending}
            disabled={like.pending}
            title={like.error ?? (like.liked ? "Remove like" : "Like asset")}
            onClick={(e) => {
              e.stopPropagation();
              like.toggle();
            }}
            className={`${LIKE_BTN} ${like.likeCount > 0 ? "px-1.5" : "w-7"} ${
              like.liked ? "text-[var(--accent)] border-[var(--accent)]/40" : ""
            } ${like.pending ? "opacity-70" : ""}`}
          >
            <Heart
              className="h-3 w-3"
              fill={like.liked ? "currentColor" : "none"}
            />
            {like.likeCount > 0 && (
              <span className="font-mono text-[9px] font-semibold tabular-nums leading-none">
                {formatLikeCount(like.likeCount)}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label={isSaved ? "Remove bookmark" : "Bookmark asset"}
            aria-pressed={isSaved}
            onClick={(e) => {
              e.stopPropagation();
              handleBookmarkToggle();
            }}
            className={QUICK_BTN}
          >
            <Bookmark className="h-3 w-3" fill={isSaved ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            aria-label="Download asset"
            onClick={(e) => {
              e.stopPropagation();
              download();
            }}
            className={QUICK_BTN}
          >
            <Download className="h-3 w-3" />
          </button>
          {onDelete && (
            <button
              type="button"
              aria-label="Delete asset"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className={DANGER_BTN}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Like failure notice: stays visible even after the hover rail collapses,
          so a rejected click can never look like a successful one. */}
      {like.error && (
        <div
          role="alert"
          className="pointer-events-none absolute top-11 right-2.5 z-30 max-w-[80%] rounded-md border border-[var(--danger-line)] bg-[var(--overlay)] px-1.5 py-0.5 font-mono text-[9px] font-medium leading-snug text-[var(--danger)] backdrop-blur-md"
        >
          {like.error}
        </div>
      )}

      {/* Floating Bottom Metadata & Remix Bar (Smooth fade and float-up on hover) */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-3 space-y-1.5 opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-300 ease-out pointer-events-none">
        {/* Creator Info Row */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/60 font-mono text-[9px] font-bold text-[var(--accent)] backdrop-blur-md">
            {creatorInitials}
          </div>
          <span className="truncate font-mono text-[10px] font-semibold text-white/95 drop-shadow-sm">
            {creatorHandle ? `@${creatorHandle}` : "Unknown creator"}
          </span>
        </div>

        {/* Monospace Prompt Preview */}
        <p className="font-mono text-[11px] font-medium text-white/95 line-clamp-2 leading-snug drop-shadow-sm pointer-events-auto">
          {promptText}
        </p>

        {/* Footer Row: Model Title & Remix CTA */}
        <div className="flex items-center justify-between pt-0.5 pointer-events-auto">
          {modelTitle ? (
            <span className="font-mono text-[9px] text-white/70 truncate mr-2" title={modelTitle}>
              {modelTitle}
            </span>
          ) : (
            <span />
          )}

          {canRemix && (
            <Link
              href={remixHref}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-[var(--accent)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-95 transition-[background-color,transform,box-shadow] duration-200 ease-out shadow-sm"
            >
              <Zap className="h-2.5 w-2.5 fill-current" />
              <span>Remix</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}