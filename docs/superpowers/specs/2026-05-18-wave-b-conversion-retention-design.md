# Wave B — Conversion & Retention · Design Spec

**Status**: Approved 2026-05-18
**Author**: Claude (autonomous session)
**Implementation plan**: `docs/superpowers/plans/2026-05-18-wave-b-conversion-retention.md` (created next)

## Goal

Four additions that reduce booking-funnel dropoff and retain parents:

1. Parents who close the booking tab mid-form lose everything — add **save-and-resume** via emailed magic link.
2. Two parents picking the same 10am Saturday slot both succeed today, then the coach manually resolves the conflict. Add a **15-min tentative hold** so the first parent locks the slot during checkout.
3. `Player.photoUrl` is in the schema but no upload UI exists — add **player photo upload** via Vercel Blob (the logo upload at `/api/uploads/logo` is the existing pattern to mirror).
4. Parents don't see a regular cadence of "here's what your kid did this week" — add a **weekly family digest email** sent every Sunday morning via Vercel Cron.

## Tech stack

- Existing: Vercel Blob, Resend, Vercel Cron, Stripe Checkout, Prisma 7
- Zero new dependencies

---

## B.1 — Save-and-resume booking (+ slot hold)

### Schema (one migration)

New `BookingDraft` model — single source of truth for both save-and-resume AND slot hold. A draft IS a hold until it expires (`expiresAt`) or graduates to a real Enrollment (`claimedAt` set).

```prisma
model BookingDraft {
  id          String   @id @default(cuid())
  tenantId   String
  programId  String
  // Email is the resume-identity. Magic-link token is sent to this address.
  email       String
  // Token sent in the resume URL. Unguessable (cuid2-style, 32 chars).
  token       String   @unique
  // The slot the parent reserved + filled-in form state. JSON so the
  // shape can evolve without migrations.
  startsAt    DateTime
  endsAt      DateTime
  payload     Json
  // 15-min hold. Slot is locked for new bookings until this lapses or
  // the draft is claimed.
  expiresAt   DateTime
  claimedAt   DateTime?
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  program     Program  @relation(fields: [programId], references: [id], onDelete: Cascade)

  @@index([tenantId, startsAt])
  @@index([programId, expiresAt])
  @@index([email])
}
```

`Tenant` and `Program` gain the back-relation:
```prisma
// in Tenant
bookingDrafts BookingDraft[]
// in Program
bookingDrafts BookingDraft[]
```

### Flow — save-and-resume

1. Parent fills out booking form, hits a new "Save for later" link inline.
2. Client calls `saveBookingDraftAction({ tenantSlug, programId, formState, email })`.
3. Server upserts a `BookingDraft` keyed on `(tenantId, programId, email)`:
   - `token` = freshly minted cuid
   - `expiresAt` = `now() + 15 minutes` (also acts as the hold)
   - `payload` = full form state
4. Server fires `sendResumeBookingEmail` — magic link `${NEXTAUTH_URL}/{slug}/book/{programId}/resume?token={token}`.
5. Toast: "We emailed you a link to pick up where you left off."

### Flow — resume

`GET /{slug}/book/{programId}/resume?token=…`:
1. Look up `BookingDraft` by token.
2. If not found, expired, or claimed: render a "this link expired" page with a "Start over" CTA.
3. Otherwise: render the existing `BookingForm` with `initialState={draft.payload}`. Form mounts pre-filled.

When the parent submits successfully, `createBookingAction` looks up any draft with `(tenantId, programId, email)` and marks it `claimedAt = now()`. (Existing parent-link logic already accepts an email-keyed parent — this just adds the claim flag.)

### Flow — slot hold (just-in-time check)

When the booking form computes available times (`computeAvailableTimes` in `src/components/book/BookingForm.tsx`), the server-side data load needs to include held slots in the "busy" list. Modify `BookPage` to also load `db.bookingDraft.findMany({ where: { programId, expiresAt: { gt: now() }, claimedAt: null } })` and merge those into `busyStartsAt` as { startsAt, endsAt } pairs.

The actual slot lock — preventing a second parent from booking the same time during the 15-min window — happens at `createBookingAction` time:
- Before creating the Event, check for any `BookingDraft` covering the slot with a different email and non-expired hold.
- If found, throw "Slot is held — try a different time."

### Cleanup

New Vercel Cron entry: `/api/cron/expire-booking-drafts` runs every 15 min. Deletes drafts where `expiresAt < now()` and `claimedAt IS NULL`. (Claimed drafts stay so we can audit "this parent saved 3 drafts before finishing.")

### Email

New `sendResumeBookingEmail` in `src/lib/email.ts`. Subject: `Pick up where you left off · {tenantName}`. Body: program name, picked time, magic-link CTA, expires-in countdown.

### UI — "Save for later"

New `SaveForLaterLink` rendered above the submit button on `BookingForm`. Click → opens a tiny inline form ("Where should we email the resume link?" + email input) → submits the draft action → swaps to "Sent ↗" confirmation.

For parents who land on `/resume?token=…`, the existing `BookingForm` mounts with `initialState` populated from the draft payload. Add an info banner at top: "Welcome back — we restored your draft. Submit to finalize."

