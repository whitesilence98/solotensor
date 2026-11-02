/**
 * Dependency-free assertion check for AssetCard's server-count parsing.
 *
 *   node frontend/scripts/check-asset-card-counts.mjs
 *
 * Node 24 strips TypeScript types natively; no build step needed.
 * Exits 0 on success, 1 with the failing assertion otherwise.
 */

import assert from "node:assert/strict";
import { toRemixCount } from "../src/lib/assetCardCounts.ts";

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

check("no count fields -> null (row is omitted, never fabricated)", () => {
  assert.equal(toRemixCount(undefined, undefined, undefined, undefined), null);
});

check("zero and negatives are not shown", () => {
  assert.equal(toRemixCount(0), null);
  assert.equal(toRemixCount(-3), null);
  assert.equal(toRemixCount("0"), null);
});

check("sub-1 values truncate to 0 and are rejected", () => {
  assert.equal(toRemixCount(0.5), null);
  assert.equal(toRemixCount("0.9"), null);
  assert.equal(toRemixCount(0.9999), null);
});

check("a sub-1 leading candidate does not hide a later valid count", () => {
  assert.equal(toRemixCount(0.5, 2), 2);
  assert.equal(toRemixCount("0.4", "7"), 7);
});

check("non-finite and junk values are ignored", () => {
  assert.equal(toRemixCount(NaN, Infinity, "abc", {}), null);
  assert.equal(toRemixCount("", null, true), null);
});

check("finite positive numbers are used, first valid wins", () => {
  assert.equal(toRemixCount(7), 7);
  assert.equal(toRemixCount("12"), 12);
  assert.equal(toRemixCount(4.9), 4);
  assert.equal(toRemixCount(null, "3", 99), 3);
});

console.log(`ok ${checks} asset-card count checks`);
