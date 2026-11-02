/**
 * Dependency-free assertion check for the related-posts pagination logic.
 *
 * The helpers live in the "use client" component, so the check transpiles that
 * exact source with the TypeScript compiler already present in node_modules and
 * evaluates it against tiny stubs for react/next/lucide. No test framework, no
 * network, no browser:
 *
 *   node frontend/scripts/check-related-posts.mjs
 *
 * Exits 0 on success, 1 with the failing assertion otherwise.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));

/** Transpile one component source and evaluate it against tiny module stubs. */
function loadComponent(relativePath, stubs) {
  const sourcePath = resolve(here, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });
  const moduleObject = { exports: {} };
  const localRequire = (id) => {
    if (!(id in stubs)) throw new Error(`Unexpected import in check: ${id}`);
    return stubs[id];
  };
  // eslint-disable-next-line no-new-func
  new Function("require", "module", "exports", transpiled.outputText)(
    localRequire,
    moduleObject,
    moduleObject.exports
  );
  return moduleObject.exports;
}

const reactStub = {
  useRef: () => ({ current: null }),
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useCallback: (fn) => fn,
  useId: () => "related-posts-check",
  createElement: () => null,
  default: {},
};

const {
  mergeRelatedItems,
  shouldApplyResponse,
  computeRelatedPageOutcome,
  VARIANT_CLASSES,
  shouldObserveRelated,
  shouldRenderRelatedFooter,
  relatedAssetPath,
} = loadComponent("../src/components/RelatedPostsSection.tsx", {
  react: reactStub,
  "next/navigation": { useRouter: () => ({ push: () => {} }) },
  "lucide-react": { Images: null, Loader2: null, RefreshCw: null },
  "@/components/AssetCardList": { AssetCardList: () => null },
  "@/lib/api": { api: {} },
});

const { overlayTransition } = loadComponent("../src/components/AssetDetailOverlay.tsx", {
  react: reactStub,
  "lucide-react": { X: null },
  "@/components/WorkspaceModal": { default: () => null },
  "@/components/AssetInspectionStage": { default: () => null },
  "@/components/RelatedPostsSection": { default: () => null },
  "@/lib/auth-context": { useAuth: () => ({ isAuthenticated: false }) },
  "@/lib/api": {},
});

let checks = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const item = (key) => ({ key, url: `/files/${key}`, size: 1, last_modified: "", metadata: null });

// --- dedupe ---------------------------------------------------------------

check("mergeRelatedItems drops duplicate keys and keeps order", () => {
  const merged = mergeRelatedItems([item("a"), item("b")], [item("b"), item("c"), item("a")]);
  assert.deepEqual(merged.map((i) => i.key), ["a", "b", "c"]);
});

check("mergeRelatedItems tolerates a malformed item", () => {
  const merged = mergeRelatedItems([item("a")], [null, { url: "x" }, item("b")]);
  assert.deepEqual(merged.map((i) => i.key), ["a", "b"]);
});

// --- stale response guard -------------------------------------------------

check("stale sequence or anchor is rejected", () => {
  assert.equal(shouldApplyResponse(2, 3, "k", "k"), false);
  assert.equal(shouldApplyResponse(3, 3, "old", "new"), false);
  assert.equal(shouldApplyResponse(3, 3, "k", "k"), true);
});

// --- pagination -----------------------------------------------------------

check("page 1 replaces the list (fresh anchor, even if base is stale)", () => {
  const out = computeRelatedPageOutcome(1, [item("old")], {
    items: [item("a"), item("b")],
    total: 2,
    total_pages: 1,
    has_more: false,
  });
  assert.deepEqual(out.items.map((i) => i.key), ["a", "b"]);
  assert.equal(out.total, 2);
  assert.equal(out.hasMore, false);
});

check("sequential pages append without duplicates", () => {
  const first = computeRelatedPageOutcome(1, [], {
    items: [item("a"), item("b")],
    total: 4,
    total_pages: 2,
    has_more: true,
  });
  assert.equal(first.hasMore, true);
  const second = computeRelatedPageOutcome(2, first.items, {
    items: [item("b"), item("c"), item("d")],
    total: 4,
    total_pages: 2,
    has_more: false,
  });
  assert.deepEqual(second.items.map((i) => i.key), ["a", "b", "c", "d"]);
  assert.equal(second.hasMore, false);
  assert.equal(second.total, 4);
});

