"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import type { EventType } from "@prisma/client";

const EVENT_TYPES = ["LESSON", "CLASS", "PRACTICE", "GAME", "TRYOUT", "CAMP", "CLINIC"] as const;

const baseEventSchema = z.object({
  tenantId: z.string(),
  type: z.enum(EVENT_TYPES),
  title: z.string().min(2).max(120),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  locationId: z.string().optional().nullable(),
  programId: z.string().optional().nullable(),
  capacity: z.number().int().min(1).max(2000).optional().nullable(),
  // Optional recurrence: every {interval} days for {count} occurrences total
  recurrence: z
    .object({
      intervalDays: z.number().int().min(1).max(90),
      count: z.number().int().min(1).max(52),
    })
    .optional(),
});

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage the schedule");
  }
  return { user, membership };
}

export async function createEventAction(input: z.infer<typeof baseEventSchema>) {
  const data = baseEventSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const start = new Date(data.startsAt);
  const end = new Date(data.endsAt);
  if (end <= start) throw new Error("End time must be after start time");

  const occurrences = data.recurrence
    ? Array.from({ length: data.recurrence.count }, (_, i) => {
        const offsetMs = i * data.recurrence!.intervalDays * 24 * 60 * 60 * 1000;
        return {
          startsAt: new Date(start.getTime() + offsetMs),
          endsAt: new Date(end.getTime() + offsetMs),
        };
      })
    : [{ startsAt: start, endsAt: end }];

  // Series id is shared by every occurrence so we can scope bulk edits later.
  // Single events get null — no series to mutate.
  const seriesId =
    data.recurrence && data.recurrence.count > 1
      ? `ser_${crypto.randomUUID()}`
      : null;

  await db.event.createMany({
    data: occurrences.map((o) => ({
      tenantId: data.tenantId,
      type: data.type as EventType,
      title: data.title,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      locationId: data.locationId || null,
      programId: data.programId || null,
      capacity: data.capacity ?? null,
      recurringSeriesId: seriesId,
    })),
  });

  // Surface a representative event id so callers can offer an Undo affordance
  // ("Created 8 events" → tap Undo → deleteEventAction with scope=all).
  const firstEvent = seriesId
    ? await db.event.findFirst({
        where: { tenantId: data.tenantId, recurringSeriesId: seriesId },
        orderBy: { startsAt: "asc" },
        select: { id: true },
      })
    : null;

  revalidatePath(`/t/${membership.tenant.slug}/coach/schedule`);
  return {
    count: occurrences.length,
    seriesId,
    firstEventId: firstEvent?.id ?? null,
  };
}

export type SeriesScope = "this" | "future" | "all";

const SERIES_SCOPES = ["this", "future", "all"] as const;

const updateEventSchema = baseEventSchema
  .omit({ recurrence: true })
  .extend({
    id: z.string(),
    scope: z.enum(SERIES_SCOPES).optional(),
  });

/**
 * Resolve every event id in scope for a series-aware mutation.
 * - "this" (default) — just the targeted event
 * - "future"          — this event + every later occurrence in the same series
 * - "all"             — every occurrence in the series, past or future
 *
 * Events without a recurringSeriesId are always treated as "this" — there's
 * no series to fan out to.
 */
async function resolveSeriesScope(
  tenantId: string,
  eventId: string,
  scope: SeriesScope | undefined
) {
  const target = await db.event.findUnique({ where: { id: eventId } });
  if (!target || target.tenantId !== tenantId) {
    throw new Error("Event not found");
  }
  if (!scope || scope === "this" || !target.recurringSeriesId) {
    return { target, ids: [target.id] };
  }
  const occurrences = await db.event.findMany({
    where: {
      tenantId,
      recurringSeriesId: target.recurringSeriesId,
      ...(scope === "future" ? { startsAt: { gte: target.startsAt } } : {}),
    },
    select: { id: true, startsAt: true },
  });
  return { target, ids: occurrences.map((o) => o.id) };
}

export async function updateEventAction(input: z.infer<typeof updateEventSchema>) {
  const data = updateEventSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const start = new Date(data.startsAt);
  const end = new Date(data.endsAt);
  if (end <= start) throw new Error("End time must be after start time");

  const { target, ids } = await resolveSeriesScope(data.tenantId, data.id, data.scope);

  // For series-scoped updates we shift every occurrence by the same delta
  // applied to the targeted event — preserving the cadence — while leaving
  // metadata (title/type/location/capacity) consistent across the series.
  const startDelta = start.getTime() - target.startsAt.getTime();
  const endDelta = end.getTime() - target.endsAt.getTime();

  if (ids.length === 1) {
    await db.event.update({
      where: { id: data.id },
      data: {
        type: data.type as EventType,
        title: data.title,
        startsAt: start,
        endsAt: end,
        locationId: data.locationId || null,
        programId: data.programId || null,
        capacity: data.capacity ?? null,
      },
    });
  } else {
    const rows = await db.event.findMany({
      where: { id: { in: ids } },
      select: { id: true, startsAt: true, endsAt: true },
    });
    await db.$transaction(
      rows.map((row) =>
        db.event.update({
          where: { id: row.id },
          data: {
            type: data.type as EventType,
            title: data.title,
            startsAt: new Date(row.startsAt.getTime() + startDelta),
            endsAt: new Date(row.endsAt.getTime() + endDelta),
            locationId: data.locationId || null,
            programId: data.programId || null,
            capacity: data.capacity ?? null,
          },
        })
      )
    );
  }

  revalidatePath(`/t/${membership.tenant.slug}/coach/schedule`);
  return { count: ids.length };
}

const deleteEventSchema = z.object({
  tenantId: z.string(),
  eventId: z.string(),
  scope: z.enum(SERIES_SCOPES).optional(),
});

export async function deleteEventAction(
  tenantIdOrInput: string | z.infer<typeof deleteEventSchema>,
  eventId?: string
) {
  // Backwards-compat: (tenantId, eventId) positional form continues to work
  // for callers that haven't been migrated to the scoped form yet.
  const input =
    typeof tenantIdOrInput === "string"
      ? { tenantId: tenantIdOrInput, eventId: eventId!, scope: "this" as const }
      : tenantIdOrInput;
  const data = deleteEventSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const { ids } = await resolveSeriesScope(data.tenantId, data.eventId, data.scope);
  await db.event.deleteMany({ where: { id: { in: ids } } });

  revalidatePath(`/t/${membership.tenant.slug}/coach/schedule`);
  return { count: ids.length };
}

const moveEventSchema = z.object({
  tenantId: z.string(),
  eventId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
});

/**
 * Drag-to-move: thin action that only updates the time window.
 * Used by the WeekView DnD handler — avoids re-validating the full event
 * payload on every drag, and gives us a single revalidation target.
 */
export async function moveEventAction(input: z.infer<typeof moveEventSchema>) {
  const data = moveEventSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const start = new Date(data.startsAt);
  const end = new Date(data.endsAt);
  if (end <= start) throw new Error("End time must be after start time");

  const event = await db.event.findUnique({ where: { id: data.eventId } });
  if (!event || event.tenantId !== data.tenantId) {
    throw new Error("Event not found");
  }

  await db.event.update({
    where: { id: data.eventId },
    data: { startsAt: start, endsAt: end },
  });

  revalidatePath(`/t/${membership.tenant.slug}/coach/schedule`);
}
