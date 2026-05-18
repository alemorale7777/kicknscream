import { test, expect } from "@playwright/test";

/**
 * Sanity checks around the auth surface. We don't sign in via magic link
 * in CI (Resend would actually send mail), so we just verify the gates
 * behave: protected URLs bounce to /auth/signin and the form renders.
 */
test.describe("auth gates", () => {
  test("/onboarding redirects unauthed users to sign-in with callback", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page.waitForURL(/\/auth\/signin/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe("/onboarding");
  });

  test("/t/<slug>/coach/dashboard redirects unauthed users", async ({ page }) => {
    await page.goto("/t/smoke-coach-demo/coach/dashboard");
    await page.waitForURL(/\/auth\/signin/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toContain("/coach/dashboard");
  });

  test("/auth/signin renders the magic-link form", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByText(/sign in/i).first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
