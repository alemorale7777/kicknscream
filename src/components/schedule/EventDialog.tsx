"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createEventAction,
  updateEventAction,
  deleteEventAction,
  type SeriesScope,
} from "@/actions/event";
import {
  loadEventAttendanceAction,
  markAttendanceAction,
  bulkMarkAttendanceAction,
  markSeriesAttendanceAction,
} from "@/actions/attendance";
import { ALL_EVENT_TYPES, EVENT_TONE } from "@/lib/eventTone";
import { cn, getInitials } from "@/lib/utils";
import { toTenantLocalIsoMinute, fromTenantLocalIsoMinute } from "@/lib/datetime";
import {
  Loader2,
  Trash2,
  Repeat,
  ExternalLink,
  Check,
  X,
  Clock,
  MinusCircle,
  AlertCircle,
  Users,
  AlertTriangle,
} from "lucide-react";
import type { AttendanceStatus, Event, EventType, Location } from "@prisma/client";

type ProgramLite = { id: string; name: string };

const eventTypeEnum = z.enum([
  "LESSON",
  "CLASS",
  "PRACTICE",
  "GAME",
  "TRYOUT",
  "CAMP",
  "CLINIC",
]);

const schema = z.object({
  title: z.string().min(2, "Required").max(120),
  type: eventTypeEnum,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  locationId: z.string().optional(),
  programId: z.string().optional(),
  description: z.string().max(2000).optional(),
  capacity: z.string().optional(),
  recurrenceEnabled: z.boolean(),
  recurrenceIntervalDays: z.string(),
  recurrenceCount: z.string(),
});

type FormData = z.infer<typeof schema>;

function combineDateTime(dateStr: string, timeStr: string, timeZone: string) {
  return fromTenantLocalIsoMinute(`${dateStr}T${timeStr}`, timeZone);
}

type AttendanceEntry = {
  player: { id: string; firstName: string; lastName: string };
  status: AttendanceStatus | "PENDING";
};

const STATUS_CONFIG: Record<
  AttendanceStatus | "PENDING",
  { label: string; short: string; icon: typeof Check; tone: string }
> = {
  PRESENT: { label: "Present", short: "P", icon: Check, tone: "text-turf-300" },
  LATE: { label: "Late", short: "L", icon: Clock, tone: "text-warn" },
  ABSENT: { label: "Absent", short: "A", icon: X, tone: "text-danger" },
  EXCUSED: { label: "Excused", short: "E", icon: MinusCircle, tone: "text-ink-300" },
  PENDING: { label: "—", short: "?", icon: AlertCircle, tone: "text-ink-500" },
};

const CYCLE: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

