"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { api, type PublicModelSummary } from "@/lib/api";

export default function ModelGalleryPage() {
  const [items, setItems] = useState<PublicModelSummary[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (value = query) => {
    setLoading(true);
    setError(null);
    api.listPublicModels(value).then((response) => setItems(response.items)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load model gallery")).finally(() => setLoading(false));
  };

  useEffect(() => { load(""); }, []);

  const hasQuery = query.trim().length > 0;
  const status = loading ? "Loading models" : error ? "Model gallery unavailable" : `${items.length} model${items.length === 1 ? "" : "s"}${hasQuery ? ` matching “${query}”` : " available"}`;

  return <main id="main-content" className="workspace-scroll h-full min-h-0 flex-1 bg-transparent"><header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_90%,transparent)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-5 sm:px-7"><div><p className="workspace-kicker">Discovery / creator models</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.05em] text-[var(--ink)]">Model gallery</h1></div><Link href="/models" className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-ink)]"><Sparkles className="h-4 w-4" /> Creator studio</Link></div><form onSubmit={(event) => { event.preventDefault(); setQuery(draft); load(draft); }} className="mx-auto max-w-[1600px] px-5 pb-4 sm:px-7"><label htmlFor="model-gallery-search" className="mb-2 block text-xs font-semibold text-[var(--ink)]">Search public models</label><div className="flex gap-3"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" /><input id="model-gallery-search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search by name, type, or tag" className="workspace-field h-11 w-full pl-10 text-sm" /></div><button className="rounded-md border border-[var(--line-strong)] px-4 text-xs font-semibold text-[var(--ink)]">Search</button></div></form></header><section className="mx-auto max-w-[1600px] px-5 py-7 sm:px-7"><p aria-live="polite" className="mb-4 text-xs text-[var(--ink-faint)]">{status}</p>{loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading model results">{[1, 2, 3].map((item) => <div key={item} className="shimmer min-h-[280px] rounded-xl" />)}</div> : error ? <div role="alert" className="border border-[var(--danger-line)] bg-[var(--danger-surface)] p-5 text-sm text-[var(--danger)]"><p>{error}</p><button type="button" onClick={() => load(query)} className="mt-4 rounded-md border border-[var(--danger-line)] px-3 py-2 text-xs font-semibold hover:bg-[var(--danger-surface)]">Retry</button></div> : items.length === 0 ? <div className="border border-dashed border-[var(--line-strong)] p-14 text-center"><p className="text-sm text-[var(--ink)]">{hasQuery ? "No matching public models." : "No public creator models yet."}</p><p className="mt-2 text-xs text-[var(--ink-faint)]">{hasQuery ? "Try a different name, type, or tag." : "Check back when creators publish their models."}</p></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Link key={item.model_id} href={`/models/gallery/${item.model_id}`} className="group overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] transition hover:border-[var(--accent)]"><div className="aspect-[16/10] bg-[var(--surface-soft)]">{item.cover_url ? <img src={item.cover_url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="grid h-full place-items-center text-xs text-[var(--ink-faint)]">No showcase image</div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-[var(--ink)]">{item.title}</h2><p className="mt-1 text-xs text-[var(--ink-faint)]">{item.model_type} · {item.base_model}</p></div><span className="rounded bg-[var(--accent)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--accent)]">{item.category}</span></div><div className="mt-4 flex flex-wrap gap-1.5">{item.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded bg-[var(--surface-soft)] px-2 py-1 text-[10px] text-[var(--ink-faint)]">{tag}</span>)}</div><p className="mt-5 text-[11px] text-[var(--ink-faint)]">{item.version_count} version{item.version_count === 1 ? "" : "s"} · {item.file_count} files · {item.sample_count} samples</p></div></Link>)}</div>}</section></main>;
}
