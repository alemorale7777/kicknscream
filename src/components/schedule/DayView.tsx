"use client";

import { useMemo } from "react";
import { EVENT_TONE } from "@/lib/eventTone";
import { cn } from "@/lib/utils";
import { format, isToday, differenceInMinutes, isSameDay } from "date-fns";
import { Clock, MapPin, Users } from "lucide-react";
import type { Event, Location } from "@prisma/client";

type EventWithLocation = Event & { location?: Location | null };

const HOUR_HEIGHT = 64;
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);

export function DayView({
  anchorDate,
  events,
  canEdit,
  onCellClick,
  onEventClick,
}: {
  anchorDate: Date;
  events: EventWithLocation[];
  canEdit: boolean;
  onCellClick: (date: Date) => void;
  onEventClick: (event: EventWithLocation) => void;
}) {
  const dayEvents = useMemo(
    () => events.filter((e) => isSameDay(e.startsAt, anchorDate)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [events, anchorDate]
  );

  const visibleStart = useMemo(() => {
    const d = new Date(anchorDate);
    d.setHours(DAY_START_HOUR, 0, 0, 0);
    return d;
  }, [anchorDate]);

  function handleClick(e: React.MouseEvent, hour: number) {
    if (!canEdit) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutes = Math.round((offsetY / HOUR_HEIGHT) * 60 / 15) * 15;
    const clicked = new Date(anchorDate);
    clicked.setHours(hour, minutes, 0, 0);
    onCellClick(clicked);
  }

  const today = isToday(anchorDate);

  return (
    <div className="rounded-lg border border-line bg-pitch-800 overflow-hidden">
      <div
        className={cn(
          "px-5 py-3 border-b border-line flex items-center justify-between",
          today ? "bg-turf-400/5" : "bg-pitch-900/40"
        )}
      >
        <div>
          <p
            className={cn(
              "text-[10px] uppercase tracking-[0.2em] font-medium",
              today ? "text-turf-300" : "text-ink-500"
            )}
          >
            {format(anchorDate, "EEEE")}
          </p>
          <p className={cn("font-bold text-2xl tracking-tight mt-0.5", today && "text-turf-300")}>
            {format(anchorDate, "MMMM d")}
          </p>
        </div>
        <span className="text-xs text-ink-500 font-mono">
          {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
        </span>
      </div>

      <div className="grid grid-cols-[80px_1fr] relative overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {/* Hour gutter */}
        <div>
          {HOURS.map((h) => (
            <div
              key={h}
              className="border-b border-line/60 pr-3 pt-1 text-right text-xs text-ink-500 font-mono"
              style={{ height: HOUR_HEIGHT }}
            >
              {format(new Date(2000, 0, 1, h, 0), "h:mm a")}
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="relative border-l border-line">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className={cn(
                "border-b border-line/60 transition-colors duration-[120ms]",
                canEdit && "hover:bg-flood-400/5 cursor-cell"
              )}
              style={{ height: HOUR_HEIGHT }}
              onClick={(e) => handleClick(e, hour)}
            />
          ))}

          {dayEvents.map((event) => {
            const tone = EVENT_TONE[event.type];
            const topMin = differenceInMinutes(event.startsAt, visibleStart);
            const heightMin = Math.max(20, differenceInMinutes(event.endsAt, event.startsAt));
            const top = Math.max(0, (topMin / 60) * HOUR_HEIGHT);
            const height = (heightMin / 60) * HOUR_HEIGHT - 4;

            return (
              <button
                type="button"
                key={event.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(event);
                }}
                className={cn(
                  "absolute left-2 right-4 rounded-md p-3 text-left border backdrop-blur-sm",
                  tone.bg,
                  tone.border,
                  tone.text,
                  "transition-transform duration-[120ms] hover:scale-[1.01] hover:z-10 hover:shadow-xl hover:shadow-pitch-950/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flood-400 focus-visible:z-10"
                )}
                style={{ top, height }}
              >
                <div className="flex items-center gap-2 text-[10px] font-mono tracking-tight opacity-90 leading-none mb-1">
                  <Clock className="h-3 w-3" />
                  {format(event.startsAt, "h:mm")} → {format(event.endsAt, "h:mm a")}
                </div>
                <div className="font-bold text-sm leading-tight">{event.title}</div>
                {height > 60 && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] opacity-80">
                    {event.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {event.location.name}
                      </span>
                    )}
                    {event.capacity && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {event.capacity} cap
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}

          {today && <NowMarker visibleStart={visibleStart} />}
        </div>
      </div>
    </div>
  );
}

function NowMarker({ visibleStart }: { visibleStart: Date }) {
  const now = new Date();
  const minutesFromStart = differenceInMinutes(now, visibleStart);
  if (minutesFromStart < 0) return null;
  if (now.getHours() > DAY_END_HOUR) return null;
  const top = (minutesFromStart / 60) * HOUR_HEIGHT;
  return (
    <div className="absolute inset-x-0 pointer-events-none z-20" style={{ top }}>
      <div className="relative">
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-flood-400 shadow-[0_0_16px_var(--color-flood-400)]" />
        <div className="h-px bg-flood-400 shadow-[0_0_8px_var(--color-flood-400)]" />
      </div>
    </div>
  );
}