check("a no-progress page terminates paging even when has_more is true", () => {
  const page = computeRelatedPageOutcome(2, [item("a")], {
    items: [item("a")],
    total: 99,
    total_pages: 9,
    has_more: true,
  });
  assert.equal(page.progressed, false);
  assert.equal(page.hasMore, false);
});

check("an empty first page stops paging (no auto-fetch loop)", () => {
  const page = computeRelatedPageOutcome(1, [], {
    items: [],
    total: 0,
    total_pages: 1,
    has_more: true,
  });
  assert.equal(page.hasMore, false);
  assert.equal(page.total, 0);
});

check("last page never advertises more even with stale has_more", () => {
  const page = computeRelatedPageOutcome(3, [], {
    items: [item("z")],
    total: 25,
    total_pages: 3,
    has_more: true,
  });
  assert.equal(page.hasMore, false);
});

check("total is never lower than the number of rendered items", () => {
  const page = computeRelatedPageOutcome(1, [], {
    items: [item("a"), item("b")],
    total: 0,
    total_pages: 1,
    has_more: false,
  });
  assert.equal(page.total, 2);
});

check("page variant keeps the standalone layout classes verbatim", () => {
  assert.equal(
    VARIANT_CLASSES.page,
    "mt-10 shrink-0 border-t border-[var(--line)] pt-8"
  );
});

check("panel variant is a framed card, not a borderless band", () => {
  assert.match(VARIANT_CLASSES.panel, /^mt-3 /);
  assert.match(VARIANT_CLASSES.panel, /rounded-\[var\(--radius-panel\)\]/);
  assert.match(VARIANT_CLASSES.panel, /border border-\[var\(--line-strong\)\]/);
  assert.match(VARIANT_CLASSES.panel, /bg-\[var\(--surface-raised\)\]/);
  assert.doesNotMatch(VARIANT_CLASSES.panel, /border-t|pt-6|pt-8|mt-6|mt-10/);
});

check("panel framing sits flush with the stage card", () => {
  assert.doesNotMatch(VARIANT_CLASSES.panel, /(^|\s)(px|mx)-/);
});

check("router fallback still encodes one segment per key part", () => {
  assert.equal(relatedAssetPath("outputs/a b.png"), "/assets/outputs/a%20b.png");
});

// --- observer gating ------------------------------------------------------

check("guest never constructs the observer", () => {
  assert.equal(shouldObserveRelated(false, "idle", true), false);
  assert.equal(shouldObserveRelated(false, "ready", true), false);
});

check("stopped pages do not observe", () => {
  assert.equal(shouldObserveRelated(true, "error", true), false);
  assert.equal(shouldObserveRelated(true, "ready", false), false);
});

check("active pages observe", () => {
  assert.equal(shouldObserveRelated(true, "idle", false), true);
  assert.equal(shouldObserveRelated(true, "ready", true), true);
});

check("panel footer hides when it has no status to show", () => {
  assert.equal(shouldRenderRelatedFooter("panel", true, "ready", 0, 0, false), false);
  assert.equal(shouldRenderRelatedFooter("panel", true, "error", 0, 0, false), false);
  assert.equal(shouldRenderRelatedFooter("panel", true, "loading", 0, 0, false), false);
});

check("panel footer shows whenever there is real status", () => {
  assert.equal(shouldRenderRelatedFooter("panel", true, "idle", 0, 0, true), true);
  assert.equal(shouldRenderRelatedFooter("panel", true, "loading", 6, 12, false), true);
  assert.equal(shouldRenderRelatedFooter("panel", true, "ready", 6, 12, false), true);
});

check("page footer and guest keep their existing behaviour", () => {
  assert.equal(shouldRenderRelatedFooter("page", true, "ready", 0, 0, false), true);
  assert.equal(shouldRenderRelatedFooter("panel", false, "ready", 6, 12, false), false);
});

// --- overlay swap, scroll reset, focus ------------------------------------

check("first open resets scroll but never steals the modal's focus", () => {
  const first = overlayTransition(null, "a");
  assert.deepEqual(first, { resetScroll: true, focusScroller: false });
});

check("in-place swap resets scroll and focuses the scroller", () => {
  const swap = overlayTransition("a", "b");
  assert.deepEqual(swap, { resetScroll: true, focusScroller: true });
});

check("same key does nothing", () => {
  assert.deepEqual(overlayTransition("a", "a"), {
    resetScroll: false,
    focusScroller: false,
  });
});

check("closing does not focus the scroller", () => {
  assert.deepEqual(overlayTransition("a", null), {
    resetScroll: true,
    focusScroller: false,
  });
});

console.log(`OK ${checks} checks passed`);
