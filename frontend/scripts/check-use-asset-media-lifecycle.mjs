/**
 * Focused lifecycle checks for `useAssetMedia` — the parts the pure helper
 * check cannot reach.
 *
 * Runs the REAL hook source against a tiny in-file React hook runtime (no
 * renderer dependency, no jsdom), with the API/auth modules stubbed. It asserts
 * the failure modes that only appear once state and effects are involved:
 *
 *   1. A signed URL minted for the previous asset/viewer must never render,
 *      even for the one render before the reset effect runs.
 *   2. A media-load error spends its retry budget BEFORE the request, so a
 *      failing refresh can never loop forever — and success does not refill it.
 *   3. In-flight bookkeeping and the retry budget reset on key/viewer change,
 *      a resolve for a stale identity is ignored, and unmount aborts.
 *
 *   node frontend/scripts/check-use-asset-media-lifecycle.mjs
 *
 * Exits 0 on success; 1 with the first failing assertion.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));

/* -------------------- module loading -------------------- */

function loadTs(relativePath, requireMap) {
  const sourcePath = resolve(here, "..", relativePath);
  const transpiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const moduleObject = { exports: {} };
  new Function("require", "module", "exports", transpiled.outputText)(
    (id) => {
      if (requireMap && Object.prototype.hasOwnProperty.call(requireMap, id)) {
        return requireMap[id];
      }
      throw new Error(`Unexpected import in hook check: ${id}`);
    },
    moduleObject,
    moduleObject.exports,
  );
  return moduleObject.exports;
}

/* -------------------- tiny hook runtime -------------------- */

const depsEqual = (a, b) => {
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
};

// The hook module imports React once; each mount installs its runtime here.
let activeRuntime = null;

const reactStub = {
  useState: (...args) => activeRuntime.useState(...args),
  useRef: (...args) => activeRuntime.useRef(...args),
  useCallback: (...args) => activeRuntime.useCallback(...args),
  useEffect: (...args) => activeRuntime.useEffect(...args),
};

/**
 * Mounts one hook. Hooks are called in the same order every render; effects
 * run after a committed render, and cleanups run before the next setup and on
 * unmount.
 */
function createHarness(renderHook) {
  const hooks = [];
  let cursor = 0;
  let dirty = false;
  let mounted = true;
  let pendingEffects = [];
  let lastOutput;

  const schedule = () => {
    if (mounted) dirty = true;
  };

  const runtime = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) {
        hooks[index] = {
          kind: "state",
          value: typeof initial === "function" ? initial() : initial,
        };
      }
      const slot = hooks[index];
      const setValue = (next) => {
        const resolved = typeof next === "function" ? next(slot.value) : next;
        if (Object.is(resolved, slot.value)) return;
        slot.value = resolved;
        schedule();
      };
      return [slot.value, setValue];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) {
        hooks[index] = { kind: "ref", ref: { current: initial } };
      }
      return hooks[index].ref;
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!(index in hooks)) {
        hooks[index] = { kind: "callback", fn, deps };
      }
      const slot = hooks[index];
      if (!depsEqual(slot.deps, deps)) {
        slot.fn = fn;
        slot.deps = deps;
      }
      return slot.fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!(index in hooks)) {
        hooks[index] = { kind: "effect", deps: undefined, cleanup: undefined };
      }
      pendingEffects.push({ slot: hooks[index], fn, deps });
    },
  };
  activeRuntime = runtime;

  /** Render only: collect effects but do not commit them (pre-effect window). */
  const renderOnly = () => {
    cursor = 0;
    pendingEffects = [];
    lastOutput = renderHook(runtime);
    return lastOutput;
  };

  /** Commit the effects collected by the last render. */
  const commitEffects = () => {
    for (const entry of pendingEffects) {
      const { slot, deps } = entry;
      if (slot.cleanup && !depsEqual(slot.deps, deps)) {
        const cleanup = slot.cleanup;
        slot.cleanup = undefined;
        cleanup();
      }
    }
    for (const entry of pendingEffects) {
      const { slot, fn, deps } = entry;
      if (!depsEqual(slot.deps, deps)) {
        slot.deps = deps;
        slot.cleanup = fn();
      }
    }
  };

  const flush = () => {
    if (!mounted) return lastOutput;
    let guard = 0;
    while (dirty) {
      if (++guard > 100) throw new Error("render loop");
      dirty = false;
      renderOnly();
      commitEffects();
    }
    return lastOutput;
  };

  renderOnly();
  commitEffects();

  return {
    get output() {
      return lastOutput;
    },
    /** Re-render and fully commit; settles state written by effects. */
    render() {
      renderOnly();
      commitEffects();
      return flush();
    },
    /** Render with new props but return the output BEFORE effects run. */
    renderBeforeEffects() {
      return renderOnly();
    },
    async settle() {
      for (let i = 0; i < 8; i += 1) {
        await Promise.resolve();
        flush();
      }
      return lastOutput;
    },
    unmount() {
      mounted = false;
      for (const slot of hooks) {
        if (slot && typeof slot.cleanup === "function") {
          const cleanup = slot.cleanup;
          slot.cleanup = undefined;
          cleanup();
        }
      }
    },
  };
}

