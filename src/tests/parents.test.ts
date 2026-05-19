/**
 * Integration tests for findOrCreateParent.
 *
 * These tests hit the live dev Neon database (via .env.local). The vitest
 * config defines a stub DATABASE_URL pointing at localhost so unit tests
 * don't try to dial a real DB on every run — we override that stub here by
 * re-loading .env.local with override:true before constructing the client.
 *
 * If .env.local is missing or its DATABASE_URL still points at localhost,
 * the tests will fail to connect. That's intentional — there is no
 * meaningful "passing without a DB" path for an integration test of an
 * upsert helper.
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

import { describe, expect, it, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  findOrCreateParent,
  revokeTenantAccess,
  restoreTenantAccess,
} from "@/lib/parents";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

// Test fixtures live in throwaway tenants created in beforeEach with
// timestamp+random slugs to avoid collisions across retries. No cleanup
// — matches the codebase's existing posture (no other tests touch the DB
// today, and the spec explicitly says don't add afterEach cleanup).
let TENANT_ID: string;

beforeEach(async () => {
  const tenant = await db.tenant.create({
    data: {
      slug: `test-fop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Test",
      type: "COACH",
    },
  });
  TENANT_ID = tenant.id;
});

describe("findOrCreateParent", () => {
  it("creates a Parent + TenantParent on first call", async () => {
    const email = `new-fop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const out = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email,
      name: "New Parent",
      phone: "+15551234567",
    });
    expect(out.parent.email).toBe(email);
    expect(out.tenantParent.status).toBe("ACTIVE");
    expect(out.tenantParent.tenantId).toBe(TENANT_ID);
    expect(out.tenantParent.parentId).toBe(out.parent.id);
    expect(out.created).toBe(true);
  });

  it("reuses an existing Parent for the same email globally", async () => {
    const email = `dup-fop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const first = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email,
      name: "First",
    });
    const second = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email,
      name: "Second",
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.parent.id).toBe(first.parent.id);
    expect(second.parent.email).toBe(email);
    // Name does not overwrite — we only set on create.
    expect(second.parent.name).toBe("First");
  });

  it("normalizes email (case-insensitive, trimmed)", async () => {
    const base = `mixed-fop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const first = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: base.toUpperCase(),
    });
    const second = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: `  ${base}  `,
    });
    expect(second.parent.id).toBe(first.parent.id);
    expect(first.parent.email).toBe(base);
    expect(second.created).toBe(false);
  });

  it("adds a new TenantParent when an existing Parent books at a second tenant", async () => {
    const other = await db.tenant.create({
      data: {
        slug: `test-fop-t2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "T2",
        type: "COACH",
      },
    });
    const email = `xyz-fop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const a = await findOrCreateParent(db, { tenantId: TENANT_ID, email });
    const b = await findOrCreateParent(db, { tenantId: other.id, email });
    expect(b.parent.id).toBe(a.parent.id);
    expect(b.created).toBe(false);
    expect(b.tenantParent.tenantId).toBe(other.id);
    expect(b.tenantParent.parentId).toBe(a.parent.id);
  });
});

describe("revokeTenantAccess / restoreTenantAccess", () => {
  it("sets status to REVOKED and stamps revokedAt", async () => {
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: `r-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    });
    await revokeTenantAccess(db, { tenantId: TENANT_ID, parentId: parent.id });
    const tp = await db.tenantParent.findUnique({
      where: { tenantId_parentId: { tenantId: TENANT_ID, parentId: parent.id } },
    });
    expect(tp?.status).toBe("REVOKED");
    expect(tp?.revokedAt).toBeInstanceOf(Date);
  });

  it("restore reverses revoke and clears revokedAt", async () => {
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: `r2-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    });
    await revokeTenantAccess(db, { tenantId: TENANT_ID, parentId: parent.id });
    await restoreTenantAccess(db, { tenantId: TENANT_ID, parentId: parent.id });
    const tp = await db.tenantParent.findUnique({
      where: { tenantId_parentId: { tenantId: TENANT_ID, parentId: parent.id } },
    });
    expect(tp?.status).toBe("ACTIVE");
    expect(tp?.revokedAt).toBeNull();
  });

  it("does not touch other tenants' rows", async () => {
    const other = await db.tenant.create({
      data: { slug: `t-iso-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: "ISO", type: "COACH" },
    });
    const email = `iso-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email,
    });
    await findOrCreateParent(db, { tenantId: other.id, email });
    await revokeTenantAccess(db, { tenantId: TENANT_ID, parentId: parent.id });
    const otherTp = await db.tenantParent.findUnique({
      where: { tenantId_parentId: { tenantId: other.id, parentId: parent.id } },
    });
    expect(otherTp?.status).toBe("ACTIVE");
  });
});
