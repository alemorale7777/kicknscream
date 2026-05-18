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
    })),
  });

  revalidatePath(`/t/${membership.tenant.slug}/coach/schedule`);
  return { count: occurrences.length };
}

const updateEventSchema = baseEventSchema.omit({ recurrence: true }).extend({ id: z.string() });

export async function updateEventAction(input: z.infer<typeof updateEventSchema>) {
  const data = updateEventSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const start = new Date(data.startsAt);
  const end = new Date(data.endsAt);
  if (end <= start) throw new Error("End time must be after start time");

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

  revalidatePath(`/t/${membership.tenant.slug}/coach/schedule`);
}

export async function deleteEventAction(tenantId: string, eventId: string) {
  const { membership } = await assertCanManage(tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");
  await db.event.delete({ where: { id: eventId } });
  revalidatePath(`/t/${membership.tenant.slug}/coach/schedule`);
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
