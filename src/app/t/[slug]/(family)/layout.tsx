import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { FamilyShell } from "@/components/chrome/FamilyShell";
import {
  isPortalAllowed,
  portalDefaultPath,
  defaultPortalForRole,
} from "@/lib/auth/portal";

export default async function FamilyGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "family")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <FamilyShell tenant={tenant} user={user} role={membership.role}>
      {children}
    </FamilyShell>
  );
}
