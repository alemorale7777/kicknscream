import { requireTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/chrome/PageHeader";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import { can, defaultLevel, type Feature } from "@/lib/auth/permissions";
import type { Role, PermissionLevel } from "@prisma/client";

export const metadata = { title: "Permissions" };

const ROLES: Role[] = ["OWNER", "ADMIN", "COACH", "PARENT", "PLAYER"];

const FEATURE_GROUPS: { label: string; features: Feature[] }[] = [
  {
    label: "Schedule & bookings",
    features: ["bookings.view", "bookings.edit", "schedule.view", "schedule.edit", "attendance.mark"],
  },
  {
    label: "Roster & development",
    features: ["roster.view", "roster.edit", "roster.import", "development.view", "development.edit", "notes.view", "notes.edit"],
  },
  {
    label: "Services / programs",
    features: ["services.view", "services.edit"],
  },
  {
    label: "Payments & billing",
    features: ["payments.view", "payments.refund", "billing.manage"],
  },
  {
    label: "Comms",
    features: ["messages.view", "messages.send", "messages.broadcast"],
  },
  {
    label: "Tenant administration",
    features: ["settings.tenant", "settings.locations", "team.view", "team.invite", "team.remove", "audit.view", "data.export", "tenant.delete"],
  },
];

const FEATURE_LABELS: Record<Feature, string> = {
  "bookings.view": "View bookings",
  "bookings.edit": "Edit bookings",
  "schedule.view": "View schedule",
  "schedule.edit": "Edit schedule",
  "attendance.mark": "Mark attendance",
  "roster.view": "View roster",
  "roster.edit": "Edit roster",
  "roster.import": "Bulk import roster",
  "development.view": "View development",
  "development.edit": "Edit development",
  "notes.view": "View session notes",
  "notes.edit": "Edit session notes",
  "services.view": "View services",
  "services.edit": "Edit services",
  "payments.view": "View payments",
  "payments.refund": "Refund payments",
  "billing.manage": "Manage billing",
  "messages.view": "View messages",
  "messages.send": "Send messages",
  "messages.broadcast": "Broadcast to all",
  "settings.tenant": "Tenant settings",
  "settings.locations": "Locations",
  "team.view": "View team",
  "team.invite": "Invite teammates",
  "team.remove": "Remove teammates",
  "audit.view": "View audit log",
  "data.export": "Export data",
  "tenant.delete": "Delete tenant",
  "tryouts.view": "View tryouts",
  "tryouts.edit": "Edit tryouts",
  "family.dashboard": "Family dashboard",
  "family.book": "Book services",
  "family.pay": "Pay invoices",
  "family.forms": "Forms & waivers",
  "platform.admin": "Platform admin",
};

export default async function AdminPermissionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);

  if (
    !(await can(
      { tenantId: tenant.id, role: membership.role },
      "team.invite",
      "EDIT"
    ))
  ) {
    redirect(`/t/${slug}/admin/billing`);
  }

  const overrides = await db.permissionsOverride.findMany({
    where: { tenantId: tenant.id },
  });
  const overrideMap: Record<string, PermissionLevel> = {};
  for (const o of overrides) {
    overrideMap[`${o.role}:${o.feature}`] = o.level;
  }

  // Build the full matrix server-side so the client just renders + handles
  // optimistic updates on click.
  const matrixData = FEATURE_GROUPS.flatMap((group) =>
    group.features.map((feature) => ({
      group: group.label,
      feature,
      label: FEATURE_LABELS[feature],
      cells: ROLES.map((role) => {
        const override = overrideMap[`${role}:${feature}`];
        const fallback = defaultLevel(feature, role);
        return {
          role,
          level: override ?? fallback,
          overridden: override !== undefined && override !== fallback,
        };
      }),
    }))
  );

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Permissions"
        title="What each role can do"
        description="Defaults shown here cover the typical SportsEngine-style tenant. Click any cell to override for this tenant — the change is logged in the audit log."
      />
      <PermissionMatrix
        tenantId={tenant.id}
        roles={ROLES}
        rows={matrixData}
      />
    </div>
  );
}
