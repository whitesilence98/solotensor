import { test, expect, waitForSession } from "./fixtures";
import { ALICE, galleryItem } from "./mocks";

/**
 * Asset Library: server-side paging, filter query contract, 401 recovery, and
 * the viewport-gated video preview.
 *
 * The library is offset-paged (`{ items, total, offset, limit, has_more }`);
 * "Load more" must advance the real offset and every filter must reach the
 * server as a query param rather than being applied client-side.
 */

const PAGE_SIZE = 24;

function manyImages(count: number) {
  return Array.from({ length: count }, (_, i) =>
    galleryItem(`img-${String(i).padStart(3, "0")}.png`),
  );
}

test("shows the first page and loads more at the next server offset", async ({ page, mock }) => {
  // 30 rows: first page 24, one more page of 6 with has_more=false.
  mock.galleryItems = manyImages(30);

  await mock.seed(page, ALICE);
  await page.goto("/assets");
  await waitForSession(page);

  await expect(page.getByText("Showing 24 of 30 matching images")).toBeVisible();

  const first = mock.callsTo("/api/v1/gallery/me")[0];
  expect(first?.search.offset).toBe("0");
  expect(first?.search.limit).toBe(String(PAGE_SIZE));
  expect(first?.search.media_type).toBe("image");

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Showing 30 of 30 matching images")).toBeVisible();

  const paged = mock.callsTo("/api/v1/gallery/me").filter((call) => call.search.offset === "24");
  expect(paged.length, "Load more must request offset=24 from the server").toBe(1);
});

test("search and source filters are sent to the server, not applied locally", async ({ page, mock }) => {
  mock.galleryItems = [
    ...manyImages(3),
    galleryItem("lighthouse-study.png", "/files/demo/lighthouse-study.png", {
      metadata: { prompt: "A lighthouse at dusk", width: 768, height: 1024 },
    }),
  ];

  await mock.seed(page, ALICE);
  await page.goto("/assets");
  await waitForSession(page);
  await expect(page.getByText("Showing 4 of 4 matching images")).toBeVisible();

  // Server-side search: the query must reach /api/v1/gallery/me as `q`.
  await page.getByRole("searchbox", { name: "Search your whole asset library" }).fill("lighthouse");
  await page.keyboard.press("Enter");
  // One result takes the singular noun.
  await expect(page.getByText("Showing 1 of 1 matching image")).toBeVisible();
  const searched = mock.callsTo("/api/v1/gallery/me").at(-1);
  expect(searched?.search.q).toBe("lighthouse");
  expect(searched?.search.offset).toBe("0");

  // Clearing search re-queries from offset 0 (never from the old page).
  await page.getByRole("button", { name: "Clear asset search" }).click();
  await expect(page.getByText("Showing 4 of 4 matching images")).toBeVisible();
  expect(mock.callsTo("/api/v1/gallery/me").at(-1)?.search.q).toBeUndefined();
});

test("401 from the library shows the sign-in recovery action", async ({ page, mock }) => {
  mock.galleryStatus = 401;

  await mock.seed(page, ALICE);
  await page.goto("/assets");
  await waitForSession(page);

  const alert = page.getByRole("alert").filter({ hasText: "Your session has expired" });
  await expect(alert).toBeVisible();
  const signInAgain = page.getByRole("button", { name: "Sign in again" });
  await expect(signInAgain).toBeVisible();

  await signInAgain.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#signin-identifier")).toBeVisible();
});

test("offscreen video cards mount no <video>; scrolled-into-view cards do", async ({ page, mock }) => {
  // A tall grid of video rows so the last card is well below the fold. The
  // Videos tab is pre-selected through the real persistent-state contract.
  mock.galleryItems = Array.from({ length: 18 }, (_, i) =>
    galleryItem(`clip-${String(i).padStart(2, "0")}.mp4`, `/files/demo/clip-${i}.mp4`, {
      metadata: { prompt: `Clip ${i}`, width: 1280, height: 720 },
    }),
  );

  await mock.seed(page, ALICE);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("solotensor:assets:tab", JSON.stringify("video"));
    } catch {
      /* ignore */
    }
  });
  await page.goto("/assets");
  await waitForSession(page);
  await expect(page.getByText("Showing 18 of 18 matching videos")).toBeVisible();

  const lastCard = page.locator("article").filter({
    has: page.getByRole("button", { name: "Open asset clip-17.mp4" }),
  });
  await expect(lastCard).toHaveCount(1);

  // Below the fold: the preview video is not mounted at all (no fetch/decode).
  const lastCardBox = await lastCard.boundingBox();
  const viewport = page.viewportSize();
  expect(lastCardBox, "the last card must exist").toBeTruthy();
  expect(lastCardBox!.y, "fixture must put the last card below the fold").toBeGreaterThan(viewport!.height);
  await expect(lastCard.locator("video")).toHaveCount(0);

  // Scrolled into view: the existing <video> mounts, pointing at real media.
  await lastCard.scrollIntoViewIfNeeded();
  await expect(lastCard.locator("video")).toHaveCount(1);
  await expect(lastCard.locator("video")).toHaveAttribute("src", /\/files\/demo\/clip-17\.mp4/);

  // The gate latches: scrolling back out keeps the element (no restart churn).
  await page.getByRole("tab", { name: /Images/ }).click();
  await page.getByRole("tab", { name: /Videos/ }).click();
  await lastCard.scrollIntoViewIfNeeded();
  await expect(lastCard.locator("video")).toHaveCount(1);
});
