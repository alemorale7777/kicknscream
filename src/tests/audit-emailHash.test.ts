import { describe, expect, it, beforeAll } from "vitest";
import { emailHash } from "@/lib/audit";

describe("emailHash", () => {
  beforeAll(() => {
    // Test env file already loads AUDIT_EMAIL_HMAC_SECRET; if missing, skip.
    if (!process.env.AUDIT_EMAIL_HMAC_SECRET) {
      process.env.AUDIT_EMAIL_HMAC_SECRET = "test-secret-".padEnd(64, "x");
    }
  });

  it("returns a 16-char hex string", () => {
    const h = emailHash("test@example.com");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", () => {
    expect(emailHash("a@b.com")).toBe(emailHash("a@b.com"));
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(emailHash("  A@B.COM  ")).toBe(emailHash("a@b.com"));
  });

  it("produces different hashes for different inputs", () => {
    expect(emailHash("a@b.com")).not.toBe(emailHash("a@c.com"));
  });
});
