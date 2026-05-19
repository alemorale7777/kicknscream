import { requireTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/chrome/PageHeader";
import { can } from "@/lib/auth/permissions";
import { getInitials } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { Activity, ShieldOff } from "lucide-react";

export const metadata = { title: "Audit log" };

const ACTION_LABELS: Record<string, string> = {
  "roster.bulk_import": "Bulk roster import",
  "tenant.update": "Tenant settings updated",
  "tenant.branding_update": "Branding updated",
  "tenant.domain_set": "Custom domain set",
  "tenant.domain_clear": "Custom domain cleared",
  "stripe.connect": "Stripe account connected",
  "stripe.account.updated": "Stripe account refreshed",
  "permission.override": "Permission changed",
  "team.invite": "Teammate invited",
  "team.role_change": "Role changed",
  "data.export": "Data exported",
  "payment.refund": "Refund issued",
  "enrollment.pack_consumed": "Pack session used",
  "enrollment.pack_completed": "Pack finished",
  "booking.draft_saved": "Booking draft saved",
  "booking.draft_resumed": "Booking draft resumed",
  "parent.create": "Added parent contact",
  "parent.claim": "Parent claimed their account",
  "parent.update": "Edited parent details",
  "parent.merge": "Merged duplicate parents",
  "parent.delete_request": "Requested parent deletion",
  "parent.delete_request_expired": "Parent-deletion request expired",
  "parent.delete_complete": "Completed parent deletion",
  "parent.claim_email_sent": "Sent parent-claim email",
  "tenant_parent.add": "Granted family-portal access",
  "tenant_parent.revoke": "Revoked family-portal access",
  "tenant_parent.restore": "Restored family-portal access",
  "tenant_parent.notes_update": "Updated parent notes",
  "data.parent_backfill": "Backfilled Parent rows from Memberships",
  "data.audit_backfill": "Redacted historical audit emails",
};

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export default async function AdminAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);

  if (!(await can({ tenantId: tenant.id, role: membership.role }, "audit.view"))) {
    redirect(`/t/${slug}/admin/billing`);
  }

  const entries = await db.auditLog.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const actorIds = Array.from(
    new Set(entries.map((e) => e.actorUserId).filter((id): id is string => !!id))
  );
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Audit log"
        title="Tenant activity"
        count={`${entries.length} ${entries.length === 1 ? "entry" : "entries"} · last 200`}
        description="Every change to tenant settings, permissions, roster imports, and Stripe state is logged here. Useful for compliance and for debugging billing surprises."
      />

      {entries.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <ShieldOff className="h-7 w-7 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">No activity yet</p>
          <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
            Imports, permission changes, and Stripe events will show up here as
            soon as they happen.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {entries.map((entry) => {
              const actor = entry.actorUserId
                ? actorById.get(entry.actorUserId)
                : null;
              const diff = entry.diff as Record<string, unknown> | null;
              return (
                <li
                  key={entry.id}
                  className="p-4 flex items-start gap-3 hover:bg-pitch-700/30 transition-colors"
                >
                  <Avatar className="h-8 w-8 shrink-0 bg-flood-400/15 text-flood-400">
                    <AvatarFallback className="bg-transparent text-flood-400 text-xs">
                      {actor
                        ? getInitials(actor.name ?? actor.email ?? "?")
                        : <Activity className="h-3.5 w-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm font-medium text-ink-50">
                        {labelFor(entry.action)}
                      </p>
                      {entry.targetType && (
                        <Badge variant="outline" className="text-[10px]">
                          {entry.targetType}
                        </Badge>
                      )}
                      {entry.targetId && (
                        entry.targetType === "parent" ||
                        entry.targetType === "tenant_parent" ? (
                          <Link
                            href={`/t/${slug}/coach/parents/${entry.targetId}`}
                            prefetch={false}
                            className="text-turf-300 hover:text-turf-200 underline text-xs font-mono"
                          >
                            {entry.targetId}
                          </Link>
                        ) : (
                          <span className="text-xs font-mono text-ink-500">
                            {entry.targetId}
                          </span>
                        )
                      )}
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {actor
                        ? actor.name ?? actor.email
                        : "System"}{" "}
                      · {formatDistanceToNow(entry.createdAt, { addSuffix: true })}{" "}
                      <span className="text-ink-700">
                        ({format(entry.createdAt, "MMM d, h:mm a")})
                      </span>
                    </p>
                    {diff && Object.keys(diff).length > 0 && (
                      <div className="mt-2">
                        <DiffView diff={diff} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function DiffView({ diff }: { diff: Record<string, unknown> }) {
  if (diff.before && diff.after) {
    const before = diff.before as Record<string, unknown>;
    const after = diff.after as Record<string, unknown>;
    return (
      <table className="text-xs w-full">
        <thead>
          <tr>
            <th className="text-left text-ink-500 font-normal">Field</th>
            <th className="text-left text-ink-500 font-normal">Before</th>
            <th className="text-left text-ink-500 font-normal">After</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(after).map((k) => (
            <tr key={k}>
              <td className="text-ink-500 pr-2">{k}</td>
              <td className="pr-2 font-mono">{String(before[k] ?? "—")}</td>
              <td className="font-mono">{String(after[k] ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (diff.winnerId && diff.loserId) {
    return (
      <p className="text-xs text-ink-300">
        {String(diff.kidsMoved ?? 0)} kids moved ·{" "}
        {String(diff.tenantsCollapsed ?? 0)} tenants
      </p>
    );
  }
  return (
    <dl className="text-xs grid grid-cols-[max-content_1fr] gap-x-2 gap-y-0.5">
      {Object.entries(diff).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-500">{k}</dt>
          <dd className="font-mono text-ink-300 break-all">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
