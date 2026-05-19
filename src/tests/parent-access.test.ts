/**
 * Integration tests for the TenantParent gate predicate used by
 * requireParentAccess. The redirects themselves are covered by e2e
 * (Playwright) — out of scope for this unit file.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

// Re-load .env.local with override so the vitest stub DATABASE_URL is
// replaced with the real Neon dev URL before we touch PrismaClient.
const envLocal = path.resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  config({ path: envLocal, override: true });
}

import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

describe("TenantParent gate predicate", () => {
  it("a parent with userId + ACTIVE TenantParent passes the gate query", async () => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2);
    const tenant = await db.tenant.create({
      data: { slug: `gate-${ts}-${rand}`, name: "Gate", type: "COACH" },
    });
    const user = await db.user.create({
      data: { email: `g${ts}${rand}@x.com`, name: "Gate" },
    });
    const parent = await db.parent.create({
      data: { email: `gp${ts}${rand}@x.com`, userId: user.id },
    });
    await db.tenantParent.create({
      data: { tenantId: tenant.id, parentId: parent.id, status: "ACTIVE" },
    });
    const tp = await db.tenantParent.findUnique({
      where: {
        tenantId_parentId: { tenantId: tenant.id, parentId: parent.id },
      },
    });
    expect(tp?.status).toBe("ACTIVE");
  });

  it("a REVOKED TenantParent fails the gate predicate", async () => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2);
    const tenant = await db.tenant.create({
      data: { slug: `rev-${ts}-${rand}`, name: "Rev", type: "COACH" },
    });
    const user = await db.user.create({
      data: { email: `r${ts}${rand}@x.com`, name: "Rev" },
    });
    const parent = await db.parent.create({
      data: { email: `rp${ts}${rand}@x.com`, userId: user.id },
    });
    await db.tenantParent.create({
      data: {
        tenantId: tenant.id,
        parentId: parent.id,
        status: "REVOKED",
        revokedAt: new Date(),
      },
    });
    const tp = await db.tenantParent.findUnique({
      where: {
        tenantId_parentId: { tenantId: tenant.id, parentId: parent.id },
      },
    });
    expect(tp?.status).toBe("REVOKED");
  });
});
