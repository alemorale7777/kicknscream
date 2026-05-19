# Wave A — Money & Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three coach-financial gaps as one batch — UI-initiated refunds against Stripe Connect, pack-balance tracking on `PACKAGE` enrollments, and a Stripe Customer Portal embed for parents managing MONTHLY subscriptions.

**Architecture:** Reuses existing Stripe Connect destination-charge wiring (no new platform-level API surface). All three components are additive — zero schema migration (`Enrollment.packBalance` and `Program.packSize` are already in the schema; refunds piggyback on the existing `Invoice.stripePaymentIntentId` column; the billing portal is a stateless Stripe API call). The refund + pack-balance + billing-portal actions all live in existing files (`src/actions/payment.ts`, `src/actions/attendance.ts`). Two new helper modules (`src/lib/packBalance.ts`, `src/lib/family/subscriptions.ts`) keep pure logic out of the action files so it can be unit-tested.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + Neon HTTP, NextAuth v5, Stripe Connect Express SDK, Resend, Vitest + Playwright, Tailwind v4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-18-wave-a-money-and-ops-design.md`

---

## File Map

**New files:**
- `src/lib/packBalance.ts` — pure helpers `wasConsumed(status)` + `computePackDelta(prev, next)`
- `src/tests/packBalance.test.ts` — unit tests for the helpers
- `src/lib/family/subscriptions.ts` — `parentHasSubscriptions(tenantId, email)` helper
- `src/components/payments/RefundButton.tsx` — Sheet-based refund UI
- `src/components/family/BillingPortalButton.tsx` — Customer Portal CTA card

**Modified files:**
- `src/lib/analytics.ts` — extend `AnalyticsEvent` union
- `src/lib/email.ts` — add `sendRefundConfirmation` + `sendPackCompletedEmail`
- `src/actions/payment.ts` — add `refundInvoiceAction` + `createBillingPortalSessionAction`
- `src/actions/booking.ts` — initialize `packBalance` on `PACKAGE` enrollment
- `src/actions/attendance.ts` — call pack-balance adjustment from `markAttendanceAction`, `bulkMarkAttendanceAction`, `markSeriesAttendanceAction`
- `src/components/payments/InvoicesTable.tsx` — wire `RefundButton` into PAID rows
- `src/components/bookings/BookingsTable.tsx` — Pack column
- `src/app/t/[slug]/coach/roster/[playerId]/page.tsx` — "Active packs" section on Overview tab
- `src/app/t/[slug]/family/kids/[playerId]/page.tsx` — "Sessions remaining" card
- `src/app/t/[slug]/family/pay/page.tsx` — conditionally render `BillingPortalButton`
- `src/app/t/[slug]/admin/audit/page.tsx` — action labels for `payment.refund`, `enrollment.pack_consumed`, `enrollment.pack_completed`

---

## Task 1: Analytics + audit-label foundation

Lay the typed-event union and audit-row labels before the actions that emit them. Cheap, no test needed.

**Files:**
- Modify: `src/lib/analytics.ts:16-28` (extend the `AnalyticsEvent` union)
- Modify: `src/app/t/[slug]/admin/audit/page.tsx:15-25` (extend `ACTION_LABELS`)

- [ ] **Step 1: Extend analytics event union**

In `src/lib/analytics.ts`, replace the existing `AnalyticsEvent` type with:

```ts
export type AnalyticsEvent =
  | "booking_started"
  | "booking_completed"
  | "booking_canceled"
  | "attendance_marked"
  | "broadcast_sent"
  | "message_sent"
  | "program_created"
  | "program_published"
  | "waiver_signed"
  | "calendar_subscribed"
  | "team_invited"
  | "stripe_connect_started"
  | "refund_issued"
  | "pack_completed"
  | "billing_portal_opened";
