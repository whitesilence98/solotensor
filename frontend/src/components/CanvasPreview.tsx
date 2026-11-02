"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ComparisonSlider from "./ComparisonSlider";
import Link from "next/link";
import {
 AlertCircle,
 Camera,
 Check,
 ChevronLeft,
 ChevronRight,
 Clock,
 Copy,
 Cpu,
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
 Zap,
} from "lucide-react";
import AssetDetailOverlay from "@/components/AssetDetailOverlay";
import CreditPill from "@/components/CreditPill";
import AssetCardList from "@/components/AssetCardList";
import { resolveMediaUrl, type GalleryItem, type GalleryMetadata, type InstalledGalleryModel } from "@/lib/api";
import { resolveModelGalleryUrl } from "@/lib/models";
import { usePersistentState, STORAGE_KEYS } from "@/lib/storage";

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
 activeModelTitle?: string;
 aspectRatio?: string;
 className?: string;
 /** True when the active studio tab is Video; drives progress copy. */
 isVideo?: boolean;
 /** Stage 2 (2x upscale + RIFE) is active for the current video run. */
 stage2Upscale?: boolean;
 videoDurationSeconds?: number;
 videoFps?: number;
  activeMode?: "Text2Img" | "Img2Img" | "Edit" | "Video" | "Prime";
  selectedModelCover?: string | null;
  triggerWords?: string[];
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
 const isVideoItem =
  meta?.kind === "video" || /\.(mp4|webm|mov|mkv)$/i.test(item.key);

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
     {isVideoItem ? (
      <video
       src={mediaUrl}
       muted
       playsInline
       preload="metadata"
       aria-hidden="true"
       onLoadedMetadata={() => setIsLoaded(true)}
       className={`asset-zoom-media h-full w-full object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none ${
        isLoaded ? "opacity-100" : "opacity-0"
       }`}
      />
     ) : (
      <img
       src={mediaUrl}
       alt={item.key}
       loading="lazy"
       onLoad={() => setIsLoaded(true)}
       className={`asset-zoom-media h-full w-full object-cover transition-opacity duration-300 ease-out motion-reduce:transition-none ${
        isLoaded ? "opacity-100" : "opacity-0"
       }`}
      />
     )}
    </div>
    <div className="min-w-0">
     <div className="flex items-center gap-1.5">
      <p className="truncate text-xs font-medium text-[var(--ink)]">{promptText}</p>
      {Boolean(
        item.before_detailer_url ||
        (item as any)?.has_detailer ||
        (item as any)?.enable_detailer ||
        meta?.before_detailer_url ||
        (meta as any)?.has_detailer ||
        (meta as any)?.enable_detailer
      ) && (
        <span className="shrink-0 inline-flex items-center gap-1 rounded bg-[var(--overlay)] border border-[var(--accent)]/30 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-[var(--accent)]">
          <Sparkles className="h-2.5 w-2.5 fill-current" />
          <span>Detailer</span>
        </span>
      )}
     </div>
     <p className="mt-1 truncate font-mono text-[11px] text-[var(--ink-faint)]">
      {meta?.model_title ?? "SoloTensor Engine"} · {meta?.format_name ?? "Aspect"} · Seed {meta?.seed ?? "N/A"}
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

