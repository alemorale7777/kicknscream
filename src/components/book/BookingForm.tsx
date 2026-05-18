"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createBookingAction } from "@/actions/booking";
import { formatCents } from "@/lib/utils";
import { addDays, format } from "date-fns";
import { Loader2, ArrowRight, Calendar, Clock, CreditCard } from "lucide-react";
import type { Program } from "@prisma/client";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  parentName: z.string().min(2, "Required").max(120),
  parentEmail: z.string().email("Invalid email"),
  parentPhone: z.string().optional(),
  playerFirstName: z.string().min(1, "Required").max(60),
  playerLastName: z.string().min(1, "Required").max(60),
  playerDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  notes: z.string().max(2000).optional(),
});

type FormData = z.infer<typeof schema>;

const CANDIDATE_TIMES = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
];

type BusyEvent = { startsAt: string; endsAt: string };

/**
 * Returns the time slots that don't overlap any existing event on `dateStr`.
 * Each candidate is assumed to run for `durationMin` (typically 60 min) and
 * is filtered out if it intersects any busy range. Also drops slots that
 * are in the past — the booking window starts tomorrow but UTC drift means
 * "today" can creep in on edge cases.
 */
function computeAvailableTimes(
  dateStr: string,
  durationMin: number,
  busy: BusyEvent[]
): string[] {
  const now = Date.now();
  return CANDIDATE_TIMES.filter((t) => {
    const slotStart = new Date(`${dateStr}T${t}:00`);
    const slotEnd = new Date(slotStart.getTime() + durationMin * 60 * 1000);
    if (slotStart.getTime() < now) return false;
    return !busy.some((b) => {
      const bStart = new Date(b.startsAt).getTime();
      const bEnd = new Date(b.endsAt).getTime();
      return bStart < slotEnd.getTime() && bEnd > slotStart.getTime();
    });
  });
}

