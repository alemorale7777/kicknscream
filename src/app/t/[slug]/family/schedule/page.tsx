import { requireFamilyAccess } from "@/lib/tenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Calendar, ArrowRight, MapPin } from "lucide-react";
import { loadUpcomingFamilyEvents } from "@/lib/family/events";

export const metadata = { title: "Schedule" };

export default async function FamilySchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, parent } = await requireFamilyAccess(slug);

  const rows = await loadUpcomingFamilyEvents(tenant.id, user.id, { parent });
  const tz = tenant.timeZone ?? "America/Los_Angeles";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Schedule</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Your family calendar</h1>
        <p className="text-sm text-ink-500 mt-1">
          Every upcoming session for every kid you&apos;re linked to.
        </p>
      </header>
      {rows.length === 0 ? (
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
          {rows.map(({ event, players }) => (
            <Card key={event.id} className="p-3 flex items-center gap-3">
              <div className="text-center w-14 shrink-0 border-r border-line pr-3 font-mono">
                <p className="text-[10px] uppercase tracking-wider text-ink-500">
                  {formatInTimeZone(event.startsAt, tz, "MMM")}
                </p>
                <p className="text-xl font-bold leading-none mt-0.5">
                  {formatInTimeZone(event.startsAt, tz, "d")}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink-50 truncate">{event.title}</p>
                <p className="text-xs text-ink-500 mt-0.5 inline-flex items-center gap-2 flex-wrap">
                  <span>{formatInTimeZone(event.startsAt, tz, "EEE h:mm a")}</span>
                  {event.location && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {event.location.name}
                    </span>
                  )}
                </p>
                {players.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {players.map((p) => (
                      <Badge
                        key={p.id}
                        variant="outline"
                        className="border-turf-400/30 text-turf-300 bg-turf-400/5 text-[10px]"
                      >
                        {p.firstName}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
