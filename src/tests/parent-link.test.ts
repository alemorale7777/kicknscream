import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhone, matchParent } from "@/lib/parent-link";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  HELLO@example.COM ")).toBe("hello@example.com");
  });
  it("returns null for empty / whitespace", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("strips non-digits", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
  });
  it("returns null for empty", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  it("strips a leading US country code on 11-digit numbers", () => {
    expect(normalizePhone("+1 555 123 4567")).toBe("5551234567");
    expect(normalizePhone("1-555-123-4567")).toBe("5551234567");
  });
  it("leaves non-US-country-code numbers alone", () => {
    expect(normalizePhone("44 7700 900123")).toBe("447700900123");
  });
});

describe("matchParent", () => {
  const A = { id: "a", email: "jamie@example.com", phone: "555-123-4567" };
  const B = { id: "b", email: "other@example.com", phone: "(555) 999-1234" };
  const C = { id: "c", email: "Jamie@Example.com", phone: null };

  it("matches by lowercased email", () => {
    expect(matchParent([A, B], { email: "JAMIE@example.com", phone: null })?.id).toBe("a");
  });
  it("matches by normalized phone if no email match", () => {
    expect(matchParent([A, B], { email: "new@nope.com", phone: "+1 555 123 4567" })?.id).toBe("a");
  });
  it("returns null when nothing matches", () => {
    expect(matchParent([A, B], { email: "new@nope.com", phone: null })).toBeNull();
  });
  it("prefers email match over phone match", () => {
    expect(
      matchParent([A, B, C], { email: "jamie@example.com", phone: "(555) 999-1234" })?.id
    ).toBe("a");
  });
});
