import type { Invoice, InvoiceStatus } from "@prisma/client";

/**
 * Single source of truth for the *display* status of an invoice — used by
 * the coach UI, the dashboard "Outstanding" tile, and the CSV export so they
 * never disagree.
 *
 * Rules (in order):
 *   1. Terminal states win: PAID / VOIDED / REFUNDED (no REFUNDED in the
 *      enum today; PAID|VOIDED only) → return the stored status.
 *   2. If a dueAt is set and is in the past, surface OVERDUE — even if the
 *      stored status is still SENT / PARTIAL.
 *   3. Otherwise return the stored status.
 *
 * NOTE: this replaces the old `isPast(invoice.createdAt)` heuristic, which
 * flagged brand-new invoices OVERDUE on day 0.
 */
export type InvoiceLike = Pick<Invoice, "status" | "dueAt"> & {
  // dueAt is added by Sprint 2 — accept missing on rows from older queries
  dueAt?: Date | null;
};

export function invoiceDisplayStatus(
  invoice: InvoiceLike,
  now: Date = new Date()
): InvoiceStatus {
  if (invoice.status === "PAID" || invoice.status === "VOIDED") {
    return invoice.status;
  }
  if (invoice.dueAt && invoice.dueAt.getTime() < now.getTime()) {
    return "OVERDUE";
  }
  return invoice.status;
}

export function isInvoiceOverdue(
  invoice: InvoiceLike,
  now: Date = new Date()
): boolean {
  return invoiceDisplayStatus(invoice, now) === "OVERDUE";
}
