import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";
import { addHours } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly cron — fans out booking reminders.
 *
 * For events starting in the 24h-25h window: send the 24h reminder.
 * For events starting in the 2h-3h window:   send the 2h reminder.
 *
 * Reminder emails are skipped if the parent's UserPreferences.emailReminders
 * is false. (Today everyone is opted-in by default; settings UI ships in Phase E.)
 *
 * MVP behavior: log + count what we'd send. Full email fan-out wires up in
 * Phase E when notification preferences ship.
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

  const [day, near] = await Promise.all([
    db.event.count({ where: { startsAt: { gte: in24hStart, lt: in24hEnd } } }),
    db.event.count({ where: { startsAt: { gte: in2hStart, lt: in2hEnd } } }),
  ]);

  // TODO Phase E: actually send emails. For now we log + return counts.
  console.log("[cron:booking-reminders]", { day, near, at: now.toISOString() });

  return NextResponse.json({ ok: true, sentDay: 0, sentNear: 0, candidates: { day, near } });
}
