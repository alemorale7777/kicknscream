import type { ReactNode } from "react";
import { TopNav } from "@/components/chrome/TopNav";
import { SideNav } from "@/components/chrome/SideNav";
import { Identify } from "@/components/analytics/Identify";
import { MobileFab } from "@/components/chrome/MobileFab";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import type { Tenant, User, Role } from "@prisma/client";

export async function CoachShell({
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
  // Surface an unread-messages count in the side nav. Counts messages
  // addressed to the current user in any thread they participate in, where
  // they did NOT send the latest, and the message hasn't been read yet.
  const unreadMessages = await db.message.count({
    where: {
      tenantId: tenant.id,
      readAt: null,
      senderUserId: { not: user.id },
      thread: { participantIds: { has: user.id } },
    },
  });

  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <Identify userId={user.id} email={user.email} name={user.name} />
      <TopNav tenant={tenant} user={user} currentRole={role} />
      <div className="flex">
        <SideNav
          tenant={tenant}
          role={role}
          badges={{ messages: unreadMessages }}
        />
        <main className="flex-1 min-h-[calc(100vh-64px)] p-5 lg:p-10">{children}</main>
      </div>
      {canManageTenant(role) && <MobileFab tenantSlug={tenant.slug} />}
    </div>
  );
}
