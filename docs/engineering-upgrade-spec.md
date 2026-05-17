# KickNScream — Engineering Upgrade Spec (Dev-Ready Tickets)

> Build-ready backlog organized by epic. Each ticket has scope, acceptance criteria, routes/data, and dependencies. Assumes Next.js App Router, Postgres (or Supabase), Stripe Connect, Resend/Postmark for email, Twilio for SMS, and Tailwind + shadcn/ui for components.

---

## EPIC 0 — Foundation cleanup (Sprint 1, 2–3 days)

### TICKET 0.1 — Remove dev artifacts from production
- Hide the "SPRINT 1 — Foundation shipped…" badge behind `NEXT_PUBLIC_SHOW_DEV_STATUS` env flag (default false in prod).
- Move the "Install KickNScream" PWA banner: show once per session as a top-bar dismissible pill (32px height), persist dismissal in `localStorage.kns_pwa_dismissed_at` for 30 days.
- Remove the floating "Stop Claude" / debug overlay from production builds.

**AC:** Production at `kicknscream.vercel.app` has no Sprint badge, Install banner does not overlap content, dismissal sticks across reloads.

### TICKET 0.2 — Design tokens + theming
- Create `/lib/design/tokens.ts` exporting: color (`brand.lime #D8FF3D`, `brand.green #1FB663`, surface scale, text scale, semantic success/warn/danger/info), spacing (4/8/12/16/24/32/48/64), radius (sm 6, md 10, lg 14, xl 20), elevation (3 steps), typography scale.
- Wire tokens into `tailwind.config.ts` via `theme.extend`.
- Add `next-themes` with dark (default) and light. Persist per user in `users.preferences.theme`.

**AC:** Toggling theme in user menu swaps surface/text tokens with no FOUC; tokens documented at `/internal/design` (gated to staff role).

### TICKET 0.3 — Accessibility baseline
- Audit all interactive elements: `:focus-visible` ring (2px lime), min 44×44 tap target on mobile, body text contrast ≥ 4.5:1.
- Replace text-on-dark-green secondary copy with `text-zinc-300` token.
- Add `aria-label` to all icon-only buttons; ensure form fields have associated labels.

**AC:** Lighthouse a11y ≥ 95 on Dashboard, Bookings, Public page, Booking flow.

---

## EPIC 1 — Role-aware app shell & routing (Sprint 1–2, 5–7 days)

### TICKET 1.1 — Role-based routing

Routes:
- `/t/[slug]/coach/*` — Coach + Owner
- `/t/[slug]/family/*` — Parent + Player
- `/t/[slug]/admin/*` — Owner + Admin
- `/admin/*` — Platform staff (KickNScream)

Middleware (`middleware.ts`) reads session, looks up `memberships.role` for the tenant slug in the URL, and 302s the user to their default portal on sign-in. Block cross-portal access with 403 page.

**AC:** A Parent signing in lands at `/t/[slug]/family/home`; visiting `/t/[slug]/coach/*` returns 403 page with "Switch role" button if they hold another role.

### TICKET 1.2 — Workspace + role switcher
- Replace the current "Smoke Coach Demo · COACH" pill with a `<WorkspaceSwitcher />` component in the top bar.
- Menu shows: current tenant, list of tenants user belongs to, divider, role chips for current tenant (if user has >1 role), divider, "Account settings," "Sign out."

**AC:** Switching role re-routes to the corresponding portal root; switching tenant preserves the user's role in that tenant.

### TICKET 1.3 — Portal shell components
- `<CoachShell>` — left sidebar (collapsible), top bar with workspace switcher, command palette ⌘K.
- `<FamilyShell>` — top bar only on desktop, bottom tab bar on mobile (Home / Schedule / Book / Pay / Messages).
- `<AdminShell>` — left sidebar with admin sections.
- All three shells share `<TopBar>` and `<UserMenu>` primitives.

**AC:** All three shells render at <100ms TTI, share a single layout file pattern, mobile bottom tab bar appears < 768px on Family.

---

## EPIC 2 — Data model upgrades (Sprint 2, 4–5 days)

### TICKET 2.1 — Schema additions (Prisma migration)

