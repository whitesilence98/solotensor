/**
 * Focused, dependency-free checks for owner-scoped media renewal and the
 * progress-relay lifecycle the frontend binds to.
 *
 * Runs the real pure helpers in `src/lib/mediaRenewal.ts`, and the real
 * `refreshAssetMedia` / `openProgressSocket` in the settled `src/lib/api.ts`,
 * against tiny browser stubs. No network, no live engine, no React.
 *
 *   node frontend/scripts/check-progress-media-renewal.mjs
 *
 * Exits 0 on success; 1 with the first failing assertion.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));

// `api.ts` guards token reads and WS base on `window`; provide the minimum a
// browser would, so the real code paths (not SSR fallbacks) are exercised.
globalThis.window = {
  location: { protocol: "http:", hostname: "localhost", href: "http://localhost/" },
};

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

function loadTs(relativePath) {
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
      throw new Error(`Unexpected import in check: ${id}`);
    },
    moduleObject,
    moduleObject.exports,
  );
  return moduleObject.exports;
}

/* -------------------- 1. Pure renewal rules -------------------- */
{
  const {
    isPrivateMedia,
    mediaExpiryMs,
    mediaRenewDelayMs,
    canRetryMediaLoad,
    stableMediaRef,
    needsMediaRefresh,
    fileKeyFromRef,
    MEDIA_RENEW_LEAD_MS,
    MAX_MEDIA_ERROR_RETRIES,
  } = loadTs("src/lib/mediaRenewal.ts");

  assert.equal(isPrivateMedia(null), false, "null is not private");
  assert.equal(isPrivateMedia({}), false, "no flags -> public");
  assert.equal(isPrivateMedia({ is_private: true }), true, "private flag wins");
  assert.equal(
    isPrivateMedia({ url_expires_at: "2026-11-04T12:00:00+00:00" }),
    true,
    "expiry alone marks owner-scoped",
  );

  assert.equal(mediaExpiryMs(null), null, "no expiry -> null");
  assert.equal(mediaExpiryMs("not a date"), null, "garbage expiry -> null");
  const expiry = "2026-11-04T12:00:00+00:00";
  assert.equal(mediaExpiryMs(expiry), Date.parse(expiry), "ISO parsed");

  // Deterministic lead: exactly 60s before expiry, no jitter.
  const now = Date.parse(expiry) - 10 * 60_000;
  assert.equal(
    mediaRenewDelayMs(expiry, now),
    10 * 60_000 - MEDIA_RENEW_LEAD_MS,
    "schedules renewal exactly LEAD before expiry",
  );
  assert.equal(MEDIA_RENEW_LEAD_MS, 60_000, "lead is 60s");
  assert.equal(mediaRenewDelayMs(expiry, Date.parse(expiry) + 5_000), 0, "past expiry renews now");
  assert.equal(mediaRenewDelayMs(null, now), null, "no schedule without expiry");

  assert.equal(canRetryMediaLoad(0), true, "first error may retry");
  assert.equal(canRetryMediaLoad(MAX_MEDIA_ERROR_RETRIES - 1), true, "last allowed retry");
  assert.equal(canRetryMediaLoad(MAX_MEDIA_ERROR_RETRIES), false, "bounded stop");

  assert.equal(stableMediaRef(null), null, "null ref stays null");
  assert.equal(stableMediaRef("data:image/png;base64,AAA"), "data:image/png;base64,AAA", "data URL untouched");
  assert.equal(stableMediaRef("/files/a/b.png"), "/files/a/b.png", "unsigned path untouched");
  assert.equal(
    stableMediaRef("/files/a/b.png?exp=1&sig=deadbeef"),
    "/files/a/b.png",
    "signed /files ref stripped to stable path (credential never persisted)",
  );
  assert.equal(
    stableMediaRef("https://cdn.example/x.png?sig=1"),
    "https://cdn.example/x.png?sig=1",
    "non /files URL untouched",
  );

  // Stored refs: only an unsigned /files/ path needs an authenticated re-resolve.
  assert.equal(needsMediaRefresh("/files/a/b.png"), true, "unsigned /files ref needs refresh");
  assert.equal(needsMediaRefresh("/files/a/b.png?sig=1"), false, "already-signed ref is usable");
  assert.equal(needsMediaRefresh("data:image/png;base64,AAA"), false, "data URL needs no refresh");
  assert.equal(needsMediaRefresh(null), false, "null needs no refresh");
  assert.equal(fileKeyFromRef("/files/run/a.png?sig=1"), "run/a.png", "extracts storage key");
  assert.equal(fileKeyFromRef("data:image/png;base64,AAA"), null, "no key for data URL");
}

