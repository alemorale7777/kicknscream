import { requireFamilyAccess } from "@/lib/tenant";
import { db } from "@/lib/db";
import { parentModelV2Enabled } from "@/lib/env";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/schedule/Markdown";
import { format, differenceInYears } from "date-fns";
import { getInitials } from "@/lib/utils";
import { ArrowLeft, Calendar, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Player" };

export default async function FamilyKidPage({
  params,
}: {
  params: Promise<{ slug: string; playerId: string }>;
}) {
  const { slug, playerId } = await params;
  const { tenant, user, parent } = await requireFamilyAccess(slug);

  const player = await db.player.findUnique({
    where: { id: playerId },
    include: { parentLinks: { select: { parentUserId: true } } },
  });
  // 404 unless this kid is linked to the current user. Under parent-model-v2
  // we key off Player.parentRefId === parent.id; otherwise fall back to the
  // legacy parentId pointer + ParentPlayer junction.
  const linked =
    !!player &&
    (parentModelV2Enabled() && parent
      ? player.parentRefId === parent.id
      : player.parentId === user.id ||
        player.parentLinks.some((l) => l.parentUserId === user.id));
  if (!player || player.tenantId !== tenant.id || !linked) {
    notFound();
  }

  const enrollments = await db.enrollment.findMany({
    where: {
      playerId: player.id,
      status: { in: ["ACTIVE", "CONFIRMED", "PAID", "PENDING"] },
    },
    select: {
      programId: true,
      packBalance: true,
      program: {
        select: { id: true, name: true, priceModel: true, packSize: true },
      },
    },
  });
  const programIds = Array.from(new Set(enrollments.map((e) => e.programId)));

  const [attendances, sessionNotes, upcomingEvents] = await Promise.all([
    db.attendance.findMany({
      where: { playerId: player.id },
      include: { event: true },
      orderBy: { event: { startsAt: "desc" } },
    }),
    db.sessionNote.findMany({
      where: { playerId: player.id, visibleToParent: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    programIds.length > 0
      ? db.event.findMany({
          where: {
            tenantId: tenant.id,
            programId: { in: programIds },
            startsAt: { gte: new Date() },
          },
          include: { location: true },
          orderBy: { startsAt: "asc" },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  const age = differenceInYears(new Date(), player.dob);
  const present = attendances.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE"
  ).length;
  const attendancePct =
    attendances.length === 0 ? null : Math.round((present / attendances.length) * 100);

  return (
    <div className="space-y-6">
      <Link
        href={`/t/${tenant.slug}/family/home`}
        className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-300"
      >
        <ArrowLeft className="h-3 w-3" /> Back home
      </Link>

      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            {player.photoUrl && <AvatarImage src={player.photoUrl} alt="" />}
            <AvatarFallback className="text-base">
              {getInitials(`${player.firstName} ${player.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">
              {player.firstName} {player.lastName}
            </h1>
            <p className="text-sm text-ink-500 font-mono">age {age}</p>
          </div>
          {attendancePct !== null && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-ink-500">Attendance</p>
              <p className="font-mono text-lg font-semibold text-turf-300">{attendancePct}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        const activePacks = enrollments.filter(
          (e) =>
            e.program?.priceModel === "PACKAGE" &&
            e.program.packSize &&
            e.packBalance !== null
        );
        if (activePacks.length === 0) return null;
        return (
          <section className="space-y-2">
            <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">
              Sessions remaining
            </h2>
            <div className="space-y-2">
              {activePacks.map((e) => {
                const balance = e.packBalance ?? 0;
                const size = e.program!.packSize!;
                const pct = (balance / size) * 100;
                return (
                  <Card key={e.programId} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-ink-50">{e.program!.name}</p>
                      <span className="font-mono text-sm text-turf-300">
                        {balance} of {size} left
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-pitch-700 overflow-hidden">
                      <div
                        className="h-full bg-turf-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })()}

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">Upcoming sessions</h2>
        {upcomingEvents.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <Calendar className="h-7 w-7 text-ink-700 mx-auto mb-2" />
            <p className="text-sm text-ink-300">No upcoming sessions</p>
            <Button variant="primary" size="sm" asChild className="mt-3">
              <Link href={`/t/${tenant.slug}/family/book`}>Book a session</Link>
            </Button>
          </Card>
        ) : (
          upcomingEvents.map((ev) => (
            <Card key={ev.id} className="p-3 flex items-center gap-3">
              <span className="text-xs font-mono text-ink-300 shrink-0 w-32">
                {format(ev.startsAt, "MMM d · h:mm a")}
              </span>
              <span className="font-medium text-ink-50 truncate flex-1">{ev.title}</span>
              {ev.location && (
                <span className="text-xs text-ink-500 truncate hidden sm:inline">
                  {ev.location.name}
                </span>
              )}
            </Card>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">Recent attendance</h2>
        {attendances.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <CheckCircle2 className="h-7 w-7 text-ink-700 mx-auto mb-2" />
            <p className="text-sm text-ink-300">No attendance recorded yet</p>
          </Card>
        ) : (
          attendances.slice(0, 8).map((a) => (
            <Card key={a.id} className="p-3 flex items-center gap-3">
              <span className="text-xs font-mono text-ink-300 shrink-0 w-32">
                {format(a.event.startsAt, "MMM d")}
              </span>
              <span className="font-medium text-ink-50 truncate flex-1">{a.event.title}</span>
              <Badge
                variant={
                  a.status === "PRESENT" ? "turf" : a.status === "LATE" ? "outline" : "danger"
                }
                className="text-[10px]"
              >
                {a.status.toLowerCase()}
              </Badge>
            </Card>
          ))
        )}
      </section>

      {sessionNotes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">Coach notes</h2>
          {sessionNotes.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex items-baseline justify-end gap-2 mb-2">
                <span className="text-xs font-mono text-ink-500">
                  {format(n.createdAt, "MMM d, yyyy")}
                </span>
              </div>
              <Markdown>{n.content}</Markdown>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
