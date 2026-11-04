import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/lib/useEngineStatus.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
let effect;
let cleanup;
let state;
let request;
const requests = [];
const timers = new Map();
const listeners = new Map();
const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
const react = {
  createContext: () => ({ Provider: "provider" }), createElement: () => null,
  useContext: () => null, useEffect: (fn) => { effect = fn; },
  useRef: (value) => ({ current: value }),
  useState: (value) => { state = value; return [value, (next) => { state = typeof next === "function" ? next(state) : next; }]; },
};
const module = { exports: {} };
vm.runInNewContext(compiled, {
  exports: module.exports, module, document, AbortController,
  setTimeout: (fn, delay) => { timers.set(fn, delay); return fn; }, clearTimeout: (id) => timers.delete(id),
  require: (name) => name === "react" ? react : { api: { health: (signal) => { request = {}; requests.push({ signal, request }); return new Promise((resolve, reject) => Object.assign(request, { resolve, reject })); } } },
}, { filename: resolve("src/lib/useEngineStatus.ts") });
const { generationBlockReason, enginePollDelay, EngineStatusProvider } = module.exports;
const ready = { status: "ok", comfy: "up", storage: "up", database: "sqlite", database_status: "up" };
assert.equal(generationBlockReason(null), null, "unknown must not block");
assert.equal(generationBlockReason(ready), null);
assert.equal(generationBlockReason({ ...ready, database_status: undefined }), null, "database driver is not health");
for (const field of ["comfy", "storage", "database_status"]) assert.ok(generationBlockReason({ ...ready, [field]: "down" }));
assert.deepEqual([0, 1, 2, 20].map(enginePollDelay), [30000, 60000, 120000, 120000]);
EngineStatusProvider({ children: null });
cleanup = effect();
assert.equal(requests.length, 1);
const first = request;
document.hidden = true;
listeners.get("visibilitychange")();
assert.equal(requests[0].signal.aborted, true);
first.resolve({ ...ready, comfy: "down" });
await new Promise(setImmediate);
assert.equal(state.health, null, "hidden stale responses cannot publish");
assert.equal(timers.size, 0);
document.hidden = false;
listeners.get("visibilitychange")();
request.resolve(ready);
await new Promise(setImmediate);
assert.equal(state.health, ready);
assert.ok([...timers.values()].includes(30000));
const poll = [...timers.entries()].find(([, delay]) => delay === 30000)[0];
poll();
request.reject(new Error("offline"));
await new Promise(setImmediate);
assert.equal(state.unreachable, true);
assert.equal(state.health, null, "failed probe cannot indefinitely block from stale health");
assert.ok([...timers.values()].includes(60000));
const nextPoll = [...timers.entries()].find(([, delay]) => delay === 60000)[0];
nextPoll();
const finalRequest = request;
cleanup();
finalRequest.resolve({ ...ready, comfy: "down" });
await new Promise(setImmediate);
assert.equal(state.health, null, "unmounted stale responses cannot publish");
assert.equal(timers.size, 0);
assert.equal(listeners.size, 0);
console.log("Engine status checks passed");
