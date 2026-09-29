"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Box,
  Film,
  ImageIcon,
  Search,
  Sparkles,
} from "lucide-react";
import AssetCard from "@/components/AssetCard";
import EmptyState from "@/components/EmptyState";
import { api, withTypes, type AssetRecord, type AssetType } from "@/lib/api";

const PAGE_SIZE = 24;

const TABS: { id: AssetType; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "video", label: "Videos", icon: Film },
  { id: "3d", label: "3D Assets", icon: Box },
];

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/* ------------------------------------------------------------------ */

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AssetType>("image");
  const [origin, setOrigin] = useState<"all" | "workspace" | "ai_tool_studio">("all");
  const [query, setQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getGallery(200, origin === "all" ? {} : { origin })
      .then((items) => {
        if (!cancelled) setAssets(withTypes(items));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not reach the asset library."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  // "/" focuses search, like every gallery tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const byType = useMemo(() => {
    const counts: Record<AssetType, AssetRecord[]> = { image: [], video: [], "3d": [] };
    for (const a of assets) counts[a.type].push(a);
    return counts;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = byType[tab];
    if (!q) return list;
    return list.filter((a) => a.key.toLowerCase().includes(q));
  }, [byType, tab, query]);

  const shown = filtered.slice(0, visible);
  const allLoaded = visible >= filtered.length;

  const commitSearch = useCallback(() => {
    setQuery(searchDraft);
    setVisible(PAGE_SIZE);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchDraft("");
    setQuery("");
    setVisible(PAGE_SIZE);
  }, []);

  const toggleSaved = useCallback((key: string) => {
    setSavedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const counts: Record<AssetType, number> = {
    image: byType.image.length,
    video: byType.video.length,
    "3d": byType["3d"].length,
  };

  return (
    <div id="main-content" className="assets-root workspace-scroll h-full min-h-0 flex-1 antialiased">
      {/* ---------------- Header ---------------- */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="workspace-kicker">Library / local outputs</p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-[-.04em] text-[var(--ink)] sm:text-2xl">Asset library</h1>
          </div>
          <Link href="/" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[.55rem] bg-[var(--accent)] px-3.5 text-xs font-bold text-[var(--accent-ink)] transition hover:bg-[#e2f88a] active:scale-[.97]">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">New render</span>
          </Link>
        </div>
        <div className="mx-auto flex max-w-[1600px] gap-4 px-5 pb-3 sm:px-6">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
            <input
              ref={searchRef}
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitSearch(); }}
              onBlur={commitSearch}
              placeholder="Search local filenames…"
              aria-label="Search local filenames"
              className="workspace-field h-11 w-full pl-10 pr-16 text-sm placeholder:text-[var(--ink-faint)]"
            />
            <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink-faint)] sm:block">/</kbd>
          </div>
        </div>

        <div className="mx-auto max-w-[1600px] px-5 sm:px-6">
          <nav role="tablist" aria-label="Asset type" className="flex gap-5">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button key={id} role="tab" aria-selected={active} onClick={() => { setTab(id); setVisible(PAGE_SIZE); }} className={`relative flex shrink-0 items-center gap-2 pb-3 pt-1.5 text-sm font-medium transition-colors focus-visible:text-[var(--accent)] ${active ? "text-[var(--ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"}`}>
                  <Icon className={`h-4 w-4 ${active ? "text-[var(--accent)]" : ""}`} />
                  {label}
                  <span className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${active ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]" : "bg-[var(--surface-soft)] text-[var(--ink-faint)]"}`}>{formatCount(counts[id])}</span>
                  <span aria-hidden className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--accent)] ${active ? "opacity-100" : "opacity-0"}`} />
                </button>
              );
            })}
          </nav>
          <div className="flex gap-2 overflow-x-auto py-3" aria-label="Asset source">
            {(["all", "workspace", "ai_tool_studio"] as const).map((source) => (
              <button key={source} type="button" onClick={() => { setOrigin(source); setVisible(PAGE_SIZE); setLoading(true); setError(null); }} className={`whitespace-nowrap rounded-[.4rem] border px-3 py-1.5 text-[11px] font-medium transition-colors ${origin === source ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"}`}>
                {source === "all" ? "All sources" : source === "workspace" ? "Workspace" : "AI tools"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ---------------- Grid ---------------- */}
      <main className="mx-auto max-w-[1600px] px-5 pb-8 pt-6 sm:px-6">
        {loading ? (
          <div className="masonry" aria-label="Loading assets" aria-busy="true">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div
                key={i}
                className="shimmer shimmer-dark rounded-xl"
                style={{ height: 180 + ((i * 67) % 160) }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-red-900/50 bg-red-950/30 px-6 text-center">
            <p className="text-sm font-medium text-red-300">{error}</p>
            <p className="mt-1.5 text-sm text-red-400/70">
              Check that the FastAPI backend is running on port 8000.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          query ? (
            <EmptyState kind="image" onClearSearch={clearSearch} />
          ) : (
            <EmptyState kind={tab} />
          )
        ) : (
          <>
            <div className="masonry">
              {shown.map((asset) => (
                <AssetCard
                  key={asset.key}
                  asset={asset}
                  saved={savedKeys.has(asset.key)}
                  onBookmark={() => toggleSaved(asset.key)}
                  onOpen={() => router.push(`/assets/${asset.key.split("/").map(encodeURIComponent).join("/")}`)}
                />
              ))}
            </div>
            {filtered.length > shown.length && (
              <p className="mt-2 text-center text-xs text-[var(--ink-faint)]">
                Showing {shown.length} of {formatCount(filtered.length)}
              </p>
            )}
          </>
        )}
      </main>

      {/* ---------------- FAB ---------------- */}
      {!loading && !error && filtered.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            disabled={allLoaded}
            aria-label={allLoaded ? "All assets loaded" : "Load more assets"}
              className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-[.55rem] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_12px_28px_-12px_rgba(213,240,111,.55)] transition-all duration-200 ease-in-out ${
                allLoaded
                  ? "pointer-events-none scale-90 opacity-0"
                  : "hover:scale-105 hover:bg-[#e2f88a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              }`}
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        </div>
      )}

    </div>
  );
}