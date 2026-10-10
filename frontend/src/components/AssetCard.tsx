"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bookmark,
  Box,
  Download,
  Play,
  Trash2,
} from "lucide-react";
import { resolveMediaUrl, type AssetRecord } from "@/lib/api";

/* Deterministic pseudo-aspect from the key so demo/3D cards vary naturally. */
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

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const QUICK_BTN =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white/80 " +
  "backdrop-blur-md transition hover:border-white/40 hover:bg-black/70 hover:text-white active:scale-95 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

const DANGER_BTN =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-white/70 " +
  "backdrop-blur-md transition hover:border-[var(--danger-line)] hover:bg-[var(--danger)] hover:text-white active:scale-95 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--danger)]";

interface QuickActionsProps {
  saved: boolean;
  onBookmark: () => void;
  onDownload: () => void;
  onDelete?: () => void;
}

function QuickActions({ saved, onBookmark, onDownload, onDelete }: QuickActionsProps) {
  return (
    <div className="absolute right-3 top-3 z-20 flex gap-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        type="button"
        aria-label={saved ? "Remove bookmark" : "Bookmark asset"}
        aria-pressed={saved}
        onClick={(e) => {
          e.stopPropagation();
          onBookmark();
        }}
        className={QUICK_BTN}
      >
        <Bookmark
          className="h-3.5 w-3.5"
          fill={saved ? "currentColor" : "none"}
        />
      </button>
      <button
        type="button"
        aria-label="Download asset"
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        className={QUICK_BTN}
      >
        <Download className="h-3.5 w-3.5" />
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
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Image card                                                          */
/* ------------------------------------------------------------------ */

function ImageCard({
  asset,
  saved,
  onBookmark,
  onOpen,
  onDelete,
}: {
  asset: AssetRecord;
  saved: boolean;
  onBookmark: () => void;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const mediaUrl = resolveMediaUrl(asset.url) || asset.url;
  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = mediaUrl;
    a.download = asset.key.split("/").pop() ?? "asset.png";
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }, [mediaUrl, asset.key]);

  const filename = asset.key.split("/").pop() ?? asset.key;
  const title = asset.metadata?.prompt || filename;

  return (
    <article className="group relative overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] transition-all duration-300 ease-out">
      <button type="button" onClick={onOpen} aria-label={`Open ${asset.key}`} className="block w-full cursor-zoom-in text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        {/* Full-Bleed Media */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl} alt={asset.key} loading="lazy" className="w-full object-cover" />

        {/* Atmospheric Bottom Gradient Scrim */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 via-50% to-transparent transition-opacity duration-300 ease-out group-hover:opacity-0" />

        {/* Bottom Typography Overlay */}
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5 pointer-events-none">
          <h3 className="truncate text-base sm:text-lg font-bold tracking-tight text-white drop-shadow-sm">
            {title}
          </h3>
          <p className="mt-0.5 truncate text-[11px] sm:text-xs font-medium text-white/70 drop-shadow-sm">
            {asset.metadata?.model_title || "Visual output"}
          </p>
        </div>
      </button>
      <QuickActions saved={saved} onBookmark={onBookmark} onDownload={download} onDelete={onDelete} />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Video card                                                          */
/* ------------------------------------------------------------------ */

function VideoCard({
  asset,
  saved,
  onBookmark,
  onOpen,
  onDelete,
}: {
  asset: AssetRecord;
  saved: boolean;
  onBookmark: () => void;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const { w, h } = aspectFromKey(asset.key);
  const mediaUrl = resolveMediaUrl(asset.url) || asset.url;
  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = mediaUrl;
    a.download = asset.key.split("/").pop() ?? "asset.mp4";
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }, [mediaUrl, asset.key]);

  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const filename = asset.key.split("/").pop() ?? asset.key;
  const title = asset.metadata?.prompt || filename;

  return (
    <article className="group relative overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] transition-all duration-300 ease-out">
      <button type="button" onClick={onOpen} aria-label={`Open video ${asset.key}`} className="block w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        <div style={{ aspectRatio: `${w} / ${h}` }} className="relative w-full">
          <video
            src={mediaUrl}
            aria-label={asset.key}
            autoPlay={!reduceMotion}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        </div>

        {/* Top-left Video Tag */}
        <div className="absolute left-3 top-3 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-md">
            <Play className="h-2.5 w-2.5 text-[var(--accent)]" fill="currentColor" />
            <span>Motion</span>
          </span>
        </div>

        {/* Atmospheric Bottom Gradient Scrim */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 via-50% to-transparent transition-opacity duration-300 ease-out group-hover:opacity-0" />

        {/* Bottom Typography Overlay */}
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5 pointer-events-none">
          <h3 className="truncate text-base sm:text-lg font-bold tracking-tight text-white drop-shadow-sm">
            {title}
          </h3>
          <p className="mt-0.5 truncate text-[11px] sm:text-xs font-medium text-white/70 drop-shadow-sm">
            {asset.metadata?.model_title || "Video animation"}
          </p>
        </div>
      </button>
      <QuickActions saved={saved} onBookmark={onBookmark} onDownload={download} onDelete={onDelete} />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* 3D card                                                             */
/* ------------------------------------------------------------------ */

function ModelCard({ asset, onOpen }: { asset: AssetRecord; onOpen: () => void }) {
  const { w, h } = aspectFromKey(asset.key);
  const mediaUrl = resolveMediaUrl(asset.url) || asset.url;
  const filename = asset.key.split("/").pop() ?? asset.key;

  return (
    <article className="group relative overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface-soft)] transition-all duration-300 ease-out">
      <button type="button" onClick={onOpen} aria-label={`Open 3D asset ${asset.key}`} className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        <div style={{ aspectRatio: `${w} / ${h}` }} className="relative w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt={asset.key} loading="lazy" className="h-full w-full object-cover" />
        </div>

        {/* Top-left 3D Tag */}
        <div className="absolute left-3 top-3 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur-md">
            <Box className="h-3 w-3" /> 3D
          </span>
        </div>

        {/* Atmospheric Bottom Gradient Scrim */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 via-50% to-transparent transition-opacity duration-300 ease-out group-hover:opacity-0" />

        {/* Bottom Typography Overlay */}
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5 pointer-events-none">
          <h3 className="truncate text-base sm:text-lg font-bold tracking-tight text-white drop-shadow-sm">
            {filename}
          </h3>
          <p className="mt-0.5 truncate text-[11px] sm:text-xs font-medium text-white/70 drop-shadow-sm">
            3D Spatial Model
          </p>
        </div>
      </button>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export default function AssetCard({
  asset,
  saved,
  onBookmark,
  onOpen,
  onDelete,
}: {
  asset: AssetRecord;
  saved: boolean;
  onBookmark: () => void;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  if (asset.type === "video") return <VideoCard asset={asset} saved={saved} onBookmark={onBookmark} onOpen={onOpen} onDelete={onDelete} />;
  if (asset.type === "3d") return <ModelCard asset={asset} onOpen={onOpen} />;
  return <ImageCard asset={asset} saved={saved} onBookmark={onBookmark} onOpen={onOpen} onDelete={onDelete} />;
}