/**
 * Dependency-free regression check for homepage per-source loading.
 * Transpiles the real `src/app/page.tsx` and runs it against a tiny hook runtime:
 * Featured stays mounted while its source loads or fails, one failing source
 * keeps the rest, retry refetches only the failed source.
 *
 *   node frontend/scripts/check-home-sections.mjs [path-to-page.tsx]
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const file = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(fileURLToPath(import.meta.url)), "../src/app/page.tsx");
const code = ts.transpileModule(readFileSync(file, "utf8"), {
  fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: "react" },
}).outputText;
const el = (type, props) => ({ type, props: props || {} });

// Minimal hook runtime: state cells, dependency-checked effects, one Component.
function runtime() {
  const cells = [];
  let cursor = 0, effects = [], dirty = false;
  const cell = (make) => { if (cursor >= cells.length) cells.push(make()); return cells[cursor++]; };
  return {
    render(Component) { cursor = 0; effects = []; return Component({}); },
    async flush() {
      const batch = effects;
      effects = [];
      for (const { state, fn, deps } of batch) {
        if (state.ran && deps && state.deps && deps.every((d, i) => Object.is(d, state.deps[i]))) continue;
        state.ran = true; state.deps = deps;
        if (state.clean) state.clean();
        const out = fn();
        state.clean = typeof out === "function" ? out : null;
      }
      await new Promise(setImmediate);
    },
    dispose() { cells.forEach((c) => c.clean && c.clean()); cells.length = 0; effects = []; cursor = 0; dirty = false; },
    react: {
      useState(init) {
        const c = cell(() => ({ value: typeof init === "function" ? init() : init }));
        return [c.value, (next) => { c.value = typeof next === "function" ? next(c.value) : next; dirty = true; }];
      },
      useEffect(fn, deps) { effects.push({ state: cell(() => ({})), fn, deps }); },
      useCallback(fn) { cell(() => ({})); return fn; },
    },
    async settle(Component) {
      for (let i = 0; i < 40; i += 1) {
        this.render(Component);
        await this.flush();
        if (!dirty) return;
        dirty = false;
      }
      throw new Error("homepage did not settle");
    },
  };
}

const walk = (node, visit) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!node || typeof node !== "object" || !node.type) return;
  visit(node);
  if (typeof node.type === "function") return walk(node.type(node.props), visit);
  walk(node.props.children, visit);
};
const find = (tree, pred) => { const out = []; walk(tree, (n) => pred(n) && out.push(n)); return out; };
const text = (n) => (typeof n === "string" || typeof n === "number" ? String(n)
  : Array.isArray(n) ? n.map(text).join(" ") : n && n.props ? text(n.props.children) : "");
const has = (tree, name) => find(tree, (n) => n.type === name);
const retry = (tree, label) => find(tree, (n) => n.type === "button" && n.props["aria-label"] === `Retry ${label}`)[0];

// Each mount gets its own runtime, so a test's hook cells never leak into the next.
function mount() {
  const rt = runtime();
  const calls = {}, pending = {};
  const source = (key) => () => {
    calls[key] = (calls[key] || 0) + 1;
    let ok, no;
    const promise = new Promise((a, b) => { ok = a; no = b; });
    (pending[key] ||= []).push({ ok, no });
    return promise;
  };
  const api = { getAssets: source("assets"), getPublicModels: source("models"), getTools: source("tools"), listSelectableModels: source("selectable") };
  const component = (name) => ({ default: name });
  const stubs = {
    react: rt.react,
    "react/jsx-runtime": { jsx: el, jsxs: el, Fragment: Symbol("Fragment") },
    "lucide-react": { RotateCcw: () => null },
    "@/lib/api": { api, withTypes: (items) => items },
    "@/components/HomePromoCarousel": component("HomePromoCarousel"),
    "@/components/HomeFeaturedTools": component("HomeFeaturedTools"),
    "@/components/HomeModelsSection": component("HomeModelsSection"),
    "@/components/HomePostsSection": component("HomePostsSection"),
    "@/components/AssetDetailOverlay": component("AssetDetailOverlay"),
    "@/components/WorkspaceFooter": component("WorkspaceFooter"),
  };
  const moduleObject = { exports: {} };
  vm.runInNewContext(code, {
    exports: moduleObject.exports, module: moduleObject, setImmediate, console,
    require: (id) => { if (!(id in stubs)) throw new Error(`unexpected import ${id}`); return stubs[id]; },
    window: { addEventListener() {}, removeEventListener() {}, history: { pushState() {}, replaceState() {} } },
  }, { filename: file });
  const Page = moduleObject.exports.default;
  assert.equal(typeof Page, "function", "homepage must export a component");
  return { rt, Page, calls, ok: (k, v) => pending[k].at(-1).ok(v), fail: (k) => pending[k].at(-1).no(new Error(k)) };
}

const check = async (name, fn) => {
  try { await fn(); }
  catch (error) { console.error(`FAIL ${name}\n${error.message}`); process.exit(1); }
};

await check("Featured stays mounted while its source is loading or failed", async () => {
  for (const outcome of ["ok", "fail"]) {
    const page = mount();
    page.rt.render(page.Page);
    await page.rt.flush();
    assert.equal(has(page.rt.render(page.Page), "HomeFeaturedTools").length, 1, "Featured must render while loading");
    page[outcome]("tools", []);
    page.ok("assets", []); page.ok("models", { items: [] }); page.ok("selectable", []);
    await page.rt.settle(page.Page);
    const tree = page.rt.render(page.Page);
    assert.ok(has(tree, "HomeFeaturedTools")[0], `Featured must stay mounted on tools ${outcome}`);
    assert.ok(outcome === "ok" || retry(tree, "tools"), "tools failure offers retry");
    page.rt.dispose();
  }
});

await check("partial failure keeps successful sections and retries only the failed one", async () => {
  const page = mount();
  page.rt.render(page.Page);
  await page.rt.flush();
  page.fail("assets");
  page.ok("models", { items: [{ model_id: "m1" }] });
  page.ok("tools", [{ tool_id: "t1" }]);
  page.ok("selectable", [{ model_id: "s1" }]);
  await page.rt.settle(page.Page);
  let tree = page.rt.render(page.Page);
  assert.deepEqual(has(tree, "HomeFeaturedTools")[0].props.tools.map((t) => t.tool_id), ["t1"]);
  assert.equal(has(tree, "HomePostsSection").length, 0, "failed empty section hidden");
  assert.equal(has(tree, "HomeModelsSection")[0].props.loading, false);
  assert.ok(retry(tree, "assets"), "failed source offers retry");
  assert.equal(find(tree, (n) => n.type === "p" && /Could not load assets/.test(text(n))).length, 1);

  retry(tree, "assets").props.onClick();
  await page.rt.settle(page.Page);
  assert.deepEqual(page.calls, { assets: 2, models: 1, tools: 1, selectable: 1 }, "retry refetches only assets");
  page.ok("assets", [{ key: "a1" }]);
  await page.rt.settle(page.Page);
  tree = page.rt.render(page.Page);
  assert.deepEqual(has(tree, "HomePostsSection")[0].props.assets.map((a) => a.key), ["a1"]);
  page.rt.dispose();
});

console.log("OK 2 homepage section checks passed");
