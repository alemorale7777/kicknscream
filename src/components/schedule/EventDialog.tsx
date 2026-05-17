"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createEventAction, updateEventAction, deleteEventAction } from "@/actions/event";
import { ALL_EVENT_TYPES, EVENT_TONE } from "@/lib/eventTone";
import { Loader2, Trash2, Repeat } from "lucide-react";
import type { Event, EventType, Location } from "@prisma/client";

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
  capacity: z.string().optional(),
  recurrenceEnabled: z.boolean(),
  recurrenceIntervalDays: z.string(),
  recurrenceCount: z.string(),
});

type FormData = z.infer<typeof schema>;

function toLocalIsoMinute(date: Date) {
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function combineDateTime(dateStr: string, timeStr: string) {
  return new Date(`${dateStr}T${timeStr}:00`);
}

export function EventDialog({
  tenantId,
  event,
  defaultStart,
  defaultEnd,
  locations,
  open,
  onOpenChange,
}: {
  tenantId: string;
  event?: Event;
  defaultStart?: Date;
  defaultEnd?: Date;
  locations: Location[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const isEdit = !!event;
  const start = event?.startsAt ?? defaultStart ?? new Date();
  const end = event?.endsAt ?? defaultEnd ?? new Date(start.getTime() + 60 * 60 * 1000);

  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: event?.title ?? "",
      type: (event?.type as EventType) ?? "PRACTICE",
      date: toLocalIsoMinute(start).slice(0, 10),
      startTime: toLocalIsoMinute(start).slice(11, 16),
      endTime: toLocalIsoMinute(end).slice(11, 16),
      locationId: event?.locationId ?? "",
      capacity: event?.capacity?.toString() ?? "",
      recurrenceEnabled: false,
      recurrenceIntervalDays: "7",
      recurrenceCount: "8",
    },
  });

  const type = watch("type");
  const recurrenceEnabled = watch("recurrenceEnabled");

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        const startsAt = combineDateTime(data.date, data.startTime).toISOString();
        const endsAt = combineDateTime(data.date, data.endTime).toISOString();

        if (isEdit) {
          await updateEventAction({
            id: event!.id,
            tenantId,
            type: data.type,
            title: data.title,
            startsAt,
            endsAt,
            locationId: data.locationId || null,
            programId: null,
            capacity: data.capacity ? Number(data.capacity) : null,
          });
          toast.success("Event updated");
        } else {
          const result = await createEventAction({
            tenantId,
            type: data.type,
            title: data.title,
            startsAt,
            endsAt,
            locationId: data.locationId || null,
            programId: null,
            capacity: data.capacity ? Number(data.capacity) : null,
            recurrence:
              data.recurrenceEnabled && Number(data.recurrenceCount) > 1
                ? {
                    intervalDays: Number(data.recurrenceIntervalDays),
                    count: Number(data.recurrenceCount),
                  }
                : undefined,
          });
          toast.success(
            result.count > 1 ? `Created ${result.count} events` : "Event created"
          );
          reset();
        }
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function handleDelete() {
    if (!event) return;
    if (!confirm(`Delete "${event.title}"? This removes it from the schedule.`)) return;
    setDeleting(true);
    startTransition(async () => {
      try {
        await deleteEventAction(tenantId, event.id);
        toast.success("Event deleted");
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setDeleting(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the event details."
              : "Add an event to the schedule. Set a recurrence to scaffold a whole season."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                        <span className={`h-2 w-2 rounded-full ${EVENT_TONE[t].dot}`} />
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
                  value={watch("locationId") ?? ""}
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

          <DialogFooter className="pt-2 flex sm:justify-between gap-2">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                disabled={pending || deleting}
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