---

## B.2 — Player photo upload

### Schema

Zero — `Player.photoUrl String?` already exists.

### Upload route

New `src/app/api/uploads/player-photo/route.ts`. Mirrors the existing `/api/uploads/logo` route's pattern:

```ts
POST /api/uploads/player-photo
  body: multipart/form-data with `file` + `playerId`
  returns: { url: string }
```

Authorizes: user must have a Coach+ membership on the player's tenant. Validates content-type starts with `image/`, max 5MB. Uploads via `@vercel/blob` `put()` with `access: "public"` and `addRandomSuffix: true`. On success, writes `Player.photoUrl = result.url` and returns the URL.

### Action

Wrap the upload in `uploadPlayerPhotoAction(playerId, file)` so the form can call it through a server action instead of a raw fetch — keeps auth handling in one place.

### UI

In `PlayerDialog` (the edit form), add a photo section above the Name fields:

- Current avatar (Avatar component, falls back to initials)
- "Upload photo" button → opens a hidden `<input type="file" accept="image/*">`
- Selected file → optimistic preview + server upload → on success, replaces the `photoUrl` in the form state + persists immediately (so closing the dialog without hitting Save doesn't lose the photo)
- "Remove photo" button when one is already set → server action `clearPlayerPhotoAction(playerId)` → sets photoUrl to null

The roster's `getInitials` fallback in `Avatar` already handles missing photos, so the rest of the app picks up the new photo with zero changes.

### Surfaces that already render photoUrl

Already wired (no changes needed): `/coach/roster/[playerId]`, `/family/kids/[playerId]`, `/family/kids`. The photo flows through `AvatarImage src={player.photoUrl}` already.

---

## B.3 — Weekly family digest email

### Cron

New entry in `vercel.json`:

```json
{
  "path": "/api/cron/family-digest",
  "schedule": "0 15 * * 0"
}
```

(Sunday 15:00 UTC = Sunday morning 8-11am across US time zones.)

### Endpoint

`src/app/api/cron/family-digest/route.ts`:

1. Auth via existing `assertCronAuth` helper.
2. Find every user with `Membership.role` in `[PARENT, PLAYER]` AND `UserPreferences.emailReminders !== false`.
3. For each parent: load their kids' last-7-days attendance + session notes + pack-balance changes, grouped by kid.
4. Skip the email if there's nothing to report (no attended sessions + no notes + no pack changes in the window).
5. Send `sendFamilyDigestEmail` per parent. Best-effort — errors logged but don't fail the cron.

### Email template

New `sendFamilyDigestEmail` in `src/lib/email.ts`. Per kid:
- Kid's name + avatar (initials only — email clients can't render Blob URLs reliably without CORS pain)
- "This week" stats: sessions attended (X/Y), latest pack balance
- Coach notes (parent-visible ones from the week)
- Next upcoming session

Subject: `This week with {tenant.name}`. Per-parent personalization: greets by first name (using existing `greetingName` helper).

### Out of scope

- Per-parent unsubscribe link (covered by existing `UserPreferences.emailReminders` toggle — parents toggle it from /account/notifications)
- HTML weather snapshots in the digest (would balloon the email size + complicate; the next-session card already shows it on /family/home)
- SMS digest (deferred to a future wave)

---

## Cross-cutting concerns

### Analytics

Three new typed events appended to `AnalyticsEvent`:
- `booking_draft_saved` (props: tenantSlug, programId)
- `booking_draft_resumed` (props: tenantSlug, programId)
- `player_photo_uploaded` (props: playerId)

### Audit log

Two new action labels:
- `booking.draft_saved` → "Booking draft saved"
- `booking.draft_resumed` → "Booking draft resumed"

Player photo uploads are intentionally NOT audited — too noisy + not security-sensitive.

### Permissions

- Save / resume booking: no auth required (parents who haven't yet signed up can use it).
- Player photo upload: coach+ on the tenant, OR the parent linked to the player. We need to extend the auth check beyond "coach+" to include the parent case. Add a helper `canEditPlayer(user, tenantId, playerId)` that returns true for COACH+ members or for the player's parent via direct `parentId` match or `ParentPlayer` junction.
- Family digest: cron-only.

### Out of scope (deferred)

- Save-and-resume across multiple devices (single magic link is single-device-friendly enough)
- Photo crop / face-detect UX (just accept the upload as-is)
- Digest opt-out independent of `emailReminders` (the existing global toggle is the gate)

---

## Verification

- **B.1 save-and-resume**: Start a booking on `smoke-coach-demo`, fill the form, hit Save for later, check inbox, click link, confirm form mounts with previous values, submit, confirm booking lands.
- **B.1 slot hold**: Start a save-for-later in incognito for 10am Saturday, then in a second browser try to book the same slot — confirm the slot is hidden from the available-times list.
- **B.2 photo upload**: As coach, edit a player, upload a JPG, confirm avatar updates immediately + persists across reload. Hit Remove, confirm fallback initials return.
- **B.3 digest**: Hit `/api/cron/family-digest` directly with `Authorization: Bearer $CRON_SECRET` after seeding a kid with one attended session this week — confirm the email lands at the parent's address with the kid's name + the session.
