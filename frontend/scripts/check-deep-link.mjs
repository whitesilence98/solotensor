/**
 * Dependency-free assertion check for the `/generate` deep-link mapping.
 *
 * Node 24 strips TypeScript types natively, so no build step or test framework
 * is needed:
 *
 *   node frontend/scripts/check-deep-link.mjs
 *
 * Exits 0 on success, 1 with the failing assertion otherwise.
 */

import assert from "node:assert/strict";
import {
  buildShotGenerateHref,
  parseGenerateDeepLink,
  snapVideoDuration,
  snapVideoFps,
  videoSizeForAspect,
  VIDEO_DURATION_OPTIONS,
  VIDEO_FPS_OPTIONS,
} from "../src/lib/generateDeepLink.ts";

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

// --- mode tokens -----------------------------------------------------------

check("text-to-image maps to Text2Img", () => {
  assert.equal(parseGenerateDeepLink("?mode=text-to-image").mode, "Text2Img");
});
check("character/anime/photoreal/avatar/brand map to Text2Img", () => {
  for (const token of ["character", "anime", "photoreal", "avatar", "brand", "pose"]) {
    assert.equal(parseGenerateDeepLink(`?mode=${token}`).mode, "Text2Img", token);
  }
});
check("img2img family maps to Img2Img with the sub-tab", () => {
  assert.equal(parseGenerateDeepLink("?mode=img2img").mode, "Img2Img");
  assert.equal(parseGenerateDeepLink("?mode=img2img").img2imgSubTab, "image_to_image");
  assert.equal(parseGenerateDeepLink("?mode=detailer").img2imgSubTab, "detailer");
  assert.equal(parseGenerateDeepLink("?mode=upscale").img2imgSubTab, "upscaler");
  assert.equal(parseGenerateDeepLink("?mode=reference").img2imgSubTab, "image_to_image");
});
check("edit maps to Edit with no img2img sub-tab", () => {
  const plan = parseGenerateDeepLink("?mode=edit");
  assert.equal(plan.mode, "Edit");
  assert.equal(plan.img2imgSubTab, null);
});
check("video tokens map to Video", () => {
  assert.equal(parseGenerateDeepLink("?mode=video").mode, "Video");
  assert.equal(parseGenerateDeepLink("?mode=text-to-video").mode, "Video");
  assert.equal(parseGenerateDeepLink("?mode=image-to-video").mode, "Video");
});
check("unknown or absent mode leaves the active tab alone", () => {
  assert.equal(parseGenerateDeepLink("?mode=nonsense").mode, null);
  assert.equal(parseGenerateDeepLink("").mode, null);
  assert.equal(parseGenerateDeepLink("?mode=nonsense").img2imgSubTab, null);
});

// --- video sub-mode and reference clearing --------------------------------

check("explicit text-to-video clears stale reference inputs", () => {
  const plan = parseGenerateDeepLink("?mode=video&video_mode=text-to-video");
  assert.equal(plan.videoSubMode, "text-to-video");
  assert.equal(plan.clearVideoReferences, true);
});
check("image-to-video keeps references", () => {
  const plan = parseGenerateDeepLink("?mode=image-to-video");
  assert.equal(plan.videoSubMode, "image-to-video");
  assert.equal(plan.clearVideoReferences, false);
});
check("bare mode=video does not change the draft's sub-mode", () => {
  const plan = parseGenerateDeepLink("?mode=video");
  assert.equal(plan.videoSubMode, null);
  assert.equal(plan.clearVideoReferences, false);
});

// --- prompt / negative / seed / format ------------------------------------

