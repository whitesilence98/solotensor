/**
 * Focused check for actionable error presentation.
 *
 * Verifies that a failed request is classified honestly from its HTTP status:
 * 401 offers sign-in through the existing modal, 403 explains permissions
 * without pretending access can be granted, 404 points at re-selecting the
 * missing reference (or going back for a missing tool), and an unreachable
 * engine offers a health recheck — never an automatic re-submission of a job.
 *
 *   node frontend/scripts/check-actionable-error.mjs
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

const { classifyError, classifyThrown, isApiErrorLike } = loadTs(
  "src/lib/actionableError.ts",
);

const apiMessage = (status) => `Request failed with status ${status}`;

// --- 401: expired session -> sign in again --------------------------------
{
  const result = classifyError({ status: 401, message: "Not authenticated" });
  assert.equal(result.action, "sign-in");
  assert.equal(result.message, "Not authenticated");
  assert.match(result.guidance, /sign in/i);
}

// --- 403: permission guidance, never a fake unlock ------------------------
{
  const result = classifyError({ status: 403, message: "Forbidden" });
  assert.equal(result.action, "permissions");
  assert.match(result.guidance, /cannot be granted/i);
  assert.doesNotMatch(result.guidance, /unlock|bypass|elevate/i);
}

// --- 404: reference vs tool context --------------------------------------
{
  const reference = classifyError({ status: 404, message: "Not found" });
  assert.equal(reference.action, "reselect");
  assert.match(reference.guidance, /re-select/i);

  const tool = classifyError({
    status: 404,
    message: "Not found",
    context: "tool",
  });
  assert.equal(tool.action, "reselect");
  assert.match(tool.guidance, /tools list/i);
  assert.notEqual(tool.guidance, reference.guidance);
}

// --- offline engine: health recheck, NOT an automatic paid re-submit ------
{
  const result = classifyError({ message: "fetch failed", engineOffline: true });
  assert.equal(result.action, "recheck-engine");
  assert.match(result.guidance, /recheck/i);
  assert.match(result.guidance, /not re-submitted/i);
  assert.doesNotMatch(result.guidance, /retrying|resubmitting automatically/i);
}

// --- an HTTP status explains the failure before the offline flag ----------
{
  const result = classifyError({
    status: 401,
    message: "Not authenticated",
    engineOffline: true,
  });
  assert.equal(result.action, "sign-in");
}

// --- a real HTTP error is never relabeled from a stale offline probe ------
{
  // 422 validation is a bad request, not an unreachable engine.
  const validation = classifyError({
    status: 422,
    message: "seed: Input should be a valid integer",
    engineOffline: true,
  });
  assert.equal(validation.action, null);
  assert.equal(validation.guidance, null);
  assert.equal(validation.message, "seed: Input should be a valid integer");

  for (const status of [400, 409, 429, 500, 502, 503]) {
    const result = classifyError({
      status,
      message: apiMessage(status),
      engineOffline: true,
    });
    assert.equal(result.action, null, `status ${status} must keep its own error`);
    assert.equal(result.message, apiMessage(status));
  }

  // Context flags must not turn a status-carrying error into reselect advice.
  const tool500 = classifyError({
    status: 500,
    message: "Graph failed",
    context: "tool",
  });
  assert.equal(tool500.action, null);
}

// --- network failure (no status) still gets the health recheck ------------
{
  // fetch rejected -> no ApiError, no status.
  const offline = classifyError({ message: "fetch failed", engineOffline: true });
  assert.equal(offline.action, "recheck-engine");

  // Clients that use status 0 for "no response" behave the same.
  const zero = classifyError({ status: 0, message: "Network error", engineOffline: true });
  assert.equal(zero.action, "recheck-engine");
  assert.match(zero.guidance, /recheck/i);

  // Non-finite status values are treated as "no status", not a real HTTP code.
  assert.equal(
    classifyError({ status: Number.NaN, message: "offline", engineOffline: true }).action,
    "recheck-engine",
  );

  // Network failure with a healthy probe stays a plain, honest error.
  const plain = classifyError({ message: "fetch failed", engineOffline: false });
  assert.equal(plain.action, null);
  assert.equal(plain.message, "fetch failed");
}

// --- plain failure: message kept, no invented action ----------------------
{
  const result = classifyError({ status: 500, message: "Comfy crashed" });
  assert.deepEqual(result, {
    message: "Comfy crashed",
    action: null,
    guidance: null,
  });

  const empty = classifyError({ status: 500, message: "   " });
  assert.ok(empty.message.length > 0);
  assert.equal(empty.action, null);
}

// --- thrown values: ApiError-like vs plain Error vs string ----------------
{
  const apiLike = Object.assign(new Error("Gone"), { status: 404 });
  assert.equal(isApiErrorLike(apiLike), true);
  assert.equal(classifyThrown(apiLike, { context: "tool" }).action, "reselect");

  const plain = new Error("boom");
  assert.equal(isApiErrorLike(plain), false);
  assert.equal(classifyThrown(plain).action, null);
  assert.equal(classifyThrown(plain).message, "boom");

  const stringy = classifyThrown("  offline  ", { engineOffline: true });
  assert.equal(stringy.message, "offline");
  assert.equal(stringy.action, "recheck-engine");

  const nothing = classifyThrown(null);
  assert.equal(nothing.action, null);
  assert.ok(nothing.message.length > 0);

  // A non-ApiError object with a string status must not be trusted as HTTP.
  assert.equal(isApiErrorLike({ status: "401" }), false);
}

console.log("check-actionable-error: OK");
