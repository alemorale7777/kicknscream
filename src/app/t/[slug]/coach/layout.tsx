import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { CoachShell } from "@/components/chrome/CoachShell";
import {
  isPortalAllowed,
  portalDefaultPath,
  defaultPortalForRole,
} from "@/lib/auth/portal";

export default async function CoachGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "coach")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <CoachShell tenant={tenant} user={user} role={membership.role}>
      {children}
    </CoachShell>
  );
}
