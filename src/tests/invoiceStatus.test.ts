import { describe, it, expect } from "vitest";
import { invoiceDisplayStatus, isInvoiceOverdue } from "@/lib/invoiceStatus";

const NOW = new Date("2026-05-19T18:00:00Z");
const YESTERDAY = new Date("2026-05-18T18:00:00Z");
const TOMORROW = new Date("2026-05-20T18:00:00Z");

describe("invoiceDisplayStatus", () => {
  it("returns PAID unchanged even when dueAt is past", () => {
    expect(
      invoiceDisplayStatus(
        { status: "PAID", dueAt: YESTERDAY },
        NOW
      )
    ).toBe("PAID");
  });

  it("returns VOIDED unchanged", () => {
    expect(
      invoiceDisplayStatus(
        { status: "VOIDED", dueAt: YESTERDAY },
        NOW
      )
    ).toBe("VOIDED");
  });

  it("returns OVERDUE when SENT and dueAt is past", () => {
    expect(
      invoiceDisplayStatus(
        { status: "SENT", dueAt: YESTERDAY },
        NOW
      )
    ).toBe("OVERDUE");
  });

  it("returns OVERDUE when PARTIAL and dueAt is past", () => {
    expect(
      invoiceDisplayStatus(
        { status: "PARTIAL", dueAt: YESTERDAY },
        NOW
      )
    ).toBe("OVERDUE");
  });

  it("stays SENT when dueAt is in the future", () => {
    expect(
      invoiceDisplayStatus(
        { status: "SENT", dueAt: TOMORROW },
        NOW
      )
    ).toBe("SENT");
  });

  it("stays SENT when dueAt is null (day-0 invoices never auto-OVERDUE)", () => {
    expect(
      invoiceDisplayStatus(
        { status: "SENT", dueAt: null },
        NOW
      )
    ).toBe("SENT");
  });
});

describe("isInvoiceOverdue", () => {
  it("true only when the display label is OVERDUE", () => {
    expect(isInvoiceOverdue({ status: "SENT", dueAt: YESTERDAY }, NOW)).toBe(true);
    expect(isInvoiceOverdue({ status: "SENT", dueAt: TOMORROW }, NOW)).toBe(false);
    expect(isInvoiceOverdue({ status: "PAID", dueAt: YESTERDAY }, NOW)).toBe(false);
  });
});