```
players: id, tenant_id, first_name, last_name, dob, photo_url,
  position[], skill_tags[], notes_private, parent_ids[], created_at

parent_players: parent_user_id, player_id, relationship  // many-to-many

bookings: + status enum(new, confirmed, paid, attended, no_show, cancelled, refunded),
  + payment_status, + stripe_payment_intent_id, + attended_at, + cancellation_reason,
  + recurring_series_id

services: + type enum(single, pack, membership, program),
  + pack_size, + recurring_interval, + capacity, + cohort_start, + cohort_end,
  + booking_link_token

attendance: id, event_id, player_id, status enum(present, absent, late, excused), marked_by, marked_at

messages: id, tenant_id, thread_id, sender_user_id, body, channel enum(in_app, email, sms),
  delivered_at, read_at

threads: id, tenant_id, subject, participant_user_ids[], last_message_at

files: id, tenant_id, owner_user_id, player_id?, kind enum(waiver, medical, photo, doc),
  url, signed_at?

audit_log: id, tenant_id, actor_user_id, action, target_type, target_id, diff_jsonb, at

permissions_overrides: tenant_id, role, feature, level enum(none, view, edit)
```

**AC:** Migration runs cleanly; seed script populates demo tenant with 10 players, 20 bookings across all statuses, 3 services of each type, 1 recurring series, 2 threads.

### TICKET 2.2 — Permission matrix
- Centralize in `/lib/auth/permissions.ts` as a typed map: `{ feature: { owner, admin, coach, parent, player } }`.
- Features: `bookings.view`, `bookings.edit`, `roster.view`, `roster.edit`, `messages.broadcast`, `billing.manage`, `settings.tenant`, `team.invite`, `audit.view`, etc.
- Export `can(user, tenant, feature)` helper used by both server actions and UI.

**AC:** Every server action calls `can()` and throws 403 on fail; UI hides actions for which `can()` is false.

---

## EPIC 3 — Coach Portal: Today + Schedule + Bookings (Sprint 2–3, 8–10 days)

### TICKET 3.1 — "Today" home screen at `/t/[slug]/coach/today`

Sections, top-to-bottom:
1. **Agenda strip** — horizontal scroll of today's sessions as cards (time, service name, location, player count, attendance state, primary action: "Start attendance"). Empty state: "No sessions today — view week."
2. **Needs attention** — list of cards: unconfirmed bookings, overdue payments, missing waivers, unread parent messages. Each has a one-click action.
3. **KPIs** — Roster, This week's sessions, MTD revenue, Attendance rate. Each shows value + 7-day sparkline + WoW delta chip.
4. **Quick actions** — Add player, New event, Create service, Send broadcast.

**AC:** Loads in <500ms with seed data; every card has a single primary CTA; mobile collapses agenda strip to vertical list.

### TICKET 3.2 — Schedule upgrades at `/t/[slug]/coach/schedule`
- Add color legend bar under filter chips (Lesson lime / Class yellow / Practice cyan / Game red / Tryout violet / Camp orange / Clinic magenta).
- Highlight current day column with lime left border.
- **Drag-to-create:** click+drag on an empty time range opens "New event" modal pre-filled with start/end.
- **Drag-to-move** and **resize** existing events with optimistic UI + server reconciliation.
- **Event detail drawer** (right-side, 480px): event info, roster list with attendance toggles, linked service, revenue, notes, "publish to parents" switch, delete with confirm.
- **Recurring editor:** weekly/bi-weekly/monthly with end date or count, exceptions handled as "edit this / this+future / all."

**AC:** Drag interactions feel native (60fps), recurring edits save correctly across the three modes, only published events appear in Family portal.

### TICKET 3.3 — Bookings table at `/t/[slug]/coach/bookings`
- Replace empty placeholder with a real `<DataTable>`: columns = Player, Service, Date/Time, Status, Payment, Coach, Actions.
- Filters: status (multi), service, date range, coach, payment status. Saved views per user in `user_views`.
- Row click opens **Booking detail drawer** (right side): parent + player info, payment status with refund button, attendance toggle, internal notes, message-parent button, audit timeline.
- Bulk actions: mark attended, send reminder email, export CSV.
- "Convert to recurring" action on single booking.

