/**
 * Dependency-free check for Library ordering/filtering.
 * Run: node frontend/scripts/check-library.mjs
 */
import assert from "node:assert/strict";
import { filterLibrary, parseLibraryUrl, sortLibrary } from "../src/lib/assetLibrary.ts";

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

console.log("check-library: 16 checks passed");