const STYLE_CATALYSTS = [
  {
    id: "cyberpunk",
    genre: "SCI-FI / DIT",
    icon: Zap,
    title: "Cyberpunk Arcology",
    description: "Towering neon arcologies in volumetric acid rain with anamorphic flares",
    prompt:
      "Dystopian towering neon arcology shrouded in volumetric acid rain, reflections in wet asphalt, anamorphic blue flare, 8k cinematic photography, octane render, intricate cybernetic details, raytracing, sharp focus",
    borderHover: "hover:border-[var(--line-strong)]",
    badgeStyle: "text-[var(--ink-soft)] border-[var(--line)] bg-[var(--surface-soft)]",
    iconColor: "text-[var(--accent)]",
  },
  {
    id: "analog",
    genre: "PHOTOGRAPHY / 35MM",
    icon: Camera,
    title: "Analog Studio Portrait",
    description: "Tactile tungsten rim lighting, natural skin micro-pores, Kodak Portra grain",
    prompt:
      "Close-up 35mm film portrait of a thoughtful artisan in a dimly lit workshop, dramatic tungsten rim lighting, natural skin pores and micro-texture, shallow depth of field f/1.4, Kodak Portra 400 film grain, hyperrealistic",
    borderHover: "hover:border-[var(--line-strong)]",
    badgeStyle: "text-[var(--ink-soft)] border-[var(--line)] bg-[var(--surface-soft)]",
    iconColor: "text-[var(--accent)]",
  },
  {
    id: "anime",
    genre: "ANIME / SHINKAI",
    icon: Sparkles,
    title: "Celestial Horizon",
    description: "Towering cumulonimbus clouds over a glass ocean with crepuscular rays",
    prompt:
      "Makoto Shinkai aesthetic, towering cumulonimbus clouds over a glass ocean, golden hour crepuscular rays, vibrant anime sky, sparkling atmospheric particles, masterpiece, highres, vibrant color palette",
    borderHover: "hover:border-[var(--line-strong)]",
    badgeStyle: "text-[var(--ink-soft)] border-[var(--line)] bg-[var(--surface-soft)]",
    iconColor: "text-[var(--accent)]",
  },
  {
    id: "brutalism",
    genre: "ARCHITECTURE / MONO",
    icon: Layers,
    title: "Obsidian Monolith",
    description: "Minimalist concrete monolith in volcanic desert, harsh geometric shadows",
    prompt:
      "Minimalist brutalist concrete monolith standing in an obsidian volcanic desert, harsh architectural shadows, dramatic overcast sky, Hasselblad H6D-100c medium format, cinematic architectural photography, award winning",
    borderHover: "hover:border-[var(--accent)] hover:shadow-[0_0_20px_rgba(213,240,111,0.15)]",
    badgeStyle: "text-[var(--accent)] border-[var(--accent)]/40 bg-[var(--accent)]/10",
    iconColor: "text-[var(--accent)]",
  },
];

