import { describe, it, expect } from "vitest";
import { generateSlug, isReservedSlug } from "@/lib/slug";

describe("generateSlug", () => {
  it("lowercases and hyphenates a normal name", () => {
    expect(generateSlug("Coach Alej")).toBe("coach-alej");
  });

  it("strips punctuation", () => {
    expect(generateSlug("PDX Skills!")).toBe("pdx-skills");
  });

  it("strips emoji", () => {
    expect(generateSlug("Cascadia FC ⚽")).toBe("cascadia-fc");
  });

  it("collapses multiple spaces and hyphens", () => {
    expect(generateSlug("  Multi   Word --  Name  ")).toBe("multi-word-name");
  });

  it("transliterates accented chars", () => {
    expect(generateSlug("Niño Fútbol")).toBe("nino-futbol");
  });

  it("returns 'tenant' for empty input", () => {
    expect(generateSlug("")).toBe("tenant");
  });

  it("returns 'tenant' for input that is only punctuation", () => {
    expect(generateSlug("!!!")).toBe("tenant");
  });

  it("truncates to 48 chars", () => {
    const long = "a".repeat(80);
    expect(generateSlug(long).length).toBeLessThanOrEqual(48);
  });

  it("preserves numbers", () => {
    expect(generateSlug("U10 Skills 2026")).toBe("u10-skills-2026");
  });

  it("handles leading and trailing separators after truncation", () => {
    const tricky = "a".repeat(47) + " ";
    expect(generateSlug(tricky)).not.toMatch(/-$/);
  });
});

describe("isReservedSlug", () => {
  it("flags reserved app paths", () => {
    expect(isReservedSlug("api")).toBe(true);
    expect(isReservedSlug("dashboard")).toBe(true);
    expect(isReservedSlug("settings")).toBe(true);
    expect(isReservedSlug("t")).toBe(true);
  });

  it("allows normal slugs", () => {
    expect(isReservedSlug("coach-alej")).toBe(false);
    expect(isReservedSlug("pdx-skills")).toBe(false);
  });
});
