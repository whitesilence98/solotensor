/**
 * Pure Library URL/page helpers. Kept free of React and `@/lib/api` so it can
 * be exercised with Node type stripping (`frontend/scripts/check-library.mjs`).
 *
 * Ordering, search, tag, source, collection and media-type filtering are all
 * executed by the server (`GET /api/v1/gallery/me`) so they cover the full
 * visible owner dataset, not just the rows already loaded in the browser.
 * `sortLibrary`/`filterLibrary` remain as pure reference implementations.
 */

export type LibrarySort = "newest" | "oldest" | "name";
export type LibrarySource = "all" | "workspace" | "ai_tool_studio";
export type LibraryMediaType = "image" | "video" | "3d";

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

// ---------------------------------------------------------------------------
// Server-paged Library helpers
// ---------------------------------------------------------------------------

/** The complete filter identity of one Library request. */
export interface LibraryQueryState {
  query?: string;
  sort?: LibrarySort;
  source?: LibrarySource;
  tags?: readonly string[];
  collectionId?: string | null;
  mediaType?: LibraryMediaType;
}

const DEFAULT_SORT: LibrarySort = "newest";
const DEFAULT_SOURCE: LibrarySource = "all";

/**
 * Stable identity for the active query. Every async page response is tagged
 * with the key it was requested under; when the key no longer matches the
 * current controls the response is stale and must be discarded (covers filter
 * changes and history navigation that happen mid-flight).
 */
export function libraryRequestKey(state: LibraryQueryState): string {
  // Tag order/duplicates do not change "all" semantics, so normalize them to
  // avoid a spurious refetch when the same set is re-activated in another order.
  const tags = Array.from(
    new Set(
      (state.tags ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();
  return JSON.stringify({
    q: (state.query ?? "").trim(),
    sort: state.sort ?? DEFAULT_SORT,
    source: state.source ?? DEFAULT_SOURCE,
    tags,
    collection: state.collectionId ?? null,
    mediaType: state.mediaType ?? null,
  });
}

/**
 * Appends one page to the rows already on screen, de-duplicating by key so an
 * overlapping/shifted offset can never render the same asset twice. Order is
 * preserved (server order, then new rows).
 */
export function mergeLibraryPage<T extends LibraryItem>(
  current: readonly T[],
  incoming: readonly T[]
): T[] {
  if (current.length === 0) return incoming.slice();
  const seen = new Set(current.map((item) => item.key));
  const merged = current.slice();
  for (const item of incoming) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    merged.push(item);
  }
  return merged;
}

/**
 * Selections are only meaningful for rows the user can currently see. When the
 * filters change, keep the intersection with the loaded set instead of silently
 * carrying hidden selections into a bulk action.
 */
export function retainLoadedSelection(
  selected: ReadonlySet<string>,
  loadedItems: readonly LibraryItem[]
): Set<string> {
  const loaded = new Set(loadedItems.map((item) => item.key));
  const next = new Set<string>();
  for (const key of selected) {
    if (loaded.has(key)) next.add(key);
  }
  return next;
}

/**
 * Offset to request next. `items.length` is the honest count the server
 * returned, so a page that skipped nothing still advances correctly.
 */
export function nextLibraryOffset(
  offset: number,
  received: number,
  hasMore: boolean
): number {
  if (!hasMore || received <= 0) return offset;
  return offset + received;
}
