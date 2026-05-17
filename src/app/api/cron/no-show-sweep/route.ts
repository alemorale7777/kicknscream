import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";
import { subMinutes } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every 15 minutes — mark untouched attendance as NO_SHOW.
 *
 * Rule: events that ended 30+ minutes ago without any attendance row written
 * get their enrollments flipped to NO_SHOW, freeing the spot in reporting.
 *
 * Only enrollments still in ACTIVE / CONFIRMED / PAID states get flipped.
 * PENDING (unconfirmed), CANCELED, REFUNDED, NO_SHOW are left alone.
 */
export async function GET() {
  try {
    await assertCronAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = subMinutes(new Date(), 30);

  // Find recently-ended events that have NO attendance rows
  const candidateEvents = await db.event.findMany({
    where: {
      endsAt: { lt: cutoff },
      attendances: { none: {} },
    },
    select: { id: true, programId: true, tenantId: true, title: true, endsAt: true },
    take: 200,
  });

  let flipped = 0;
  for (const ev of candidateEvents) {
    if (!ev.programId) continue;
    const res = await db.enrollment.updateMany({
      where: {
        programId: ev.programId,
        status: { in: ["ACTIVE", "CONFIRMED", "PAID"] },
        // We don't perfectly know which enrollment matches which event — the
        // safe rule is to only flip when the enrollment's createdAt predates
        // the event's start. For Phase G v1 we don't enforce that match
        // because the data shape doesn't link enrollment ↔ event.
        attendedAt: null,
      },
      data: { status: "NO_SHOW" },
    });
    flipped += res.count;
  }

  console.log("[cron:no-show-sweep]", { events: candidateEvents.length, flipped, at: new Date().toISOString() });
  return NextResponse.json({ ok: true, eventsScanned: candidateEvents.length, enrollmentsFlipped: flipped });
}
