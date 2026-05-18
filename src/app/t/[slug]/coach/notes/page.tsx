import { requireTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canManageTenant } from "@/lib/roles";
import { PageHeader } from "@/components/chrome/PageHeader";
import { NotesInbox } from "@/components/notes/NotesInbox";

export const metadata = { title: "Notes" };

/**
 * Coach-side session-notes inbox. Lists every SessionNote written across
 * the tenant's events, with filters by player and by program. Notes are
 * authored on the event detail page; this surface is the read-side
 * timeline used when a coach wants to scroll back over a month of
 * post-session writeups without clicking into each event individually.
 */
export default async function CoachNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ playerId?: string; programId?: string }>;
}) {
  const { slug } = await params;
  const { playerId, programId } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  if (!canManageTenant(membership.role)) notFound();

  const [notes, players, programs, authors] = await Promise.all([
    db.sessionNote.findMany({
      where: {
        event: {
          tenantId: tenant.id,
          ...(programId ? { programId } : {}),
        },
        ...(playerId ? { playerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            programId: true,
            program: { select: { id: true, name: true } },
          },
        },
      },
    }),
    db.player.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.program.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      select: { id: true, name: true, email: true },
    }),
  ]);

  const playerIds = Array.from(
    new Set(notes.map((n) => n.playerId).filter((id): id is string => !!id))
  );
  const playerMap = new Map(
    (
      await db.player.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    ).map((p) => [p.id, p])
  );
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  const rows = notes.map((n) => ({
    id: n.id,
    eventId: n.event.id,
    eventTitle: n.event.title,
    eventStartsAt: n.event.startsAt.toISOString(),
    programId: n.event.programId ?? null,
    programName: n.event.program?.name ?? null,
    playerId: n.playerId,
    playerName: n.playerId
      ? (() => {
          const p = playerMap.get(n.playerId);
          return p ? `${p.firstName} ${p.lastName}` : null;
        })()
      : null,
    authorId: n.authorId,
    authorName:
      authorMap.get(n.authorId)?.name ??
      authorMap.get(n.authorId)?.email ??
      "Coach",
    content: n.content,
    visibleToParent: n.visibleToParent,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach"
        title="Notes"
        description="Every session note across the schedule. Filter by player or program to see how someone's been progressing — or how a particular service is landing."
      />

      <NotesInbox
        tenantSlug={slug}
        rows={rows}
        players={players}
        programs={programs}
        selectedPlayerId={playerId ?? null}
        selectedProgramId={programId ?? null}
      />
    </div>
  );
}
