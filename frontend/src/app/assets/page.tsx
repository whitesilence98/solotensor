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
  Settings,
  Sparkles,
  X,
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
  const [query, setQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<AssetRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getGallery(200)
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
  }, []);

  // "/" focuses search, like every gallery tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setViewer(null);
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
    <div id="main-content" className="assets-root h-full min-h-0 flex-1 overflow-y-auto antialiased">
      {/* ---------------- Header ---------------- */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-3.5">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              ref={searchRef}
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSearch();
              }}
              onBlur={commitSearch}
              placeholder="Search assets by title, creator, or tag..."
              aria-label="Search assets"
              className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-10 pr-16 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors duration-200 ease-in-out hover:border-zinc-700 focus:border-violet-500 focus:bg-zinc-900 focus:ring-4 focus:ring-violet-500/10"
            />
            <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 sm:block">
              /
            </kbd>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              aria-haspopup="menu"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 text-sm font-medium text-zinc-400 transition-colors duration-200 ease-in-out hover:border-zinc-700 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            >
              <Settings className="h-4 w-4 text-zinc-500 transition-colors duration-200 ease-in-out group-hover:text-zinc-300" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            {settingsOpen && (
              <div
                role="menu"
                className="absolute right-0 top-12 w-56 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)]"
              >
                <Link
                  href="/"
                  role="menuitem"
                  onClick={() => setSettingsOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors duration-150 ease-in-out hover:bg-zinc-800"
                >
                  <Sparkles className="h-4 w-4 text-[#d5f06f]" />
                  Open Generator
                </Link>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-zinc-400 transition-colors duration-150 ease-in-out hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <Settings className="h-4 w-4 text-zinc-500" />
                  Storage settings
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---------------- Tabs ---------------- */}
        <div className="mx-auto max-w-[1600px] px-6">
          <nav role="tablist" aria-label="Asset type" className="flex gap-6">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setTab(id);
                    setVisible(PAGE_SIZE);
                  }}
                  className={`relative flex items-center gap-2 pb-3 pt-1.5 text-sm font-medium outline-none transition-colors duration-200 ease-in-out focus-visible:text-[#d5f06f] ${
                    active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-[#d5f06f]" : ""}`} />
                  {label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition-colors duration-200 ease-in-out ${
                      active
                        ? "bg-violet-600/15 text-[#d5f06f]"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {formatCount(counts[id])}
                  </span>
                  <span
                    aria-hidden
                    className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-violet-500 transition-all duration-200 ease-in-out ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ---------------- Grid ---------------- */}
      <main className="mx-auto max-w-[1600px] px-6 pb-28 pt-6">
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
              <p className="mt-2 text-center text-xs text-zinc-600">
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
            className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition-all duration-200 ease-in-out ${
              allLoaded
                ? "pointer-events-none scale-90 opacity-0"
                : "hover:scale-105 hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            }`}
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* ---------------- Lightbox ---------------- */}
      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewer.key}
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 p-4 sm:p-8"
          onClick={() => setViewer(null)}
        >
          <div
            className="flex max-h-full max-w-6xl flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewer.url}
              alt={viewer.key}
              className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="truncate text-xs text-zinc-400">{viewer.key}</span>
              <div className="flex shrink-0 gap-2">
                <a
                  href={viewer.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition-colors duration-200 ease-in-out hover:bg-white/20"
                >
                  Open original
                </a>
                <button
                  type="button"
                  onClick={() => setViewer(null)}
                  className="rounded-lg bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition-colors duration-200 ease-in-out hover:bg-white/20"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}