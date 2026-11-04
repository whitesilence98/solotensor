import { test, expect, waitForSession } from "./fixtures";
import { ALICE, BOB, galleryItem } from "./mocks";

/**
 * Account switch mid-generation must drop the previous viewer's progress and
 * completion.
 *
 * The run is real: a real progress WebSocket is opened, real frames are pushed,
 * and the real generate request is held open until after the identity change.
 * The switch itself uses the app's own Sign Out -> Sign In path (no reload
 * tricks, no storage pokes), so the auth-context viewer actually changes.
 * Only the FastAPI boundary is stubbed.
 */

test("stale progress, relays and completion never reach the next account", async ({ page, mock }) => {
  // Hold Alice's generation response so the identity change happens mid-flight.
  const release: { fn: (() => void) | null } = { fn: null };
  const held = new Promise<void>((resolve) => {
    release.fn = resolve;
  });
  mock.generate = async () => {
    await held;
    return {
      prompt_id: "alice-prompt",
      status: "completed",
      images: [{ filename: "alice-completed.png", url: "/files/demo/alice-completed.png" }],
      error: null,
      elapsed_ms: 100,
    };
  };
  // Each account's library is genuinely different, so a stale refresh is detectable.
  mock.galleryItems = [galleryItem("alice-only.png")];

  await mock.seed(page, ALICE);
  await page.goto("/generate");
  await waitForSession(page);

  // 1. Start the run from the real prompt bar.
  await page.locator("#studio-prompt-input").fill("A lighthouse in a storm");
  await page.getByRole("button", { name: "Generate Artwork" }).click();

  // The real relay socket opens and the studio is busy.
  await expect.poll(() => mock.sockets.length).toBeGreaterThan(0);
  const aliceSocket = mock.lastSocket();
  await expect(page.getByRole("button", { name: "Generate Artwork" })).toContainText(/Rendering/);

  // 2. Genuine progress frames arrive and render.
  aliceSocket.send(JSON.stringify({ type: "progress", value: 42, max: 100, node: "7" }));
  // Rendered in both the action button and the outputs gallery.
  await expect(page.getByText(/Rendering… node 7 42%/).first()).toBeVisible();

  // 3. Sign out through the real account menu (in-place identity change).
  await page.getByRole("button", { name: `User menu for ${ALICE.displayName}` }).click();
  await page.getByRole("button", { name: "Sign Out" }).click();

  // The run is dropped for the departing viewer: relay closed, busy shell gone.
  await expect(page.getByRole("button", { name: "Sign In to Continue" })).toBeVisible();
  await expect.poll(() => mock.closedSockets).toBeGreaterThan(0);
  await expect(page.getByText(/Rendering… node 7 42%/)).toHaveCount(0);

  // 4. Alice's completion now lands late. It must not be applied.
  release.fn?.();
  await page.waitForTimeout(500);
  await expect(page.getByText("alice-completed.png")).toHaveCount(0);
  expect(mock.generateCalls, "a late completion must not trigger a resubmit").toBe(1);

  // 5. Bob's library is now the only one served; sign him in via the modal.
  mock.user = BOB;
  mock.galleryItems = [galleryItem("bob-only.png")];
  await page.getByRole("button", { name: "Sign In to Continue" }).click();
  await page.locator("#signin-identifier").fill(BOB.email);
  await page.locator("#signin-password").fill("bob-password");
  await page.getByRole("button", { name: "Sign In to Studio" }).click();
  await expect(page).toHaveURL(new RegExp(`/user/${BOB.username}$`));

  await page.goto("/generate");
  await waitForSession(page);
  await expect(page.getByText("alice-completed.png")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate Artwork" })).not.toContainText(/Rendering/);

  // Bob's own gallery is what hydrated, not Alice's.
  await expect(page.getByRole("button", { name: "Open asset bob-only.png" })).toBeVisible();
});
