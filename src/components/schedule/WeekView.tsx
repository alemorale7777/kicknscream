"use client";

import { useMemo, useRef, useState } from "react";
import { EVENT_TONE } from "@/lib/eventTone";
import { cn } from "@/lib/utils";
import {
  addDays,
  differenceInMinutes,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { Event, Location } from "@prisma/client";

const HOUR_HEIGHT = 56; // px per hour
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);

type EventWithLocation = Event & { location?: Location | null };

export function WeekView({
  anchorDate,
  events,
  canEdit,
  onCellClick,
  onEventClick,
}: {
  anchorDate: Date;
  events: EventWithLocation[];
  locations?: Location[];
  canEdit: boolean;
  onCellClick: (date: Date, hour: number) => void;
  onEventClick: (event: EventWithLocation) => void;
}) {
  const weekStart = useMemo(() => startOfWeek(anchorDate, { weekStartsOn: 1 }), [anchorDate]);
  const weekEnd = useMemo(() => endOfWeek(anchorDate, { weekStartsOn: 1 }), [anchorDate]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventWithLocation[]>();
    for (const day of days) {
      map.set(day.toDateString(), []);
    }
    for (const e of events) {
      const dayKey = startOfDay(e.startsAt).toDateString();
      if (!map.has(dayKey)) continue;
      map.get(dayKey)!.push(e);
    }
    return map;
  }, [events, days]);

  const gridRef = useRef<HTMLDivElement>(null);
  const [hoverCell, setHoverCell] = useState<{ dayIdx: number; hour: number } | null>(null);

  function handleCellMouseDown(e: React.MouseEvent, day: Date, hour: number) {
    if (!canEdit) return;
    // Round to nearest 15 min based on click Y position within cell
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const minutes = Math.round((offsetY / HOUR_HEIGHT) * 60 / 15) * 15;
    const clickedAt = new Date(day);
    clickedAt.setHours(hour, minutes, 0, 0);
    onCellClick(clickedAt, hour);
  }

  return (
    <div className="rounded-lg border border-line bg-pitch-800 overflow-x-auto">
      <div className="min-w-[680px]">
      {/* Day header strip */}
      <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-line bg-pitch-900/40">
        <div className="p-2 text-[10px] uppercase tracking-wider text-ink-500 font-mono text-center">
          {format(weekStart, "MMM")}
        </div>
        {days.map((d) => {
          const today = isToday(d);
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "p-2 text-center border-l border-line transition-colors",
                today && "bg-turf-400/5"
              )}
            >
              <p
                className={cn(
                  "text-[10px] uppercase tracking-[0.16em] font-medium",
                  today ? "text-turf-300" : "text-ink-500"
                )}
              >
                {format(d, "EEE")}
              </p>
              <p
                className={cn(
                  "font-mono text-xl font-bold tracking-tight mt-0.5",
                  today ? "text-turf-300" : "text-ink-50"
                )}
              >
                {format(d, "d")}
              </p>
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div
        ref={gridRef}
        className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] relative overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        {/* Hour gutter */}
        <div>
          {HOURS.map((h) => (
            <div
              key={h}
              className="border-b border-line/60 text-[10px] uppercase tracking-wider text-ink-500 font-mono pr-2 pt-1 text-right"
              style={{ height: HOUR_HEIGHT }}
            >
              {format(new Date(2000, 0, 1, h, 0), "h a")}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, dayIdx) => {
          const isCurrentDay = isToday(day);
          const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "relative border-l border-line",
                isCurrentDay && "bg-turf-400/[0.025]"
              )}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className={cn(
                    "border-b border-line/60 group transition-colors duration-[120ms]",
                    canEdit && "hover:bg-flood-400/5 cursor-cell"
                  )}
                  style={{ height: HOUR_HEIGHT }}
                  onMouseDown={(e) => handleCellMouseDown(e, day, hour)}
                  onMouseEnter={() => setHoverCell({ dayIdx, hour })}
                  onMouseLeave={() => setHoverCell(null)}
                  aria-label={`${format(day, "EEEE")} ${format(new Date(2000, 0, 1, hour, 0), "h a")}`}
                >
                  {canEdit && hoverCell?.dayIdx === dayIdx && hoverCell?.hour === hour && (
                    <div className="absolute inset-x-1 top-1 text-[10px] uppercase tracking-wider text-flood-400 pointer-events-none opacity-70 font-medium">
                      + new
                    </div>
                  )}
                </div>
              ))}

              {/* Events overlaid on this column */}
              {dayEvents.map((event) => (
                <EventBlock
                  key={event.id}
                  event={event}
                  day={day}
                  onClick={() => onEventClick(event)}
                />
              ))}

              {/* Current time indicator */}
              {isCurrentDay && <NowMarker />}
            </div>
          );
        })}
      </div>

      {/* Footer week summary */}
      <div className="flex items-center justify-between px-4 py-2 bg-pitch-900/40 border-t border-line text-xs">
        <span className="text-ink-500 font-mono">
          {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
        </span>
        <span className="text-ink-500">
          {events.length} {events.length === 1 ? "event" : "events"} this week
        </span>
      </div>
      </div>
    </div>
  );
}