**AC:** Table handles 5k rows with virtualized scrolling; filters update URL query params; drawer actions trigger optimistic UI.

---

## EPIC 4 — Coach Portal: Roster, Services, Messages (Sprint 3–4, 8–10 days)

### TICKET 4.1 — Player profiles at `/t/[slug]/coach/roster/[playerId]`
- Header: photo, name, age, position chips, parent contacts, payment status, attendance %.
- Tabs: Overview / Schedule / Attendance / Payments / Notes (private) / Files.
- Auto-link parent on new booking: match `parent_users` by `lower(email)` or phone; create new parent on miss; idempotent.
- Bulk roster import: CSV upload with column mapping, validation preview, dry-run.

**AC:** Adding a booking with an existing parent email links to the same parent; CSV import shows row-level errors before commit.

### TICKET 4.2 — Services as products at `/t/[slug]/coach/services`
- Replace flat list with cards showing: thumbnail, type badge (single/pack/membership/program), price, capacity, bookings this month, revenue MTD, fill rate %.
- Editor supports the four service types with type-specific fields (`pack_size`, `recurring_interval`, cohort dates, capacity).
- Each card has "Share" → modal with copyable booking link + QR code (use `qrcode.react`).

**AC:** Membership type creates a Stripe recurring price on save; pack type tracks remaining sessions per buyer.

### TICKET 4.3 — Messages module at `/t/[slug]/coach/messages`
- Two-pane: thread list left, conversation right.
- Compose new thread with recipient picker (single parent, program roster, all parents).
- Broadcast composer: subject + body, channels (email always, in-app always, SMS opt-in), preview, send.
- Templates stored in `message_templates`: cancellation, reminder, welcome, payment-overdue.
- Email via Resend with tenant branding (`from tenant.name <noreply@kicknscream.app>`, reply-to coach), SMS via Twilio with per-tenant sender pool.

**AC:** A broadcast to 50 parents fans out via background job; delivery + read receipts shown per recipient.

---

## EPIC 5 — Parent Portal (Sprint 4–5, 10–12 days)

### TICKET 5.1 — Family Home at `/t/[slug]/family/home`
- "Next session" hero card per kid: countdown, service, location with map link, weather (Open-Meteo API, free), what-to-bring checklist (configurable per service), "Add to calendar" (.ics) and "Apple Wallet pass" links.
- "My kids" carousel — one card per linked player.
- "Outstanding" — payments due, unsigned forms.

**AC:** Loads under 1s on 4G mobile; calendar download works on iOS Safari and Android Chrome.

### TICKET 5.2 — My Kids at `/t/[slug]/family/kids/[playerId]`
- Read-only view of player info parents are allowed to see: schedule, attendance history, public progress notes (coach-shared), payment history, files (waivers download/sign).
- "Request schedule change" and "Message coach" buttons.

**AC:** A parent can only access their own kids; 404 on others.

### TICKET 5.3 — Book + Payments
- `/family/book` — same public booking UI but pre-fills parent + player from account.
- `/family/payments` — list of charges (from Stripe), receipts, current pack balance, autopay toggle (Stripe customer portal embed), saved cards managed via Stripe-hosted portal (never store PAN ourselves).

**AC:** Autopay toggle creates/updates Stripe subscription; receipts link to Stripe-hosted invoices.

### TICKET 5.4 — Forms & waivers at `/family/forms`
- List of required forms with status (pending/signed/expired).
- E-sign flow: render markdown waiver, capture typed signature + IP + timestamp, store PDF in S3, write `files` row with `signed_at`.

**AC:** Booking flow blocks completion when a required form is unsigned and prompts to sign inline.

### TICKET 5.5 — Mobile-first polish
- Bottom tab bar on <768px: Home / Schedule / Book / Pay / Messages.
- All primary actions reachable thumb-zone.
- Add `manifest.json` + service worker so the PWA installs cleanly (`/family` as `start_url` for parents).

**AC:** Lighthouse PWA score = installable; mobile usability 100.

---

## EPIC 6 — Admin Portal (Sprint 5–6, 6–8 days)

### TICKET 6.1 — Team & permissions at `/t/[slug]/admin/team`
- Keep existing invite UI but add a permission matrix table: rows = features, columns = roles, cells = view/edit/none, with per-tenant overrides written to `permissions_overrides`.
- Resend, revoke, copy invite link actions on pending invites.

