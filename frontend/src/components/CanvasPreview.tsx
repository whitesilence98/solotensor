"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
 AlertCircle,
 Check,
 ChevronDown,
 ChevronRight,
 Copy,
 Download,
 FolderOpen,
 Grid2X2,
 List,
 Loader2,
 PanelLeftOpen,
 RefreshCw,
 Zap,
} from "lucide-react";
import WorkspaceModal from "@/components/WorkspaceModal";
import { resolveMediaUrl, type GalleryItem } from "@/lib/api";

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
   className="workspace-core workspace-scroll relative flex h-auto min-h-[36rem] min-w-0 flex-1 flex-col overflow-y-auto rounded-[1.35rem] border border-white/10 bg-[color-mix(in_srgb,var(--ground)_88%,var(--surface))] text-[var(--ink)] shadow-[0_24px_80px_rgba(19,28,17,.18)] lg:h-full"
  >
   {/* 1. Top Bar: Prompt Input + Image Count Dropdown + Generate Button */}
   <header className="workspace-command top-0 z-30 m-2 flex items-center gap-2 border border-[var(--line-strong)] bg-[rgba(15,18,15,.82)] px-3 py-2 shadow-[0_14px_42px_rgba(3,8,4,.32)] backdrop-blur-xl sm:gap-3 sm:px-4">
    {/* Left: Expand button if sidebar is collapsed */}
    {isSidebarCollapsed && (
     <button
      type="button"
      onClick={onToggleSidebarCollapse}
      aria-label="Expand recipe panel"
      title="Expand recipe panel"
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
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
      className="workspace-field w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2 text-xs text-[var(--ink)] shadow-inner shadow-black/20 placeholder-[var(--ink-faint)] outline-none transition-[border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)] disabled:opacity-50"
     />
    </div>

    {/* Image Count Dropdown Button */}
    <div className="relative">
     <button
      type="button"
      onClick={() => setImageCountOpen((v) => !v)}
      disabled={busy}
      className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] focus-visible:bg-[var(--surface-soft)] transition"
     >
      <span>{imageCount} {Number(imageCount) === 1 ? "image" : "images"}</span>
      <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
     </button>

     {imageCountOpen && (
      <div className="absolute right-0 top-full mt-1.5 z-40 w-32 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] py-1 ">
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
           : "text-[var(--ink)] hover:bg-[var(--surface-soft)] focus-visible:bg-[var(--surface-soft)]"
         }`}
        >
         <span>{n} {n === "1" ? "image" : "images"}</span>
         {imageCount === n && <Check className="h-3.5 w-3.5" />}
        </button>
       ))}
      </div>
     )}
    </div>

    {/* Generate action */}
    <button
     type="button"
     onClick={onGenerate}
     disabled={!canGenerate}
     className="workspace-action-primary flex h-10 min-w-28 items-center gap-2 px-5 text-xs"
    >
     {busy ? (
      <>
       <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
       <span>Rendering {progress}%</span>
      </>
     ) : (
      <>
       <Zap className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
       <span>Generate</span>
      </>
     )}
    </button>
   </header>

   {/* Output toolbar */}
   <div className="relative z-20 mx-2 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border border-white/5 bg-[var(--surface)] px-3 py-2 text-xs sm:px-4">
    {/* Media filters and view switcher */}
    <div className="flex items-center gap-1.5">
     {/* Filter Pills */}
     <div className="flex items-center rounded-xl bg-[var(--surface-raised)] p-0.5 border border-[var(--line)]">
      {(["all", "video", "image", "audio"] as MediaFilter[]).map((tab) => {
       const active = activeTab === tab;
       return (
        <button
         key={tab}
         type="button"
         onClick={() => setActiveTab(tab)}
         className={`rounded-xl px-3 py-1 text-xs font-semibold capitalize transition ${
          active
           ? "bg-[var(--line-strong)] text-[var(--ink)] "
           : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
         }`}
        >
         {tab}
        </button>
       );
      })}
     </div>

     {/* View Mode Toggle: List vs Grid */}
     <div className="ml-1 flex items-center rounded-xl bg-[var(--surface-raised)] p-0.5 border border-[var(--line)]">
      <button
       type="button"
       onClick={() => setViewMode("list")}
       aria-label="List view"
       aria-pressed={viewMode === "list"}
       title="List view"
       className={`rounded-xl p-1.5 transition ${
        viewMode === "list" ? "bg-[var(--line-strong)] text-[var(--accent)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
       }`}
      >
       <List className="h-3.5 w-3.5" />
      </button>
      <button
       type="button"
       onClick={() => setViewMode("grid")}
       aria-label="Grid view"
       aria-pressed={viewMode === "grid"}
       title="Grid view"
       className={`rounded-xl p-1.5 transition ${
        viewMode === "grid" ? "bg-[var(--line-strong)] text-[var(--accent)]" : "text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)]"
       }`}
      >
       <Grid2X2 className="h-3.5 w-3.5" />
      </button>
     </div>

    </div>

    {/* Workspace actions */}
    <div className="flex items-center gap-1.5">
     {/* Collapse Left Panel Button */}
     <button
      type="button"
      onClick={onToggleSidebarCollapse}
      className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
     >
      <ChevronRight
       className={`h-3.5 w-3.5 transition-transform ${isSidebarCollapsed ? "rotate-180" : ""}`}
      />
      <span>{isSidebarCollapsed ? "Expand" : "Collapse"}</span>
     </button>


     {/* Reload Button */}
     <button
      type="button"
      onClick={onReload}
      title="Reload outputs"
      className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
     >
      <RefreshCw className="h-3.5 w-3.5" />
      <span>Reload</span>
     </button>

     {/* Assets Button (Links to /assets) */}
     <Link
      href="/assets"
      className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium text-[var(--ink-faint)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] hover:text-[var(--accent)] focus-visible:text-[var(--accent)] transition"
     >
      <FolderOpen className="h-3.5 w-3.5" />
      <span>Assets</span>
     </Link>
    </div>
   </div>

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
          onKeyDown={(event) => {
           if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSelectedAsset(item);
           }
          }}
          role="button"
          tabIndex={0}
          className="group flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-[var(--overlay)] p-3 transition hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)]"
         >
          <div className="flex items-center gap-3 min-w-0">
           <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-raised)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveMediaUrl(item.url) || item.url} alt={item.key} className="h-full w-full object-cover" />
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
             copyPromptText(promptText, item.key);
            }}
            className="rounded-xl bg-[var(--surface-soft)] p-2 text-[var(--ink-faint)] hover:text-[var(--ink)] focus-visible:text-[var(--ink)] transition"
            aria-label="Copy prompt"
            title="Copy prompt"
           >
            {copiedKey === item.key ? <Check className="h-3.5 w-3.5 text-[var(--accent)]" /> : <Copy className="h-3.5 w-3.5" />}
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

       return (
        <div
         key={item.key}
         onClick={() => setSelectedAsset(item)}
         onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
           event.preventDefault();
           setSelectedAsset(item);
          }
         }}
         role="button"
         tabIndex={0}
         className="media-frame group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[var(--overlay)] shadow-[0_12px_32px_rgba(0,0,0,.18)] transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-0.5 focus-visible:-translate-y-0.5 hover:border-[var(--line-strong)] focus-visible:border-[var(--line-strong)] "
         style={{ aspectRatio: "1 / 1" }}
        >
         {/* eslint-disable-next-line @next/next/no-img-element */}
         <img
          src={resolveMediaUrl(item.url) || item.url}
          alt={promptText}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105 group-focus-within:scale-105"
         />

         {/* Hover Overlay */}
         <div className="absolute inset-0 flex flex-col justify-between bg-[var(--surface-soft)]  p-3 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="flex justify-end gap-1.5">
           <button
            type="button"
            onClick={(e) => {
             e.stopPropagation();
             copyPromptText(promptText, item.key);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--media-control)] text-[var(--media-control-ink)]  hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:text-[var(--accent-ink)] transition"
            aria-label="Copy prompt"
            title="Copy prompt"
           >
            {copiedKey === item.key ? <Check className="h-3.5 w-3.5 text-[var(--accent)]" /> : <Copy className="h-3.5 w-3.5" />}
           </button>
           <a
            href={resolveMediaUrl(item.url) || item.url}
            download
            onClick={(e) => e.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--media-control)] text-[var(--media-control-ink)]  hover:bg-[var(--accent)] focus-visible:bg-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:text-[var(--accent-ink)] transition"
            aria-label="Download output"
            title="Download"
           >
            <Download className="h-3.5 w-3.5" />
           </a>
          </div>

          <p className="line-clamp-2 text-[11px] leading-snug text-[var(--ink)]">
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
   <WorkspaceModal
    open={Boolean(selectedAsset)}
    onClose={() => setSelectedAsset(null)}
    title="Output details"
    description="Review the generated media and the parameters stored with it."
    eyebrow="Generated asset"
    size="media"
   >
    {selectedAsset && (
     <div className="grid max-h-[75vh] min-h-0 overflow-hidden border-t border-[var(--line)] lg:grid-cols-[minmax(0,1fr)_24rem]">
      {/* Left Image View */}
      <div className="relative flex min-h-[300px] items-center justify-center bg-[var(--surface-sunken)] p-4">
       {/* eslint-disable-next-line @next/next/no-img-element */}
       <img
        src={resolveMediaUrl(selectedAsset.url) || selectedAsset.url}
        alt={selectedAsset.metadata?.prompt ?? "Generated artwork"}
        className="max-h-[80vh] max-w-full rounded-xl object-contain"
       />
      </div>

      {/* Right Details Panel */}
      <div className="workspace-scroll flex w-full flex-col justify-between border-t border-[var(--line)] bg-[var(--overlay)] p-6 lg:w-96 lg:border-l lg:border-t-0">
       <div className="space-y-4">
        <div>
         <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
          Generation Details
         </span>
         <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">
          {selectedAsset.metadata?.model_title ?? "Basic Model"}
         </h3>
        </div>

        {/* Prompt */}
        <div>
         <span className="text-[10px] font-semibold uppercase text-[var(--ink-faint)]">Prompt</span>
         <p className="mt-1 max-h-32 overflow-y-auto rounded-xl bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--ink)]">
          {selectedAsset.metadata?.prompt ?? "No prompt recorded"}
         </p>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
         <div className="rounded-xl bg-[var(--surface)] p-2.5">
          <span className="block text-[9px] text-[var(--ink-faint)] uppercase">Seed</span>
          <span className="text-[var(--ink)]">{selectedAsset.metadata?.seed ?? "N/A"}</span>
         </div>
         <div className="rounded-xl bg-[var(--surface)] p-2.5">
          <span className="block text-[9px] text-[var(--ink-faint)] uppercase">Steps</span>
          <span className="text-[var(--ink)]">{selectedAsset.metadata?.steps ?? "N/A"}</span>
         </div>
         <div className="rounded-xl bg-[var(--surface)] p-2.5">
          <span className="block text-[9px] text-[var(--ink-faint)] uppercase">CFG</span>
          <span className="text-[var(--ink)]">{selectedAsset.metadata?.cfg ?? "N/A"}</span>
         </div>
         <div className="rounded-xl bg-[var(--surface)] p-2.5">
          <span className="block text-[9px] text-[var(--ink-faint)] uppercase">Format</span>
          <span className="text-[var(--ink)]">{selectedAsset.metadata?.format_name ?? "1:1"}</span>
         </div>
        </div>
       </div>

       {/* Action Buttons */}
       <div className="mt-6 flex items-center gap-2 pt-4 border-t border-[var(--line)]">
        <button
         type="button"
         onClick={() => copyPromptText(selectedAsset.metadata?.prompt ?? "", "modal")}
         className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] py-2.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] transition"
        >
         <Copy className="h-3.5 w-3.5 text-[var(--accent)]" />
         <span>{copiedKey === "modal" ? "Copied!" : "Copy Prompt"}</span>
        </button>
        <a
         href={selectedAsset.url}
         download
         className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] py-2.5 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] focus-visible:bg-[var(--accent-hover)] transition"
        >
         <Download className="h-3.5 w-3.5" />
         <span>Download</span>
        </a>
       </div>
      </div>
     </div>
    )}
   </WorkspaceModal>
  </main>
 );
}
