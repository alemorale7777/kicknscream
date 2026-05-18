import { test, expect } from "@playwright/test";

/**
 * Smoke test for the public tenant page. We hit the demo tenant that's
 * always deployed alongside production. If this fails, something about
 * the public marketing surface broke.
 */
test.describe("public tenant page", () => {
  const slug = "smoke-coach-demo";

  test("renders hero + faq + json-ld", async ({ page }) => {
    await page.goto(`/${slug}`);

    // Hero — name, tagline, primary CTA visible.
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(/sign in/i).first()).toBeVisible();

    // FAQ accordion — at least one question rendered as a <summary>.
    const faqSummaries = page.locator("details > summary");
    await expect(faqSummaries.first()).toBeVisible();

    // LocalBusiness JSON-LD is in the head.
    const jsonLdCount = await page.locator('script[type="application/ld+json"]').count();
    expect(jsonLdCount).toBeGreaterThanOrEqual(1);
  });

  test("opens the booking flow for a program", async ({ page }) => {
    await page.goto(`/${slug}`);
    const bookLink = page.locator('a[href*="/book/"]').first();
    if (await bookLink.count()) {
      await bookLink.click();
      await expect(page).toHaveURL(/\/book\//);
      // First step label.
      await expect(page.getByText(/pick a date/i)).toBeVisible();
    } else {
      test.skip(true, "demo tenant has no public services right now");
    }
  });
});
