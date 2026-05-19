/* eslint-disable no-console */
/**
 * One-shot Phase B backfill. Walks existing PARENT memberships and creates
 * the matching Parent + TenantParent + parentRefId rows.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-parents.ts            # dry run
 *   pnpm tsx scripts/backfill-parents.ts --apply    # writes
 *
 * Safe to re-run — every write is an upsert on a natural key.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

// Load .env.local BEFORE importing anything that reads process.env (src/lib/env.ts
// validates at module-load time and will throw if DATABASE_URL etc. are missing).
for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (existsSync(full)) config({ path: full, override: false });
}

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { logAudit } from "../src/lib/audit";

// Match the production wiring in src/lib/db.ts — Neon HTTP adapter is required
// because Prisma 7 + Neon serverless URLs don't speak vanilla TCP.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const APPLY = process.argv.includes("--apply");

type Summary = {
  parents_created_or_updated: number;
  tenant_parents_created: number;
  players_linked: number;
  parent_player_rows_linked: number;
  orphans_skipped_players: string[];
  orphans_skipped_parent_player_rows: string[];
};

async function main() {
  console.log(`[backfill] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const summary: Summary = {
    parents_created_or_updated: 0,
    tenant_parents_created: 0,
    players_linked: 0,
    parent_player_rows_linked: 0,
    orphans_skipped_players: [],
    orphans_skipped_parent_player_rows: [],
  };

  const parentMemberships = await prisma.membership.findMany({
    where: { role: "PARENT" },
    include: { user: true },
  });

  const byEmail = new Map<
    string,
    {
      user: typeof parentMemberships[number]["user"];
      tenants: { tenantId: string; createdAt: Date }[];
    }
  >();
  for (const m of parentMemberships) {
    const key = m.user.email.toLowerCase().trim();
    if (!byEmail.has(key)) {
      byEmail.set(key, { user: m.user, tenants: [] });
    }
    byEmail.get(key)!.tenants.push({ tenantId: m.tenantId, createdAt: m.createdAt });
  }

  for (const [email, { user, tenants }] of byEmail) {
    let parentId: string;
    if (APPLY) {
      const parent = await prisma.parent.upsert({
        where: { email },
        create: {
          email,
          name: user.name ?? null,
          phone: user.phone ?? null,
          userId: user.id,
        },
        update: {
          name: user.name ?? null,
          phone: user.phone ?? null,
          userId: user.id,
        },
      });
      parentId = parent.id;
    } else {
      parentId = `<dry:${email}>`;
    }
    summary.parents_created_or_updated++;

    for (const t of tenants) {
      if (APPLY) {
        await prisma.tenantParent.upsert({
          where: { tenantId_parentId: { tenantId: t.tenantId, parentId } },
          create: {
            tenantId: t.tenantId,
            parentId,
            status: "ACTIVE",
            registeredAt: t.createdAt,
          },
          update: {},
        });
      }
      summary.tenant_parents_created++;
    }

    const players = await prisma.player.findMany({
      where: { parentId: user.id },
      select: { id: true, tenantId: true },
    });
    for (const p of players) {
      if (APPLY) {
        await prisma.player.update({
          where: { id: p.id },
          data: { parentRefId: parentId },
        });
      }
      summary.players_linked++;
    }

    const pps = await prisma.parentPlayer.findMany({
      where: { parentUserId: user.id },
      select: { parentUserId: true, playerId: true },
    });
    for (const pp of pps) {
      if (APPLY) {
        await prisma.parentPlayer.updateMany({
          where: {
            parentUserId: pp.parentUserId,
            playerId: pp.playerId,
          },
          data: { parentRefId: parentId },
        });
      }
      summary.parent_player_rows_linked++;
    }
  }

  const allOrphanPlayers = await prisma.player.findMany({
    where: { parentId: { not: null }, parentRefId: null },
    select: { id: true, parentId: true },
  });
  summary.orphans_skipped_players = allOrphanPlayers.map((p) => p.id);

  const orphanPPs = await prisma.parentPlayer.findMany({
    where: { parentRefId: null },
    select: { parentUserId: true, playerId: true },
  });
  summary.orphans_skipped_parent_player_rows = orphanPPs.map(
    (p) => `${p.parentUserId}->${p.playerId}`
  );

  if (APPLY) {
    await logAudit({
      tenantId: null,
      actorUserId: null,
      action: "data.parent_backfill",
      targetType: "parent",
      diff: summary as unknown as Record<string, unknown>,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
