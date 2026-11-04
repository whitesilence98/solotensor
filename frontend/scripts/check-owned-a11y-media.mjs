/**
 * Dependency-free source-invariant check for the accessibility + media
 * performance slice owned by the frontend a11y agent.
 *
 *   node frontend/scripts/check-owned-a11y-media.mjs
 *
 * It asserts the invariants directly on the owned source files so a later
 * refactor cannot silently drop a label, a live region, or a lazy/async media
 * hint. It does not render React and needs no build step.
 *
 * Exits 0 on success, 1 with the failing assertion otherwise.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../src/components/", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

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

const authModal = read("AuthModal.tsx");
const assetCard = read("AssetCard.tsx");
const canvasPreview = read("CanvasPreview.tsx");
const inspectionStage = read("AssetInspectionStage.tsx");

// --- AuthModal: real dialog semantics, Escape, containment, restoration ------

check("AuthModal is a modal dialog with a resolvable accessible name", () => {
  assert.match(authModal, /role="dialog"/);
  assert.match(authModal, /aria-modal="true"/);
  assert.match(authModal, /aria-labelledby="auth-modal-title"/);
  // The labelled element must exist, otherwise the reference names nothing.
  assert.match(authModal, /id="auth-modal-title"/);
});

check("AuthModal closes on Escape", () => {
  assert.match(authModal, /e\.key === "Escape"[\s\S]{0,120}closeAuthModal\(\)/);
});

check("AuthModal trap handles focus that escaped the dialog", () => {
  assert.match(
    authModal,
    /!dialogRef\.current\.contains\(active\)[\s\S]{0,160}\.focus\(\)/,
    "Tab handling should pull escaped focus back into the dialog"
  );
});

check("AuthModal restores focus to its opener on close", () => {
  assert.match(authModal, /openerRef\.current\s*=\s*\n?\s*document\.activeElement/);
  assert.match(authModal, /opener\?\.focus\(\)/);
});

check("AuthModal announces async status banners", () => {
  assert.match(authModal, /role="alert"/);
  assert.match(authModal, /role="status"[\s\S]{0,120}aria-live="polite"/);
});

// --- AssetCard: lazy/async imagery, existing aspect box untouched ----------

check("AssetCard image is lazy and async-decoded", () => {
  assert.match(assetCard, /<img[\s\S]{0,220}loading="lazy"/);
  assert.match(assetCard, /<img[\s\S]{0,260}decoding="async"/);
});

check("AssetCard keeps its explicit aspect box", () => {
  assert.match(assetCard, /aspectRatio: computedAspect/);
});

check("AssetCard gates card video previews to the viewport", () => {
  // autoPlay ignores preload="none", so the element must not mount offscreen.
  assert.match(assetCard, /IntersectionObserver/);
  assert.match(assetCard, /shouldLoadVideo \? \(/);
  // The gate must not touch the card's own autoplay semantics in view.
  assert.match(assetCard, /autoPlay=\{!reduceMotion\}/);
});

check("AssetCard icon-only controls carry names", () => {
  assert.match(assetCard, /aria-label="More options"/);
  assert.match(assetCard, /aria-label=\{selected \? `Deselect/);
});

// --- CanvasPreview: list thumbs lazy/async, progress live region -----------

check("CanvasPreview list thumbnail is lazy and async-decoded", () => {
  assert.match(canvasPreview, /<img[\s\S]{0,200}loading="lazy"/);
  assert.match(canvasPreview, /<img[\s\S]{0,240}decoding="async"/);
});

check("CanvasPreview progress is announced with a bucketed polite region", () => {
  assert.match(canvasPreview, /aria-live="polite"[\s\S]{0,160}aria-atomic="true"/);
  assert.match(canvasPreview, /Math\.round\(cleanProgress \/ 10\) \* 10/);
});

// --- AssetInspectionStage: media decode hints and named icon buttons -------

check("Inspection stage images are async-decoded", () => {
  const matches = inspectionStage.match(/<img[\s\S]*?decoding="async"/g) ?? [];
  assert.ok(matches.length >= 2, `expected >=2 async images, found ${matches.length}`);
});

check("Inspection compare toggle exposes pressed state", () => {
  assert.match(inspectionStage, /setShowComparison[\s\S]{0,120}aria-pressed=\{showComparison\}/);
});

check("Inspection icon-only controls carry names", () => {
  assert.match(inspectionStage, /aria-label=\{`Remove tag \$\{tag\}`\}/);
  assert.match(inspectionStage, /aria-label="Copy seed"/);
  assert.match(inspectionStage, /aria-label="Moderator actions"/);
});

check("Inspection stage defers dialog role to its WorkspaceModal host", () => {
  // It is rendered inside WorkspaceModal (native <dialog>) for the overlay and
  // as a plain page section for standalone; it must not claim a dialog role.
  assert.doesNotMatch(inspectionStage, /role="dialog"/);
});

console.log(`OK ${checks} checks`);
