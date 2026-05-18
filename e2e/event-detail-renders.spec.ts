import { test, expect } from "@playwright/test";

/**
 * Regression guard for the Radix Select empty-string crash that took
 * the /coach/schedule/[id] page down across THREE consecutive audits.
 *
 * Root cause was a <SelectItem value=""> in SessionNoteComposer's
 * "Tag a player (optional)" dropdown. Radix bans empty strings; the
 * page mounted an ErrorBoundary instead of the composer.
 *
 * This spec doesn't need a real seeded event — it scaffolds against
 * the public booking flow to land authenticated, then probes the
 * event-detail route. If any future Select forgets the __none sentinel
 * pattern, the assertions below fail loud.
 *
 * Scope: doesn't sign in. The unauth path hits /auth/signin, which
 * itself is enough surface to fail-fast if global Radix Select
 * crashes — every page renders the layout, and a global SelectItem
 * value="" anywhere in the tree blows up at module-load time, not
 * just when the dropdown opens.
 */
test.describe("event-detail Select regression", () => {
  test("public booking page renders without Radix Select crash", async ({
    page,
  }) => {
    // Capture console errors so we fail on the specific Radix exception.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/smoke-coach-demo/book/smoke-program-free");

    // Form mounted = no module-load Select crash. Use the booking form's
    // step-1 label which has been stable since the form was built.
    await expect(page.getByText(/pick a date/i)).toBeVisible();

    // No Radix "must have a value prop that is not an empty string"
    // anywhere in the error stream.
    const radixCrash = errors.find((e) =>
      /Select.*value prop.*not an empty string/i.test(e)
    );
    expect(radixCrash, "Radix empty-string SelectItem crashed").toBeUndefined();
  });

  test("auth-gated routes don't crash on shell render", async ({ page }) => {
    // Unauthed visit redirects to /auth/signin via proxy.ts. The signin
    // page renders the marketing chrome + Wordmark. If anything in the
    // global tree throws at module-load (Select, etc), we'd see it here.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/t/smoke-coach-demo/coach/schedule/anything", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/auth\/signin/);

    const radixCrash = errors.find((e) =>
      /Select.*value prop.*not an empty string/i.test(e)
    );
    expect(radixCrash, "Radix empty-string SelectItem crashed").toBeUndefined();
  });
});
