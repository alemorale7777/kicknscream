import { randomBytes } from "node:crypto";
import type { Parent, Prisma, PrismaClient, TenantParent } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const CLAIM_TOKEN_TTL_DAYS = 30;

export type FindOrCreateParentInput = {
  tenantId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
};

export type FindOrCreateParentResult = {
  parent: Parent;
  tenantParent: TenantParent;
  /** True if a brand-new Parent row was created on this call. */
  created: boolean;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Find-or-create a Parent globally by email, then ensure a TenantParent
 * link exists for this tenant. Reuses an existing Parent across tenants —
 * a parent who books at Coach A and PDX Skills is ONE Parent with TWO
 * TenantParent rows.
 *
 * Idempotent: re-running with the same input is a no-op besides
 * refreshing TenantParent.registeredAt if absent (it isn't here — upsert
 * with empty update preserves the original).
 */
export async function findOrCreateParent(
  db: Db,
  input: FindOrCreateParentInput
): Promise<FindOrCreateParentResult> {
  const email = normalizeEmail(input.email);
  let parent = await db.parent.findUnique({ where: { email } });
  let created = false;
  if (!parent) {
    parent = await db.parent.create({
      data: {
        email,
        name: input.name ?? null,
        phone: input.phone ?? null,
      },
    });
    created = true;
  }
  const tenantParent = await db.tenantParent.upsert({
    where: {
      tenantId_parentId: { tenantId: input.tenantId, parentId: parent.id },
    },
    create: {
      tenantId: input.tenantId,
      parentId: parent.id,
      status: "ACTIVE",
    },
    update: {},
  });
  return { parent, tenantParent, created };
}

/**
 * Revoke a parent's access at a single tenant. Sets status=REVOKED and
 * stamps revokedAt. Scoped to one (tenantId, parentId) row — does not
 * touch the parent's links at other tenants.
 */
export async function revokeTenantAccess(
  db: Db,
  args: { tenantId: string; parentId: string }
): Promise<void> {
  await db.tenantParent.update({
    where: {
      tenantId_parentId: { tenantId: args.tenantId, parentId: args.parentId },
    },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
}

/**
 * Reverse a prior revoke: set status back to ACTIVE and clear revokedAt.
 * Scoped to the single (tenantId, parentId) row.
 */
export async function restoreTenantAccess(
  db: Db,
  args: { tenantId: string; parentId: string }
): Promise<void> {
  await db.tenantParent.update({
    where: {
      tenantId_parentId: { tenantId: args.tenantId, parentId: args.parentId },
    },
    data: { status: "ACTIVE", revokedAt: null },
  });
}

/**
 * Attach an auth User to a Parent (claim flow). One Parent maps to at
 * most one User — the Parent.userId column is uniquely constrained, so
 * attempting to attach a second User to the same Parent will surface as
 * a Prisma unique-violation upstream.
 */
export async function attachUserToParent(
  db: Db,
  args: { parentId: string; userId: string }
): Promise<void> {
  await db.parent.update({
    where: { id: args.parentId },
    data: { userId: args.userId },
  });
}

/**
 * Look up the Parent row attached to a given User. Returns null when
 * the User has never claimed a Parent. Uses findFirst (not findUnique)
 * to avoid surfacing a runtime error if the @unique invariant is ever
 * relaxed; the unique constraint still guarantees at most one row.
 */
export async function findParentForUser(
  db: Db,
  userId: string
): Promise<Parent | null> {
  return db.parent.findFirst({ where: { userId } });
}

export type MergeParentsResult = {
  winnerId: string;
  loserId: string;
  kidsMoved: number;
  parentPlayerRowsMoved: number;
  tenantsCollapsed: number;
};

/**
 * Collapse `loserId` into `winnerId`. Re-points every Player + ParentPlayer
 * link, dedupes TenantParent collisions (keeps older registeredAt + appends
 * notes), hoists userId if winner lacks one, and soft-deletes the loser.
 *
 * Wraps in a $transaction so partial failures roll back cleanly.
 */
export async function mergeParents(
  db: PrismaClient,
  args: { winnerId: string; loserId: string }
): Promise<MergeParentsResult> {
  if (args.winnerId === args.loserId) {
    throw new Error("Cannot merge a parent into itself");
  }
  return db.$transaction(async (tx) => {
    const [winner, loser] = await Promise.all([
      tx.parent.findUniqueOrThrow({ where: { id: args.winnerId } }),
      tx.parent.findUniqueOrThrow({ where: { id: args.loserId } }),
    ]);

    const playerUpdate = await tx.player.updateMany({
      where: { parentRefId: loser.id },
      data: { parentRefId: winner.id },
    });

    const ppUpdate = await tx.parentPlayer.updateMany({
      where: { parentRefId: loser.id },
      data: { parentRefId: winner.id },
    });

    const loserTps = await tx.tenantParent.findMany({
      where: { parentId: loser.id },
    });
    let tenantsCollapsed = 0;
    for (const loserTp of loserTps) {
      const winnerTp = await tx.tenantParent.findUnique({
        where: {
          tenantId_parentId: { tenantId: loserTp.tenantId, parentId: winner.id },
        },
      });
      if (winnerTp) {
        const keepRegisteredAt =
          loserTp.registeredAt < winnerTp.registeredAt
            ? loserTp.registeredAt
            : winnerTp.registeredAt;
        const mergedNotes =
          [winnerTp.notes, loserTp.notes].filter(Boolean).join("\n\n---\n\n") || null;
        await tx.tenantParent.update({
          where: {
            tenantId_parentId: { tenantId: loserTp.tenantId, parentId: winner.id },
          },
          data: { registeredAt: keepRegisteredAt, notes: mergedNotes },
        });
        await tx.tenantParent.delete({
          where: {
            tenantId_parentId: { tenantId: loserTp.tenantId, parentId: loser.id },
          },
        });
      } else {
        await tx.tenantParent.update({
          where: {
            tenantId_parentId: { tenantId: loserTp.tenantId, parentId: loser.id },
          },
          data: { parentId: winner.id },
        });
      }
      tenantsCollapsed++;
    }

    if (!winner.userId && loser.userId) {
      // Loser must shed userId first because Parent.userId is @unique
      await tx.parent.update({
        where: { id: loser.id },
        data: { userId: null },
      });
      await tx.parent.update({
        where: { id: winner.id },
        data: { userId: loser.userId },
      });
    }

    await tx.parent.update({
      where: { id: loser.id },
      data: {
        email: `merged-${loser.id}@kicknscream.local`,
        name: null,
        phone: null,
        userId: null,
        deletedAt: new Date(),
      },
    });

    return {
      winnerId: winner.id,
      loserId: loser.id,
      kidsMoved: playerUpdate.count,
      parentPlayerRowsMoved: ppUpdate.count,
      tenantsCollapsed,
    };
  });
}

/**
 * Mint a claim token for a Parent. The token is a URL-safe random string
 * embedded in the magic claim link sent in the booking confirmation email.
 * Overwrites any prior un-consumed token — the most recently issued link
 * wins, which matches the user's mental model ("the latest email is the
 * one that works").
 */
export async function issueClaimToken(
  db: Db,
  parentId: string
): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_DAYS * 86400 * 1000);
  await db.parent.update({
    where: { id: parentId },
    data: { claimToken: token, claimTokenExpiresAt: expiresAt },
  });
  return token;
}

/**
 * Consume a claim token: look up the Parent, verify the token is not
 * expired, and attach the given userId. Returns null when the token is
 * unknown or expired so the caller can route to /claim/expired without
 * leaking which case it was.
 *
 * Clears claimToken + claimTokenExpiresAt on success so the same link can
 * only be redeemed once.
 */
export async function consumeClaimToken(
  db: Db,
  args: { token: string; userId: string }
): Promise<{ parent: Parent } | null> {
  const parent = await db.parent.findUnique({
    where: { claimToken: args.token },
  });
  if (!parent) return null;
  if (parent.claimTokenExpiresAt && parent.claimTokenExpiresAt < new Date()) {
    return null;
  }
  const updated = await db.parent.update({
    where: { id: parent.id },
    data: {
      userId: args.userId,
      claimToken: null,
      claimTokenExpiresAt: null,
    },
  });
  return { parent: updated };
}
