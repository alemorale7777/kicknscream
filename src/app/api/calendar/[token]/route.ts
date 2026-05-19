import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { addMonths, subDays } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-family iCalendar subscription feed.
 *
 * URL shape: GET /api/calendar/[token].ics
 *
 * Token is an unguessable per-user secret stored on UserPreferences. Anyone
 * with the URL can read; rotating the token (re-issuing via the settings
 * UI) invalidates any previous subscriptions — this is the same model as
 * Google Calendar's "secret address in iCal format".
 *
 * Events returned: every event in tenants the user has a membership in,
 * whose title contains one of their players' names, within a window of
 * [now - 7 days, now + 6 months]. The 7-day lookback gives calendar apps
 * a small backfill so recent changes are picked up.
 *
 * Output is iCalendar (RFC 5545) with VTIMEZONE skipped — we emit UTC
 * timestamps which every modern calendar app handles correctly.
 */

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function icsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  // RFC 5545 §3.1 — lines longer than 75 octets must be folded with a
  // CRLF and a leading space. Approximate the 75-char limit with chars
  // (we're all ASCII for our event titles) since exact octet measurement
  // is overkill for the kind of titles we emit.
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + 75));
    i += 75;
  }
  return out.join("\r\n");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");

  const prefs = await db.userPreferences.findUnique({
    where: { calendarToken: token },
  });
  if (!prefs) {
    return new NextResponse("Not found", { status: 404 });
  }

  const memberships = await db.membership.findMany({
    where: { userId: prefs.userId },
    select: { tenantId: true, role: true },
  });
  if (memberships.length === 0) {
    return new NextResponse(emptyCalendar(), { headers: ICS_HEADERS });
  }

  // Tenants where this user is staff (OWNER/ADMIN/COACH) get the full
  // event stream — owners with no linked Players used to see an empty
  // calendar, which was the bug. Tenants where the user is PARENT/PLAYER
  // stay scoped to the user's linked players' enrollments.
  const staffTenantIds = memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN" || m.role === "COACH")
    .map((m) => m.tenantId);
  const familyTenantIds = memberships
    .filter((m) => m.role === "PARENT" || m.role === "PLAYER")
    .map((m) => m.tenantId);

  let familyProgramIds: string[] = [];
  if (familyTenantIds.length > 0) {
    const players = await db.player.findMany({
      where: {
        tenantId: { in: familyTenantIds },
        OR: [
          { parentId: prefs.userId },
          { parentLinks: { some: { parentUserId: prefs.userId } } },
        ],
      },
      select: { id: true },
    });
    if (players.length > 0) {
      const enrollments = await db.enrollment.findMany({
        where: {
          playerId: { in: players.map((p) => p.id) },
          status: { in: ["ACTIVE", "CONFIRMED", "PAID", "PENDING"] },
        },
        select: { programId: true },
      });
      familyProgramIds = Array.from(new Set(enrollments.map((e) => e.programId)));
    }
  }

  const windowStart = subDays(new Date(), 7);
  const windowEnd = addMonths(new Date(), 6);

  // Build an OR query: ALL events for staff tenants, plus program-scoped
  // events for family-only tenants. If neither bucket has anything the
  // route shortcircuits to an empty calendar above.
  const tenantClauses: { tenantId?: string | { in: string[] }; programId?: { in: string[] } }[] = [];
  if (staffTenantIds.length > 0) {
    tenantClauses.push({ tenantId: { in: staffTenantIds } });
  }
  if (familyTenantIds.length > 0 && familyProgramIds.length > 0) {
    tenantClauses.push({
      tenantId: { in: familyTenantIds },
      programId: { in: familyProgramIds },
    });
  }
  if (tenantClauses.length === 0) {
    return new NextResponse(emptyCalendar(), { headers: ICS_HEADERS });
  }

  const events = await db.event.findMany({
    where: {
      OR: tenantClauses,
      startsAt: { gte: windowStart, lte: windowEnd },
    },
    include: {
      location: true,
      tenant: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const now = new Date();
  const dtstamp = icsDate(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KickNScream//Family//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:KickNScream — Your family`),
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];

  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@kicknscream`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${icsDate(e.startsAt)}`);
    lines.push(`DTEND:${icsDate(e.endsAt)}`);
    lines.push(foldLine(`SUMMARY:${escapeText(e.title)}`));
    if (e.location?.name) {
      const loc = e.location.address
        ? `${e.location.name} — ${e.location.address}`
        : e.location.name;
      lines.push(foldLine(`LOCATION:${escapeText(loc)}`));
    }
    lines.push(foldLine(`DESCRIPTION:${escapeText(`${e.tenant.name} · KickNScream`)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n") + "\r\n", { headers: ICS_HEADERS });
}

const ICS_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  // Tell upstream caches not to share this between subscribers — different
  // tokens have different feeds.
  "Cache-Control": "private, max-age=60",
} as const;

function emptyCalendar(): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KickNScream//Family//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:KickNScream — Your family",
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}
