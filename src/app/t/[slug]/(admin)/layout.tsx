import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { AdminShell } from "@/components/chrome/AdminShell";
import {
  isPortalAllowed,
  portalDefaultPath,
  defaultPortalForRole,
} from "@/lib/auth/portal";

export default async function AdminGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "admin")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <AdminShell tenant={tenant} user={user} role={membership.role}>
      {children}
    </AdminShell>
  );
}
