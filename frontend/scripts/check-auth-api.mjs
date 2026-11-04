/**
 * Dependency-free assertion check for the auth trust boundary in `api.ts`.
 *
 * Transpiles the real source with the TypeScript compiler already installed and
 * runs it against tiny fetch/localStorage stubs. No framework, no network.
 *
 *   node frontend/scripts/check-auth-api.mjs
 *
 * Exits 0 on success, 1 with the failing assertion otherwise.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));

function loadApi() {
  const sourcePath = resolve(here, "../src/lib/api.ts");
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
      throw new Error(`Unexpected import in check: ${id}`);
    },
    moduleObject,
    moduleObject.exports,
  );
  return moduleObject.exports;
}

/** Minimal Response stand-in for the `request` helper. */
function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    clone() {
      return { json: async () => body };
    },
    json: async () => body,
  };
}

let fetchCalls = 0;
let storageWrites = [];
let nextResponse = jsonResponse(200, {});
let nextReject = null;

globalThis.fetch = async () => {
  fetchCalls += 1;
  if (nextReject) throw nextReject;
  return nextResponse;
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: (key, value) => storageWrites.push([key, value]),
  removeItem: () => {},
};

const { api, ApiError, AUTH_TOKEN_KEY } = loadApi();

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const reset = () => {
  fetchCalls = 0;
  storageWrites = [];
  nextReject = null;
  nextResponse = jsonResponse(200, {});
};

await check("credentials login without a password fails before any fetch", async () => {
  reset();
  await assert.rejects(
    () => api.login({ emailOrUsername: "a@b.co", provider: "credentials" }),
    (error) => error instanceof ApiError && error.status === 400,
  );
  assert.equal(fetchCalls, 0, "must not hit the network without a password");
  assert.equal(storageWrites.length, 0);
});

await check("malformed 2xx login envelope is rejected, no token stored", async () => {
  reset();
  nextResponse = jsonResponse(200, { user: { id: "" } });
  await assert.rejects(
    () => api.login({ emailOrUsername: "a@b.co", password: "secret" }),
    (error) => error instanceof ApiError && error.status === 502,
  );
  assert.equal(fetchCalls, 1);
  assert.equal(storageWrites.length, 0);
});

await check("register with a token but no user id is rejected", async () => {
  reset();
  nextResponse = jsonResponse(201, { access_token: "st_live_x", user: {} });
  await assert.rejects(
    () => api.register({ email: "a@b.co", username: "abc", password: "secret" }),
    (error) => error instanceof ApiError && error.status === 502,
  );
  assert.equal(storageWrites.length, 0);
});

await check("valid login returns the envelope without committing the token", async () => {
  reset();
  nextResponse = jsonResponse(200, {
    access_token: "st_live_token",
    user: { id: "u1", username: "solo", role: "creator", permissions: ["tool:execute"] },
    credits: { balance: 5, daily_allowance: 100 },
  });
  const auth = await api.login({ emailOrUsername: "a@b.co", password: "secret" });
  assert.equal(auth.token, "st_live_token");
  assert.equal(auth.user.id, "u1");
  assert.deepEqual(auth.user.permissions, ["tool:execute"]);
  assert.equal(auth.credits.balance, 5);
  assert.equal(
    storageWrites.some(([key]) => key === AUTH_TOKEN_KEY),
    false,
    "caller owns the token commit",
  );
});

await check("getMe rejects a session response with no user id", async () => {
  reset();
  nextResponse = jsonResponse(200, { access_token: "st_live_token", user: { id: "" } });
  await assert.rejects(
    () => api.getMe(),
    (error) => error instanceof ApiError && error.status === 502,
  );
});

await check("login does not fabricate permissions when the backend omits them", async () => {
  reset();
  nextResponse = jsonResponse(200, {
    access_token: "st_live_token",
    user: { id: "u2", username: "solo" },
  });
  const auth = await api.login({ emailOrUsername: "a@b.co", password: "secret" });
  assert.deepEqual(auth.user.permissions, []);
  assert.equal(auth.credits, null);
});

console.log(`check-auth-api: ${checks} checks passed`);
