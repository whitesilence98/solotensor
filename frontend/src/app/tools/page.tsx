"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Clock3,
  Cpu,
  Film,
  FileCode2,
  FolderDown,
  ImageIcon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { api, resolveMediaUrl, type ToolMode, type ToolSummary, type ToolAspectRatio } from "@/lib/api";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import WorkspaceModal from "@/components/WorkspaceModal";

const MODE_LABELS: Record<ToolMode, string> = {
  "text-to-image": "Text to Image",
  "image-to-image": "Image to Image",
  "text-to-video": "Text to Video",
  "image-to-video": "Image to Video",
};

const MODE_FILTERS: Array<{ value: "all" | ToolMode; label: string }> = [
  { value: "all", label: "All Workflows" },
  { value: "text-to-image", label: "Text to Image" },
  { value: "image-to-image", label: "Image to Image" },
  { value: "text-to-video", label: "Text to Video" },
  { value: "image-to-video", label: "Image to Video" },
];

interface StarterKit {
  id: string;
  name: string;
  mode: ToolMode;
  modeLabel: string;
  description: string;
  telemetry: string;
  ratio: ToolAspectRatio;
  badgeStyle: string;
}

const STARTER_KITS: StarterKit[] = [
  {
    id: "flux-schnell",
    name: "Flux.1 Schnell Studio",
    mode: "text-to-image",
    modeLabel: "Text to Image",
    description: "4-step distilled latent diffusion pipeline with high prompt alignment and sharp fidelity.",
    telemetry: "4 STEPS • CFG 3.5 • FP8 SCALED",
    ratio: "1:1",
    badgeStyle: "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]",
  },
  {
    id: "sdxl-turbo",
    name: "SDXL Lightning Turbo",
    mode: "text-to-image",
    modeLabel: "Text to Image",
    description: "High-throughput 4-8 step latent diffusion pipeline using SDXL Lightning for near real-time rendering.",
    telemetry: "8 STEPS • EULER • SDXL BASE",
    ratio: "1:1",
    badgeStyle: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  },
  {
    id: "qwen-image-edit",
    name: "Qwen Vision Image Transformation",
    mode: "image-to-image",
    modeLabel: "Image to Image",
    description: "Instruct-based image modification pipeline conditioned on reference input photos and natural language edits.",
    telemetry: "IMAGE INPUT • DENOISE 0.65 • VISION",
    ratio: "1:1",
    badgeStyle: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  {
    id: "ltx-video-animator",
    name: "LTX Video Motion Synthesis",
    mode: "image-to-video",
    modeLabel: "Image to Video",
    description: "Temporal video animation workflow generating smooth 24fps motion clips seeded by a reference starter image.",
    telemetry: "24 FPS • H264 MP4 • TEMPORAL",
    ratio: "16:9",
    badgeStyle: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  },
];

/**
 * 1:1 Mirroring Skeleton for Tool Studio Card (Zero-CLS)
 */
function ToolCardSkeleton({ index }: { index: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 40}ms` }}
      className="relative flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)]"
    >
      <div className="absolute inset-0 shimmer opacity-60" />
      <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-16 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
          <div className="h-5 w-10 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
        </div>
        <div className="h-7 w-7 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 via-50% to-transparent" />
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 space-y-2 pointer-events-none">
        <div className="h-6 w-2/3 rounded-lg bg-white/20 shimmer" />
        <div className="h-4 w-1/3 rounded-md bg-white/10 shimmer mt-1.5" />
      </div>
    </div>
  );
}

function TensorToolCard({
  tool,
  onDelete,
  index = 0,
}: {
  tool: ToolSummary;
  onDelete: (tool: ToolSummary) => void;
  index?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const isVideo = tool.mode.includes("video");
  const thumbUrl = resolveMediaUrl(tool.thumbnail_url);

  return (
    <Link
      href={`/tools/${tool.tool_id}`}
      style={{ animationDelay: `${index * 30}ms` }}
      className="group relative flex aspect-[16/10] w-full flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] transition-all duration-300 ease-out hover:border-[var(--line-strong)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
    >
      {/* Background Shimmer Placeholder while media decodes */}
      {thumbUrl && !imgError && (
        <div
          className={`absolute inset-0 shimmer transition-opacity duration-300 ${
            isLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        />
      )}

      {/* Full-Bleed Media with smooth progressive hydration */}
      {thumbUrl && !imgError ? (
        <img
          src={thumbUrl}
          alt={tool.name}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={() => setImgError(true)}
          className={`asset-zoom-media absolute inset-0 h-full w-full object-cover transition-all duration-500 ease-out group-hover:scale-105 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : (
        <div className="absolute inset-0 grid h-full w-full place-items-center bg-[var(--surface-soft)] p-6 text-center">
          <div className="flex flex-col items-center gap-2 text-[var(--accent)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)]">
              {isVideo ? <Film className="h-6 w-6 opacity-80" /> : <Sparkles className="h-6 w-6 opacity-80" />}
            </div>
            <span className="line-clamp-2 font-mono text-xs font-semibold text-[var(--ink-faint)]">{tool.name}</span>
          </div>
        </div>
      )}

      {/* Top Scrim */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 via-black/25 to-transparent z-[5]" />

      {/* Atmospheric Bottom Gradient Scrim (Persistent for high contrast) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 via-40% to-transparent z-[5]" />

      {/* Floating Top Metadata & Actions */}
      <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between">
        <div className="pointer-events-none flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md">
            {isVideo ? <Film className="h-3 w-3 text-purple-300" /> : <ImageIcon className="h-3 w-3 text-[var(--accent)]" />}
            <span>{isVideo ? "Motion" : "Visual"}</span>
          </span>
          <span className="rounded-full border border-white/15 bg-black/60 px-2.5 py-1 font-mono text-[9px] font-bold text-white/80 backdrop-blur-md">
            {tool.default_aspect_ratio}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(tool);
          }}
          aria-label={`Delete ${tool.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-black/60 text-white/70 opacity-0 backdrop-blur-md transition hover:border-[var(--danger-line)] hover:bg-[var(--danger)] hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bottom Typography Overlay */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5">
        <h3 className="truncate font-sans text-lg sm:text-xl font-bold tracking-tight text-white drop-shadow-sm transition-colors group-hover:text-[var(--accent)]">
          {tool.name}
        </h3>
        <p className="mt-0.5 truncate font-mono text-[10px] tracking-wide text-white/75 drop-shadow-sm uppercase">
          {MODE_LABELS[tool.mode]} {tool.requires_image ? "• IMAGE INPUT" : "• PROMPT DRIVEN"}
        </p>
      </div>
    </Link>
  );
}

export default function ToolStudioPage() {
  const router = useRouter();
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | ToolMode>("all");
  const [toolToDelete, setToolToDelete] = useState<ToolSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Drag & Drop state on the page
  const [isDraggingOverDropzone, setIsDraggingOverDropzone] = useState(false);
  const hiddenFileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("create") === "true") {
        router.push("/tools/create");
      }
    }
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const confirmDelete = async () => {
    if (!toolToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteTool(toolToDelete.tool_id);
      setTools((prev) => prev.filter((t) => t.tool_id !== toolToDelete.tool_id));
      setToolToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete tool");
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getTools()
      .then(setTools)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load tools."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tools.filter(
      (tool) =>
        (mode === "all" || tool.mode === mode) &&
        (!needle || `${tool.name} ${MODE_LABELS[tool.mode]}`.toLowerCase().includes(needle)),
    );
  }, [mode, query, tools]);

  const hasActiveFilters = query.trim() !== "" || mode !== "all";
  const clearFilters = () => {
    setQuery("");
    setMode("all");
  };

  const handleOpenStandardCreate = () => {
    router.push("/tools/create");
  };

  const handleInitializeStarterKit = (kit: StarterKit) => {
    sessionStorage.setItem("st_tool_starter_template", kit.id);
    router.push(`/tools/create?template=${kit.id}`);
  };

  const handleDropWorkflow = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverDropzone(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".json")) {
      try {
        const text = await file.text();
        sessionStorage.setItem("st_tool_upload_json", text);
        sessionStorage.setItem("st_tool_upload_filename", file.name);
        router.push("/tools/create");
      } catch (err) {
        console.error("Failed to read dropped workflow:", err);
      }
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const text = await file.text();
        sessionStorage.setItem("st_tool_upload_json", text);
        sessionStorage.setItem("st_tool_upload_filename", file.name);
        router.push("/tools/create");
      } catch (err) {
        console.error("Failed to read selected workflow:", err);
      }
    }
    e.target.value = "";
  };

  return (
    <main
      id="main-content"
      className="workspace-scroll flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--ground)]"
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 pt-4 pb-6 sm:px-6 sm:pt-6 sm:pb-8 lg:px-8">
        <section className="flex-1 flex flex-col">
        {/* Unified Tactile Command Bar Surface: Mode Filters + Search + Create Tool CTA */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)]/70 backdrop-blur-md p-2.5 shadow-sm mb-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
            {/* Workflow Mode Filter Segmented Control (Wrapping without horizontal scroll) */}
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] p-1 shrink-0 min-h-9">
              {MODE_FILTERS.map((filter) => {
                const active = mode === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMode(filter.value)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all ${
                      active
                        ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_0_12px_var(--accent-ambient)]"
                        : "text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-raised)]"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-1 px-2 py-1 font-mono text-[11px] font-semibold text-[var(--accent)] hover:underline"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 lg:justify-end">
              {/* Ergonomic Search Input */}
              <div className="relative flex-1 min-w-[240px] max-w-md group">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)] group-focus-within:text-[var(--accent)] transition-colors duration-150" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search workflows by name or mode…"
                  aria-label="Search tools"
                  className="h-9 w-full rounded-xl border border-[var(--line-strong)]/40 bg-[var(--surface-sunken)] pl-9 pr-12 text-xs font-mono text-[var(--ink)] placeholder:text-[var(--ink-soft)]/60 outline-none transition-all duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 focus:bg-[var(--surface)]"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors text-xs"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[var(--line-strong)]/60 bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-faint)] group-focus-within:opacity-0 transition-opacity select-none">
                    /
                  </kbd>
                )}
              </div>

              {/* Create AI Tool CTAs */}
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/tools/canvas"
                  className="hidden md:inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-sunken)] px-3 text-xs font-mono font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-[0.98] transition-all"
                  title="Open Interactive Visual Node Canvas"
                >
                  <Activity className="h-4 w-4" />
                  <span>Node Canvas</span>
                </Link>

                <Link
                  href="/tools/create"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_16px_var(--accent-ambient)]"
                  title="Open dedicated AI Tool Studio"
                >
                  <Plus className="h-4 w-4 stroke-[2.5]" />
                  <span>Create AI Tool</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Status Telemetry Strip */}
        <div className="mb-4 mt-1 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent)] font-bold flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]" />
              <span>TELEMETRY</span>
            </span>
            <span className="font-mono text-[11px] text-[var(--ink-faint)]">
              [<span className="text-[var(--ink)] font-bold">{filteredTools.length.toString().padStart(2, "0")}</span> /{" "}
              <span className="text-[var(--ink)]">{tools.length.toString().padStart(2, "0")}</span>] WORKFLOW NODES ACTIVE
              {tools.length === 0 && " // VACANT SHELF"}
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="font-mono text-[11px] font-semibold text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>

        {/* 1. Loading State */}
        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading tools">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item, idx) => (
              <ToolCardSkeleton key={item} index={idx} />
            ))}
          </div>
        )}

        {/* 2. Error Alert */}
        {!loading && error && (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center text-sm text-[var(--danger)]"
          >
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[var(--danger-line)] px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition hover:bg-[var(--danger-line)]/50"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* 3. Empty State with Filter Mismatch */}
        {!loading && !error && filteredTools.length === 0 && hasActiveFilters && (
          <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] p-12 text-center my-auto">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--accent)]">
              <Search className="h-6 w-6 stroke-[1.75]" />
            </div>
            <h3 className="font-sans text-base font-bold text-[var(--ink)]">
              No matching workflows
            </h3>
            <p className="mx-auto mt-1 max-w-sm font-mono text-[11px] text-[var(--ink-faint)] leading-relaxed">
              No workflow tools matched your search query or mode filter. Try adjusting your parameters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 font-mono text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all shadow-[0_0_12px_var(--accent-ambient)]"
            >
              <X className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Clear all filters</span>
            </button>
          </div>
        )}

        {/* 4. Vacant Shelf: 2-Tier Studio Launchpad */}
        {!loading && !error && filteredTools.length === 0 && !hasActiveFilters && (
          <div className="flex-1 flex flex-col justify-center space-y-6 py-2 sm:py-4">
            {/* Hidden JSON file input for manual browsing */}
            <input
              ref={hiddenFileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* TIER 1: Tactile Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOverDropzone(true);
              }}
              onDragLeave={() => setIsDraggingOverDropzone(false)}
              onDrop={handleDropWorkflow}
              className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-all duration-300 ${
                isDraggingOverDropzone
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 scale-[1.01] shadow-[0_0_30px_var(--accent-ambient)]"
                  : "border-[var(--line-strong)] bg-[var(--surface-sunken)]/60 hover:border-[var(--line-strong)] hover:bg-[var(--surface-sunken)]"
              }`}
            >
              <div className="relative z-10 max-w-xl mx-auto space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--accent)] shadow-xl">
                  {isDraggingOverDropzone ? (
                    <FolderDown className="h-7 w-7 text-[var(--accent)] animate-pulse" />
                  ) : (
                    <FileCode2 className="h-7 w-7 stroke-[1.75]" />
                  )}
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-sans text-lg sm:text-xl font-bold tracking-tight text-[var(--ink)]">
                    {isDraggingOverDropzone ? "Drop ComfyUI Workflow JSON" : "Your Workflow Shelf is Ready"}
                  </h3>
                  <p className="font-mono text-xs text-[var(--ink-soft)] leading-relaxed max-w-md mx-auto">
                    Drag & drop any ComfyUI <code className="text-[var(--accent)] font-bold">workflow_api.json</code> to instantly parse inputs, bound parameters, and generate a studio tool.
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => hiddenFileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 font-mono text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_16px_var(--accent-ambient)]"
                  >
                    <UploadCloud className="h-4 w-4" />
                    <span>Import workflow_api.json</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenStandardCreate}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-2.5 font-mono text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    <span>Create Custom Tool</span>
                  </button>
                </div>
              </div>
            </div>

            {/* TIER 2: Quick-Start Preset Kits */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-bold">
                  PRESET STARTER KITS // ONE-CLICK INITIALIZE
                </span>
                <span className="font-mono text-[10px] text-[var(--accent)] font-semibold">
                  Curated Studio Pipelines
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {STARTER_KITS.map((kit) => (
                  <div
                    key={kit.id}
                    className="group relative flex flex-col justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]/70 p-4 transition-all duration-300 hover:border-[var(--accent)]/50 hover:bg-[var(--surface-raised)] hover:shadow-lg space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${kit.badgeStyle}`}>
                          {kit.modeLabel}
                        </span>
                        <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                          {kit.ratio}
                        </span>
                      </div>

                      <h4 className="font-sans text-sm font-bold tracking-tight text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">
                        {kit.name}
                      </h4>

                      <p className="font-sans text-xs text-[var(--ink-soft)] leading-relaxed line-clamp-2">
                        {kit.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[var(--line)]/60 flex items-center justify-between">
                      <span className="font-mono text-[9px] text-[var(--ink-faint)] truncate max-w-[140px]">
                        {kit.telemetry}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleInitializeStarterKit(kit)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-soft)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--ink)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)] transition-colors"
                      >
                        <span>+ Initialize</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 5. Populated Tool Cards Grid */}
        {!loading && !error && filteredTools.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-in fade-in duration-300 ease-out">
            {filteredTools.map((tool, idx) => (
              <TensorToolCard key={tool.tool_id} tool={tool} onDelete={setToolToDelete} index={idx} />
            ))}
          </div>
        )}
      </section>
      </div>

      {/* Footer */}
      <WorkspaceFooter containerClassName="max-w-[1600px]" />

      {/* Deletion Modal */}
      <WorkspaceModal
        open={Boolean(toolToDelete)}
        onClose={() => {
          if (!deleting) {
            setToolToDelete(null);
            setDeleteError(null);
          }
        }}
        destructive
        title="Delete tool permanently?"
        description={
          toolToDelete
            ? `"${toolToDelete.name}" and all associated thumbnails and outputs will be deleted from disk. This action cannot be undone.`
            : ""
        }
        eyebrow="Confirm Deletion"
      >
        <div className="space-y-4">
          {deleteError && (
            <p className="text-xs font-semibold text-[var(--danger)]" role="alert">
              {deleteError}
            </p>
          )}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setToolToDelete(null);
                setDeleteError(null);
              }}
              disabled={deleting}
              className="workspace-action-secondary px-4 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--danger-line)] bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--danger)]/90 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete tool"}
            </button>
          </div>
        </div>
      </WorkspaceModal>
    </main>
  );
}
