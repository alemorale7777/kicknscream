import { describe, expect, it } from "vitest";
import {
  formatEventTime,
  formatEventDate,
  formatEventShort,
  toTenantLocalIsoMinute,
  fromTenantLocalIsoMinute,
} from "@/lib/datetime";

const PT = "America/Los_Angeles";
const ET = "America/New_York";

describe("formatEventTime", () => {
  it("renders a UTC instant in the tenant's local timezone", () => {
    // 2026-05-20T00:50:00Z === 2026-05-19 17:50 PT
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(formatEventTime(instant, PT)).toBe("5:50 PM");
  });

  it("respects a non-default tenant timezone", () => {
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(formatEventTime(instant, ET)).toBe("8:50 PM");
  });
});

describe("formatEventDate", () => {
  it("formats long-form date in tenant timezone", () => {
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(formatEventDate(instant, PT)).toBe("Tuesday, May 19");
  });

  it("crosses midnight boundary correctly", () => {
    // 2026-05-20T06:00:00Z === 2026-05-19 23:00 PT, 2026-05-20 02:00 ET
    const instant = new Date("2026-05-20T06:00:00Z");
    expect(formatEventDate(instant, PT)).toBe("Tuesday, May 19");
    expect(formatEventDate(instant, ET)).toBe("Wednesday, May 20");
  });
});

describe("formatEventShort", () => {
  it("formats short day+time in tenant timezone", () => {
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(formatEventShort(instant, PT)).toBe("Tue 5:50 PM");
  });
});

describe("tenant-local ISO minute round trip", () => {
  it("converts UTC instant → tenant-local 'YYYY-MM-DDTHH:mm' string", () => {
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(toTenantLocalIsoMinute(instant, PT)).toBe("2026-05-19T17:50");
  });

  it("converts tenant-local 'YYYY-MM-DDTHH:mm' string → UTC instant", () => {
    const utc = fromTenantLocalIsoMinute("2026-05-19T17:50", PT);
    expect(utc.toISOString()).toBe("2026-05-20T00:50:00.000Z");
  });

  it("round-trips without drift", () => {
    const original = new Date("2026-07-04T19:30:00Z");
    const localStr = toTenantLocalIsoMinute(original, PT);
    const back = fromTenantLocalIsoMinute(localStr, PT);
    expect(back.toISOString()).toBe(original.toISOString());
  });

  it("handles DST forward jump (PT spring-forward 2026-03-08)", () => {
    // 2026-03-08T10:30Z = 2026-03-08 03:30 PDT (skipping 2:30 PST)
    const localStr = "2026-03-08T03:30";
    const utc = fromTenantLocalIsoMinute(localStr, PT);
    expect(utc.toISOString()).toBe("2026-03-08T10:30:00.000Z");
  });
});
