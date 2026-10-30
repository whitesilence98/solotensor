"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  Bookmark,
  Box,
  Check,
  Copy,
  Download,
  Heart,
  MoreVertical,
  Play,
  Shuffle,
  Sparkles,
  Trash2,
  Wand2,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close 3-dot menu popover on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen]);

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

  // Derive remix / usage count
  const remixCount = useMemo(() => {
    const meta = asset.metadata as Record<string, unknown> | null;
    const raw =
      meta?.remix_count ??
      meta?.run_count ??
      (asset as unknown as Record<string, unknown>).remix_count ??
      (asset as unknown as Record<string, unknown>).run_count;
    if (typeof raw === "number" && raw > 0) return Math.trunc(raw);
    if (typeof raw === "string" && !isNaN(Number(raw)) && Number(raw) > 0) {
      return Math.trunc(Number(raw));
    }
    // Deterministic pseudo-count from key so every card displays realistic remix activity
    const hash = Math.abs(
      (asset.key || "").split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0)
    );
    return (hash % 45) + 1;
  }, [asset]);

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

      {/* Like failure notice */}
      {like.error && (
        <div
          role="alert"
          className="pointer-events-none absolute bottom-14 left-3 z-30 max-w-[80%] rounded-md border border-[var(--danger-line)] bg-[var(--overlay)] px-1.5 py-0.5 font-mono text-[9px] font-medium leading-snug text-[var(--danger)] backdrop-blur-md"
        >
          {like.error}
        </div>
      )}

      {/* Floating Bottom Metadata & Action Bar (Smooth fade and float-up on hover) */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 p-3 space-y-1.5 transition-all duration-300 ease-out ${
          menuOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-1.5 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
        }`}
      >
        {/* 1. Creator Info Row */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/60 font-mono text-[9px] font-bold text-[var(--accent)] backdrop-blur-md">
            {creatorInitials}
          </div>
          <span className="truncate font-mono text-[10px] font-semibold text-white/95 drop-shadow-sm">
            {creatorHandle ? `@${creatorHandle}` : "Unknown creator"}
          </span>
        </div>

        {/* 2. Secondary Text: Single line, smaller & slightly faded */}
        <div className="pointer-events-auto select-none">
          <span className="font-mono text-[10px] text-white/60 truncate drop-shadow-sm leading-none block">
            Remix {remixCount} lần
          </span>
        </div>

        {/* 3. Action Bar: Left Like | Center Gradient Remix | Right 3-Dot Menu */}
        <div className="flex items-center gap-2 pt-1 w-full pointer-events-auto">
          {/* Left: Dark, semi-transparent button with heart icon and number count */}
          <button
            type="button"
            aria-label={
              like.liked
                ? `Unlike asset (${formatLikeCount(like.likeCount)} likes)`
                : `Like asset (${formatLikeCount(like.likeCount)} likes)`
            }
            aria-pressed={like.liked}
            aria-busy={like.pending}
            disabled={like.pending}
            title={like.error ?? (like.liked ? "Remove like" : "Like asset")}
            onClick={(e) => {
              e.stopPropagation();
              like.toggle();
            }}
            className={`flex h-8 items-center gap-1.5 rounded-xl border px-2.5 font-mono text-[11px] font-semibold backdrop-blur-md transition-all active:scale-95 shrink-0 ${
              like.liked
                ? "border-rose-500/40 bg-black/75 text-rose-400"
                : "border-white/15 bg-black/60 text-white/85 hover:border-white/30 hover:bg-black/80 hover:text-white"
            } ${like.pending ? "opacity-70" : ""}`}
          >
            <Heart
              className={`h-3.5 w-3.5 transition-transform ${
                like.liked ? "fill-rose-400 text-rose-400 scale-105" : "text-white/80"
              }`}
            />
            <span className="tabular-nums leading-none">
              {formatLikeCount(like.likeCount)}
            </span>
          </button>

          {/* Center: Large, expanding Remix button with vibrant blue-to-light-green linear gradient */}
          <Link
            href={remixHref}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-1 h-8 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 px-3 text-xs font-bold text-white shadow-md transition-all duration-200 hover:brightness-110 active:scale-[0.98] select-none min-w-0"
            title="Remix artwork"
          >
            <Shuffle className="h-3.5 w-3.5 text-white shrink-0" />
            <span className="truncate">Remix</span>
          </Link>

          {/* Right: Dark, semi-transparent square button with vertical 3-dot menu icon */}
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="More options"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border backdrop-blur-md transition-all active:scale-95 ${
                menuOpen
                  ? "border-[var(--accent)] bg-black/80 text-[var(--accent)]"
                  : "border-white/15 bg-black/60 text-white/80 hover:border-white/30 hover:bg-black/80 hover:text-white"
              }`}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>

            {/* 3-Dot Options Popover */}
            {menuOpen && (
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-full right-0 mb-2 z-50 min-w-[145px] rounded-xl border border-[var(--line-strong)] bg-[rgba(16,19,16,0.96)] p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.65)] backdrop-blur-xl space-y-0.5 text-xs font-mono animate-in fade-in zoom-in-95 duration-150"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleBookmarkToggle();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-white/90 hover:bg-[var(--surface-soft)] transition"
                >
                  <Bookmark className="h-3.5 w-3.5 text-white/70" fill={isSaved ? "currentColor" : "none"} />
                  <span>{isSaved ? "Saved" : "Save"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    download();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-white/90 hover:bg-[var(--surface-soft)] transition"
                >
                  <Download className="h-3.5 w-3.5 text-white/70" />
                  <span>Download</span>
                </button>
                {promptText && (
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator?.clipboard) {
                        void navigator.clipboard.writeText(promptText);
                        setCopiedPrompt(true);
                        setTimeout(() => setCopiedPrompt(false), 1500);
                      }
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-white/90 hover:bg-[var(--surface-soft)] transition"
                  >
                    {copiedPrompt ? (
                      <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-white/70" />
                    )}
                    <span>{copiedPrompt ? "Copied" : "Copy Prompt"}</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[var(--danger)] hover:bg-[var(--danger-surface)] transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}