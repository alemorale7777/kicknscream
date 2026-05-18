"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { hasRole } from "@/lib/roles";
import type { AttendanceStatus } from "@prisma/client";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "PENDING"] as const;

const markSchema = z.object({
  tenantId: z.string(),
  eventId: z.string(),
  playerId: z.string(),
  status: z.enum(STATUSES),
});

async function assertCanMark(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !hasRole(membership.role, "COACH")) {
    throw new Error("You don't have permission to take attendance");
  }
  return { user, membership };
}

export async function markAttendanceAction(input: z.infer<typeof markSchema>) {
  const data = markSchema.parse(input);
  const { user, membership } = await assertCanMark(data.tenantId);

  await db.attendance.upsert({
    where: { eventId_playerId: { eventId: data.eventId, playerId: data.playerId } },
    create: {
      eventId: data.eventId,
      playerId: data.playerId,
      status: data.status as AttendanceStatus,
      checkedInAt: data.status === "PRESENT" || data.status === "LATE" ? new Date() : null,
      checkedInBy: user.id,
    },
    update: {
      status: data.status as AttendanceStatus,
      checkedInAt: data.status === "PRESENT" || data.status === "LATE" ? new Date() : null,
      checkedInBy: user.id,
    },
  });

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${data.eventId}`);
  }
}

const bulkSchema = z.object({
  tenantId: z.string(),
  eventId: z.string(),
  status: z.enum(STATUSES),
  playerIds: z.array(z.string()),
});

/**
 * Server-loader for the event side-drawer roster section. Returns the same
 * shape AttendanceList expects: program-enrolled players, with their status
 * overridden by any existing Attendance row for this event.
 */
export async function loadEventAttendanceAction(tenantId: string, eventId: string) {
  await assertCanMark(tenantId);
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, tenantId: true, programId: true },
  });
  if (!event || event.tenantId !== tenantId) {
    throw new Error("Event not found");
  }

  const [enrollments, existing] = await Promise.all([
    event.programId
      ? db.enrollment.findMany({
          where: { programId: event.programId, status: { in: ["ACTIVE", "PENDING"] } },
          include: { player: { select: { id: true, firstName: true, lastName: true } } },
        })
      : Promise.resolve([]),
    db.attendance.findMany({
      where: { eventId: event.id },
      include: { player: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);

  const map = new Map<
    string,
    {
      player: { id: string; firstName: string; lastName: string };
      status: AttendanceStatus | "PENDING";
    }
  >();
  for (const e of enrollments) {
    map.set(e.player.id, { player: e.player, status: "PENDING" });
  }
  for (const a of existing) {
    map.set(a.player.id, { player: a.player, status: a.status });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.player.lastName.localeCompare(b.player.lastName)
  );
}

const seriesSchema = z.object({
  tenantId: z.string(),
  eventId: z.string(),
  status: z.enum(STATUSES),
  // Same scope semantics as the schedule editor — only "future" and "all"
  // make sense for bulk-marking. "future" includes the targeted event.
  scope: z.enum(["future", "all"]),
});

/**
 * Mark attendance across an entire recurring series in one shot. Walks the
 * series — scoped to "future" (this + every later occurrence) or "all"
 * (every occurrence past or future) — pulls each event's enrolled players,
 * and writes attendance rows for each (event × player) pair.
 *
 * Skips events that already have any attendance written — we never
 * stomp manual marks. The intended use is "we just decided every Tuesday
 * practice in the series is canceled / excused", not "redo all attendance".
 */
export async function markSeriesAttendanceAction(
  input: z.infer<typeof seriesSchema>
) {
  const data = seriesSchema.parse(input);
  const { user, membership } = await assertCanMark(data.tenantId);
  const status = data.status as AttendanceStatus;
  const at = status === "PRESENT" || status === "LATE" ? new Date() : null;

  const target = await db.event.findUnique({ where: { id: data.eventId } });
  if (!target || target.tenantId !== data.tenantId) {
    throw new Error("Event not found");
  }
  if (!target.recurringSeriesId) {
    throw new Error("This event isn't part of a recurring series");
  }

  const seriesEvents = await db.event.findMany({
    where: {
      tenantId: data.tenantId,
      recurringSeriesId: target.recurringSeriesId,
      ...(data.scope === "future" ? { startsAt: { gte: target.startsAt } } : {}),
    },
    include: {
      attendances: { select: { id: true } },
      program: {
        include: {
          enrollments: {
            where: { status: { in: ["ACTIVE", "CONFIRMED", "PAID"] } },
            select: { playerId: true },
          },
        },
      },
    },
  });

  let eventsWritten = 0;
  let rowsWritten = 0;
  for (const event of seriesEvents) {
    if (event.attendances.length > 0) continue; // never stomp manual marks
    if (!event.program) continue;
    const playerIds = event.program.enrollments.map((e) => e.playerId);
    if (playerIds.length === 0) continue;
    await db.$transaction(
      playerIds.map((playerId) =>
        db.attendance.create({
          data: {
            eventId: event.id,
            playerId,
            status,
            checkedInAt: at,
            checkedInBy: user.id,
          },
        })
      )
    );
    eventsWritten++;
    rowsWritten += playerIds.length;
  }

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule`);
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${data.eventId}`);
  }
  return { eventsWritten, rowsWritten, eventsScanned: seriesEvents.length };
}

export async function bulkMarkAttendanceAction(input: z.infer<typeof bulkSchema>) {
  const data = bulkSchema.parse(input);
  const { user, membership } = await assertCanMark(data.tenantId);
  const status = data.status as AttendanceStatus;
  const at = status === "PRESENT" || status === "LATE" ? new Date() : null;

  await db.$transaction(
    data.playerIds.map((playerId) =>
      db.attendance.upsert({
        where: { eventId_playerId: { eventId: data.eventId, playerId } },
        create: { eventId: data.eventId, playerId, status, checkedInAt: at, checkedInBy: user.id },
        update: { status, checkedInAt: at, checkedInBy: user.id },
      })
    )
  );

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${data.eventId}`);
  }
}