/* -------------------- 2. api.ts media refresh -------------------- */
{
  const fetchCalls = [];
  let nextResponse = null;

  globalThis.localStorage = {
    _data: { solotensor_token: "session-A" },
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = value;
    },
    removeItem(key) {
      delete this._data[key];
    },
  };

  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), method: init?.method ?? "GET" });
    return nextResponse;
  };

  const { api } = loadTs("src/lib/api.ts");

  fetchCalls.length = 0;
  nextResponse = jsonResponse(200, {
    key: "run/a.png",
    url: "/files/run/a.png?exp=1&sig=abc",
    url_expires_at: "2026-11-04T12:00:00+00:00",
    thumbnail_url: "/files/run/a_thumb.png?sig=def",
    before_detailer_url: null,
  });
  const media = await api.refreshAssetMedia("run/a.png");
  assert.equal(fetchCalls.length, 1, "one refresh request");
  assert.match(fetchCalls[0].url, /\/api\/v1\/assets\/run\/a\.png\/media$/, "hits the media route");
  assert.match(media.url, /sig=abc/, "returns the signed URL for the browser to load");
  assert.equal(media.url_expires_at, "2026-11-04T12:00:00+00:00", "passes expiry through");
  assert.equal(media.before_detailer_url, null, "preserves absent before-detailer url");
}

/* -------------------- 3. Relay lifecycle -------------------- */
{
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.closed = false;
      this.onopen = null;
      this.onerror = null;
      this.onclose = null;
      this.onmessage = null;
      sockets.push(this);
    }
    close() {
      this.closed = true;
    }
    open() {
      this.onopen?.({});
    }
  }
  globalThis.WebSocket = FakeWebSocket;

  const { api } = loadTs("src/lib/api.ts");
  const ticket = (id, value) =>
    jsonResponse(200, {
      ticket: value,
      client_id: id,
      expires_in_seconds: 30,
      ws_path: "/api/v1/ws/progress",
    });

  // Resolves only after OPEN, no bearer in the URL, server-owned client id.
  globalThis.fetch = async () => ticket("0123456789abcdef0123456789abcdef", "tik_123");
  let settled = false;
  const opening = api.openProgressSocket(() => {}).then((handle) => {
    settled = true;
    return handle;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(sockets.length, 1, "socket constructed after ticket");
  assert.match(sockets[0].url, /\?ticket=tik_123$/, "ticket is the only credential in the URL");
  assert.doesNotMatch(sockets[0].url, /bearer|authorization=/i, "no bearer in the WS URL");
  assert.equal(settled, false, "does not resolve before the relay is OPEN");
  sockets[0].open();
  const handle = await opening;
  assert.equal(handle.clientId, "0123456789abcdef0123456789abcdef", "server-owned client id is returned");
  assert.equal(handle.socket, sockets[0], "returns the live socket");

  // Session change while the ticket is in flight rejects 401, opens no socket.
  let releaseTicket;
  globalThis.localStorage._data.solotensor_token = "session-A";
  globalThis.fetch = () =>
    new Promise((resolveTicket) => {
      releaseTicket = () => resolveTicket(ticket("ffffffffffffffffffffffffffffffff", "tik_stale"));
    });
  const before = sockets.length;
  const staleOpen = api.openProgressSocket(() => {});
  await new Promise((r) => setImmediate(r));
  globalThis.localStorage._data.solotensor_token = "session-B";
  releaseTicket();
  await assert.rejects(staleOpen, (err) => err && err.status === 401, "session swap rejects the relay");
  assert.equal(sockets.length, before, "no socket opened for an abandoned session");

  // Pre-aborted signal rejects 499 and never opens the relay.
  globalThis.localStorage._data.solotensor_token = "session-A";
  const controller = new AbortController();
  controller.abort();
  const abortedOpen = api.openProgressSocket(() => {}, { signal: controller.signal });
  await assert.rejects(abortedOpen, (err) => err && err.status === 499, "abort rejects 499");
  assert.equal(sockets.length, before, "pre-aborted handshake opens no socket");
}

console.log("ok progress-media-renewal");
