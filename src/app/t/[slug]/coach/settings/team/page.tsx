import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { TeamManager } from "@/components/settings/TeamManager";

export const metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const canEdit = canManageTenant(membership.role);

  const [members, invites] = await Promise.all([
    db.membership.findMany({
      where: { tenantId: tenant.id },
      include: { user: true },
      orderBy: [
        { role: "asc" }, // OWNER first alphabetically? — enum order works in practice
        { createdAt: "asc" },
      ],
    }),
    db.invitation.findMany({
      where: { tenantId: tenant.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Team</h1>
        <p className="text-ink-500 text-sm">Members of {tenant.name} and their access levels.</p>
      </header>

      <TeamManager
        tenantId={tenant.id}
        members={members}
        invites={invites}
        canEdit={canEdit}
        currentUserId={membership.userId}
      />
    </div>
  );
}
