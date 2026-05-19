"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { hasRole } from "@/lib/roles";
import { computePackDelta } from "@/lib/packBalance";
import type { AttendanceStatus } from "@prisma/client";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "PENDING"] as const;

/**
 * Adjust the matching PACKAGE enrollment's packBalance based on a
 * status transition. Inputs are the new state we're writing + the prior
 * state we just read from the DB (null if the Attendance row didn't
 * exist yet).
 *
 * Atomic with respect to other concurrent writes via a conditional
 * update guarded on the current balance — if two coaches mark the
 * same player PRESENT at the same time, only the first decrement
 * lands. Also auto-completes the enrollment + fires the pack-
 * finished email when balance hits 0.
 */
async function adjustPackBalanceForAttendance(opts: {
  tenantId: string;
  playerId: string;
  eventId: string;
  prev: AttendanceStatus | null;
  next: AttendanceStatus;
}) {
  const delta = computePackDelta(opts.prev, opts.next);
  if (delta === 0) return;

  // Find the event's program and the player's active PACKAGE enrollment
  // for it. If the program isn't PACKAGE or there's no matching
  // enrollment, no-op.
  const event = await db.event.findUnique({
    where: { id: opts.eventId },
    select: { programId: true },
  });
  if (!event?.programId) return;

  const enrollment = await db.enrollment.findFirst({
    where: {
      playerId: opts.playerId,
      programId: event.programId,
      status: { in: ["ACTIVE", "CONFIRMED", "PAID", "COMPLETED"] },
      program: { priceModel: "PACKAGE" },
    },
    include: {
      program: { select: { id: true, name: true, packSize: true } },
      player: { select: { firstName: true, lastName: true, parentId: true } },
    },
  });
  if (!enrollment || enrollment.packBalance === null) return;

  if (delta === -1) {
    // Conditional decrement — only succeeds if balance > 0 (prevents
    // double-spend on concurrent marks).
    const result = await db.enrollment.updateMany({
      where: { id: enrollment.id, packBalance: { gt: 0 } },
      data: { packBalance: { decrement: 1 } },
    });
    if (result.count === 0) return; // already at 0; nothing to consume

    await db.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        actorUserId: null,
        action: "enrollment.pack_consumed",
        targetType: "Enrollment",
        diff: { enrollmentId: enrollment.id, programId: enrollment.programId },
      },
    });

    // If that decrement just hit 0, auto-complete + send the nudge email.
    const fresh = await db.enrollment.findUnique({
      where: { id: enrollment.id },
      select: { packBalance: true, status: true },
    });
    if (fresh?.packBalance === 0 && fresh.status !== "COMPLETED") {
      await db.enrollment.update({
        where: { id: enrollment.id },
        data: { status: "COMPLETED" },
      });
      await db.auditLog.create({
        data: {
          tenantId: opts.tenantId,
          actorUserId: null,
          action: "enrollment.pack_completed",
          targetType: "Enrollment",
          diff: { enrollmentId: enrollment.id, programId: enrollment.programId },
        },
      });
      // Fetch parent user separately — Player.parentId is a String, not a relation.
      if (enrollment.player.parentId && enrollment.program.packSize) {
        const parent = await db.user.findUnique({
          where: { id: enrollment.player.parentId },
          select: { email: true, name: true },
        });
        const tenant = await db.tenant.findUnique({
          where: { id: opts.tenantId },
          select: { name: true, slug: true },
        });
        if (parent?.email && tenant) {
          const { sendPackCompletedEmail } = await import("@/lib/email");
          await sendPackCompletedEmail({
            to: parent.email,
            parentName: parent.name ?? "there",
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            programName: enrollment.program.name,
            programId: enrollment.program.id,
            packSize: enrollment.program.packSize,
          }).catch(() => {
            // Best-effort — email failure shouldn't block the mark.
          });
        }
      }
    }
  } else {
    // Increment back. Cap at packSize (defensive — shouldn't ever exceed).
    await db.enrollment.update({
      where: { id: enrollment.id },
      data: {
        packBalance: Math.min(
          (enrollment.packBalance ?? 0) + 1,
          enrollment.program.packSize ?? Number.MAX_SAFE_INTEGER
        ),
        // If we're re-opening a COMPLETED-via-zero enrollment, flip it back.
        status:
          enrollment.status === "COMPLETED" ? "ACTIVE" : enrollment.status,
      },
    });
  }
}

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

  // Read current status so the pack-balance adjuster can compute the
  // delta. Safe under concurrent writes — the adjuster's update is
  // conditional on packBalance > 0.
  const existing = await db.attendance.findUnique({
    where: { eventId_playerId: { eventId: data.eventId, playerId: data.playerId } },
    select: { status: true },
  });

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

  await adjustPackBalanceForAttendance({
    tenantId: data.tenantId,
    playerId: data.playerId,
    eventId: data.eventId,
    prev: existing?.status ?? null,
    next: data.status as AttendanceStatus,
  }).catch(() => {
    // Best-effort — balance adjustment failure shouldn't roll back the mark.
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
    // Pack-balance adjustment per (event × player). The series sweep
    // only ever creates fresh Attendance rows (it skips events that
    // already have any attendance), so `prev` is always null here.
    for (const playerId of playerIds) {
      await adjustPackBalanceForAttendance({
        tenantId: data.tenantId,
        playerId,
        eventId: event.id,
        prev: null,
        next: status,
      }).catch(() => {
        // Best-effort — don't poison the sweep.
      });
    }
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

  // Snapshot existing statuses so the pack-balance adjuster has a `prev`
  // for each player.
  const existing = await db.attendance.findMany({
    where: {
      eventId: data.eventId,
      playerId: { in: data.playerIds },
    },
    select: { playerId: true, status: true },
  });
  const prevByPlayer = new Map(existing.map((a) => [a.playerId, a.status]));

  await db.$transaction(
    data.playerIds.map((playerId) =>
      db.attendance.upsert({
        where: { eventId_playerId: { eventId: data.eventId, playerId } },
        create: { eventId: data.eventId, playerId, status, checkedInAt: at, checkedInBy: user.id },
        update: { status, checkedInAt: at, checkedInBy: user.id },
      })
    )
  );

  // Adjust packs sequentially — each call is independent and we don't
  // want a single failing adjustment to roll back the entire bulk mark.
  for (const playerId of data.playerIds) {
    await adjustPackBalanceForAttendance({
      tenantId: data.tenantId,
      playerId,
      eventId: data.eventId,
      prev: prevByPlayer.get(playerId) ?? null,
      next: status,
    }).catch(() => {
      // Best-effort — log and move on.
    });
  }

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${data.eventId}`);
  }
}
