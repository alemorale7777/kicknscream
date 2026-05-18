import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "https://kicknscream.vercel.app";

/**
 * Playwright config — runs the e2e tests against either the live prod
 * deploy (default) or a local dev server when PLAYWRIGHT_BASE_URL points
 * to localhost. Spec files live under e2e/ to keep them away from the
 * Vitest unit suite under src/tests/.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? "github" : "list",
  use: {
    baseURL,
    trace: isCI ? "retain-on-failure" : "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
