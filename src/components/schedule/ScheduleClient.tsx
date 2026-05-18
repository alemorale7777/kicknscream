"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { DayView } from "./DayView";
import { EventDialog } from "./EventDialog";
import { EVENT_TONE, ALL_EVENT_TYPES } from "@/lib/eventTone";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  endOfWeek,
  format,
  startOfWeek,
  isSameMonth,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarRange,
  Plus,
} from "lucide-react";
import type { Event, Location, EventType } from "@prisma/client";

type EventWithLocation = Event & { location?: Location | null };

type ViewMode = "week" | "month" | "day";

export function ScheduleClient({
  tenantId,
  tenantSlug,
  events,
  locations,
  canEdit,
}: {
  tenantId: string;
  tenantSlug: string;
  events: EventWithLocation[];
  locations: Location[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventWithLocation | undefined>();
  const [defaultRange, setDefaultRange] = useState<{ start: Date; end: Date } | undefined>();

  const filteredEvents = useMemo(
    () => events.filter((e) => activeFilters.has(e.type)),
    [events, activeFilters]
  );

  const headline = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
      const end = endOfWeek(anchorDate, { weekStartsOn: 1 });
      const sameMonth = isSameMonth(start, end);
      return sameMonth
        ? format(start, "MMMM yyyy")
        : `${format(start, "MMM")} – ${format(end, "MMM yyyy")}`;
    }
    if (view === "month") return format(anchorDate, "MMMM yyyy");
    return format(anchorDate, "EEEE, MMMM d");
  }, [view, anchorDate]);

  function navigate(direction: -1 | 1) {
    if (view === "week") setAnchorDate(addDays(anchorDate, 7 * direction));
    else if (view === "month") setAnchorDate(addMonths(anchorDate, direction));
    else setAnchorDate(addDays(anchorDate, direction));
  }

  function openCreate(start?: Date) {
    const at = start ?? new Date();
    setDefaultRange({
      start: at,
      end: new Date(at.getTime() + 60 * 60 * 1000),
    });
    setEditingEvent(undefined);
    setDialogOpen(true);
  }

  function handleEventClick(e: EventWithLocation) {
    if (!canEdit) {
      router.push(`/t/${tenantSlug}/coach/schedule/${e.id}`);
      return;
    }
    setEditingEvent(e);
    setDefaultRange(undefined);
    setDialogOpen(true);
  }

  function handleCellClick(date: Date) {
    if (!canEdit) return;
    openCreate(date);
  }

  function handleDayClick(date: Date) {
    setAnchorDate(date);
    setView("day");
  }

  function toggleFilter(type: EventType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <>
      <div className="space-y-5">
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchorDate(new Date())}
              className="hidden sm:inline-flex"
            >
              Today
            </Button>
            <Button variant="ghost" size="iconSm" onClick={() => navigate(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="iconSm" onClick={() => navigate(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="font-bold text-xl tracking-[-0.02em] ml-2">{headline}</h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-line bg-pitch-800 p-0.5">
              <ViewToggle active={view === "day"} onClick={() => setView("day")} icon={CalendarDays}>
                Day
              </ViewToggle>
              <ViewToggle active={view === "week"} onClick={() => setView("week")} icon={CalendarRange}>
                Week
              </ViewToggle>
              <ViewToggle active={view === "month"} onClick={() => setView("month")} icon={CalendarIcon}>
                Month
              </ViewToggle>
            </div>
            {canEdit && (
              <Button variant="primary" size="sm" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" />
                New event
              </Button>
            )}
          </div>
        </div>

        {/* Legend / filter chips */}
        <div className="flex flex-wrap gap-2">
          {ALL_EVENT_TYPES.map((t) => {
            const tone = EVENT_TONE[t];
            const active = activeFilters.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleFilter(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition-all duration-[120ms]",
                  active
                    ? `${tone.bg} ${tone.border} ${tone.text}`
                    : "border-line bg-pitch-800 text-ink-700 hover:text-ink-500"
                )}
                aria-pressed={active}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", active ? tone.dot : "bg-ink-700")} />
                {tone.label}
              </button>
            );
          })}
        </div>

        {/* View */}
        {view === "week" && (
          <WeekView
            tenantId={tenantId}
            anchorDate={anchorDate}
            events={filteredEvents}
            locations={locations}
            canEdit={canEdit}
            onCellClick={handleCellClick}
            onEventClick={handleEventClick}
          />
        )}
        {view === "month" && (
          <MonthView
            anchorDate={anchorDate}
            events={filteredEvents}
            canEdit={canEdit}
            onDayClick={handleDayClick}
            onEventClick={handleEventClick}
          />
        )}
        {view === "day" && (
          <DayView
            anchorDate={anchorDate}
            events={filteredEvents}
            canEdit={canEdit}
            onCellClick={handleCellClick}
            onEventClick={handleEventClick}
          />
        )}

        {events.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <div className="mx-auto h-14 w-14 rounded-full bg-turf-400/10 text-turf-300 flex items-center justify-center mb-4">
              <CalendarIcon className="h-7 w-7" />
            </div>
            <p className="font-semibold text-ink-50 mb-1">No events on the schedule yet</p>
            <p className="text-sm text-ink-500 mb-5 max-w-sm mx-auto">
              {canEdit
                ? "Click any time slot to add an event — or use the New event button. Use the recurrence option to scaffold a season in one go."
                : "Check back soon — your coaches will post events here."}
            </p>
            {canEdit && (
              <Button variant="primary" onClick={() => openCreate()}>
                <Plus className="h-4 w-4" />
                Create your first event
              </Button>
            )}
          </Card>
        )}
      </div>

      <EventDialog
        key={editingEvent?.id ?? "new"}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        event={editingEvent}
        defaultStart={defaultRange?.start}
        defaultEnd={defaultRange?.end}
        locations={locations}
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) {
            setEditingEvent(undefined);
            setDefaultRange(undefined);
          }
        }}
      />
    </>
  );
}

function ViewToggle({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarIcon;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-[120ms]",
        active ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
      )}
      aria-pressed={active}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
