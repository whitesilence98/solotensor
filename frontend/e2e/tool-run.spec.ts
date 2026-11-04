import { test, expect, waitForSession } from "./fixtures";
import { ALICE, HEALTH_OK } from "./mocks";

/**
 * Tool run ticket / server id / close, and the failed-engine path.
 *
 * A real tool page run is exercised: the real ticket request mints the client
 * id, the real progress WebSocket opens, and the run FormData is submitted with
 * that server-issued id. On a failure the actionable error UI must offer one
 * safe action and must not re-submit a paid job.
 */

test("run submits the server-issued client id and closes the relay", async ({ page, mock }) => {
  mock.health = HEALTH_OK;
  await mock.seed(page, ALICE);
  await page.goto("/tools/t-demo");
  await waitForSession(page);

  await expect(page.getByRole("heading", { name: "Demo Tool", level: 1 })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Generate Output/ }).click();

  // Ticket endpoint minted the id.
  const ticket = mock.callsTo("/api/v1/ws/ticket")[0];
  expect(ticket, "tool run must mint a relay ticket").toBeTruthy();

  // The run FormData carries the ticket's server-issued client_id.
  await expect.poll(() => mock.callsTo("/api/tools/t-demo/run").length).toBeGreaterThan(0);
  const runCall = mock.callsTo("/api/tools/t-demo/run")[0];
  const body = String(runCall.body);
  expect(body).toContain("client-1");
  expect(body).toContain("save_to_gallery");

  // Result rendered from the stubbed FastAPI run response.
  await expect(page.getByAltText("Generated result from Demo Tool")).toBeVisible();
  // The relay is closed once the run finishes.
  await expect.poll(() => mock.closedSockets).toBeGreaterThan(0);
});

test("failed engine path offers one action and never auto-resubmits", async ({ page, mock }) => {
  // The run request never reaches a server, and the health probe reports the
  // engine down: the honest classification is "recheck", never a resubmit.
  mock.health = { ...HEALTH_OK, comfy: "down" };
  mock.runNetworkFailure = true;

  await mock.seed(page, ALICE);
  await page.goto("/tools/t-demo");
  await waitForSession(page);

  await expect(page.getByRole("heading", { name: "Demo Tool", level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Generate Output/ })).toBeEnabled();
  await page.getByRole("button", { name: /Generate Output/ }).click();

  await expect(page.getByRole("heading", { name: "Execution Error" })).toBeVisible();
  const recheck = page.getByRole("button", { name: "Recheck engine" });
  await expect(recheck).toBeVisible();
  await expect(page.getByText(/was not re-submitted/i)).toBeVisible();

  // Clicking the action rechecks health; it must not queue another run.
  const runsBefore = mock.callsTo("/api/tools/t-demo/run").length;
  await recheck.click();
  await page.waitForTimeout(750);
  expect(mock.callsTo("/api/tools/t-demo/run").length).toBe(runsBefore);
});

test("HTTP 404 on a missing tool shows reselect guidance, not an offline claim", async ({ page, mock }) => {
  mock.health = HEALTH_OK;
  await page.route("**/api/tools/gone-tool", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Tool not found" }),
    }),
  );

  await mock.seed(page, ALICE);
  await page.goto("/tools/gone-tool");
  await waitForSession(page);

  await expect(page.getByRole("heading", { name: "Failed to load workflow tool" })).toBeVisible();
  await expect(page.getByText(/may have been deleted/i)).toBeVisible();
  // A real HTTP status is never relabeled as an offline engine.
  await expect(page.getByRole("button", { name: "Recheck engine" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Back to tools/ })).toBeVisible();
});
