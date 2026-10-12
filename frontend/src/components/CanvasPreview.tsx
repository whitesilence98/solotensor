"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
 AlertCircle,
 Check,
 ChevronLeft,
 ChevronRight,
 Copy,
 Download,
 ExternalLink,
 FolderOpen,
 Grid2X2,
 Layers,
 List,
 Maximize2,
 Minimize2,
 PanelLeftOpen,
 RefreshCw,
 Sparkles,
 Trash2,
 X,
} from "lucide-react";
import WorkspaceModal from "@/components/WorkspaceModal";
import AssetInspectionStage from "@/components/AssetInspectionStage";
import CreditPill from "@/components/CreditPill";
import { formatBytes } from "@/components/AssetCard";
import { resolveMediaUrl, type GalleryItem, type GalleryMetadata, type InstalledGalleryModel } from "@/lib/api";
import { resolveModelGalleryUrl } from "@/lib/models";

export type MediaFilter = "all" | "video" | "image" | "audio";
export type ViewMode = "grid" | "list";

interface Props {
 prompt?: string;
 onPromptChange?: (v: string) => void;
 imageCount?: string;
 onImageCountChange?: (v: string) => void;
 canGenerate?: boolean;
 onGenerate?: () => void;
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
 onRemix?: (meta: GalleryMetadata) => void;
 onSetReferenceImage?: (url: string) => void;
 onDeleteOutput?: (key: string) => void;
 modelOptions?: InstalledGalleryModel[];
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
   className="media-frame group relative isolate mx-auto w-full max-w-[64rem] overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface-raised)] shadow-[0_18px_48px_rgba(0,0,0,.2)] select-none touch-none "
   style={{ aspectRatio: "16 / 10" }}
   onPointerDown={(event) => {
    setDragging(true);
    updatePosition(event.clientX);
   }}
   onKeyDown={(event) => {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
     event.preventDefault();
     setPosition((value) => Math.max(0, value - step));
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
     event.preventDefault();
     setPosition((value) => Math.min(100, value + step));
    } else if (event.key === "Home") {
     event.preventDefault();
     setPosition(0);
    } else if (event.key === "End") {
     event.preventDefault();
     setPosition(100);
    }
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
   <span className="pointer-events-none absolute left-3 top-3 rounded-xl bg-[var(--media-scrim-strong)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink)] ">
    Before
   </span>
   <span className="pointer-events-none absolute right-3 top-3 rounded-xl bg-[var(--accent)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-ink)]">
    After
   </span>
   <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${position}%` }}>
    <span className="absolute inset-y-0 -translate-x-1/2 border-l border-[var(--ink)] " />
    <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-[var(--ink)] bg-[var(--media-control)] text-[var(--media-control-ink)] ">
     <span className="text-sm font-bold" aria-hidden>↔</span>
    </span>
   </div>
  </div>
 );
}

function CanvasGridCard({
 item,
 promptText,
 onClick,
}: {
 item: GalleryItem;
 promptText: string;
 onClick: () => void;
}) {
 const [isLoaded, setIsLoaded] = useState(false);
 const mediaUrl = resolveMediaUrl(item.url) || item.url;

 return (
  <div
   onClick={onClick}
   onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
     event.preventDefault();
     onClick();
    }
   }}
   role="button"
   tabIndex={0}
   className="media-frame group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[var(--overlay)] shadow-[0_12px_32px_rgba(0,0,0,.18)] transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] focus-visible:-translate-y-0.5 hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)]"
   style={{ aspectRatio: "1 / 1" }}
  >
   {/* Underlying Shimmer Placeholder */}
   <div
    className={`absolute inset-0 shimmer transition-opacity duration-300 ${
     isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
    }`}
   />
   {/* Full-Bleed Media with smooth progressive hydration */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img
    src={mediaUrl}
    alt={promptText}
    loading="lazy"
    onLoad={() => setIsLoaded(true)}
    className={`h-full w-full object-cover transition-opacity duration-300 ease-out ${
     isLoaded ? "opacity-100" : "opacity-0"
    }`}
   />
  </div>
 );
}

function CanvasListCard({
 item,
 promptText,
 meta,
 onClick,
 onCopy,
 copied,
}: {
 item: GalleryItem;
 promptText: string;
 meta: GalleryItem["metadata"];
 onClick: () => void;
 onCopy: () => void;
 copied: boolean;
}) {
 const [isLoaded, setIsLoaded] = useState(false);
 const mediaUrl = resolveMediaUrl(item.url) || item.url;

 return (
  <div
   onClick={onClick}
   onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
     event.preventDefault();
     onClick();
    }
   }}
   role="button"
   tabIndex={0}
   className="group flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--overlay)] p-3 transition hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)]"
  >
   <div className="flex items-center gap-3 min-w-0">
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-raised)]">
     <div
      className={`absolute inset-0 shimmer transition-opacity duration-300 ${
       isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
     />
     {/* eslint-disable-next-line @next/next/no-img-element */}
     <img
      src={mediaUrl}
      alt={item.key}
      loading="lazy"
      onLoad={() => setIsLoaded(true)}
      className={`h-full w-full object-cover transition-opacity duration-300 ease-out ${
       isLoaded ? "opacity-100" : "opacity-0"
      }`}
     />
    </div>
    <div className="min-w-0">
     <p className="truncate text-xs font-medium text-[var(--ink)]">{promptText}</p>
     <p className="mt-1 truncate font-mono text-[11px] text-[var(--ink-faint)]">
      {meta?.model_title ?? "ComfyUI"} · {meta?.format_name ?? "Aspect"} · Seed {meta?.seed ?? "N/A"}
     </p>
    </div>
   </div>

   <div className="flex items-center gap-2">
    <button
     type="button"
     onClick={(e) => {
      e.stopPropagation();
      onCopy();
     }}
     className="rounded-xl bg-[var(--surface-soft)] p-2 text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
     aria-label="Copy prompt"
     title="Copy prompt"
    >
     {copied ? <Check className="h-3.5 w-3.5 text-[var(--accent)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
    <a
     href={item.url}
     download
     onClick={(e) => e.stopPropagation()}
     className="rounded-xl bg-[var(--surface-soft)] p-2 text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
     aria-label="Download output"
     title="Download"
    >
     <Download className="h-3.5 w-3.5" />
    </a>
   </div>
  </div>
 );
}

export default function CanvasPreview(props: Props) {
 const {
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
  onRemix,
  onSetReferenceImage,
  onDeleteOutput,
 } = props;

 const [activeTab, setActiveTab] = useState<MediaFilter>("all");
 const [viewMode, setViewMode] = useState<ViewMode>("grid");
 const [selectedAsset, setSelectedAsset] = useState<GalleryItem | null>(null);
 const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

 const selectedIndex = selectedAsset
  ? filteredGallery.findIndex((item) => item.key === selectedAsset.key)
  : -1;

 const openAsset = useCallback((item: GalleryItem) => {
  setSelectedAsset(item);
  if (typeof window !== "undefined") {
   const encodedKey = item.key.split("/").map(encodeURIComponent).join("/");
   window.history.pushState({ assetKey: item.key }, "", `/assets/${encodedKey}`);
  }
 }, []);

 const closeAsset = useCallback(() => {
  setSelectedAsset(null);
  if (typeof window !== "undefined") {
   window.history.pushState(null, "", "/");
  }
 }, []);

 const selectAssetInCarousel = useCallback((item: GalleryItem) => {
  setSelectedAsset(item);
  if (typeof window !== "undefined") {
   const encodedKey = item.key.split("/").map(encodeURIComponent).join("/");
   window.history.replaceState({ assetKey: item.key }, "", `/assets/${encodedKey}`);
  }
 }, []);

 // Listen for browser Back button to dismiss inspection stage smoothly
 useEffect(() => {
  const onPopState = () => {
   if (selectedAsset) {
    setSelectedAsset(null);
   }
  };
  window.addEventListener("popstate", onPopState);
  return () => window.removeEventListener("popstate", onPopState);
 }, [selectedAsset]);

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
   className="workspace-core workspace-scroll relative flex h-auto min-h-[36rem] min-w-0 flex-1 flex-col overflow-y-auto rounded-[1.35rem] border border-white/10 bg-[color-mix(in_srgb,var(--ground)_88%,var(--surface))] text-[var(--ink)] shadow-[0_24px_80px_rgba(19,28,17,.18)] lg:h-full"
  >
   {/* Viewport Control Strip */}
   <header className="workspace-command top-0 z-30 m-2 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[var(--line-strong)] bg-[rgba(15,18,15,.85)] px-3.5 py-2.5 shadow-[0_14px_42px_rgba(3,8,4,.32)] backdrop-blur-xl">
    {/* Left Group */}
    <div className="flex items-center gap-2 min-w-0">
     <button
      type="button"
      onClick={onToggleSidebarCollapse}
      aria-label={isSidebarCollapsed ? "Expand inspector panel" : "Collapse inspector panel"}
      title={isSidebarCollapsed ? "Expand inspector panel" : "Collapse inspector panel"}
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--accent)] hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] hover:bg-[var(--surface-soft)] transition shrink-0"
     >
      <PanelLeftOpen
       className={`h-4 w-4 transition-transform duration-200 ${
        isSidebarCollapsed ? "" : "rotate-180"
       }`}
      />
     </button>

     <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[var(--surface-raised)] px-2.5 py-1 text-[11px] font-mono text-[var(--ink-soft)] shrink-0">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
      <span>{outputWidth} × {outputHeight}</span>
     </div>

     {/* Media Filter Pills */}
     <div className="flex items-center rounded-xl bg-[var(--surface-raised)] p-0.5 border border-[var(--line)]">
      {(["all", "image", "video"] as MediaFilter[]).map((tab) => {
       const active = activeTab === tab;
       const label = tab === "all" ? "All" : tab === "image" ? "Visuals" : "Motion";
       return (
        <button
         key={tab}
         type="button"
         onClick={() => setActiveTab(tab)}
         className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition ${
          active
           ? "bg-[var(--accent)] text-[var(--accent-ink)]"
           : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
         }`}
        >
         {label}
        </button>
       );
      })}
     </div>
    </div>

    {/* Right Group */}
    <div className="flex items-center gap-2 shrink-0">
     <CreditPill />

     <span className="hidden md:inline-block font-mono text-[10px] text-[var(--ink-faint)] uppercase tracking-wider">
      {filteredGallery.length} {filteredGallery.length === 1 ? "Output" : "Outputs"}
     </span>

     {/* View Mode Toggle: Grid vs List */}
     <div className="flex items-center rounded-xl bg-[var(--surface-raised)] p-0.5 border border-[var(--line)]">
      <button
       type="button"
       onClick={() => setViewMode("grid")}
       aria-label="Grid view"
       aria-pressed={viewMode === "grid"}
       title="Grid view"
       className={`rounded-lg p-1.5 transition ${
        viewMode === "grid"
         ? "bg-[var(--line-strong)] text-[var(--accent)]"
         : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
       }`}
      >
       <Grid2X2 className="h-3.5 w-3.5" />
      </button>
      <button
       type="button"
       onClick={() => setViewMode("list")}
       aria-label="List view"
       aria-pressed={viewMode === "list"}
       title="List view"
       className={`rounded-lg p-1.5 transition ${
        viewMode === "list"
         ? "bg-[var(--line-strong)] text-[var(--accent)]"
         : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
       }`}
      >
       <List className="h-3.5 w-3.5" />
      </button>
     </div>

     {/* Reload Button */}
     <button
      type="button"
      onClick={onReload}
      aria-label="Reload outputs"
      title="Reload outputs"
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] focus-visible:border-[var(--line-strong)] focus-visible:text-[var(--ink)] transition"
     >
      <RefreshCw className="h-3.5 w-3.5" />
     </button>

     {/* Assets Button (Links to /assets) */}
     <Link
      href="/assets"
      title="View all assets"
      className="flex h-8 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 text-xs font-medium text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--accent)] focus-visible:border-[var(--line-strong)] focus-visible:text-[var(--accent)] transition"
     >
      <FolderOpen className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Assets</span>
     </Link>
    </div>
   </header>

   {/* 3. Main Content Area */}
   <div className="flex-1 px-3 pb-5 pt-4 sm:p-6 lg:p-8">
    {/* Error Alert */}
    {error && (
     <div className="workspace-alert mb-6 flex items-start gap-3 p-4 text-xs" role="alert">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <p className="leading-relaxed">{error}</p>
     </div>
    )}

    {/* Live Generation Progress Card */}
    {busy && (
     <section className="workspace-panel mb-10 overflow-hidden p-5" role="status" aria-live="polite">
      <div className="mb-3 flex items-center justify-between">
       <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
         In Progress
        </p>
        <h3 className="mt-0.5 text-sm font-semibold text-[var(--ink)]">
         {progressLabel || "Building your image…"}
        </h3>
       </div>
       <span className="font-mono text-xl font-bold text-[var(--accent)]">{progress}%</span>
      </div>

      {/* Generation progress */}
      <div className="h-2 w-full overflow-hidden rounded-xl bg-[var(--surface-soft)]">
       <div
        className="h-full origin-left bg-[var(--accent)] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress / 100))})` }}
       />
      </div>

      {/* Shimmer Preview Canvas Frame */}
      <div
       className="mt-4 mx-auto max-w-full overflow-hidden rounded-xl border border-[var(--line)] max-h-[32rem]"
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
       <span className="text-xs font-semibold text-[var(--ink-faint)]">Before / After Comparison</span>
      </div>
      <ComparisonSlider before={referenceImage!} after={resolveMediaUrl(latest.url) || latest.url} />
     </section>
    )}

    {/* Outputs Grid or Empty State */}
    {filteredGallery.length === 0 && !busy ? (
     <section className="mx-auto flex min-h-96 w-full max-w-xl flex-col justify-center border-y border-[var(--line)] py-10 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">Getting started</p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">Create your first image</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-faint)]">
       Describe what you want to make, choose the number of images, then generate your first result.
      </p>
      <button
       type="button"
       onClick={onGenerate}
       disabled={!canGenerate}
       className="mx-auto mt-6 border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)] focus-visible:bg-[var(--accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
      >
       Generate image
      </button>
     </section>
    ) : (
     /* Render Gallery Outputs with smooth cross-fade and progressive hydration */
     <div
      className={
       viewMode === "grid"
        ? "grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 animate-in fade-in duration-300 ease-out"
        : "space-y-3 animate-in fade-in duration-300 ease-out"
      }
     >
      {filteredGallery.map((item) => {
       const meta = item.metadata;
       const promptText = meta?.prompt ?? "Generated artwork";

       if (viewMode === "list") {
        return (
         <CanvasListCard
          key={item.key}
          item={item}
          promptText={promptText}
          meta={meta}
          onClick={() => openAsset(item)}
          onCopy={() => copyPromptText(promptText, item.key)}
          copied={copiedKey === item.key}
         />
        );
       }

       return (
        <CanvasGridCard
         key={item.key}
         item={item}
         promptText={promptText}
         onClick={() => openAsset(item)}
        />
       );
      })}
     </div>
    )}
   </div>

   {/* Asset Detail Lightbox Modal */}
   <WorkspaceModal
    open={Boolean(selectedAsset)}
    onClose={closeAsset}
    headless
    size="media"
   >
    {selectedAsset && (
     <AssetInspectionStage
      mode="modal"
      asset={selectedAsset}
      items={filteredGallery}
      currentIndex={selectedIndex}
      onSelectAsset={selectAssetInCarousel}
      onClose={closeAsset}
      modelOptions={props.modelOptions}
      onRemix={onRemix}
      onSetReferenceImage={onSetReferenceImage}
      onDeleteOutput={onDeleteOutput}
     />
    )}
   </WorkspaceModal>
  </main>
 );
}
