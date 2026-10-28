"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Box,
  Download,
  Play,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import {
  resolveMediaUrl,
  type AssetRecord,
  type GalleryItem,
} from "@/lib/api";
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

  const creatorHandle = useMemo(() => {
    const meta = asset.metadata as unknown as Record<string, unknown> | null;
    const raw = meta?.author_username || meta?.author_display_name;
    if (typeof raw === "string" && raw.trim().length > 0) return raw;
    let hash = 0;
    const k = asset.key || "";
    for (let i = 0; i < k.length; i++) hash = (hash * 31 + k.charCodeAt(i)) | 0;
    const handles = [
      "solo_studio",
      "latent_flow",
      "cyber_core",
      "studio_prime",
      "comfy_artist",
      "pixel_craft",
    ];
    return handles[Math.abs(hash) % handles.length];
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

      {/* Floating Bottom Metadata & Remix Bar (Smooth fade and float-up on hover) */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-3 space-y-1.5 opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-300 ease-out pointer-events-none">
        {/* Creator Info Row */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/60 font-mono text-[9px] font-bold text-[var(--accent)] backdrop-blur-md">
            {creatorInitials}
          </div>
          <span className="truncate font-mono text-[10px] font-semibold text-white/95 drop-shadow-sm">
            @{creatorHandle}
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