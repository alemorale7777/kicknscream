import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";
import { addDays, subDays } from "date-fns";

export const metadata = { title: "Schedule" };

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const canEdit = canManageTenant(membership.role);

  // Load a 90-day window around today — covers any week/month nav from here
  const windowStart = subDays(new Date(), 35);
  const windowEnd = addDays(new Date(), 90);

  const [events, locations] = await Promise.all([
    db.event.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: windowStart, lte: windowEnd },
      },
      include: { location: true },
      orderBy: { startsAt: "asc" },
    }),
    db.location.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="max-w-7xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Schedule</p>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
      </header>

      <ScheduleClient
        tenantId={tenant.id}
        events={events}
        locations={locations}
        canEdit={canEdit}
      />
    </div>
  );
}
