import { test, expect } from "@playwright/test";

/**
 * Lightweight ops smoke. Hits the marketing root + the demo tenant's
 * public surface and checks they respond with a 200 and the right basic
 * chrome. Cheap to run on every deploy.
 */
test.describe("smoke", () => {
  test("home page returns 200 and renders", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/KickNScream/i);
  });

  test("/api/calendar/[bad-token].ics 404s cleanly", async ({ request }) => {
    const r = await request.get("/api/calendar/not-a-real-token.ics");
    expect(r.status()).toBe(404);
  });

  test("/api/exports unauthorized without session", async ({ request }) => {
    const r = await request.get("/api/exports/smoke-coach-demo/roster");
    // 401 (no session) or 302 redirect-to-signin both prove the gate
    // works. Anything 2xx would be a regression.
    expect([302, 401, 403]).toContain(r.status());
  });
});
