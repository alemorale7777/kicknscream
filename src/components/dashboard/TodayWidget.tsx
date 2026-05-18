import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EVENT_TONE, toneChipStyle } from "@/lib/eventTone";
import { format, isPast } from "date-fns";
import { Calendar, Clock, MapPin, ArrowRight, CheckCircle2 } from "lucide-react";
import type { Event, Location } from "@prisma/client";

type EventWithLocation = Event & { location?: Location | null };

export function TodayWidget({
  tenantSlug,
  events,
}: {
  tenantSlug: string;
  events: EventWithLocation[];
}) {
  if (events.length === 0) {
    return (
      <Card className="p-6 flex items-center gap-4 border-dashed">
        <div className="h-10 w-10 rounded-md bg-pitch-700 text-ink-500 flex items-center justify-center shrink-0">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-ink-50">Nothing on the schedule today</p>
          <p className="text-xs text-ink-500 mt-0.5">Enjoy the rest day — or add a session below.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/t/${tenantSlug}/coach/schedule`}>
            View schedule
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </Card>
    );
  }

  const upcoming = events.filter((e) => !isPast(e.endsAt));
  const finished = events.filter((e) => isPast(e.endsAt));

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-line bg-pitch-700/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-turf-300 inline-flex items-center gap-2">
            <Calendar className="h-3 w-3" /> Today
          </p>
          <h3 className="font-semibold text-ink-50">
            {events.length} {events.length === 1 ? "event" : "events"}
          </h3>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/t/${tenantSlug}/coach/schedule`}>
            Full schedule
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="divide-y divide-line">
        {upcoming.map((e) => (
          <EventRow key={e.id} event={e} tenantSlug={tenantSlug} done={false} />
        ))}
        {finished.length > 0 && upcoming.length > 0 && (
          <div className="px-5 py-2 bg-pitch-900/30 text-[10px] uppercase tracking-wider text-ink-500">
            Earlier today
          </div>
        )}
        {finished.map((e) => (
          <EventRow key={e.id} event={e} tenantSlug={tenantSlug} done={true} />
        ))}
      </div>
    </Card>
  );
}

function EventRow({
  event,
  tenantSlug,
  done,
}: {
  event: EventWithLocation;
  tenantSlug: string;
  done: boolean;
}) {
  const tone = EVENT_TONE[event.type];
  return (
    <Link
      href={`/t/${tenantSlug}/coach/schedule/${event.id}`}
      className="group flex items-center gap-4 px-5 py-4 hover:bg-pitch-700/40 transition-colors duration-[120ms]"
    >
      <div className="text-center w-14 shrink-0 font-mono">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">{format(event.startsAt, "h:mm")}</p>
        <p className={`text-sm font-bold leading-none mt-0.5 ${done ? "text-ink-700" : "text-ink-50"}`}>
          {format(event.startsAt, "a")}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={`font-semibold truncate ${
              done ? "text-ink-500 line-through decoration-1" : "text-ink-50"
            }`}
          >
            {event.title}
          </p>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
            style={toneChipStyle(tone.accent, { fillAlpha: 0.14, borderAlpha: 0.45 })}
          >
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: tone.accent }} />
            {tone.label}
          </span>
          {done && (
            <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-turf-300">
              <CheckCircle2 className="h-3 w-3" />
              done
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-500 mt-1">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(event.startsAt, "h:mm")} – {format(event.endsAt, "h:mm a")}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {event.location.name}
            </span>
          )}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-ink-500 group-hover:text-turf-300 group-hover:translate-x-0.5 transition-all duration-[120ms] shrink-0" />
    </Link>
  );
}