export default function CanvasPreview(props: Props) {
 const {
  className,
  prompt,
  onPromptChange,
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
  activeModelTitle,
  aspectRatio,
  isVideo = false,
  stage2Upscale = false,
  videoDurationSeconds,
  videoFps,
  activeMode,
  selectedModelCover,
  triggerWords,
 } = props;

 const [appliedCatalystId, setAppliedCatalystId] = useState<string | null>(null);

 const handleApplyCatalyst = (cat: (typeof STYLE_CATALYSTS)[number]) => {
  if (onPromptChange) {
   onPromptChange(cat.prompt);
  }
  setAppliedCatalystId(cat.id);
  setTimeout(() => setAppliedCatalystId(null), 1800);
 };

 const [activeTab, setActiveTab] = useState<MediaFilter>("all");
 const [viewMode, setViewMode] = usePersistentState<ViewMode>(
  STORAGE_KEYS.STUDIO_CANVAS_VIEW,
  "grid"
 );
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

    const cleanProgress = Math.min(100, Math.max(0, progress));
  const strokeDashoffset = 263.89 - (cleanProgress / 100) * 263.89;

  const hasSourceImage =
    (activeMode === "Img2Img" ||
      activeMode === "Edit" ||
      activeMode === "Video" ||
      isVideo) &&
    Boolean(referenceImage);

  const GeneratingCard = () => (
    <div
      role="status"
      aria-live="polite"
      aria-label="Generating asset in progress"
      style={{ aspectRatio: `${outputWidth} / ${outputHeight}` }}
      className="relative flex w-full flex-col justify-end overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-sunken)] select-none shadow-lg group"
    >
      {/* Background (Conditional on Mode) */}
      {hasSourceImage ? (
        <>
          <img
            src={resolveMediaUrl(referenceImage!) || referenceImage!}
            alt="Reference source"
            className="absolute inset-0 h-full w-full object-cover blur-xl brightness-50 scale-105"
          />
          <div className="absolute inset-0 bg-black/40" />
        </>
      ) : (
        <>
          {selectedModelCover && (
            <img
              src={resolveMediaUrl(selectedModelCover) || selectedModelCover}
              alt="Model cover"
              className="absolute inset-0 h-full w-full object-cover blur-2xl brightness-30 scale-105 opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/60 via-neutral-950/80 to-black animate-pulse" />
          <div className="absolute inset-x-4 top-1/4 select-none pointer-events-none text-center">
            <p className="font-mono text-xs font-bold text-white/15 uppercase tracking-widest line-clamp-3">
              {prompt
                ? prompt.slice(0, 80)
                : triggerWords && triggerWords.length > 0
                ? triggerWords.slice(0, 5).join(", ")
                : activeModelTitle || "LATENT SPACE"}
            </p>
          </div>
        </>
      )}

      {/* Shimmer sweep */}
      <div className="shimmer absolute inset-0 opacity-15 pointer-events-none" />

      {/* Top-left Mode Badge */}
      <span className="absolute top-2.5 left-2.5 z-10 rounded bg-[var(--surface-sunken)]/80 backdrop-blur-md border border-[var(--line)] px-2 py-0.5 font-mono text-[9px] text-[var(--accent)] font-semibold uppercase tracking-wider">
        {activeMode || (isVideo ? "VIDEO" : "T2I")}
      </span>

      {/* Center Circular Progress Ring & Capsule */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-4">
        <div className="relative flex items-center justify-center">
          <svg className="w-20 h-20 -rotate-90 transform" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              stroke="var(--line-strong)"
              strokeWidth="5"
              fill="none"
              opacity="0.3"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              stroke="var(--accent)"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
              strokeDasharray="263.89"
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-200 ease-out"
            />
          </svg>
          <span className="absolute font-mono text-lg font-bold text-[var(--ink)]">
            {Math.round(cleanProgress)}%
          </span>
        </div>

        <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-sunken)]/90 backdrop-blur-md px-3 py-1 shadow-sm max-w-[90%]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
          <span className="font-mono text-[11px] font-medium text-[var(--ink)] truncate">
            {progressLabel ||
              (isVideo
                ? stage2Upscale
                  ? `Rendering video… Stage 2 of 2 (2x upscale + RIFE${videoDurationSeconds ? `, ${videoDurationSeconds}s @ ${videoFps ?? 25} fps` : ""})`
                  : `Rendering video… Stage 1 of 2 (LTX-Video 2.3${videoDurationSeconds ? `, ${videoDurationSeconds}s @ ${videoFps ?? 25} fps` : ""})`
                : "Queuing workflow…")}
          </span>
        </div>
      </div>
    </div>
  );

 const latest = filteredGallery[0];
 const detailerBeforeUrl = (latest as any)?.before_detailer_url || latest?.metadata?.before_detailer_url || null;
 // Before / After Comparison disabled for now per user request
 const canCompare = false;
 const comparisonBefore = detailerBeforeUrl
  ? (resolveMediaUrl(detailerBeforeUrl) || detailerBeforeUrl)
  : (referenceImage || "");
 const comparisonAfter = resolveMediaUrl(latest?.url) || latest?.url || "";
 const comparisonLabel = detailerBeforeUrl
  ? "Face & Image Detailer Comparison (Before vs After)"
  : "Before / After Comparison";

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
   window.history.pushState(null, "", "/generate");
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
   className={`workspace-core workspace-scroll relative flex h-auto min-h-[36rem] min-w-0 flex-1 flex-col overflow-y-auto rounded-[1.35rem] border border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_88%,var(--surface))] text-[var(--ink)] shadow-[0_24px_80px_rgba(19,28,17,.18)] lg:min-h-0 lg:flex-1 ${className || ""}`}
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

     <div className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1 text-[11px] font-mono text-[var(--ink-soft)] shrink-0">
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

    {filteredGallery.length === 0 && !busy ? (
      <section className="relative mx-auto flex w-full max-w-4xl flex-col items-center justify-center py-6 px-4 sm:px-6 select-none">
        {/* Hero Headline */}
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-[var(--ink)] sm:text-4xl lg:text-5xl">
          Give the model<br className="hidden sm:block" /> something to see.
        </h2>
        <p className="mt-3.5 max-w-lg text-center font-mono text-xs leading-relaxed text-[var(--ink-faint)]">
          Adjust parameters on the left inspector, or ignite the latent diffusion pipeline with a curated style catalyst below.
        </p>

        {/* 4 Style Catalyst Cards */}
        <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {STYLE_CATALYSTS.map((cat) => {
            const Icon = cat.icon;
            const isApplied = appliedCatalystId === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleApplyCatalyst(cat)}
                className={`group relative flex flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] ${cat.borderHover}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`rounded border px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider uppercase ${cat.badgeStyle}`}>
                      {cat.genre}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isApplied ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-[var(--accent)]">
                          <Check className="h-3 w-3" />
                          <span>Loaded to prompt</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] text-[var(--ink-faint)] group-hover:text-[var(--ink-soft)] transition-colors">
                          Click to compose ↵
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] ${cat.iconColor}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <h3 className="font-mono text-xs font-bold text-[var(--ink)] transition-colors group-hover:text-[var(--accent)] motion-reduce:transition-none">
                      {cat.title}
                    </h3>
                  </div>

                  <p className="font-mono text-[10px] leading-relaxed text-[var(--ink-faint)] line-clamp-2">
                    {cat.prompt}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-2 font-mono text-[9px] text-[var(--ink-faint)]">
                  <span className="truncate max-w-[140px]">{cat.description}</span>
                  <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-bold text-[var(--ink-soft)]">
                    "Prompt ↵"
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Primary Action Button */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3 text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)] shadow-[0_0_16px_rgba(213,240,111,0.25)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Zap className="h-4 w-4 fill-current" />
            <span>Generate First Output</span>
            <span className="font-mono text-[9px] opacity-80 rounded bg-[var(--accent-ink)]/10 px-1.5 py-0.5">⌘↵</span>
          </button>
        </div>

        {/* Darkroom Shortcuts & Telemetry Footer */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 border-t border-[var(--line)] pt-5 font-mono text-[9px] text-[var(--ink-faint)]">
          <div className="flex items-center gap-2">
            <span>SHORTCUTS:</span>
            <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.5 text-[var(--ink-soft)]">
              <kbd className="font-bold text-[var(--accent)]">⌘ Enter</kbd> Generate
            </span>
            <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.5 text-[var(--ink-soft)]">
              <kbd className="font-bold">Tab</kbd> Composer
            </span>
            <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.5 text-[var(--ink-soft)]">
              <kbd className="font-bold">Alt 1-5</kbd> Ratio
            </span>
          </div>
          <div className="h-3 w-px bg-[var(--line-strong)] hidden sm:block" />
          <div className="flex items-center gap-2">
            <Cpu className="h-3 w-3 text-[var(--accent)]" />
            <span>{activeModelTitle || "Krea 2 Turbo"}</span>
            <span>·</span>
            <span>{aspectRatio || "16:9"}</span>
            <span>·</span>
            <span>STUDIO ENGINE</span>
          </div>
        </div>
      </section>
    ) : (
      <section className="w-full" aria-label="Outputs Gallery">
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-xs font-semibold text-[var(--ink)] font-mono uppercase tracking-wider">
            All Outputs ({busy ? filteredGallery.length + 1 : filteredGallery.length})
          </h3>
        </div>
        {viewMode === "grid" ? (
          <AssetCardList
            items={filteredGallery}
            leadSlot={busy ? <GeneratingCard /> : undefined}
            aspectRatio="natural"
            onOpen={(item) => openAsset(item as GalleryItem)}
            onDelete={onDeleteOutput}
          />
        ) : (
          <div className="space-y-3">
            {busy && <GeneratingCard />}
            {filteredGallery.map((item) => {
              const meta = item.metadata;
              const promptText = meta?.prompt ?? "Generated artwork";
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
            })}
          </div>
        )}
      </section>
    )}
   </div>

   {/* Asset Detail Lightbox Modal */}
   <AssetDetailOverlay
    asset={selectedAsset}
    items={filteredGallery}
    onSelectAsset={selectAssetInCarousel}
    onClose={closeAsset}
    modelOptions={props.modelOptions}
    onRemix={onRemix}
    onSetReferenceImage={onSetReferenceImage}
    onDeleteOutput={onDeleteOutput}
   />
  </main>
 );
}
