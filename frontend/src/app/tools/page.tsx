"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Clock3,
  Film,
  ImageIcon,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from "lucide-react";
import { api, type ToolMode, type ToolSummary } from "@/lib/api";
import WorkspaceFooter from "@/components/WorkspaceFooter";

const MODE_LABELS: Record<ToolMode, string> = {
  "text-to-image": "Text to image",
  "image-to-image": "Image to image",
  "text-to-video": "Text to video",
  "image-to-video": "Image to video",
};

const MODE_FILTERS: Array<{ value: "all" | ToolMode; label: string }> = [
  { value: "all", label: "All workflows" },
  { value: "text-to-image", label: "Text to image" },
  { value: "image-to-image", label: "Image to image" },
  { value: "text-to-video", label: "Text to video" },
  { value: "image-to-video", label: "Image to video" },
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function ToolVisual({ tool }: { tool: ToolSummary }) {
  return (
    <div className="relative h-32 overflow-hidden bg-[var(--ground)] sm:h-36">
      {tool.thumbnail_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={tool.thumbnail_url} alt="" className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]" />
      ) : (
        <div className="relative grid h-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(6,182,212,.16),transparent_42%),var(--surface-sunken)]">
          <Sparkles className="relative h-8 w-8 text-[var(--accent)]/70" strokeWidth={1.4} />
          <span className="absolute bottom-3 left-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--ink-faint)]">No preview</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--ground)]/75 via-transparent to-transparent" />
      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--accent)]">
        {tool.mode.includes("video") ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
        {tool.mode.includes("video") ? "Motion" : "Visual"}
      </span>
    </div>
  );
}

function ToolMeta({ tool }: { tool: ToolSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[var(--ink-soft)]">
      <span className="text-[var(--accent)]">{MODE_LABELS[tool.mode]}</span>
      <span className="h-1 w-1 rounded-full bg-[var(--line-strong)]" />
      <span>{tool.default_aspect_ratio} canvas</span>
      <span className="h-1 w-1 rounded-full bg-[var(--line-strong)]" />
      <span>{tool.requires_image ? "Image input" : tool.has_prompt ? "Prompt ready" : "Prompt locked"}</span>
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolSummary }) {
  return (
    <Link
      href={`/tools/${tool.tool_id}`}
      className="group grid overflow-hidden rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:grid-cols-[13rem_minmax(0,1fr)]"
    >
      <ToolVisual tool={tool} />
      <div className="flex min-w-0 flex-col justify-between gap-5 p-4 sm:p-5">
        <div>
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="min-w-0 truncate text-base font-semibold tracking-[-.04em] text-[var(--ink)] sm:text-lg">{tool.name}</h2>
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-faint)] transition duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
          </div>
          <ToolMeta tool={tool} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3 text-[10px] text-[var(--ink-faint)]">
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" /> Added {formatDate(tool.created_at)}</span>
          <span className="font-mono uppercase tracking-[.12em] text-[var(--ink-soft)]">Open workflow</span>
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getTools()
      .then(setTools)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load tools."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredTools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesMode = mode === "all" || tool.mode === mode;
      const matchesQuery = !needle || `${tool.name} ${MODE_LABELS[tool.mode]}`.toLowerCase().includes(needle);
      return matchesMode && matchesQuery;
    });
  }, [mode, query, tools]);

  return (
    <main id="main-content" className="h-full overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_84%_0%,rgba(6,182,212,.06),transparent_28rem)] px-4 py-5 pb-6 md:px-8 md:py-8 md:pb-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[var(--line)] pb-7">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[var(--accent)]"><Wrench className="h-3.5 w-3.5" /> Workflow shelf</div>
            <h1 className="text-4xl font-semibold tracking-[-.065em] text-[var(--ink)] md:text-6xl">AI tools, ready to run.</h1>
            <p className="mt-4 max-w-[58ch] text-sm leading-6 text-[var(--ink-soft)]">Reusable ComfyUI workflows with only the controls you want to expose. Pick a tool, set its inputs, and render.</p>
          </div>
          <Link href="/tools/create" className="workspace-action-primary inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-bold active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"><Plus className="h-4 w-4" /> New tool</Link>
        </header>

        <section className="border-b border-[var(--line)] py-4" aria-label="Tool filters">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[14rem] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
              <span className="sr-only">Search tools</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows" className="workspace-field h-10 w-full pl-9 pr-3 text-sm placeholder:text-[var(--ink-faint)]" />
            </label>
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1" aria-label="Filter by workflow type">
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" />
              {MODE_FILTERS.map((filter) => <button key={filter.value} type="button" aria-pressed={mode === filter.value} onClick={() => setMode(filter.value)} className={`whitespace-nowrap rounded-[var(--radius-control)] border px-3 py-2 text-[11px] font-semibold transition duration-200 active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${mode === filter.value ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"}`}>{filter.label}</button>)}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-[.16em] text-[var(--ink-faint)]"><span>{loading ? "Loading shelf" : `${filteredTools.length} ${filteredTools.length === 1 ? "workflow" : "workflows"}`}</span><span className="font-mono">{tools.length.toString().padStart(2, "0")} total</span></div>
        </section>

        <section className="pt-6" aria-live="polite">
          {loading ? (
            <div className="grid gap-3" aria-label="Loading tools" aria-busy="true"><div className="shimmer h-56" /><div className="grid gap-3 sm:grid-cols-2"><div className="shimmer h-48" /><div className="shimmer h-48" /></div></div>
          ) : error ? (
            <div role="alert" className="border border-[var(--danger-line)] bg-[var(--danger-surface)] p-6"><div className="flex gap-3 text-sm text-[var(--danger)]"><AlertCircle className="h-5 w-5 shrink-0" /><p>{error}</p></div><button type="button" onClick={load} className="mt-5 inline-flex items-center gap-2 border border-[var(--danger-line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--danger-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--danger)]"><RefreshCw className="h-3.5 w-3.5" /> Try again</button></div>
          ) : tools.length === 0 ? (
            <div className="grid min-h-72 place-items-center border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center"><div><Wrench className="mx-auto mb-4 h-8 w-8 text-[var(--ink-faint)]" /><h2 className="text-xl font-semibold tracking-[-.03em] text-[var(--ink)]">Your shelf is empty.</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--ink-soft)]">Add a ComfyUI API workflow to turn a repeatable graph into a focused tool.</p><Link href="/tools/create" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]"><Plus className="h-4 w-4" /> Create your first tool</Link></div></div>
          ) : !filteredTools.length ? (
            <div className="grid min-h-56 place-items-center border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-8 text-center"><div><Search className="mx-auto mb-4 h-7 w-7 text-[var(--ink-faint)]" /><h2 className="text-lg font-semibold text-[var(--ink)]">No matching workflows.</h2><p className="mt-2 text-sm text-[var(--ink-soft)]">Try another name or workflow type.</p><button type="button" onClick={() => { setQuery(""); setMode("all"); }} className="mt-4 text-sm font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">Clear filters</button></div></div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredTools.map((tool) => <ToolRow key={tool.tool_id} tool={tool} />)}
            </div>
          )}
        </section>
        <WorkspaceFooter />
      </div>
    </main>
  );
}