export function EventDialog({
  tenantId,
  tenantSlug,
  tenantTimeZone,
  event,
  defaultStart,
  defaultEnd,
  locations,
  programs = [],
  open,
  onOpenChange,
}: {
  tenantId: string;
  tenantSlug?: string;
  tenantTimeZone: string;
  event?: Event;
  defaultStart?: Date;
  defaultEnd?: Date;
  locations: Location[];
  programs?: ProgramLite[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const isEdit = !!event;
  const start = event?.startsAt ?? defaultStart ?? new Date();
  const end = event?.endsAt ?? defaultEnd ?? new Date(start.getTime() + 60 * 60 * 1000);

  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingSave, setPendingSave] = useState<FormData | null>(null);
  const isSeries = !!(event as { recurringSeriesId?: string | null } | undefined)
    ?.recurringSeriesId;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: event?.title ?? "",
      type: (event?.type as EventType) ?? "PRACTICE",
      date: toTenantLocalIsoMinute(start, tenantTimeZone).slice(0, 10),
      startTime: toTenantLocalIsoMinute(start, tenantTimeZone).slice(11, 16),
      endTime: toTenantLocalIsoMinute(end, tenantTimeZone).slice(11, 16),
      locationId: event?.locationId ?? "",
      programId:
        (event as { programId?: string | null } | undefined)?.programId ?? "",
      description:
        (event as { description?: string | null } | undefined)?.description ?? "",
      capacity: event?.capacity?.toString() ?? "",
      recurrenceEnabled: false,
      recurrenceIntervalDays: "7",
      recurrenceCount: "8",
    },
  });

  const type = useWatch({ control, name: "type" });
  const recurrenceEnabled = useWatch({ control, name: "recurrenceEnabled" });
  const locationIdValue = useWatch({ control, name: "locationId" });
  const programIdValue = useWatch({ control, name: "programId" });

  function onSubmit(data: FormData) {
    // Editing a recurring occurrence — pause and ask whether to apply the
    // change to this only, this+future, or every event in the series.
    if (isEdit && isSeries) {
      setPendingSave(data);
      return;
    }
    runSave(data, "this");
  }

  function runSave(data: FormData, scope: SeriesScope) {
    startTransition(async () => {
      try {
        const startsAt = combineDateTime(data.date, data.startTime, tenantTimeZone).toISOString();
        const endsAt = combineDateTime(data.date, data.endTime, tenantTimeZone).toISOString();

        if (isEdit) {
          const result = await updateEventAction({
            id: event!.id,
            tenantId,
            type: data.type,
            title: data.title,
            description: data.description?.trim() || null,
            startsAt,
            endsAt,
            locationId: data.locationId || null,
            programId: data.programId || null,
            capacity: data.capacity ? Number(data.capacity) : null,
            scope,
          });
          toast.success(
            result.count > 1 ? `Updated ${result.count} events` : "Event updated"
          );
        } else {
          const result = await createEventAction({
            tenantId,
            type: data.type,
            title: data.title,
            description: data.description?.trim() || null,
            startsAt,
            endsAt,
            locationId: data.locationId || null,
            programId: data.programId || null,
            capacity: data.capacity ? Number(data.capacity) : null,
            recurrence:
              data.recurrenceEnabled && Number(data.recurrenceCount) > 1
                ? {
                    intervalDays: Number(data.recurrenceIntervalDays),
                    count: Number(data.recurrenceCount),
                  }
                : undefined,
          });
          if (result.count > 1 && result.firstEventId) {
            // Recurrence mistakes are common — give the coach a 6-second Undo
            // window that scope-deletes the whole series in one shot.
            const firstEventId = result.firstEventId;
            const total = result.count;
            toast.success(`Created ${total} events`, {
              duration: 6000,
              action: {
                label: "Undo",
                onClick: () => {
                  deleteEventAction({
                    tenantId,
                    eventId: firstEventId,
                    scope: "all",
                  })
                    .then(() => toast.success(`Undone — ${total} events removed`))
                    .catch((err) => toast.error((err as Error).message));
                },
              },
            });
          } else {
            toast.success("Event created");
          }
          reset();
        }
        setPendingSave(null);
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function runDelete(scope: SeriesScope) {
    if (!event) return;
    startTransition(async () => {
      try {
        const result = await deleteEventAction({
          tenantId,
          eventId: event.id,
          scope,
        });
        toast.success(
          result.count > 1 ? `Deleted ${result.count} events` : "Event deleted"
        );
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit event" : "New event"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update details, take attendance, or remove this event."
              : "Add an event to the schedule. Recurrence scaffolds a whole season."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <form id="event-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" {...register("title")} placeholder="U10 Tuesday Skills" autoFocus />
              {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setValue("type", v as EventType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: EVENT_TONE[t].accent }}
                          />
                          {EVENT_TONE[t].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {locations.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Select
                    value={locationIdValue ?? ""}
                    onValueChange={(v) => setValue("locationId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-3 sm:col-span-1">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" {...register("date")} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="startTime">Start</Label>
                <Input id="startTime" type="time" {...register("startTime")} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endTime">End</Label>
                <Input id="endTime" type="time" {...register("endTime")} className="font-mono" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="capacity">Capacity (optional)</Label>
              <Input
                id="capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={2000}
                {...register("capacity")}
                placeholder="Max players for this event"
                className="font-mono"
              />
            </div>

            {programs.length > 0 && (
              <div className="space-y-1.5">
                <Label>Service / program (optional)</Label>
                <Select
                  value={programIdValue ?? ""}
                  onValueChange={(v) => setValue("programId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Link to a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <textarea
                id="description"
                rows={3}
                {...register("description")}
                placeholder="Drills, focus areas, what to bring…"
                className="w-full rounded-md border border-line bg-pitch-700 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-700 focus:outline-none focus:border-turf-400/60"
              />
            </div>

            {!isEdit && (
              <div className="rounded-md border border-line bg-pitch-700/30 p-4 space-y-3">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    {...register("recurrenceEnabled")}
                    className="mt-0.5 rounded border-line bg-pitch-700 text-turf-400 focus:ring-turf-400/30"
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-2 font-medium text-ink-50">
                      <Repeat className="h-4 w-4 text-turf-300" />
                      Repeat this event
                    </span>
                    <span className="block text-xs text-ink-500 mt-0.5">
                      Scaffolds the whole season in one go. Each occurrence is editable individually.
                    </span>
                  </span>
                </label>
                {recurrenceEnabled && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div className="space-y-1.5">
                      <Label htmlFor="recurrenceIntervalDays">Every (days)</Label>
                      <Input
                        id="recurrenceIntervalDays"
                        type="number"
                        min={1}
                        max={90}
                        {...register("recurrenceIntervalDays")}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="recurrenceCount">Total occurrences</Label>
                      <Input
                        id="recurrenceCount"
                        type="number"
                        min={1}
                        max={52}
                        {...register("recurrenceCount")}
                        className="font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>

          {isEdit && event && (
            <div className="mt-6 pt-6 border-t border-line">
              <RosterPanel tenantId={tenantId} eventId={event.id} open={open} />
              {isSeries && (
                <SeriesBulkPanel tenantId={tenantId} eventId={event.id} />
              )}
              {tenantSlug && (
                <Link
                  href={`/t/${tenantSlug}/coach/schedule/${event.id}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-50 transition-colors"
                  onClick={() => onOpenChange(false)}
                >
                  <ExternalLink className="h-3 w-3" />
                  Open full event page · session notes
                </Link>
              )}
            </div>
          )}

          {isEdit && !confirmingDelete && (
            <div className="mt-8 pt-6 border-t border-danger/15">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-danger/80 mb-2">
                Danger zone
              </p>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
                className="w-full flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-left text-sm transition-colors hover:bg-danger/10 disabled:opacity-50"
              >
                <span className="flex items-start gap-3">
                  <Trash2 className="h-4 w-4 text-danger mt-0.5 shrink-0" />
                  <span>
                    <span className="block font-medium text-ink-50">Delete this event</span>
                    <span className="block text-xs text-ink-500 mt-0.5">
                      Removes the event, attendance, and session notes. This can&apos;t be undone.
                    </span>
                  </span>
                </span>
                <span className="text-xs text-danger/80 font-medium shrink-0">Delete →</span>
              </button>
            </div>
          )}

          {isEdit && confirmingDelete && (
            <div className="mt-6 rounded-md border border-danger/40 bg-danger/10 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-ink-50">Delete &ldquo;{event?.title}&rdquo;?</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {isSeries
                      ? "This event is part of a recurring series. Pick what to delete:"
                      : "Removes it from the schedule, including attendance and any notes. This can’t be undone."}
                  </p>
                </div>
              </div>
              {isSeries ? (
                <ScopePicker
                  pending={pending}
                  onCancel={() => setConfirmingDelete(false)}
                  onPick={(scope) => runDelete(scope)}
                  variant="danger"
                />
              ) : (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => runDelete("this")}
                    disabled={pending}
                    className="bg-danger text-pitch-950 hover:bg-danger/90"
                  >
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete event
                  </Button>
                </div>
              )}
            </div>
          )}

          {isEdit && pendingSave && (
            <div className="mt-6 rounded-md border border-turf-400/40 bg-turf-400/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Repeat className="h-4 w-4 text-turf-300 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-ink-50">Apply changes to recurring event</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Choose which occurrences should update.
                  </p>
                </div>
              </div>
              <ScopePicker
                pending={pending}
                onCancel={() => setPendingSave(null)}
                onPick={(scope) => runSave(pendingSave, scope)}
                variant="primary"
              />
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <span />
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button form="event-form" type="submit" variant="primary" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : isEdit ? (
                "Save"
              ) : (
                "Create event"
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Inline roster + quick-attendance section shown inside the side drawer.
 * Loads fresh on open, then mutates in place via markAttendanceAction.
 * Tap a row to cycle Present → Late → Absent → Excused.
 */
function RosterPanel({
  tenantId,
  eventId,
  open,
}: {
  tenantId: string;
  eventId: string;
  open: boolean;
}) {
  type LoadState =
    | { kind: "idle" }
    | { kind: "loaded"; entries: AttendanceEntry[] }
    | { kind: "error"; message: string };
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadEventAttendanceAction(tenantId, eventId)
      .then((rows) => {
        if (!cancelled) setState({ kind: "loaded", entries: rows });
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: "error", message: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, eventId]);

  const entries = state.kind === "loaded" ? state.entries : null;
  const loading = state.kind === "idle";
  const error = state.kind === "error" ? state.message : null;

  function setEntries(updater: (prev: AttendanceEntry[]) => AttendanceEntry[]) {
    setState((s) => (s.kind === "loaded" ? { kind: "loaded", entries: updater(s.entries) } : s));
  }

  function cycle(playerId: string, current: AttendanceStatus | "PENDING") {
    const idx = current === "PENDING" ? -1 : CYCLE.indexOf(current as AttendanceStatus);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    setStatus(playerId, next);
  }

  function setStatus(playerId: string, status: AttendanceStatus) {
    setEntries((prev) => prev.map((e) => (e.player.id === playerId ? { ...e, status } : e)));
    setPendingIds((s) => new Set(s).add(playerId));
    startTransition(async () => {
      try {
        await markAttendanceAction({ tenantId, eventId, playerId, status });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingIds((s) => {
          const next = new Set(s);
          next.delete(playerId);
          return next;
        });
      }
    });
  }

  function markAllPresent() {
    if (!entries || entries.length === 0) return;
    const playerIds = entries.map((e) => e.player.id);
    setEntries((prev) => prev.map((e) => ({ ...e, status: "PRESENT" })));
    startTransition(async () => {
      try {
        await bulkMarkAttendanceAction({
          tenantId,
          eventId,
          status: "PRESENT",
          playerIds,
        });
        toast.success("All marked present");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const presentCount = entries?.filter((e) => e.status === "PRESENT" || e.status === "LATE").length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Roster</p>
          <p className="text-sm font-semibold text-ink-50 mt-0.5 inline-flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-ink-500" />
            {entries ? `${entries.length} player${entries.length === 1 ? "" : "s"}` : "—"}
            {entries && entries.length > 0 && (
              <Badge variant="outline" className="border-turf-400/30 text-turf-300">
                {presentCount}/{entries.length} here
              </Badge>
            )}
          </p>
        </div>
        {entries && entries.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={markAllPresent}
            className="border-turf-400/40 text-turf-300 hover:bg-turf-400/10"
          >
            <Check className="h-3.5 w-3.5" />
            Mark all present
          </Button>
        )}
      </div>

      {loading && (
        <div className="text-xs text-ink-500 inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading roster…
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      {entries && entries.length === 0 && !loading && (
        <p className="text-xs text-ink-500">
          No one enrolled yet. When parents book this event&apos;s program, they show up here.
        </p>
      )}

      {entries && entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.map((entry) => {
            const cfg = STATUS_CONFIG[entry.status];
            const Icon = cfg.icon;
            const isPending = pendingIds.has(entry.player.id);
            return (
              <li key={entry.player.id}>
                <button
                  type="button"
                  onClick={() => cycle(entry.player.id, entry.status)}
                  disabled={isPending}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-all duration-[120ms] active:scale-[0.99]",
                    "border-line bg-pitch-700/30 hover:bg-pitch-700/60",
                    entry.status === "PRESENT" && "border-turf-400/30 bg-turf-400/5",
                    entry.status === "LATE" && "border-warn/30 bg-warn/5",
                    entry.status === "ABSENT" && "border-danger/30 bg-danger/5"
                  )}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pitch-800 text-xs font-mono text-ink-300">
                    {getInitials(`${entry.player.firstName} ${entry.player.lastName}`)}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">
                    {entry.player.firstName} {entry.player.lastName}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider", cfg.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Series-scope picker shown when a coach edits or deletes one occurrence of
 * a recurring event. Three vertical buttons make it tappable on mobile and
 * keep the impact of each scope explicit.
 */
function ScopePicker({
  pending,
  onCancel,
  onPick,
  variant,
}: {
  pending: boolean;
  onCancel: () => void;
  onPick: (scope: SeriesScope) => void;
  variant: "primary" | "danger";
}) {
  const danger = variant === "danger";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2">
        <ScopeButton
          onClick={() => onPick("this")}
          disabled={pending}
          label="Just this event"
          hint="Other occurrences in the series stay as they are."
          danger={danger}
        />
        <ScopeButton
          onClick={() => onPick("future")}
          disabled={pending}
          label="This and future events"
          hint="Past occurrences keep their original details."
          danger={danger}
        />
        <ScopeButton
          onClick={() => onPick("all")}
          disabled={pending}
          label="All events in the series"
          hint="Applies to every occurrence — past and future."
          danger={danger}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Bulk-apply attendance across an entire recurring series. Shown only on
 * events that have a recurringSeriesId. Pick a status (Present, Excused,
 * Absent), pick a scope (this + future, or all), and the server walks the
 * series filling in any event that hasn't had attendance marked yet. Never
 * stomps existing rows.
 */
function SeriesBulkPanel({
  tenantId,
  eventId,
}: {
  tenantId: string;
  eventId: string;
}) {
  const [status, setStatus] = useState<AttendanceStatus>("EXCUSED");
  const [scope, setScope] = useState<"future" | "all">("future");
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run() {
    startTransition(async () => {
      try {
        const result = await markSeriesAttendanceAction({
          tenantId,
          eventId,
          status,
          scope,
        });
        toast.success(
          result.eventsWritten > 0
            ? `Marked ${result.rowsWritten} ${
                result.rowsWritten === 1 ? "player" : "players"
              } across ${result.eventsWritten} ${
                result.eventsWritten === 1 ? "event" : "events"
              }`
            : `No events to update — ${result.eventsScanned} ${
                result.eventsScanned === 1 ? "event" : "events"
              } already had attendance`
        );
        setConfirming(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <div className="mt-6 pt-6 border-t border-line space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-ink-500 inline-flex items-center gap-1.5">
          <Repeat className="h-3 w-3" />
          Series-wide attendance
        </p>
        <p className="text-xs text-ink-500 mt-1">
          Apply a status to every event in this series at once. Events that
          already have attendance marked are skipped — we never stomp manual
          marks.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EXCUSED">Excused (e.g. canceled)</SelectItem>
              <SelectItem value="PRESENT">Present</SelectItem>
              <SelectItem value="ABSENT">Absent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Scope</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as "future" | "all")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="future">This and future events</SelectItem>
              <SelectItem value="all">Every event in the series</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!confirming ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="w-full"
        >
          Apply across series
        </Button>
      ) : (
        <div className="rounded-md border border-warn/30 bg-warn/5 p-3 space-y-2">
          <p className="text-xs text-ink-300">
            Mark every enrolled player <strong>{STATUS_CONFIG[status].label}</strong>{" "}
            on{" "}
            {scope === "future"
              ? "this and every future occurrence"
              : "every occurrence past and future"}
            ? Events that already have attendance written are skipped.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={run}
              disabled={pending}
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScopeButton({
  onClick,
  disabled,
  label,
  hint,
  danger,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  hint: string;
  danger: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors duration-[120ms]",
        "border-line bg-pitch-800 hover:bg-pitch-700 disabled:opacity-50",
        danger
          ? "hover:border-danger/40 hover:bg-danger/10"
          : "hover:border-turf-400/40 hover:bg-turf-400/10"
      )}
    >
      <span className={cn("block font-medium", danger ? "text-danger" : "text-turf-300")}>
        {label}
      </span>
      <span className="block text-xs text-ink-500 mt-0.5">{hint}</span>
    </button>
  );
}