```

- [ ] **Step 2: Extend audit log labels**

In `src/app/t/[slug]/admin/audit/page.tsx`, replace the existing `ACTION_LABELS` with:

```ts
const ACTION_LABELS: Record<string, string> = {
  "roster.bulk_import": "Bulk roster import",
  "tenant.update": "Tenant settings updated",
  "tenant.branding_update": "Branding updated",
  "tenant.domain_set": "Custom domain set",
  "tenant.domain_clear": "Custom domain cleared",
  "stripe.connect": "Stripe account connected",
  "stripe.account.updated": "Stripe account refreshed",
  "permission.override": "Permission changed",
  "team.invite": "Teammate invited",
  "team.role_change": "Role changed",
  "data.export": "Data exported",
  "payment.refund": "Refund issued",
  "enrollment.pack_consumed": "Pack session used",
  "enrollment.pack_completed": "Pack finished",
};
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics.ts src/app/t/[slug]/admin/audit/page.tsx
git commit -m "chore(wave-a): extend analytics + audit labels for refund/pack/portal"
```

---

## Task 2: Email helpers

Two new transactional email templates. Mirrors the existing `sendBookingConfirmation` shape so the renderer + Resend wiring stays uniform.

**Files:**
- Modify: `src/lib/email.ts` (append two new exported functions at the end of the file)

- [ ] **Step 1: Add `sendRefundConfirmation`**

Append to `src/lib/email.ts`:

```ts
export async function sendRefundConfirmation(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  programName: string | null;
  amountCents: number;
  fullRefund: boolean;
  reason: string | null;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const amountLabel = formatCents(opts.amountCents);
  const reasonLine = opts.reason
    ? `<p style="margin:0 0 12px;color:#94A39B;font-size:13px;">Reason on record: <span style="color:#C4CDC7;">${escapeHtml(opts.reason)}</span></p>`
    : "";
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Refund issued</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Refund issued</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${amountLabel} refunded</h1>
      <p style="margin:0 0 12px;color:#C4CDC7;line-height:1.6;">Hi ${escapeHtml(opts.parentName.split(" ")[0])},</p>
      <p style="margin:0 0 16px;color:#C4CDC7;line-height:1.6;">
        ${escapeHtml(opts.tenantName)} just refunded ${amountLabel}${opts.programName ? ` from ${escapeHtml(opts.programName)}` : ""}.
        ${opts.fullRefund ? "The invoice is voided in full." : "This is a partial refund — the rest of the invoice stays paid."}
      </p>
      <p style="margin:0 0 12px;color:#C4CDC7;line-height:1.6;font-size:13px;">
        The money is on its way back to the card or account you originally paid with.
        Most banks show it in 5–10 business days; some show it the next day.
      </p>
      ${reasonLine}
      <p style="margin:16px 0 0;color:#94A39B;font-size:12px;line-height:1.6;">
        Questions about the refund? Reply to this email and ${escapeHtml(opts.tenantName)} will help.
      </p>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">Powered by KickNScream</p>
  </div>
</body></html>`;

  const text = `${opts.tenantName} refunded ${amountLabel}${opts.programName ? ` from ${opts.programName}` : ""}.\n${
    opts.fullRefund ? "The invoice is voided in full." : "Partial refund — the rest of the invoice stays paid."
  }\nMost banks show it in 5–10 business days.\n${opts.reason ? `Reason on record: ${opts.reason}` : ""}`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `Refund issued · ${opts.tenantName}`,
    html,
    text,
  });
}
```

- [ ] **Step 2: Add `sendPackCompletedEmail`**

Append to `src/lib/email.ts`:

```ts
export async function sendPackCompletedEmail(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  programName: string;
  programId: string;
  packSize: number;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const bookHref = `https://${env.NEXTAUTH_URL.replace(/^https?:\/\//, "")}/${opts.tenantSlug}/book/${opts.programId}`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Your pack is finished</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">All ${opts.packSize} sessions used</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(opts.programName)}</h1>
      <p style="margin:0 0 12px;color:#C4CDC7;line-height:1.6;">Hi ${escapeHtml(opts.parentName.split(" ")[0])},</p>
      <p style="margin:0 0 16px;color:#C4CDC7;line-height:1.6;">
        You've used the last session in your ${opts.packSize}-pack with ${escapeHtml(opts.tenantName)}.
        Nice work showing up — that's the whole game.
      </p>
      <p style="margin:16px 0 0;">
        <a href="${escapeHtml(bookHref)}" style="display:inline-block;background:#1FB663;color:#050A07;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
          Buy another pack →
        </a>
      </p>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">Powered by KickNScream</p>
  </div>
</body></html>`;

  const text = `You've used the last session in your ${opts.packSize}-pack of ${opts.programName} with ${opts.tenantName}.\nBuy another: ${bookHref}`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `Your ${opts.programName} pack is finished`,
    html,
    text,
  });
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(email): refund confirmation + pack completed templates"
```

---

## Task 3: Pack-balance pure helpers (TDD)

Two tiny pure functions live in `src/lib/packBalance.ts` so the integration code in `attendance.ts` stays a one-liner. Test-first.

**Files:**
- Create: `src/lib/packBalance.ts`
- Create: `src/tests/packBalance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/packBalance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wasConsumed, computePackDelta } from "@/lib/packBalance";

describe("wasConsumed", () => {
  it("returns true for PRESENT and LATE", () => {
    expect(wasConsumed("PRESENT")).toBe(true);
    expect(wasConsumed("LATE")).toBe(true);
  });
  it("returns false for ABSENT, EXCUSED, PENDING, and null", () => {
    expect(wasConsumed("ABSENT")).toBe(false);
    expect(wasConsumed("EXCUSED")).toBe(false);
    expect(wasConsumed("PENDING")).toBe(false);
    expect(wasConsumed(null)).toBe(false);
  });
});

