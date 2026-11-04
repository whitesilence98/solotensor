import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Browser regression suite for the SoloTensor frontend.
 *
 * Every test runs the REAL Next.js app in a real Chromium/Chrome browser. All
 * FastAPI (:8000) traffic is stubbed at the browser boundary with
 * `page.route` / `page.routeWebSocket`, so no live backend, ComfyUI, GPU,
 * config, database, or network provider is ever contacted.
 *
 *   npx playwright test
 *   npx playwright test --project=chrome
 *
 * `channel: "chrome"` / `"msedge"` uses the locally installed browser instead of
 * a downloaded Playwright build, which is what this workstation provides.
 *
 * `E2E_WEB_DIR` / `E2E_WEB_CMD` let a final run target an already-built tree
 * (e.g. the repository root's production build) instead of compiling this
 * worktree: `E2E_WEB_DIR=<root>/frontend E2E_WEB_CMD="npx next start -p 3101 -H 127.0.0.1" E2E_PORT=3101`.
 * `E2E_PORT` moves the default 3100 if that port is already in use.
 */
const webDir = process.env.E2E_WEB_DIR
  ? path.resolve(process.env.E2E_WEB_DIR)
  : __dirname;
const port = process.env.E2E_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;
const webCommand =
  process.env.E2E_WEB_CMD ?? `npx next dev -p ${port} -H 127.0.0.1`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Only the app itself and its own stubbed origins are reachable; any other
    // navigation is aborted by the fixture so tests cannot touch the network.
    serviceWorkers: "block",
  },
  webServer: {
    command: webCommand,
    cwd: webDir,
    url: baseURL,
    // Reuse whatever is already serving :3100 so the final run can target the
    // repository root's production build (`next start`) without recompiling.
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "msedge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
});
