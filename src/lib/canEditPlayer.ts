import { db } from "@/lib/db";
import { hasRole } from "@/lib/roles";

/**
 * Returns true when `user` is allowed to edit `player` — either as a
 * COACH+ member of the player's tenant, or as the player's parent
 * (via direct parentId OR the ParentPlayer junction).
 */
export async function canEditPlayer(
  userId: string,
  playerId: string
): Promise<boolean> {
  const player = await db.player.findUnique({
    where: { id: playerId },
    select: {
      tenantId: true,
      parentId: true,
      parentLinks: { select: { parentUserId: true } },
    },
  });
  if (!player) return false;

  if (player.parentId === userId) return true;
  if (player.parentLinks.some((l) => l.parentUserId === userId)) return true;

  const membership = await db.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId: player.tenantId } },
    select: { role: true },
  });
  if (membership && hasRole(membership.role, "COACH")) return true;

  return false;
}
