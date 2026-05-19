import type { Parent, Prisma, PrismaClient, TenantParent } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type FindOrCreateParentInput = {
  tenantId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
};

export type FindOrCreateParentResult = {
  parent: Parent;
  tenantParent: TenantParent;
  /** True if a brand-new Parent row was created on this call. */
  created: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Find-or-create a Parent globally by email, then ensure a TenantParent
 * link exists for this tenant. Reuses an existing Parent across tenants —
 * a parent who books at Coach A and PDX Skills is ONE Parent with TWO
 * TenantParent rows.
 *
 * Idempotent: re-running with the same input is a no-op besides
 * refreshing TenantParent.registeredAt if absent (it isn't here — upsert
 * with empty update preserves the original).
 */
export async function findOrCreateParent(
  db: Db,
  input: FindOrCreateParentInput
): Promise<FindOrCreateParentResult> {
  const email = normalizeEmail(input.email);
  let parent = await db.parent.findUnique({ where: { email } });
  let created = false;
  if (!parent) {
    parent = await db.parent.create({
      data: {
        email,
        name: input.name ?? null,
        phone: input.phone ?? null,
      },
    });
    created = true;
  }
  const tenantParent = await db.tenantParent.upsert({
    where: {
      tenantId_parentId: { tenantId: input.tenantId, parentId: parent.id },
    },
    create: {
      tenantId: input.tenantId,
      parentId: parent.id,
      status: "ACTIVE",
    },
    update: {},
  });
  return { parent, tenantParent, created };
}

/**
 * Revoke a parent's access at a single tenant. Sets status=REVOKED and
 * stamps revokedAt. Scoped to one (tenantId, parentId) row — does not
 * touch the parent's links at other tenants.
 */
export async function revokeTenantAccess(
  db: Db,
  args: { tenantId: string; parentId: string }
): Promise<void> {
  await db.tenantParent.update({
    where: {
      tenantId_parentId: { tenantId: args.tenantId, parentId: args.parentId },
    },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
}

/**
 * Reverse a prior revoke: set status back to ACTIVE and clear revokedAt.
 * Scoped to the single (tenantId, parentId) row.
 */
export async function restoreTenantAccess(
  db: Db,
  args: { tenantId: string; parentId: string }
): Promise<void> {
  await db.tenantParent.update({
    where: {
      tenantId_parentId: { tenantId: args.tenantId, parentId: args.parentId },
    },
    data: { status: "ACTIVE", revokedAt: null },
  });
}
