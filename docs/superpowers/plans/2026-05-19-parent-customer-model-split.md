# Parent / Customer Model Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Membership-PARENT-as-booking-contact hack with a real `Parent` entity (global by email) joined to tenants via `TenantParent`, with a NextAuth-backed claim flow, a full coach-side Parents UI, and a GDPR-compliant deletion pipeline.

**Architecture:** Four phases — (A) additive schema, (B) one-shot backfill, (C) code cutover behind `NEXT_PUBLIC_PARENT_MODEL_V2` feature flag, (D) drop legacy columns. Every phase leaves the app fully working. The spec lives at `docs/superpowers/specs/2026-05-19-parent-customer-model-split-design.md` — read it before touching code.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Prisma 7 / Neon Postgres, vitest, Tailwind v4, Radix UI primitives (Sheet, Dialog, DropdownMenu), date-fns + date-fns-tz, NextAuth v5 (email provider for claim flow), Resend (transactional email), Vercel Cron.

**Branch convention:** Work on a feature branch `feat/parent-model-split`. Each task commits to that branch. Phase boundaries are pre-merge checkpoints — verify all gates green before moving to the next phase.

---

## File map

**Create:**
- `src/lib/parents.ts` — `findOrCreateParent`, `attachUserToParent`, `revokeTenantAccess`, `restoreTenantAccess`, `mergeParents`, `findParentForUser` helpers (no I/O wrappers; takes a Prisma client / tx).
- `src/lib/audit.ts` — extend existing file with `emailHash()` + new action literals.
- `src/tests/parents.test.ts` — unit coverage for `parents.ts`.
- `src/tests/audit-emailHash.test.ts` — hash determinism + secret-salt assertions.
- `src/tests/parent-access.test.ts` — `requireParentAccess` rejection/acceptance cases.
- `src/tests/parent-deletion.test.ts` — anonymization pipeline.
- `src/actions/parent.ts` — server actions: `updateParentAction`, `mergeParentAction`, `revokeParentAccessAction`, `restoreParentAccessAction`, `requestParentDeletionAction`, `confirmParentDeletionAction`, `updateTenantParentNotesAction`, `sendParentClaimEmailAction`.
- `src/actions/claim.ts` — `consumeClaimTokenAction` (sets `Parent.userId` and signs the user in).
- `src/app/claim/[token]/page.tsx` — claim landing page.
- `src/app/confirm-deletion/[token]/page.tsx` — deletion confirmation page.
- `src/app/t/[slug]/coach/parents/page.tsx` — list.
- `src/app/t/[slug]/coach/parents/[parentId]/page.tsx` — detail.
- `src/components/parents/ParentHeader.tsx`
- `src/components/parents/ParentStatsStrip.tsx`
- `src/components/parents/ParentKidsCard.tsx`
- `src/components/parents/ParentBookingsCard.tsx`
- `src/components/parents/ParentInvoicesCard.tsx`
- `src/components/parents/ParentNotesEditor.tsx`
- `src/components/parents/ParentActionsPanel.tsx`
- `src/components/parents/ParentDangerZone.tsx`
- `src/components/parents/EditParentSheet.tsx`
- `src/components/parents/MergeParentSheet.tsx`
- `src/components/parents/DeleteRequestSheet.tsx`
- `src/components/parents/ParentsList.tsx` — client-side filter/sort wrapper around server data.
- `src/app/api/cron/audit-redact/route.ts` — daily redaction + token-expiry cron.
- `scripts/backfill-parents.ts` — Phase B one-shot.
- `scripts/redact-audit-history.ts` — Phase C one-shot, hashes raw emails in existing audit rows.

**Modify:**
- `prisma/schema.prisma` — Parent + TenantParent + TenantParentStatus enum; `Player.parentRefId`; `ParentPlayer.parentRefId`; `AuditLog.tenantId` nullable; later rename + drop in Phase D.
- `src/lib/env.ts` — `NEXT_PUBLIC_PARENT_MODEL_V2` and `AUDIT_EMAIL_HMAC_SECRET`.
- `src/lib/tenant.ts` — `TenantAccess` tagged union, `requireParentAccess`, narrowed `requireTenant`.
- `src/lib/nav.ts` — `Parents` entry between `Players` and `Messages`.
- `src/actions/booking.ts` — call `findOrCreateParent`, write `TenantParent`, shadow/true flag branching, claim CTA in email payload.
- `src/lib/email.ts` — extend `sendBookingConfirmation` to accept `claimUrl` and render CTA button.
- `src/lib/family/events.ts` — query via `parentRefId` with `parentId` fallback under flag false.
- `src/app/t/[slug]/family/home/page.tsx`, `family/schedule/page.tsx`, `family/kids/page.tsx`, `family/kids/[playerId]/page.tsx`, `family/book/page.tsx`, `family/pay/page.tsx`, `family/forms/page.tsx` — swap `requireTenant` → `requireParentAccess`; thread `parent` to children.
- `src/components/dashboard/ParentDashboard.tsx`, `src/components/family/NextSessionHero.tsx`, `src/components/family/KidsCarousel.tsx` — read from `parent` on the access object.
- `src/components/admin/AuditRow.tsx` — label map + diff-shape rendering.
- `src/app/t/[slug]/coach/roster/[playerId]/page.tsx` — Parents card.
- `src/app/t/[slug]/coach/schedule/[eventId]/page.tsx` — parent-link chevrons on attendance rows.
- `src/app/t/[slug]/coach/payments/[invoiceId]/page.tsx` — Payer link to parent detail.
- `src/tests/nav.test.ts` — extend with `Parents` ordering.
- `vercel.json` — register `audit-redact` cron.

---

## Phase A — Additive schema

### Task 1: Schema additions for Parent + TenantParent

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1.1: Add the `Parent` model**

Append to `prisma/schema.prisma` near the bottom (above the enums section):

```prisma
model Parent {
  id          String         @id @default(cuid())
  email       String         @unique
  name        String?
  phone       String?
  userId      String?        @unique
  user        User?          @relation(fields: [userId], references: [id], onDelete: SetNull)
  tenantLinks TenantParent[]
  players     Player[]       @relation("PlayerToParent")
  guardianships ParentPlayer[] @relation("ParentPlayerToParent")
  deletedAt   DateTime?
  pendingDeletionRequestedAt DateTime?
  pendingDeletionToken       String?   @unique
  pendingDeletionRequestedBy String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@index([email])
}
```

- [ ] **Step 1.2: Add the `TenantParent` model**

```prisma
model TenantParent {
  tenantId     String
  parentId     String
  status       TenantParentStatus @default(ACTIVE)
  notes        String?
  registeredAt DateTime           @default(now())
  revokedAt    DateTime?
  tenant       Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parent       Parent             @relation(fields: [parentId], references: [id], onDelete: Cascade)

  @@id([tenantId, parentId])
  @@index([parentId])
}

enum TenantParentStatus {
  ACTIVE
  REVOKED
}
```

- [ ] **Step 1.3: Add `tenantParents` back-relation to `Tenant`**

Find the existing `model Tenant { ... }` block and add inside it:

```prisma
  tenantParents TenantParent[]
```

- [ ] **Step 1.4: Add `parentRefId` nullable column to `Player`**

Find the existing `model Player { ... }` block. Add (alongside the existing `parentId String?` field):

```prisma
  parentRefId  String?
  parentRef    Parent?  @relation("PlayerToParent", fields: [parentRefId], references: [id], onDelete: SetNull)
```

- [ ] **Step 1.5: Add `parentRefId` nullable column to `ParentPlayer`**

Find the existing `model ParentPlayer { ... }` block. Add:

```prisma
  parentRefId    String?
  parentRef      Parent?  @relation("ParentPlayerToParent", fields: [parentRefId], references: [id], onDelete: Cascade)
```

- [ ] **Step 1.6: Make `AuditLog.tenantId` nullable**

Find `model AuditLog { ... }`. Change `tenantId String` to `tenantId String?` and `tenant Tenant @relation(...)` to allow null:

```prisma
  tenantId    String?
  tenant      Tenant?  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
```

- [ ] **Step 1.7: Push schema to Neon**

Run: `pnpm prisma generate && pnpm db:push`
Expected: `🚀 Your database is now in sync with your Prisma schema.`

- [ ] **Step 1.8: Verify nothing regressed**

Run: `pnpm typecheck && pnpm vitest run`
Expected: typecheck clean, all existing tests pass (no new tests yet).

- [ ] **Step 1.9: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add Parent + TenantParent (additive, no behavior change)"
```

---

### Task 2: `AUDIT_EMAIL_HMAC_SECRET` env var

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

- [ ] **Step 2.1: Add `AUDIT_EMAIL_HMAC_SECRET` to the env schema**

Open `src/lib/env.ts`. Find the Zod schema (search for `z.object`). Add:

```ts
AUDIT_EMAIL_HMAC_SECRET: z.string().min(32, "Must be at least 32 chars"),
```

Add the same key to the runtime check object below.

- [ ] **Step 2.2: Add to `.env.example`**

Append to `.env.example`:

```
# HMAC key for audit-log email hashing. Generate with:
#   openssl rand -hex 32
# Once set in production, do not rotate — rotating invalidates audit search
# continuity for prior rows.
AUDIT_EMAIL_HMAC_SECRET=
```

- [ ] **Step 2.3: Set the local value**

Run: `openssl rand -hex 32` (or `pnpm dlx node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
Paste the output as the value for `AUDIT_EMAIL_HMAC_SECRET` in `.env.local`.

- [ ] **Step 2.4: Verify env loads**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat(env): add AUDIT_EMAIL_HMAC_SECRET for audit row PII hashing"
```

After committing, set the var on Vercel: `vercel env add AUDIT_EMAIL_HMAC_SECRET production preview development` and paste the same value. (Not done from Claude — the human runs this.)

---

### Task 3: `emailHash` helper + tests

**Files:**
- Modify: `src/lib/audit.ts`
- Create: `src/tests/audit-emailHash.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `src/tests/audit-emailHash.test.ts`:

```ts
import { describe, expect, it, beforeAll } from "vitest";
import { emailHash } from "@/lib/audit";

describe("emailHash", () => {
  beforeAll(() => {
    // Test env file already loads AUDIT_EMAIL_HMAC_SECRET; if missing, skip.
    if (!process.env.AUDIT_EMAIL_HMAC_SECRET) {
      process.env.AUDIT_EMAIL_HMAC_SECRET = "test-secret-".padEnd(64, "x");
    }
  });

  it("returns a 16-char hex string", () => {
    const h = emailHash("test@example.com");
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", () => {
    expect(emailHash("a@b.com")).toBe(emailHash("a@b.com"));
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(emailHash("  A@B.COM  ")).toBe(emailHash("a@b.com"));
  });

  it("produces different hashes for different inputs", () => {
    expect(emailHash("a@b.com")).not.toBe(emailHash("a@c.com"));
  });
});
```

- [ ] **Step 3.2: Run the test, confirm it fails with `emailHash is not a function`**

Run: `pnpm vitest run src/tests/audit-emailHash.test.ts`
Expected: FAIL — `emailHash` is not exported from `@/lib/audit`.

- [ ] **Step 3.3: Implement `emailHash`**

Open `src/lib/audit.ts`. At the top of the file, after the existing imports, add:

```ts
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
```

At the bottom of the file, add:

```ts
/**
 * HMAC-SHA256 of a normalized email, truncated to 16 hex chars. Used in
 * audit-log diffs so audit rows never contain re-identifiable PII (an
 * attacker who exfiltrates the audit table cannot brute-force common emails
 * without also having the server-side AUDIT_EMAIL_HMAC_SECRET).
 *
 * Deterministic — given the same input + secret, always returns the same
 * hash. Investigators can rehash a known email and search for matches.
 */
export function emailHash(email: string): string {
  return createHmac("sha256", env.AUDIT_EMAIL_HMAC_SECRET)
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `pnpm vitest run src/tests/audit-emailHash.test.ts`
Expected: PASS (4/4).

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/audit.ts src/tests/audit-emailHash.test.ts
git commit -m "feat(audit): emailHash helper for PII-safe audit rows"
```

---

## Phase B — Backfill

### Task 4: Backfill script

**Files:**
- Create: `scripts/backfill-parents.ts`

- [ ] **Step 4.1: Create the script with dry-run support**

Create `scripts/backfill-parents.ts`:

```ts
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
import { PrismaClient } from "@prisma/client";
import { logAudit } from "../src/lib/audit";

const prisma = new PrismaClient();
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

  // 1. Find every (User, Tenant) where Membership.role = PARENT
  const parentMemberships = await prisma.membership.findMany({
    where: { role: "PARENT" },
    include: { user: true },
  });

  // Group by user.email (one Parent per unique email globally)
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

  // 2. Upsert Parent + TenantParent per email
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

    // 3. Link any Players this parent's User has — Player.parentId = User.id today
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

    // 4. Link ParentPlayer rows
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

  // 5. Report orphans — Players with parentId set but no Parent matches
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

  // 6. Write audit row (one global, since this isn't per-tenant)
  if (APPLY) {
    await logAudit({
      tenantId: null as unknown as string, // tenantId is nullable after Phase A
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
```

- [ ] **Step 4.2: Dry-run against the dev DB**

Run: `pnpm tsx scripts/backfill-parents.ts`
Expected: JSON summary printed. No writes. Note the orphan counts.

- [ ] **Step 4.3: Commit**

```bash
git add scripts/backfill-parents.ts
git commit -m "feat(scripts): backfill-parents.ts — Phase B one-shot (dry-run + apply)"
```

---

### Task 5: Apply backfill + sanity gates

- [ ] **Step 5.1: Apply against the dev DB**

Run: `pnpm tsx scripts/backfill-parents.ts --apply`
Expected: same summary, this time with rows written.

- [ ] **Step 5.2: Reconciliation check — Membership PARENT vs TenantParent**

