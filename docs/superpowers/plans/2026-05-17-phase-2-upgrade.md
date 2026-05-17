# KickNScream — Engineering Upgrade Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. The full ticket-by-ticket acceptance criteria live in the user's master spec (paste in `kicknscream/docs/engineering-upgrade-spec.md`). This file is the **sequencing + critical-decision** layer that wraps the spec so phases land cleanly.

**Goal:** Take the live foundation (Sprints 1-12 shipped, deployed at https://kicknscream.vercel.app, Stripe live wired) and execute the 9-epic Engineering Upgrade Spec — role-aware portal split, expanded data model, premium coach/family/admin UIs, background jobs, observability, e2e tests.

**Architecture:** Keep current Next.js 16 App Router + Prisma 7/Neon + NextAuth v5 + Stripe Connect (LIVE) + Resend stack. Add Vercel Cron (background jobs via user's Vercel Pro), Sentry (errors), PostHog (analytics), Playwright (e2e). UI: keep Pitch & Floodlight palette, alias the spec's `brand.lime #D8FF3D` to existing `flood-400 #E8FF3C` (delta is ~4% — perceptually identical), add a light-theme variant via next-themes. SMS, Apple Wallet, Mapbox deferred per user direction — focus is great UI + functional depth first.

---

## Context

Phase 1 (Sprints 1-12) is fully shipped and live:
- Multi-tenant routing `/t/[slug]/*` with `requireTenant()` server-side gating
- NextAuth v5 magic-link + Google OAuth (Google still placeholder)
- Onboarding wizard, settings, team invites
- Schedule (week/month/day + click-drag-to-create + recurring), roster CRUD, programs, bookings list, payments (manual + Stripe), session notes with AI assist, one-way broadcast comms, tryouts pipeline + development board
- Public profile + booking flow
- Stripe Connect (LIVE keys wired today, webhook endpoint registered at Stripe, `on_behalf_of` set so customer receipts show tenant name not platform)
- PWA wrapper (manifest + sw.js + install prompt + offline page)

**What changed today (2026-05-17 session, in addition to Stripe wiring):**
- React 19 Compiler clean: migrated all `watch()` → `useWatch({ control, name })` in 6 form components
- Empty state added to comms page when tenant has 0 parents
- WeekView wraps in `overflow-x-auto` + min-w for mobile readability
- BookingForm 2-col grids stack at <640px
- Zero lint warnings, type-check clean, all smoke endpoints 200 on prod

**The new spec asks for a complete portal layer + data-model expansion + ops layer.** Direct file-level audit results (see Phase 1 exploration below) show ~40% of the spec is already in place at some level, ~60% is net new. The big architectural shift is **role-aware URL subdivision** (`/t/[slug]/coach/*` vs `/family/*` vs `/admin/*`) which is currently absent — all role logic today branches inside shared pages. This change cuts across every page and needs to land BEFORE the deep UI work or the UI overhauls will have to be redone.

**Locked-after-Sprint-1 files** (per the original master prompt) — `src/lib/auth.ts`, `src/lib/db.ts`, `prisma/schema.prisma`. The Stripe wiring already touched these in a limited way (env additions). For Phase 2, **schema changes are explicitly authorized** — they are required by EPIC 2.

---

## What's already in place (audit summary)

Mapping the spec to existing code:

| Epic | What exists today | Status |
|---|---|---|
| 0.1 Dev artifacts | "Sprint 1" badge in SideNav footer (`src/components/chrome/SideNav.tsx:43-47`); InstallPrompt is a bottom card not a top-bar pill | PARTIAL — needs cleanup |
| 0.2 Design tokens | Full Pitch & Floodlight palette in `src/app/globals.css:9-45`; next-themes wired dark-only in `ThemeProvider.tsx`; light CSS missing | PARTIAL |
| 0.3 A11y | Several aria-labels present (14 files, 21 occurrences); no Lighthouse audit recorded | PARTIAL |
| 1.1 Role routing | NO `/coach/*` `/family/*` `/admin/*` split; all logic in shared pages; `proxy.ts` only gates auth, not role | NO |
| 1.2 Workspace switcher | `TenantSwitcher` exists in `TopNav.tsx` but no role chip menu | PARTIAL |
| 1.3 Shells | Single shell (`src/app/t/[slug]/layout.tsx` → TopNav + SideNav); no FamilyShell, no AdminShell, no mobile bottom tab bar, no ⌘K palette | PARTIAL |
| 2.1 Schema | Players have `position` (string, not array), no `skill_tags`/`photo_url`/`notes_private`; bookings = Enrollment (5 statuses, missing attended/no_show/refunded); no Message/Thread/File/AuditLog/PermissionsOverride/StripeWebhookEvent models; Tenant has `stripeAccountId` but no KYC mirror columns | PARTIAL |
| 2.2 Permission matrix | `hasRole(actual, required)` + `canManageTenant(role)` in `src/lib/roles.ts`; no centralized feature-permission map | PARTIAL |
| 3.1 Today screen | `TodayWidget` + KPI stat cards in `OperatorDashboard.tsx`; no sparklines, no WoW deltas, no "needs attention" stack | PARTIAL |
| 3.2 Schedule | `WeekView.tsx` has click-drag-to-create + recurring; no drag-to-MOVE, no side drawer (modal only), no exception editor | PARTIAL |
| 3.3 Bookings table | Card list at `/t/[slug]/bookings` (not virtualized table); no filters, no saved views, no bulk actions, no drawer | PARTIAL |
| 4.1 Player profile | No `/roster/[playerId]` route; no tabs; no CSV import | NO |
| 4.2 Services products | `ProgramsList.tsx` shows cards; no thumbnail/QR/MTD revenue | PARTIAL |
| 4.3 Messages | `BroadcastComposer.tsx` is one-way only; no threaded conversations; no SMS | NO |
| 5.x Family portal | `ParentDashboard.tsx` exists at `/dashboard`; no `/family/*` routes; no weather, no ICS, no Apple Wallet, no e-sign waiver flow | PARTIAL |
| 6.x Admin portal | No `/admin/*` routes; no permission matrix UI; no custom domains; no audit log UI; no platform-staff impersonation | NO |
| 7.x Public page | `/[slug]` has hero + events strip + locations + ServiceCatalog; no bio/testimonials/FAQ/map/JSON-LD/save-resume booking | PARTIAL |
| 8.x Jobs | None — no Inngest/Trigger.dev | NO |
| 9.x Observability | AI session notes (Anthropic); no Sentry, no PostHog, only 3 Vitest unit tests, no Playwright | NO |

---

## Phased delivery (recommended order)

The spec is roughly **10-13 weeks** of dev work for one engineer. Sequencing matters — some phases unblock others.

### Phase A — Foundation cleanup (~3 days) | EPIC 0

Quick wins. Removes the dev artifacts visible in production, ships the design-token contract, lands a11y baseline. Doesn't touch routing or schema.

- **A.1** Remove "Sprint 1" badge from SideNav footer (`src/components/chrome/SideNav.tsx:43-47`)
- **A.2** Move InstallPrompt from bottom card to top-bar dismissible pill with 30-day localStorage dismissal (`src/components/pwa/InstallPrompt.tsx`)
- **A.3** Create `src/lib/design/tokens.ts` exporting typed token map; mirror in `tailwind.config.ts` (currently the tokens live only in `globals.css` `@theme`)
- **A.4** Add light theme — duplicate Pitch & Floodlight palette inverted, ship `[data-theme='light']` block in globals.css, flip `enableSystem={true}` in ThemeProvider, expose toggle in UserMenu
- **A.5** A11y sweep — Lighthouse-driven, target ≥95 on Dashboard, Bookings, Public page, Booking flow
- **A.6** Stamp the spec's `brand.lime` alias to `flood-400` since they're perceptually identical (#D8FF3D vs #E8FF3C) — don't add a second yellow

### Phase B — Role-aware shell + schema lift (~10 days) | EPIC 1 + 2

This phase unblocks everything else. Splits routes by portal, adds the permission system, and ships every schema addition the rest of the work needs.

- **B.1** Create `src/lib/auth/permissions.ts` with the feature map and `can(user, tenant, feature)` helper
- **B.2** Update `src/proxy.ts` to read membership.role and redirect to the right portal root on sign-in; 403 page on cross-portal access
- **B.3** **Schema migration** (one big additive migration via `prisma migrate dev --name phase-2-data-model`):
  - Tenant: add `stripeChargesEnabled`, `stripePayoutsEnabled`, `stripeDetailsSubmitted`, `stripeRequirementsDueAt`
  - Player: add `position[] → String[]`, `skillTags String[]`, `photoUrl`, `notesPrivate`
  - New ParentPlayer junction table (many-to-many)
  - Enrollment status enum: add `CONFIRMED`, `PAID`, `ATTENDED`, `NO_SHOW`, `REFUNDED`; add `attendedAt`, `cancellationReason`, `recurringSeriesId`
  - Program: add `type` enum (SINGLE/PACK/MEMBERSHIP/PROGRAM), `packSize`, `recurringInterval`, `cohortStart`, `cohortEnd`, `bookingLinkToken`
  - New models: Message, Thread, File, AuditLog, PermissionsOverride, StripeWebhookEvent, UserPreferences
- **B.4** Restructure routes — move existing pages into `src/app/t/[slug]/coach/*` (operator UI), `src/app/t/[slug]/family/*` (parent UI), `src/app/t/[slug]/admin/*` (owner+admin only). Keep public `/[slug]/*` untouched.
- **B.5** Three portal shells — `<CoachShell>`, `<FamilyShell>` (mobile bottom tab bar), `<AdminShell>`. Extract shared `<TopBar>`, `<UserMenu>` primitives.
- **B.6** `<WorkspaceSwitcher>` replacement for TenantSwitcher — adds role chip menu when user holds >1 role in the tenant.
- **B.7** Command palette ⌘K — `cmdk` is already installed (see package.json); wire to a global registry of actions.
- **B.8** Wire idempotency in `src/app/api/webhooks/stripe/route.ts` — check `StripeWebhookEvent.findUnique({ stripeId: event.id })` before processing.
- **B.9** Wire `account.updated` webhook handler — keep Tenant KYC mirror columns fresh.

### Phase C — Coach core (~10 days) | EPIC 3

Where coaches live. After Phase B, this is the biggest UX upgrade.

- **C.1** Today screen (`/t/[slug]/coach/today`) — agenda strip + needs-attention + KPIs with sparklines (use `recharts` or hand-roll SVG; lighter footprint) + quick actions
- **C.2** Schedule upgrades — `@dnd-kit/core` for drag-to-move + resize; event detail right-side drawer (replace Dialog with Sheet pattern); recurring exception editor (this / this+future / all)
- **C.3** Bookings DataTable — `@tanstack/react-table` for filters + saved views (persist in new `user_views` table) + bulk actions; row-click drawer with attendance toggle + refund + message-parent

### Phase D — Coach extended (~10 days) | EPIC 4

Where coaches do their actual ops work. SMS deferred per locked decision #4.

- **D.1** Player profile `/t/[slug]/coach/roster/[playerId]` with 6 tabs (Overview / Schedule / Attendance / Payments / Notes private / Files)
- **D.2** Auto-parent-linking on booking — match by lowercased email or normalized phone; idempotent
- **D.3** CSV bulk roster import — column mapping UI + validation preview + dry-run
- **D.4** Services as products — thumbnail upload via Vercel Blob, type-specific editor (single/pack/membership/program), share modal with copy link + `qrcode.react`, MTD revenue badge
- **D.5** Membership type → create Stripe recurring price on save; pack type tracks remaining-sessions per buyer (Enrollment.packBalance new column)
- **D.6** Messages module — two-pane thread list + conversation; recipient picker; broadcast composer with channels (email always, in-app always; SMS toggle disabled w/ "Coming soon" tooltip)
- **D.7** Add `smsOptIn` boolean to UserPreferences so future Twilio wire-up is data-ready. Do NOT wire Twilio yet.
- **D.8** Message templates table seed (cancellation/reminder/welcome/payment-overdue)

### Phase E — Family portal (~10 days) | EPIC 5

Mobile-first parent surface.

- **E.1** Family Home `/t/[slug]/family/home` — next-session hero per kid + Open-Meteo weather + ICS download. Apple Wallet pass deferred per locked decision #5; ship `.ics` only.
- **E.2** My Kids `/t/[slug]/family/kids/[playerId]` — read-only player view with strict parent-link check
- **E.3** Book + Payments — autopay toggle via Stripe Customer Portal embed
- **E.4** Forms & waivers `/t/[slug]/family/forms` — render markdown waiver, capture typed signature + IP + timestamp, store PDF in Vercel Blob, write Files row
- **E.5** Bottom tab bar on `<768px` (already partial in FamilyShell from Phase B); PWA `start_url` = `/family` for parents

### Phase F — Admin + Public (~10 days) | EPIC 6 + 7

Polish + growth surface.

- **F.1** Permission matrix UI at `/t/[slug]/admin/team` — rows = features, cols = roles, cells = view/edit/none, writes to PermissionsOverride
- **F.2** Branding settings — favicon, social share image, optional custom domain (Vercel Domains API + CNAME verify)
- **F.3** Billing dashboard `/t/[slug]/admin/billing` — Stripe Connect status, payouts list, refunds with reason, fees breakdown, optional Stripe Tax
- **F.4** Audit log `/t/[slug]/admin/audit` + data exports (CSV per entity + full tenant zip); GDPR delete with player redaction
- **F.5** Platform admin `/admin/*` — tenants list with MRR, impersonation with banner + audit trail, feature flags table per tenant
- **F.6** Public page upgrades — coach bio editor, testimonials, service comparison, FAQ accordion, JSON-LD (LocalBusiness + Person + Offer). Map render deferred per locked decision #6; show address text + "Get directions" Google Maps deep-link.
- **F.7** Booking flow — real availability calculation from coach working hours + existing bookings (replace "Suggested times" chips); 15-min tentative hold; save-and-resume via magic link; post-booking "Create account" CTA

### Phase G — Ops layer (~5 days) | EPIC 8 + 9

Reliability + insight. Per locked decision #3 — Vercel Cron, no third-party job runner.

- **G.1a** **Vercel Cron schedule** in `vercel.json`:
  - `0 * * * *` (hourly) → `/api/cron/booking-reminders` — fans out 24h-out and 2h-out reminder emails
  - `*/15 * * * *` (every 15 min) → `/api/cron/no-show-sweep` — marks ATTENDED-bearing events ended 30min+ ago as NO_SHOW if attendance was never set
  - `0 */6 * * *` (every 6h) → `/api/cron/payment-retry` — Stripe-side retry attempt on FAILED invoices
- **G.1b** Inline event emission — `booking.created` continues to fire send-email synchronously from the server action. No queue.
- **G.1c** Cron endpoint security — gate `/api/cron/*` on `x-vercel-cron` header + `CRON_SECRET` bearer fallback
- **G.2** Notification preferences UserPreferences table → per-event-type channel toggles honored by both inline emission and cron jobs
- **G.3** Sentry — frontend + server actions (Vercel + Sentry integration)
- **G.4** PostHog — `booking_started`, `booking_completed`, `attendance_marked`, `broadcast_sent`
- **G.5** Playwright e2e — 4 critical flows: parent books, coach marks attendance, admin invites teammate, parent pays balance
- **G.6** CI block on failing e2e

---

## Decisions locked (user-confirmed 2026-05-17)

1. **Start order**: Phase A → Phase B sequentially. Phase A first for fastest visible wins, then the big routing/schema lift.

2. **`brand.lime` aliasing**: Existing `flood-400 #E8FF3C` is perceptually identical to spec's `#D8FF3D`. Alias rather than introduce a second yellow.

3. **Background jobs runtime**: Vercel Pro is available — use **Vercel Cron** for scheduled work (booking.upcoming.24h, booking.upcoming.2h, booking.no_show auto-mark, payment.retry). Use **inline server actions** for event-driven work (booking.created → email already works this way today). No Inngest, no Trigger.dev. If event volume outgrows Vercel Cron later, revisit Inngest.

4. **SMS**: Deferred. Phase D ships messages module email-only. Add `smsOptIn` boolean to UserPreferences so the future Twilio wire-up is data-ready. Revisit when 20+ tenants are live.

5. **Apple Wallet pass**: Skipped. Ship `.ics` calendar download only in Phase E. Apple Developer cert + signing pipeline is too much overhead for v1 — focus on great UI + functional depth instead.

6. **Mapbox**: Skipped for v1 in line with user direction ("focus on UI/functions, advanced stuff later"). Public page location section renders address + "Get directions" deep-link to Google Maps. Revisit map render in a later sprint.

7. **Custom domain**: Stay on `kicknscream.vercel.app` for now. Migrating to `kicknscream.app` is a Phase F sub-task gated on user provisioning the domain.

---

## Critical files to read before starting any phase

- `kicknscream/kicknscream.md` — master strategic plan (canonical product brief)
- `kicknscream/AGENTS.md` — Next 16 breaking-change reminder
- `src/lib/roles.ts` — role hierarchy + permission helpers (will be replaced by `lib/auth/permissions.ts` in Phase B)
- `src/lib/tenant.ts` — `requireTenant()` pattern; every page uses this
- `src/lib/db.ts` — Prisma singleton wired to PrismaNeon adapter (LOCKED — don't modify)
- `src/lib/auth.ts` — NextAuth v5 config (LOCKED — don't modify; if Phase G needs anything, ship as wrapper)
- `src/proxy.ts` — current auth gate; gets the role-routing logic in Phase B
- `prisma/schema.prisma` — full schema; Phase B is the only authorized schema-touching phase
- `src/app/t/[slug]/layout.tsx` — single shell today; gets split into 3 in Phase B

---

## Verification

Each phase has its own acceptance criteria in the user's spec. Cross-cutting verification per phase:

- **Phase A**: Lighthouse a11y ≥95 on 4 pages, no "Sprint" badge anywhere in prod HTML, theme toggle works without FOUC, all design tokens visible at staff-gated `/internal/design` route
- **Phase B**: Parent signing in lands at `/family/home`, cross-portal access returns 403, schema migration applies cleanly to local + production Neon, all existing pages still load after move (use Vercel preview deploys per PR)
- **Phase C**: 60fps drag-to-move on schedule, DataTable handles 5k rows virtualized, filters update URL query params
- **Phase D**: Parent auto-links on booking by email match, CSV imports show row-level errors, Twilio sends to opt-in parents
- **Phase E**: Lighthouse PWA "installable" + mobile usability 100, ICS downloads work on iOS Safari + Android Chrome, e-sign produces valid signed PDF
- **Phase F**: Custom domain verifies + cert issues; impersonation banner appears + actions audited; Google Rich Results test passes for public page
- **Phase G**: Inngest dashboard shows job executions, Sentry captures intentional error, PostHog funnel renders, Playwright CI blocks merge on failing flow

---

## Out of scope (deferred until later)

- Native iOS/Android apps (the PWA is the mobile strategy)
- AI session-note generation enhancements (already shipped Sprint 10)
- Insights / reporting dashboards beyond the Today KPIs
- AI-driven personalization
- Spanish localization
- White-label / multi-platform setup beyond per-tenant branding

The spec doesn't ask for these — listed here so they don't creep in.
