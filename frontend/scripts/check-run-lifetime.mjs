/**
 * Focused account-switch regression for BOTH page lifetimes (studio generate
 * and tool detail): a run's late callbacks and post-await completion must be
 * discarded once the viewer changes, a newer attempt starts, or the page
 * unmounts — and the socket is still closed either way.
 *
 * Exercises the real `isAttemptCurrent` used by both pages through a small
 * model of each page's run flow.
 *
 *   node frontend/scripts/check-run-lifetime.mjs
 *
 * Exits 0 on success; 1 with the first failing assertion. No network, no React.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));

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

const { isAttemptCurrent } = loadTs("src/lib/runGuard.ts");

/**
 * Model of a page that starts a run (handshake -> submit -> await response) and
 * exposes what the viewer would actually see. `closeSocket` is tracked so the
 * assertions can prove a stale attempt still closes its socket.
 */
function createPageModel({ hasHistory, hasGalleryRefresh }) {
  const scope = { mounted: true, viewerId: "user-a", latestAttempt: 0 };
  const view = {
    progress: null,
    progressLabel: "",
    result: null,
    sessionHistory: [],
    galleryRefreshes: 0,
    busy: false,
    error: null,
  };
  const sockets = [];

  function beginRun() {
    const attempt = {
      viewerAtStart: scope.viewerId,
      attempt: ++scope.latestAttempt,
    };
    const socket = {
      closed: false,
      close() {
        this.closed = true;
      },
    };
    sockets.push(socket);
    return {
      attempt,
      socket,
      current: () => isAttemptCurrent(attempt, scope),
    };
  }

  function onProgress(run, event) {
    if (!run.current()) return "ignored";
    view.progress = event;
    view.progressLabel = `node ${event.node ?? ""}`;
    return "applied";
  }

  async function onResponse(run, result) {
    if (!run.current()) {
      run.socket.close();
      return "ignored";
    }
    if (result.status === "completed") {
      view.progress = 100;
      view.progressLabel = "Done";
      if (hasGalleryRefresh) view.galleryRefreshes += 1;
      if (hasHistory) {
        view.result = result;
        view.sessionHistory = [result, ...view.sessionHistory].slice(0, 8);
      }
    } else {
      view.error = result.error ?? `Generation ${result.status}`;
    }
    run.socket.close();
    return "applied";
  }

  async function onReject(run, message) {
    if (!run.current()) {
      run.socket.close();
      return "ignored";
    }
    view.error = message;
    run.socket.close();
    return "applied";
  }

  function finallyWrite(run) {
    if (run.current()) view.busy = false;
    run.socket.close();
  }

  function switchViewer(viewerId) {
    scope.viewerId = viewerId;
    scope.latestAttempt += 1;
    view.progress = null;
    view.progressLabel = "";
    view.result = null;
    view.sessionHistory = [];
    view.error = null;
    view.busy = false;
    for (const socket of sockets) socket.close();
  }

  function unmount() {
    scope.mounted = false;
    scope.latestAttempt += 1;
    for (const socket of sockets) socket.close();
  }

  return {
    scope,
    view,
    sockets,
    beginRun,
    onProgress,
    onResponse,
    onReject,
    finallyWrite,
    switchViewer,
    unmount,
  };
}

async function main() {
  /* ---- Studio page (gallery refresh, no session history) ---- */
  {
    const page = createPageModel({ hasHistory: false, hasGalleryRefresh: true });
    const run = page.beginRun();
    assert.equal(page.onProgress(run, { type: "progress", node: "3" }), "applied", "own progress applies");

    page.switchViewer("user-b");
    assert.equal(page.onProgress(run, { type: "progress", node: "9" }), "ignored", "old viewer progress cannot paint");
    assert.equal(
      await page.onResponse(run, { status: "completed" }),
      "ignored",
      "old viewer's completion is discarded",
    );
    assert.equal(page.view.galleryRefreshes, 0, "stale completion does not refresh the new viewer's gallery");
    assert.equal(page.sockets[0].closed, true, "stale attempt still closes its socket");
    page.finallyWrite(run);
    assert.equal(page.view.busy, false, "stale finally cannot leave the new viewer busy");
  }

  /* ---- Studio page: a fresh run after switch applies normally ---- */
  {
    const page = createPageModel({ hasHistory: false, hasGalleryRefresh: true });
    const stale = page.beginRun();
    page.switchViewer("user-b");
    const fresh = page.beginRun();
    await page.onResponse(stale, { status: "completed" });
    await page.onResponse(fresh, { status: "completed" });
    assert.equal(page.view.galleryRefreshes, 1, "only the current viewer's completion refreshes");
    assert.equal(page.sockets[0].closed, true, "stale socket closed");
    assert.equal(page.sockets[1].closed, true, "fresh socket closed after completion");
  }

  /* ---- Studio page: stale failure must not show an error ---- */
  {
    const page = createPageModel({ hasHistory: false, hasGalleryRefresh: true });
    const run = page.beginRun();
    page.switchViewer("user-b");
    assert.equal(await page.onReject(run, "Request failed"), "ignored", "stale error is dropped");
    assert.equal(page.view.error, null, "no another-account error banner");
  }

  /* ---- Tool page (session history, result) ---- */
  {
    const page = createPageModel({ hasHistory: true, hasGalleryRefresh: false });
    const run = page.beginRun();
    page.switchViewer("user-b");
    assert.equal(
      await page.onResponse(run, { prompt_id: "old", status: "completed" }),
      "ignored",
      "old account's tool result is not shown",
    );
    assert.equal(page.view.result, null, "no stale result card");
    assert.deepEqual(page.view.sessionHistory, [], "stale result absent from the new viewer's history");
    assert.equal(page.sockets[0].closed, true, "stale tool socket closed");

    const fresh = page.beginRun();
    await page.onResponse(fresh, { prompt_id: "new", status: "completed" });
    assert.deepEqual(page.view.sessionHistory.map((r) => r.prompt_id), ["new"], "only current history");
  }

  /* ---- Tool page: switch back to the original account does not revive ---- */
  {
    const page = createPageModel({ hasHistory: true, hasGalleryRefresh: false });
    const run = page.beginRun();
    page.switchViewer("user-b");
    page.switchViewer("user-a");
    assert.equal(
      await page.onResponse(run, { prompt_id: "p1", status: "completed" }),
      "ignored",
      "returning to the same account does not un-stale an in-flight run",
    );
    assert.equal(page.view.result, null);
  }

  /* ---- Unmount ---- */
  {
    const page = createPageModel({ hasHistory: true, hasGalleryRefresh: true });
    const run = page.beginRun();
    page.unmount();
    assert.equal(run.current(), false, "nothing is current after unmount");
    assert.equal(await page.onResponse(run, { prompt_id: "p1", status: "completed" }), "ignored");
    assert.equal(page.view.galleryRefreshes, 0);
    assert.equal(page.sockets[0].closed, true);
  }

  /* ---- Newer attempt supersedes an older one for the same viewer ---- */
  {
    const page = createPageModel({ hasHistory: true, hasGalleryRefresh: true });
    const first = page.beginRun();
    const second = page.beginRun();
    await page.onResponse(first, { prompt_id: "old", status: "completed" });
    await page.onResponse(second, { prompt_id: "new", status: "completed" });
    assert.deepEqual(page.view.sessionHistory.map((r) => r.prompt_id), ["new"]);
    assert.equal(page.view.galleryRefreshes, 1);
  }

  console.log("ok run-lifetime");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
