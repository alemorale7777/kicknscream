import { requireTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/chrome/PageHeader";
import { TeamManager } from "@/components/settings/TeamManager";
import { can } from "@/lib/auth/permissions";
import { canManageTenant, STAFF_ROLES } from "@/lib/roles";

export const metadata = { title: "Team" };

export default async function AdminTeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);

  if (!(await can({ tenantId: tenant.id, role: membership.role }, "team.view"))) {
    redirect(`/t/${slug}/admin/billing`);
  }

  const [members, invites] = await Promise.all([
    db.membership.findMany({
      // Hide PARENT/PLAYER memberships — those exist for family-portal
      // routing only and must not appear alongside coaches and admins.
      where: { tenantId: tenant.id, role: { in: STAFF_ROLES } },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.invitation.findMany({
      where: { tenantId: tenant.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Team"
        title={tenant.name}
        count={`${members.length} ${members.length === 1 ? "member" : "members"}${
          invites.length > 0 ? ` · ${invites.length} pending` : ""
        }`}
        description="Invite teammates, transfer ownership, and manage every role on this tenant. Every change is recorded in the audit log."
      />
      <TeamManager
        tenantId={tenant.id}
        members={members}
        invites={invites}
        canEdit={canManageTenant(membership.role)}
        currentUserId={membership.userId}
      />
    </div>
  );
}
