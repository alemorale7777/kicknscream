import type { ReactNode } from "react";
import { TopNav } from "@/components/chrome/TopNav";
import { AdminSideNav } from "@/components/chrome/AdminSideNav";
import { Identify } from "@/components/analytics/Identify";
import type { Tenant, User, Role } from "@prisma/client";

export async function AdminShell({
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
      <div className="flex">
        <AdminSideNav tenant={tenant} />
        <main className="flex-1 min-h-[calc(100vh-64px)] p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