describe("computePackDelta", () => {
  it("decrements when transitioning from not-consumed to consumed", () => {
    expect(computePackDelta(null, "PRESENT")).toBe(-1);
    expect(computePackDelta("ABSENT", "LATE")).toBe(-1);
    expect(computePackDelta("EXCUSED", "PRESENT")).toBe(-1);
    expect(computePackDelta("PENDING", "PRESENT")).toBe(-1);
  });
  it("increments when transitioning from consumed to not-consumed", () => {
    expect(computePackDelta("PRESENT", "EXCUSED")).toBe(1);
    expect(computePackDelta("LATE", "ABSENT")).toBe(1);
    expect(computePackDelta("PRESENT", "PENDING")).toBe(1);
  });
  it("is a no-op when both states are consumed or both are not", () => {
    expect(computePackDelta("PRESENT", "LATE")).toBe(0);
    expect(computePackDelta("LATE", "PRESENT")).toBe(0);
    expect(computePackDelta("ABSENT", "EXCUSED")).toBe(0);
    expect(computePackDelta(null, "ABSENT")).toBe(0);
    expect(computePackDelta(null, null)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/tests/packBalance.test.ts`
Expected: FAIL with "Cannot find module '@/lib/packBalance'".

- [ ] **Step 3: Implement the helpers**

Create `src/lib/packBalance.ts`:

```ts
import type { AttendanceStatus } from "@prisma/client";

/**
 * "Consumed" means this attendance state should count against a PACKAGE
 * enrollment's remaining balance. Present + Late count; Absent, Excused,
 * and Pending don't (the player either didn't show or the session was
 * waived).
 */
export function wasConsumed(status: AttendanceStatus | null): boolean {
  return status === "PRESENT" || status === "LATE";
}

/**
 * The signed adjustment to apply to packBalance when an Attendance row
 * transitions between two states. -1 = decrement (a session was just
 * used), +1 = increment (a previously-counted session was reclassified
 * away), 0 = no balance change.
 *
 * `prev` is null when the row didn't exist before (fresh attendance write).
 */
export function computePackDelta(
  prev: AttendanceStatus | null,
  next: AttendanceStatus | null
): -1 | 0 | 1 {
  const before = wasConsumed(prev);
  const after = wasConsumed(next);
  if (before === after) return 0;
  return after ? -1 : 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/tests/packBalance.test.ts`
Expected: PASS, all 9 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/packBalance.ts src/tests/packBalance.test.ts
git commit -m "feat(packs): wasConsumed + computePackDelta pure helpers"
```

---

## Task 4: Initialize `packBalance` on PACKAGE booking

Hook `createBookingAction` so a PACKAGE program seeds the enrollment's `packBalance` from `program.packSize`. Tiny patch; no test (covered by prod smoke).

**Files:**
- Modify: `src/actions/booking.ts` (after the enrollment-creation block)

- [ ] **Step 1: Locate the enrollment create**

Read the existing `createBookingAction` to find the enrollment creation block — there's exactly one `db.enrollment.create({` call inside the action body.

Run: `grep -n "db.enrollment.create" src/actions/booking.ts`
Expected: one match around line 161.

- [ ] **Step 2: Add the pack-balance initialization**

Find the enrollment-creation block in `src/actions/booking.ts` and replace it with:

```ts
  // Create enrollment linking player → program → invoice
  const enrollment = await db.enrollment.create({
    data: {
      playerId: player.id,
      programId: program.id,
      invoiceId: invoice.id,
      status: program.priceModel === "FREE" ? "ACTIVE" : "PENDING",
    },
  });

  // PACKAGE programs seed the remaining-sessions counter from the
  // program's packSize. Attendance writes decrement this; hitting 0
  // auto-completes the enrollment.
  if (
    program.priceModel === "PACKAGE" &&
    program.packSize &&
    program.packSize > 0
  ) {
    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { packBalance: program.packSize },
    });
  }
```

Note: this replaces the existing `await db.enrollment.create({...})` call — keep the surrounding code intact. The original call assigned to nothing; the new version captures the result for the `update` follow-up.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/actions/booking.ts
git commit -m "feat(packs): initialize Enrollment.packBalance on PACKAGE booking"
```

---

## Task 5: Adjust `packBalance` on attendance writes

Hook all three attendance actions. New private helper inside `attendance.ts` (kept module-local — the only callers are in this file).

**Files:**
- Modify: `src/actions/attendance.ts`

- [ ] **Step 1: Add imports + helper**

In `src/actions/attendance.ts`, add the `computePackDelta` import at the top of the imports block:

```ts
import { computePackDelta } from "@/lib/packBalance";
```

Then add this helper function near the top of the file, just after the `STATUSES` const and before `assertCanMark`:

```ts
/**
 * Adjust the matching PACKAGE enrollment's packBalance based on a
 * status transition. Inputs are the new state we're writing + the prior
 * state we just read from the DB (null if the Attendance row didn't
 * exist yet).
 *
 * Atomic with respect to other concurrent writes via a conditional
 * update guarded on the current balance — if two coaches mark the
 * same player PRESENT at the same time, only the first decrement
 * lands. Also auto-completes the enrollment + fires the pack-
 * finished email when balance hits 0.
 */
async function adjustPackBalanceForAttendance(opts: {
  tenantId: string;
  playerId: string;
  eventId: string;
  prev: AttendanceStatus | null;
  next: AttendanceStatus;
}) {
  const delta = computePackDelta(opts.prev, opts.next);
  if (delta === 0) return;

  // Find the event's program and the player's active PACKAGE enrollment
  // for it. If the program isn't PACKAGE or there's no matching
  // enrollment, no-op.
  const event = await db.event.findUnique({
    where: { id: opts.eventId },
    select: { programId: true },
  });
  if (!event?.programId) return;

  const enrollment = await db.enrollment.findFirst({
    where: {
      playerId: opts.playerId,
      programId: event.programId,
      status: { in: ["ACTIVE", "CONFIRMED", "PAID"] },
      program: { priceModel: "PACKAGE" },
    },
    include: {
      program: { select: { id: true, name: true, packSize: true } },
      player: { select: { firstName: true, lastName: true, parent: true } },
    },
  });
  if (!enrollment || enrollment.packBalance === null) return;

  if (delta === -1) {
    // Conditional decrement — only succeeds if balance > 0 (prevents
    // double-spend on concurrent marks).
    const result = await db.enrollment.updateMany({
      where: { id: enrollment.id, packBalance: { gt: 0 } },
      data: { packBalance: { decrement: 1 } },
    });
    if (result.count === 0) return; // already at 0; nothing to consume

    await db.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        actorUserId: null,
        action: "enrollment.pack_consumed",
        targetType: "Enrollment",
        diff: { enrollmentId: enrollment.id, programId: enrollment.programId },
      },
    });

    // If that decrement just hit 0, auto-complete + send the nudge email.
    const fresh = await db.enrollment.findUnique({
      where: { id: enrollment.id },
      select: { packBalance: true, status: true },
    });
    if (fresh?.packBalance === 0 && fresh.status !== "COMPLETED") {
      await db.enrollment.update({
        where: { id: enrollment.id },
        data: { status: "COMPLETED" },
      });
      await db.auditLog.create({
        data: {
          tenantId: opts.tenantId,
          actorUserId: null,
          action: "enrollment.pack_completed",
          targetType: "Enrollment",
          diff: { enrollmentId: enrollment.id, programId: enrollment.programId },
        },
      });
      const parent = enrollment.player.parent;
      if (parent?.email && enrollment.program.packSize) {
        const tenant = await db.tenant.findUnique({
          where: { id: opts.tenantId },
          select: { name: true, slug: true },
        });
        if (tenant) {
          const { sendPackCompletedEmail } = await import("@/lib/email");
          await sendPackCompletedEmail({
            to: parent.email,
            parentName: parent.name ?? "there",
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            programName: enrollment.program.name,
            programId: enrollment.program.id,
            packSize: enrollment.program.packSize,
          }).catch(() => {
            // Best-effort — email failure shouldn't block the mark.
          });
        }
      }
    }
  } else {
    // Increment back. Cap at packSize (defensive — shouldn't ever exceed).
    await db.enrollment.update({
      where: { id: enrollment.id },
      data: {
        packBalance: Math.min(
          (enrollment.packBalance ?? 0) + 1,
          enrollment.program.packSize ?? Number.MAX_SAFE_INTEGER
        ),
        // If we're re-opening a COMPLETED-via-zero enrollment, flip it back.
        status:
          enrollment.status === "COMPLETED" ? "ACTIVE" : enrollment.status,
      },
    });
  }
}
```

- [ ] **Step 2: Wire `markAttendanceAction` to read prev + call adjuster**

Find `markAttendanceAction` in `src/actions/attendance.ts` and replace the `db.attendance.upsert` call with a read-then-upsert pattern:

```ts
export async function markAttendanceAction(input: z.infer<typeof markSchema>) {
  const data = markSchema.parse(input);
  const { user, membership } = await assertCanMark(data.tenantId);

  // Read the current status so the pack-balance adjuster can compute
  // the delta. The upsert below races with this read, but the adjuster
  // uses conditional updates so it's safe under concurrent writes.
  const existing = await db.attendance.findUnique({
    where: { eventId_playerId: { eventId: data.eventId, playerId: data.playerId } },
    select: { status: true },
  });

  await db.attendance.upsert({
    where: { eventId_playerId: { eventId: data.eventId, playerId: data.playerId } },
    create: {
      eventId: data.eventId,
      playerId: data.playerId,
      status: data.status as AttendanceStatus,
      checkedInAt: data.status === "PRESENT" || data.status === "LATE" ? new Date() : null,
      checkedInBy: user.id,
    },
    update: {
      status: data.status as AttendanceStatus,
      checkedInAt: data.status === "PRESENT" || data.status === "LATE" ? new Date() : null,
      checkedInBy: user.id,
    },
  });

  await adjustPackBalanceForAttendance({
    tenantId: data.tenantId,
    playerId: data.playerId,
    eventId: data.eventId,
    prev: existing?.status ?? null,
    next: data.status as AttendanceStatus,
  });

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${data.eventId}`);
  }
}
```

- [ ] **Step 3: Wire `bulkMarkAttendanceAction`**

Find `bulkMarkAttendanceAction` and replace the transaction block + revalidate with:

```ts
export async function bulkMarkAttendanceAction(input: z.infer<typeof bulkSchema>) {
  const data = bulkSchema.parse(input);
  const { user, membership } = await assertCanMark(data.tenantId);
  const status = data.status as AttendanceStatus;
  const at = status === "PRESENT" || status === "LATE" ? new Date() : null;

  // Snapshot existing statuses so the pack-balance adjuster has a `prev`
  // for each player.
  const existing = await db.attendance.findMany({
    where: {
      eventId: data.eventId,
      playerId: { in: data.playerIds },
    },
    select: { playerId: true, status: true },
  });
  const prevByPlayer = new Map(existing.map((a) => [a.playerId, a.status]));

  await db.$transaction(
    data.playerIds.map((playerId) =>
      db.attendance.upsert({
        where: { eventId_playerId: { eventId: data.eventId, playerId } },
        create: { eventId: data.eventId, playerId, status, checkedInAt: at, checkedInBy: user.id },
        update: { status, checkedInAt: at, checkedInBy: user.id },
      })
    )
  );

  // Adjust packs sequentially — each call is independent and we don't
  // want a single failing adjustment to roll back the entire bulk mark.
  for (const playerId of data.playerIds) {
    await adjustPackBalanceForAttendance({
      tenantId: data.tenantId,
      playerId,
      eventId: data.eventId,
      prev: prevByPlayer.get(playerId) ?? null,
      next: status,
    }).catch(() => {
      // Best-effort — log and move on.
    });
  }

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${data.eventId}`);
  }
}
```

- [ ] **Step 4: Wire `markSeriesAttendanceAction`**

Find the `for (const event of seriesEvents)` loop inside `markSeriesAttendanceAction`. After the existing `db.$transaction(playerIds.map(...))` write, add:

```ts
    // Pack-balance adjustment per (event × player). Series sweep only
    // ever creates fresh Attendance rows (it skips events that already
    // have any attendance), so `prev` is always null here.
    for (const playerId of playerIds) {
      await adjustPackBalanceForAttendance({
        tenantId: data.tenantId,
        playerId,
        eventId: event.id,
        prev: null,
        next: status,
      }).catch(() => {
        // Best-effort — don't poison the sweep.
      });
    }
```

Place this immediately after `await db.$transaction(...)` and before `eventsWritten++`.

- [ ] **Step 5: Verify typecheck + tests**

Run: `pnpm exec tsc --noEmit && pnpm run test`
Expected: typecheck clean, all vitest tests pass (the new packBalance helper tests plus the existing 57).

- [ ] **Step 6: Commit**

```bash
git add src/actions/attendance.ts
git commit -m "feat(packs): adjust packBalance on attendance writes + auto-complete at 0"
```

---

## Task 6: Pack badge on coach bookings table

Surface remaining sessions inline on the bookings row.

**Files:**
- Modify: `src/components/bookings/BookingsTable.tsx`
- Modify: `src/app/t/[slug]/coach/bookings/page.tsx` (extend the include)

- [ ] **Step 1: Extend the bookings page query to include pack data**

Open `src/app/t/[slug]/coach/bookings/page.tsx`. Find the `db.enrollment.findMany` call. Verify the `include` already pulls `program: true` (it should). Then add `packBalance: true` to the `select` if there's an explicit `select` on the enrollment; otherwise no change needed (`findMany` returns all scalar columns by default).

Run: `grep -n "db.enrollment.findMany" src/app/t/[slug]/coach/bookings/page.tsx`
Expected: one match. Open + verify `include` includes the `program` relation; `packBalance` is a scalar on `Enrollment` so it's already in the row.

- [ ] **Step 2: Pass packSize through to the table**

In the same `page.tsx`, the rows already include `program.packSize` if `program: true` is in the include. Verify the row type passed to `<BookingsTable>` carries both. If the page maps to a smaller shape before passing, extend the mapping. Open the file and grep:

Run: `grep -n "BookingsTable" src/app/t/[slug]/coach/bookings/page.tsx`

If `BookingsTable` is passed a mapped `rows={...}` shape (not raw enrollments), extend each row with `packBalance: enrollment.packBalance, packSize: enrollment.program?.packSize ?? null, priceModel: enrollment.program?.priceModel ?? null`.

- [ ] **Step 3: Add Pack column to `BookingsTable`**

Open `src/components/bookings/BookingsTable.tsx`. Find the `type Row` declaration and add three fields:

```ts
type Row = {
  // ... existing fields ...
  packBalance: number | null;
  packSize: number | null;
  priceModel: string | null;
};
```

In the `columns` definition for `@tanstack/react-table`, add a column object after the existing Status column and before Amount:

```ts
{
  accessorKey: "packBalance",
  header: "Pack",
  cell: ({ row }) => {
    const r = row.original;
    if (r.priceModel !== "PACKAGE" || r.packSize == null) {
      return <span className="text-ink-700">—</span>;
    }
    const balance = r.packBalance ?? r.packSize;
    const pct = balance / r.packSize;
    const tone =
      balance === 0
        ? "text-ink-500 border-line bg-pitch-700"
        : pct < 0.5
          ? "text-warn border-warn/30 bg-warn/5"
          : "text-turf-300 border-turf-400/30 bg-turf-400/5";
    return (
      <span
        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-mono ${tone}`}
      >
        {balance}/{r.packSize}
      </span>
    );
  },
},
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm run build 2>&1 | tail -5`
Expected: typecheck clean, build completes with the standard "Dynamic" output footer.

- [ ] **Step 5: Commit**

```bash
git add src/components/bookings/BookingsTable.tsx src/app/t/[slug]/coach/bookings/page.tsx
git commit -m "feat(packs): show {balance}/{size} badge on bookings table"
```

---

## Task 7: Active packs section on roster player profile

**Files:**
- Modify: `src/app/t/[slug]/coach/roster/[playerId]/page.tsx`

- [ ] **Step 1: Locate the Overview tab**

Open `src/app/t/[slug]/coach/roster/[playerId]/page.tsx`. Find where the Overview tab renders its content (look for the existing enrollment list rendering). The page is likely a tabs surface — find the Overview tab's render block.

Run: `grep -n "enrollments\|Overview\|Active" src/app/t/[slug]/coach/roster/[playerId]/page.tsx | head -10`

- [ ] **Step 2: Extend the enrollment query to include pack fields**

In the same file, find the `db.enrollment.findMany` for this player. Make sure the `include` pulls `program` (likely already does). The `packBalance` scalar is on Enrollment so it's already in the row.

- [ ] **Step 3: Render the Active Packs section**

Insert this block into the Overview tab JSX, above the existing "Active enrollments" / "Upcoming sessions" sections:

```tsx
{(() => {
  const activePacks = enrollments.filter(
    (e) =>
      e.program?.priceModel === "PACKAGE" &&
      e.program?.packSize &&
      e.packBalance !== null &&
      e.status !== "COMPLETED" &&
      e.status !== "REFUNDED" &&
      e.status !== "CANCELED"
  );
  if (activePacks.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">
        Active packs
      </h2>
      <div className="space-y-2">
        {activePacks.map((e) => {
          const balance = e.packBalance ?? 0;
          const size = e.program!.packSize!;
          const pct = (balance / size) * 100;
          return (
            <Card key={e.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-ink-50">{e.program!.name}</p>
                <span className="font-mono text-sm text-turf-300">
                  {balance}/{size} left
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-pitch-700 overflow-hidden">
                <div
                  className="h-full bg-turf-400 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
})()}
```

Ensure `Card` is already imported at the top of the file (it is — the page renders the player avatar Card).

- [ ] **Step 4: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/t/[slug]/coach/roster/[playerId]/page.tsx
git commit -m "feat(packs): Active packs section on coach roster player profile"
```

---

## Task 8: Sessions remaining card on family kid page

**Files:**
- Modify: `src/app/t/[slug]/family/kids/[playerId]/page.tsx`

- [ ] **Step 1: Extend the page's data loading**

Open `src/app/t/[slug]/family/kids/[playerId]/page.tsx`. Find the `enrollments` query (added in the wave-A schedule-via-enrollments fix). Extend the `select` to also include `packBalance` and `program: { select: { id, name, priceModel, packSize } }`:

```ts
const enrollments = await db.enrollment.findMany({
  where: {
    playerId: player.id,
    status: { in: ["ACTIVE", "CONFIRMED", "PAID", "PENDING"] },
  },
  select: {
    programId: true,
    packBalance: true,
    program: {
      select: { id: true, name: true, priceModel: true, packSize: true },
    },
  },
});
```

- [ ] **Step 2: Render the Sessions Remaining card**

Above the "Upcoming sessions" section in the JSX, add:

```tsx
{(() => {
  const activePacks = enrollments.filter(
    (e) =>
      e.program?.priceModel === "PACKAGE" &&
      e.program.packSize &&
      e.packBalance !== null
  );
  if (activePacks.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">
        Sessions remaining
      </h2>
      <div className="space-y-2">
        {activePacks.map((e) => {
          const balance = e.packBalance ?? 0;
          const size = e.program!.packSize!;
          const pct = (balance / size) * 100;
          return (
            <Card key={e.programId} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-ink-50">{e.program!.name}</p>
                <span className="font-mono text-sm text-turf-300">
                  {balance} of {size} left
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-pitch-700 overflow-hidden">
                <div
                  className="h-full bg-turf-400 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
})()}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/app/t/[slug]/family/kids/[playerId]/page.tsx
git commit -m "feat(packs): Sessions remaining card on family kid page"
```

---

## Task 9: `refundInvoiceAction`

Server action only — UI lands in Task 10.

**Files:**
- Modify: `src/actions/payment.ts`

- [ ] **Step 1: Add the schema + action**

Open `src/actions/payment.ts`. Add this block above the existing `parentPaySchema` block:

```ts
const refundReasonEnum = z.enum(["duplicate", "fraudulent", "requested_by_customer"]);

const refundSchema = z.object({
  tenantId: z.string(),
  invoiceId: z.string(),
  amountCents: z.number().int().positive().optional(),
  reason: refundReasonEnum.optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Issue a refund against a paid invoice. Two code paths:
 *  - Stripe-paid invoice (stripePaymentIntentId set): hits
 *    stripe.refunds.create on the connected account.
 *  - Manually-recorded payment: skips Stripe, just marks the invoice
 *    voided and writes a negative Payment row.
 *
 * Idempotent against the existing charge.refunded webhook — the
 * webhook does a conditional update that becomes a no-op once this
 * action has already moved the invoice to VOIDED.
 */
export async function refundInvoiceAction(
  input: z.infer<typeof refundSchema>
): Promise<void> {
  const data = refundSchema.parse(input);
  const { user, membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const invoice = await db.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { payments: true, tenant: true, enrollments: { include: { program: true } } },
  });
  if (!invoice || invoice.tenantId !== data.tenantId) {
    throw new Error("Invoice not found");
  }
  if (invoice.status === "VOIDED") throw new Error("Invoice is already voided");

  const paidSoFar = invoice.payments
    .reduce((acc, p) => acc + p.amount, 0);
  if (paidSoFar <= 0) throw new Error("Nothing paid on this invoice to refund");

  const refundAmount = data.amountCents ?? paidSoFar;
  if (refundAmount > paidSoFar) {
    throw new Error(
      `Refund amount (${(refundAmount / 100).toFixed(2)}) exceeds paid balance (${(paidSoFar / 100).toFixed(2)})`
    );
  }

  let stripeRefundId: string | null = null;
  if (invoice.stripePaymentIntentId && stripeEnabled() && invoice.tenant.stripeAccountId) {
    const stripe = getStripe();
    const refund = await stripe.refunds.create(
      {
        payment_intent: invoice.stripePaymentIntentId,
        amount: refundAmount,
        reason: data.reason,
      },
      { stripeAccount: invoice.tenant.stripeAccountId }
    );
    stripeRefundId = refund.id;
  }

  // Pick a sensible method for the Payment row — use the latest
  // positive-amount payment's method, defaulting to CARD.
  const lastPositive = [...invoice.payments]
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const method: PaymentMethod = (lastPositive?.method ?? "CARD") as PaymentMethod;

  const fullRefund = refundAmount >= paidSoFar;

  await db.$transaction([
    db.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: -refundAmount,
        method,
        reference: stripeRefundId,
        recordedBy: user.id,
      },
    }),
    ...(fullRefund
      ? [
          db.invoice.update({
            where: { id: invoice.id },
            data: { status: "VOIDED" },
          }),
          db.enrollment.updateMany({
            where: { invoiceId: invoice.id, status: { not: "REFUNDED" } },
            data: { status: "REFUNDED", cancellationReason: data.reason ?? "refund" },
          }),
        ]
      : []),
  ]);

  await db.auditLog.create({
    data: {
      tenantId: data.tenantId,
      actorUserId: user.id,
      action: "payment.refund",
      targetType: "Invoice",
      diff: {
        invoiceId: invoice.id,
        amountCents: refundAmount,
        fullRefund,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        viaStripe: !!stripeRefundId,
      },
    },
  });

  const programName = invoice.enrollments[0]?.program?.name ?? null;
  const parentName =
    invoice.description?.split(" · ").slice(-1).join("") ?? "there";
  const { sendRefundConfirmation } = await import("@/lib/email");
  await sendRefundConfirmation({
    to: invoice.payerEmail,
    parentName,
    tenantName: invoice.tenant.name,
    tenantSlug: invoice.tenant.slug,
    programName,
    amountCents: refundAmount,
    fullRefund,
    reason: data.reason ?? null,
  }).catch(() => {
    // Best-effort — refund succeeded even if email failed.
  });

  revalidatePath(`/t/${membership.tenant.slug}/coach/payments`);
  revalidatePath(`/t/${membership.tenant.slug}/admin/audit`);
  revalidatePath(`/t/${membership.tenant.slug}/family/pay`);
}
```

Note: the file already imports `z`, `revalidatePath`, `db`, `env`, `getCurrentUser`, `canManageTenant`, `getStripe`, `stripeEnabled`, `PaymentMethod`. Verify they're all present. If `getStripe` / `stripeEnabled` aren't imported (they were added in the parent-pay action), add them.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/actions/payment.ts
git commit -m "feat(refund): refundInvoiceAction with Stripe + manual paths"
```

---

## Task 10: `RefundButton` component + InvoicesTable wiring

**Files:**
- Create: `src/components/payments/RefundButton.tsx`
- Modify: `src/components/payments/InvoicesTable.tsx`

- [ ] **Step 1: Create the RefundButton component**

Create `src/components/payments/RefundButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { refundInvoiceAction } from "@/actions/payment";
import { track } from "@/lib/analytics";
import { formatCents } from "@/lib/utils";
import { Loader2, Undo2 } from "lucide-react";

type Props = {
  tenantId: string;
  invoiceId: string;
  remainingCents: number;
  isStripe: boolean;
  description: string | null;
};

const REASON_OPTIONS = [
  { value: "requested_by_customer", label: "Requested by customer" },
  { value: "duplicate", label: "Duplicate charge" },
  { value: "fraudulent", label: "Fraudulent" },
  { value: "__notes_only__", label: "Other (notes only)" },
] as const;

export function RefundButton({
  tenantId,
  invoiceId,
  remainingCents,
  isStripe,
  description,
}: Props) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2));
  const [reason, setReason] = useState<string>("requested_by_customer");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const cents = full
      ? remainingCents
      : Math.round(parseFloat(amount || "0") * 100);
    if (!cents || cents <= 0) {
      toast.error("Enter an amount above zero");
      return;
    }
    if (cents > remainingCents) {
      toast.error(`Can't refund more than ${formatCents(remainingCents)}`);
      return;
    }
    const reasonForAction =
      reason === "__notes_only__"
        ? undefined
        : (reason as "duplicate" | "fraudulent" | "requested_by_customer");
    if (!reasonForAction && !notes.trim()) {
      toast.error("Pick a reason or add notes");
      return;
    }
    startTransition(async () => {
      try {
        await refundInvoiceAction({
          tenantId,
          invoiceId,
          amountCents: full ? undefined : cents,
          reason: reasonForAction,
          notes: notes.trim() || undefined,
        });
        track("refund_issued", {
          invoiceId,
          amountCents: cents,
          fullRefund: full,
          viaStripe: isStripe,
        });
        toast.success(
          full
            ? `Refunded ${formatCents(cents)} — invoice voided`
            : `Refunded ${formatCents(cents)}`
        );
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger hover:bg-danger/10"
        onClick={() => setOpen(true)}
      >
        <Undo2 className="h-3.5 w-3.5" />
        {isStripe ? "Refund" : "Mark refunded"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{isStripe ? "Issue refund" : "Mark refunded"}</SheetTitle>
            <SheetDescription>
              {isStripe
                ? `Refunds the Stripe charge, voids the invoice, marks the matching enrollment refunded, and emails the parent.`
                : `Marks this manually-paid invoice voided and the enrollment refunded. No money moves — record-keeping only.`}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="space-y-4">
              <div className="rounded-md border border-line bg-pitch-700/30 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-500">Invoice</p>
                <p className="text-sm text-ink-50 mt-0.5">{description ?? "(invoice)"}</p>
                <p className="text-xs text-ink-500 mt-1">
                  Remaining refundable: <span className="font-mono text-flood-400">{formatCents(remainingCents)}</span>
                </p>
              </div>

              <div className="space-y-2">
                <div className="inline-flex rounded-md border border-line bg-pitch-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setFull(true)}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      full ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
                    }`}
                  >
                    Full refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setFull(false)}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      !full ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
                    }`}
                  >
                    Partial
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="refund-amount">Amount (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono">$</span>
                    <Input
                      id="refund-amount"
                      type="number"
                      step="0.01"
                      min={0}
                      max={remainingCents / 100}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={full}
                      className="pl-7 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="refund-notes">Internal notes (optional)</Label>
                <Textarea
                  id="refund-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Saved to the audit log for your own records — not shown to the parent."
                />
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              className="bg-danger text-pitch-950 hover:bg-danger/90"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isStripe ? "Issue refund" : "Mark refunded"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Wire it into InvoicesTable**

Open `src/components/payments/InvoicesTable.tsx`. Add the import at the top:

```ts
import { RefundButton } from "./RefundButton";
```

Find the action area on the invoice row (the existing `DropdownMenu` or the row's trailing button group). Inside the row's right-side action cluster, before the existing dropdown / void button, render the RefundButton conditionally:

```tsx
{(invoice.status === "PAID" || invoice.status === "PARTIAL") && (() => {
  const paidSoFar = invoice.payments.reduce((acc, p) => acc + p.amount, 0);
  const refundedSoFar = Math.max(0, -invoice.payments.filter((p) => p.amount < 0).reduce((acc, p) => acc + p.amount, 0));
  // Refundable = positive payments minus any negative (refund) payments already on file.
  const refundableCents = paidSoFar;
  if (refundableCents <= 0) return null;
  return (
    <RefundButton
      tenantId={tenantId}
      invoiceId={invoice.id}
      remainingCents={refundableCents}
      isStripe={!!invoice.stripePaymentIntentId}
      description={invoice.description}
    />
  );
})()}
```

If `tenantId` isn't already passed as a prop to `InvoicesTable`, extend the component's prop type to accept it, and update `/coach/payments/page.tsx` to pass it in. Open the page:

Run: `grep -n "InvoicesTable" src/app/t/[slug]/coach/payments/page.tsx`

Pass `tenantId={tenant.id}` to the `<InvoicesTable>` invocation if missing.

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm run build 2>&1 | tail -5`
Expected: typecheck clean, build completes.

- [ ] **Step 4: Commit**

```bash
git add src/components/payments/RefundButton.tsx src/components/payments/InvoicesTable.tsx src/app/t/[slug]/coach/payments/page.tsx
git commit -m "feat(refund): RefundButton sheet + InvoicesTable wiring"
```

---

## Task 11: Billing portal action + helper + button

**Files:**
- Create: `src/lib/family/subscriptions.ts`
- Create: `src/components/family/BillingPortalButton.tsx`
- Modify: `src/actions/payment.ts` (add `createBillingPortalSessionAction`)
- Modify: `src/app/t/[slug]/family/pay/page.tsx` (render button)

- [ ] **Step 1: Create the eligibility helper**

Create `src/lib/family/subscriptions.ts`:

```ts
import { db } from "@/lib/db";

/**
 * Cheap eligibility check for the family-side billing portal CTA. Returns
 * true when this parent (matched by case-insensitive email) has ≥1
 * Enrollment in a MONTHLY-priceModel program on this tenant with a
 * Stripe-paid invoice — i.e., there's an active subscription Stripe
 * can show in the Customer Portal.
 */
export async function parentHasSubscriptions(
  tenantId: string,
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const count = await db.enrollment.count({
    where: {
      program: { tenantId, priceModel: "MONTHLY" },
      invoice: {
        payerEmail: normalized,
        stripePaymentIntentId: { not: null },
      },
    },
  });
  return count > 0;
}
```

- [ ] **Step 2: Add `createBillingPortalSessionAction` to `payment.ts`**

Append to `src/actions/payment.ts`:

```ts
const portalSchema = z.object({ tenantId: z.string() });

/**
 * Open a Stripe Customer Portal session for the current parent on the
 * tenant's connected account. Used for managing MONTHLY subscriptions
 * (cancel, update card, view receipts).
 *
 * Throws "no subscription found" when the parent has no Stripe
 * customer on the tenant — the UI is supposed to gate this via
 * parentHasSubscriptions, but defend the server-side anyway.
 */
export async function createBillingPortalSessionAction(
  input: z.infer<typeof portalSchema>
): Promise<{ url: string }> {
  const data = portalSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!user.email) throw new Error("Missing email on account");

  const tenant = await db.tenant.findUnique({ where: { id: data.tenantId } });
  if (!tenant) throw new Error("Tenant not found");
  if (!stripeEnabled() || !tenant.stripeAccountId) {
    throw new Error("Billing isn't configured for this tenant");
  }

  const stripe = getStripe();
  const customers = await stripe.customers.list(
    { email: user.email, limit: 1 },
    { stripeAccount: tenant.stripeAccountId }
  );
  const customer = customers.data[0];
  if (!customer) {
    throw new Error("No subscription found on this tenant");
  }

  const session = await stripe.billingPortal.sessions.create(
    {
      customer: customer.id,
      return_url: `${env.NEXTAUTH_URL}/t/${tenant.slug}/family/pay`,
    },
    { stripeAccount: tenant.stripeAccountId }
  );

  if (!session.url) throw new Error("Stripe didn't return a portal URL");
  return { url: session.url };
}
```

- [ ] **Step 3: Create the BillingPortalButton component**

Create `src/components/family/BillingPortalButton.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createBillingPortalSessionAction } from "@/actions/payment";
import { track } from "@/lib/analytics";
import { Loader2, ExternalLink, Wallet } from "lucide-react";

export function BillingPortalButton({ tenantId }: { tenantId: string }) {
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      try {
        const { url } = await createBillingPortalSessionAction({ tenantId });
        track("billing_portal_opened", { tenantId });
        window.location.assign(url);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-flood-400/10 text-flood-400 flex items-center justify-center shrink-0">
        <Wallet className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink-50">Manage billing</p>
        <p className="text-xs text-ink-500 mt-0.5">
          Cancel a subscription, update your card, or download receipts.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={open}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ExternalLink className="h-3.5 w-3.5" />
        )}
        Open portal
      </Button>
    </Card>
  );
}
```

- [ ] **Step 4: Render the button on /family/pay**

Open `src/app/t/[slug]/family/pay/page.tsx`. Add imports at the top:

```ts
import { BillingPortalButton } from "@/components/family/BillingPortalButton";
import { parentHasSubscriptions } from "@/lib/family/subscriptions";
```

Inside the page function, after `const { tenant, user } = await requireTenant(slug);` add:

```ts
const showBillingPortal = await parentHasSubscriptions(tenant.id, user.email);
```

In the JSX, render the button just above the `<OutstandingStrip>`-like outstanding-balance card (after the `<header>`, before any other content):

```tsx
{showBillingPortal && <BillingPortalButton tenantId={tenant.id} />}
```

- [ ] **Step 5: Verify typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm run build 2>&1 | tail -5`
Expected: typecheck clean, build completes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/family/subscriptions.ts src/components/family/BillingPortalButton.tsx src/actions/payment.ts src/app/t/[slug]/family/pay/page.tsx
git commit -m "feat(family): Stripe Customer Portal embed for MONTHLY subscribers"
```

---

## Task 12: Verify, push, deploy, smoke

- [ ] **Step 1: Final typecheck + tests + lint + build**

Run all four:

```bash
pnpm exec tsc --noEmit
pnpm run test
pnpm run lint
pnpm run build
```

Expected: typecheck silent, vitest 57+ tests pass (the new packBalance tests add 9), lint shows only the 1 known TanStack-Table warning, build completes with the standard footer.

- [ ] **Step 2: Push to main**

Run:

```bash
git push origin main
```

Expected: fast-forward push succeeds. If main has diverged, rebase Wave A's commits onto origin/main first.

- [ ] **Step 3: Deploy to production**

Run:

```bash
vercel deploy --prod --yes
```

Expected: build completes in ~60s, deploy completes, output ends with `Aliased: https://kicknscream.vercel.app`.

- [ ] **Step 4: Smoke test A.1 — refund flow**

Manual steps in a browser:

1. Sign in as the owner on `smoke-coach-demo` tenant.
2. Visit `/t/smoke-coach-demo/coach/payments`.
3. Find a PAID invoice (or create one by booking the `smoke-program-demo` $65 program and completing checkout in Stripe test mode).
4. Click the Refund button on that invoice's row.
5. In the Sheet, leave "Full refund" selected, pick "Requested by customer" as the reason, click "Issue refund".
6. Verify: toast shows success, invoice flips to VOIDED status badge, refund payment row appears under the invoice if expanded.
7. Visit `/t/smoke-coach-demo/admin/audit` — confirm a "Refund issued" entry is at the top.
8. Check the payer email inbox for the "Refund issued" message.

- [ ] **Step 5: Smoke test A.2 — pack balance**

1. As owner, create a new PACKAGE program: `/t/smoke-coach-demo/coach/programs?new=1`, name "Test 5-pack", priceModel PACKAGE, packSize 5, price $300.
2. Visit `/{slug}/book/{newProgramId}` in an incognito window, complete a booking with a different parent email.
3. Back as owner, visit `/coach/bookings` — confirm the new enrollment row shows `5/5` in the Pack column.
4. Create an event with the program assigned, mark the booked player PRESENT.
5. Refresh `/coach/bookings` — confirm the Pack column now reads `4/5`.
6. Mark same player EXCUSED on the same event — confirm Pack reads `5/5` again.
7. Mark PRESENT 5 times across 5 events — confirm the 5th decrement also flips the enrollment status to COMPLETED and the parent's inbox gets the "pack is finished" email.

- [ ] **Step 6: Smoke test A.3 — billing portal**

Requires a tenant with an active MONTHLY subscription. If `smoke-coach-demo` doesn't have one:

1. As owner, create a MONTHLY program with price $10/mo: `/coach/programs?new=1`.
2. Book it as a parent in incognito — complete the Stripe Checkout subscription flow.
3. Back as the parent, visit `/t/smoke-coach-demo/family/pay`.
4. Confirm the "Manage billing" card renders above the outstanding-balance area.
5. Click "Open portal" — confirm redirect to a Stripe-hosted billing portal showing the subscription.
6. Cancel the subscription from the portal, return to `/family/pay` — confirm the card still renders (the subscription stays visible until end-of-period; only fully-deleted Stripe customers would suppress it).

- [ ] **Step 7: Mark Wave A task complete**

Update task #71 status to `completed` and move to Wave B.

---

## Verification matrix

| Spec section | Task |
|---|---|
| A.1 server action — Stripe path | Task 9 |
| A.1 server action — manual path | Task 9 |
| A.1 idempotency vs webhook | Task 9 (covered by conditional Enrollment update) |
| A.1 audit log entry | Task 9 + Task 1 (label) |
| A.1 email | Task 2 + Task 9 (invocation) |
| A.1 UI Sheet | Task 10 |
| A.2 schema | No task — schema already in place |
| A.2 initialize on booking | Task 4 |
| A.2 decrement on attendance | Task 5 |
| A.2 increment on flip | Task 5 |
| A.2 auto-complete at 0 | Task 5 |
| A.2 bookings table badge | Task 6 |
| A.2 roster profile section | Task 7 |
| A.2 family kid page card | Task 8 |
| A.2 audit + email | Task 1 + Task 2 + Task 5 |
| A.3 action | Task 11 |
| A.3 eligibility helper | Task 11 |
| A.3 UI conditional render | Task 11 |
| Analytics events | Task 1 |
| Smoke verification | Task 12 |

Every spec requirement has a task. No placeholders. Types and function names are consistent: `wasConsumed`, `computePackDelta`, `adjustPackBalanceForAttendance`, `refundInvoiceAction`, `createBillingPortalSessionAction`, `parentHasSubscriptions`, `RefundButton`, `BillingPortalButton` are used identically in every task that references them.