check("prompt and negative round-trip through URL encoding", () => {
  const params = new URLSearchParams({
    prompt: "neon drive, rain & reflections",
    negative_prompt: "blur, watermark",
  });
  const plan = parseGenerateDeepLink(`?${params.toString()}`);
  assert.equal(plan.prompt, "neon drive, rain & reflections");
  assert.equal(plan.negativePrompt, "blur, watermark");
});
check("blank prompt is treated as absent, never as a wipe", () => {
  assert.equal(parseGenerateDeepLink("?prompt=%20%20").prompt, null);
  assert.equal(parseGenerateDeepLink("").prompt, null);
});
check("an explicitly empty negative prompt clears the old one", () => {
  const plan = parseGenerateDeepLink("?negative_prompt=");
  assert.equal(plan.negativePrompt, "");
});
check("absent negative prompt is null, not empty", () => {
  assert.equal(parseGenerateDeepLink("?prompt=x").negativePrompt, null);
});
check("only unsigned 32-bit seeds survive", () => {
  assert.equal(parseGenerateDeepLink("?seed=12345").seed, "12345");
  assert.equal(parseGenerateDeepLink("?seed=0").seed, "0");
  assert.equal(parseGenerateDeepLink("?seed=4294967295").seed, "4294967295");
  assert.equal(parseGenerateDeepLink("?seed=4294967296").seed, null);
  assert.equal(parseGenerateDeepLink("?seed=-1").seed, null);
  assert.equal(parseGenerateDeepLink("?seed=1.5").seed, null);
  assert.equal(parseGenerateDeepLink("?seed=abc").seed, null);
});
check("format accepts the five ratios only", () => {
  assert.equal(parseGenerateDeepLink("?format=16:9").format, "16:9");
  assert.equal(parseGenerateDeepLink("?format=custom").format, null);
  assert.equal(parseGenerateDeepLink("?format=21:9").format, null);
});

// --- video snapping -------------------------------------------------------

check("duration snaps to the nearest selectable pill", () => {
  assert.equal(snapVideoDuration(4), 3);
  assert.equal(snapVideoDuration(6), 5);
  assert.equal(snapVideoDuration(9), 10);
  assert.equal(snapVideoDuration(99), 15);
  assert.equal(snapVideoDuration(null), null);
  assert.equal(snapVideoDuration(Number.NaN), null);
});
check("fps snaps to the nearest selectable pill", () => {
  assert.equal(snapVideoFps(20), 16);
  assert.equal(snapVideoFps(25), 24);
  assert.equal(snapVideoFps(31), 30);
  assert.equal(snapVideoFps(49), 49);
  assert.equal(snapVideoFps(60), 49);
  assert.equal(snapVideoFps(null), null);
});
check("deep link snapping always lands on a real option", () => {
  const plan = parseGenerateDeepLink("?duration=7&fps=12");
  assert.ok(VIDEO_DURATION_OPTIONS.includes(plan.duration));
  assert.ok(VIDEO_FPS_OPTIONS.includes(plan.fps));
  assert.equal(plan.duration, 5);
  assert.equal(plan.fps, 16);
});
check("non-numeric duration/fps are ignored", () => {
  const plan = parseGenerateDeepLink("?duration=long&fps=fast");
  assert.equal(plan.duration, null);
  assert.equal(plan.fps, null);
});

// --- model identity -------------------------------------------------------

const ID = "a".repeat(32);
const ID2 = "b".repeat(32);
const ID3 = "c".repeat(32);

check("model triple and base ids are read", () => {
  const plan = parseGenerateDeepLink(
    `?model_id=${ID}&version_id=${ID2}&file_id=${ID3}&base_model_id=${ID}&base_file_id=${ID3}`,
  );
  assert.equal(plan.modelId, ID);
  assert.equal(plan.versionId, ID2);
  assert.equal(plan.fileId, ID3);
  assert.equal(plan.baseModelId, ID);
  assert.equal(plan.baseFileId, ID3);
  assert.equal(plan.hasModelParam, true);
});
check("no model param means the link must not block hydration", () => {
  assert.equal(parseGenerateDeepLink("?mode=video").hasModelParam, false);
  assert.equal(parseGenerateDeepLink("").hasModelParam, false);
});

// --- shot card handoff ----------------------------------------------------

