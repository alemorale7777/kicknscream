import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";
import { sendFamilyDigestEmail } from "@/lib/email";
import { subDays, addDays } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sunday 15:00 UTC — fan-out a weekly recap email to every parent
 * with email-reminders enabled. Skips parents with nothing to report
 * (no attended sessions, no notes, no upcoming session this week).
 */
export async function GET() {
  try {
    await assertCronAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStart = subDays(new Date(), 7);
  const weekEnd = new Date();
  const nextWeekEnd = addDays(weekEnd, 7);

  const parents = await db.user.findMany({
    where: {
      memberships: { some: { role: { in: ["PARENT", "PLAYER"] } } },
    },
    include: {
      memberships: {
        where: { role: { in: ["PARENT", "PLAYER"] } },
        select: { tenantId: true },
      },
    },
  });

  // Load preferences for these parents to honor emailReminders.
  const prefRows = await db.userPreferences.findMany({
    where: { userId: { in: parents.map((p) => p.id) } },
  });
  const prefsById = new Map(prefRows.map((p) => [p.userId, p]));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const parent of parents) {
    const pref = prefsById.get(parent.id);
    // Missing prefs row = opted in (default true).
    if (pref && !pref.emailReminders) {
      skipped++;
      continue;
    }
    if (!parent.email) {
      skipped++;
      continue;
    }
    for (const m of parent.memberships) {
      try {
        const tenant = await db.tenant.findUnique({
          where: { id: m.tenantId },
          select: { id: true, name: true, slug: true },
        });
        if (!tenant) continue;
        const players = await db.player.findMany({
          where: {
            tenantId: tenant.id,
            OR: [
              { parentId: parent.id },
              { parentLinks: { some: { parentUserId: parent.id } } },
            ],
          },
          select: { id: true, firstName: true, lastName: true },
        });
        if (players.length === 0) continue;
        const kids = await Promise.all(
          players.map(async (p) => {
            const [attendances, notes, enrollments, nextEvent] =
              await Promise.all([
                db.attendance.findMany({
                  where: {
                    playerId: p.id,
                    event: { startsAt: { gte: weekStart, lt: weekEnd } },
                  },
                  include: { event: true },
                }),
                db.sessionNote.findMany({
                  where: {
                    playerId: p.id,
                    visibleToParent: true,
                    createdAt: { gte: weekStart, lt: weekEnd },
                  },
                  include: { event: { select: { title: true } } },
                }),
                db.enrollment.findMany({
                  where: {
                    playerId: p.id,
                    status: { in: ["ACTIVE", "CONFIRMED", "PAID"] },
                    program: { priceModel: "PACKAGE" },
                  },
                  include: { program: { select: { packSize: true } } },
                  take: 1,
                }),
                db.event.findFirst({
                  where: {
                    tenantId: tenant.id,
                    startsAt: { gte: weekEnd, lt: nextWeekEnd },
                    program: {
                      enrollments: {
                        some: {
                          playerId: p.id,
                          status: { in: ["ACTIVE", "CONFIRMED", "PAID"] },
                        },
                      },
                    },
                  },
                  orderBy: { startsAt: "asc" },
                  select: { title: true, startsAt: true },
                }),
              ]);
            const attendedThisWeek = attendances.filter(
              (a) => a.status === "PRESENT" || a.status === "LATE"
            ).length;
            const enrollment = enrollments[0];
            return {
              firstName: p.firstName,
              lastName: p.lastName,
              attendedThisWeek,
              totalThisWeek: attendances.length,
              packBalance: enrollment?.packBalance ?? null,
              packSize: enrollment?.program?.packSize ?? null,
              notes: notes.map((n) => ({
                content: n.content,
                eventTitle: n.event.title,
                createdAt: n.createdAt,
              })),
              nextSession: nextEvent
                ? { title: nextEvent.title, startsAt: nextEvent.startsAt }
                : null,
            };
          })
        );

        // Skip if there's nothing worth reporting.
        const hasContent = kids.some(
          (k) => k.totalThisWeek > 0 || k.notes.length > 0 || k.nextSession
        );
        if (!hasContent) {
          skipped++;
          continue;
        }

        await sendFamilyDigestEmail({
          to: parent.email,
          parentName: parent.name ?? "there",
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          kids,
        });
        sent++;
      } catch (err) {
        failed++;
        console.error("[cron:family-digest] send failed", {
          parentId: parent.id,
          tenantId: m.tenantId,
          err: (err as Error).message,
        });
      }
    }
  }

  console.log("[cron:family-digest]", { sent, skipped, failed });
  return NextResponse.json({ ok: true, sent, skipped, failed });
}
