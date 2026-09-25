"use client";

import { useCallback, useState } from "react";
import {
  Bookmark,
  Box,
  Download,
  MoreVertical,
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
    <div className="asset-creator absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 rounded-b-xl bg-gradient-to-t from-zinc-950/80 via-zinc-950/45 to-transparent px-3 pb-2.5 pt-8">
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#d5f06f] text-[10px] font-semibold text-[#171b08]"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-xs font-medium text-white">{name}</span>
      </span>
      <button
        type="button"
        aria-label="Asset options"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors duration-200 ease-in-out hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
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
    <div
      className="asset-card group relative cursor-zoom-in overflow-hidden rounded-[.45rem] bg-[#111311] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-28px_rgba(126,152,52,.4)]"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      aria-label={`Open ${asset.key}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.url}
        alt={asset.key}
        loading="lazy"
        className="w-full object-cover"
      />
      <div className="asset-veil pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0c0b]/70 via-transparent to-[#0b0c0b]/10" />
      <QuickActions saved={saved} onBookmark={onBookmark} onDownload={download} />
      <CreatorRow name="You" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Video card                                                          */
/* ------------------------------------------------------------------ */

function VideoCard({ asset }: { asset: AssetRecord }) {
  const { w, h } = aspectFromKey(asset.key);
  return (
    <div className="asset-card asset-3d relative overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-zinc-800 transition-shadow duration-200 ease-in-out hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]">
      <div style={{ aspectRatio: `${w} / ${h}` }} className="relative w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.key}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      {/* Play indicator on hover */}
      <div className="asset-veil pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-950/25">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950/90 shadow-md ring-1 ring-white/10">
          <Play className="h-5 w-5 translate-x-[1px] text-zinc-100" fill="currentColor" />
        </span>
      </div>
      <span className="absolute bottom-3 right-3 rounded-md bg-zinc-950/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white ring-1 ring-white/10">
        0:15
      </span>
      <CreatorRow name="You" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3D card                                                             */
/* ------------------------------------------------------------------ */

function ModelCard({ asset }: { asset: AssetRecord }) {
  const { w, h } = aspectFromKey(asset.key);
  return (
    <div className="asset-card asset-3d relative overflow-hidden rounded-xl ring-1 ring-zinc-800 transition-shadow duration-200 ease-in-out hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]"
      style={{
        background:
          "linear-gradient(145deg, #27272a 0%, #1f1f23 55%, #18181b 100%)",
      }}
    >
      <div style={{ aspectRatio: `${w} / ${h}` }} className="relative w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.key}
          loading="lazy"
          className="asset-3d-cube h-full w-full object-cover"
        />
      </div>
      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-violet-600/95 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
        <Box className="h-3 w-3" />
        3D
      </span>
      <div className="asset-veil pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-zinc-950/60 to-transparent pb-3 pt-8">
        <span className="rounded-full bg-zinc-950/90 px-3 py-1 text-xs font-medium text-zinc-100 shadow-sm ring-1 ring-white/10">
          3D View
        </span>
      </div>
   </div>
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
  if (asset.type === "video") return <VideoCard asset={asset} />;
  if (asset.type === "3d") return <ModelCard asset={asset} />;
  return <ImageCard asset={asset} saved={saved} onBookmark={onBookmark} onOpen={onOpen} />;
}