export function BookingForm({
  tenantSlug,
  program,
  busyStartsAt = [],
}: {
  tenantSlug: string;
  program: Program;
  busyStartsAt?: BusyEvent[];
}) {
  const [pending, startTransition] = useTransition();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const minDate = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const maxDate = format(addDays(new Date(), 60), "yyyy-MM-dd");

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: minDate,
      startTime: "10:00",
    },
  });

  const watchedTime = useWatch({ control, name: "startTime" });
  const watchedDate = useWatch({ control, name: "date" });
  const availableTimes = useMemo(
    () => computeAvailableTimes(watchedDate, 60, busyStartsAt),
    [watchedDate, busyStartsAt]
  );
  const allBlocked = availableTimes.length === 0;

  function pickTime(t: string) {
    setSelectedTime(t);
    setValue("startTime", t, { shouldValidate: true });
  }

  function onSubmit(data: FormData) {
    // Funnel-level telemetry — fire at submit-click so we capture even
    // bookings that fail at the server.
    import("@/lib/analytics").then(({ track }) =>
      track("booking_started", {
        programId: program.id,
        priceModel: program.priceModel,
        priceCents: program.price,
      })
    );
    startTransition(async () => {
      try {
        await createBookingAction({
          tenantSlug,
          programId: program.id,
          date: data.date,
          startTime: data.startTime,
          durationMin: 60,
          parentName: data.parentName,
          parentEmail: data.parentEmail,
          parentPhone: data.parentPhone || undefined,
          playerFirstName: data.playerFirstName,
          playerLastName: data.playerLastName,
          playerDob: data.playerDob,
          notes: data.notes || undefined,
        });
        // server action redirects on success
      } catch (e) {
        // NEXT_REDIRECT is normal — don't surface
        const err = e as Error & { digest?: string };
        if (err.digest?.startsWith("NEXT_REDIRECT")) return;
        toast.error(err.message);
      }
    });
  }

  const isFree = program.priceModel === "FREE" || program.price === 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Step 1 — when */}
      <Card className="p-6 space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-turf-300 inline-flex items-center gap-2">
            <Calendar className="h-3 w-3" /> Step 1 · When
          </p>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Pick a date and time</h2>
          <p className="text-xs text-ink-500">Coach availability is confirmed after you submit.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              min={minDate}
              max={maxDate}
              {...register("date")}
              className="font-mono"
            />
            {errors.date && <p className="text-xs text-danger">{errors.date.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startTime">Time</Label>
            <Input
              id="startTime"
              type="time"
              {...register("startTime")}
              className="font-mono"
            />
            {errors.startTime && <p className="text-xs text-danger">{errors.startTime.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-ink-500">
            Available times{" "}
            <span className="text-ink-700 normal-case tracking-normal">
              · slots already on the schedule are hidden
            </span>
          </p>
          {allBlocked ? (
            <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-sm text-ink-300">
              No open slots on this day — try another date, or finish the form
              with your preferred time and the coach will reach out if there&apos;s
              wiggle room.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableTimes.map((t) => {
                const active = (selectedTime ?? watchedTime) === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => pickTime(t)}
                    className={`px-3 py-1.5 rounded-md text-sm font-mono border transition-all duration-[120ms] ${
                      active
                        ? "bg-turf-400 text-pitch-950 border-turf-400 font-semibold"
                        : "bg-pitch-700 text-ink-300 border-line hover:border-turf-400/60 hover:text-ink-50"
                    }`}
                  >
                    {format(new Date(`2000-01-01T${t}:00`), "h:mm a")}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Step 2 — who */}
      <Card className="p-6 space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-turf-300 inline-flex items-center gap-2">
            <Clock className="h-3 w-3" /> Step 2 · Who
          </p>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Parent details</h2>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="parentName">Parent name</Label>
            <Input id="parentName" {...register("parentName")} placeholder="Jamie Lopez" />
            {errors.parentName && <p className="text-xs text-danger">{errors.parentName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentEmail">Email</Label>
            <Input id="parentEmail" type="email" {...register("parentEmail")} placeholder="you@example.com" />
            {errors.parentEmail && <p className="text-xs text-danger">{errors.parentEmail.message}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="parentPhone">Phone (optional)</Label>
          <Input id="parentPhone" type="tel" {...register("parentPhone")} placeholder="555-1234" />
        </div>
      </Card>

      {/* Step 3 — player */}
      <Card className="p-6 space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-turf-300">Step 3 · Player</p>
          <h2 className="text-xl font-bold tracking-[-0.02em]">Who&apos;s playing?</h2>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="playerFirstName">First name</Label>
            <Input id="playerFirstName" {...register("playerFirstName")} />
            {errors.playerFirstName && <p className="text-xs text-danger">{errors.playerFirstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="playerLastName">Last name</Label>
            <Input id="playerLastName" {...register("playerLastName")} />
            {errors.playerLastName && <p className="text-xs text-danger">{errors.playerLastName.message}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="playerDob">Date of birth</Label>
          <Input id="playerDob" type="date" {...register("playerDob")} className="font-mono" />
          {errors.playerDob && <p className="text-xs text-danger">{errors.playerDob.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes for the coach (optional)</Label>
          <Textarea
            id="notes"
            {...register("notes")}
            rows={3}
            placeholder="Allergies, experience level, what you'd like to work on"
          />
        </div>
      </Card>

      {/* Submit */}
      <div className="sticky bottom-4 z-10">
        <Card className="p-5 flex items-center justify-between gap-4 shadow-2xl shadow-pitch-950/40 border-flood-400/30 bg-pitch-800/95 backdrop-blur-md">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500">Total</p>
            {isFree ? (
              <p className="text-2xl font-bold text-turf-300">Free</p>
            ) : (
              <p className="text-2xl font-bold font-mono text-flood-400">{formatCents(program.price)}</p>
            )}
          </div>
          <Button type="submit" variant="accent" size="lg" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : isFree ? (
              <>
                Confirm booking <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Continue to payment
              </>
            )}
          </Button>
        </Card>
      </div>
    </form>
  );
}
