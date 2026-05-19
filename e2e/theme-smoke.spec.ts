import { test, expect } from "@playwright/test";

/**
 * C.1 smoke — verify the [data-theme] / .light CSS palette swap is wired
 * up. We toggle the `light` class on <html> from JS (bypassing next-themes
 * since the UserMenu is gated behind auth in e2e) and assert that the
 * computed background-color of <body> visibly differs from the dark
 * default. Validates that the `:root.light` block in globals.css is
 * actually being applied.
 */
test("light theme palette swap applies on .light html class", async ({ page }) => {
  await page.goto("/auth/signin");

  // Force the dark class (defaultTheme is "system" now, so headless
  // Chromium may have hydrated into either palette depending on its
  // prefers-color-scheme — pin it explicitly).
  await page.evaluate(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  });
  const darkBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );
  expect(darkBg).toBeTruthy();

  // Flip to light.
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  });
  const lightBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );

  expect(lightBg).not.toBe(darkBg);

  // Sanity check the palette: light bg should look near-white, dark bg
  // should look near-black. Parse the rgb() values and compare luminance.
  const rgb = (s: string) => {
    const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) throw new Error(`bad color: ${s}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const [dr, dg, db] = rgb(darkBg);
  const [lr, lg, lb] = rgb(lightBg);
  const darkLuma = (dr + dg + db) / 3;
  const lightLuma = (lr + lg + lb) / 3;
  expect(lightLuma).toBeGreaterThan(darkLuma);
  expect(lightLuma).toBeGreaterThan(200); // near-white
  expect(darkLuma).toBeLessThan(40); // near-black

  // Flip back so the assertion order didn't leak side-effects.
  await page.evaluate(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  });
});
