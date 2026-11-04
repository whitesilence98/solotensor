import { test, expect, waitForSession } from "./fixtures";
import { ALICE, galleryItem } from "./mocks";

/**
 * Expired private media renewal.
 *
 * The gallery serves a private asset whose signed URL is seconds from expiry;
 * the real `useAssetMedia` hook schedules a renewal before it lapses and swaps
 * the freshly signed capability into the rendered <img>. The
 * `GET /api/v1/assets/{key}/media` endpoint is the FastAPI boundary under test.
 */

test("renews an expiring private asset URL before it lapses", async ({ page, mock }) => {
  // The hook renews 60s before expiry, so place expiry 64s out: the stale
  // capability paints first, then renewal fires ~4s later.
  const soon = new Date(Date.now() + 64_000).toISOString();
  const renewedExpiry = new Date(Date.now() + 3_600_000).toISOString();
  mock.galleryItems = [
    galleryItem("private-shot.png", "/files/private/private-shot.png?token=stale", {
      is_private: true,
      url_expires_at: soon,
    }),
  ];

  let renewalCalls = 0;
  mock.media = () => {
    renewalCalls += 1;
    return {
      body: {
        key: "private-shot.png",
        url: `/files/private/private-shot.png?token=fresh-${renewalCalls}`,
        url_expires_at: renewedExpiry,
        thumbnail_url: null,
        before_detailer_url: null,
      },
    };
  };

  await mock.seed(page, ALICE);
  await page.goto("/assets");
  await waitForSession(page);

  const card = page.locator('img[alt="Prompt for private-shot.png"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("src", /token=stale/);

  // The renewal fires ~4s after mount (60s before the 64s expiry).
  await expect.poll(() => renewalCalls, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(card).toHaveAttribute("src", /token=fresh-1/, { timeout: 20_000 });

  const renewal = mock.callsTo("/api/v1/assets/private-shot.png/media")[0];
  expect(renewal, "renewal must hit the documented media endpoint").toBeTruthy();
  expect(renewal.headers.authorization).toBe(`Bearer token-${ALICE.id}`);
});

test("private media is re-signed when the browser reports a load failure", async ({ page, mock }) => {
  const expiry = new Date(Date.now() + 3_600_000).toISOString();
  mock.galleryItems = [
    galleryItem("expired-shot.png", "/files/private/expired-shot.png?token=expired", {
      is_private: true,
      url_expires_at: expiry,
    }),
  ];
  let renewals = 0;
  mock.media = () => {
    renewals += 1;
    return {
      body: {
        key: "expired-shot.png",
        url: "/files/private/expired-shot.png?token=renewed",
        url_expires_at: expiry,
        thumbnail_url: null,
        before_detailer_url: null,
      },
    };
  };

  await mock.seed(page, ALICE);
  await page.goto("/assets");
  await waitForSession(page);

  const cardImage = page.locator('img[alt="Prompt for expired-shot.png"]');
  await expect(cardImage).toHaveAttribute("src", /token=expired/);

  // Simulate the browser's onError for an expired capability.
  await cardImage.evaluate((node) => {
    node.dispatchEvent(new Event("error"));
  });
  await expect.poll(() => renewals).toBeGreaterThan(0);
  await expect(cardImage).toHaveAttribute("src", /token=renewed/);
});
