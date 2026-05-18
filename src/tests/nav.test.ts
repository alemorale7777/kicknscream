import { describe, it, expect } from "vitest";
import { navForTenantType, NEXT_STEP_BY_TYPE } from "@/lib/nav";

describe("navForTenantType", () => {
  it("returns coach nav with 9 items in order", () => {
    const items = navForTenantType("COACH");
    expect(items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Services",
      "Bookings",
      "Schedule",
      "Players",
      "Messages",
      "Notes",
      "Reports",
      "Settings",
    ]);
  });

  it("coach Players nav routes to /coach/roster (portal-scoped)", () => {
    const items = navForTenantType("COACH", "alej");
    expect(items.find((i) => i.label === "Players")?.href).toBe("/t/alej/coach/roster");
  });

  it("coach Services nav routes to /coach/programs (portal-scoped)", () => {
    const items = navForTenantType("COACH", "alej");
    expect(items.find((i) => i.label === "Services")?.href).toBe("/t/alej/coach/programs");
  });

  it("returns institution nav with 10 items", () => {
    const items = navForTenantType("INSTITUTION");
    expect(items).toHaveLength(10);
    expect(items[0].label).toBe("Dashboard");
    expect(items.at(-1)?.label).toBe("Settings");
    expect(items.map((i) => i.label)).toContain("Programs");
    expect(items.map((i) => i.label)).toContain("Payments");
    expect(items.map((i) => i.label)).toContain("Messages");
    expect(items.map((i) => i.label)).toContain("Notes");
  });

  it("returns club nav with 9 items including Tryouts + Development", () => {
    const items = navForTenantType("CLUB");
    expect(items).toHaveLength(9);
    expect(items.map((i) => i.label)).toContain("Tryouts");
    expect(items.map((i) => i.label)).toContain("Development");
    expect(items.map((i) => i.label)).toContain("Teams");
    expect(items.map((i) => i.label)).toContain("Notes");
  });

  it("uses the provided slug in hrefs", () => {
    const items = navForTenantType("COACH", "coach-alej");
    expect(items[0].href).toBe("/t/coach-alej/coach/dashboard");
  });

  it("falls back to :slug placeholder when slug omitted", () => {
    const items = navForTenantType("INSTITUTION");
    expect(items[0].href).toBe("/t/:slug/coach/dashboard");
  });
});

describe("NEXT_STEP_BY_TYPE", () => {
  it("has tenant-typed next-step copy for all 3 types", () => {
    expect(NEXT_STEP_BY_TYPE.COACH.title).toMatch(/booking/i);
    expect(NEXT_STEP_BY_TYPE.INSTITUTION.title).toMatch(/program/i);
    expect(NEXT_STEP_BY_TYPE.CLUB.title).toMatch(/team/i);
  });

  it("builds hrefs scoped to the tenant slug", () => {
    expect(NEXT_STEP_BY_TYPE.COACH.href("alej")).toBe("/t/alej/coach/bookings");
    expect(NEXT_STEP_BY_TYPE.INSTITUTION.href("pdx-skills")).toBe(
      "/t/pdx-skills/coach/programs"
    );
    expect(NEXT_STEP_BY_TYPE.CLUB.href("cascadia")).toBe("/t/cascadia/teams");
  });
});
