import { test, expect } from "@playwright/test";

/**
 * Full happy-path e2e — a parent finds the smoke-coach-demo tenant's
 * Free Discovery Session, walks the 3-step form, and lands on the
 * success page. Exercises:
 *
 *  - public tenant page renders the service catalog
 *  - booking form mounts (date + time + parent + player + submit)
 *  - createBookingAction completes server-side
 *  - free-path redirects to /{slug}/book/success?invoice=…
 *
 * The free program is deliberately chosen so we don't touch Stripe.
 * Stripe checkout would redirect off-platform and time out the run.
 */
test.describe("booking flow — free program", () => {
  const slug = "smoke-coach-demo";
  const freeProgramId = "smoke-program-free";

  test("parent books a free discovery session", async ({ page }) => {
    // Cache-bust the email so reruns don't dedupe into an existing parent
    // user with prior bookings + side-effects.
    const stamp = Date.now();
    const email = `e2e+${stamp}@kicknscream.dev`;

    await page.goto(`/${slug}/book/${freeProgramId}`);

    await expect(page.getByText(/pick a date/i)).toBeVisible();

    // Form already has tomorrow + 10am pre-filled — just fill parent + player.
    await page.getByLabel(/parent name/i).fill("E2E Parent");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/first name/i).fill("Test");
    await page.getByLabel(/last name/i).fill("Kid");

    // DOB — 10 years ago, fixed.
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 10);
    const dobStr = dob.toISOString().slice(0, 10);
    await page.getByLabel(/date of birth/i).fill(dobStr);

    // Submit and follow the redirect.
    await Promise.all([
      page.waitForURL(/\/book\/success/, { timeout: 30_000 }),
      page.getByRole("button", { name: /confirm booking|continue to payment/i }).click(),
    ]);

    await expect(page).toHaveURL(/\/book\/success/);
    await expect(page.getByText(/booked|confirmed|success/i).first()).toBeVisible();
  });
});