function EventBlock({
  event,
  day,
  onClick,
}: {
  event: Event & { location?: Location | null };
  day: Date;
  onClick: () => void;
}) {
  const tone = EVENT_TONE[event.type];
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  // Cap to visible range
  const visibleStart = new Date(day);
  visibleStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const visibleEnd = new Date(day);
  visibleEnd.setHours(DAY_END_HOUR + 1, 0, 0, 0);

  const startClipped = start < visibleStart ? visibleStart : start;
  const endClipped = end > visibleEnd ? visibleEnd : end;

  const topMin = differenceInMinutes(startClipped, visibleStart);
  const heightMin = Math.max(20, differenceInMinutes(endClipped, startClipped));

  // Only render if this event actually overlaps with `day` between DAY_START and DAY_END
  if (!isSameDay(start, day) || endClipped <= visibleStart) return null;

  const top = (topMin / 60) * HOUR_HEIGHT;
  const height = (heightMin / 60) * HOUR_HEIGHT - 2;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute inset-x-0.5 rounded-md px-2 py-1 text-left",
        "border backdrop-blur-sm",
        tone.bg,
        tone.border,
        tone.text,
        "transition-transform duration-[120ms] hover:scale-[1.01] hover:z-10 hover:shadow-lg hover:shadow-pitch-950/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flood-400 focus-visible:z-10"
      )}
      style={{ top, height }}
    >
      <div className="flex items-center gap-1 text-[10px] font-mono tracking-tight opacity-90 leading-none mb-0.5">
        {format(start, "h:mm")}
        <span className="opacity-50">→</span>
        {format(end, "h:mm a")}
      </div>
      <div className="font-semibold text-xs leading-tight line-clamp-2">{event.title}</div>
      {event.location && height > 50 && (
        <div className="text-[10px] opacity-70 truncate mt-0.5">@ {event.location.name}</div>
      )}
    </button>
  );
}

function NowMarker() {
  const now = new Date();
  const day = startOfDay(now);
  const visibleStart = new Date(day);
  visibleStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const minutesFromStart = differenceInMinutes(now, visibleStart);
  if (minutesFromStart < 0) return null;
  if (now.getHours() > DAY_END_HOUR) return null;
  const top = (minutesFromStart / 60) * HOUR_HEIGHT;
  return (
    <div
      className="absolute inset-x-0 pointer-events-none z-20"
      style={{ top }}
      aria-label="Current time"
    >
      <div className="relative">
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-flood-400 shadow-[0_0_12px_var(--color-flood-400)]" />
        <div className="h-px bg-flood-400 shadow-[0_0_8px_var(--color-flood-400)]" />
      </div>
    </div>
  );
}
