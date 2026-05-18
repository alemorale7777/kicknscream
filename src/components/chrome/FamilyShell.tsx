import type { ReactNode } from "react";
import { TopNav } from "@/components/chrome/TopNav";
import { FamilyBottomTabs } from "@/components/chrome/FamilyBottomTabs";
import { FamilyDesktopNav } from "@/components/chrome/FamilyDesktopNav";
import { Identify } from "@/components/analytics/Identify";
import type { Tenant, User, Role } from "@prisma/client";

export async function FamilyShell({
  tenant,
  user,
  role,
  children,
}: {
  tenant: Tenant;
  user: User;
  role: Role;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <Identify userId={user.id} email={user.email} name={user.name} />
      <TopNav tenant={tenant} user={user} currentRole={role} />
      <FamilyDesktopNav slug={tenant.slug} />
      <main className="px-4 lg:px-6 py-6 lg:py-10 pb-24 lg:pb-10 max-w-5xl mx-auto">
        {children}
      </main>
      <FamilyBottomTabs slug={tenant.slug} />
    </div>
  );
}