check("video shot link carries an explicit text-to-video mode and snapped values", () => {
  const href = buildShotGenerateHref({
    prompt: "night drive",
    negative_prompt: "",
    media: "video",
    aspect: "16:9",
    duration_seconds: 7,
    fps: 28,
    model_id: ID,
    version_id: ID2,
    file_id: ID3,
  });
  assert.ok(href, "expected a link");
  const plan = parseGenerateDeepLink(href);
  assert.equal(plan.mode, "Video");
  assert.equal(plan.videoSubMode, "text-to-video");
  assert.equal(plan.clearVideoReferences, true);
  assert.equal(plan.prompt, "night drive");
  assert.equal(plan.negativePrompt, "");
  assert.equal(plan.format, "16:9");
  assert.equal(plan.duration, 5);
  assert.equal(plan.fps, 30);
  assert.equal(plan.modelId, ID);
  assert.equal(plan.versionId, ID2);
  assert.equal(plan.fileId, ID3);
});
check("video aspects map onto the tab's own preset chips", () => {
  assert.deepEqual(videoSizeForAspect("16:9"), { width: 1024, height: 576, isPresetChip: true });
  assert.deepEqual(videoSizeForAspect("9:16"), { width: 576, height: 1024, isPresetChip: true });
  assert.deepEqual(videoSizeForAspect("1:1"), { width: 704, height: 704, isPresetChip: true });
  assert.deepEqual(videoSizeForAspect("3:2"), { width: 768, height: 512, isPresetChip: true });
});
check("4:3 has no chip and lands on an LTX-aligned custom box", () => {
  const size = videoSizeForAspect("4:3");
  assert.equal(size.isPresetChip, false);
  assert.equal(size.width % 32, 0);
  assert.equal(size.height % 32, 0);
});
check("a video shot link lands on Video with a size the tab can show", () => {
  const href = buildShotGenerateHref({
    prompt: "night drive",
    negative_prompt: "",
    media: "video",
    aspect: "9:16",
    duration_seconds: 10,
    fps: 24,
    model_id: ID,
    version_id: ID2,
    file_id: ID3,
  });
  assert.ok(href, "expected a link");
  const plan = parseGenerateDeepLink(href);
  assert.equal(plan.mode, "Video");
  const size = videoSizeForAspect(plan.format);
  assert.deepEqual(size, { width: 576, height: 1024, isPresetChip: true });
});

check("a video shot with no duration/fps falls back to 5s / 24fps", () => {
  const href = buildShotGenerateHref({
    prompt: "establishing",
    negative_prompt: "",
    media: "video",
    aspect: "16:9",
    duration_seconds: null,
    fps: null,
    model_id: ID,
    version_id: ID2,
    file_id: ID3,
  });
  assert.ok(href, "expected a link");
  const plan = parseGenerateDeepLink(href);
  assert.equal(plan.duration, 5);
  assert.equal(plan.fps, 24);
});
check("image shot link lands on Text2Img and never sends video fields", () => {
  const href = buildShotGenerateHref({
    prompt: "portrait",
    negative_prompt: "blur",
    media: "image",
    aspect: "9:16",
    duration_seconds: 5,
    fps: 24,
    model_id: ID,
    version_id: ID2,
    file_id: ID3,
  });
  assert.ok(href, "expected a link");
  const plan = parseGenerateDeepLink(href);
  assert.equal(plan.mode, "Text2Img");
  assert.equal(plan.videoSubMode, null);
  assert.equal(plan.duration, null);
  assert.equal(plan.fps, null);
  assert.equal(plan.negativePrompt, "blur");
  assert.equal(plan.format, "9:16");
});
check("a partial model identity cannot produce a link", () => {
  const base = {
    prompt: "p",
    negative_prompt: "",
    media: "image",
    aspect: "1:1",
    duration_seconds: null,
    fps: null,
    model_id: ID,
    version_id: ID2,
    file_id: ID3,
  };
  assert.equal(buildShotGenerateHref({ ...base, model_id: null }), null);
  assert.equal(buildShotGenerateHref({ ...base, version_id: null }), null);
  assert.equal(buildShotGenerateHref({ ...base, file_id: null }), null);
});

console.log(`check-deep-link: ${checks} checks passed`);
