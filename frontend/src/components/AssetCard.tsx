"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bookmark,
  Box,
  Download,
  Play,
} from "lucide-react";
import type { AssetRecord } from "@/lib/api";

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
  "flex h-8 w-8 items-center justify-center rounded-md bg-[#0b0c0b]/90 text-[#deddd6] " +
  "shadow-[0_6px_18px_-8px_rgba(88,105,46,.5)] transition-all duration-200 ease-in-out hover:bg-[#20231f] hover:text-[#d5f06f] active:scale-[.96] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d5f06f]";

interface QuickActionsProps {
  saved: boolean;
  onBookmark: () => void;
  onDownload: () => void;
}

function QuickActions({ saved, onBookmark, onDownload }: QuickActionsProps) {
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
    </div>
  );
}

function CreatorRow({ name }: { name: string }) {
  return (
    <div className="asset-creator pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 rounded-b-[var(--radius-media)] bg-gradient-to-t from-[var(--ground)]/85 via-[var(--ground)]/45 to-transparent px-3 pb-2.5 pt-8">
      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-[10px] font-semibold text-[var(--accent-ink)]">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate text-xs font-medium text-white">{name}</span>
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
}: {
  asset: AssetRecord;
  saved: boolean;
  onBookmark: () => void;
  onOpen: () => void;
}) {
  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = asset.url;
    a.download = asset.key.split("/").pop() ?? "asset.png";
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }, [asset.url, asset.key]);

  return (
    <article className="asset-card group relative overflow-hidden rounded-[var(--radius-media)] bg-[var(--surface)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-28px_rgba(126,152,52,.4)]">
      <button type="button" onClick={onOpen} aria-label={`Open ${asset.key}`} className="block w-full cursor-zoom-in text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.key} loading="lazy" className="w-full object-cover" />
        <div className="asset-veil pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--ground)]/70 via-transparent to-[var(--ground)]/10" />
        <CreatorRow name="You" />
      </button>
      <QuickActions saved={saved} onBookmark={onBookmark} onDownload={download} />
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
}: {
  asset: AssetRecord;
  saved: boolean;
  onBookmark: () => void;
  onOpen: () => void;
}) {
  const { w, h } = aspectFromKey(asset.key);
  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = asset.url;
    a.download = asset.key.split("/").pop() ?? "asset.mp4";
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  }, [asset.url, asset.key]);

  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <article className="asset-card group relative overflow-hidden rounded-[var(--radius-media)] bg-[var(--surface)] ring-1 ring-[var(--line)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-28px_rgba(126,152,52,.4)]">
      <button type="button" onClick={onOpen} aria-label={`Open video ${asset.key}`} className="block w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        <div style={{ aspectRatio: `${w} / ${h}` }} className="relative w-full">
          <video
            src={asset.url}
            aria-label={asset.key}
            autoPlay={!reduceMotion}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="asset-veil pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--ground)]/25">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ground)]/90 shadow-md ring-1 ring-[var(--accent)]/20">
            <Play className="h-5 w-5 translate-x-[1px] text-[var(--accent)]" fill="currentColor" />
          </span>
        </div>
        <span className="absolute bottom-12 right-3 rounded-md bg-[var(--ground)]/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--ink)] ring-1 ring-[var(--accent)]/15">Video</span>
        <CreatorRow name="You" />
      </button>
      <QuickActions saved={saved} onBookmark={onBookmark} onDownload={download} />
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* 3D card                                                             */
/* ------------------------------------------------------------------ */

function ModelCard({ asset, onOpen }: { asset: AssetRecord; onOpen: () => void }) {
  const { w, h } = aspectFromKey(asset.key);
  return (
    <article className="asset-card asset-3d relative overflow-hidden rounded-[var(--radius-media)] ring-1 ring-[var(--line)] transition-shadow duration-200 ease-in-out hover:shadow-[0_18px_50px_-28px_rgba(126,152,52,.4)]" style={{ background: "linear-gradient(145deg, #20251e 0%, #171a17 55%, var(--surface) 100%)" }}>
      <button type="button" onClick={onOpen} aria-label={`Open 3D asset ${asset.key}`} className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        <div style={{ aspectRatio: `${w} / ${h}` }} className="relative w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset.url} alt={asset.key} loading="lazy" className="asset-3d-cube h-full w-full object-cover" />
        </div>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-ink)] shadow-sm">
          <Box className="h-3 w-3" /> 3D
        </span>
        <div className="asset-veil pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[var(--ground)]/75 to-transparent pb-3 pt-8">
          <span className="rounded-[var(--radius-control)] bg-[var(--ground)]/90 px-3 py-1 text-xs font-medium text-[var(--ink)] shadow-sm ring-1 ring-[var(--accent)]/20">Open details</span>
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
}: {
  asset: AssetRecord;
  saved: boolean;
  onBookmark: () => void;
  onOpen: () => void;
}) {
  if (asset.type === "video") return <VideoCard asset={asset} saved={saved} onBookmark={onBookmark} onOpen={onOpen} />;
  if (asset.type === "3d") return <ModelCard asset={asset} onOpen={onOpen} />;
  return <ImageCard asset={asset} saved={saved} onBookmark={onBookmark} onOpen={onOpen} />;
}