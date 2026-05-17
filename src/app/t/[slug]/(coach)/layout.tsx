import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { TopNav } from "@/components/chrome/TopNav";
import { SideNav } from "@/components/chrome/SideNav";
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
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} currentRole={membership.role} />
      <div className="flex">
        <SideNav tenant={tenant} role={membership.role} />
        <main className="flex-1 min-h-[calc(100vh-64px)] p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