/* -------------------- stubbed dependencies -------------------- */

const refreshCalls = [];
let refreshImpl = async () => {
  throw new Error("unexpected refresh");
};
let currentUser = { id: "user-a" };

const fakeApi = {
  refreshAssetMedia(key, signal) {
    refreshCalls.push({ key, signal });
    return refreshImpl(key, signal);
  },
};

const mediaRenewal = loadTs("src/lib/mediaRenewal.ts");
const { useAssetMedia } = loadTs("src/lib/useAssetMedia.ts", {
  react: reactStub,
  "@/lib/api": { api: fakeApi },
  "@/lib/auth-context": { useAuth: () => ({ user: currentUser }) },
  "@/lib/mediaRenewal": mediaRenewal,
});

/** Mount the hook against a mutable item/options pair. */
function mountScenario(initialItem, initialOptions) {
  let item = initialItem;
  let options = initialOptions;
  const harness = createHarness(() => useAssetMedia(item, options));
  return {
    harness,
    setItem(nextItem, nextOptions = options) {
      item = nextItem;
      options = nextOptions;
      return harness.render();
    },
    renderBeforeEffects(nextItem, nextOptions = options) {
      item = nextItem;
      options = nextOptions;
      return harness.renderBeforeEffects();
    },
  };
}

/* -------------------- scenarios -------------------- */

