"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, Film, ImageIcon, Plus, RefreshCw, Search, Sparkles, Trash2, Wrench, X, Zap } from "lucide-react";
import { api, resolveMediaUrl, type ToolMode, type ToolSummary } from "@/lib/api";
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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/**
 * 1:1 Mirroring Skeleton for Tool Studio Card (Zero-CLS)
 */
function ToolCardSkeleton({ index }: { index: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 40}ms` }}
      className="relative flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-soft)]"
    >
      {/* Background base shimmer */}
      <div className="absolute inset-0 shimmer opacity-60" />

      {/* Floating Top Metadata & Actions Mirror */}
      <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-16 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
          <div className="h-5 w-10 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
        </div>
        <div className="h-7 w-7 rounded-md border border-white/10 bg-white/10 shimmer backdrop-blur-md" />
      </div>

      {/* Atmospheric Bottom Gradient Scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 via-50% to-transparent" />

      {/* Bottom Typography Overlay Mirror */}
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
      className="group relative flex aspect-[16/10] w-full flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] transition-all duration-300 ease-out hover:border-[var(--line-strong)] hover:shadow-lg"
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
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${
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

      {/* Atmospheric Bottom Gradient Scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 via-50% to-transparent transition-opacity duration-300 ease-out group-hover:opacity-60" />

      {/* Floating Top Metadata & Actions */}
      <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-center justify-between">
        <div className="pointer-events-none flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/50 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md">
            {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {isVideo ? "Motion" : "Visual"}
          </span>
          <span className="rounded-md border border-white/15 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white/80 backdrop-blur-md">
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
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black/50 text-white/70 opacity-0 backdrop-blur-md transition hover:border-[var(--danger-line)] hover:bg-[var(--danger)] hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
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
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | ToolMode>("all");
  const [toolToDelete, setToolToDelete] = useState<ToolSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    api.getTools().then(setTools).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load tools.")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filteredTools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tools.filter((tool) => (mode === "all" || tool.mode === mode) && (!needle || `${tool.name} ${MODE_LABELS[tool.mode]}`.toLowerCase().includes(needle)));
  }, [mode, query, tools]);
  const hasActiveFilters = query.trim() !== "" || mode !== "all";
  const clearFilters = () => { setQuery(""); setMode("all"); };

  return (
    <main id="main-content" className="workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)]">
      <section className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {/* Integrated In-Grid Toolbar: Mode Filters + Search + Create Tool CTA */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
          {/* Workflow Mode Filter Chips */}
          <div className="flex items-center overflow-x-auto pb-0.5 sm:pb-0 gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-0.5 shrink-0 no-scrollbar">
            {MODE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={mode === filter.value}
                onClick={() => setMode(filter.value)}
                className={`rounded-md px-2.5 py-1 font-mono text-[10px] whitespace-nowrap transition-colors ${
                  mode === filter.value
                    ? "border border-[var(--accent)] bg-[var(--accent)]/10 font-bold text-[var(--accent)]"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-raised)]"
                }`}
              >
                {filter.label}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-1 px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--accent)] hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 lg:justify-end">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workflows by name or mode…"
                aria-label="Search tools"
                className="workspace-field h-7.5 w-full pl-8 pr-7 font-mono text-[11px] bg-[var(--surface-sunken)] border border-[var(--line)] rounded-md text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] transition-colors outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Create New Tool CTA */}
            <Link
              href="/tools/create"
              className="inline-flex h-7.5 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all shadow-[0_0_12px_rgba(213,240,111,0.2)]"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Create New Tool ⚡</span>
            </Link>
          </div>
        </div>

        {/* Count Bar */}
        <div className="mb-4 mt-3 flex items-center justify-between gap-3 text-xs text-[var(--ink-faint)]">
          <p aria-live="polite">
            {loading ? "Loading tools…" : `Showing ${filteredTools.length} of ${tools.length} workflow${tools.length === 1 ? "" : "s"}`}
          </p>
          {hasActiveFilters && (
            <button type="button" onClick={clearFilters} className="workspace-action-quiet min-h-6 px-1.5 font-mono text-[10px] text-[var(--accent)] hover:underline">
              Clear filters
            </button>
          )}
        </div>
        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading tools">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item, idx) => (
              <ToolCardSkeleton key={item} index={idx} />
            ))}
          </div>
        )}
        {!loading && error && (
          <div
            role="alert"
            className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center text-sm text-[var(--danger)]"
          >
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--danger-line)] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition hover:bg-[var(--danger-line)]/50"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Retry</span>
            </button>
          </div>
        )}
        {!loading && !error && filteredTools.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--accent)]">
              <Wrench className="h-6 w-6 stroke-[1.75]" />
            </div>
            <h3 className="font-sans text-base font-bold text-[var(--ink)]">
              {hasActiveFilters ? "No matching workflows" : "Your workflow shelf is empty"}
            </h3>
            <p className="mx-auto mt-1 max-w-sm font-mono text-[11px] text-[var(--ink-faint)]">
              {hasActiveFilters
                ? "Try searching with a different keyword or resetting the workflow mode filter."
                : "Create your first AI Tool by importing a ComfyUI workflow_api.json file."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-md bg-[var(--accent)] px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)]"
              >
                Clear all filters
              </button>
            ) : (
              <Link
                href="/tools/create"
                className="mt-4 inline-block rounded-md bg-[var(--accent)] px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)]"
              >
                Create your first tool
              </Link>
            )}
          </div>
        )}
        {!loading && !error && filteredTools.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-in fade-in duration-300 ease-out">
            {filteredTools.map((tool, idx) => (
              <TensorToolCard key={tool.tool_id} tool={tool} onDelete={setToolToDelete} index={idx} />
            ))}
          </div>
        )}
      </section>
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8"><WorkspaceFooter /></div>

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
        description={toolToDelete ? `"${toolToDelete.name}" and all associated thumbnails and outputs will be deleted from disk. This action cannot be undone.` : ""}
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
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--danger)]/90 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete tool"}
            </button>
          </div>
        </div>
      </WorkspaceModal>
    </main>
  );
}
