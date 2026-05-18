import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";
import { subMinutes } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every 15 minutes — write Attendance(status=NO_SHOW) rows for events that
 * ended 30+ minutes ago and never had attendance taken.
 *
 * Each (event × enrolled player) without an existing Attendance row gets
 * one NO_SHOW row. We don't touch the parent Enrollment — that lives
 * across multiple events of the program and would over-flip if mass-
 * updated on a single missed event.
 *
 * Idempotent because Attendance has a unique (eventId, playerId) — second
 * sweeps are no-ops via skipDuplicates.
 */
export async function GET() {
  try {
    await assertCronAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = subMinutes(new Date(), 30);

  // Limit scan to a 7-day window so we don't endlessly retry ancient events
  // if attendance was never taken for them.
  const since = subMinutes(cutoff, 60 * 24 * 7);

  const events = await db.event.findMany({
    where: {
      endsAt: { lt: cutoff, gte: since },
      programId: { not: null },
    },
    select: {
      id: true,
      programId: true,
      attendances: { select: { playerId: true } },
      program: {
        select: {
          enrollments: {
            where: { status: { in: ["ACTIVE", "CONFIRMED", "PAID"] } },
            select: { playerId: true },
          },
        },
      },
    },
    take: 500,
  });

  let rowsWritten = 0;
  let eventsTouched = 0;
  for (const ev of events) {
    if (!ev.program) continue;
    const alreadyMarked = new Set(ev.attendances.map((a) => a.playerId));
    const missing = ev.program.enrollments
      .map((e) => e.playerId)
      .filter((pid) => !alreadyMarked.has(pid));
    if (missing.length === 0) continue;

    // AttendanceStatus has no NO_SHOW — the closest semantic is ABSENT,
    // which is also how the UI renders "didn't show up". Coaches can
    // override per-player back to PRESENT/LATE/EXCUSED later if they
    // belatedly take attendance.
    const result = await db.attendance.createMany({
      data: missing.map((playerId) => ({
        eventId: ev.id,
        playerId,
        status: "ABSENT" as const,
      })),
      skipDuplicates: true,
    });
    rowsWritten += result.count;
    eventsTouched++;
  }

  console.log("[cron:no-show-sweep]", {
    at: new Date().toISOString(),
    eventsScanned: events.length,
    eventsTouched,
    rowsWritten,
  });
  return NextResponse.json({
    ok: true,
    eventsScanned: events.length,
    eventsTouched,
    rowsWritten,
  });
}
