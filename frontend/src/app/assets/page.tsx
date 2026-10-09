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
  Trash2,
} from "lucide-react";
import AssetCard from "@/components/AssetCard";
import EmptyState from "@/components/EmptyState";
import WorkspaceFooter from "@/components/WorkspaceFooter";
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
  const [retryKey, setRetryKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAsset(deleteTarget);
      setAssets((prev) => prev.filter((a) => a.key !== deleteTarget));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete asset");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting]);

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
  }, [origin, retryKey]);

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

  const commitSearch = useCallback(() => {
    setQuery(searchDraft);
    setVisible(PAGE_SIZE);
  }, [searchDraft]);

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
    <main id="main-content" className="assets-root workspace-scroll h-full min-h-0 flex-1 bg-[var(--ground)] antialiased">
      {/* ---------------- Header ---------------- */}
      <header className="workspace-command top-0 z-30 mx-2 mt-2 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_88%,transparent)] backdrop-blur-xl sm:mx-4">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="workspace-kicker">Personal catalog</p>
            <h1 className="workspace-heading mt-1 text-3xl font-semibold tracking-tighter sm:text-4xl">Asset library</h1>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">Browse generated images, motion, and 3D output.</p>
          </div>
          <Link href="/" className="workspace-action-primary inline-flex h-10 shrink-0 items-center gap-2 px-3.5 text-xs font-bold">
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
              className="workspace-field h-11 w-full pl-10 pr-20 text-sm placeholder:text-[var(--ink-faint)]"
            />
            <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 border border-[var(--line)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink-faint)] sm:block">/</kbd>
            {searchDraft && <button type="button" onClick={clearSearch} aria-label="Clear asset search" className="workspace-action-quiet absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center sm:right-14"><span aria-hidden>×</span></button>}
          </div>
        </div>

        <div className="mx-auto max-w-[1600px] px-5 sm:px-6">
          <div aria-label="Asset type" className="flex gap-5">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button key={id} type="button" aria-pressed={active} onClick={() => { setTab(id); setVisible(PAGE_SIZE); }} className={`relative flex shrink-0 items-center gap-2 pb-3 pt-1.5 text-sm font-medium transition-colors focus-visible:text-[var(--accent)] ${active ? "text-[var(--ink)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"}`}>
                  <Icon className={`h-4 w-4 ${active ? "text-[var(--accent)]" : ""}`} />
                  {label}
                  <span className={`border border-[var(--line)] px-1.5 py-0.5 text-[11px] tabular-nums ${active ? "border-[var(--accent)] text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}>{formatCount(counts[id])}</span>
                  <span aria-hidden className={`absolute inset-x-0 -bottom-px h-0.5 bg-[var(--accent)] ${active ? "opacity-100" : "opacity-0"}`} />
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 overflow-x-auto py-3" aria-label="Asset source">
            {(["all", "workspace", "ai_tool_studio"] as const).map((source) => (
              <button key={source} type="button" aria-pressed={origin === source} onClick={() => { setOrigin(source); setVisible(PAGE_SIZE); setLoading(true); setError(null); }} className={`workspace-chip min-h-9 whitespace-nowrap px-3 py-1.5 text-[11px] ${origin === source ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"}`}>
                {source === "all" ? "All sources" : source === "workspace" ? "Workspace" : "AI tools"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ---------------- Grid ---------------- */}
      <section className="workspace-bezel mx-auto mt-4 max-w-[1600px] px-5 pb-[calc(var(--mobile-nav-height)+2rem)] pt-6 sm:px-6 sm:pb-8" aria-label="Asset results">
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-[var(--ink-faint)]">
          <p aria-live="polite">{loading ? "Loading assets…" : `Showing ${formatCount(shown.length)} of ${formatCount(filtered.length)} ${tab === "3d" ? "3D assets" : `${tab}${filtered.length === 1 ? "" : "s"}`}`}</p>
          {!loading && query && <button type="button" onClick={clearSearch} className="workspace-action-quiet min-h-9 px-2 text-xs">Clear search</button>}
        </div>
        {loading ? (
          <div className="masonry" aria-label="Loading assets" aria-busy="true">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div
                key={i}
                className="shimmer workspace-skeleton"
                style={{ height: 280 + ((i * 40) % 120) }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="workspace-empty flex min-h-[420px] flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
            <p className="mt-1.5 text-sm text-[var(--ink-faint)]">Check that the local API is running, then retry.</p>
            <button type="button" onClick={() => { setLoading(true); setError(null); setRetryKey((key) => key + 1); }} className="workspace-action-secondary mt-4 px-3 py-2 text-xs">Try again</button>
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
                  onDelete={() => setDeleteTarget(asset.key)}
                />
              ))}
            </div>
            {filtered.length > shown.length && (
              <div className="mt-6 flex flex-col items-center gap-2 pb-4">
                <p className="text-xs text-[var(--ink-faint)]">Showing {shown.length} of {formatCount(filtered.length)}</p>
                <button type="button" onClick={() => setVisible((value) => value + PAGE_SIZE)} className="workspace-action-primary gap-2 px-5 py-3 text-xs"><ArrowDown className="h-4 w-4" />Load more</button>
              </div>
            )}
          </>
        )}
        <WorkspaceFooter />
      </section>

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ground)]/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger)]">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="delete-dialog-title" className="text-base font-bold text-[var(--ink)]">
                  Delete asset permanently?
                </h3>
                <p className="mt-1 break-all font-mono text-xs text-[var(--ink-faint)]">
                  {deleteTarget}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">
                  This media file and its metadata sidecar will be permanently removed from disk. This action cannot be undone.
                </p>
                {deleteError && (
                  <p className="mt-2 text-xs font-semibold text-[var(--danger)]" role="alert">
                    {deleteError}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--line)] pt-4">
              <button
                type="button"
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleting}
                className="workspace-action-secondary px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--danger-line)] bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white transition hover:bg-[var(--danger)]/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete asset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}