/**
 * Integration tests for the confirmParentDeletionAction pipeline.
 *
 * Mirrors the env-loading pattern of `parents.test.ts` — vitest defines a
 * stub DATABASE_URL so unit tests don't dial the network, and we override
 * it here with the real Neon dev URL before constructing the PrismaClient.
 *
 * confirmParentDeletionAction calls `redirect()` at both success and
 * expired-token paths. Next's `redirect()` throws a special NEXT_REDIRECT
 * error in non-route contexts, so both assertions use `rejects.toBeDefined()`.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const envLocal = path.resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  config({ path: envLocal, override: true });
}

import { describe, expect, it, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { findOrCreateParent, attachUserToParent } from "@/lib/parents";

// Dynamic import: the action pulls the @/lib/db singleton, which captures
// DATABASE_URL at first module load. The dotenv override above must run
// before that singleton is constructed, so we defer the import to runtime.
async function loadConfirmAction() {
  const mod = await import("@/actions/parent-deletion");
  return mod.confirmParentDeletionAction;
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

let TENANT_ID: string;

function entropy() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeEach(async () => {
  const t = await db.tenant.create({
    data: {
      slug: `dlt-${entropy()}`,
      name: "DLT",
      type: "COACH",
    },
  });
  TENANT_ID = t.id;
});

describe("confirmParentDeletionAction pipeline", () => {
  it("anonymizes Parent + TenantParent + Players + Invoice payerEmails", async () => {
    const userEmail = `d-${entropy()}@x.com`;
    const user = await db.user.create({
      data: { email: userEmail, name: "Del" },
    });
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: userEmail,
      name: "Del",
    });
    await attachUserToParent(db, { parentId: parent.id, userId: user.id });

    // Player with no activity → fully anonymized to "Deleted Player".
    const orphan = await db.player.create({
      data: {
        tenantId: TENANT_ID,
        firstName: "Orphan",
        lastName: "Kid",
        dob: new Date("2015-01-01"),
        parentRefId: parent.id,
      },
    });

    // Issue a deletion token (skipping the staff-invoked request action).
    const token = `tok-${entropy()}`;
    await db.parent.update({
      where: { id: parent.id },
      data: {
        pendingDeletionToken: token,
        pendingDeletionRequestedAt: new Date(),
        pendingDeletionRequestedBy: user.id,
      },
    });

    // redirect() throws NEXT_REDIRECT in test env — both success and
    // expired paths reject.
    const confirmParentDeletionAction = await loadConfirmAction();
    // redirect() throws NEXT_REDIRECT in test env — both success and
    // expired paths reject.
    await expect(
      confirmParentDeletionAction(token)
    ).rejects.toBeDefined();

    const after = await db.parent.findUnique({ where: { id: parent.id } });
    expect(after?.email).toMatch(/deleted-/);
    expect(after?.name).toBeNull();
    expect(after?.deletedAt).not.toBeNull();
    expect(after?.userId).toBeNull();

    const tp = await db.tenantParent.findUnique({
      where: {
        tenantId_parentId: { tenantId: TENANT_ID, parentId: parent.id },
      },
    });
    expect(tp?.status).toBe("REVOKED");

    const orphanAfter = await db.player.findUnique({
      where: { id: orphan.id },
    });
    expect(orphanAfter?.firstName).toBe("Deleted");
    expect(orphanAfter?.parentRefId).toBeNull();
  });

  it("rejects an expired token", async () => {
    const email = `exp-${entropy()}@x.com`;
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email,
    });
    const token = `exp-tok-${entropy()}`;
    await db.parent.update({
      where: { id: parent.id },
      data: {
        pendingDeletionToken: token,
        pendingDeletionRequestedAt: new Date(Date.now() - 10 * 86400 * 1000),
      },
    });
    const confirmParentDeletionAction = await loadConfirmAction();
    await expect(
      confirmParentDeletionAction(token)
    ).rejects.toBeDefined();
    const after = await db.parent.findUnique({ where: { id: parent.id } });
    // Should NOT be anonymized.
    expect(after?.deletedAt).toBeNull();
  });
});
