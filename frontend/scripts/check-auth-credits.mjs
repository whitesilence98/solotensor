/**
 * Focused credit-scope check for the auth context: a new or ended session must
 * never inherit another account's balance, and a server reply without credits
 * clears stale client state instead of silently keeping it.
 *
 *   node frontend/scripts/check-auth-credits.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const file = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), "../src/lib/auth-context.tsx");
const code = ts.transpileModule(readFileSync(file, "utf8"), {
  fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: "react" },
}).outputText;
const el = (type, props) => ({ type, props: props || {} });
const credits = (balance) => ({ balance, dailyAllowance: 100, nextResetInSeconds: 60, lastClaimedAt: null });

function boot(api, stored) {
  const store = new Map(Object.entries(stored));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const cells = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let ctx = null;
  const cell = (make) => {
    if (cursor >= cells.length) cells.push(make());
    return cells[cursor++];
  };
  const react = {
    createContext: () => ({ Provider: { __ctx: (v) => { ctx = v; } } }),
    useState(init) {
      const c = cell(() => ({ value: typeof init === "function" ? init() : init }));
      return [c.value, (next) => { c.value = typeof next === "function" ? next(c.value) : next; dirty = true; }];
    },
    useEffect(fn, deps) { effects.push({ state: cell(() => ({})), fn, deps }); },
    useCallback(fn) { return cell(() => ({ fn })).fn; },
    useRef(init) { return cell(() => ({ current: init })); },
    // Recompute like React does when a dependency changes; cheap enough here.
    useMemo(fn) { cell(() => ({})); return fn(); },
  };
  const jsx = (type, props) => {
    if (type && type.__ctx) type.__ctx(props.value);
    return el(type, props);
  };
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    exports: mod.exports,
    module: mod,
    require: (id) => {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: Symbol("Fragment") };
      if (id === "./api") return { ...api, api };
      throw new Error(`unexpected import ${id}`);
    },
    localStorage,
    window: { addEventListener() {}, removeEventListener() {}, history: { pushState() {}, replaceState() {} } },
    setInterval: () => 0,
    clearInterval() {},
    setImmediate,
    console,
  }, { filename: file });

  const Provider = mod.exports.AuthProvider;
  assert.equal(typeof Provider, "function", "auth context must export AuthProvider");
  const render = () => { cursor = 0; effects = []; return Provider({ children: null }); };
  const flush = async () => {
    const batch = effects;
    effects = [];
    for (const { state, fn, deps } of batch) {
      if (state.ran && deps && state.deps && deps.every((d, i) => Object.is(d, state.deps[i]))) continue;
      state.ran = true;
      state.deps = deps;
      fn();
    }
    for (let i = 0; i < 5; i += 1) await new Promise(setImmediate);
  };
  const settle = async () => {
    for (let i = 0; i < 60; i += 1) {
      render();
      await flush();
      if (!dirty && ctx && !ctx.isLoading) return;
      dirty = false;
      await new Promise(setImmediate);
    }
    throw new Error("auth provider did not settle");
  };
  return { store, settle, renderOnce: render, flushOnce: flush, value: () => ctx };
}

const baseApi = (overrides) => ({
  getAuthToken: () => null,
  setAuthToken() {},
  ApiError: class extends Error {},
  AUTH_CREDITS_KEY: "st.auth.credits",
  AUTH_USER_KEY: "st.auth.user",
  normalizeRoleName: (r) => r,
  getMe: async () => ({ user: null, credits: null }),
  getPendingModelsReviewQueue: async () => ({ total: 0, items: [] }),
  getUnreadNotificationCount: async () => ({ unread_count: 0 }),
  updateProfile: async (u) => u,
  changePassword: async () => ({ success: true, message: "" }),
  claimDailyEnergy: async () => credits(0),
  forgotPassword: async () => ({ success: true, message: "" }),
  resetPassword: async () => ({ success: true, message: "" }),
  verifyEmail: async () => ({ success: true, message: "" }),
  resendVerification: async () => ({ success: true, message: "" }),
  uploadAvatar: async () => ({ avatar_url: "" }),
  login: async () => ({ token: "t", user: null, credits: null }),
  register: async () => ({ token: "t", user: null, credits: null }),
  ...overrides,
});
const user = { id: "u1", username: "u1" };
const KEY = "st.auth.credits";

const check = async (name, fn) => {
  try { await fn(); console.log(`ok ${name}`); }
  catch (error) { console.error(`FAIL ${name}\n${error.message}`); process.exit(1); }
};

await check("stored credits are not shown when no token exists", async () => {
  const page = boot(baseApi(), { [KEY]: JSON.stringify(credits(42)) });
  await page.settle();
  assert.equal(page.value().credits.balance, 0);
});

await check("successful session without server credits clears the stored balance", async () => {
  const page = boot(baseApi({ getAuthToken: () => "t", getMe: async () => ({ user, credits: null }) }), { [KEY]: JSON.stringify(credits(7)) });
  await page.settle();
  assert.equal(page.value().credits.balance, 0);
  assert.equal(page.store.has(KEY), false);
});

await check("logout resets credits and removes stored credits", async () => {
  const page = boot(baseApi({ getAuthToken: () => "t", getMe: async () => ({ user, credits: credits(5) }) }), {});
  await page.settle();
  assert.equal(page.value().credits.balance, 5, "server balance applies");
  page.value().logout();
  await page.settle();
  assert.equal(page.value().credits.balance, 0);
  assert.equal(page.store.has(KEY), false);
});

await check("login without credits does not inherit the previous balance", async () => {
  const page = boot(baseApi({ getAuthToken: () => "t", getMe: async () => ({ user, credits: credits(9) }), login: async () => ({ token: "t2", user, credits: null }) }), {});
  await page.settle();
  assert.equal(page.value().credits.balance, 9);
  await page.value().login("u2", "pw");
  await page.settle();
  assert.equal(page.value().credits.balance, 0);
  assert.equal(page.store.has(KEY), false);
});

await check("an in-flight getMe from the previous session cannot repopulate after logout", async () => {
  let release;
  const page = boot(baseApi({ getAuthToken: () => "t", getMe: () => new Promise((ok) => { release = () => ok({ user, credits: credits(9) }); }) }), {});
  page.renderOnce();
  await page.flushOnce();
  page.value().logout();
  release();
  await page.settle();
  assert.equal(page.value().user, null, "stale identity must not return");
  assert.equal(page.value().credits.balance, 0, "stale balance must not return");
  assert.equal(page.store.has(KEY), false);
});

console.log("OK 5 auth credit-scope checks passed");
