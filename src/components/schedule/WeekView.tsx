"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { EVENT_TONE, toneChipStyle } from "@/lib/eventTone";
import { cn } from "@/lib/utils";
import { formatEventTime } from "@/lib/datetime";
import { formatInTimeZone } from "date-fns-tz";
import {
  addDays,
  endOfWeek,
  format,
  isToday,
  startOfWeek,
} from "date-fns";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { moveEventAction } from "@/actions/event";
import type { Event, Location } from "@prisma/client";

const HOUR_HEIGHT = 56; // px per hour
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);
const SNAP_MINUTES = 15;

type EventWithLocation = Event & { location?: Location | null };

export function WeekView({
  tenantId,
  tenantTimeZone,
  anchorDate,
  events,
  canEdit,
  onCellClick,
  onEventClick,
}: {
  tenantId: string;
  tenantTimeZone: string;
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

  // Optimistic-events so drag-end updates the position immediately while the
  // server action is in flight. Each item carries the canonical event id so
  // the post-revalidate render replaces the optimistic copy.
  const [optimisticEvents, applyOptimisticMove] = useOptimistic(
    events,
    (state, patch: { id: string; startsAt: Date; endsAt: Date }) =>
      state.map((e) =>
        e.id === patch.id ? { ...e, startsAt: patch.startsAt, endsAt: patch.endsAt } : e
      )
  );
  const [, startTransition] = useTransition();

  const dayKey = (d: Date) => formatInTimeZone(d, tenantTimeZone, "yyyy-MM-dd");

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventWithLocation[]>();
    for (const day of days) {
      map.set(dayKey(day), []);
    }
    for (const e of optimisticEvents) {
      const key = dayKey(e.startsAt);
      if (!map.has(key)) continue;
      map.get(key)!.push(e);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optimisticEvents, days, tenantTimeZone]);

  const gridRef = useRef<HTMLDivElement>(null);
  const [hoverCell, setHoverCell] = useState<{ dayIdx: number; hour: number } | null>(null);

  // DnD: a 3px distance threshold separates clicks from drags without making
  // touch drags feel sticky (4px was unreliable on trackpads with high DPI).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 },
    })
  );

  function snapMinutes(min: number): number {
    return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!canEdit) return;
    const id = String(e.active.id);
    const event = events.find((x) => x.id === id);
    if (!event) return;

    const dx = e.delta.x;
    const dy = e.delta.y;
    // Day shift: each day column shares the same width — get it from the grid container
    const grid = gridRef.current;
    if (!grid) return;
    const cols = grid.querySelectorAll<HTMLElement>("[data-day-col]");
    if (cols.length !== 7) return;
    const colWidth = cols[0].getBoundingClientRect().width;

    const dayShift = Math.round(dx / colWidth);
    const minuteShift = snapMinutes((dy / HOUR_HEIGHT) * 60);

    if (dayShift === 0 && minuteShift === 0) return;

    const newStart = new Date(event.startsAt);
    newStart.setDate(newStart.getDate() + dayShift);
    newStart.setMinutes(newStart.getMinutes() + minuteShift);

    const newEnd = new Date(event.endsAt);
    newEnd.setDate(newEnd.getDate() + dayShift);
    newEnd.setMinutes(newEnd.getMinutes() + minuteShift);

    // Optimistic must run inside a transition
    startTransition(async () => {
      applyOptimisticMove({ id, startsAt: newStart, endsAt: newEnd });
      try {
        await moveEventAction({
          tenantId,
          eventId: id,
          startsAt: newStart.toISOString(),
          endsAt: newEnd.toISOString(),
        });
        const dayLabel =
          dayShift === 0
            ? formatEventTime(newStart, tenantTimeZone)
            : formatInTimeZone(newStart, tenantTimeZone, "EEE h:mm a");
        toast.success(`Moved to ${dayLabel}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
              className="border-b border-line/60 text-[11px] text-ink-500 font-mono pr-2 pt-1 text-right tabular-nums"
              style={{ height: HOUR_HEIGHT }}
            >
              {format(new Date(2000, 0, 1, h, 0), "h aaa")}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, dayIdx) => {
          const isCurrentDay = isToday(day);
          const dayEvents = eventsByDay.get(dayKey(day)) ?? [];
          return (
            <div
              key={day.toISOString()}
              data-day-col
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
                  tenantTimeZone={tenantTimeZone}
                  canEdit={canEdit}
                  onClick={() => onEventClick(event)}
                />
              ))}

              {/* Current time indicator */}
              {isCurrentDay && <NowMarker tenantTimeZone={tenantTimeZone} />}
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
    </DndContext>
  );
}

function EventBlock({
  event,
  day,
  tenantTimeZone,
  canEdit,
  onClick,
}: {
  event: Event & { location?: Location | null };
  day: Date;
  tenantTimeZone: string;
  canEdit: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    disabled: !canEdit,
  });
  const tone = EVENT_TONE[event.type];
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  // Anchor render math in the tenant's timezone so server and client
  // agree, and so the event sits at the right vertical offset regardless
  // of the viewer's browser timezone.
  const dayKey = formatInTimeZone(day, tenantTimeZone, "yyyy-MM-dd");
  const eventDayKey = formatInTimeZone(start, tenantTimeZone, "yyyy-MM-dd");
  const minutesIntoTenantDay = (instant: Date): number => {
    const [h, m] = formatInTimeZone(instant, tenantTimeZone, "HH:mm")
      .split(":")
      .map(Number);
    return h * 60 + m;
  };
  const VISIBLE_START_MIN = DAY_START_HOUR * 60;
  const VISIBLE_END_MIN = (DAY_END_HOUR + 1) * 60;
  const eventStartMin = minutesIntoTenantDay(start);
  const eventEndMin =
    eventDayKey === formatInTimeZone(end, tenantTimeZone, "yyyy-MM-dd")
      ? minutesIntoTenantDay(end)
      : 24 * 60;

  const topMin = Math.max(0, eventStartMin - VISIBLE_START_MIN);
  const clampedEndMin = Math.min(eventEndMin, VISIBLE_END_MIN);
  const heightMin = Math.max(20, clampedEndMin - Math.max(eventStartMin, VISIBLE_START_MIN));

  // Only render if this event lives on `day` (tenant-local) and overlaps the visible band
  if (eventDayKey !== dayKey || clampedEndMin <= VISIBLE_START_MIN) return null;

  const top = (topMin / 60) * HOUR_HEIGHT;
  const height = (heightMin / 60) * HOUR_HEIGHT - 2;

  const dragTransform = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
    : undefined;

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        // Don't fire onClick if we're in the middle of a drag
        if (isDragging) return;
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "absolute inset-x-0.5 rounded-md px-2 py-1 text-left",
        "border backdrop-blur-sm select-none",
        "transition-shadow duration-[120ms] hover:z-10 hover:shadow-lg hover:shadow-pitch-950/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flood-400 focus-visible:z-10",
        canEdit && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-60 z-20 shadow-2xl shadow-pitch-950/60"
      )}
      style={{
        top,
        height,
        transform: dragTransform,
        touchAction: canEdit ? "none" : undefined,
        ...toneChipStyle(tone.accent, { fillAlpha: 0.18, borderAlpha: 0.5 }),
      }}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-1 text-[10px] font-mono tracking-tight opacity-90 leading-none mb-0.5">
        {formatInTimeZone(start, tenantTimeZone, "h:mm")}
        <span className="opacity-50">→</span>
        {formatEventTime(end, tenantTimeZone)}
      </div>
      <div className="font-semibold text-xs leading-tight line-clamp-2">{event.title}</div>
      {event.location && height > 50 && (
        <div className="text-[10px] opacity-70 truncate mt-0.5">@ {event.location.name}</div>
      )}
    </div>
  );
}

function NowMarker({ tenantTimeZone }: { tenantTimeZone: string }) {
  const now = new Date();
  const [h, m] = formatInTimeZone(now, tenantTimeZone, "HH:mm").split(":").map(Number);
  const minutesFromStart = h * 60 + m - DAY_START_HOUR * 60;
  if (minutesFromStart < 0) return null;
  if (h > DAY_END_HOUR) return null;
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
