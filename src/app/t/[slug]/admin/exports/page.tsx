import { requireTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/chrome/PageHeader";
import { can } from "@/lib/auth/permissions";
import {
  Download,
  Users,
  ClipboardList,
  Wallet,
  Calendar,
  Activity,
} from "lucide-react";

export const metadata = { title: "Exports" };

type EntityCard = {
  entity: string;
  label: string;
  icon: typeof Users;
  description: string;
};

const ENTITIES: EntityCard[] = [
  {
    entity: "roster",
    label: "Roster",
    icon: Users,
    description: "Every player on this tenant with parent email and notes.",
  },
  {
    entity: "bookings",
    label: "Bookings",
    icon: ClipboardList,
    description: "Enrollments joined with program + invoice status.",
  },
  {
    entity: "payments",
    label: "Payments",
    icon: Wallet,
    description: "Every invoice row — paid, pending, overdue, refunded.",
  },
  {
    entity: "schedule",
    label: "Schedule",
    icon: Calendar,
    description: "All events with type, time, program, location, recurrence.",
  },
  {
    entity: "audit",
    label: "Audit log",
    icon: Activity,
    description: "Up to 5,000 most recent activity log entries.",
  },
];

export default async function AdminExportsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);

  if (!(await can({ tenantId: tenant.id, role: membership.role }, "data.export"))) {
    redirect(`/t/${slug}/admin/billing`);
  }

  // Pre-compute counts so the cards show what's about to be downloaded
  // before the user pulls the trigger.
  const [rosterCount, bookingsCount, paymentsCount, scheduleCount, auditCount] =
    await Promise.all([
      db.player.count({ where: { tenantId: tenant.id } }),
      db.enrollment.count({ where: { player: { tenantId: tenant.id } } }),
      db.invoice.count({ where: { tenantId: tenant.id } }),
      db.event.count({ where: { tenantId: tenant.id } }),
      db.auditLog.count({ where: { tenantId: tenant.id } }),
    ]);
  const COUNT_BY_ENTITY: Record<string, number> = {
    roster: rosterCount,
    bookings: bookingsCount,
    payments: paymentsCount,
    schedule: scheduleCount,
    audit: auditCount,
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Exports"
        title="Download your data"
        description="UTF-8 CSV files, one per entity. Every download is logged to the audit log so you can prove who pulled what."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {ENTITIES.map((e) => {
          const Icon = e.icon;
          const count = COUNT_BY_ENTITY[e.entity] ?? 0;
          return (
            <Card key={e.entity} className="p-4 flex items-start gap-3">
              <div className="h-10 w-10 rounded-md bg-pitch-700 text-ink-300 flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink-50 flex items-baseline gap-2">
                  {e.label}
                  <span className="text-xs font-mono text-ink-500 tabular-nums">
                    {count} {count === 1 ? "row" : "rows"}
                  </span>
                </p>
                <p className="text-xs text-ink-500 mt-0.5">{e.description}</p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={count === 0}
                >
                  <a
                    href={`/api/exports/${tenant.slug}/${e.entity}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download CSV
                  </a>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-ink-500">
        Downloads happen synchronously — large tenants may wait a few seconds.
        Files include a UTF-8 BOM so Excel opens them correctly.
      </p>
    </div>
  );
}
