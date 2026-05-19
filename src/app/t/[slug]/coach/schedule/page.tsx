import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";
import { PageHeader } from "@/components/chrome/PageHeader";
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
      <PageHeader eyebrow="Schedule" title={tenant.name} />

      <ScheduleClient
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        tenantTimeZone={tenant.timeZone ?? "America/Los_Angeles"}
        events={events}
        locations={locations}
        canEdit={canEdit}
      />
    </div>
  );
}