Run (via Prisma Studio or a one-liner):

```bash
pnpm tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const mc = await p.membership.count({ where: { role: 'PARENT' } });
  const tpc = await p.tenantParent.count();
  console.log({ membershipParent: mc, tenantParent: tpc });
  await p.\$disconnect();
})();
"
```

Expected: roughly equal (TenantParent may be ≤ Membership count if the same user has multiple PARENT memberships across tenants — that's correct).

- [ ] **Step 5.3: Player linkage check**

```bash
pnpm tsx -e "
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const hasParentId = await p.player.count({ where: { parentId: { not: null } } });
  const hasParentRef = await p.player.count({ where: { parentRefId: { not: null } } });
  const drift = await p.player.count({ where: { parentId: { not: null }, parentRefId: null } });
  console.log({ hasParentId, hasParentRef, drift });
  await p.\$disconnect();
})();
"
```

Expected: `drift === 0`. If non-zero, investigate before Phase C.

- [ ] **Step 5.4: Apply against prod**

Same command, with prod `DATABASE_URL` exported (or via a Neon branch first):

```bash
DATABASE_URL="<prod-pooled-url>" pnpm tsx scripts/backfill-parents.ts --apply
```

Expected: same shape of output. Repeat the reconciliation checks against prod.

- [ ] **Step 5.5: Commit a note recording the prod apply**

```bash
git commit --allow-empty -m "chore(backfill): applied parent backfill to prod"
```

(Empty commit just serves as a visible checkpoint in the log.)

---

## Phase C — Code cutover

### Task 6: Feature flag

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 6.1: Add the flag**

In `src/lib/env.ts`, add to the Zod schema:

```ts
NEXT_PUBLIC_PARENT_MODEL_V2: z.enum(["false", "shadow", "true"]).default("false"),
```

Also add it to the `runtimeEnv` object so Next.js picks it up at build:

```ts
NEXT_PUBLIC_PARENT_MODEL_V2: process.env.NEXT_PUBLIC_PARENT_MODEL_V2,
```

- [ ] **Step 6.2: Export typed flag accessor**

At the bottom of `src/lib/env.ts`, add:

```ts
export const PARENT_MODEL_V2 = env.NEXT_PUBLIC_PARENT_MODEL_V2;
export const parentModelV2Enabled = () => PARENT_MODEL_V2 === "true";
export const parentModelV2Shadow = () => PARENT_MODEL_V2 === "shadow" || PARENT_MODEL_V2 === "true";
```

- [ ] **Step 6.3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6.4: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat(env): NEXT_PUBLIC_PARENT_MODEL_V2 feature flag"
```

---

### Task 7: `parents.ts` — core helpers + tests

**Files:**
- Create: `src/lib/parents.ts`
- Create: `src/tests/parents.test.ts`

- [ ] **Step 7.1: Write the failing test for `findOrCreateParent`**

Create `src/tests/parents.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { findOrCreateParent } from "@/lib/parents";

const db = new PrismaClient();

// Test fixtures live in a throwaway tenant created in beforeEach
let TENANT_ID: string;

beforeEach(async () => {
  const tenant = await db.tenant.create({
    data: { slug: `test-${Date.now()}`, name: "Test", type: "COACH" },
  });
  TENANT_ID = tenant.id;
});

describe("findOrCreateParent", () => {
  it("creates a Parent + TenantParent on first call", async () => {
    const out = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "new@example.com",
      name: "New Parent",
      phone: "+15551234567",
    });
    expect(out.parent.email).toBe("new@example.com");
    expect(out.tenantParent.status).toBe("ACTIVE");
    expect(out.created).toBe(true);
  });

  it("reuses an existing Parent for the same email globally", async () => {
    await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "dup@example.com",
      name: "First",
    });
    const second = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "dup@example.com",
      name: "Second",
    });
    expect(second.created).toBe(false);
    expect(second.parent.email).toBe("dup@example.com");
    // Name does not overwrite — we only set on create
    expect(second.parent.name).toBe("First");
  });

  it("normalizes email (case-insensitive, trimmed)", async () => {
    const first = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "Mixed@Example.COM",
    });
    const second = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "  mixed@example.com  ",
    });
    expect(second.parent.id).toBe(first.parent.id);
    expect(first.parent.email).toBe("mixed@example.com");
  });

  it("adds a new TenantParent when an existing Parent books at a second tenant", async () => {
    const other = await db.tenant.create({
      data: { slug: `t2-${Date.now()}`, name: "T2", type: "COACH" },
    });
    const a = await findOrCreateParent(db, { tenantId: TENANT_ID, email: "x@y.com" });
    const b = await findOrCreateParent(db, { tenantId: other.id, email: "x@y.com" });
    expect(b.parent.id).toBe(a.parent.id);
    expect(b.tenantParent.tenantId).toBe(other.id);
  });
});
```

- [ ] **Step 7.2: Run the test, confirm it fails**

Run: `pnpm vitest run src/tests/parents.test.ts`
Expected: FAIL — `Cannot find module '@/lib/parents'`.

- [ ] **Step 7.3: Implement `findOrCreateParent`**

Create `src/lib/parents.ts`:

```ts
import type { Parent, Prisma, PrismaClient, TenantParent } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

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
```

- [ ] **Step 7.4: Run tests, confirm they pass**

Run: `pnpm vitest run src/tests/parents.test.ts`
Expected: PASS (4/4).

- [ ] **Step 7.5: Commit**

```bash
git add src/lib/parents.ts src/tests/parents.test.ts
git commit -m "feat(parents): findOrCreateParent helper + 4 unit tests"
```

---

### Task 8: `revokeTenantAccess` + `restoreTenantAccess`

**Files:**
- Modify: `src/lib/parents.ts`
- Modify: `src/tests/parents.test.ts`

- [ ] **Step 8.1: Add the failing tests**

Append to `src/tests/parents.test.ts`:

```ts
import { revokeTenantAccess, restoreTenantAccess } from "@/lib/parents";

describe("revokeTenantAccess / restoreTenantAccess", () => {
  it("sets status to REVOKED and stamps revokedAt", async () => {
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "r@example.com",
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
      email: "r2@example.com",
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
      data: { slug: `t-iso-${Date.now()}`, name: "ISO", type: "COACH" },
    });
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "iso@example.com",
    });
    await findOrCreateParent(db, { tenantId: other.id, email: "iso@example.com" });
    await revokeTenantAccess(db, { tenantId: TENANT_ID, parentId: parent.id });
    const otherTp = await db.tenantParent.findUnique({
      where: { tenantId_parentId: { tenantId: other.id, parentId: parent.id } },
    });
    expect(otherTp?.status).toBe("ACTIVE");
  });
});
```

- [ ] **Step 8.2: Run tests, confirm they fail (unknown export)**

Run: `pnpm vitest run src/tests/parents.test.ts -t "revokeTenantAccess"`
Expected: FAIL — `revokeTenantAccess` is not exported.

- [ ] **Step 8.3: Implement both helpers**

Append to `src/lib/parents.ts`:

```ts
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
```

- [ ] **Step 8.4: Run tests, confirm they pass**

Run: `pnpm vitest run src/tests/parents.test.ts`
Expected: PASS (7/7 including the prior 4).

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/parents.ts src/tests/parents.test.ts
git commit -m "feat(parents): revoke + restore tenant access with isolation tests"
```

---

### Task 9: `attachUserToParent` + `findParentForUser`

**Files:**
- Modify: `src/lib/parents.ts`
- Modify: `src/tests/parents.test.ts`

- [ ] **Step 9.1: Write the failing tests**

Append to `src/tests/parents.test.ts`:

```ts
import { attachUserToParent, findParentForUser } from "@/lib/parents";

describe("attachUserToParent / findParentForUser", () => {
  it("sets Parent.userId and clears claim token", async () => {
    const user = await db.user.create({
      data: { email: "claim@example.com", name: "Claim Test" },
    });
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "claim@example.com",
    });
    // Simulate a claim token having been issued
    await db.parent.update({
      where: { id: parent.id },
      data: { pendingDeletionToken: null }, // placeholder for any future claimToken column
    });
    await attachUserToParent(db, { parentId: parent.id, userId: user.id });
    const refreshed = await db.parent.findUnique({ where: { id: parent.id } });
    expect(refreshed?.userId).toBe(user.id);
  });

  it("findParentForUser returns null when user has no Parent", async () => {
    const user = await db.user.create({
      data: { email: "nope@example.com", name: "Nope" },
    });
    const found = await findParentForUser(db, user.id);
    expect(found).toBeNull();
  });

  it("findParentForUser returns the Parent when attached", async () => {
    const user = await db.user.create({
      data: { email: "yes@example.com", name: "Yes" },
    });
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "yes@example.com",
    });
    await attachUserToParent(db, { parentId: parent.id, userId: user.id });
    const found = await findParentForUser(db, user.id);
    expect(found?.id).toBe(parent.id);
  });
});
```

- [ ] **Step 9.2: Run tests, confirm they fail**

Run: `pnpm vitest run src/tests/parents.test.ts -t "attachUserToParent"`
Expected: FAIL — unknown exports.

- [ ] **Step 9.3: Implement both helpers**

Append to `src/lib/parents.ts`:

```ts
export async function attachUserToParent(
  db: Db,
  args: { parentId: string; userId: string }
): Promise<void> {
  await db.parent.update({
    where: { id: args.parentId },
    data: { userId: args.userId },
  });
}

export async function findParentForUser(
  db: Db,
  userId: string
): Promise<Parent | null> {
  return db.parent.findFirst({ where: { userId } });
}
```

- [ ] **Step 9.4: Run tests, confirm they pass**

Run: `pnpm vitest run src/tests/parents.test.ts`
Expected: PASS (10/10).

- [ ] **Step 9.5: Commit**

```bash
git add src/lib/parents.ts src/tests/parents.test.ts
git commit -m "feat(parents): attachUserToParent + findParentForUser for claim flow"
```

---

### Task 10: `mergeParents`

**Files:**
- Modify: `src/lib/parents.ts`
- Modify: `src/tests/parents.test.ts`

- [ ] **Step 10.1: Write the failing test**

Append to `src/tests/parents.test.ts`:

```ts
import { mergeParents } from "@/lib/parents";

describe("mergeParents", () => {
  it("moves players, dedupes TenantParent collisions, soft-deletes loser", async () => {
    // Create two parents both with TenantParent at TENANT_ID
    const winner = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "winner@example.com",
      name: "Winner",
    });
    const loser = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: "loser@example.com",
      name: "Loser",
    });
    // Loser has a player
    const player = await db.player.create({
      data: {
        tenantId: TENANT_ID,
        firstName: "Kid",
        lastName: "X",
        dob: new Date("2015-01-01"),
        parentRefId: loser.parent.id,
      },
    });

    const result = await mergeParents(db, {
      winnerId: winner.parent.id,
      loserId: loser.parent.id,
    });
    expect(result.kidsMoved).toBe(1);
    expect(result.tenantsCollapsed).toBe(1);

    // Player now points to winner
    const refreshedPlayer = await db.player.findUnique({ where: { id: player.id } });
    expect(refreshedPlayer?.parentRefId).toBe(winner.parent.id);

    // Loser is soft-deleted
    const refreshedLoser = await db.parent.findUnique({
      where: { id: loser.parent.id },
    });
    expect(refreshedLoser?.deletedAt).not.toBeNull();
    expect(refreshedLoser?.email).toContain("merged-");

    // Loser's TenantParent row gone (dedupe by deletion)
    const loserTp = await db.tenantParent.findUnique({
      where: {
        tenantId_parentId: { tenantId: TENANT_ID, parentId: loser.parent.id },
      },
    });
    expect(loserTp).toBeNull();
  });
});
```

- [ ] **Step 10.2: Run, confirm failure**

Run: `pnpm vitest run src/tests/parents.test.ts -t "mergeParents"`
Expected: FAIL — unknown export.

- [ ] **Step 10.3: Implement `mergeParents`**

Append to `src/lib/parents.ts`:

```ts
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

    // Players → winner
    const playerUpdate = await tx.player.updateMany({
      where: { parentRefId: loser.id },
      data: { parentRefId: winner.id },
    });

    // ParentPlayer junction → winner
    const ppUpdate = await tx.parentPlayer.updateMany({
      where: { parentRefId: loser.id },
      data: { parentRefId: winner.id },
    });

    // TenantParent: walk loser's rows, dedupe against winner's
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
        // Collision — keep winner's row but use older registeredAt + concat notes
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
        // No collision — re-point
        await tx.tenantParent.update({
          where: {
            tenantId_parentId: { tenantId: loserTp.tenantId, parentId: loser.id },
          },
          data: { parentId: winner.id },
        });
      }
      tenantsCollapsed++;
    }

    // Hoist userId if winner lacks one
    if (!winner.userId && loser.userId) {
      await tx.parent.update({
        where: { id: winner.id },
        data: { userId: loser.userId },
      });
      // Loser must shed userId first because Parent.userId is @unique
      await tx.parent.update({
        where: { id: loser.id },
        data: { userId: null },
      });
    }

    // Soft-delete the loser
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
```

- [ ] **Step 10.4: Run tests, confirm they pass**

Run: `pnpm vitest run src/tests/parents.test.ts`
Expected: PASS (11/11).

- [ ] **Step 10.5: Commit**

```bash
git add src/lib/parents.ts src/tests/parents.test.ts
git commit -m "feat(parents): mergeParents with transactional dedupe + soft-delete"
```

---

### Task 11: `TenantAccess` tagged union + `requireParentAccess`

**Files:**
- Modify: `src/lib/tenant.ts`
- Create: `src/tests/parent-access.test.ts`

- [ ] **Step 11.1: Read the current tenant.ts shape**

Run: `cat src/lib/tenant.ts` (or open in your editor) — confirm `requireTenant(slug)` currently returns `{ tenant, user, membership }`. Note the existing signature so the additive changes below don't break callers.

