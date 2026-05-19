import { describe, it, expect } from "vitest";
import { wasConsumed, computePackDelta } from "@/lib/packBalance";

describe("wasConsumed", () => {
  it("returns true for PRESENT and LATE", () => {
    expect(wasConsumed("PRESENT")).toBe(true);
    expect(wasConsumed("LATE")).toBe(true);
  });
  it("returns false for ABSENT, EXCUSED, PENDING, and null", () => {
    expect(wasConsumed("ABSENT")).toBe(false);
    expect(wasConsumed("EXCUSED")).toBe(false);
    expect(wasConsumed("PENDING")).toBe(false);
    expect(wasConsumed(null)).toBe(false);
  });
});

describe("computePackDelta", () => {
  it("decrements when transitioning from not-consumed to consumed", () => {
    expect(computePackDelta(null, "PRESENT")).toBe(-1);
    expect(computePackDelta("ABSENT", "LATE")).toBe(-1);
    expect(computePackDelta("EXCUSED", "PRESENT")).toBe(-1);
    expect(computePackDelta("PENDING", "PRESENT")).toBe(-1);
  });
  it("increments when transitioning from consumed to not-consumed", () => {
    expect(computePackDelta("PRESENT", "EXCUSED")).toBe(1);
    expect(computePackDelta("LATE", "ABSENT")).toBe(1);
    expect(computePackDelta("PRESENT", "PENDING")).toBe(1);
  });
  it("is a no-op when both states are consumed or both are not", () => {
    expect(computePackDelta("PRESENT", "LATE")).toBe(0);
    expect(computePackDelta("LATE", "PRESENT")).toBe(0);
    expect(computePackDelta("ABSENT", "EXCUSED")).toBe(0);
    expect(computePackDelta(null, "ABSENT")).toBe(0);
    expect(computePackDelta(null, null)).toBe(0);
  });
});
