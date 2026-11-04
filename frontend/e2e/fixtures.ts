import { test as base, expect } from "@playwright/test";
import { BackendMock } from "./mocks";

/**
 * Test fixture that guarantees the browser can only reach the app under test.
 *
 * Every request outside the local Next origin (in particular the real FastAPI
 * on :8000, a GPU host, or any third-party provider) is aborted before it
 * leaves the browser, so a test can never touch a live service. The one
 * `BackendMock` per test can be re-configured from the test body before the
 * first navigation (assign `mock.generate`, `mock.galleryItems`, ...).
 */
export const test = base.extend<{ mock: BackendMock }>({
  mock: async ({ page }, use) => {
    await page.context().route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const local =
        url.hostname === "127.0.0.1" || url.hostname === "localhost";
      if (!local || url.port === "8000") {
        // Any non-app destination (including real FastAPI) is blocked.
        await route.abort("blockedbyclient");
        return;
      }
      await route.fallback();
    });

    const mock = new BackendMock();
    await mock.attach(page);
    await use(mock);
  },
});

export { expect };

/** Wait for the client app to finish hydrating auth from storage. */
export async function waitForSession(page: import("@playwright/test").Page) {
  await expect(page.getByRole("button", { name: /User menu for/i })).toBeVisible();
}
