import { db } from "@/lib/db";

/**
 * Canonical action names. Centralized so the /admin/audit UI and any future
 * webhook subscribers can pattern-match without scanning every actions/*.ts.
 *
 * KNS-21 (audit rollup) added: booking.create, event.*, team.member_invite,
 * team.member_remove, payment.record, roster.player_add.
 *
 * Pre-Sprint-2 actions (attendance.*, permission.*, refund, data.export,
 * roster.bulk_import, bookingDraft.*) write their own action names directly
 * and are listed here for the autocomplete only — they can stay untouched.
 */
export type AuditAction =
  | "booking.create"
  | "event.create"
  | "event.update"
  | "event.delete"
  | "team.member_invite"
  | "team.member_remove"
  | "payment.record"
  | "roster.player_add"
  // pre-Sprint-2 (kept for type completeness; emitted directly)
  | "attendance.mark"
  | "attendance.bulk"
  | "permission.override"
  | "permission.reset"
  | "refund.create"
  | "data.export"
  | "roster.bulk_import"
  | "bookingDraft.create"
  | "team.role_change"
  | (string & {});

/**
 * Write a single audit-log row. Catches and logs (does not throw) so an
 * audit-write failure can never break the user-facing action — auditing
 * should observe state, not gate it.
 */
export async function logAudit(input: {
  tenantId: string;
  actorUserId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        diff: input.diff ? (input.diff as object) : undefined,
      },
    });
  } catch (err) {
    console.error("[audit] write failed", {
      action: input.action,
      tenantId: input.tenantId,
      err,
    });
  }
}
