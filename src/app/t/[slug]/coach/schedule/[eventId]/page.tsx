import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { hasRole } from "@/lib/roles";
import { db } from "@/lib/db";
import { EVENT_TONE } from "@/lib/eventTone";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionNoteComposer } from "@/components/schedule/SessionNoteComposer";
import { SessionNoteList } from "@/components/schedule/SessionNoteList";
import { AttendanceList } from "@/components/schedule/AttendanceList";
import { formatEventDate, formatEventTime } from "@/lib/datetime";
import {
  Calendar,
  Clock,
  MapPin,
  Users as UsersIcon,
  ArrowLeft,
  FileText,
} from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";

export const metadata = { title: "Event" };

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const { tenant, membership } = await requireTenant(slug);

  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      location: true,
      program: true,
    },
  });
  if (!event || event.tenantId !== tenant.id) notFound();

  const tone = EVENT_TONE[event.type];
  const canManage = hasRole(membership.role, "COACH");

  // Resolve attendees: roster = players enrolled in this program (if any)
  // plus any players who already have an attendance row for this event.
  const [enrollments, existingAttendance] = await Promise.all([
    event.programId
      ? db.enrollment.findMany({
          where: { programId: event.programId, status: { in: ["ACTIVE", "PENDING"] } },
          include: { player: true },
        })
      : Promise.resolve([]),
    db.attendance.findMany({
      where: { eventId: event.id },
      include: { player: true },
    }),
  ]);

  const playerMap = new Map<
    string,
    { player: { id: string; firstName: string; lastName: string }; status: AttendanceStatus | "PENDING" }
  >();
  for (const e of enrollments) {
    playerMap.set(e.player.id, {
      player: { id: e.player.id, firstName: e.player.firstName, lastName: e.player.lastName },
      status: "PENDING",
    });
  }
  for (const a of existingAttendance) {
    playerMap.set(a.player.id, {
      player: { id: a.player.id, firstName: a.player.firstName, lastName: a.player.lastName },
      status: a.status,
    });
  }
  const attendanceEntries = Array.from(playerMap.values()).sort((a, b) =>
    a.player.lastName.localeCompare(b.player.lastName)
  );

  // Session notes
  const notes = await db.sessionNote.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
  });
  const authorIds = Array.from(new Set(notes.map((n) => n.authorId)));
  const playerIdsOnNotes = Array.from(new Set(notes.map((n) => n.playerId).filter((v): v is string => !!v)));
  const [authors, notePlayers] = await Promise.all([
    db.user.findMany({ where: { id: { in: authorIds } } }),
    db.player.findMany({ where: { id: { in: playerIdsOnNotes } } }),
  ]);
  const authorById = new Map(authors.map((u) => [u.id, u]));
  const notePlayerById = new Map(notePlayers.map((p) => [p.id, p]));
  const notesWithMeta = notes.map((n) => ({
    ...n,
    author: authorById.get(n.authorId) ?? null,
    player: n.playerId ? notePlayerById.get(n.playerId) ?? null : null,
  }));

  const playersForComposer = attendanceEntries.map((e) => e.player);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <Link
          href={`/t/${slug}/coach/schedule`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-50 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to schedule
        </Link>
      </div>

      {/* Hero card */}
      <Card className="overflow-hidden">
        <div
          className="px-6 py-5 border-b border-line"
          style={{
            backgroundColor: `color-mix(in srgb, ${tone.accent} 12%, transparent)`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant="outline"
              style={{
                borderColor: `color-mix(in srgb, ${tone.accent} 50%, transparent)`,
                color: tone.accent,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full mr-1.5"
                style={{ backgroundColor: tone.accent }}
              />
              {tone.label}
            </Badge>
            {event.program && <Badge variant="outline">{event.program.name}</Badge>}
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em]">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-ink-300">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatEventDate(event.startsAt, tenant.timeZone ?? "America/Los_Angeles")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {formatEventTime(event.startsAt, tenant.timeZone ?? "America/Los_Angeles")} – {formatEventTime(event.endsAt, tenant.timeZone ?? "America/Los_Angeles")}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {event.location.name}
              </span>
            )}
            {event.capacity && (
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon className="h-4 w-4" />
                {attendanceEntries.length}/{event.capacity}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Attendance */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Attendance</p>
            <h2 className="text-xl font-bold tracking-[-0.02em] mt-1">Who&apos;s here?</h2>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/t/${slug}/coach/roster`}>
              <UsersIcon className="h-3.5 w-3.5" />
              Manage roster
            </Link>
          </Button>
        </div>

        <AttendanceList
          tenantId={tenant.id}
          eventId={event.id}
          entries={attendanceEntries}
          canEdit={canManage}
        />
      </section>

      {/* Session notes */}
      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500 inline-flex items-center gap-2">
            <FileText className="h-3 w-3" /> Session notes
          </p>
          <h2 className="text-xl font-bold tracking-[-0.02em] mt-1">What happened</h2>
          <p className="text-sm text-ink-500 mt-1">
            Tag a player and we&apos;ll email the parent a clean, branded version of your note.
          </p>
        </div>

        {canManage && (
          <SessionNoteComposer
            tenantId={tenant.id}
            eventId={event.id}
            players={playersForComposer}
            programName={event.program?.name ?? event.title}
            eventTitle={event.title}
          />
        )}

        <SessionNoteList
          tenantId={tenant.id}
          notes={notesWithMeta}
          currentUserId={membership.userId}
          canEditAny={hasRole(membership.role, "ADMIN")}
        />
      </section>
    </div>
  );
}
