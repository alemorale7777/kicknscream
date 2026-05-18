import { requireTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
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
  "stripe.connect": "Stripe account connected",
  "stripe.account.updated": "Stripe account refreshed",
  "permission.override": "Permission changed",
  "team.invite": "Teammate invited",
  "team.role_change": "Role changed",
  "data.export": "Data exported",
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
                      <DiffPreview diff={diff} />
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

function DiffPreview({ diff }: { diff: Record<string, unknown> }) {
  const entries = Object.entries(diff).slice(0, 6);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 rounded border border-line bg-pitch-900/60 px-1.5 py-0.5 text-[10px] font-mono"
        >
          <span className="text-ink-500">{k}:</span>
          <span className="text-ink-300">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        </span>
      ))}
    </div>
  );
}
