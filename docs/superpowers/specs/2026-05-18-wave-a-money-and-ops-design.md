# Wave A — Money & Ops · Design Spec

**Status**: Approved 2026-05-18
**Author**: Claude (autonomous session)
**Implementation plan**: `docs/superpowers/plans/2026-05-18-wave-a-money-and-ops.md` (created next)

## Goal

Close three operator-side financial gaps that the platform currently doesn't support:

1. Coaches can't issue refunds from the UI — only the Stripe `charge.refunded` webhook fires automatically when a refund is initiated from the Stripe Dashboard.
2. `Enrollment.packBalance` is in the schema but no flow actually maintains it — coaches selling 5-pack / 10-pack programs have no remaining-sessions counter and parents have no visibility.
3. Parents on MONTHLY subscriptions can't manage their billing (cancel, update card, view receipts) without contacting the coach.

## Tech stack

Existing — no new dependencies.

- Stripe SDK already wired with Connect destination charges (`stripeAccountId`, `on_behalf_of`, `transfer_data.destination`)
- Resend already wired for transactional email
- Prisma 7 + Neon HTTP transport
- Audit log + Permissions matrix shipped in earlier waves

---

## A.1 — Refund issuance from `/coach/payments`

### Server action

`src/actions/payment.ts` gains `refundInvoiceAction`:

```ts
const refundSchema = z.object({
  tenantId: z.string(),
  invoiceId: z.string(),
  // Cents. Omit for full-balance refund.
  amountCents: z.number().int().positive().optional(),
  // Stripe-supported reason enum, optional internal notes.
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).optional(),
  notes: z.string().max(500).optional(),
});

export async function refundInvoiceAction(input: z.infer<typeof refundSchema>): Promise<void>;
```

Flow:

1. Authorize via existing `assertCanManage(tenantId)` (already permission-gated).
2. Load invoice with payments + enrollments; reject if status is `VOIDED` or already fully refunded.
3. Compute `refundAmount = input.amountCents ?? remainingPaidCents`. Reject if > remainingPaidCents.
4. If `invoice.stripePaymentIntentId` is set AND `stripeEnabled()`:
   - `stripe.refunds.create({ payment_intent, amount: refundAmount, reason }, { stripeAccount: tenant.stripeAccountId })`
   - Persist `refund.id` as `reference` on the `Payment` row created below.
5. If no stripePaymentIntentId (manual-payment invoice): skip Stripe call.
6. In one transaction:
   - `Payment.create` with `amount: -refundAmount`, `method` copied from the most recent non-negative `Payment` row for this invoice (defaulting to `CARD` if none — refunding an unpaid invoice is already blocked by step 2), `reference: refund.id ?? null`, `recordedBy: user.id`
   - If `refundAmount === remainingPaidCents`: `Invoice.status = "VOIDED"`. Otherwise leave `PAID` (partial refund).
   - `Enrollment.updateMany({ invoiceId, status: { not: "REFUNDED" } }, { status: "REFUNDED", cancellationReason: input.reason ?? "refund" })`
7. `AuditLog.create({ action: "payment.refund", targetType: "Invoice", diff: { invoiceId, amountCents: refundAmount, reason, fullRefund } })`
8. Best-effort `sendRefundConfirmation` email to `invoice.payerEmail`.
9. `revalidatePath` for `/coach/payments` + `/admin/audit` + `/family/pay`.

### Idempotency

The Stripe webhook handler at `/api/webhooks/stripe` already listens for `charge.refunded` and updates Invoice + Enrollment state. The new action writes the same end state. To avoid double-writes when a coach's UI-initiated refund triggers the webhook:

- `StripeWebhookEvent` table already idempotency-checks by `event.id` — duplicate event delivery is a no-op.
- The webhook handler's invoice update is `findFirst({ where: { stripePaymentIntentId } })` then conditional update — running it after the action's already-applied state is safe (becomes a no-op because status is already VOIDED).
- Same for `Enrollment.updateMany` — re-running with `where: { invoiceId, status: { not: "REFUNDED" } }` matches zero rows after the action ran.

### Email template

New `sendRefundConfirmation` helper in `src/lib/email.ts`:

```ts
sendRefundConfirmation({
  to: invoice.payerEmail,
  parentName,
  tenantName,
  tenantSlug,
  programName,
  amountCents,
  fullRefund: boolean,
  reason: string | null,
})
```

Subject: `Refund issued — ${tenantName}`. Body explains amount, original payment date, expected bank-statement timing (5-10 business days), and `${reason}` if present.

### UI

`src/components/payments/RefundButton.tsx` (new):

