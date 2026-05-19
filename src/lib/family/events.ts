import { db } from "@/lib/db";
import { parentModelV2Enabled, parentModelV2EnabledFor } from "@/lib/env";
import type { Parent } from "@prisma/client";

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
 *
 * When `parent-model-v2` is ENABLED and a Parent row is provided, we
 * key player lookup off `parentRefId`. Otherwise we fall back to the
 * legacy `parentId` (User.id) pointer + ParentPlayer junction.
 */
export async function loadUpcomingFamilyEvents(
  tenantId: string,
  parentUserId: string,
  opts: { limit?: number; since?: Date; parent?: Parent | null; tenantSlug?: string } = {}
) {
  const limit = opts.limit ?? 50;
  const since = opts.since ?? new Date();
  const parent = opts.parent ?? null;

  // Player set — branch on parent-model-v2:
  //   - flag ON (global) or per-tenant override + Parent row: scope by
  //     parentRefId (canonical link to Parent.id)
  //   - otherwise: legacy parentId (User.id) + ParentPlayer junction
  const v2 = opts.tenantSlug
    ? parentModelV2EnabledFor(opts.tenantSlug)
    : parentModelV2Enabled();
  const playerWhere =
    v2 && parent
      ? { tenantId, parentRefId: parent.id }
      : {
          tenantId,
          OR: [
            { parentId: parentUserId },
            { parentLinks: { some: { parentUserId } } },
          ],
        };

  const players = await db.player.findMany({
    where: playerWhere,
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
