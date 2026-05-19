import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parentModelV2Enabled } from "@/lib/env";
import type { Membership, Parent, Tenant, TenantParent, User } from "@prisma/client";

export { hasRole, canManageTenant, roleLabel } from "./roles";

export type TenantAccessStaff = {
  kind: "staff";
  tenant: Tenant;
  user: User;
  membership: Membership;
};

export type TenantAccessParent = {
  kind: "parent";
  tenant: Tenant;
  user: User;
  parent: Parent;
  tenantParent: TenantParent;
};

export type TenantAccessAnonymous = {
  kind: "anonymous";
  tenant: Tenant;
};

export type TenantAccess =
  | TenantAccessStaff
  | TenantAccessParent
  | TenantAccessAnonymous;

/**
 * Tenant context helpers — every /t/[slug]/* layout uses requireTenant().
 * cache() dedupes within a single request (Layout + Page can both call).
 */

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return db.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { include: { tenant: true } } },
  });
});

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  return db.tenant.findUnique({ where: { slug } });
}

/**
 * Resolve current tenant + user + membership.
 * - Tenant not found → notFound()
 * - Not authed → redirect to sign-in
 * - Authed but not a member → notFound() (privacy: don't leak tenant existence)
 */
export async function requireTenant(slug: string) {
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const user = await getCurrentUser();
  // Hardcoding /coach/dashboard here would 403 parents — point the
  // callback at the slug root, which redirects to the role-correct
  // portal via /t/[slug]/page.tsx.
  if (!user) redirect(`/auth/signin?callbackUrl=/t/${slug}`);

  const membership = user.memberships.find((m) => m.tenantId === tenant.id);
  if (!membership) notFound();

  return { tenant, user, membership };
}

/**
 * Family-portal gate. Returns ACTIVE-only parent access OR redirects to a
 * forbidden page if the user has no Parent attached / no TenantParent row at
 * this tenant. REVOKED TenantParent rows fail.
 *
 * TODO: /t/[slug]/forbidden route may not exist yet — Task 14 will add it,
 * or Next will fall through to a generic 404 (graceful).
 */
export async function requireParentAccess(slug: string): Promise<TenantAccessParent> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/t/${slug}/family/home`);
  }
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  const parent = await db.parent.findFirst({
    where: { userId: user.id },
  });
  if (!parent) {
    redirect(`/t/${slug}/forbidden`);
  }
  const tenantParent = await db.tenantParent.findUnique({
    where: { tenantId_parentId: { tenantId: tenant.id, parentId: parent.id } },
  });
  if (!tenantParent || tenantParent.status !== "ACTIVE") {
    redirect(`/t/${slug}/forbidden`);
  }
  return { kind: "parent", tenant, user, parent, tenantParent };
}

/**
 * Family-portal access shape used during the parent-model-v2 cutover.
 *
 * - Flag OFF (default / current prod): falls back to the legacy
 *   `requireTenant` path and returns `{ tenant, user, membership, parent: null,
 *   tenantParent: null }`. Existing parents who booked before this branch
 *   only have a PARENT-role Membership, so this preserves their access.
 * - Flag ON: delegates to `requireParentAccess` and returns
 *   `{ tenant, user, parent, tenantParent, membership: null }`. Parents who
 *   haven't been migrated will redirect to /t/[slug]/forbidden.
 */
export type FamilyAccess = {
  tenant: Tenant;
  user: User;
  parent: Parent | null;
  tenantParent: TenantParent | null;
  membership: Membership | null;
};

export async function requireFamilyAccess(slug: string): Promise<FamilyAccess> {
  if (parentModelV2Enabled()) {
    const acc = await requireParentAccess(slug);
    return {
      tenant: acc.tenant,
      user: acc.user,
      parent: acc.parent,
      tenantParent: acc.tenantParent,
      membership: null,
    };
  }
  // Legacy path — the FamilyGroupLayout already enforces
  // isPortalAllowed(role, "family"), so we don't re-check role here.
  const { tenant, user, membership } = await requireTenant(slug);
  return { tenant, user, parent: null, tenantParent: null, membership };
}

