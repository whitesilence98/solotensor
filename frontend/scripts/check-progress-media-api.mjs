/**
 * Dependency-free assertions for the progress relay and private-media contract
 * in `src/lib/api.ts`.
 *
 * Covers:
 * - `POST /api/v1/ws/ticket` is bearer-authenticated and the WS URL carries
 *   the ticket in the query (never the session bearer).
 * - `openProgressSocket` resolves only after OPEN, and rejects on timeout,
 *   abort, close-before-open and a session-token swap during the handshake.
 * - An already-aborted signal short-circuits before any HTTP or WebSocket work,
 *   and the signal is forwarded to the ticket request.
 * - `refreshAssetMedia` forwards an AbortSignal.
 * - `getMyGalleryPage` serializes the offset-gallery contract and normalizes
 *   media URLs; `getMyGallery` stays a backward-compatible flat list.
 *
 *   node frontend/scripts/check-progress-media-api.mjs
 *
 * Exits 0 on success, 1 with the failing assertion. No network, no browser.
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

let token = "token-alpha";
globalThis.localStorage = {
  getItem: (key) => (key === "solotensor_token" ? token : null),
  setItem: () => {},
  removeItem: () => {},
};
globalThis.window = { location: { protocol: "http:", hostname: "localhost" } };

const sockets = [];
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.closed = false;
    this.onopen = null;
    this.onerror = null;
    this.onclose = null;
    this.onmessage = null;
    sockets.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  fail() {
    this.onerror?.();
  }
}
globalThis.WebSocket = FakeSocket;

let fetchCalls = [];
let mediaCalls = [];
globalThis.fetch = async (url, init = {}) => {
  const path = String(url);
  if (path.includes("/api/v1/ws/ticket")) {
    fetchCalls.push({ path, init });
    return {
      ok: true,
      status: 200,
      statusText: "200",
      clone() {
        return { json: async () => ({}) };
      },
      json: async () => ({
        ticket: "tkt-single-use",
        client_id: "a".repeat(32),
        expires_in_seconds: 30,
        ws_path: "/api/v1/ws/progress",
      }),
    };
  }
  if (path.includes("/api/v1/gallery/me")) {
    const url = new URL(path, "http://localhost");
    fetchCalls.push({ path, init, search: url.searchParams });
    return {
      ok: true,
      status: 200,
      statusText: "200",
      clone() {
        return { json: async () => ({}) };
      },
      json: async () => ({
        items: [
          {
            key: "u/p/a.png",
            url: "http://localhost:8000/files/u/p/a.png?cap=x",
            size: 1,
            last_modified: "2026-11-04T12:00:00+00:00",
            thumbnail_url: "http://localhost:8000/files/u/p/a.png?w=1",
          },
        ],
        total: 3,
        offset: 0,
        limit: 1,
        has_more: true,
      }),
    };
  }
  if (path.includes("/media")) {
    mediaCalls.push({ path, init });
    return {
      ok: true,
      status: 200,
      statusText: "200",
      clone() {
        return { json: async () => ({}) };
      },
      json: async () => ({
        key: "u/p/a.png",
        url: "http://localhost:8000/files/u/p/a.png?cap=x",
        url_expires_at: "2026-11-04T12:00:00+00:00",
      }),
    };
  }
  throw new Error(`Unexpected fetch: ${path}`);
};

const { api, ApiError } = loadApi();

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exit(1);
  }
}

function reset() {
  token = "token-alpha";
  fetchCalls = [];
  mediaCalls = [];
  sockets.length = 0;
}

await check("ticket request is bearer-authenticated; WS query has ticket only", async () => {
  reset();
  const pending = api.openProgressSocket(() => {});
  // Let the ticket fetch settle, then open the socket.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchCalls.length, 1);
  const { init } = fetchCalls[0];
  assert.equal(init.method, "POST");
  assert.equal(init.headers.get("Authorization"), "Bearer token-alpha");

  const socket = sockets[0];
  const url = new URL(socket.url);
  assert.equal(url.pathname, "/api/v1/ws/progress");
  assert.equal(url.searchParams.get("ticket"), "tkt-single-use");
  assert.equal(url.searchParams.has("token"), false);
  assert.equal(socket.url.includes("token-alpha"), false, "session bearer must never be in the WS URL");

  socket.open();
  const { clientId } = await pending;
  assert.equal(clientId, "a".repeat(32));
});

await check("ticket request forwards the caller's abort signal", async () => {
  reset();
  const controller = new AbortController();
  const pending = api.openProgressSocket(() => {}, { signal: controller.signal });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].init.signal,
    controller.signal,
    "the ticket HTTP request must observe the caller's signal",
  );
  sockets[0].open();
  await pending;
});

await check("a pre-aborted signal sends no HTTP and opens no socket", async () => {
  reset();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => api.openProgressSocket(() => {}, { signal: controller.signal }),
    (error) => error instanceof ApiError && error.status === 499,
  );
  assert.equal(fetchCalls.length, 0, "must not request a ticket for a cancelled caller");
  assert.equal(sockets.length, 0, "must not open a relay socket for a cancelled caller");
});

await check("an abort during the ticket request rejects with 499, not a raw AbortError", async () => {
  reset();
  const controller = new AbortController();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    controller.abort();
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  };
  try {
    await assert.rejects(
      () => api.openProgressSocket(() => {}, { signal: controller.signal }),
      (error) => error instanceof ApiError && error.status === 499,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sockets.length, 0);
});

await check("openProgressSocket does not resolve before OPEN", async () => {
  reset();
  let resolved = false;
  const pending = api.openProgressSocket(() => {}).then((value) => {
    resolved = true;
    return value;
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(resolved, false, "must not resolve while the socket is CONNECTING");
  sockets[0].open();
  await pending;
  assert.equal(resolved, true);
});

await check("handshake timeout rejects and closes the socket", async () => {
  reset();
  const pending = api.openProgressSocket(() => {}, { timeoutMs: 5 });
  await new Promise((r) => setTimeout(r, 0));
  await assert.rejects(
    () => pending,
    (error) => error instanceof ApiError && error.status === 504,
  );
  assert.equal(sockets[0].closed, true);
});

await check("abort rejects, closes the socket and stops later events", async () => {
  reset();
  const controller = new AbortController();
  const pending = api.openProgressSocket(() => {}, { signal: controller.signal });
  await new Promise((r) => setTimeout(r, 0));
  controller.abort();
  await assert.rejects(
    () => pending,
    (error) => error instanceof ApiError && error.status === 499,
  );
  assert.equal(sockets[0].closed, true);
  assert.equal(sockets[0].onopen, null, "handlers must be detached after abort");
});

await check("session token swap during handshake rejects and closes", async () => {
  reset();
  const pending = api.openProgressSocket(() => {});
  await new Promise((r) => setTimeout(r, 0));
  token = "token-beta";
  sockets[0].open();
  await assert.rejects(
    () => pending,
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(sockets[0].closed, true);
});

await check("close before open rejects", async () => {
  reset();
  const pending = api.openProgressSocket(() => {});
  await new Promise((r) => setTimeout(r, 0));
  sockets[0].onclose?.();
  await assert.rejects(
    () => pending,
    (error) => error instanceof ApiError && error.status === 502,
  );
});

await check("refreshAssetMedia forwards the abort signal", async () => {
  reset();
  const controller = new AbortController();
  await api.refreshAssetMedia("u/p/a.png", controller.signal);
  assert.equal(mediaCalls.length, 1);
  assert.equal(mediaCalls[0].init.signal, controller.signal);
});

await check("owner gallery page serializes the offset contract", async () => {
  reset();
  const controller = new AbortController();
  const page = await api.getMyGalleryPage(
    {
      offset: -5,
      limit: 9999,
      q: "  neon cat ",
      sort: "oldest",
      source: "ai_tool_studio",
      media_type: "video",
      tags: [" a ", "", "b"],
      tag_mode: "any",
      collection_id: "col-1",
      tag: " hero ",
      origin: "generation",
      tool_id: "tool-1",
      tool_type: "image",
    },
    controller.signal
  );

  assert.equal(page.total, 3);
  assert.equal(page.has_more, true);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].url, "/files/u/p/a.png?cap=x");
  assert.equal(page.items[0].thumbnail_url, "/files/u/p/a.png?w=1");

  const { init, search } = fetchCalls[0];
  assert.equal(init.method, undefined, "gallery page is a GET");
  assert.equal(init.signal, controller.signal);
  assert.equal(search.get("offset"), "0", "negative offsets clamp to 0");
  assert.equal(search.get("limit"), "500", "limit clamps to the server cap");
  assert.equal(search.get("q"), "neon cat");
  assert.equal(search.get("sort"), "oldest");
  assert.equal(search.get("source"), "ai_tool_studio");
  assert.equal(search.get("media_type"), "video");
  assert.equal(search.get("collection_id"), "col-1");
  assert.equal(search.get("tag"), "hero");
  assert.equal(search.get("tag_mode"), "any");
  assert.equal(search.get("tags"), "a,b");
  assert.equal(search.get("origin"), "generation");
});

await check("owner gallery page omits defaults and stays backward compatible", async () => {
  reset();
  const items = await api.getMyGallery(10);
  assert.equal(fetchCalls.length, 1);
  const { search } = fetchCalls[0];
  assert.equal(search.get("offset"), "0");
  assert.equal(search.get("limit"), "10");
  assert.equal(search.has("sort"), false, "newest is the server default");
  assert.equal(search.has("source"), false, "all is the server default");
  assert.equal(search.has("tag_mode"), false, "all is the server default");
  assert.equal(items.length, 1, "getMyGallery still returns a flat array");
  assert.equal(items[0].url, "/files/u/p/a.png?cap=x");
});

console.log(`OK ${checks} checks`);
