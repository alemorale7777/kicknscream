import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { TopNav } from "@/components/chrome/TopNav";
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
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} currentRole={membership.role} />
      <main className="px-4 lg:px-6 py-6 lg:py-10 pb-24 lg:pb-10 max-w-5xl mx-auto">
        {children}
      </main>
      {/* FamilyBottomTabs ships in PR 2 */}
    </div>
  );
}
