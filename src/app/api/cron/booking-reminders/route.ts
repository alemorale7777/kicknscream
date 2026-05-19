import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";
import { sendBookingReminderEmail } from "@/lib/email";
import { addHours } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly cron — fans out booking reminders.
 *
 * For events starting in the 24h-25h window we send the 24h "Tomorrow"
 * reminder. For events starting in the 2h-3h window we send the 2h "In two
 * hours" reminder. Hourly cadence means each event lands in each window
 * exactly once.
 *
 * Recipients are resolved by walking Event → Program → Enrollment → Player
 * → parentId. The parent's UserPreferences.emailReminders gates delivery —
 * missing prefs default to allowed so we don't silently skip parents who
 * haven't visited settings.
 *
 * Best-effort: per-email failures are caught individually so one broken
 * address doesn't poison the whole sweep.
 */
export async function GET() {
  try {
    await assertCronAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in24hStart = addHours(now, 24);
  const in24hEnd = addHours(now, 25);
  const in2hStart = addHours(now, 2);
  const in2hEnd = addHours(now, 3);

  const [dayEvents, nearEvents] = await Promise.all([
    eventsWithRecipients(in24hStart, in24hEnd),
    eventsWithRecipients(in2hStart, in2hEnd),
  ]);

  const dayResults = await fanOut(dayEvents, "24h");
  const nearResults = await fanOut(nearEvents, "2h");

  console.log("[cron:booking-reminders]", {
    at: now.toISOString(),
    day: { events: dayEvents.length, ...dayResults },
    near: { events: nearEvents.length, ...nearResults },
  });

  return NextResponse.json({
    ok: true,
    day: dayResults,
    near: nearResults,
  });
}

async function eventsWithRecipients(from: Date, to: Date) {
  return db.event.findMany({
    where: { startsAt: { gte: from, lt: to }, programId: { not: null } },
    include: {
      tenant: { select: { name: true, slug: true, timeZone: true } },
      location: { select: { name: true } },
      program: {
        include: {
          enrollments: {
            where: { status: { in: ["ACTIVE", "CONFIRMED", "PAID"] } },
            include: { player: true },
          },
        },
      },
    },
  });
}

type FanoutEvent = Awaited<ReturnType<typeof eventsWithRecipients>>[number];

async function fanOut(events: FanoutEvent[], lead: "24h" | "2h") {
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const event of events) {
    if (!event.program) continue;
    const parentIds = Array.from(
      new Set(
        event.program.enrollments
          .map((e) => e.player.parentId)
          .filter((id): id is string => !!id)
      )
    );
    if (parentIds.length === 0) continue;
    const [parents, prefRows] = await Promise.all([
      db.user.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, name: true, email: true },
      }),
      db.userPreferences.findMany({
        where: { userId: { in: parentIds } },
      }),
    ]);
    const prefByUser = new Map(prefRows.map((p) => [p.userId, p]));

    for (const parent of parents) {
      if (!parent.email) {
        skipped++;
        continue;
      }
      const pref = prefByUser.get(parent.id);
      // Missing preferences row = opted in.
      if (pref && !pref.emailReminders) {
        skipped++;
        continue;
      }
      try {
        await sendBookingReminderEmail({
          to: parent.email,
          parentName: parent.name,
          tenantName: event.tenant.name,
          tenantSlug: event.tenant.slug,
          programName: event.program.name,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          locationName: event.location?.name ?? null,
          lead,
          timeZone: event.tenant.timeZone ?? undefined,
        });
        sent++;
      } catch (err) {
        failed++;
        console.error("[cron:booking-reminders] send failed", {
          eventId: event.id,
          parentId: parent.id,
          err: (err as Error).message,
        });
      }
    }
  }

  return { sent, skipped, failed };
}
