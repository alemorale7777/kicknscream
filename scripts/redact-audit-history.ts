/* eslint-disable no-console */
/**
 * One-shot. Walks every existing AuditLog row whose `diff` JSON contains
 * `email`, `parentEmail`, or `payerEmail`, hashes the value via emailHash(),
 * and rewrites the row. Idempotent — re-running after an APPLY is a no-op
 * because the raw key has been deleted and only the *Hash variant remains.
 *
 * Usage:
 *   pnpm tsx scripts/redact-audit-history.ts            # dry run
 *   pnpm tsx scripts/redact-audit-history.ts --apply
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
import { emailHash, logAudit } from "../src/lib/audit";

// Match the production wiring in src/lib/db.ts — Neon HTTP adapter is required
// because Prisma 7 + Neon serverless URLs don't speak vanilla TCP.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const APPLY = process.argv.includes("--apply");

const REDACT_KEYS = ["email", "parentEmail", "payerEmail"] as const;

async function main() {
  console.log(`[redact-audit-history] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { diff: { path: ["email"], not: null } },
        { diff: { path: ["parentEmail"], not: null } },
        { diff: { path: ["payerEmail"], not: null } },
      ],
    },
  });

  let touched = 0;
  for (const row of rows) {
    const diff = row.diff as Record<string, unknown> | null;
    if (!diff || typeof diff !== "object" || Array.isArray(diff)) continue;
    const fixed: Record<string, unknown> = { ...diff };
    let changed = false;
    for (const k of REDACT_KEYS) {
      const v = fixed[k];
      if (typeof v === "string" && v.includes("@")) {
        fixed[`${k}Hash`] = emailHash(v);
        delete fixed[k];
        changed = true;
      }
    }
    if (changed) {
      if (APPLY) {
        await prisma.auditLog.update({
          where: { id: row.id },
          data: { diff: fixed as object },
        });
      }
      touched++;
    }
  }

  if (APPLY) {
    await logAudit({
      tenantId: null,
      actorUserId: null,
      action: "data.audit_backfill",
      diff: { rowsRewritten: touched },
    });
  }

  console.log(JSON.stringify({ rowsRewritten: touched, dryRun: !APPLY }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
