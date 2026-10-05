"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Expand,
  Filter,
  FolderOpen,
  Grid2X2,
  ImageIcon,
  List,
  Loader2,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sparkles,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import type { GalleryItem } from "@/lib/api";

export type MediaFilter = "all" | "video" | "image" | "audio";
export type ViewMode = "grid" | "list";

interface Props {
  prompt: string;
  onPromptChange: (v: string) => void;
  imageCount: string;
  onImageCountChange: (v: string) => void;
  canGenerate: boolean;
  onGenerate: () => void;
  busy: boolean;
  progress: number;
  progressLabel: string;
  gallery: GalleryItem[];
  error: string | null;
  outputWidth: number;
  outputHeight: number;
  referenceImage: string | null;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
  onReload: () => void;
}

function detailHref(item: GalleryItem): string {
  return `/assets/${item.key.split("/").map(encodeURIComponent).join("/")}`;
}

function ComparisonSlider({ before, after }: { before: string; after: string }) {
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const updatePosition = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    setPosition(Math.min(100, Math.max(0, ((clientX - bounds.left) / bounds.width) * 100)));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => updatePosition(event.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  return (
    <div
      ref={frameRef}
      className="group relative isolate mx-auto w-full max-w-[64rem] overflow-hidden rounded-xl border border-[#2b2d35] bg-[#121316] select-none touch-none shadow-2xl"
      style={{ aspectRatio: "16 / 10" }}
      onPointerDown={(event) => {
        setDragging(true);
        updatePosition(event.clientX);
      }}
      role="slider"
      tabIndex={0}
      aria-label="Before and after comparison"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={after}
        alt="Generated image"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={before}
        alt="Reference image"
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />
      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#e2e4e9] backdrop-blur">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-[var(--accent)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-ink)]">
        After
      </span>
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${position}%` }}>
        <span className="absolute inset-y-0 -translate-x-1/2 border-l border-white shadow-[0_0_8px_rgba(0,0,0,0.8)]" />
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-[#121316]/90 text-white shadow-xl backdrop-blur">
          <span className="text-sm font-bold" aria-hidden>↔</span>
        </span>
      </div>
    </div>
  );
}

export default function CanvasPreview(props: Props) {
  const {
    prompt,
    onPromptChange,
    imageCount,
    onImageCountChange,
    canGenerate,
    onGenerate,
    busy,
    progress,
    progressLabel,
    gallery,
    error,
    outputWidth,
    outputHeight,
    referenceImage,
    isSidebarCollapsed,
    onToggleSidebarCollapse,
    onReload,
  } = props;

  const [activeTab, setActiveTab] = useState<MediaFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [imageCountOpen, setImageCountOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<GalleryItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Filter gallery items by active tab (all, video, image, audio)
  const filteredGallery = useMemo(() => {
    return gallery.filter((item) => {
      const ext = item.key.slice(item.key.lastIndexOf(".")).toLowerCase();
      const isVideo = [".mp4", ".webm", ".mov", ".mkv"].includes(ext);
      const isAudio = [".mp3", ".wav", ".flac", ".ogg"].includes(ext);
      if (activeTab === "video") return isVideo;
      if (activeTab === "audio") return isAudio;
      if (activeTab === "image") return !isVideo && !isAudio;
      return true;
    });
  }, [gallery, activeTab]);

  const latest = filteredGallery[0];
  const canCompare = Boolean(referenceImage && latest && !busy);

  const copyPromptText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      setCopiedKey(null);
    }
  };

  return (
    <main
      id="main-content"
      className="workspace-scroll relative flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--ground)] text-[#e2e4e9]"
    >
      {/* 1. Top Bar: Prompt Input + Image Count Dropdown + Generate Button */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#24262c] bg-[#1a1b20]/95 px-4 py-2.5 backdrop-blur-xl">
        {/* Left: Expand button if sidebar is collapsed */}
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={onToggleSidebarCollapse}
            title="Expand Models Panel"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2b2d35] bg-[#21232a] text-[#8b909a] hover:border-[#3d414d] hover:text-white transition"
          >
            <PanelLeftOpen className="h-4 w-4 text-[var(--accent)]" />
          </button>
        )}

        {/* Prompt Input Box */}
        <div className="relative flex-1">
          <input
            type="text"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canGenerate) {
                onGenerate();
              }
            }}
            placeholder="Authentic, dynamic medium close-up cinematic action still, shot on a medium format camera with 85…"
            disabled={busy}
            className="w-full rounded-lg border border-[#2d3039] bg-[#22242a] px-3.5 py-2 text-xs text-white placeholder-[#6f737d] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] disabled:opacity-50"
          />
        </div>

        {/* Image Count Dropdown Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setImageCountOpen((v) => !v)}
            disabled={busy}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#2d3039] bg-[#22242a] px-3 text-xs font-semibold text-[#dedee2] hover:bg-[#282b32] transition"
          >
            <span>{imageCount} {Number(imageCount) === 1 ? "image" : "images"}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#8b909a]" />
          </button>

          {imageCountOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-40 w-32 rounded-lg border border-[#2d3039] bg-[#1d1f25] py-1 shadow-2xl">
              {["1", "2", "3", "4"].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    onImageCountChange(n);
                    setImageCountOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-xs text-left transition ${
                    imageCount === n
                      ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] font-semibold"
                      : "text-[#dedee2] hover:bg-[#262831]"
                  }`}
                >
                  <span>{n} {n === "1" ? "image" : "images"}</span>
                  {imageCount === n && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Generate Button: Tensor.Art Vibrant Cyan/Indigo Gradient */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="group flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 text-xs font-bold text-[var(--accent-ink)] shadow-lg shadow-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:brightness-105 active:scale-[0.98] transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Rendering ({progress}%)</span>
            </>
          ) : (
            <>
              <span>Generate -</span>
              <Zap className="h-3.5 w-3.5 fill-current text-[#7ef4e4]" />
              <span>0.5</span>
            </>
          )}
        </button>
      </header>

      {/* 2. Sub-Header Toolbar (All, Video, Image, Audio | View Switchers | Collapse | Manage | Reload | Assets) */}
      <div className="sticky top-[49px] z-20 flex flex-wrap items-center justify-between gap-2 border-b border-[#24262c] bg-[var(--surface)] px-4 py-1.5 text-xs">
        {/* Left Section: Filter Tabs & View Switchers */}
        <div className="flex items-center gap-1.5">
          {/* Filter Pills */}
          <div className="flex items-center rounded-lg bg-[#1f2127] p-0.5 border border-[#282a32]">
            {(["all", "video", "image", "audio"] as MediaFilter[]).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition ${
                    active
                      ? "bg-[#2d3039] text-white shadow-sm"
                      : "text-[#8b909a] hover:text-[#e2e4e9]"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* View Mode Toggle: List vs Grid */}
          <div className="ml-1 flex items-center rounded-lg bg-[#1f2127] p-0.5 border border-[#282a32]">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view"
              className={`rounded-md p-1.5 transition ${
                viewMode === "list" ? "bg-[#2d3039] text-[var(--accent)]" : "text-[#8b909a] hover:text-white"
              }`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              className={`rounded-md p-1.5 transition ${
                viewMode === "grid" ? "bg-[#2d3039] text-[var(--accent)]" : "text-[#8b909a] hover:text-white"
              }`}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Filter Funnel Icon */}
          <button
            type="button"
            title="Filter options"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8b909a] hover:bg-[#202228] hover:text-white transition"
          >
            <Filter className="h-3.5 w-3.5" />
          </button>

          {/* Bell / Mute Toggle Icon */}
          <button
            type="button"
            onClick={() => setIsMuted((v) => !v)}
            title={isMuted ? "Unmute alerts" : "Mute alerts"}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8b909a] hover:bg-[#202228] hover:text-white transition"
          >
            <Bell className={`h-3.5 w-3.5 ${isMuted ? "text-[#6c707d]" : "text-[#8b909a]"}`} />
          </button>
        </div>

        {/* Right Section: Collapse, Manage, Reload, Assets */}
        <div className="flex items-center gap-1.5">
          {/* Collapse Left Panel Button */}
          <button
            type="button"
            onClick={onToggleSidebarCollapse}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[#8b909a] hover:bg-[#202228] hover:text-white transition"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${isSidebarCollapsed ? "rotate-180" : ""}`}
            />
            <span>{isSidebarCollapsed ? "Expand" : "Collapse"}</span>
          </button>

          {/* Manage Button */}
          <button
            type="button"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[#8b909a] hover:bg-[#202228] hover:text-white transition"
          >
            Manage
          </button>

          {/* Reload Button */}
          <button
            type="button"
            onClick={onReload}
            title="Reload outputs"
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[#8b909a] hover:bg-[#202228] hover:text-white transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reload</span>
          </button>

          {/* Assets Button (Links to /assets) */}
          <Link
            href="/assets"
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[#8b909a] hover:bg-[#202228] hover:text-[var(--accent)] transition"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span>Assets</span>
          </Link>
        </div>
      </div>

      {/* 3. Main Content Area */}
      <div className="flex-1 p-5 md:p-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-4 text-xs text-[var(--danger)]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        {/* Live Generation Progress Card */}
        {busy && (
          <section className="mb-10 rounded-2xl border border-[#2b2d35] bg-[#1a1b20] p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  In Progress
                </p>
                <h3 className="mt-0.5 text-sm font-semibold text-white">
                  {progressLabel || "Building your image…"}
                </h3>
              </div>
              <span className="font-mono text-xl font-bold text-[var(--accent)]">{progress}%</span>
            </div>

            {/* Glowing Cyan Progress Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#272931]">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300 shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Shimmer Preview Canvas Frame */}
            <div
              className="mt-4 mx-auto max-w-full overflow-hidden rounded-xl border border-[#282a32] max-h-[32rem]"
              style={{ aspectRatio: `${outputWidth} / ${outputHeight}` }}
            >
              <div className="shimmer h-full w-full" />
            </div>
          </section>
        )}

        {/* Before / After Comparison Slider if reference image exists */}
        {canCompare && (
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#8b909a]">Before / After Comparison</span>
            </div>
            <ComparisonSlider before={referenceImage!} after={latest.url} />
          </section>
        )}

        {/* Outputs Grid or Empty State */}
        {filteredGallery.length === 0 && !busy ? (
          /* "Nothing here yet" Tensor.Art Minimalist Empty State */
          <div className="flex h-96 flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-[#6f737d]">Nothing here yet</p>
          </div>
        ) : (
          /* Render Gallery Outputs */
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
                : "space-y-3"
            }
          >
            {filteredGallery.map((item) => {
              const meta = item.metadata;
              const promptText = meta?.prompt ?? "Generated artwork";

              if (viewMode === "list") {
                return (
                  <div
                    key={item.key}
                    onClick={() => setSelectedAsset(item)}
                    className="group flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#262830] bg-[#1a1b20] p-3 transition hover:border-[#3d414d] hover:bg-[#202229]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#252830]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt={item.key} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-white">{promptText}</p>
                        <p className="mt-1 truncate font-mono text-[11px] text-[#8b909a]">
                          {meta?.model_title ?? "ComfyUI"} · {meta?.format_name ?? "Aspect"} · Seed {meta?.seed ?? "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyPromptText(promptText, item.key);
                        }}
                        className="rounded-lg bg-[#272931] p-2 text-[#8b909a] hover:text-white transition"
                        title="Copy prompt"
                      >
                        {copiedKey === item.key ? <Check className="h-3.5 w-3.5 text-[var(--accent)]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <a
                        href={item.url}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg bg-[#272931] p-2 text-[#8b909a] hover:text-white transition"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.key}
                  onClick={() => setSelectedAsset(item)}
                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-[#262830] bg-[#1a1b20] transition hover:-translate-y-0.5 hover:border-[#3d414d] hover:shadow-xl"
                  style={{ aspectRatio: "1 / 1" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={promptText}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyPromptText(promptText, item.key);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white backdrop-blur hover:bg-[var(--accent)] hover:text-black transition"
                        title="Copy prompt"
                      >
                        {copiedKey === item.key ? <Check className="h-3.5 w-3.5 text-[var(--accent)]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <a
                        href={item.url}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white backdrop-blur hover:bg-[var(--accent)] hover:text-black transition"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    <p className="line-clamp-2 text-[11px] leading-snug text-white">
                      {promptText}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Asset Detail Lightbox Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#2b2d35] bg-[#17181d] shadow-2xl lg:flex-row">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedAsset(null)}
              className="absolute right-3.5 top-3.5 z-20 rounded-full bg-black/70 p-1.5 text-white backdrop-blur hover:bg-white hover:text-black transition"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Left Image View */}
            <div className="relative flex min-h-[300px] flex-1 items-center justify-center bg-[#101114] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedAsset.url}
                alt=""
                className="max-h-[80vh] max-w-full rounded-lg object-contain"
              />
            </div>

            {/* Right Details Panel */}
            <div className="workspace-scroll flex w-full flex-col justify-between border-t border-[#262830] bg-[#1a1b20] p-6 lg:w-96 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    Generation Details
                  </span>
                  <h3 className="mt-1 text-sm font-semibold text-white">
                    {selectedAsset.metadata?.model_title ?? "Basic Model"}
                  </h3>
                </div>

                {/* Prompt */}
                <div>
                  <span className="text-[10px] font-semibold uppercase text-[#8b909a]">Prompt</span>
                  <p className="mt-1 max-h-32 overflow-y-auto rounded-lg bg-[#141518] p-3 text-xs leading-relaxed text-white">
                    {selectedAsset.metadata?.prompt ?? "No prompt recorded"}
                  </p>
                </div>

                {/* Parameters */}
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="rounded-lg bg-[#141518] p-2.5">
                    <span className="block text-[9px] text-[#8b909a] uppercase">Seed</span>
                    <span className="text-white">{selectedAsset.metadata?.seed ?? "N/A"}</span>
                  </div>
                  <div className="rounded-lg bg-[#141518] p-2.5">
                    <span className="block text-[9px] text-[#8b909a] uppercase">Steps</span>
                    <span className="text-white">{selectedAsset.metadata?.steps ?? "N/A"}</span>
                  </div>
                  <div className="rounded-lg bg-[#141518] p-2.5">
                    <span className="block text-[9px] text-[#8b909a] uppercase">CFG</span>
                    <span className="text-white">{selectedAsset.metadata?.cfg ?? "N/A"}</span>
                  </div>
                  <div className="rounded-lg bg-[#141518] p-2.5">
                    <span className="block text-[9px] text-[#8b909a] uppercase">Format</span>
                    <span className="text-white">{selectedAsset.metadata?.format_name ?? "1:1"}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex items-center gap-2 pt-4 border-t border-[#262830]">
                <button
                  type="button"
                  onClick={() => copyPromptText(selectedAsset.metadata?.prompt ?? "", "modal")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#2d3039] bg-[#22242b] py-2.5 text-xs font-semibold text-white hover:bg-[#2a2d36] transition"
                >
                  <Copy className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>{copiedKey === "modal" ? "Copied!" : "Copy Prompt"}</span>
                </button>
                <a
                  href={selectedAsset.url}
                  download
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] py-2.5 text-xs font-bold text-[var(--accent-ink)] hover:bg-[#22e6cf] transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