- Renders inline as the trailing action on each `Card`-ish invoice row in the existing `InvoicesTable`.
- Visible only when `invoice.status === "PAID"` and remaining-refundable > 0.
- Click opens a `<Sheet>` (right-anchored 480px, mobile-bottom 90vh — matches the EventDialog / ProgramDialog / PlayerDialog idiom from the recent migration):
  - Header: "Refund {formatCents(remainingCents)} from {invoice.description}"
  - Body:
    - Toggle: "Full refund" / "Partial refund" (defaults to Full)
    - Amount input (cents → dollars, disabled when Full toggled)
    - Reason select with options Stripe accepts + "Other (notes only)"
    - Notes textarea (500 chars max) — written to AuditLog diff
    - Banner explaining what happens: "Refunds Stripe charge, voids the invoice, marks enrollment refunded, emails the parent."
  - Footer: Cancel + "Issue refund" button (red variant, requires reason or notes to enable)
- For manual-payment invoices (no `stripePaymentIntentId`): button label is "Mark refunded", sheet copy is rephrased to clarify no money moves.

Existing `voidInvoiceAction` stays as-is for the "this invoice was never going to be paid" case. Refund is for "this invoice was paid and we owe the money back."

---

## A.2 — Pack-balance tracking

### Schema

Zero migration. `Enrollment.packBalance Int?` and `Program.packSize Int?` exist already.

### Flow

**Initialize on booking:**

In `src/actions/booking.ts` `createBookingAction`, after the enrollment create:

```ts
if (program.priceModel === "PACKAGE" && program.packSize && program.packSize > 0) {
  // Initialize the pack balance from the program's pack size.
  await db.enrollment.update({
    where: { id: enrollment.id },
    data: { packBalance: program.packSize },
  });
}
```

Also patch `src/actions/program.ts` so that updating a PACKAGE program's `packSize` does **not** rewrite existing enrollment balances (those keep what they were sold).

**Decrement on attendance present/late:**

In `src/actions/attendance.ts` `markAttendanceAction` and `bulkMarkAttendanceAction` and `markSeriesAttendanceAction`, after the attendance upsert, run a helper:

```ts
async function maybeAdjustPackBalance({
  playerId, eventId, prevStatus, nextStatus
}) {
  // Lookup the event's programId, find the player's active enrollment
  // for that program with priceModel === "PACKAGE", and adjust:
  //   prevStatus not consumed + next status consumed → decrement
  //   prev consumed + next not consumed → increment (capped at packSize)
  //   no change → no-op
}
```

"Consumed" = `status in [PRESENT, LATE]`. Excused / Absent / Pending = not consumed.

Use `prisma.$transaction` for the attendance write + balance adjustment so they're atomic. The function reads `prevStatus` from the existing Attendance row before the upsert (or null if creating fresh) and does a conditional update gated on the current `packBalance` value (so a concurrent re-mark doesn't double-decrement).

**Auto-complete at zero:**

After every adjustment, if `packBalance` reaches 0, mark `Enrollment.status = "COMPLETED"` and fire `sendPackCompletedEmail` (new helper) with a "book another?" CTA pointing at the same program's booking page.

**Audit:** Log `enrollment.pack_consumed` and `enrollment.pack_completed` audit entries — useful for "where did my balance go?" debugging later.

### Surfaces

**Coach bookings table** (`src/components/bookings/BookingsTable.tsx`):