**AC:** Editing a cell updates `permissions_overrides` and immediately affects `can()` checks for that tenant.

### TICKET 6.2 — Branding & domains
- Existing Tenant info form + add: favicon upload, social share image, optional custom domain (CNAME instructions, verify TXT, issue cert via Vercel domains API).

**AC:** After verifying a custom domain, public page resolves on it; portal stays on `kicknscream.app`.

### TICKET 6.3 — Billing dashboard
- Stripe Connect status, payout schedule, recent payouts, refunds with reason, fees breakdown.
- Tax settings: collect business address, optionally enable Stripe Tax.

**AC:** Refund action returns funds and updates `booking status='refunded'`.

### TICKET 6.4 — Audit log + data tools at `/t/[slug]/admin/audit` and `/data`
- Filterable audit log table (actor, action, target, when).
- Data exports: roster CSV, bookings CSV, payments CSV, full tenant export (zip).
- GDPR delete: hard-delete player + redact bookings on parent request.

**AC:** Every server action writes an `audit_log` row; export downloads include all rows the role can see.

### TICKET 6.5 — Platform admin at `/admin/*` (KickNScream staff only)
- Tenants list with MRR, last activity, plan.
- Impersonation: "View as" generates short-lived signed token, banner in shell shows "Impersonating X — exit," all actions audited.
- Feature flags table per tenant.

**AC:** Only users with `platform_staff=true` can reach `/admin`; impersonation forbidden on prod without a support ticket reference field.

---

## EPIC 7 — Public page & booking flow conversion (Sprint 6, 4–5 days)

### TICKET 7.1 — Public page upgrades at `/[slug]`

Add sections (all editable from coach Settings → Public page):
1. Coach bio (photo, credentials, years coaching, certifications).
2. Testimonials (3–6 cards with optional rating).
3. Service comparison table.
4. FAQ accordion.
5. Location/travel radius — Mapbox static map with pin + radius circle.
6. Trust strip (Stripe-secured payments, response time, refund policy).

JSON-LD structured data: `LocalBusiness`, `Person` (coach), `Offer` per service.

**AC:** Editing any section in coach Settings reflects on public page within 5s (revalidate tag); Google Rich Results test passes.

### TICKET 7.2 — Booking flow improvements
- Replace "Suggested times" chips with real availability computed from coach's calendar + working hours + existing bookings; fall back to chips only when Stripe is not connected.
- Add "Save and resume later" — emails a magic link to the entered email that resumes the booking state.
- Post-booking: "Create account to track your kid" CTA → passwordless sign-up using the email already entered.

**AC:** Booking a slot writes a tentative hold (`bookings.status='new'`) and removes that slot from availability; abandoned bookings auto-cancel after 15 minutes.

---

## EPIC 8 — Notifications & jobs (Sprint 5, 3–4 days)

### TICKET 8.1 — Background jobs (Inngest or Trigger.dev)
- `booking.created` → email parent confirmation + email coach + write audit.
- `booking.upcoming.24h` → reminder email + optional SMS.
- `booking.upcoming.2h` → push notification (PWA) for parents.
- `payment.failed` → notify coach + parent with retry link.
- `booking.no_show` (auto-mark 30 min after end if not marked) → notify coach.

**AC:** Jobs are idempotent (keyed by `booking_id + step`), observable in dashboard.

### TICKET 8.2 — Notification preferences
- Per user: channel toggles (email, sms, push) × event types (reminders, payments, messages).

**AC:** Preferences honored by the job system.

---

## EPIC 9 — Observability & quality (ongoing)

### TICKET 9.1 — Telemetry
- Sentry (frontend + server actions), PostHog (product analytics) with anonymized event names: `booking_started`, `booking_completed`, `attendance_marked`, `broadcast_sent`.

**AC:** Funnel from public page → booking complete is visible in PostHog.

### TICKET 9.2 — Test coverage
- Playwright e2e: parent books a session, coach marks attendance, admin invites teammate, parent pays balance.
- Vitest unit on `can()` permission helper and recurring-event date math.

**AC:** CI blocks merge on failing e2e on these four flows.
