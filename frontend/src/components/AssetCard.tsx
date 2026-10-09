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
  "workspace-icon-island flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--core)] text-[var(--ink)] " +
  "transition-[transform,border-color,background-color,color,opacity] duration-200 hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] active:scale-[.96] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

const DANGER_BTN =
  "workspace-icon-island flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--core)] text-[var(--ink-soft)] " +
  "transition-[transform,border-color,background-color,color,opacity] duration-200 hover:border-[var(--danger)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] active:scale-[.96] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--danger)]";

interface QuickActionsProps {
  saved: boolean;
  onBookmark: () => void;
  onDownload: () => void;
  onDelete?: () => void;
}

function QuickActions({ saved, onBookmark, onDownload, onDelete }: QuickActionsProps) {
  return (
    <div className="asset-quick absolute right-3 top-3 flex gap-1.5">
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
          className="h-4 w-4"
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
        <Download className="h-4 w-4" />
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
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function CreatorRow({ name }: { name: string }) {
  return (
    <div className="asset-creator pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center bg-[var(--accent)] text-[10px] font-semibold text-[var(--accent-ink)]">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate text-xs font-medium text-[var(--ink)]">{name}</span>
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

  return (
    <article className="asset-card workspace-bezel group relative overflow-hidden p-0 transition-[transform,border-color,box-shadow] duration-[420ms] ease-[cubic-bezier(.32,.72,0,1)] hover:-translate-y-1 hover:border-[var(--line-strong)] focus-within:border-[var(--accent)]">
      <button type="button" onClick={onOpen} aria-label={`Open ${asset.key}`} className="block w-full cursor-zoom-in text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl} alt={asset.key} loading="lazy" className="w-full object-cover" />
        <div className="asset-veil pointer-events-none absolute inset-0 bg-[color-mix(in_srgb,var(--ground)_35%,transparent)]" />
        <CreatorRow name={asset.key.split("/").pop() ?? asset.key} />
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

  return (
    <article className="asset-card workspace-bezel group relative overflow-hidden p-0 transition-[transform,border-color,box-shadow] duration-[420ms] ease-[cubic-bezier(.32,.72,0,1)] hover:-translate-y-1 hover:border-[var(--line-strong)] focus-within:border-[var(--accent)]">
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
        <div className="asset-veil pointer-events-none absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--ground)_25%,transparent)]">
          <span className="flex h-12 w-12 items-center justify-center border border-[var(--line)] bg-[var(--surface)]">
            <Play className="h-5 w-5 translate-x-[1px] text-[var(--accent)]" fill="currentColor" />
          </span>
        </div>
        <span className="absolute bottom-12 right-3 border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--ink)]">Video</span>
        <CreatorRow name={asset.key.split("/").pop() ?? asset.key} />
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
  return (
    <article className="asset-card asset-3d relative overflow-hidden border border-[var(--line)] bg-[var(--surface-raised)] transition-colors duration-200 hover:border-[var(--line-strong)] focus-within:border-[var(--accent)]">
      <button type="button" onClick={onOpen} aria-label={`Open 3D asset ${asset.key}`} className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        <div style={{ aspectRatio: `${w} / ${h}` }} className="relative w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt={asset.key} loading="lazy" className="asset-3d-cube h-full w-full object-cover" />
        </div>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 border border-[var(--accent)] bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-ink)]">
          <Box className="h-3 w-3" /> 3D
        </span>
        <div className="asset-veil pointer-events-none absolute inset-x-0 bottom-0 flex justify-center border-t border-[var(--line)] bg-[var(--surface)] p-3">
          <span className="border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--ink)]">Open details</span>
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