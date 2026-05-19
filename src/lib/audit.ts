import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

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
  // one-off ops actions (Phase B parent-model split, etc.)
  | "data.parent_backfill"
  | "data.audit_backfill"
  // Phase B parent-model split — parent CRUD + claim + delete-request lifecycle
  | "parent.create"
  | "parent.claim"
  | "parent.update"
  | "parent.merge"
  | "parent.delete_request"
  | "parent.delete_request_expired"
  | "parent.delete_complete"
  | "parent.delete_complete_admin_override"
  | "parent.claim_email_sent"
  | "tenant_parent.add"
  | "tenant_parent.revoke"
  | "tenant_parent.restore"
  | "tenant_parent.notes_update"
  | (string & {});

/**
 * Write a single audit-log row. Catches and logs (does not throw) so an
 * audit-write failure can never break the user-facing action — auditing
 * should observe state, not gate it.
 *
 * `tenantId` accepts `null` for one-off ops actions (e.g. data backfills)
 * that span the whole instance rather than a single tenant. The DB column
 * is nullable to support this.
 */
export async function logAudit(input: {
  tenantId: string | null;
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

/**
 * HMAC-SHA256 of a normalized email, truncated to 16 hex chars. Used in
 * audit-log diffs so audit rows never contain re-identifiable PII (an
 * attacker who exfiltrates the audit table cannot brute-force common emails
 * without also having the server-side AUDIT_EMAIL_HMAC_SECRET).
 *
 * Deterministic — given the same input + secret, always returns the same
 * hash. Investigators can rehash a known email and search for matches.
 */
export function emailHash(email: string): string {
  const secret = env.AUDIT_EMAIL_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      "AUDIT_EMAIL_HMAC_SECRET is not set. Set it on Vercel " +
        "(production + preview + development) — generate with `openssl rand -hex 32`."
    );
  }
  return createHmac("sha256", secret)
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}
