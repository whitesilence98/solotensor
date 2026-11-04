/**
 * Pure Library ordering/filtering. Kept free of React and `@/lib/api` so it can
 * be exercised with Node type stripping (`frontend/scripts/check-library.mjs`).
 * Filtering is client-side over the already-loaded (<=500) gallery page.
 */

export type LibrarySort = "newest" | "oldest" | "name";
export type LibrarySource = "all" | "workspace" | "ai_tool_studio";

export const LIBRARY_SORT_VALUES: readonly LibrarySort[] = ["newest", "oldest", "name"];
export const LIBRARY_SOURCE_VALUES: readonly LibrarySource[] = [
  "all",
  "workspace",
  "ai_tool_studio",
];

export interface LibraryUrlState {
  query?: string;
  sort?: LibrarySort;
  source?: LibrarySource;
  tags?: string[];
}

/**
 * Reads the library's URL state. Fields absent from the URL are omitted so the
 * initial mount can keep an approved stored fallback. On history navigation
 * (`resetMissing`), absent fields resolve to canonical defaults instead — a bare
 * `/assets` must not keep filtering by parameters its URL no longer carries.
 */
export function parseLibraryUrl(search: string, resetMissing: boolean): LibraryUrlState {
  const query = search.includes("?") ? search.slice(search.indexOf("?") + 1) : search;
  const params = new URLSearchParams(query);
  const next: LibraryUrlState = {};

  const q = params.get("q");
  if (q !== null) next.query = q;
  else if (resetMissing) next.query = "";

  const sort = params.get("sort");
  if (sort && (LIBRARY_SORT_VALUES as readonly string[]).includes(sort)) {
    next.sort = sort as LibrarySort;
  } else if (resetMissing) next.sort = "newest";

  const source = params.get("source");
  if (source && (LIBRARY_SOURCE_VALUES as readonly string[]).includes(source)) {
    next.source = source as LibrarySource;
  } else if (resetMissing) next.source = "all";

  const tag = params.get("tag");
  const tags = params.get("tags");
  if (tags !== null || tag !== null) {
    next.tags = (tags ?? tag ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  } else if (resetMissing) next.tags = [];

  return next;
}

export interface LibraryItem {
  key: string;
  last_modified?: string | null;
  metadata?: { tags?: string[] | null } | null;
}

function filename(key: string): string {
  const base = key.split("/").pop() ?? key;
  return base.toLowerCase();
}

function timestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** Newest first, oldest first, or filename A→Z. Unknown dates sort last. */
export function sortLibrary<T extends LibraryItem>(
  items: readonly T[],
  sort: LibrarySort
): T[] {
  const indexed = items.map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    if (sort === "name") {
      const byName = filename(a.item.key).localeCompare(filename(b.item.key));
      return byName !== 0 ? byName : a.index - b.index;
    }
    const at = timestamp(a.item.last_modified);
    const bt = timestamp(b.item.last_modified);
    if (at === bt) return a.index - b.index;
    if (at === Number.NEGATIVE_INFINITY) return 1;
    if (bt === Number.NEGATIVE_INFINITY) return -1;
    return sort === "newest" ? bt - at : at - bt;
  });
  return indexed.map(({ item }) => item);
}

export interface LibraryFilter {
  query?: string;
  /** Every tag must be present (matches the existing tag rail semantics). */
  tags?: readonly string[];
  /** Asset keys, e.g. the active collection. `null`/undefined means no filter. */
  keys?: ReadonlySet<string> | null;
}

export function filterLibrary<T extends LibraryItem>(
  items: readonly T[],
  { query = "", tags = [], keys = null }: LibraryFilter
): T[] {
  const needle = query.trim().toLowerCase();
  const wanted = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  return items.filter((item) => {
    if (keys && !keys.has(item.key)) return false;
    if (needle && !item.key.toLowerCase().includes(needle)) return false;
    if (wanted.length > 0) {
      const own = (item.metadata?.tags ?? []).map((tag) => tag.toLowerCase());
      if (!wanted.every((tag) => own.includes(tag))) return false;
    }
    return true;
  });
}