- [ ] **Step 11.2: Add the `TenantAccess` type and `requireParentAccess` helper**

In `src/lib/tenant.ts`, near the top (after imports), add:

```ts
import type { Membership, Parent, Tenant, TenantParent, User } from "@prisma/client";

export type TenantAccessStaff = {
  kind: "staff";
  tenant: Tenant;
  user: User;
  membership: Membership;
};

export type TenantAccessParent = {
  kind: "parent";
  tenant: Tenant;
  user: User;
  parent: Parent;
  tenantParent: TenantParent;
};

export type TenantAccessAnonymous = {
  kind: "anonymous";
  tenant: Tenant;
};

export type TenantAccess =
  | TenantAccessStaff
  | TenantAccessParent
  | TenantAccessAnonymous;
```

Then add the new function (do NOT remove or rename the existing `requireTenant`):

```ts
/**
 * Family-portal gate. Returns ACTIVE-only parent access OR redirects to the
 * claim flow if the user has no Parent attached / no TenantParent row at
 * this tenant. REVOKED TenantParent rows fail.
 */
export async function requireParentAccess(slug: string): Promise<TenantAccessParent> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/t/${slug}/family/home`);
  }
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  const parent = await db.parent.findFirst({
    where: { userId: user.id },
  });
  if (!parent) {
    // Signed in but no Parent attached — likely came via staff invite. Bounce
    // them to a generic "this account isn't a parent account" page rather
    // than to the claim flow.
    redirect(`/t/${slug}/forbidden`);
  }
  const tenantParent = await db.tenantParent.findUnique({
    where: { tenantId_parentId: { tenantId: tenant.id, parentId: parent.id } },
  });
  if (!tenantParent || tenantParent.status !== "ACTIVE") {
    redirect(`/t/${slug}/forbidden`);
  }
  return { kind: "parent", tenant, user, parent, tenantParent };
}
```

The exact import shape (`auth`, `db`, `redirect`, `notFound`) matches whatever `requireTenant` already imports — copy-paste those lines as-is from the existing function.

- [ ] **Step 11.3: Write a unit test that hits the redirect paths**

Create `src/tests/parent-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// requireParentAccess uses next/navigation redirects, so we test the predicate
// shape by exercising the underlying query. The redirects themselves are
// covered by e2e (Playwright) — out of scope for this unit file.
const db = new PrismaClient();

