import { describe, it, expect } from "vitest";
import { navForTenantType, NEXT_STEP_BY_TYPE } from "@/lib/nav";

describe("navForTenantType", () => {
  it("returns coach nav with 6 items in order", () => {
    const items = navForTenantType("COACH");
    expect(items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Services",
      "Bookings",
      "Schedule",
      "Players",
      "Settings",
    ]);
  });

  it("coach Players nav routes to /roster (shared with institution/club)", () => {
    const items = navForTenantType("COACH", "alej");
    expect(items.find((i) => i.label === "Players")?.href).toBe("/t/alej/roster");
  });

  it("coach Services nav routes to /programs (shared with institution)", () => {
    const items = navForTenantType("COACH", "alej");
    expect(items.find((i) => i.label === "Services")?.href).toBe("/t/alej/programs");
  });

  it("returns institution nav with 9 items", () => {
    const items = navForTenantType("INSTITUTION");
    expect(items).toHaveLength(9);
    expect(items[0].label).toBe("Dashboard");
    expect(items.at(-1)?.label).toBe("Settings");
    expect(items.map((i) => i.label)).toContain("Programs");
    expect(items.map((i) => i.label)).toContain("Payments");
    expect(items.map((i) => i.label)).toContain("Comms");
  });

  it("returns club nav with 8 items including Tryouts + Development", () => {
    const items = navForTenantType("CLUB");
    expect(items).toHaveLength(8);
    expect(items.map((i) => i.label)).toContain("Tryouts");
    expect(items.map((i) => i.label)).toContain("Development");
    expect(items.map((i) => i.label)).toContain("Teams");
  });

  it("uses the provided slug in hrefs", () => {
    const items = navForTenantType("COACH", "coach-alej");
    expect(items[0].href).toBe("/t/coach-alej/dashboard");
  });

  it("falls back to :slug placeholder when slug omitted", () => {
    const items = navForTenantType("INSTITUTION");
    expect(items[0].href).toBe("/t/:slug/dashboard");
  });
});

describe("NEXT_STEP_BY_TYPE", () => {
  it("has tenant-typed next-step copy for all 3 types", () => {
    expect(NEXT_STEP_BY_TYPE.COACH.title).toMatch(/booking/i);
    expect(NEXT_STEP_BY_TYPE.INSTITUTION.title).toMatch(/program/i);
    expect(NEXT_STEP_BY_TYPE.CLUB.title).toMatch(/team/i);
  });

  it("builds hrefs scoped to the tenant slug", () => {
    expect(NEXT_STEP_BY_TYPE.COACH.href("alej")).toBe("/t/alej/bookings");
    expect(NEXT_STEP_BY_TYPE.INSTITUTION.href("pdx-skills")).toBe("/t/pdx-skills/programs");
    expect(NEXT_STEP_BY_TYPE.CLUB.href("cascadia")).toBe("/t/cascadia/teams");
  });
});
