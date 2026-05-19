import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REDACT_AFTER_DAYS = 90;
const TOKEN_EXPIRY_DAYS = 7;
const REDACTED_MARKER = "[redacted-by-policy]";

/**
 * Daily — two janitorial jobs that keep PII exposure bounded.
 *
 * 1. PII redaction on old audit rows. AuditLog rows persist longer than the
 *    Parent rows they describe (we keep audit history for ops/compliance
 *    even after a parent.delete_complete), which means a 2-year-old audit
 *    diff would otherwise still hold a parent's name/email/phone in the
 *    `before`/`after` JSON. After REDACT_AFTER_DAYS we rewrite those three
 *    fields to "[redacted-by-policy]" while leaving the rest of the diff
 *    (action, actor, timestamp, target IDs) intact so audit trails stay
 *    investigable.
 *
 * 2. Stale deletion-request token cleanup. parent.delete_request issues a
 *    confirmation token with a finite life (TOKEN_EXPIRY_DAYS). If the
 *    parent never clicks the link we clear the token columns so a
 *    week-old phished email link is dead, and log
 *    `parent.delete_request_expired` per tenant link for audit.
 *
 * Both jobs are idempotent and pure cleanup — running this twice in a row
 * is a no-op on the second pass.
 */
export async function GET() {
  try {
    await assertCronAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const cutoffPii = new Date(now - REDACT_AFTER_DAYS * 86400 * 1000);
  const cutoffToken = new Date(now - TOKEN_EXPIRY_DAYS * 86400 * 1000);

  // Job 1: redact PII in old audit rows for parent.{create,update,claim}.
  const candidates = await db.auditLog.findMany({
    where: {
      createdAt: { lt: cutoffPii },
      action: { in: ["parent.update", "parent.create", "parent.claim"] },
    },
    select: { id: true, diff: true },
  });
  let redacted = 0;
  for (const row of candidates) {
    const diff = row.diff as Record<string, unknown> | null;
    if (!diff) continue;
    const fixedDiff: Record<string, unknown> = { ...diff };
    let touched = false;
    for (const key of ["before", "after"] as const) {
      const sub = diff[key] as Record<string, unknown> | undefined;
      if (sub && typeof sub === "object") {
        const redactedSub: Record<string, unknown> = { ...sub };
        for (const field of ["name", "email", "phone"]) {
          if (
            redactedSub[field] !== undefined &&
            redactedSub[field] !== null &&
            redactedSub[field] !== REDACTED_MARKER
          ) {
            redactedSub[field] = REDACTED_MARKER;
            touched = true;
          }
        }
        fixedDiff[key] = redactedSub;
      }
    }
    if (touched) {
      await db.auditLog.update({
        where: { id: row.id },
        data: { diff: fixedDiff as object },
      });
      redacted++;
    }
  }

  // Job 2: clear stale parent.pendingDeletionToken values.
  const stale = await db.parent.findMany({
    where: {
      pendingDeletionToken: { not: null },
      pendingDeletionRequestedAt: { lt: cutoffToken },
    },
    select: { id: true, tenantLinks: { select: { tenantId: true } } },
  });
  for (const p of stale) {
    await db.parent.update({
      where: { id: p.id },
      data: {
        pendingDeletionToken: null,
        pendingDeletionRequestedAt: null,
        pendingDeletionRequestedBy: null,
      },
    });
    for (const link of p.tenantLinks) {
      await logAudit({
        tenantId: link.tenantId,
        action: "parent.delete_request_expired",
        targetType: "parent",
        targetId: p.id,
      });
    }
  }

  console.log("[cron:audit-redact]", {
    at: new Date().toISOString(),
    auditCandidates: candidates.length,
    redacted,
    tokensExpired: stale.length,
  });

  return NextResponse.json({
    ok: true,
    auditCandidates: candidates.length,
    redacted,
    tokensExpired: stale.length,
  });
}