Add a "Pack" column. Renders `{packBalance}/{program.packSize}` as a font-mono badge, color-coded:
- ≥ 50% remaining: turf-400 muted
- < 50% but > 0: warn
- 0 or undefined: hidden (no badge — column shows "—" so it doesn't read as a missing-data bug)

**Coach roster player profile** (`src/app/t/[slug]/coach/roster/[playerId]/page.tsx` Overview tab):

New "Active packs" section above Active enrollments, listed only when the player has ≥1 PACKAGE enrollment. Per row: program name + `{packBalance}/{packSize}` + last-attended date + "Book another" deep link to `/family/book/{programId}` (gated to copy the parent's email into the booking form pre-fill).

**Family kid detail** (`src/app/t/[slug]/family/kids/[playerId]/page.tsx`):

New "Sessions remaining" card above "Upcoming sessions". Shows pack balance per active PACKAGE enrollment with a colored progress bar and the encouraging copy.

---

## A.3 — Family auto-pay (subscription portal)

### Action

`src/actions/payment.ts` gains `createBillingPortalSessionAction`:

```ts
const portalSchema = z.object({ tenantId: z.string() });

export async function createBillingPortalSessionAction(
  input: z.infer<typeof portalSchema>
): Promise<{ url: string }>;
```

Flow:

1. Resolve current user; require active session.
2. Load tenant with `stripeAccountId`. Reject if missing or `!stripeEnabled()`.
3. Find a Stripe customer for this user on the connected account: `stripe.customers.list({ email: user.email, limit: 1 }, { stripeAccount: tenant.stripeAccountId })`. Reject with friendly error if none — means the parent has no subscriptions on this tenant.
4. Create portal session: `stripe.billingPortal.sessions.create({ customer, return_url: ${env.NEXTAUTH_URL}/t/${tenant.slug}/family/pay }, { stripeAccount: tenant.stripeAccountId })`.
5. Return `{ url: session.url }`.

### Eligibility check

Server-side helper `parentHasSubscriptions(tenantId, userEmail)` returns boolean — checks for ≥1 `Enrollment` with `program.priceModel === "MONTHLY"` and an `Invoice` paid via Stripe. Cheap query (count, indexed).

### UI

`src/components/family/BillingPortalButton.tsx` (new):

- Rendered on `/family/pay` above the outstanding-strip.
- Server-rendered eligibility: if `parentHasSubscriptions(tenantId, user.email)` returns false, the button is **not** rendered (no "you have no subscriptions to manage" surface — cleaner to omit entirely).
- If eligible: card with "Manage billing", "Cancel a subscription, update your card, or download receipts", CTA button. Click → server action → `window.location.assign(url)` → Stripe-hosted portal.

Return URL points back at `/family/pay` so the post-portal landing is the same page the parent started from. No `?paid=1` or `?canceled=1` — the portal doesn't have a notion of one-shot success.

---

## Cross-cutting concerns

### Permission gates

- `refundInvoiceAction`: existing `canManageTenant(role)` check (already in `assertCanManage`). No new permission feature.
- Pack-balance flows: no permission gate beyond what attendance already requires.
- `createBillingPortalSessionAction`: any signed-in parent of the tenant; same gate as the existing parent-pay action.

### Analytics

Add three new events to `src/lib/analytics.ts` typed union:

- `refund_issued` (props: invoiceId, amountCents, fullRefund, viaStripe)
- `pack_completed` (props: enrollmentId, programId, packSize)
- `billing_portal_opened` (props: tenantId)

### Audit log

Three new action labels in `src/app/t/[slug]/admin/audit/page.tsx`:

- `payment.refund` → "Refund issued"
- `enrollment.pack_consumed` → "Pack session used"  *(noisy — log but maybe omit from default 200-row window via a query filter; for now include)*
- `enrollment.pack_completed` → "Pack finished"

### Email

Two new templates:

- `sendRefundConfirmation` — refund issued, amount, expected timing
- `sendPackCompletedEmail` — your pack is finished, here's the link to buy another

Both use the existing Resend setup + branded markdown rendering.

### Testing

- Vitest unit tests for `maybeAdjustPackBalance` pure-function helper covering: decrement on PRESENT, decrement on LATE, increment on flip-to-EXCUSED, idempotent on re-mark same status, no-op on non-PACKAGE program, no-op when no matching enrollment exists.
- Playwright e2e for refund flow: gated on `process.env.E2E_HAS_PAID_INVOICE` (set in CI only when seed data is provisioned). Test signs in as a coach, clicks the refund button on a known invoice ID, verifies the card flips to VOIDED + an "Refund issued" entry appears at the top of `/admin/audit`.

### Out of scope (defer to later waves)

- Save-card-on-file for one-shot invoices (Wave B candidate)
- Refund-to-different-method (cash refund of an originally-Stripe payment)
- Pack expiration dates (e.g., "5 sessions must be used within 90 days")
- Pro-rata refund of partially-consumed packs
- Stripe Tax for refund accounting

---

## Verification

Per-component smoke test after ship:

- **A.1**: Open `/coach/payments`, click Refund on a PAID invoice, confirm the Sheet opens, issue a full refund, confirm Invoice flips to VOIDED, Enrollment flips to REFUNDED, audit log row appears, parent gets the email.
- **A.2**: Create a PACKAGE program with packSize=5, book a kid into it, mark attendance PRESENT on one event, confirm `Enrollment.packBalance` is 4 in DB, confirm the badge renders on bookings table + roster profile + family kid page. Flip the attendance to EXCUSED, confirm balance goes back to 5.
- **A.3**: On a tenant with at least one MONTHLY subscription paid through Stripe, visit `/family/pay` as the subscribing parent, confirm the "Manage billing" card renders, click it, confirm redirect to Stripe-hosted portal with subscription visible.

Each verified live on prod via the existing deploy workflow.