function resetCalls() {
  refreshCalls.length = 0;
}

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((res, rej) => {
    resolvePromise = res;
    rejectPromise = rej;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

const future = () => new Date(Date.now() + 10 * 60_000).toISOString();

const signed = (url, expiresAt = future()) => ({
  key: "run/a.png",
  url,
  url_expires_at: expiresAt,
  thumbnail_url: null,
  before_detailer_url: null,
});

async function main() {
  /* 1. Public media never calls the refresh endpoint. */
  {
    resetCalls();
    const item = { key: "run/public.png", url: "/files/run/public.png" };
    const scenario = mountScenario(item);
    assert.equal(scenario.harness.output.url, item.url, "public asset renders its own URL");
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(refreshCalls.length, 0, "public media triggers no refresh");
    scenario.harness.unmount();
  }

  /* 2. A signed URL must not survive an asset or viewer switch, even for the
        render before the reset effect runs. */
  {
    resetCalls();
    refreshImpl = async () => signed("/files/run/a.png?sig=fresh");
    const item = {
      key: "run/a.png",
      url: "/files/run/a.png?sig=old",
      is_private: true,
      url_expires_at: future(),
    };
    const scenario = mountScenario(item);
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(
      scenario.harness.output.url,
      "/files/run/a.png?sig=fresh",
      "renewed URL renders",
    );

    currentUser = { id: "user-b" };
    const rawViewer = scenario.renderBeforeEffects(item);
    assert.equal(
      rawViewer.url,
      item.url,
      "previous viewer's signed URL is never rendered for the new viewer",
    );
    scenario.harness.render();

    currentUser = { id: "user-a" };
    scenario.harness.render();
    const other = {
      key: "run/b.png",
      url: "/files/run/b.png?sig=other",
      is_private: true,
      url_expires_at: future(),
    };
    const rawAsset = scenario.renderBeforeEffects(other);
    assert.equal(
      rawAsset.url,
      other.url,
      "previous asset's signed URL is never rendered for a different asset",
    );
    scenario.harness.render();
    scenario.harness.unmount();
  }

  /* 3. A failing refresh spends its retry budget before the request, so
        repeated onError cannot loop. */
  {
    resetCalls();
    refreshImpl = async () => {
      throw new Error("media route unavailable");
    };
    const item = {
      key: "run/a.png",
      url: "/files/run/a.png",
      is_private: true,
      url_expires_at: future(),
    };
    const scenario = mountScenario(item);
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(refreshCalls.length, 1, "first error refreshes once");
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(refreshCalls.length, 2, "second error refreshes once more");
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(
      refreshCalls.length,
      2,
      "third error is bounded (failed requests already spent the budget)",
    );
    assert.equal(scenario.harness.output.failed, true, "bounded failure is surfaced");
    assert.equal(scenario.harness.output.state, "error", "state reports error");
    scenario.harness.unmount();
  }

  /* 4. Success does not refill the error budget; a later error still counts. */
  {
    resetCalls();
    let attempt = 0;
    refreshImpl = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("first refresh fails");
      return signed("/files/run/a.png?sig=renewed");
    };
    const item = {
      key: "run/a.png",
      url: "/files/run/a.png",
      is_private: true,
      url_expires_at: future(),
    };
    const scenario = mountScenario(item);
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(refreshCalls.length, 1, "failed error-refresh counts");
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(refreshCalls.length, 2, "successful error-refresh still counts");
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(
      refreshCalls.length,
      2,
      "success did not reset the budget; the bound still holds",
    );
    scenario.harness.unmount();
  }

  /* 5. Changing the asset resets the budget and ignores a late resolve. */
  {
    resetCalls();
    refreshImpl = async () => {
      throw new Error("down");
    };
    const first = {
      key: "run/a.png",
      url: "/files/run/a.png",
      is_private: true,
      url_expires_at: future(),
    };
    const scenario = mountScenario(first);
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(refreshCalls.length, 2, "budget exhausted on the first asset");

    const second = {
      key: "run/b.png",
      url: "/files/run/b.png",
      is_private: true,
      url_expires_at: future(),
    };
    const pending = deferred();
    refreshImpl = () => pending.promise;
    scenario.setItem(second);
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(refreshCalls.length, 3, "new asset gets a fresh retry budget");
    assert.equal(refreshCalls[2].key, "run/b.png", "refresh targets the new asset");

    // Viewer changes while that request is in flight: its result is stale.
    currentUser = { id: "user-b" };
    scenario.setItem(second);
    pending.resolve(signed("/files/run/b.png?sig=stale"));
    await scenario.harness.settle();
    assert.equal(
      scenario.harness.output.url,
      second.url,
      "a resolve for a stale viewer is ignored",
    );
    scenario.harness.unmount();
    currentUser = { id: "user-a" };
  }

  /* 6. Unmount aborts an in-flight refresh. */
  {
    resetCalls();
    const pending = deferred();
    let capturedSignal;
    refreshImpl = (_key, signal) => {
      capturedSignal = signal;
      return pending.promise;
    };
    const item = {
      key: "run/a.png",
      url: "/files/run/a.png",
      is_private: true,
      url_expires_at: future(),
    };
    const scenario = mountScenario(item);
    scenario.harness.output.handleMediaError();
    await scenario.harness.settle();
    assert.equal(capturedSignal.aborted, false, "request is live before unmount");
    scenario.harness.unmount();
    assert.equal(capturedSignal.aborted, true, "unmount aborts the in-flight refresh");
    pending.resolve(signed("/files/run/a.png?sig=late"));
    await scenario.harness.settle();
    assert.equal(
      scenario.harness.output.url,
      item.url,
      "an aborted resolve never paints a URL",
    );
  }

  /* 7. A private asset renews on its own schedule (expiry already inside the
        lead window -> renews immediately). */
  {
    resetCalls();
    refreshImpl = async () => signed("/files/run/a.png?sig=scheduled");
    const item = {
      key: "run/a.png",
      url: "/files/run/a.png?sig=old",
      is_private: true,
      url_expires_at: new Date(Date.now() + 5_000).toISOString(),
    };
    const scenario = mountScenario(item);
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 25));
    await scenario.harness.settle();
    assert.equal(refreshCalls.length, 1, "expiry schedules a renewal");
    assert.equal(
      scenario.harness.output.url,
      "/files/run/a.png?sig=scheduled",
      "scheduled renewal swaps in the fresh URL",
    );
    scenario.harness.unmount();
  }

  console.log("ok use-asset-media-lifecycle");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
