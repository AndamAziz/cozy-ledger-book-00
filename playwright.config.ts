import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for cross-browser end-to-end tests.
 *
 * Runs the Quran reciter persistence spec in Chromium, Firefox, and WebKit.
 * The Vite dev server (port 8080) is started automatically and reused if it
 * is already running locally.
 */
/** Real-provider IPTV playback suite — Chromium-only, see projects below. */
const IPTV_SPEC = "**/iptv-playback.e2e.ts";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    // Allows running against a pre-installed browser binary in sandboxes where
    // `npx playwright install` cannot fetch the version-matched build.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : undefined,
  },
  projects: [
    // Cross-browser UI specs. The IPTV playback suite is excluded: it talks to
    // the live provider and decodes real media, so running it three times would
    // burn provider connection slots for no extra signal.
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: IPTV_SPEC },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testIgnore: IPTV_SPEC },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testIgnore: IPTV_SPEC },
    // Live / Movies / Series playback: Chromium only, generous budget.
    {
      name: "iptv-playback",
      testMatch: IPTV_SPEC,
      timeout: 480_000,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
