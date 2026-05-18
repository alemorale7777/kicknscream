import { db } from "@/lib/db";

/**
 * Load upcoming events for the given parent's kids by walking
 * Player → Enrollment → Program → Event. This is the structurally
 * correct way to surface family-side schedules — earlier code tried to
 * match Event.title against player names, which only worked for events
 * created via the booking flow (their titles include the kid's name)
 * and quietly missed every coach-created event.
 *
 * Returns events ordered by start time, each with the matching player
 * attached so the UI can group by kid.
 */
export async function loadUpcomingFamilyEvents(
  tenantId: string,
  parentUserId: string,
  opts: { limit?: number; since?: Date } = {}
) {
  const limit = opts.limit ?? 50;
  const since = opts.since ?? new Date();

  // Player set — direct parentId, plus the ParentPlayer junction so
  // multi-guardian families also see events for kids they're linked to.
  const players = await db.player.findMany({
    where: {
      tenantId,
      OR: [
        { parentId: parentUserId },
        { parentLinks: { some: { parentUserId } } },
      ],
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (players.length === 0) return [];
  const playerIds = players.map((p) => p.id);

  const enrollments = await db.enrollment.findMany({
    where: {
      playerId: { in: playerIds },
      status: { in: ["ACTIVE", "CONFIRMED", "PAID", "PENDING"] },
    },
    select: { playerId: true, programId: true },
  });
  if (enrollments.length === 0) return [];

  const programIds = Array.from(new Set(enrollments.map((e) => e.programId)));
  const programToPlayers = new Map<string, Set<string>>();
  for (const e of enrollments) {
    if (!programToPlayers.has(e.programId))
      programToPlayers.set(e.programId, new Set());
    programToPlayers.get(e.programId)!.add(e.playerId);
  }

  const events = await db.event.findMany({
    where: {
      tenantId,
      programId: { in: programIds },
      startsAt: { gte: since },
    },
    include: { location: true },
    orderBy: { startsAt: "asc" },
    take: limit,
  });

  const playerById = new Map(players.map((p) => [p.id, p]));

  return events
    .map((event) => {
      const eligible = event.programId
        ? programToPlayers.get(event.programId) ?? new Set<string>()
        : new Set<string>();
      // Pick the first enrolled kid for the event — if more than one of
      // the parent's kids is in the same program, both will see it via
      // the all-kids list in the family schedule view.
      const playerIdsForEvent = playerIds.filter((id) => eligible.has(id));
      return {
        event,
        players: playerIdsForEvent
          .map((id) => playerById.get(id)!)
          .filter(Boolean),
      };
    })
    .filter((row) => row.players.length > 0);
}
