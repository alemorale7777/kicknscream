# Parent / Customer Model Split — Design

> **Status:** Approved design. Implementation plan to follow via `superpowers:writing-plans`.

## Context

The 2026-05-19 Round 3 audit flagged a critical IAM finding (KNS-22): submitting the public booking form with any email creates a tenant `Membership` row with `role: PARENT`, putting unauthenticated strangers on the same admin/team list as actual coaches. Sprint 2 shipped a mitigation — every team query filters on `STAFF_ROLES = [OWNER, ADMIN, COACH]` — but the underlying data model still conflates two unrelated concepts: tenant **staff** (intentional, invited, authenticated) and booking **contacts** (a parent who submitted a form).

This spec separates them. It also resolves three knock-on problems the mitigation could not:

1. **GDPR Art. 17 (right-to-erasure) is currently un-implementable.** "Delete a parent" today either drops a User row used by NextAuth (collateral damage) or leaves the Membership row referenced by every player/booking/invoice (data half-deleted). Neither is correct.
2. **Multi-guardian families work mechanically (`ParentPlayer`) but not at the parent level.** Two parents of the same kid are two `User`+`Membership` pairs with no shared identity.
3. **No cross-tenant continuity.** A parent who books with Coach Alej AND PDX Skills has two unrelated identities, two sign-in sessions, no unified inbox. This is the differentiator the master plan calls out (one platform across coaches) but the current data model can't support.

The fix is a real `Parent` entity, globally unique by email, that exists independently of NextAuth `User` and is joined to tenants via a `TenantParent` association table. Family-portal access becomes a property of the `TenantParent` row, not of a `Membership`.

This work is essential, not optional. Every new feature touching `Membership` entrenches the conflation; the audit will find it again on every pass until it's fixed in the schema. Estimated 1–2 weeks of focused work, delivered in four phases that each leave the app fully working.

---

## 1. Data Model

### New tables

```prisma
model Parent {
  id          String         @id @default(cuid())
  // Globally unique — a single physical parent is one row across all tenants.
  email       String         @unique
  name        String?
  phone       String?
  // Optional link to a NextAuth User. Set when the parent claims an account
  // via magic link; null while they're a passive booking contact.
  userId      String?        @unique
  user        User?          @relation(fields: [userId], references: [id], onDelete: SetNull)
  tenantLinks TenantParent[]
  players     Player[]
  guardianships ParentPlayer[]
  // Soft-delete: set when the parent (or admin) confirms global deletion.
  // Email + name + phone are anonymized at this point; player + invoice
  // history is preserved per Section 5.
  deletedAt   DateTime?
  // GDPR deletion lifecycle (Section 5)
  pendingDeletionRequestedAt DateTime?
  pendingDeletionToken       String?   @unique
  pendingDeletionRequestedBy String?   // userId of the staff member or "self"
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@index([email])
}

model TenantParent {
  tenantId     String
  parentId     String
  status       TenantParentStatus @default(ACTIVE)
  notes        String?            // tenant-private notes; never shown to parent
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

### Modified tables

- **`Player.parentId`** — currently `String?` FK to `User.id`. Becomes FK to `Parent.id` (still nullable for staff-created orphan players). Migration introduces `Player.parentRefId String?` first; renamed to `parentId` at the end of Phase D.
- **`ParentPlayer`** — junction is currently `(parentUserId → User, playerId → Player)`. Becomes `(parentId → Parent, playerId → Player)`. Same migration shape: temporary `parentRefId`, renamed in Phase D.
- **`Membership.role`** — `PARENT` and `PLAYER` enum values dropped in Phase D. Until then they remain so legacy rows deserialize.
- **`Invoice.payerEmail`** — schema unchanged. Booking flow reads from `Parent.email` rather than form input. On global deletion (Section 5) historical rows have `payerEmail` rewritten to a hashed prefix.
- **`AuditLog.tenantId`** — becomes nullable. Required for the global `parent.delete_complete` event (Section 6).

### What the rename does NOT touch

- `User`, `Account`, `Session`, `VerificationToken` (NextAuth tables) — untouched.
- `Membership` for `OWNER`, `ADMIN`, `COACH` — untouched.
- `Player.tenantId` — players remain tenant-scoped. A child registered at two tenants is two `Player` rows, joined via the same `Parent`.
- Stripe customer / payment intent IDs on `Invoice` — untouched.

---

## 2. Auth & Portal Access

### Tagged-union access object

`requireTenant(slug)` currently returns `{ tenant, user, membership }` — every authenticated route relies on that shape. Replace with a tagged-union return type so every callsite declares which surface it gates:

```ts
type TenantAccess =
  | { kind: "staff";     tenant: Tenant; user: User; membership: Membership }
  | { kind: "parent";    tenant: Tenant; user: User; parent: Parent; tenantParent: TenantParent }
  | { kind: "anonymous"; tenant: Tenant };
