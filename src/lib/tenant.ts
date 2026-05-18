import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Tenant } from "@prisma/client";

export { hasRole, canManageTenant, roleLabel } from "./roles";

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

