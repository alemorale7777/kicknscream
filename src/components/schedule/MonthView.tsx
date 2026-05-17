"use client";

import { useMemo } from "react";
import { EVENT_TONE } from "@/lib/eventTone";
import { cn } from "@/lib/utils";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { Event, Location } from "@prisma/client";

type EventWithLocation = Event & { location?: Location | null };

export function MonthView({
  anchorDate,
  events,
  canEdit,
  onDayClick,
  onEventClick,
}: {
  anchorDate: Date;
  events: EventWithLocation[];
  canEdit: boolean;
  onDayClick: (date: Date) => void;
  onEventClick: (event: EventWithLocation) => void;
}) {
  const monthStart = useMemo(() => startOfMonth(anchorDate), [anchorDate]);
  const monthEnd = useMemo(() => endOfMonth(anchorDate), [anchorDate]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart, gridEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventWithLocation[]>();
    for (const e of events) {
      const key = startOfDay(e.startsAt).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    // Sort each day's events by start time
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    }
    return map;
  }, [events]);

  return (
    <div className="rounded-lg border border-line bg-pitch-800 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-pitch-900/40">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="p-2 text-[10px] uppercase tracking-[0.16em] text-ink-500 text-center"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr">
        {days.map((day) => {
          const dayKey = day.toDateString();
          const dayEvents = eventsByDay.get(dayKey) ?? [];
          const inMonth = isSameMonth(day, anchorDate);
          const today = isToday(day);

          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={cn(
                "relative text-left p-1.5 border-r border-b border-line min-h-[88px] sm:min-h-[112px]",
                "transition-colors duration-[120ms] focus-visible:outline-none focus-visible:bg-pitch-700",
                canEdit && "hover:bg-pitch-700/60",
                !inMonth && "bg-pitch-900/30",
                today && "bg-turf-400/[0.04]"
              )}
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "font-mono text-sm font-medium tabular-nums px-1.5 py-0.5 rounded",
                    today && "bg-turf-400 text-pitch-950 font-bold",
                    !today && inMonth && "text-ink-50",
                    !inMonth && "text-ink-700"
                  )}
                >
                  {format(day, "d")}
                </span>
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-ink-500 font-mono">+{dayEvents.length - 3}</span>
                )}
              </div>

              <div className="mt-1 space-y-1">
                {dayEvents.slice(0, 3).map((e) => {
                  const tone = EVENT_TONE[e.type];
                  return (
                    <div
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick(e);
                      }}
                      className={cn(
                        "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-tight",
                        "border cursor-pointer hover:translate-x-0.5 transition-transform",
                        tone.bg,
                        tone.border,
                        tone.text
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", tone.dot)} />
                      <span className="font-mono text-[9px] opacity-80 shrink-0">{format(e.startsAt, "HHmm")}</span>
                      <span className="truncate font-medium">{e.title}</span>
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