```

- `requireTenant(slug)` returns `"staff"`-kind only — for `/admin/*` and `/coach/*`.
- New `requireParentAccess(slug)` returns `"parent"`-kind for `/family/*`. Requires `Parent.userId === session.user.id` AND `TenantParent.status === "ACTIVE"`.
- New `loadTenant(slug)` returns `"anonymous"`-kind for public routes (`/[slug]`, `/[slug]/book/*`).

### The claim flow (unclaimed → claimed)

A `Parent` row created by a public booking has `userId: null`. The confirmation email gains a **"Claim your family portal"** CTA → `/claim/[token]`:

1. If `session.user.email === parent.email` already (parent had a `User` from a prior staff invite or other tenant), set `Parent.userId = user.id`, clear `pendingDeletionToken`-style claim token, redirect to `/t/<slug>/family/home`.
2. If no `User` matches: render a one-step "Confirm your email" page that fires a NextAuth `email` (magic-link) provider. After callback, create `User`, set `Parent.userId`, redirect.
3. Token is reusable for 30 days; subsequent uses after `Parent.userId` is set just sign the existing user in.

Built on NextAuth's existing `email` provider — no parallel auth system.

### Cross-tenant sign-in

Because `Parent` is global by email and `Parent.userId` is global, once a parent claims at any tenant they are authenticated at every tenant where they hold an ACTIVE `TenantParent`. No re-claim per tenant.

### Membership cleanup

Phase C stops the booking action from creating `Membership.role = PARENT`. Phase D drops `PARENT` and `PLAYER` from the `Role` enum entirely. The Sprint-2 `STAFF_ROLES` filter stays in `/admin/team` and `/coach/settings/team` queries as defense in depth, even though under Phase D it becomes redundant.

### Edge cases

- **Staff who is also a parent at the same tenant** — both `Membership` and `Parent`+`TenantParent` rows exist. Workspace switcher shows a small "Parent" pill alongside their staff role.
- **Parent revokes at tenant X but active at tenant Y** — `/family/*` at X returns 403; at Y works. Global `Parent` row unaffected.
- **Same email books while parent already has a `User`** — `findOrCreateParent` attaches `userId` immediately (don't wait for explicit claim). Claim CTA still sends but is a no-op besides routing.

---

## 3. Migration Plan — Four Phases

| Phase | Scope | Reversible? | Risk |
|------:|-------|-------------|------|
| A | Schema additive | Yes (drop new tables) | None |
| B | One-shot backfill script | Yes (delete new rows) | Low |
| C | Code cutover behind feature flag | Yes (flip flag) | Medium |
| D | Drop legacy columns + enum values | No | Low (after C soak) |

### Phase A — Schema additive

`prisma db push` adds:
- `Parent` table (all fields above).
- `TenantParent` table.
- `TenantParentStatus` enum.
- `Player.parentRefId String?` (NEW, nullable; `parentId` untouched).
- `ParentPlayer.parentRefId String?` (NEW, nullable; `parentUserId` untouched).
- `AuditLog.tenantId` made nullable.

**Verification:** `pnpm db:push`, `pnpm typecheck`, `pnpm vitest run`, `pnpm build` — all green. App behavior identical.

**Rollback:** schema revert + `pnpm db:push`.

### Phase B — Backfill

`scripts/backfill-parents.ts` runs once. For every `Membership.role === "PARENT"`:

1. Group by `User.email` → upsert one `Parent` row per unique email (email/name/phone copied from `User`, `userId` = `User.id` since parents-with-membership are "claimed by definition").
2. For each tenant the user had `PARENT` membership in → upsert `TenantParent { tenantId, parentId, status: ACTIVE, registeredAt: membership.createdAt }`.
3. For every `Player.parentId IS NOT NULL` → set `Player.parentRefId = parent.id` (match by `Player.parentId === Parent.userId`).
4. For every `ParentPlayer` row → set `parentRefId` from `parentUserId`.
5. Write one `audit.create` row with `action: "data.parent_backfill"` and the summary as `diff`.

All writes use upsert on natural keys (`Parent.email`, `(tenantId, parentId)`, `Player.id`); re-running is safe.

**Sanity gates before Phase C:**
- `COUNT(Membership WHERE role='PARENT')` reconciles with `COUNT(TenantParent)`.
- Every `Player` with non-null `parentId` has non-null `parentRefId`.
- Spot-check three known tenants: Parents-page count matches distinct parent-email count.

**Apply order:** run with `--dry-run` first, then with `--apply` against Neon prod.

### Phase C — Code cutover behind feature flag

Feature flag `NEXT_PUBLIC_PARENT_MODEL_V2` (env, default `"false"`):
- `"false"` — status quo.
- `"shadow"` — write both old AND new tables; read still uses old. Validates new writes under live traffic.
- `"true"` — read AND write new. `Player.parentId` keeps being written (mirror) but isn't read.

**Rollout sequence:**
1. Deploy with flag `"shadow"`. Observe ≥24 hours.
2. Flip to `"true"` on one demo tenant via per-tenant override (`shadow_overrides` in `src/lib/env.ts`). Smoke-walk: book, claim, sign in, see kid, pay invoice, revoke access.
3. Flip global default to `"true"`.

**Files modified in Phase C:**
- `src/lib/tenant.ts` — new `requireParentAccess(slug)`; `requireTenant(slug)` narrows return type.
- `src/lib/parents.ts` — new module: `findOrCreateParent`, `attachUserToParent`, `revokeTenantAccess`, `restoreTenantAccess`, `mergeParents`.
- `src/actions/booking.ts` — `findOrCreateParent` by email; create/upsert `TenantParent`; stop creating `Membership.role = PARENT` (shadow still writes; true stops). Set `Player.parentRefId`. Keep `Player.parentId` mirror writes for read-fallback safety.
- `src/app/t/[slug]/family/**/page.tsx` — every page swaps `requireTenant` → `requireParentAccess`.
- `src/components/family/**`, `src/components/dashboard/ParentDashboard.tsx` — read from `parent` on the access object instead of `user`.
- `src/lib/family/events.ts` — query via `parentRefId` (flag true) with fallback to `parentId` (flag false).
- New: `src/app/claim/[token]/page.tsx` + claim server action.

**Migration tests (vitest):**
- `findOrCreateParent` is idempotent across concurrent bookings of same email.
- `requireParentAccess` returns only `TenantParent.status === ACTIVE`; REVOKED → 403.
- `requireTenant` rejects `Membership.role === PARENT` even if legacy rows exist.
- Claim flow: unclaimed Parent → magic link → `Parent.userId` attaches; token cleared.

**Manual smoke (demo tenant, flag = true):**
- Brand-new email books → Parent + TenantParent rows; no Membership row.
- Same email books at second tenant → existing Parent reused; new TenantParent added.
- Unauthenticated visit to `/t/<slug>/family/home` → bounced to claim → magic link → lands on family home.
- After claim at tenant A, visit tenant B's family home → works without re-claim.

**Rollback:** `vercel env set NEXT_PUBLIC_PARENT_MODEL_V2 false` + redeploy. No data loss path (shadow + true keep mirror writes).

### Phase D — Cleanup

Ship only after Phase C has been live with `"true"` for ≥14 days with zero parent-access incidents.

**Data:**
- `DELETE FROM Membership WHERE role IN ('PARENT', 'PLAYER')`.
- `prisma migrate` adds `NOT NULL` to `Player.parentRefId` (for rows where `parentId IS NOT NULL`).
- Drop `Player.parentId` column.
- Drop `ParentPlayer.parentUserId` column.

**Schema:**
- Rename `Player.parentRefId` → `Player.parentId` (column rename, no data move). Same for `ParentPlayer.parentRefId` → `parentId`.
- Drop `PARENT` and `PLAYER` from `Role` enum (review generated SQL before applying).
- Drop `Parent.pendingDeletionToken` if Section 5 keeps it (it does — keep this column).

**Code:**
- Delete `NEXT_PUBLIC_PARENT_MODEL_V2` from `src/lib/env.ts` and every branch.
- Delete legacy mirror writes in `booking.ts` and `player.ts`.
- Delete fallback queries (`OR: [{ parentId }, { parentRefId }]`); only the new path remains.

**Rollback:** none. Commit point.

---

## 4. Admin / Coach UI (Full Parents Feature)

### Route map

```
/t/[slug]/coach/parents                  →  list (server component)
/t/[slug]/coach/parents/[parentId]       →  detail (server component)
```

Edit, Merge, Revoke, and Delete-request are **Sheet modals** opened from the detail page (mirrors Sprint-2's `EventDialog` / `RecordPaymentDialog`). Half the route files; ESC-to-cancel works for free via Sprint-2's Sheet wrapper. Deep-linking to "edit this parent" uses `?action=edit` query param rather than a route segment.

### Sidebar entry

`src/lib/nav.ts` adds `Parents` (icon: `UsersRound`) between `Players` and `Messages` in COACH, INSTITUTION, and CLUB navs. `prefetch={false}` per Sprint-2 convention. Sprint-2's `navForTenantType` test extended to assert ordering.

### List page

Server-rendered. Query loads `TenantParent` rows with their `Parent`, plus a single grouped aggregation query returning per-parent stats (`playerCount`, `lastBookingAt`, `lifetimeCents`, `outstandingCents`).

**Columns (md+):** parent (avatar + name + email), kids (count chip), last booking (in tenant tz via `formatEventDateTime`), lifetime spend, outstanding (red if > 0), status pill (`Claimed` / `Unclaimed` / `Revoked` / `Deleted`), actions menu.

**Mobile:** card-stack pattern matching `BookingsTable`'s 768px-and-below view.

**Filters:** search by parent name OR email OR linked kid name; status chips (All / Claimed / Unclaimed / Outstanding / Revoked); sort by registered desc / last booking / lifetime / outstanding.

**Header counts:** `{n} parents · {m} unclaimed · {k} with outstanding`.

### Detail page

Composition mirrors Sprint-2's `/coach/payments/[invoiceId]` exactly: header card + stat strip + section cards + danger zone. New components in `src/components/parents/`:

- `ParentHeader.tsx` — avatar, name, email, phone, status pill.
- `ParentKidsCard.tsx` — kids with links to `/coach/roster/[playerId]`.
- `ParentBookingsCard.tsx` — last 50 enrollments with link to `/coach/bookings?enrollment=x`.
- `ParentInvoicesCard.tsx` — invoices via `Player → Enrollment → Invoice` chain, reusing `invoiceDisplayStatus` from Sprint 2.
- `ParentNotesEditor.tsx` (client) — debounced save to `TenantParent.notes` via `updateTenantParentNotesAction`.
- `ParentActionsPanel.tsx` (client) — buttons that dispatch modals.
- `ParentDangerZone.tsx` (client) — revoke + delete-request panels.

### Edit modal

`<EditParentSheet>` — fields `name`, `email`, `phone`. Action `updateParentAction({ parentId, name, email, phone })`:

- Email change reject on `Parent.email` collision.
- If `Parent.userId IS NOT NULL` and email differs from `User.email`, require one-step typed-confirm "Changing email will also update the parent's sign-in email." If confirmed, update both rows in a transaction.
- Audit row: `parent.update` with `diff: { before: {...}, after: {...} }` (changed fields only).
- Cross-tenant impact caption under email field: "This parent is registered with N tenants — the new email applies everywhere they have access."

### Merge modal

`<MergeParentSheet>` — coach searches duplicates within the same tenant (queries are `TenantParent`-scoped). Side-by-side confirmation shows kids moving, bookings reattaching, invoices reattaching.

`mergeParentAction({ winnerId, loserId })` in `$transaction`:

1. Re-point every `Player.parentId` and `ParentPlayer.parentId` from `loserId` → `winnerId`.
2. Re-point every `TenantParent.parentId` from `loserId` → `winnerId`, deduping `(tenantId, parentId)` collisions by keeping the older `registeredAt` and concatenating notes.
3. If `loserId` had `userId` and `winnerId` doesn't, hoist `userId` to `winnerId`.
4. Soft-delete the loser (`deletedAt = now()`, email/name/phone anonymized to `merged-<id>@kicknscream.local`).
5. One `parent.merge` audit row.

### Revoke / restore

`revokeParentAccessAction({ parentId })` sets `TenantParent.status = REVOKED, revokedAt = now()`. Does not touch global `Parent` or other tenants' links. Audit: `tenant_parent.revoke`. UI uses an inline one-line confirmation (same pattern as Sprint-2 `EventDialog` delete-confirm). After revoke, the button changes to "Restore access" → `restoreParentAccessAction` (status back to ACTIVE, `revokedAt` cleared, audit `tenant_parent.restore`).

Section-2's `requireParentAccess` already enforces ACTIVE-only, so revoke takes effect on the parent's next request without session/cookie surgery.

### Request global delete

Distinct from revoke. Red panel in danger zone. Typed-confirmation modal (must type parent's email). Fires `requestParentDeletionAction({ parentId })`:

- Sets `Parent.pendingDeletionRequestedAt = now()`, generates 32-byte signed `pendingDeletionToken`.
- Sends Resend email with 7-day signed link → `/confirm-deletion/[token]`.
- Audit: `parent.delete_request` (actor = staff user).

Deletion only commits when the parent clicks the email link. Confirmation flow → `confirmParentDeletionAction` → pipeline in Section 5.

### Surfaces inside existing pages

- `/coach/roster/[playerId]` — adds Parents card listing each `ParentPlayer` linked guardian with link to parent detail. Replaces today's single-line "Parent: user@email" rendering.
- `/coach/schedule/[eventId]` — attendance roster gains "→ parent" chevron link per row.
- `/coach/payments/[invoiceId]` (Sprint-2) — adds "Payer" row link to matching parent detail when resolvable via enrollment chain.

### Server actions added

| Action | Purpose |
|---|---|
| `updateParentAction` | Edit name/email/phone. |
| `mergeParentAction` | Collapse two Parents into one. |
| `revokeParentAccessAction` | Revoke `TenantParent`. |
| `restoreParentAccessAction` | Reverse revoke. |
| `requestParentDeletionAction` | Start global-delete flow (staff-initiated). |
| `confirmParentDeletionAction` | Email-callback-triggered; runs Section 5 pipeline. |
| `updateTenantParentNotesAction` | Debounced save of per-tenant notes. |
| `sendParentClaimEmailAction` | Re-send claim CTA from Section 2. |

Every action runs through `assertCanManage` (Sprint-2 helper) and writes one audit row.

### Tests

Unit (vitest):
- `mergeParentAction`: kids move, dedupe of `TenantParent` collisions keeps older `registeredAt`, loser soft-deleted, audit row written.
- `revokeParentAccessAction`: status=REVOKED, revokedAt set; `requireParentAccess` rejects; restore reverses.
- `updateParentAction`: email collision rejected; cross-tenant email change updates everywhere.
- `sendParentClaimEmailAction`: idempotent; rotates token if older than 30 days.

Component:
- `ParentActionsPanel` renders five buttons for ACTIVE parent; revoke replaces with Restore for REVOKED.
- Delete-request modal requires typed-email confirmation; submit disabled until match.

---

## 5. GDPR / Deletion Semantics

### Three distinct verbs

| Verb | Actor | Scope | Reversible? |
|---|---|---|---|
| **Revoke access** | Coach / Admin | One tenant | Yes (Restore) |
| **Request global delete** | Coach / Admin OR Parent | Global | Only before parent confirms |
| **Confirm global delete** | Parent (via email) OR platform-staff override | Global | **No** |

Coach can revoke and request; only the parent (or platform-staff with documented reason) can confirm. Consent gate matches GDPR Art. 17.

### The `confirmParentDeletionAction` pipeline

Runs in one `db.$transaction`. Audit write happens **first** so partial deletions are still recorded.

1. **Audit row first** — `parent.delete_complete`, `tenantId: null` (global), `diff: { emailHash, tenantsAffected }`.
2. **Anonymize global Parent**: email → `deleted-<id>@kicknscream.invalid`, name/phone → null, `userId` → null, `deletedAt = now()`, all pending-deletion fields cleared.
3. **Revoke every TenantParent**: `status = REVOKED, revokedAt = now(), notes = null`. Rows kept for audit trail.
4. **Anonymize Players with NO activity** (no active enrollments, no attendance): `firstName = "Deleted"`, `lastName = "Player"`, `dob = 1900-01-01`, `notes/photoUrl = null`, `parentId = null`.
5. **Players WITH activity**: `firstName = "Former"`, `lastName = "Player <shortId>"`, `notes/photoUrl = null`, `parentId = null`. DOB and history rows stay. Coach reports preserve row counts; identity gone.
6. **Invoice payerEmail**: rewritten to `<hash16>@deleted` for every invoice in the parent's enrollment chain.
7. **Delete `ParentPlayer` rows** for this parent outright.
8. **NextAuth User row**: delete only if no remaining `Membership.role IN STAFF_ROLES`. Sessions invalidate on FK cascade.
9. **After transaction**: send a deletion-receipt email to the **original** email. The raw email is captured at step 1 by reading `parent.email` into a local variable BEFORE step 2 anonymizes it, then passed to `sendDeletionReceiptEmail` outside the transaction. Never sourced from the audit row (which only holds `emailHash`).

### Retention basis

- **Financial records** (Invoice/Payment) kept indefinitely with `payerEmail` hashed. Legal basis: IRS records-retention, Stripe records, accounting audit trail. GDPR Recital 65 / Art. 17(3)(b) permits this.
- **Audit log** kept indefinitely with `emailHash` only, never raw values.
- **Children's PII** anonymized as part of the parent deletion (COPPA + GDPR-K higher bar). Attendance/enrollment rows survive with redacted names for tenant liability/insurance audit needs.

### What we DO NOT do automatically

- **Stripe Customer deletion** — not initiated by us. The deletion receipt informs the parent: "Payment records held by [Tenant] and Stripe remain for accounting/legal compliance. To request deletion at Stripe, contact [Tenant] directly."

### Re-registration after deletion

`findOrCreateParent` searches by raw `email`. The anonymized tombstone uses `deleted-<id>@kicknscream.invalid`, not the original — so the next booking with the original email creates a brand-new `Parent` row. Clean slate; no resurrection of revoked TenantParent links. No "previously deleted" warning (would leak existence of the prior account).

### Parent-confirmation end-to-end

1. Coach clicks "Request global delete" → types parent's email → `requestParentDeletionAction` fires.
2. Action sets `pendingDeletionRequestedAt`, generates `pendingDeletionToken`, sends Resend email.
3. Email subject: "Confirm deletion of your KickNScream account". Body explains scope/retention/irreversibility. Button → `/confirm-deletion/[token]`.
4. Parent clicks → "Type your email to confirm" page → submit → `confirmParentDeletionAction`.
5. Pipeline runs. Receipt email sent. Parent signed out everywhere.
6. Token expires 7 days after request. The daily `audit-redact` cron (Section 6) does double duty: it clears expired `pendingDeletionToken` rows (writing one `parent.delete_request_expired` audit row per cleared parent) AND redacts 90-day-old PII. One cron, two responsibilities, called out explicitly in the route file.

### Admin-override path

Platform-staff (`/admin/*` at the platform level, not tenant admin) get a single override at `/admin/parents/[id]/force-delete`. Requires typed reason stored on the audit row. Runs the same pipeline with `actorUserId = platform-staff`, audit action `parent.delete_complete_admin_override`.

**Not included in this spec's first implementation phase.** Requires a platform-staff portal not yet built. Follow-up spec.

### Tests

Unit (vitest, real Postgres test DB):

- Pipeline anonymizes correctly: Parent + ParentPlayer + Player (orphan) + Player (with-activity); Invoice payerEmail hashed.
- User row deleted only when no staff memberships remain.
- Cross-tenant delete: parent at A and B → both TenantParent rows REVOKED; both tenants get scoped audit rows.
- Token expiry: 7-day-old token rejected; fresh accepted.
- Re-registration: post-delete booking creates fresh Parent (no resurrection).
- Audit row written even if transaction rollbacks (separate transaction wrapper for audit).

### Explicitly NOT in this spec

- **Parent-side data export** (GDPR Art. 15 + 20 "download my data"). Format and scope decisions are spec-worthy on their own. Follow-up.
- **Tenant-level bulk parents CSV export** — trivial follow-up; adds `parents` entity to Sprint-2's `/admin/exports` route map. Not part of this spec.

---

## 6. Audit Log Integration

### New `AuditAction` strings

Added to the union in `src/lib/audit.ts`:

```
parent.create
parent.claim
parent.update
parent.merge
parent.delete_request
parent.delete_request_expired
parent.delete_complete
parent.delete_complete_admin_override
parent.claim_email_sent

tenant_parent.add
tenant_parent.revoke
tenant_parent.restore
tenant_parent.notes_update

data.parent_backfill         (Phase B one-shot)
data.audit_backfill          (one-shot redaction of existing Sprint-2 rows)
```

### Payload shapes (three)

**Shape A — `before` / `after`** (for `parent.update`, `tenant_parent.notes_update`). Only changed fields appear in both objects:

```ts
diff: {
  before: { email: "old@x.com", name: "Old Name" },
  after:  { email: "new@x.com", name: "New Name" },
}
```

**Shape B — action-specific metadata** (`parent.create`, `tenant_parent.add`, claim events):

```ts
diff: {
  emailHash: "abc123...",
  source: "public_booking" | "staff_invite" | "claim",
  // ...action-specific fields
}
```

**Shape C — composite operations** (`parent.merge`, `parent.delete_complete`):

```ts
diff: {
  winnerId: "p_123",
  loserId: "p_456",
  kidsMoved: 3,
  tenantsCollapsed: 2,
  invoicesRetained: 12,
  emailHashes: ["...", "..."],
}
```

### PII rule in audit rows

Audit rows persist longer than `Parent` rows. They MUST NOT contain re-identifiable PII that would defeat deletion.

- **Email** → `sha256(email).slice(0, 16)` in `diff.emailHash`. Never raw.
- **Phone** → never in diff.
- **Names** → only in `before`/`after` for `parent.update`. Redacted by the 90-day cron below.
- **Notes** → hashed: `before: sha256(oldNotes), after: sha256(newNotes)`. Content never stored verbatim in audit.

### `emailHash` helper

New addition to `src/lib/audit.ts`:

```ts
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

export function emailHash(email: string): string {
  return createHmac("sha256", env.AUDIT_EMAIL_HMAC_SECRET)
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}
```

New required env var `AUDIT_EMAIL_HMAC_SECRET` (32+ chars). Set on Vercel before Phase A ships. Never rotated (rotation invalidates audit search continuity).

### Daily `audit-redact` cron — two responsibilities

New `src/app/api/cron/audit-redact/route.ts`, daily. Does two unrelated-but-cheap-to-colocate jobs:

```ts
// Job 1 — PII redaction at 90 days.
// For every AuditLog row where:
//   action IN parent.update | parent.create | parent.claim
//   AND createdAt < now() - 90 days
//   AND diff contains a `before`/`after` with raw PII fields
// → overwrite the PII fields with "[redacted-by-policy]"
// while preserving action, actor, target, timestamp, emailHash.

// Job 2 — Stale deletion-request token cleanup.
// For every Parent where:
//   pendingDeletionToken IS NOT NULL
//   AND pendingDeletionRequestedAt < now() - 7 days
// → clear token + requestedAt + requestedBy
// → write one `parent.delete_request_expired` audit row per cleared parent.
```

Single Vercel-cron entry, two queries, both idempotent.

Financial events (`payment.record`, `refund.create`, `invoice.*`) follow the Section-5 retention basis — kept indefinitely with `emailHash` only, never raw.

### Cross-tenant fan-out for `parent.delete_complete`

- **One `parent.delete_complete` row with `tenantId: null`** — the global event. Visible only to platform-staff at platform-level `/admin/audit`.
- **Plus one `tenant_parent.revoke` row per affected tenant** with `diff: { reason: "global_delete", parentDeletionAuditId: <id> }`. Visible at each tenant's `/admin/audit`.

Requires `AuditLog.tenantId` made nullable (Section 1 modification, applied in Phase A).

### `/admin/audit` UI patches (tenant-level)

`src/components/admin/AuditRow.tsx` extended in three small ways:

1. **Action label map** — human-readable labels for every new action ("Added parent contact", "Parent claimed their account", "Merged duplicate parents", etc.).
2. **Target rendering** — when `targetType === "parent"` or `"tenant_parent"`, render `targetId` as `<Link>` to `/coach/parents/[parentId]`. Anonymized parents resolve to a stub page.
3. **Diff rendering** — recognize the three payload shapes and render Shape A as a side-by-side diff table, Shape B as a definition list, Shape C as a one-line summary.

Filtering: add "Parent activity" as a collapsed group filter (covers all `parent.*` and `tenant_parent.*`). Add a parent-name search box that resolves to `targetId`s via a small server-action lookup, then scopes existing filters.

### Platform-level audit view

New `/admin/audit-global` (platform-staff only, gated by `isPortalAllowed(role, "platform_admin")`). Lists rows with `tenantId IS NULL` (primarily `parent.delete_complete`). Reuses every component from the tenant-level page. ~40 LOC.

### Backfill for existing audit rows

One-shot `scripts/redact-audit-history.ts` runs at Phase C cutover. Walks every existing `AuditLog` row whose `diff` contains `email`, `parentEmail`, or `payerEmail` literally; hashes via the new `emailHash` helper; rewrites the row. Idempotent. Writes one `data.audit_backfill` summary row.

### Tests

Unit (vitest):
- `logAudit` accepts every new action string (TypeScript-union test + one runtime shape check).
- `emailHash` is deterministic for the same input; requires the HMAC secret.
- 90-day redaction cron: row younger than 90 days untouched; older row redacts PII fields, preserves action/actor/timestamp/emailHash.
- `parent.delete_complete` writes one global row + N tenant-scoped revoke rows in one transaction.

Component:
- `AuditRow` renders correct label for each new action.
- Each payload shape renders correctly; redacted rows render `[redacted-by-policy]` without breaking layout.

---

## Verification — End-to-End Manual Smoke

After Phase C ships with flag `"true"` on the demo tenant, walk these:

1. Public booking with brand-new email → Parent + TenantParent created; no Membership; `/admin/team` does NOT show the parent.
2. Same email books at second tenant → existing Parent reused; new TenantParent added.
3. Confirmation email's "Claim your account" CTA → `/claim/[token]` → magic link → lands on `/t/<slug>/family/home`.
4. Sign in at tenant A; visit `/t/<other-slug>/family/home` → works without re-claim (cross-tenant continuity).
5. Coach edits parent on `/coach/parents/[id]` → email change → audit row `parent.update` with before/after; raw values present in diff (will redact after 90 days).
6. Coach merges two parents → kids move, audit `parent.merge`.
7. Coach revokes access → `/family/*` 403 for that parent at this tenant only; other tenants unaffected.
8. Coach requests global delete → parent receives Resend email → clicks link → types email to confirm → pipeline runs → Parent anonymized, all TenantParents revoked, Players anonymized, invoice payerEmails hashed.
9. Same email re-books after deletion → brand-new Parent created (no resurrection).
10. `/admin/audit` shows the new actions with readable labels and properly rendered diff shapes.

---

## Out of Scope (Explicit)

- Parent-side data export (GDPR Art. 15) — own spec.
- Platform-staff `/admin/parents/[id]/force-delete` route — own spec (depends on platform-staff portal).
- Tenant-level bulk parents CSV export — trivial follow-up; add to existing `/admin/exports` route map.
- Replacing tenant-scoped data isolation with a multi-tenant inbox UI for parents — natural follow-up enabled by this spec, but its own product slice.
- Stripe Customer-record deletion at parent-delete time — explicit design choice (Section 5). Could revisit if legal posture changes.
- Removing `PARENT` and `PLAYER` from the `Role` enum before Phase D — staying in the enum during Phases A/B/C is required for legacy row deserialization.

---

## Required Env Vars

| Var | Phase | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PARENT_MODEL_V2` | C | `false` / `shadow` / `true` flag |
| `AUDIT_EMAIL_HMAC_SECRET` | A | HMAC key for `emailHash` |

Both set on Vercel before the corresponding phase ships.

---

## Estimated Effort

- Phase A: 0.5 day (schema + verification)
- Phase B: 1 day (backfill script + sanity gates + Neon-branch run)
- Phase C: 4–6 days (code cutover, all callsites, claim flow, tests)
- Section 4 UI: 3–4 days (list + detail + modals)
- Section 5 pipeline: 2 days (with tests)
- Section 6 audit: 1 day (helpers, redact cron, UI patches)
- Phase D: 1 day (cleanup, no behavior change)
- Buffer: 2 days

**Total: 14–17 working days.** First parent-claim flow can be live and demoable within 6 days of starting Phase C.
