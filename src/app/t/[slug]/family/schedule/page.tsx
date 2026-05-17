import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { format } from "date-fns";
import { Calendar, ArrowRight } from "lucide-react";

export const metadata = { title: "Schedule" };

export default async function FamilySchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user } = await requireTenant(slug);

  const players = await db.player.findMany({
    where: { tenantId: tenant.id, parentId: user.id },
  });
  const names = players.map((p) => `${p.firstName} ${p.lastName}`);

  const events = names.length
    ? await db.event.findMany({
        where: {
          tenantId: tenant.id,
          startsAt: { gte: new Date() },
          title: { in: names },
        },
        include: { location: true },
        orderBy: { startsAt: "asc" },
        take: 50,
      })
    : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Schedule</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Your family calendar</h1>
      </header>
      {events.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <Calendar className="h-8 w-8 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">Nothing on the calendar</p>
          <Link
            href={`/t/${tenant.slug}/family/book`}
            className="inline-flex items-center gap-1 text-sm text-turf-300 hover:text-turf-200 mt-2"
          >
            Book a session <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <Card key={ev.id} className="p-3 flex items-center gap-3">
              <div className="text-center w-14 shrink-0 border-r border-line pr-3 font-mono">
                <p className="text-[10px] uppercase tracking-wider text-ink-500">
                  {format(ev.startsAt, "MMM")}
                </p>
                <p className="text-xl font-bold leading-none mt-0.5">
                  {format(ev.startsAt, "d")}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink-50 truncate">{ev.title}</p>
                <p className="text-xs text-ink-500">
                  {format(ev.startsAt, "EEE h:mm a")}
                  {ev.location && ` · ${ev.location.name}`}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
