"use server";

import { z } from "zod";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canManageTenant, STAFF_ROLES } from "@/lib/roles";
import { logAudit, emailHash } from "@/lib/audit";
import {
  sendParentDeletionRequestEmail,
  sendParentDeletionReceiptEmail,
} from "@/lib/email";

const requestSchema = z.object({
  tenantId: z.string(),
  parentId: z.string(),
});

/**
 * Staff-invoked: issues a single-use confirmation token to the parent's
 * email. Does NOT anonymize anything — that only runs after the parent
 * clicks the link and `confirmParentDeletionAction` fires.
 */
export async function requestParentDeletionAction(
  input: z.infer<typeof requestSchema>
): Promise<void> {
  const data = requestSchema.parse(input);
  // Lazy-import to keep the confirm action's import graph free of next-auth
  // (so the vitest integration test can load the module without dialing
  // /api/auth — the email-link confirm path is unauthenticated).
  const { getCurrentUser } = await import("@/lib/tenant");
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const m = user.memberships.find((x) => x.tenantId === data.tenantId);
  if (!m || !canManageTenant(m.role)) throw new Error("Forbidden");
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: data.tenantId },
  });
  const parent = await db.parent.findUniqueOrThrow({
    where: { id: data.parentId },
  });

  if (parent.deletedAt) throw new Error("Parent already deleted");

  const token = randomBytes(24).toString("base64url");
  await db.parent.update({
    where: { id: parent.id },
    data: {
      pendingDeletionToken: token,
      pendingDeletionRequestedAt: new Date(),
      pendingDeletionRequestedBy: user.id,
    },
  });

  await sendParentDeletionRequestEmail({
    to: parent.email,
    parentName: parent.name,
    confirmUrl: `${env.NEXTAUTH_URL}/confirm-deletion/${token}`,
    tenantName: tenant.name,
  });

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "parent.delete_request",
    targetType: "parent",
    targetId: parent.id,
    diff: { emailHash: emailHash(parent.email) },
  });
}

/**
 * Parent-invoked via email link. No auth — the click itself IS consent.
 *
 * Transaction order is load-bearing: audit row fires FIRST so that a crash
 * mid-anonymization still leaves a forensic record. Original email + name
 * are captured into locals BEFORE step 2 zeroes them on the row.
 */
export async function confirmParentDeletionAction(token: string): Promise<void> {
  const parent = await db.parent.findUnique({
    where: { pendingDeletionToken: token },
  });
  if (!parent || !parent.pendingDeletionRequestedAt) {
    redirect("/confirm-deletion/expired");
  }
  if (
    parent.pendingDeletionRequestedAt <
    new Date(Date.now() - 7 * 86400 * 1000)
  ) {
    redirect("/confirm-deletion/expired");
  }

  // Capture the original email + name BEFORE anonymization (Section 5 step 1
  // of the parent-model split spec). Receipt email needs these.
  const originalEmail = parent.email;
  const originalName = parent.name;

  // Get every affected tenant for fan-out audit rows.
  const tenantParents = await db.tenantParent.findMany({
    where: { parentId: parent.id },
    select: { tenantId: true },
  });

  await db.$transaction(async (tx) => {
    // 1. Audit FIRST (global event) — survives even if a later step crashes.
    await tx.auditLog.create({
      data: {
        tenantId: null,
        actorUserId: parent.userId,
        action: "parent.delete_complete",
        targetType: "parent",
        targetId: parent.id,
        diff: {
          emailHash: emailHash(originalEmail),
          tenantsAffected: tenantParents.length,
        },
      },
    });

    // 1b. Per-tenant revoke audit rows with back-pointer.
    for (const tp of tenantParents) {
      await tx.auditLog.create({
        data: {
          tenantId: tp.tenantId,
          actorUserId: parent.userId,
          action: "tenant_parent.revoke",
          targetType: "tenant_parent",
          targetId: parent.id,
          diff: { reason: "global_delete" },
        },
      });
    }

    // 2. Anonymize Parent.
    await tx.parent.update({
      where: { id: parent.id },
      data: {
        email: `deleted-${parent.id}@kicknscream.invalid`,
        name: null,
        phone: null,
        userId: null,
        deletedAt: new Date(),
        pendingDeletionToken: null,
        pendingDeletionRequestedAt: null,
        pendingDeletionRequestedBy: null,
      },
    });

    // 3. Revoke every TenantParent (keep rows for audit).
    await tx.tenantParent.updateMany({
      where: { parentId: parent.id },
      data: { status: "REVOKED", revokedAt: new Date(), notes: null },
    });

    // 4. Players: orphan-vs-active split. A player with any enrollment or
    // attendance history gets a "Former Player <id-slice>" tombstone so the
    // historical record is still readable; pure-orphans become "Deleted
    // Player" with a sentinel DOB so no PII remains.
    const players = await tx.player.findMany({
      where: { parentRefId: parent.id },
      select: { id: true },
    });
    for (const p of players) {
      const [enrollCount, attendCount] = await Promise.all([
        tx.enrollment.count({
          where: { playerId: p.id, status: { in: ["ACTIVE", "PENDING"] } },
        }),
        tx.attendance.count({ where: { playerId: p.id } }),
      ]);
      const hasActivity = enrollCount > 0 || attendCount > 0;
      await tx.player.update({
        where: { id: p.id },
        data: hasActivity
          ? {
              firstName: "Former",
              lastName: `Player ${p.id.slice(0, 6)}`,
              notes: null,
              parentRefId: null,
            }
          : {
              firstName: "Deleted",
              lastName: "Player",
              dob: new Date("1900-01-01"),
              notes: null,
              parentRefId: null,
            },
      });
    }

    // 5. Invoice payerEmail hashing — replace plaintext with HMAC stub so
    // the row still joins for accounting but can't be re-identified.
    const invoices = await tx.invoice.findMany({
      where: {
        enrollments: { some: { player: { parentRefId: parent.id } } },
      },
      select: { id: true },
    });
    if (invoices.length > 0) {
      await tx.invoice.updateMany({
        where: { id: { in: invoices.map((i) => i.id) } },
        data: { payerEmail: `${emailHash(originalEmail)}@deleted` },
      });
    }

    // 6. Drop ParentPlayer rows. Players themselves stay (they were
    // tombstoned above); only the guardianship rows tying them to the
    // deleted Parent disappear.
    await tx.parentPlayer.deleteMany({ where: { parentRefId: parent.id } });

    // 7. Delete NextAuth User ONLY if no staff memberships remain. Someone
    // who is a coach at Tenant B and a parent at Tenant A keeps their User
    // row when their Parent identity is deleted.
    if (parent.userId) {
      const stillStaff = await tx.membership.count({
        where: {
          userId: parent.userId,
          role: { in: STAFF_ROLES },
        },
      });
      if (stillStaff === 0) {
        await tx.user.delete({ where: { id: parent.userId } });
      }
    }
  });

  // 8. Send receipt to the ORIGINAL email OUTSIDE the transaction. Email
  // failures must not roll back the anonymization.
  try {
    await sendParentDeletionReceiptEmail({
      to: originalEmail,
      parentName: originalName,
    });
  } catch (e) {
    console.error("[parent-deletion] receipt email failed", e);
  }

  redirect("/confirm-deletion/done");
}
