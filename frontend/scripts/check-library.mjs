/**
 * Dependency-free check for Library ordering/filtering.
 * Run: node frontend/scripts/check-library.mjs
 */
import assert from "node:assert/strict";
import {
  filterLibrary,
  libraryRequestKey,
  mergeLibraryPage,
  nextLibraryOffset,
  parseLibraryUrl,
  retainLoadedSelection,
  sortLibrary,
} from "../src/lib/assetLibrary.ts";

const items = [
  { key: "b.png", last_modified: "2024-01-02T00:00:00Z", metadata: { tags: ["portrait", "neon"] } },
  { key: "a.png", last_modified: "2024-01-03T00:00:00Z", metadata: { tags: ["portrait"] } },
  { key: "dir/c.png", last_modified: "2024-01-01T00:00:00Z", metadata: { tags: ["neon"] } },
  { key: "z.png", last_modified: null, metadata: null },
];

assert.deepEqual(sortLibrary(items, "newest").map((i) => i.key), ["a.png", "b.png", "dir/c.png", "z.png"]);
assert.deepEqual(sortLibrary(items, "oldest").map((i) => i.key), ["dir/c.png", "b.png", "a.png", "z.png"]);
assert.deepEqual(sortLibrary(items, "name").map((i) => i.key), ["a.png", "b.png", "dir/c.png", "z.png"]);

assert.deepEqual(filterLibrary(items, { query: "A.PNG" }).map((i) => i.key), ["a.png"]);
assert.deepEqual(filterLibrary(items, { tags: ["portrait", "neon"] }).map((i) => i.key), ["b.png"]);
assert.deepEqual(filterLibrary(items, { tags: ["portrait"] }).map((i) => i.key), ["b.png", "a.png"]);
assert.deepEqual(filterLibrary(items, { keys: new Set(["a.png", "z.png"]) }).map((i) => i.key), ["a.png", "z.png"]);
assert.equal(filterLibrary(items, {}).length, 4);
assert.equal(filterLibrary(items, { query: "   " }).length, 4);

// URL state: present params win; absent params stay omitted on first mount so a
// stored fallback can apply, but reset to canonical defaults on history navigation.
assert.deepEqual(parseLibraryUrl("", false), {});
assert.deepEqual(parseLibraryUrl("", true), { query: "", sort: "newest", source: "all", tags: [] });
assert.deepEqual(parseLibraryUrl("?q=x&sort=name", false), { query: "x", sort: "name" });
assert.deepEqual(parseLibraryUrl("?q=x&sort=name", true), {
  query: "x",
  sort: "name",
  source: "all",
  tags: [],
});
assert.deepEqual(parseLibraryUrl("?sort=bogus&source=bogus", true), {
  query: "",
  sort: "newest",
  source: "all",
  tags: [],
});
assert.deepEqual(parseLibraryUrl("?source=workspace&tags=Neon,%20portrait", true), {
  query: "",
  sort: "newest",
  source: "workspace",
  tags: ["neon", "portrait"],
});
assert.deepEqual(parseLibraryUrl("?tag=solo", false), { tags: ["solo"] });

// --- Server-paged helpers ---------------------------------------------------
// Request identity: same visible controls => same key (stale responses can be
// dropped); any change => a different key (a new page is required).
const baseState = { query: "", sort: "newest", source: "all", tags: [], collectionId: null, mediaType: "image" };
assert.equal(
  libraryRequestKey(baseState),
  libraryRequestKey({ ...baseState, tags: [], query: "   " })
);
assert.notEqual(libraryRequestKey(baseState), libraryRequestKey({ ...baseState, query: "neon" }));
assert.notEqual(libraryRequestKey(baseState), libraryRequestKey({ ...baseState, sort: "name" }));
assert.notEqual(libraryRequestKey(baseState), libraryRequestKey({ ...baseState, source: "workspace" }));
assert.notEqual(libraryRequestKey(baseState), libraryRequestKey({ ...baseState, tags: ["neon"] }));
assert.notEqual(libraryRequestKey(baseState), libraryRequestKey({ ...baseState, collectionId: "c1" }));
assert.notEqual(libraryRequestKey(baseState), libraryRequestKey({ ...baseState, mediaType: "video" }));
// Tag order and casing must not create a spurious new request.
assert.equal(
  libraryRequestKey({ ...baseState, tags: ["Neon", "face"] }),
  libraryRequestKey({ ...baseState, tags: ["neon", "face"] })
);
assert.equal(
  libraryRequestKey({ ...baseState, tags: ["neon", "face"] }),
  libraryRequestKey({ ...baseState, tags: ["face", "neon"] })
);

// Merging pages keeps order and never renders a key twice.
assert.deepEqual(mergeLibraryPage([], items).map((i) => i.key), ["b.png", "a.png", "dir/c.png", "z.png"]);
assert.deepEqual(
  mergeLibraryPage([items[0], items[1]], [items[1], items[2]]).map((i) => i.key),
  ["b.png", "a.png", "dir/c.png"]
);
const firstPage = [{ key: "b.png" }, { key: "a.png" }];
assert.equal(mergeLibraryPage(firstPage, firstPage).length, 2);

// Offset advances by the honest received count, and only while more exists.
assert.equal(nextLibraryOffset(0, 24, true), 24);
assert.equal(nextLibraryOffset(24, 10, false), 24);
assert.equal(nextLibraryOffset(24, 0, true), 24);

// Selection pruning keeps only currently loaded keys; unloaded assets are never
// silently selected.
const pruned = retainLoadedSelection(new Set(["a.png", "gone.png"]), items);
assert.deepEqual([...pruned], ["a.png"]);
assert.equal(retainLoadedSelection(new Set(), items).size, 0);

console.log("check-library: 33 checks passed");
