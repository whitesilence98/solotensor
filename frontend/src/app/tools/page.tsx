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

function TensorToolCard({
  tool,
  onDelete,
}: {
  tool: ToolSummary;
  onDelete: (tool: ToolSummary) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const isVideo = tool.mode.includes("video");
  const thumbUrl = resolveMediaUrl(tool.thumbnail_url);

  return (
    <Link
      href={`/tools/${tool.tool_id}`}
      className="workspace-bezel group relative flex flex-col overflow-hidden p-0 transition-[transform,border-color,box-shadow] duration-[420ms] ease-[cubic-bezier(.32,.72,0,1)] hover:-translate-y-1 hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--surface-soft)]">
        {thumbUrl && !imgError ? (
          <img src={thumbUrl} alt={tool.name} loading="lazy" onError={() => setImgError(true)} className="h-full w-full object-cover transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(.32,.72,0,1)] group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center bg-[var(--surface-soft)] p-6 text-center">
            <div className="flex flex-col items-center gap-2 text-[var(--accent)]">
              <div className="flex h-12 w-12 items-center justify-center border border-[var(--line)] bg-[var(--surface)]">
                {isVideo ? <Film className="h-6 w-6 opacity-80" /> : <Sparkles className="h-6 w-6 opacity-80" />}
              </div>
              <span className="line-clamp-2 text-[11px] font-semibold text-[var(--ink-faint)]">{tool.name}</span>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 border border-[var(--accent)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
            {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {isVideo ? "Motion" : "Visual"}
          </span>
          <span className="border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--ink)]">{tool.default_aspect_ratio}</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(tool);
          }}
          aria-label={`Delete ${tool.name}`}
          className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] opacity-0 transition hover:border-[var(--danger-line)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <div className="absolute inset-x-3 bottom-3 flex translate-y-2 items-center justify-between opacity-0 transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(.32,.72,0,1)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <span className="inline-flex items-center gap-1.5 bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-ink)]"><Zap className="h-3.5 w-3.5" />Launch Tool</span>
          <span className="border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--ink)]">{MODE_LABELS[tool.mode]}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-bold text-[var(--ink)] transition-colors group-hover:text-[var(--accent)]">{tool.name}</h3>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)] group-hover:text-[var(--accent)]" />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-soft)]">{MODE_LABELS[tool.mode]}</span>
            <span className={`border px-2 py-0.5 text-[10px] font-semibold ${tool.requires_image ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-soft)]"}`}>{tool.requires_image ? "Image Input" : "Prompt Driven"}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-3 text-[11px] text-[var(--ink-faint)]">
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" />Added {formatDate(tool.created_at)}</span>
          <span className="font-semibold text-[var(--accent)] group-hover:underline">Open →</span>
        </div>
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
      <header className="workspace-command top-0 z-20 mx-2 mt-2 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_88%,transparent)] backdrop-blur-xl sm:mx-4">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="workspace-kicker">Tool catalog</p>
              <h1 className="workspace-heading mt-1 text-3xl font-semibold tracking-tighter sm:text-4xl">Workflow shelf</h1>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">Reusable generation workflows, ready to run.</p>
            </div>
            <Link href="/tools/create" className="inline-flex items-center gap-2 bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--accent-ink)] transition duration-200 hover:bg-[var(--accent-hover)] active:scale-95"><Plus className="h-4 w-4" />Create New Tool</Link>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools, workflow types, output models…" aria-label="Search tools" className="workspace-field h-11 w-full pl-10 pr-10 text-sm placeholder:text-[var(--ink-faint)]" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)] hover:text-[var(--ink)]"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="workspace-scroll-x flex items-center gap-1.5 pb-1 sm:pb-0">
              {MODE_FILTERS.map((filter) => <button key={filter.value} type="button" aria-pressed={mode === filter.value} onClick={() => setMode(filter.value)} className={`workspace-chip min-h-10 whitespace-nowrap px-3 text-xs ${mode === filter.value ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]"}`}>{filter.label}</button>)}
              {hasActiveFilters && <button type="button" onClick={clearFilters} className="ml-1 whitespace-nowrap text-xs font-semibold text-[var(--accent)] hover:underline">Reset</button>}
            </div>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-[var(--ink-faint)]"><p aria-live="polite">{loading ? "Loading tools…" : `Showing ${filteredTools.length} of ${tools.length} workflow${tools.length === 1 ? "" : "s"}`}</p>{hasActiveFilters && <button type="button" onClick={clearFilters} className="workspace-action-quiet min-h-9 px-2 text-xs">Clear filters</button>}</div>
        {loading && <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading tools">{[1,2,3,4,5,6,7,8].map((item) => <div key={item} className="flex flex-col overflow-hidden border border-[var(--line)] bg-[var(--surface)]"><div className="shimmer aspect-[16/10] w-full" /><div className="space-y-2 p-4"><div className="shimmer h-4 w-3/4" /><div className="shimmer h-3 w-1/2" /></div></div>)}</div>}
        {!loading && error && <div role="alert" className="border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6 text-center text-sm text-[var(--danger)]"><p className="font-semibold">{error}</p><button type="button" onClick={load} className="mt-3 inline-flex items-center gap-1.5 border border-[var(--danger-line)] px-4 py-2 text-xs font-bold transition hover:bg-[var(--danger-line)]/50"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div>}
        {!loading && !error && filteredTools.length === 0 && <div className="border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)] p-12 text-center"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent)]"><Wrench className="h-7 w-7 opacity-70" /></div><h3 className="text-base font-bold text-[var(--ink)]">{hasActiveFilters ? "No matching workflows" : "Your workflow shelf is empty"}</h3><p className="mx-auto mt-1 max-w-sm text-xs text-[var(--ink-faint)]">{hasActiveFilters ? "Try searching with a different keyword or resetting the workflow mode filter." : "Create your first AI Tool by importing a ComfyUI workflow_api.json file."}</p>{hasActiveFilters ? <button type="button" onClick={clearFilters} className="mt-4 bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)]">Clear all filters</button> : <Link href="/tools/create" className="mt-4 inline-block bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-hover)]">Create your first tool</Link>}</div>}
        {!loading && !error && filteredTools.length > 0 && <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredTools.map((tool) => <TensorToolCard key={tool.tool_id} tool={tool} onDelete={setToolToDelete} />)}</div>}
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