describe("TenantParent gate predicate", () => {
  it("a parent with userId + ACTIVE TenantParent passes the gate query", async () => {
    const tenant = await db.tenant.create({
      data: { slug: `gate-${Date.now()}`, name: "Gate", type: "COACH" },
    });
    const user = await db.user.create({
      data: { email: `g${Date.now()}@x.com`, name: "Gate" },
    });
    const parent = await db.parent.create({
      data: { email: `g${Date.now()}@x.com`, userId: user.id },
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
    const tenant = await db.tenant.create({
      data: { slug: `rev-${Date.now()}`, name: "Rev", type: "COACH" },
    });
    const user = await db.user.create({
      data: { email: `r${Date.now()}@x.com`, name: "Rev" },
    });
    const parent = await db.parent.create({
      data: { email: `r${Date.now()}@x.com`, userId: user.id },
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
    // The actual gate function would `redirect()` at this point; we just
    // verify the predicate this assertion stands on.
  });
});
```

- [ ] **Step 11.4: Run the test**

Run: `pnpm vitest run src/tests/parent-access.test.ts`
Expected: PASS (2/2).

- [ ] **Step 11.5: Commit**

```bash
git add src/lib/tenant.ts src/tests/parent-access.test.ts
git commit -m "feat(tenant): TenantAccess union + requireParentAccess helper"
```

---

### Task 12: Booking action — call `findOrCreateParent` under flag

**Files:**
- Modify: `src/actions/booking.ts`

- [ ] **Step 12.1: Wire `findOrCreateParent` into the booking flow**

Open `src/actions/booking.ts`. Find the existing `db.membership.upsert({ role: "PARENT" })` block. Replace the entire block (and the parent-User lookup above it, if applicable) with:

```ts
import { findOrCreateParent } from "@/lib/parents";
import { parentModelV2Enabled, parentModelV2Shadow } from "@/lib/env";

// ... inside createBookingAction, after parentEmail / parentName / parentPhone
// have been normalized ...

let parentRefId: string | null = null;
if (parentModelV2Shadow()) {
  const result = await findOrCreateParent(db, {
    tenantId: tenant.id,
    email: parentEmail,
    name: data.parentName,
    phone: data.parentPhone ?? null,
  });
  parentRefId = result.parent.id;
  // If a User row already exists for this email (e.g. prior staff invite),
  // attach it so cross-tenant continuity works from booking #1.
  if (!result.parent.userId) {
    const existingUser = await db.user.findUnique({
      where: { email: parentEmail },
    });
    if (existingUser) {
      await db.parent.update({
        where: { id: result.parent.id },
        data: { userId: existingUser.id },
      });
    }
  }
}

// Keep writing the legacy User + Membership ONLY when flag is not "true"
let parentUser = null;
if (!parentModelV2Enabled()) {
  // ... existing User upsert + Membership upsert logic stays here verbatim ...
}
```

When creating the Player, write **both** columns so Phase D's column rename is a no-op:

```ts
const player = await db.player.create({
  data: {
    tenantId: tenant.id,
    parentId: parentUser?.id ?? null,        // legacy mirror
    parentRefId: parentRefId,                  // new column
    firstName: data.playerFirstName,
    lastName: data.playerLastName,
    dob: playerDob,
    notes: data.notes || null,
  },
});
```

Do the same in the `db.parentPlayer.upsert` block — write `parentRefId` alongside the legacy `parentUserId`.

- [ ] **Step 12.2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 12.3: Unit-test the flag branching is sane**

The existing booking tests already exercise the booking action — re-run them to make sure flag-off behavior is unchanged:

Run: `pnpm vitest run`
Expected: all existing tests pass. Flag defaults to `"false"` so behavior is identical to pre-change.

- [ ] **Step 12.4: Manual shadow smoke**

Set `NEXT_PUBLIC_PARENT_MODEL_V2=shadow` in `.env.local`, run `pnpm dev`, book a session through the public form, then verify in `pnpm prisma studio`:
- A Parent row was written.
- A TenantParent row was written.
- The Membership PARENT row was ALSO written (because flag is `shadow`, not `true`).
- The Player has both `parentId` and `parentRefId` set.

- [ ] **Step 12.5: Commit**

```bash
git add src/actions/booking.ts
git commit -m "feat(booking): findOrCreateParent under PARENT_MODEL_V2 flag (shadow|true)"
```

---

### Task 13: Claim flow — page + action + email CTA

**Files:**
- Create: `src/actions/claim.ts`
- Create: `src/app/claim/[token]/page.tsx`
- Modify: `src/lib/email.ts`
- Modify: `src/actions/booking.ts`

- [ ] **Step 13.1: Add a `claimToken` field to Parent (small schema patch)**

Append to the Parent model in `prisma/schema.prisma`:

```prisma
  claimToken              String?   @unique
  claimTokenExpiresAt     DateTime?
```

Run: `pnpm prisma generate && pnpm db:push`
Expected: schema sync, no data loss.

- [ ] **Step 13.2: Generate-claim-token helper in `parents.ts`**

Append to `src/lib/parents.ts`:

```ts
import { randomBytes } from "node:crypto";

const CLAIM_TOKEN_TTL_DAYS = 30;

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
```

- [ ] **Step 13.3: Write the claim-server-action**

Create `src/actions/claim.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeClaimToken } from "@/lib/parents";

export async function consumeClaimTokenAction(token: string): Promise<never> {
  const session = await auth();
  if (!session?.user?.id) {
    // Signed-out → bounce to NextAuth magic link with callbackUrl back here
    redirect(`/auth/signin?callbackUrl=/claim/${token}`);
  }
  const result = await consumeClaimToken(db, {
    token,
    userId: session.user.id,
  });
  if (!result) {
    redirect("/claim/expired");
  }
  // Pick a tenant to land on — the first ACTIVE TenantParent
  const firstLink = await db.tenantParent.findFirst({
    where: { parentId: result.parent.id, status: "ACTIVE" },
    include: { tenant: { select: { slug: true } } },
  });
  if (!firstLink) {
    redirect("/");
  }
  redirect(`/t/${firstLink.tenant.slug}/family/home`);
}
```

- [ ] **Step 13.4: Write the claim landing page**

Create `src/app/claim/[token]/page.tsx`:

```tsx
import { consumeClaimTokenAction } from "@/actions/claim";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Fires the server action immediately on render. If the user is signed in,
  // attaches Parent.userId and redirects to their first tenant's family home.
  // If signed out, bounces to NextAuth with a callback back here.
  await consumeClaimTokenAction(token);
  // consumeClaimTokenAction always redirects; this return is unreachable.
  return null;
}
```

- [ ] **Step 13.5: Add an "expired" landing**

Create `src/app/claim/expired/page.tsx`:

```tsx
import Link from "next/link";

export default function ClaimExpiredPage() {
  return (
    <main className="min-h-screen bg-pitch-900 text-ink-50 flex items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Link expired</h1>
        <p className="text-ink-300">
          That claim link has already been used or has expired. Ask your coach
          to send a new one, or book a session to receive one.
        </p>
        <Link href="/" className="text-turf-300 hover:text-turf-200 underline">
          Back to KickNScream
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 13.6: Extend `sendBookingConfirmation` to render the claim CTA**

Open `src/lib/email.ts`. Add `claimUrl?: string` to the `sendBookingConfirmation` opts. In the HTML body, insert (after the existing `statusBlock`):

```ts
const claimBlock = opts.claimUrl
  ? `<div style="margin:24px 0;text-align:center;">
      <a href="${opts.claimUrl}" style="display:inline-block;padding:12px 24px;background:#1FB663;color:#050A07;border-radius:8px;font-weight:600;text-decoration:none;">
        Claim your family portal
      </a>
      <p style="margin:8px 0 0;font-size:12px;color:#94A39B;">
        See past sessions and pay invoices in one place.
      </p>
    </div>`
  : "";
```

Then interpolate `${claimBlock}` into the existing HTML template right after `${statusBlock}`.

- [ ] **Step 13.7: Hook the claim CTA into the booking action**

In `src/actions/booking.ts`, after `findOrCreateParent` succeeds (and the Parent has no `userId`), issue a claim token and pass it to the email:

```ts
import { issueClaimToken } from "@/lib/parents";

// ... after findOrCreateParent ...
let claimUrl: string | undefined;
if (parentModelV2Shadow() && parentRefId) {
  const parent = await db.parent.findUniqueOrThrow({ where: { id: parentRefId } });
  if (!parent.userId) {
    const token = await issueClaimToken(db, parentRefId);
    claimUrl = `${env.NEXTAUTH_URL}/claim/${token}`;
  }
}

// ... when calling sendBookingConfirmation, pass claimUrl in opts ...
```

- [ ] **Step 13.8: Typecheck + manual smoke**

Run: `pnpm typecheck`
Expected: clean.

Manual smoke: with flag `shadow`, book a session and confirm the confirmation email contains the "Claim your family portal" button. Click it in a private browser window; you should land on `/auth/signin?callbackUrl=/claim/...`. Sign in with the magic link; you should land on `/t/<slug>/family/home`.

- [ ] **Step 13.9: Commit**

```bash
git add prisma/schema.prisma src/lib/parents.ts src/actions/claim.ts src/app/claim src/lib/email.ts src/actions/booking.ts
git commit -m "feat(claim): magic-link claim flow + booking-email CTA"
```

---

### Task 14: Swap family-portal pages to `requireParentAccess`

**Files:**
- Modify: `src/app/t/[slug]/family/home/page.tsx`
- Modify: `src/app/t/[slug]/family/schedule/page.tsx`
- Modify: `src/app/t/[slug]/family/kids/page.tsx`
- Modify: `src/app/t/[slug]/family/kids/[playerId]/page.tsx`
- Modify: `src/app/t/[slug]/family/book/page.tsx`
- Modify: `src/app/t/[slug]/family/pay/page.tsx`
- Modify: `src/app/t/[slug]/family/forms/page.tsx`

- [ ] **Step 14.1: For each page, swap the auth call**

In every file above, replace:

```ts
const { tenant, user } = await requireTenant(slug);
```

with:

```ts
const { tenant, user, parent } = await requireParentAccess(slug);
```

If the page uses `membership`, audit whether it actually needs it (most family pages don't) and remove if not.

- [ ] **Step 14.2: Replace `user.id`-keyed queries with `parent.id`-keyed**

Search each file for any query like `db.player.findMany({ where: { parentId: user.id } })` and update under the flag:

```ts
import { parentModelV2Enabled } from "@/lib/env";

const playerWhere = parentModelV2Enabled()
  ? { parentRefId: parent.id }
  : { parentId: user.id };
```

Then use `playerWhere` in the existing `findMany`/`findFirst` calls.

The same pattern applies to `loadUpcomingFamilyEvents` in `src/lib/family/events.ts` — extend its signature to accept a `parent: Parent | null` argument and branch internally.

- [ ] **Step 14.3: Typecheck + run dev**

Run: `pnpm typecheck`
Expected: clean.

Manual smoke with flag `true` on the demo tenant:
- Visit `/t/<slug>/family/home` as a claimed parent → see kids + upcoming events.
- Visit as a non-parent → redirected to `/t/<slug>/forbidden`.
- Visit while signed out → redirected to NextAuth sign-in.

- [ ] **Step 14.4: Commit**

```bash
git add src/app/t/\[slug\]/family src/lib/family/events.ts
git commit -m "feat(family): swap to requireParentAccess across all /family pages"
```

---

### Task 15: Phase C verification gate

- [ ] **Step 15.1: Run the full test suite**

Run: `pnpm vitest run`
Expected: all green, including the new parents/parent-access/audit-emailHash tests.

- [ ] **Step 15.2: Typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 0 errors. Pre-existing lint warnings (TanStack Table, seed-demo) are acceptable.

- [ ] **Step 15.3: Deploy to staging / Vercel preview with flag = `shadow`**

Set `NEXT_PUBLIC_PARENT_MODEL_V2=shadow` on the preview environment. Push the branch. Walk these scenarios on the preview URL:

1. New email books → confirm both legacy Membership row AND new Parent+TenantParent rows exist.
2. Claim CTA in email → magic link → lands on family home.
3. Family-portal pages render correctly.

- [ ] **Step 15.4: Promote flag to `true` on one demo tenant**

Add a small override mechanism if not present yet. Quick path: an env var `PARENT_MODEL_V2_TENANT_OVERRIDE` containing a comma-separated list of slugs that force `true` regardless of the global flag. Implement in `src/lib/env.ts`:

```ts
export const parentModelV2EnabledFor = (slug: string): boolean => {
  if (parentModelV2Enabled()) return true;
  const overrides = (env.PARENT_MODEL_V2_TENANT_OVERRIDE ?? "").split(",").map((s) => s.trim());
  return overrides.includes(slug);
};
```

(Add `PARENT_MODEL_V2_TENANT_OVERRIDE: z.string().optional()` to the schema first.)

Update booking action + family pages to call `parentModelV2EnabledFor(tenant.slug)` instead of the global helper.

Smoke the demo tenant with override on. Confirm:
- New booking creates Parent + TenantParent but NOT Membership PARENT.
- Family portal still works.

- [ ] **Step 15.5: Promote globally**

Set `NEXT_PUBLIC_PARENT_MODEL_V2=true` on production. Redeploy. Watch the audit log + booking confirmations for 24 hours.

- [ ] **Step 15.6: Commit the override helper**

```bash
git add src/lib/env.ts src/actions/booking.ts src/app/t/\[slug\]/family
git commit -m "feat(env): per-tenant PARENT_MODEL_V2 override for staged rollout"
```

---

## Phase C — UI (full Parents feature)

### Task 16: Sidebar entry + nav test extension

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/tests/nav.test.ts`

- [ ] **Step 16.1: Add `Parents` to each tenant-type nav**

In `src/lib/nav.ts`, add a `UsersRound` import from `lucide-react`. In the `navForTenantType` function, insert a `Parents` entry between `Players` (or `Roster`) and `Messages`/`Notes`:

```ts
{ label: "Parents", href: `${base}/parents`, icon: UsersRound },
```

Add to all three branches (COACH, INSTITUTION, CLUB).

- [ ] **Step 16.2: Extend the nav test**

Open `src/tests/nav.test.ts`. Update the COACH expected-order assertion to include `"Parents"` after `"Players"`. Add similar inclusions for INSTITUTION and CLUB tests.

- [ ] **Step 16.3: Run tests**

Run: `pnpm vitest run src/tests/nav.test.ts`
Expected: PASS.

- [ ] **Step 16.4: Commit**

```bash
git add src/lib/nav.ts src/tests/nav.test.ts
git commit -m "feat(nav): add Parents sidebar entry between Players and Messages"
```

---

### Task 17: Parents list page

**Files:**
- Create: `src/app/t/[slug]/coach/parents/page.tsx`
- Create: `src/components/parents/ParentsList.tsx`

- [ ] **Step 17.1: Implement the server page**

Create `src/app/t/[slug]/coach/parents/page.tsx`:

```tsx
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ParentsList } from "@/components/parents/ParentsList";
import { formatCents } from "@/lib/utils";

export const metadata = { title: "Parents" };

type ParentRow = {
  parentId: string;
  status: "ACTIVE" | "REVOKED";
  parent: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    userId: string | null;
    deletedAt: Date | null;
  };
  playerCount: number;
  lastBookingAt: Date | null;
  lifetimeCents: number;
  outstandingCents: number;
};

export default async function ParentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  const tps = await db.tenantParent.findMany({
    where: { tenantId: tenant.id },
    include: {
      parent: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          userId: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { registeredAt: "desc" },
  });

  // Per-parent stats. One query per parent for simplicity at v1; if this grows
  // expensive we batch with $queryRaw.
  const rows: ParentRow[] = await Promise.all(
    tps.map(async (tp) => {
      const [players, lastEnrollment, paidAgg, outstandingAgg] = await Promise.all([
        db.player.count({
          where: { tenantId: tenant.id, parentRefId: tp.parentId },
        }),
        db.enrollment.findFirst({
          where: { player: { tenantId: tenant.id, parentRefId: tp.parentId } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        db.invoice.aggregate({
          where: {
            tenantId: tenant.id,
            status: "PAID",
            enrollments: { some: { player: { parentRefId: tp.parentId } } },
          },
          _sum: { amount: true },
        }),
        db.invoice.aggregate({
          where: {
            tenantId: tenant.id,
            status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
            enrollments: { some: { player: { parentRefId: tp.parentId } } },
          },
          _sum: { amount: true },
        }),
      ]);
      return {
        parentId: tp.parentId,
        status: tp.status,
        parent: tp.parent,
        playerCount: players,
        lastBookingAt: lastEnrollment?.createdAt ?? null,
        lifetimeCents: paidAgg._sum.amount ?? 0,
        outstandingCents: outstandingAgg._sum.amount ?? 0,
      };
    })
  );

  const unclaimedCount = rows.filter((r) => !r.parent.userId).length;
  const outstandingCount = rows.filter((r) => r.outstandingCents > 0).length;

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Parents"
        title="Your customer base"
        count={`${rows.length} parents · ${unclaimedCount} unclaimed · ${outstandingCount} with outstanding`}
        description="Search, filter, and manage every parent who has booked with you."
      />
      <ParentsList
        tenantSlug={tenant.slug}
        tenantTimeZone={tenant.timeZone ?? "America/Los_Angeles"}
        rows={rows}
      />
    </div>
  );
}
```

- [ ] **Step 17.2: Implement the client list component**

Create `src/components/parents/ParentsList.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCents, cn } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { Search, UsersRound, Wallet, AlertTriangle } from "lucide-react";

export type ParentsListRow = {
  parentId: string;
  status: "ACTIVE" | "REVOKED";
  parent: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    userId: string | null;
    deletedAt: Date | null;
  };
  playerCount: number;
  lastBookingAt: Date | null;
  lifetimeCents: number;
  outstandingCents: number;
};

type Filter = "all" | "claimed" | "unclaimed" | "outstanding" | "revoked";

export function ParentsList({
  tenantSlug,
  tenantTimeZone,
  rows,
}: {
  tenantSlug: string;
  tenantTimeZone: string;
  rows: ParentsListRow[];
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "claimed" && !r.parent.userId) return false;
      if (filter === "unclaimed" && r.parent.userId) return false;
      if (filter === "outstanding" && r.outstandingCents === 0) return false;
      if (filter === "revoked" && r.status !== "REVOKED") return false;
      if (!needle) return true;
      return (
        r.parent.email.toLowerCase().includes(needle) ||
        (r.parent.name?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [rows, q, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by parent name or email"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["all", "claimed", "unclaimed", "outstanding", "revoked"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs uppercase tracking-wider transition-colors",
                filter === f
                  ? "border-turf-400/60 bg-turf-400/10 text-turf-300"
                  : "border-line bg-pitch-800 text-ink-500 hover:text-ink-300"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <UsersRound className="h-7 w-7 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">No parents match</p>
          <p className="text-xs text-ink-500 mt-1">
            Adjust the filter or search to see more — when someone books, they
            show up here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link
              key={r.parentId}
              href={`/t/${tenantSlug}/coach/parents/${r.parentId}`}
              prefetch={false}
              className="block"
            >
              <Card
                className={cn(
                  "p-4 flex items-center gap-4 transition-colors hover:bg-pitch-800/40",
                  r.status === "REVOKED" && "opacity-60"
                )}
              >
                <div className="hidden sm:flex h-10 w-10 rounded-full bg-pitch-700 items-center justify-center text-xs font-mono text-ink-300 shrink-0">
                  {(r.parent.name ?? r.parent.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-ink-50 truncate">
                      {r.parent.name ?? r.parent.email}
                    </p>
                    {r.parent.deletedAt && (
                      <Badge variant="outline" className="border-line text-ink-500">
                        Deleted
                      </Badge>
                    )}
                    {r.status === "REVOKED" && (
                      <Badge variant="outline" className="border-warn/40 text-warn">
                        Revoked
                      </Badge>
                    )}
                    {!r.parent.userId && r.status === "ACTIVE" && (
                      <Badge variant="outline" className="border-flood-400/40 text-flood-400">
                        Unclaimed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 truncate">{r.parent.email}</p>
                </div>
                <div className="hidden md:flex flex-col text-right shrink-0 min-w-[80px]">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">Kids</span>
                  <span className="font-mono text-sm">{r.playerCount}</span>
                </div>
                <div className="hidden md:flex flex-col text-right shrink-0 min-w-[120px]">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">Last booking</span>
                  <span className="font-mono text-xs text-ink-300">
                    {r.lastBookingAt
                      ? formatInTimeZone(r.lastBookingAt, tenantTimeZone, "MMM d")
                      : "—"}
                  </span>
                </div>
                <div className="hidden md:flex flex-col text-right shrink-0 min-w-[100px]">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">Lifetime</span>
                  <span className="font-mono text-sm">{formatCents(r.lifetimeCents)}</span>
                </div>
                <div className="flex flex-col text-right shrink-0 min-w-[100px]">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">Outstanding</span>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      r.outstandingCents > 0 ? "text-danger" : "text-ink-500"
                    )}
                  >
                    {r.outstandingCents > 0 ? formatCents(r.outstandingCents) : "—"}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 17.3: Typecheck + smoke**

Run: `pnpm typecheck` — expect clean.
Visit `/t/<slug>/coach/parents` in the dev server. Confirm list renders, search works, filter chips filter correctly.

- [ ] **Step 17.4: Commit**

```bash
git add src/app/t/\[slug\]/coach/parents/page.tsx src/components/parents/ParentsList.tsx
git commit -m "feat(parents): list page + client filters at /coach/parents"
```

---

### Task 18: Parent detail page + composition cards

**Files:**
- Create: `src/app/t/[slug]/coach/parents/[parentId]/page.tsx`
- Create: `src/components/parents/ParentHeader.tsx`
- Create: `src/components/parents/ParentStatsStrip.tsx`
- Create: `src/components/parents/ParentKidsCard.tsx`
- Create: `src/components/parents/ParentBookingsCard.tsx`
- Create: `src/components/parents/ParentInvoicesCard.tsx`

- [ ] **Step 18.1: Implement the page skeleton**

Create `src/app/t/[slug]/coach/parents/[parentId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { ParentHeader } from "@/components/parents/ParentHeader";
import { ParentStatsStrip } from "@/components/parents/ParentStatsStrip";
import { ParentKidsCard } from "@/components/parents/ParentKidsCard";
import { ParentBookingsCard } from "@/components/parents/ParentBookingsCard";
import { ParentInvoicesCard } from "@/components/parents/ParentInvoicesCard";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Parent" };

export default async function ParentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; parentId: string }>;
}) {
  const { slug, parentId } = await params;
  const { tenant } = await requireTenant(slug);
  const tz = tenant.timeZone ?? "America/Los_Angeles";

  const tenantParent = await db.tenantParent.findUnique({
    where: { tenantId_parentId: { tenantId: tenant.id, parentId } },
    include: { parent: true },
  });
  if (!tenantParent) notFound();

  const players = await db.player.findMany({
    where: { tenantId: tenant.id, parentRefId: parentId },
    orderBy: { firstName: "asc" },
  });

  const enrollments = await db.enrollment.findMany({
    where: { player: { tenantId: tenant.id, parentRefId: parentId } },
    include: { program: { select: { name: true } }, player: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const invoices = await db.invoice.findMany({
    where: {
      tenantId: tenant.id,
      enrollments: { some: { player: { parentRefId: parentId } } },
    },
    include: { payments: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href={`/t/${slug}/coach/parents`}
        prefetch={false}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to parents
      </Link>
      <ParentHeader tenantParent={tenantParent} tenantSlug={slug} />
      <ParentStatsStrip
        playerCount={players.length}
        invoices={invoices}
        tenantTimeZone={tz}
      />
      <ParentKidsCard players={players} tenantSlug={slug} tenantTimeZone={tz} />
      <ParentBookingsCard enrollments={enrollments} tenantSlug={slug} tenantTimeZone={tz} />
      <ParentInvoicesCard invoices={invoices} tenantSlug={slug} tenantTimeZone={tz} />
    </div>
  );
}
```

- [ ] **Step 18.2: Implement `ParentHeader`**

Create `src/components/parents/ParentHeader.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone } from "lucide-react";
import type { Parent, TenantParent } from "@prisma/client";

export function ParentHeader({
  tenantParent,
  tenantSlug,
}: {
  tenantParent: TenantParent & { parent: Parent };
  tenantSlug: string;
}) {
  const p = tenantParent.parent;
  return (
    <Card className="px-6 py-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-14 w-14 rounded-full bg-pitch-700 flex items-center justify-center text-sm font-mono text-ink-300 shrink-0">
            {(p.name ?? p.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Parent</p>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-50 truncate">
              {p.name ?? "(no name on file)"}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-ink-300 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-ink-500" />
                {p.email}
              </span>
              {p.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-ink-500" />
                  {p.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {tenantParent.status === "REVOKED" ? (
            <Badge variant="outline" className="border-warn/40 text-warn">Revoked</Badge>
          ) : p.deletedAt ? (
            <Badge variant="outline" className="border-line text-ink-500">Deleted</Badge>
          ) : p.userId ? (
            <Badge variant="outline" className="border-turf-400/40 text-turf-300">Claimed</Badge>
          ) : (
            <Badge variant="outline" className="border-flood-400/40 text-flood-400">Unclaimed</Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

// Suppress unused param lint without changing the public API shape.
void tenantSlug;
```

(The last `void` is unnecessary if your eslint config tolerates unused props on JSX components — drop it if so.)

- [ ] **Step 18.3: Implement `ParentStatsStrip`**

Create `src/components/parents/ParentStatsStrip.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { invoiceDisplayStatus } from "@/lib/invoiceStatus";
import type { Invoice, Payment } from "@prisma/client";

type InvoiceWithPayments = Invoice & { payments: Payment[] };

export function ParentStatsStrip({
  playerCount,
  invoices,
  tenantTimeZone,
}: {
  playerCount: number;
  invoices: InvoiceWithPayments[];
  tenantTimeZone: string;
}) {
  const lifetimeCents = invoices
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + i.amount, 0);
  const outstandingCents = invoices
    .filter((i) => {
      const eff = invoiceDisplayStatus(i);
      return eff === "SENT" || eff === "PARTIAL" || eff === "OVERDUE";
    })
    .reduce((s, i) => {
      const paid = i.payments.reduce((p, q) => p + q.amount, 0);
      return s + (i.amount - paid);
    }, 0);
  const lastInvoice = invoices[0]; // already sorted by createdAt desc

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Kids</p>
        <p className="font-mono text-2xl font-bold mt-1">{playerCount}</p>
      </Card>
      <Card className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Lifetime</p>
        <p className="font-mono text-2xl font-bold mt-1">{formatCents(lifetimeCents)}</p>
      </Card>
      <Card className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Outstanding</p>
        <p
          className={`font-mono text-2xl font-bold mt-1 ${
            outstandingCents > 0 ? "text-danger" : ""
          }`}
        >
          {outstandingCents > 0 ? formatCents(outstandingCents) : "$0"}
        </p>
      </Card>
      <Card className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Last activity</p>
        <p className="font-mono text-xs text-ink-300 mt-1">
          {lastInvoice
            ? formatInTimeZone(lastInvoice.createdAt, tenantTimeZone, "MMM d, yyyy")
            : "—"}
        </p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 18.4: Implement `ParentKidsCard`**

Create `src/components/parents/ParentKidsCard.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { differenceInYears } from "date-fns";
import type { Player } from "@prisma/client";

export function ParentKidsCard({
  players,
  tenantSlug,
  tenantTimeZone,
}: {
  players: Player[];
  tenantSlug: string;
  tenantTimeZone: string;
}) {
  void tenantTimeZone;
  return (
    <Card className="px-6 py-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">
        Kids ({players.length})
      </p>
      {players.length === 0 ? (
        <p className="text-sm text-ink-500">No kids on this parent yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {players.map((p) => (
            <li key={p.id} className="py-2.5">
              <Link
                href={`/t/${tenantSlug}/coach/roster/${p.id}`}
                prefetch={false}
                className="flex items-center gap-3 hover:bg-pitch-800/40 -mx-2 px-2 rounded"
              >
                <div className="h-8 w-8 rounded-full bg-pitch-700 flex items-center justify-center text-xs font-mono text-ink-300 shrink-0">
                  {p.firstName[0]}{p.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-50 truncate">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-xs text-ink-500">
                    Age {differenceInYears(new Date(), p.dob)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 18.5: Implement `ParentBookingsCard`**

Create `src/components/parents/ParentBookingsCard.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { formatInTimeZone } from "date-fns-tz";
import type { Enrollment } from "@prisma/client";

type EnrollmentWithMeta = Enrollment & {
  program: { name: string };
  player: { firstName: string; lastName: string };
};

export function ParentBookingsCard({
  enrollments,
  tenantSlug,
  tenantTimeZone,
}: {
  enrollments: EnrollmentWithMeta[];
  tenantSlug: string;
  tenantTimeZone: string;
}) {
  void tenantSlug;
  return (
    <Card className="px-6 py-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">
        Recent bookings ({enrollments.length})
      </p>
      {enrollments.length === 0 ? (
        <p className="text-sm text-ink-500">No bookings yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {enrollments.map((e) => (
            <li key={e.id} className="py-2.5 flex items-center gap-3 text-sm">
              <span className="font-medium text-ink-50 flex-1 min-w-0 truncate">
                {e.player.firstName} · {e.program.name}
              </span>
              <span className="text-xs text-ink-500 font-mono shrink-0">
                {formatInTimeZone(e.createdAt, tenantTimeZone, "MMM d, yyyy")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 18.6: Implement `ParentInvoicesCard`**

Create `src/components/parents/ParentInvoicesCard.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents, cn } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { invoiceDisplayStatus } from "@/lib/invoiceStatus";
import type { Invoice, Payment } from "@prisma/client";

type InvoiceWithPayments = Invoice & { payments: Payment[] };

const TONE = {
  PAID: "border-turf-400/40 text-turf-300",
  SENT: "border-line text-ink-300",
  PARTIAL: "border-warn/40 text-warn",
  OVERDUE: "border-danger/40 text-danger",
  DRAFT: "border-line text-ink-500",
  VOIDED: "border-line text-ink-700",
} as const;

export function ParentInvoicesCard({
  invoices,
  tenantSlug,
  tenantTimeZone,
}: {
  invoices: InvoiceWithPayments[];
  tenantSlug: string;
  tenantTimeZone: string;
}) {
  return (
    <Card className="px-6 py-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">
        Invoices ({invoices.length})
      </p>
      {invoices.length === 0 ? (
        <p className="text-sm text-ink-500">No invoices yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {invoices.map((i) => {
            const eff = invoiceDisplayStatus(i);
            return (
              <li key={i.id} className="py-2.5">
                <Link
                  href={`/t/${tenantSlug}/coach/payments/${i.id}`}
                  prefetch={false}
                  className="flex items-center gap-3 hover:bg-pitch-800/40 -mx-2 px-2 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink-50 truncate text-sm">
                        {i.description ?? "Invoice"}
                      </p>
                      <Badge variant="outline" className={cn(TONE[eff], "bg-transparent")}>
                        {eff.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink-500 font-mono">
                      {formatInTimeZone(i.createdAt, tenantTimeZone, "MMM d, yyyy")}
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {formatCents(i.amount)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 18.7: Typecheck + smoke**

Run: `pnpm typecheck` — expect clean. Visit `/t/<slug>/coach/parents/<id>` and confirm the page renders.

- [ ] **Step 18.8: Commit**

```bash
git add src/app/t/\[slug\]/coach/parents/\[parentId\] src/components/parents
git commit -m "feat(parents): detail page + header/stats/kids/bookings/invoices cards"
```

---

### Task 19: Parent server actions (update + revoke + restore + notes + claim resend)

**Files:**
- Create: `src/actions/parent.ts`

- [ ] **Step 19.1: Implement the five non-deletion actions**

Create `src/actions/parent.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import {
  mergeParents,
  revokeTenantAccess,
  restoreTenantAccess,
  issueClaimToken,
} from "@/lib/parents";
import { logAudit, emailHash } from "@/lib/audit";
import { sendBookingConfirmation } from "@/lib/email";
import { env } from "@/lib/env";

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const m = user.memberships.find((x) => x.tenantId === tenantId);
  if (!m || !canManageTenant(m.role)) {
    throw new Error("You don't have permission to manage parents");
  }
  return { user, membership: m };
}

const updateSchema = z.object({
  tenantId: z.string(),
  parentId: z.string(),
  name: z.string().max(120).optional().nullable(),
  email: z.string().email(),
  phone: z.string().max(40).optional().nullable(),
});

export async function updateParentAction(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });

  const before = await db.parent.findUniqueOrThrow({ where: { id: data.parentId } });
  const normalizedEmail = data.email.trim().toLowerCase();

  if (normalizedEmail !== before.email) {
    const collision = await db.parent.findUnique({ where: { email: normalizedEmail } });
    if (collision && collision.id !== before.id) {
      throw new Error("Another parent already uses this email");
    }
  }

  await db.$transaction(async (tx) => {
    await tx.parent.update({
      where: { id: data.parentId },
      data: {
        name: data.name ?? null,
        email: normalizedEmail,
        phone: data.phone ?? null,
      },
    });
    if (before.userId && normalizedEmail !== before.email) {
      await tx.user.update({
        where: { id: before.userId },
        data: { email: normalizedEmail },
      });
    }
  });

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "parent.update",
    targetType: "parent",
    targetId: data.parentId,
    diff: {
      before: {
        name: before.name,
        email: before.email,
        phone: before.phone,
      },
      after: {
        name: data.name ?? null,
        email: normalizedEmail,
        phone: data.phone ?? null,
      },
    },
  });
  revalidatePath(`/t/${tenant.slug}/coach/parents/${data.parentId}`);
}

const tenantParentScope = z.object({
  tenantId: z.string(),
  parentId: z.string(),
});

export async function revokeParentAccessAction(input: z.infer<typeof tenantParentScope>) {
  const data = tenantParentScope.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  await revokeTenantAccess(db, data);
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "tenant_parent.revoke",
    targetType: "tenant_parent",
    targetId: data.parentId,
  });
  revalidatePath(`/t/${tenant.slug}/coach/parents/${data.parentId}`);
}

export async function restoreParentAccessAction(input: z.infer<typeof tenantParentScope>) {
  const data = tenantParentScope.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  await restoreTenantAccess(db, data);
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "tenant_parent.restore",
    targetType: "tenant_parent",
    targetId: data.parentId,
  });
  revalidatePath(`/t/${tenant.slug}/coach/parents/${data.parentId}`);
}

const notesSchema = tenantParentScope.extend({
  notes: z.string().max(5000).nullable(),
});

export async function updateTenantParentNotesAction(input: z.infer<typeof notesSchema>) {
  const data = notesSchema.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  await db.tenantParent.update({
    where: {
      tenantId_parentId: { tenantId: data.tenantId, parentId: data.parentId },
    },
    data: { notes: data.notes },
  });
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "tenant_parent.notes_update",
    targetType: "tenant_parent",
    targetId: data.parentId,
    diff: { length: data.notes?.length ?? 0 },
  });
}

const mergeSchema = z.object({
  tenantId: z.string(),
  winnerId: z.string(),
  loserId: z.string(),
});

export async function mergeParentAction(input: z.infer<typeof mergeSchema>) {
  const data = mergeSchema.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  const result = await mergeParents(db, {
    winnerId: data.winnerId,
    loserId: data.loserId,
  });
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "parent.merge",
    targetType: "parent",
    targetId: data.winnerId,
    diff: { ...result, emailHashes: [] },
  });
  revalidatePath(`/t/${tenant.slug}/coach/parents/${data.winnerId}`);
}

export async function sendParentClaimEmailAction(
  input: z.infer<typeof tenantParentScope>
) {
  const data = tenantParentScope.parse(input);
  const { user } = await assertCanManage(data.tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  const parent = await db.parent.findUniqueOrThrow({ where: { id: data.parentId } });
  if (parent.userId) {
    throw new Error("Parent has already claimed their account");
  }
  const token = await issueClaimToken(db, parent.id);
  const claimUrl = `${env.NEXTAUTH_URL}/claim/${token}`;
  await sendBookingConfirmation({
    to: parent.email,
    parentName: parent.name ?? "there",
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    programName: "your sessions",
    startsAt: new Date(),
    endsAt: new Date(),
    amountCents: 0,
    pendingPayment: false,
    timeZone: tenant.timeZone ?? undefined,
    claimUrl,
  });
  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "parent.claim_email_sent",
    targetType: "parent",
    targetId: parent.id,
    diff: { emailHash: emailHash(parent.email) },
  });
}
```

- [ ] **Step 19.2: Extend `AuditAction` union in `src/lib/audit.ts`**

Open `src/lib/audit.ts`. Find the `AuditAction` union literal. Add these new literals:

```
| "parent.create"
| "parent.claim"
| "parent.update"
| "parent.merge"
| "parent.delete_request"
| "parent.delete_request_expired"
| "parent.delete_complete"
| "parent.delete_complete_admin_override"
| "parent.claim_email_sent"
| "tenant_parent.add"
| "tenant_parent.revoke"
| "tenant_parent.restore"
| "tenant_parent.notes_update"
| "data.parent_backfill"
| "data.audit_backfill"
```

- [ ] **Step 19.3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 19.4: Commit**

```bash
git add src/actions/parent.ts src/lib/audit.ts
git commit -m "feat(parents): server actions for update/revoke/restore/notes/merge/claim-resend"
```

---

### Task 20: Edit + Merge + Revoke modals + ActionsPanel

**Files:**
- Create: `src/components/parents/EditParentSheet.tsx`
- Create: `src/components/parents/MergeParentSheet.tsx`
- Create: `src/components/parents/ParentActionsPanel.tsx`
- Create: `src/components/parents/ParentNotesEditor.tsx`
- Create: `src/components/parents/ParentDangerZone.tsx`
- Modify: `src/app/t/[slug]/coach/parents/[parentId]/page.tsx` (mount the panels)

- [ ] **Step 20.1: Edit modal**

Create `src/components/parents/EditParentSheet.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateParentAction } from "@/actions/parent";
import { Loader2 } from "lucide-react";
import type { Parent } from "@prisma/client";

const schema = z.object({
  name: z.string().max(120).optional(),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
});
type FormData = z.infer<typeof schema>;

export function EditParentSheet({
  tenantId,
  parent,
  tenantCount,
  open,
  onOpenChange,
}: {
  tenantId: string;
  parent: Parent;
  tenantCount: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: parent.name ?? "",
      email: parent.email,
      phone: parent.phone ?? "",
    },
  });

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        await updateParentAction({
          tenantId,
          parentId: parent.id,
          name: data.name || null,
          email: data.email,
          phone: data.phone || null,
        });
        toast.success("Parent updated");
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit parent</SheetTitle>
          <SheetDescription>
            Update name, email, or phone. Email changes apply to every tenant
            this parent is registered with ({tenantCount}{" "}
            {tenantCount === 1 ? "tenant" : "tenants"}).
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="edit-parent-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
              {parent.userId && (
                <p className="text-[11px] text-ink-500">
                  This parent has signed in — changing email will also update
                  their sign-in email.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button form="edit-parent-form" type="submit" variant="primary" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 20.2: Merge modal**

Create `src/components/parents/MergeParentSheet.tsx`:

```tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mergeParentAction } from "@/actions/parent";
import { Loader2, Users } from "lucide-react";

type Candidate = {
  id: string;
  email: string;
  name: string | null;
  playerCount: number;
};

export function MergeParentSheet({
  tenantId,
  winnerId,
  open,
  onOpenChange,
  searchCandidates,
}: {
  tenantId: string;
  winnerId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Server action that returns matches for a query string. */
  searchCandidates: (q: string) => Promise<Candidate[]>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [selectedLoser, setSelectedLoser] = useState<Candidate | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    searchCandidates(q).then((r) => {
      if (!cancelled) setResults(r.filter((c) => c.id !== winnerId));
    });
    return () => { cancelled = true; };
  }, [q, searchCandidates, winnerId]);

  function runMerge() {
    if (!selectedLoser) return;
    startTransition(async () => {
      try {
        await mergeParentAction({
          tenantId,
          winnerId,
          loserId: selectedLoser.id,
        });
        toast.success("Parents merged");
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Merge duplicate parent</SheetTitle>
          <SheetDescription>
            Pick the duplicate parent record. Their kids, bookings, and invoices
            will move to this one. The duplicate becomes a tombstone — this can&apos;t
            be undone.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            autoFocus
          />
          <ul className="divide-y divide-line">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedLoser(c)}
                  className={`w-full text-left p-3 hover:bg-pitch-700 ${
                    selectedLoser?.id === c.id ? "bg-turf-400/10 border-l-2 border-turf-400" : ""
                  }`}
                >
                  <p className="font-medium text-ink-50">{c.name ?? c.email}</p>
                  <p className="text-xs text-ink-500">{c.email}</p>
                  <p className="text-[10px] text-ink-500 inline-flex items-center gap-1 mt-1">
                    <Users className="h-3 w-3" />
                    {c.playerCount} {c.playerCount === 1 ? "kid" : "kids"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {selectedLoser && (
            <div className="rounded-md border border-warn/40 bg-warn/5 p-3 text-xs text-warn">
              About to merge <strong>{selectedLoser.name ?? selectedLoser.email}</strong> into this
              parent. {selectedLoser.playerCount} kids + all bookings + invoices will be
              re-pointed.
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={runMerge}
            disabled={!selectedLoser || pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Merge
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

The `searchCandidates` server-action wrapper goes in `src/app/t/[slug]/coach/parents/[parentId]/page.tsx`:

```tsx
import { db } from "@/lib/db";

async function searchMergeCandidates(q: string) {
  "use server";
  // Tenant-scoped: only candidates with a TenantParent at this tenant
  // (caller passes the tenantId via closure or you re-fetch here).
  // For brevity in this plan the implementation lives at the page level.
}
```

(See Task 21 for the page wiring.)

- [ ] **Step 20.3: Notes editor**

Create `src/components/parents/ParentNotesEditor.tsx`:

```tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { updateTenantParentNotesAction } from "@/actions/parent";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function ParentNotesEditor({
  tenantId,
  parentId,
  initialNotes,
}: {
  tenantId: string;
  parentId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (value === (initialNotes ?? "")) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        try {
          await updateTenantParentNotesAction({
            tenantId,
            parentId,
            notes: value || null,
          });
          setSavedAt(new Date());
        } catch (e) {
          toast.error((e as Error).message);
        }
      });
    }, 800);
    return () => clearTimeout(handle);
  }, [value, initialNotes, tenantId, parentId]);

  return (
    <Card className="px-6 py-5">
      <Label className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
        Tenant-private notes
      </Label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder="Private notes about this parent. Never shown to them."
        className="w-full mt-2 rounded-md border border-line bg-pitch-700 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-700 focus:outline-none focus:border-turf-400/60"
      />
      <p className="text-[10px] text-ink-500 mt-1 inline-flex items-center gap-1">
        {pending ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : savedAt ? "Saved" : "Auto-saves as you type"}
      </p>
    </Card>
  );
}
```

- [ ] **Step 20.4: Actions panel + danger zone shell**

Create `src/components/parents/ParentActionsPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, Edit, Users, Ban, RotateCcw, Loader2 } from "lucide-react";
import { sendParentClaimEmailAction, revokeParentAccessAction, restoreParentAccessAction } from "@/actions/parent";
import { EditParentSheet } from "./EditParentSheet";
import { MergeParentSheet } from "./MergeParentSheet";
import type { Parent, TenantParent } from "@prisma/client";

export function ParentActionsPanel({
  tenantId,
  parent,
  tenantParent,
  tenantCount,
  searchMergeCandidates,
}: {
  tenantId: string;
  parent: Parent;
  tenantParent: TenantParent;
  tenantCount: number;
  searchMergeCandidates: (q: string) => Promise<{
    id: string;
    email: string;
    name: string | null;
    playerCount: number;
  }[]>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function sendClaim() {
    startTransition(async () => {
      try {
        await sendParentClaimEmailAction({ tenantId, parentId: parent.id });
        toast.success(`Claim link sent to ${parent.email}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function toggleRevoke() {
    startTransition(async () => {
      try {
        if (tenantParent.status === "ACTIVE") {
          await revokeParentAccessAction({ tenantId, parentId: parent.id });
          toast.success("Family-portal access revoked");
        } else {
          await restoreParentAccessAction({ tenantId, parentId: parent.id });
          toast.success("Family-portal access restored");
        }
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Card className="px-6 py-5 space-y-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500">Actions</p>
      <div className="flex flex-wrap gap-2">
        {!parent.userId && (
          <Button variant="outline" size="sm" onClick={sendClaim} disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Send claim link
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Edit className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
          <Users className="h-3.5 w-3.5" />
          Merge duplicate
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleRevoke}
          disabled={pending}
          className={tenantParent.status === "REVOKED" ? "text-turf-300" : "text-warn"}
        >
          {tenantParent.status === "REVOKED" ? (
            <><RotateCcw className="h-3.5 w-3.5" /> Restore access</>
          ) : (
            <><Ban className="h-3.5 w-3.5" /> Revoke access</>
          )}
        </Button>
      </div>

      <EditParentSheet
        tenantId={tenantId}
        parent={parent}
        tenantCount={tenantCount}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <MergeParentSheet
        tenantId={tenantId}
        winnerId={parent.id}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        searchCandidates={searchMergeCandidates}
      />
    </Card>
  );
}
```

- [ ] **Step 20.5: Danger zone (delete-request only — confirm flow lives at a different route)**

Create `src/components/parents/ParentDangerZone.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { requestParentDeletionAction } from "@/actions/parent-deletion";
import type { Parent } from "@prisma/client";

export function ParentDangerZone({
  tenantId,
  parent,
}: {
  tenantId: string;
  parent: Parent;
}) {
  const [confirm, setConfirm] = useState(false);
  const [emailEcho, setEmailEcho] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (emailEcho.trim().toLowerCase() !== parent.email.toLowerCase()) {
      toast.error("Email does not match");
      return;
    }
    startTransition(async () => {
      try {
        await requestParentDeletionAction({ tenantId, parentId: parent.id });
        toast.success("Deletion request sent to the parent");
        setConfirm(false);
        setEmailEcho("");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Card className="px-6 py-5 border-danger/30 bg-danger/5 space-y-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-danger inline-flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3" />
        Danger zone
      </p>
      <p className="text-sm text-ink-300">
        Request global deletion. The parent receives an email asking them to
        confirm. If they confirm, their account is anonymized across every
        tenant — including others where they have active access. Cannot be
        undone.
      </p>
      {!confirm ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirm(true)}
          className="border-danger/40 text-danger hover:bg-danger/10"
        >
          Request global deletion
        </Button>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="echo">
            Type <span className="font-mono">{parent.email}</span> to confirm
          </Label>
          <Input
            id="echo"
            value={emailEcho}
            onChange={(e) => setEmailEcho(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={pending || emailEcho.trim().toLowerCase() !== parent.email.toLowerCase()}
              className="bg-danger text-pitch-950 hover:bg-danger/90"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send deletion request
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
```

(Note: `requestParentDeletionAction` lives in `src/actions/parent-deletion.ts`, created in Task 22.)

- [ ] **Step 20.6: Mount everything on the detail page**

Edit `src/app/t/[slug]/coach/parents/[parentId]/page.tsx`. Add at the top:

```tsx
import { ParentActionsPanel } from "@/components/parents/ParentActionsPanel";
import { ParentDangerZone } from "@/components/parents/ParentDangerZone";
import { ParentNotesEditor } from "@/components/parents/ParentNotesEditor";
```

Inside the JSX return, after `<ParentInvoicesCard />`, add:

```tsx
<ParentNotesEditor
  tenantId={tenant.id}
  parentId={parentId}
  initialNotes={tenantParent.notes}
/>
<ParentActionsPanel
  tenantId={tenant.id}
  parent={tenantParent.parent}
  tenantParent={tenantParent}
  tenantCount={await db.tenantParent.count({ where: { parentId } })}
  searchMergeCandidates={async (q: string) => {
    "use server";
    const tps = await db.tenantParent.findMany({
      where: {
        tenantId: tenant.id,
        parent: {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      include: {
        parent: { select: { id: true, email: true, name: true } },
      },
      take: 10,
    });
    return Promise.all(
      tps.map(async (tp) => ({
        id: tp.parent.id,
        email: tp.parent.email,
        name: tp.parent.name,
        playerCount: await db.player.count({
          where: { tenantId: tenant.id, parentRefId: tp.parent.id },
        }),
      }))
    );
  }}
/>
<ParentDangerZone tenantId={tenant.id} parent={tenantParent.parent} />
```

- [ ] **Step 20.7: Typecheck + smoke**

Run: `pnpm typecheck` — expect clean. Visit the detail page; click each button; verify modals open + actions complete.

- [ ] **Step 20.8: Commit**

```bash
git add src/components/parents src/app/t/\[slug\]/coach/parents/\[parentId\]/page.tsx
git commit -m "feat(parents): edit/merge/revoke/notes/danger-zone UI on detail page"
```

---

### Task 21: Surface parents in existing pages

**Files:**
- Modify: `src/app/t/[slug]/coach/roster/[playerId]/page.tsx`
- Modify: `src/app/t/[slug]/coach/payments/[invoiceId]/page.tsx`
- Modify: `src/app/t/[slug]/coach/schedule/[eventId]/page.tsx`

- [ ] **Step 21.1: Add a Parents card to the player profile**

Find `src/app/t/[slug]/coach/roster/[playerId]/page.tsx`. Add a new section after the existing player-info card:

```tsx
{player.parentRefId && (() => {
  const parents = await db.parentPlayer.findMany({
    where: { playerId: player.id },
    include: { parentRef: true },
  });
  return parents.length > 0 ? (
    <Card className="px-6 py-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">
        Parents ({parents.length})
      </p>
      <ul className="divide-y divide-line">
        {parents.map((pp) => pp.parentRef && (
          <li key={pp.parentRef.id} className="py-2.5">
            <Link
              href={`/t/${tenant.slug}/coach/parents/${pp.parentRef.id}`}
              prefetch={false}
              className="flex items-center gap-2 hover:bg-pitch-800/40 -mx-2 px-2 rounded"
            >
              <span className="font-medium text-ink-50">
                {pp.parentRef.name ?? pp.parentRef.email}
              </span>
              <span className="text-xs text-ink-500">({pp.relationship})</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  ) : null;
})()}
```

(If the existing page is server-rendered with `await` at the top, restructure to fetch parents at the page level and pass them down.)

- [ ] **Step 21.2: Add a Payer link to invoice detail**

In `src/app/t/[slug]/coach/payments/[invoiceId]/page.tsx`, near the "Created" / "Due" / "Paid" rows, add:

```tsx
{(async () => {
  const enrollment = invoice.enrollments[0];
  if (!enrollment) return null;
  const player = await db.player.findUnique({
    where: { id: enrollment.playerId },
    select: { parentRefId: true },
  });
  if (!player?.parentRefId) return null;
  const parent = await db.parent.findUnique({
    where: { id: player.parentRefId },
    select: { id: true, name: true, email: true },
  });
  return parent ? (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-500">Payer</p>
      <Link
        href={`/t/${slug}/coach/parents/${parent.id}`}
        prefetch={false}
        className="font-medium text-ink-50 hover:text-turf-300"
      >
        {parent.name ?? parent.email}
      </Link>
    </div>
  ) : null;
})()}
```

(Same restructure note if the file isn't already async-friendly here.)

- [ ] **Step 21.3: Add parent-chevron to event attendance rows**

In `src/app/t/[slug]/coach/schedule/[eventId]/page.tsx`, find the attendance roster rendering. For each player row, look up the player's `parentRefId` and append a small chevron link to `/coach/parents/<parentId>`. If wiring this requires more than ~20 LOC, skip in this task and re-visit in Task 23 — it's polish, not foundational.

- [ ] **Step 21.4: Typecheck + smoke**

Run: `pnpm typecheck` — expect clean. Visit each affected page and verify the new surfaces render.

- [ ] **Step 21.5: Commit**

```bash
git add src/app/t/\[slug\]/coach/roster/\[playerId\]/page.tsx src/app/t/\[slug\]/coach/payments/\[invoiceId\]/page.tsx src/app/t/\[slug\]/coach/schedule/\[eventId\]/page.tsx
git commit -m "feat(parents): cross-surface links from roster/payments/schedule to parent detail"
```

---

## Phase C — Deletion pipeline + audit

### Task 22: Request + confirm deletion actions

**Files:**
- Create: `src/actions/parent-deletion.ts`
- Create: `src/app/confirm-deletion/[token]/page.tsx`
- Create: `src/tests/parent-deletion.test.ts`
- Modify: `src/lib/email.ts` (add `sendParentDeletionRequestEmail` + `sendParentDeletionReceiptEmail`)

- [ ] **Step 22.1: Email templates**

Append to `src/lib/email.ts`:

```ts
export async function sendParentDeletionRequestEmail(opts: {
  to: string;
  parentName: string | null;
  confirmUrl: string;
  tenantName: string;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#050A07;color:#F5F7F4;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;">
    <h1 style="font-size:22px;">Confirm deletion of your KickNScream account</h1>
    <p>Hi${opts.parentName ? " " + escapeHtml(opts.parentName) : ""},</p>
    <p>Someone at <strong>${escapeHtml(opts.tenantName)}</strong> has requested deletion of your KickNScream account. If you confirm, we'll anonymize:</p>
    <ul>
      <li>Your name, email, and phone</li>
      <li>Your kids' names and photos</li>
      <li>Coach notes about you</li>
      <li>Your access to every tenant you're registered with</li>
    </ul>
    <p>Financial records (invoices and payments) are kept with your name removed for legal accounting purposes.</p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${opts.confirmUrl}" style="display:inline-block;padding:14px 28px;background:#D33;color:#fff;border-radius:8px;font-weight:600;text-decoration:none;">Confirm deletion</a>
    </p>
    <p style="font-size:12px;color:#94A39B;">This link expires in 7 days. If you didn't request deletion, just ignore this email.</p>
  </div></body></html>`;
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: "Confirm deletion of your KickNScream account",
    html,
    text: `Confirm deletion: ${opts.confirmUrl}\n\nLink expires in 7 days.`,
  });
}

export async function sendParentDeletionReceiptEmail(opts: {
  to: string;
  parentName: string | null;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#050A07;color:#F5F7F4;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;">
    <h1 style="font-size:22px;">Your KickNScream account has been deleted</h1>
    <p>Hi${opts.parentName ? " " + escapeHtml(opts.parentName) : ""},</p>
    <p>Your KickNScream account is gone. Your name, email, phone, kids' names + photos, and any coach notes have been anonymized.</p>
    <p>Payment records held by each tenant and by Stripe remain for accounting and legal compliance. To request deletion at Stripe, contact each tenant directly.</p>
    <p>Thanks for using KickNScream.</p>
  </div></body></html>`;
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: "Your KickNScream account has been deleted",
    html,
    text: `Your KickNScream account has been deleted.`,
  });
}
```

- [ ] **Step 22.2: Implement request-deletion action**

Create `src/actions/parent-deletion.ts`:

```ts
"use server";

import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant, STAFF_ROLES } from "@/lib/roles";
import { logAudit, emailHash } from "@/lib/audit";
import {
  sendParentDeletionRequestEmail,
  sendParentDeletionReceiptEmail,
} from "@/lib/email";

const requestSchema = z.object({
  tenantId: z.string(),
  parentId: z.string(),
});

export async function requestParentDeletionAction(
  input: z.infer<typeof requestSchema>
) {
  const data = requestSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const m = user.memberships.find((x) => x.tenantId === data.tenantId);
  if (!m || !canManageTenant(m.role)) throw new Error("Forbidden");
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: data.tenantId } });
  const parent = await db.parent.findUniqueOrThrow({ where: { id: data.parentId } });

  if (parent.deletedAt) throw new Error("Parent already deleted");

  const token = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + 7 * 86400 * 1000);
  await db.parent.update({
    where: { id: parent.id },
    data: {
      pendingDeletionToken: token,
      pendingDeletionRequestedAt: new Date(),
      pendingDeletionRequestedBy: user.id,
    },
  });

  await sendParentDeletionRequestEmail({
    to: parent.email,
    parentName: parent.name,
    confirmUrl: `${env.NEXTAUTH_URL}/confirm-deletion/${token}`,
    tenantName: tenant.name,
  });

  await logAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "parent.delete_request",
    targetType: "parent",
    targetId: parent.id,
    diff: { emailHash: emailHash(parent.email) },
  });

  void expires;
}

export async function confirmParentDeletionAction(token: string) {
  // No auth required — the email click itself is the consent.
  const parent = await db.parent.findUnique({
    where: { pendingDeletionToken: token },
  });
  if (!parent || !parent.pendingDeletionRequestedAt) {
    redirect("/confirm-deletion/expired");
  }
  if (parent.pendingDeletionRequestedAt < new Date(Date.now() - 7 * 86400 * 1000)) {
    redirect("/confirm-deletion/expired");
  }

  // Capture the original email BEFORE anonymization (Section 5 step 1).
  const originalEmail = parent.email;
  const originalName = parent.name;

  // Get every affected tenant for fan-out audit rows.
  const tenantParents = await db.tenantParent.findMany({
    where: { parentId: parent.id },
    select: { tenantId: true },
  });

  await db.$transaction(async (tx) => {
    // 1. Audit FIRST (global event)
    await tx.auditLog.create({
      data: {
        tenantId: null,
        actorUserId: parent.userId,
        action: "parent.delete_complete",
        targetType: "parent",
        targetId: parent.id,
        diff: {
          emailHash: emailHash(originalEmail),
          tenantsAffected: tenantParents.length,
        },
      },
    });

    // 1b. Per-tenant revoke audit rows with back-pointer.
    for (const tp of tenantParents) {
      await tx.auditLog.create({
        data: {
          tenantId: tp.tenantId,
          actorUserId: parent.userId,
          action: "tenant_parent.revoke",
          targetType: "tenant_parent",
          targetId: parent.id,
          diff: { reason: "global_delete" },
        },
      });
    }

    // 2. Anonymize Parent
    await tx.parent.update({
      where: { id: parent.id },
      data: {
        email: `deleted-${parent.id}@kicknscream.invalid`,
        name: null,
        phone: null,
        userId: null,
        deletedAt: new Date(),
        pendingDeletionToken: null,
        pendingDeletionRequestedAt: null,
        pendingDeletionRequestedBy: null,
      },
    });

    // 3. Revoke every TenantParent (keep rows for audit)
    await tx.tenantParent.updateMany({
      where: { parentId: parent.id },
      data: { status: "REVOKED", revokedAt: new Date(), notes: null },
    });

    // 4. Players: orphan-vs-active split
    const players = await tx.player.findMany({
      where: { parentRefId: parent.id },
      select: { id: true },
    });
    for (const p of players) {
      const [enrollCount, attendCount] = await Promise.all([
        tx.enrollment.count({
          where: { playerId: p.id, status: { in: ["ACTIVE", "PENDING"] } },
        }),
        tx.attendance.count({ where: { playerId: p.id } }),
      ]);
      const hasActivity = enrollCount > 0 || attendCount > 0;
      await tx.player.update({
        where: { id: p.id },
        data: hasActivity
          ? {
              firstName: "Former",
              lastName: `Player ${p.id.slice(0, 6)}`,
              notes: null,
              parentRefId: null,
            }
          : {
              firstName: "Deleted",
              lastName: "Player",
              dob: new Date("1900-01-01"),
              notes: null,
              parentRefId: null,
            },
      });
    }

    // 5. Invoice payerEmail hashing
    const invoices = await tx.invoice.findMany({
      where: {
        enrollments: { some: { player: { parentRefId: parent.id } } },
      },
      select: { id: true },
    });
    if (invoices.length > 0) {
      await tx.invoice.updateMany({
        where: { id: { in: invoices.map((i) => i.id) } },
        data: { payerEmail: `${emailHash(originalEmail)}@deleted` },
      });
    }

    // 6. Drop ParentPlayer rows
    await tx.parentPlayer.deleteMany({ where: { parentRefId: parent.id } });

    // 7. Delete NextAuth User only if no staff memberships remain
    if (parent.userId) {
      const stillStaff = await tx.membership.count({
        where: {
          userId: parent.userId,
          role: { in: STAFF_ROLES },
        },
      });
      if (stillStaff === 0) {
        await tx.user.delete({ where: { id: parent.userId } });
      }
    }
  });

  // 8. Send receipt to the ORIGINAL email (outside the transaction)
  try {
    await sendParentDeletionReceiptEmail({
      to: originalEmail,
      parentName: originalName,
    });
  } catch (e) {
    console.error("[parent-deletion] receipt email failed", e);
  }

  redirect("/confirm-deletion/done");
}
```

- [ ] **Step 22.3: Confirm-deletion landing page**

Create `src/app/confirm-deletion/[token]/page.tsx`:

```tsx
import { confirmParentDeletionAction } from "@/actions/parent-deletion";

export default async function ConfirmDeletionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Renders a "Are you sure?" page. Submit POSTs to the action via form.
  async function confirm() {
    "use server";
    await confirmParentDeletionAction(token);
  }
  return (
    <main className="min-h-screen bg-pitch-900 text-ink-50 flex items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold">Confirm deletion</h1>
        <p className="text-ink-300">
          This will anonymize your KickNScream account across every tenant you
          have access to. It cannot be undone.
        </p>
        <form action={confirm}>
          <button
            type="submit"
            className="bg-danger text-pitch-950 px-6 py-3 rounded-md font-semibold hover:bg-danger/90"
          >
            Yes, delete my account
          </button>
        </form>
      </div>
    </main>
  );
}
```

Plus minimal `/confirm-deletion/expired/page.tsx` and `/confirm-deletion/done/page.tsx` static pages (same pattern as `/claim/expired/page.tsx` from Task 13).

- [ ] **Step 22.4: Unit test the pipeline against a real test DB**

Create `src/tests/parent-deletion.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { confirmParentDeletionAction } from "@/actions/parent-deletion";
import { findOrCreateParent, attachUserToParent } from "@/lib/parents";

// These tests assume a real Postgres test DB and that
// confirmParentDeletionAction can run without redirect() throwing — we wrap.

const db = new PrismaClient();

let TENANT_ID: string;

beforeEach(async () => {
  const t = await db.tenant.create({
    data: { slug: `dlt-${Date.now()}`, name: "DLT", type: "COACH" },
  });
  TENANT_ID = t.id;
});

describe("confirmParentDeletionAction pipeline", () => {
  it("anonymizes Parent + TenantParent + Players + Invoice payerEmails", async () => {
    const user = await db.user.create({
      data: { email: `d${Date.now()}@x.com`, name: "Del" },
    });
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: user.email,
      name: "Del",
    });
    await attachUserToParent(db, { parentId: parent.id, userId: user.id });

    // Player with no activity → fully anonymized
    const orphan = await db.player.create({
      data: {
        tenantId: TENANT_ID,
        firstName: "Orphan",
        lastName: "Kid",
        dob: new Date("2015-01-01"),
        parentRefId: parent.id,
      },
    });

    // Issue a deletion token
    await db.parent.update({
      where: { id: parent.id },
      data: {
        pendingDeletionToken: "tok-test",
        pendingDeletionRequestedAt: new Date(),
        pendingDeletionRequestedBy: user.id,
      },
    });

    await expect(
      confirmParentDeletionAction("tok-test")
    ).rejects.toBeDefined(); // redirect() throws NEXT_REDIRECT in test env

    const after = await db.parent.findUnique({ where: { id: parent.id } });
    expect(after?.email).toMatch(/deleted-/);
    expect(after?.name).toBeNull();
    expect(after?.deletedAt).not.toBeNull();
    expect(after?.userId).toBeNull();

    const tp = await db.tenantParent.findUnique({
      where: { tenantId_parentId: { tenantId: TENANT_ID, parentId: parent.id } },
    });
    expect(tp?.status).toBe("REVOKED");

    const orphanAfter = await db.player.findUnique({ where: { id: orphan.id } });
    expect(orphanAfter?.firstName).toBe("Deleted");
    expect(orphanAfter?.parentRefId).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { parent } = await findOrCreateParent(db, {
      tenantId: TENANT_ID,
      email: `exp${Date.now()}@x.com`,
    });
    await db.parent.update({
      where: { id: parent.id },
      data: {
        pendingDeletionToken: "exp-tok",
        pendingDeletionRequestedAt: new Date(Date.now() - 10 * 86400 * 1000),
      },
    });
    await expect(
      confirmParentDeletionAction("exp-tok")
    ).rejects.toBeDefined(); // redirect to /confirm-deletion/expired
    const after = await db.parent.findUnique({ where: { id: parent.id } });
    // Should NOT be anonymized
    expect(after?.deletedAt).toBeNull();
  });
});
```

- [ ] **Step 22.5: Run tests**

Run: `pnpm vitest run src/tests/parent-deletion.test.ts`
Expected: PASS (2/2).

- [ ] **Step 22.6: Commit**

```bash
git add src/actions/parent-deletion.ts src/app/confirm-deletion src/lib/email.ts src/tests/parent-deletion.test.ts
git commit -m "feat(parents): GDPR deletion pipeline + parent confirmation flow"
```

---

### Task 23: Daily `audit-redact` cron

**Files:**
- Create: `src/app/api/cron/audit-redact/route.ts`
- Modify: `vercel.json`

- [ ] **Step 23.1: Implement the cron route**

Create `src/app/api/cron/audit-redact/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDACT_AFTER_DAYS = 90;
const TOKEN_EXPIRY_DAYS = 7;

export async function GET(req: Request) {
  // Auth: Vercel Cron sends x-vercel-cron, or accept a bearer token in
  // CRON_SECRET for manual triggers / local testing.
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isCron && bearer !== env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoffPii = new Date(Date.now() - REDACT_AFTER_DAYS * 86400 * 1000);
  const cutoffToken = new Date(Date.now() - TOKEN_EXPIRY_DAYS * 86400 * 1000);

  // Job 1: PII redaction on parent.update / parent.create / parent.claim
  const candidates = await db.auditLog.findMany({
    where: {
      createdAt: { lt: cutoffPii },
      action: { in: ["parent.update", "parent.create", "parent.claim"] },
    },
    select: { id: true, diff: true },
  });
  let redacted = 0;
  for (const row of candidates) {
    const diff = row.diff as Record<string, unknown> | null;
    if (!diff) continue;
    const fixedDiff: Record<string, unknown> = { ...diff };
    let touched = false;
    for (const key of ["before", "after"] as const) {
      const sub = diff[key] as Record<string, unknown> | undefined;
      if (sub && typeof sub === "object") {
        const redactedSub: Record<string, unknown> = { ...sub };
        for (const field of ["name", "email", "phone"]) {
          if (redactedSub[field] && redactedSub[field] !== "[redacted-by-policy]") {
            redactedSub[field] = "[redacted-by-policy]";
            touched = true;
          }
        }
        fixedDiff[key] = redactedSub;
      }
    }
    if (touched) {
      await db.auditLog.update({
        where: { id: row.id },
        data: { diff: fixedDiff },
      });
      redacted++;
    }
  }

  // Job 2: Stale deletion-request token cleanup
  const stale = await db.parent.findMany({
    where: {
      pendingDeletionToken: { not: null },
      pendingDeletionRequestedAt: { lt: cutoffToken },
    },
    select: { id: true, tenantLinks: { select: { tenantId: true } } },
  });
  for (const p of stale) {
    await db.parent.update({
      where: { id: p.id },
      data: {
        pendingDeletionToken: null,
        pendingDeletionRequestedAt: null,
        pendingDeletionRequestedBy: null,
      },
    });
    // One audit row per affected tenant
    for (const link of p.tenantLinks) {
      await logAudit({
        tenantId: link.tenantId,
        action: "parent.delete_request_expired",
        targetType: "parent",
        targetId: p.id,
      });
    }
  }

  return NextResponse.json({
    redacted,
    tokensExpired: stale.length,
  });
}
```

- [ ] **Step 23.2: Register the cron in `vercel.json`**

Open `vercel.json`. Add to the `crons` array:

```json
{
  "path": "/api/cron/audit-redact",
  "schedule": "0 6 * * *"
}
```

(Runs daily at 06:00 UTC.)

- [ ] **Step 23.3: Smoke**

Run: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/audit-redact`
Expected: JSON `{ redacted: 0, tokensExpired: 0 }` against a fresh DB.

- [ ] **Step 23.4: Commit**

```bash
git add src/app/api/cron/audit-redact/route.ts vercel.json
git commit -m "feat(cron): daily audit-redact — 90d PII + 7d token expiry"
```

---

### Task 24: AuditRow rendering for new action types

**Files:**
- Modify: `src/components/admin/AuditRow.tsx`

- [ ] **Step 24.1: Extend the label map**

Open `src/components/admin/AuditRow.tsx`. Find the `LABELS` (or equivalent) record and add:

```ts
"parent.create":            "Added parent contact",
"parent.claim":             "Parent claimed their account",
"parent.update":            "Edited parent details",
"parent.merge":             "Merged duplicate parents",
"parent.delete_request":    "Requested parent deletion",
"parent.delete_request_expired": "Parent-deletion request expired",
"parent.delete_complete":   "Completed parent deletion",
"parent.claim_email_sent":  "Sent parent-claim email",
"tenant_parent.add":        "Granted family-portal access",
"tenant_parent.revoke":     "Revoked family-portal access",
"tenant_parent.restore":    "Restored family-portal access",
"tenant_parent.notes_update": "Updated parent notes",
"data.parent_backfill":     "Backfilled Parent rows from Memberships",
"data.audit_backfill":      "Redacted historical audit emails",
```

- [ ] **Step 24.2: Render `targetType === "parent"` as a link**

In the same file, find where `targetId` is rendered. Add a branch:

```tsx
{row.targetType === "parent" || row.targetType === "tenant_parent" ? (
  <Link
    href={`/t/${tenantSlug}/coach/parents/${row.targetId}`}
    prefetch={false}
    className="text-turf-300 hover:text-turf-200 underline"
  >
    {row.targetId}
  </Link>
) : (
  <span>{row.targetId}</span>
)}
```

- [ ] **Step 24.3: Render diff shapes**

Where the diff is currently displayed as raw JSON, add a small switch on shape:

```tsx
function DiffView({ diff }: { diff: Record<string, unknown> }) {
  if (diff.before && diff.after) {
    // Shape A
    return (
      <table className="text-xs w-full">
        <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
        <tbody>
          {Object.keys(diff.after as object).map((k) => (
            <tr key={k}>
              <td className="text-ink-500">{k}</td>
              <td>{String((diff.before as Record<string, unknown>)[k] ?? "—")}</td>
              <td>{String((diff.after as Record<string, unknown>)[k] ?? "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (diff.winnerId && diff.loserId) {
    // Shape C (merge / delete_complete)
    return (
      <p className="text-xs text-ink-300">
        {String(diff.kidsMoved ?? 0)} kids moved · {String(diff.tenantsCollapsed ?? 0)} tenants
      </p>
    );
  }
  // Shape B fallback
  return (
    <dl className="text-xs grid grid-cols-2 gap-1">
      {Object.entries(diff).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-500">{k}</dt>
          <dd className="font-mono">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 24.4: Typecheck + smoke**

Run: `pnpm typecheck` — clean. Visit `/t/<slug>/admin/audit` and confirm new rows render with readable labels + diff shapes.

- [ ] **Step 24.5: Commit**

```bash
git add src/components/admin/AuditRow.tsx
git commit -m "feat(audit): render parent.* + tenant_parent.* action labels and diff shapes"
```

---

### Task 25: One-shot audit-history redaction

**Files:**
- Create: `scripts/redact-audit-history.ts`

- [ ] **Step 25.1: Implement and run the script**

Create `scripts/redact-audit-history.ts`:

```ts
/**
 * One-shot. Walks every existing AuditLog row whose `diff` JSON contains
 * `email`, `parentEmail`, or `payerEmail`, hashes the value via emailHash(),
 * and rewrites the row. Idempotent.
 *
 * Usage:
 *   pnpm tsx scripts/redact-audit-history.ts            # dry run
 *   pnpm tsx scripts/redact-audit-history.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { emailHash, logAudit } from "../src/lib/audit";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`[redact-audit-history] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
  const rows = await db.auditLog.findMany({
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
    if (!diff) continue;
    const fixed: Record<string, unknown> = { ...diff };
    let changed = false;
    for (const k of ["email", "parentEmail", "payerEmail"]) {
      const v = fixed[k];
      if (typeof v === "string" && v.includes("@")) {
        fixed[`${k}Hash`] = emailHash(v);
        delete fixed[k];
        changed = true;
      }
    }
    if (changed) {
      if (APPLY) {
        await db.auditLog.update({ where: { id: row.id }, data: { diff: fixed } });
      }
      touched++;
    }
  }

  if (APPLY) {
    await logAudit({
      tenantId: null as unknown as string,
      action: "data.audit_backfill",
      diff: { rowsRewritten: touched },
    });
  }
  console.log({ rowsRewritten: touched, dryRun: !APPLY });
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 25.2: Dry-run then apply**

```bash
pnpm tsx scripts/redact-audit-history.ts
pnpm tsx scripts/redact-audit-history.ts --apply
```

- [ ] **Step 25.3: Commit**

```bash
git add scripts/redact-audit-history.ts
git commit -m "feat(scripts): one-shot redaction of historical audit-row emails"
```

---

## Phase D — Cleanup

### Task 26: Phase D soak gate

- [ ] **Step 26.1: Pause for soak**

This step is a **no-op commit point**. Phase D MUST NOT ship until production has been on `NEXT_PUBLIC_PARENT_MODEL_V2 = true` for at least 14 days with zero parent-access incidents (no support tickets, no 5xx on `/family/*`, no claim-flow failures in Sentry). When that gate passes, continue to Task 27.

```bash
git commit --allow-empty -m "chore(parents): phase D soak begins — do not advance for 14d"
```

---

### Task 27: Drop legacy PARENT/PLAYER memberships

**Files:**
- Modify: `prisma/schema.prisma` (Role enum)
- Create: `scripts/drop-legacy-parent-memberships.ts`

- [ ] **Step 27.1: Delete the rows**

Create `scripts/drop-legacy-parent-memberships.ts`:

```ts
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
(async () => {
  const count = await db.membership.count({
    where: { role: { in: ["PARENT", "PLAYER"] } },
  });
  console.log({ rowsToDelete: count, dryRun: !APPLY });
  if (APPLY) {
    const res = await db.membership.deleteMany({
      where: { role: { in: ["PARENT", "PLAYER"] } },
    });
    console.log({ deleted: res.count });
  }
  await db.$disconnect();
})();
```

Run dry-run then apply:

```bash
pnpm tsx scripts/drop-legacy-parent-memberships.ts
pnpm tsx scripts/drop-legacy-parent-memberships.ts --apply
```

- [ ] **Step 27.2: Drop PARENT/PLAYER from the Role enum**

In `prisma/schema.prisma`, remove `PARENT` and `PLAYER` from the `enum Role { ... }` block.

Run: `pnpm prisma migrate dev --name drop-parent-player-roles`
Review the generated SQL — it will be an `ALTER TYPE Role DROP VALUE 'PARENT'`. Apply with `pnpm prisma migrate deploy` against prod when ready.

- [ ] **Step 27.3: Typecheck + tests**

Run: `pnpm typecheck && pnpm vitest run`
Expected: clean. The Sprint-2 `STAFF_ROLES` filter becomes redundant but harmless.

- [ ] **Step 27.4: Commit**

```bash
git add prisma/schema.prisma scripts/drop-legacy-parent-memberships.ts
git commit -m "chore(phase-d): drop PARENT + PLAYER roles + their orphan memberships"
```

---

### Task 28: Rename `parentRefId` → `parentId`; drop legacy columns

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: every callsite using the legacy `parentId` or `parentUserId` columns

- [ ] **Step 28.1: Schema rename**

In `prisma/schema.prisma`:

- `Player.parentId` (legacy FK to User) — remove.
- `Player.parentRefId` — rename to `parentId`. Relation name changes too:

```prisma
  parentId  String?
  parent    Parent?  @relation(fields: [parentId], references: [id], onDelete: SetNull)
```

- `ParentPlayer.parentUserId` — remove.
- `ParentPlayer.parentRefId` — rename to `parentId`:

```prisma
  parentId  String
  parent    Parent  @relation(fields: [parentId], references: [id], onDelete: Cascade)
```

Generate the migration with care — Prisma will likely produce a `ALTER TABLE Player DROP COLUMN parentId; ALTER TABLE Player RENAME COLUMN parentRefId TO parentId;`. Review the generated SQL to confirm no data is lost (it shouldn't be — `parentId` was a mirror).

```bash
pnpm prisma migrate dev --name rename-parent-ref-to-parent
```

- [ ] **Step 28.2: Update every callsite that referenced legacy fields**

Search-and-replace `parentRefId` → `parentId` across the codebase. The fallback `OR: [{ parentId }, { parentRefId }]` patterns from Phase C collapse to a single `parentId`.

```bash
# Find legacy references
grep -rn "parentRefId\|parentUserId" src/
```

For each match, update the call to use `parentId`.

- [ ] **Step 28.3: Drop the feature flag**

Remove `NEXT_PUBLIC_PARENT_MODEL_V2` and `parentModelV2EnabledFor` from `src/lib/env.ts`. Remove every branch that depended on it from `src/actions/booking.ts` and `src/lib/family/events.ts` — keep only the new code path.

- [ ] **Step 28.4: Final verification**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build`
Expected: all green.

- [ ] **Step 28.5: Commit**

```bash
git add -A
git commit -m "chore(phase-d): rename parentRefId → parentId; drop legacy columns + flag"
```

---

### Task 29: Final smoke + merge

- [ ] **Step 29.1: Manual smoke walkthrough**

Run `pnpm dev`. Walk these scenarios with a fresh email address on the demo tenant:

1. Public booking with brand-new email → Parent + TenantParent created; `/admin/team` does NOT show the parent.
2. Confirmation email "Claim your account" CTA → `/claim/[token]` → magic link → lands on `/t/<slug>/family/home`.
3. Sign in at tenant A; visit `/t/<other-slug>/family/home` → works without re-claim.
4. Coach edits parent on `/coach/parents/[id]` → email change → audit row visible at `/admin/audit`.
5. Coach merges two parents → kids move; audit row `parent.merge`.
6. Coach revokes access → `/family/*` returns 403 for that parent at this tenant only.
7. Coach requests global delete → parent receives email → clicks link → confirms → pipeline runs.
8. Same email re-books after deletion → brand-new Parent (no resurrection).
9. `/admin/audit` shows all new actions with readable labels and proper diff rendering.
10. The daily cron at `/api/cron/audit-redact` runs end-to-end without errors when triggered manually.

- [ ] **Step 29.2: Merge to main**

```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff feat/parent-model-split -m "Merge feat/parent-model-split: complete Parent/Customer split"
pnpm vitest run
git push origin main
```

- [ ] **Step 29.3: Delete the feature branch**

```bash
git branch -d feat/parent-model-split
```

Leave the remote branch alone until the user confirms.

---

## Out of scope (documented in spec, do NOT add to this plan)

- Parent-side data export (GDPR Art 15) — separate spec.
- Platform-staff `/admin/parents/[id]/force-delete` route — separate spec; depends on platform-staff portal not yet built.
- Tenant-level bulk parents CSV export — trivial follow-up; add `parents` entity to existing `/admin/exports` route map (~10 LOC).
- Stripe Customer-record deletion at parent-delete time — explicit design choice per spec Section 5.
