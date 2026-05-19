"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import {
  mergeParents,
  revokeTenantAccess,
  restoreTenantAccess,
  issueClaimToken,
} from "@/lib/parents";
import { logAudit, emailHash } from "@/lib/audit";
import { sendBookingConfirmation } from "@/lib/email";
import { env } from "@/lib/env";

/**
 * Coach/admin-side server actions for the Parent model split. All mutations
 * go through `assertCanManage` to confirm the caller is OWNER/ADMIN at the
 * target tenant and write an audit row keyed off the tenant for the
 * /admin/audit timeline.
 */
async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage parents");
  }
  return { user, membership };
}

const updateSchema = z.object({
  tenantId: z.string(),
  parentId: z.string(),
  name: z.string().max(120).optional().nullable(),
  email: z.string().email(),
  phone: z.string().max(40).optional().nullable(),
});

/**
 * Edit the global Parent row (name/email/phone). Email is normalized
 * lowercase and uniqueness-checked against every other Parent. If the parent
 * has already claimed a User account, the User.email is updated in the same
 * transaction so the sign-in identity stays in sync.
 */
export async function updateParentAction(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });

  const before = await db.parent.findUniqueOrThrow({ where: { id: data.parentId } });
  const normalizedEmail = data.email.trim().toLowerCase();

  if (normalizedEmail !== before.email) {
    const collision = await db.parent.findUnique({ where: { email: normalizedEmail } });
    if (collision && collision.id !== before.id) {
      throw new Error("Another parent already uses this email");
    }
  }

  await db.$transaction(async (tx) => {
    await tx.parent.update({
      where: { id: data.parentId },
      data: {
        name: data.name ?? null,
        email: normalizedEmail,
        phone: data.phone ?? null,
      },
    });
    if (before.userId && normalizedEmail !== before.email) {
      await tx.user.update({
        where: { id: before.userId },
        data: { email: normalizedEmail },
      });
    }
  });

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id ?? null,
    action: "parent.update",
    targetType: "parent",
    targetId: data.parentId,
    diff: {
      before: { name: before.name, email: before.email, phone: before.phone },
      after: { name: data.name ?? null, email: normalizedEmail, phone: data.phone ?? null },
    },
  });
  revalidatePath(`/t/${tenant.slug}/coach/parents/${data.parentId}`);
}

const tenantParentScope = z.object({
  tenantId: z.string(),
  parentId: z.string(),
});

/**
 * Revoke a parent's access at this tenant only — the global Parent row is
 * untouched. The detail page filters REVOKED differently in the family
 * portal gate (requireParentAccess).
 */
export async function revokeParentAccessAction(input: z.infer<typeof tenantParentScope>) {
  const data = tenantParentScope.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  await revokeTenantAccess(db, data);
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id ?? null,
    action: "tenant_parent.revoke",
    targetType: "tenant_parent",
    targetId: data.parentId,
  });
  revalidatePath(`/t/${tenant.slug}/coach/parents/${data.parentId}`);
}

/**
 * Reverse a prior revoke at this tenant. Idempotent — restoring an already
 * ACTIVE row is a no-op (Prisma updates the same fields to the same values).
 */
export async function restoreParentAccessAction(input: z.infer<typeof tenantParentScope>) {
  const data = tenantParentScope.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  await restoreTenantAccess(db, data);
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id ?? null,
    action: "tenant_parent.restore",
    targetType: "tenant_parent",
    targetId: data.parentId,
  });
  revalidatePath(`/t/${tenant.slug}/coach/parents/${data.parentId}`);
}

const notesSchema = tenantParentScope.extend({
  notes: z.string().max(5000).nullable(),
});

/**
 * Update the per-tenant note field. Notes are tenant-scoped so a parent who
 * belongs to multiple tenants has independent note threads at each.
 */
export async function updateTenantParentNotesAction(input: z.infer<typeof notesSchema>) {
  const data = notesSchema.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  await db.tenantParent.update({
    where: { tenantId_parentId: { tenantId: data.tenantId, parentId: data.parentId } },
    data: { notes: data.notes },
  });
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id ?? null,
    action: "tenant_parent.notes_update",
    targetType: "tenant_parent",
    targetId: data.parentId,
    diff: { length: data.notes?.length ?? 0 },
  });
}

const mergeSchema = z.object({
  tenantId: z.string(),
  winnerId: z.string(),
  loserId: z.string(),
});

/**
 * Collapse two Parent rows into one. The merge itself is transactional
 * inside lib/parents.ts; we just gate it on canManage and record the
 * result for the audit timeline.
 */
export async function mergeParentAction(input: z.infer<typeof mergeSchema>) {
  const data = mergeSchema.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  const result = await mergeParents(db, {
    winnerId: data.winnerId,
    loserId: data.loserId,
  });
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id ?? null,
    action: "parent.merge",
    targetType: "parent",
    targetId: data.winnerId,
    diff: { ...result },
  });
  revalidatePath(`/t/${tenant.slug}/coach/parents/${data.winnerId}`);
}

/**
 * Re-send the magic claim email to a parent who hasn't yet attached a User
 * account. Reuses the booking confirmation email shell (which already has
 * the claim CTA block) so the parent sees the same "Claim your family
 * portal" button they would have seen at first booking.
 *
 * NOTE: this piggybacks on sendBookingConfirmation because the email helper
 * already supports an optional claimUrl. The placeholder programName +
 * 0-cent + matching startsAt/endsAt make the "booking confirmed" framing
 * read as "session details available in your portal" — the claim CTA is
 * the focal point.
 */
export async function sendParentClaimEmailAction(
  input: z.infer<typeof tenantParentScope>
) {
  const data = tenantParentScope.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  const parent = await db.parent.findUniqueOrThrow({ where: { id: data.parentId } });
  if (parent.claimedAt) {
    throw new Error("Parent has already claimed their account");
  }
  const token = await issueClaimToken(db, parent.id);
  const claimUrl = `${env.NEXTAUTH_URL}/claim/${token}`;
  const now = new Date();
  await sendBookingConfirmation({
    to: parent.email,
    parentName: parent.name ?? "there",
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    programName: "your sessions",
    startsAt: now,
    endsAt: now,
    amountCents: 0,
    pendingPayment: false,
    timeZone: tenant.timeZone,
    claimUrl,
  });
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id ?? null,
    action: "parent.claim_email_sent",
    targetType: "parent",
    targetId: parent.id,
    diff: { emailHash: emailHash(parent.email) },
  });
}
