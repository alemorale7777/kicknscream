# KickNScream — Master Build Plan

## 1. Strategic Frame

**What this actually is:** A modern, soccer-specific operations platform built around three tenant archetypes — individual coaches, skills institutions/academies, and competitive club teams — all running on one codebase with tenant-typed feature configurations.

**Why this wins:**

The incumbents (SportsEngine, TeamSnap, LeagueApps, PlayMetrics) are bloated multi-sport generalists with dated UX, slow mobile experiences, and pricing built for the enterprise sales motion. The institution you're already talking to has all four pain points lit up at once — that's not a niche complaint, that's the entire category being broken. A 500+ kid multi-location operation paying for SportsEngine is paying a lot of money for software the staff hates using.

Your wedge is: soccer-only, mobile-first, modern UX, half the price, built by a coach who lives the workflow. You are simultaneously customer zero (Product 1), design partner with a real paying B2B customer (Product 2), and future operator (Product 3). Nobody else competing in this space has that triangle.

**Who you actually compete with:**

- For institutions at 500+ kids: SportsEngine (~$300–800/mo with add-ons), PlayMetrics (~$99–500/mo), LeagueApps (mid-tier). All beatable on UX and price.
- For individual coaches: CoachUp's coach-facing tools, plus DIY (Squarespace + Cal.com + Stripe).
- For clubs: same as institutions, plus Tonsser, Heja, SportEasy.

The unfair advantage you have: You're going to use the institution as a live design partner. Every Tuesday they tell you what's broken, every Friday you ship the fix. By month 3 you have a software product that's been operationally validated by a 500+ kid multi-location institution. That's a sales weapon no competitor can match without spending 18 months on it.

---

## 2. Multi-Tenant Architecture

### The core mental model

One database, one app, three tenant types sharing 80% of the schema. The remaining 20% is feature-flagged per tenant type.

```
Tenant Types:
├── COACH        → Single coach, simple booking, intake forms, session notes
├── INSTITUTION  → Multi-coach, classes/sessions, rosters, payments, comms, multi-location
└── CLUB         → Teams, recruitment funnel, player development, league/season
```

Each tenant has a subdomain or path: `coach-alej.kicknscream.com`, `pdx-skills.kicknscream.com`, `timbers-academy.kicknscream.com`. Each user can belong to multiple tenants in different roles (Alej is admin of his coach tenant, head coach at PDX Skills institution, future founder of his club).

### Tech stack (locking in your existing comfort zone)

```
Frontend:    Next.js 15 (App Router) + TypeScript + Tailwind v4 + shadcn/ui
Auth:        NextAuth v5 with magic links + Google OAuth
DB:          Neon Postgres
ORM:         Prisma
Payments:    Stripe Connect (for institutions to receive parent payments)
File storage: Vercel Blob (videos, photos, waivers)
Email:       Resend (transactional) + magic links
SMS:         Twilio (parent notifications, opt-in)
Real-time:   Pusher or Ably (live attendance, game updates)
Hosting:     Vercel
AI:          Anthropic SDK (Claude for session notes, intake summaries)
PWA:         next-pwa for installable mobile experience
Monitoring:  Sentry + Vercel Analytics
```

You know this stack cold. No new tech to learn means more time shipping features.

### Prisma schema (foundation — sprint 1 starting point)

```prisma
// User can belong to multiple tenants with different roles
model User {
  id            String          @id @default(cuid())
  email         String          @unique
  name          String?
  phone         String?
  emailVerified DateTime?
  image         String?
  memberships   Membership[]
  sessions      Session[]
  accounts      Account[]
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
}

model Tenant {
  id            String          @id @default(cuid())
  slug          String          @unique         // "coach-alej", "pdx-skills"
  name          String                          // "Coach Alej", "PDX Skills"
  type          TenantType                      // COACH | INSTITUTION | CLUB
  logoUrl       String?
  primaryColor  String?                         // brand color
  subscription  Subscription?
  stripeAccountId String?                       // Stripe Connect account
  memberships   Membership[]
  locations     Location[]
  programs      Program[]
  players       Player[]
  events        Event[]
  invoices      Invoice[]
  waivers       Waiver[]
  invitations   Invitation[]
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
}

enum TenantType {
  COACH
  INSTITUTION
  CLUB
}

model Membership {
  id        String   @id @default(cuid())
  userId    String
  tenantId  String
  role      Role                                // OWNER | ADMIN | COACH | PARENT | PLAYER
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  @@unique([userId, tenantId])
}

enum Role {
  OWNER          // Founder/owner of the tenant
  ADMIN          // Has full management access
  COACH          // Can lead sessions, take attendance, write notes
  PARENT         // Has player(s) registered
  PLAYER         // The kid (linked to parent)
}

model Location {
  id        String   @id @default(cuid())
  tenantId  String
  name      String                              // "Beaverton Indoor Soccer Center"
  address   String?
  events    Event[]
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

// A Program is a logical grouping: "Tuesday U10 Skills", "Saturday Tots", "Summer Camp Week 1"
model Program {
  id          String         @id @default(cuid())
  tenantId    String
  name        String
  description String?
  ageMin      Int?
  ageMax      Int?
  skillLevel  SkillLevel?
  price       Int                                // in cents
  priceModel  PriceModel                         // PER_SESSION | PACKAGE | MONTHLY | SEASON
  capacity    Int?
  events      Event[]
  enrollments Enrollment[]
  tenant      Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  archived    Boolean        @default(false)
}

enum SkillLevel { BEGINNER INTERMEDIATE ADVANCED ELITE }
enum PriceModel { PER_SESSION PACKAGE MONTHLY SEASON FREE }

// An Event is a single scheduled occurrence: practice, lesson, game, tryout, camp day
model Event {
  id            String          @id @default(cuid())
  tenantId      String
  programId     String?
  locationId    String?
  type          EventType
  title         String
  startsAt      DateTime
  endsAt        DateTime
  capacity      Int?
  attendances   Attendance[]
  notes         SessionNote[]
  tenant        Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  program       Program?        @relation(fields: [programId], references: [id])
  location      Location?       @relation(fields: [locationId], references: [id])
}

enum EventType { LESSON CLASS PRACTICE GAME TRYOUT CAMP CLINIC }

model Player {
  id           String         @id @default(cuid())
  tenantId     String
  firstName    String
  lastName     String
  dob          DateTime
  parentId     String?                           // Links to User (parent role)
  position     String?                           // for club tenant
  jerseyNumber Int?                              // for club tenant
  notes        String?
  enrollments  Enrollment[]
  attendances  Attendance[]
  developmentNotes DevelopmentNote[]
  waiverSignatures WaiverSignature[]
  tenant       Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model Enrollment {
  id         String   @id @default(cuid())
  playerId   String
  programId  String
  status     EnrollmentStatus
  invoiceId  String?
  player     Player    @relation(fields: [playerId], references: [id], onDelete: Cascade)
  program    Program   @relation(fields: [programId], references: [id])
  invoice    Invoice?  @relation(fields: [invoiceId], references: [id])
  createdAt  DateTime  @default(now())
}

enum EnrollmentStatus { PENDING ACTIVE WAITLIST CANCELED COMPLETED }

model Attendance {
  id        String           @id @default(cuid())
  eventId   String
  playerId  String
  status    AttendanceStatus
  checkedInAt DateTime?
  checkedInBy String?                            // User ID of who marked attendance
  event     Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  player    Player           @relation(fields: [playerId], references: [id], onDelete: Cascade)
  @@unique([eventId, playerId])
}

enum AttendanceStatus { PRESENT ABSENT LATE EXCUSED PENDING }

model SessionNote {
  id        String   @id @default(cuid())
  eventId   String
  playerId  String?                              // null = general session note
  authorId  String                               // User ID of coach
  content   String                               // markdown
  visibleToParent Boolean @default(true)
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}

model DevelopmentNote {
  id        String   @id @default(cuid())
  playerId  String
  authorId  String
  category  String?                              // "Ball Control", "Decision Making"
  rating    Int?                                 // 1-5
  content   String
  player    Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}

// Payment unification — handles Stripe, cash, check, Venmo, Zelle
model Invoice {
  id              String         @id @default(cuid())
  tenantId        String
  payerEmail      String                         // parent email
  amount          Int                            // cents
  currency        String         @default("usd")
  status          InvoiceStatus
  description     String?
  stripePaymentIntentId String?
  payments        Payment[]                      // can have multiple payments (deposits, etc)
  enrollments     Enrollment[]
  tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdAt       DateTime       @default(now())
  paidAt          DateTime?
}

enum InvoiceStatus { DRAFT SENT PARTIAL PAID OVERDUE VOIDED }

model Payment {
  id          String        @id @default(cuid())
  invoiceId   String
  amount      Int
  method      PaymentMethod
  reference   String?                            // check #, Venmo handle, etc
  recordedBy  String?                            // User ID of admin who manually recorded
  invoice     Invoice       @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  createdAt   DateTime      @default(now())
}

enum PaymentMethod { CARD CASH CHECK VENMO ZELLE PAYPAL ACH OTHER }

model Waiver {
  id          String   @id @default(cuid())
  tenantId    String
  title       String
  body        String                             // markdown
  required    Boolean  @default(true)
  signatures  WaiverSignature[]
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model WaiverSignature {
  id          String   @id @default(cuid())
  waiverId    String
  playerId    String
  signerName  String
  signerEmail String
  signedAt    DateTime @default(now())
  ipAddress   String?
  waiver      Waiver   @relation(fields: [waiverId], references: [id], onDelete: Cascade)
  player      Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
}

model Subscription {
  id              String   @id @default(cuid())
  tenantId        String   @unique
  plan            SubPlan
  stripeSubId     String?
  status          String
  currentPeriodEnd DateTime?
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

enum SubPlan { COACH_FREE COACH_PRO INST_STARTER INST_GROWTH INST_SCALE CLUB_STANDARD CLUB_PRO }

// Recruitment is club-only
model TryoutSignup {
  id          String   @id @default(cuid())
  tenantId    String
  playerName  String
  parentEmail String
  parentPhone String?
  ageGroup    String
  videoUrl    String?
  notes       String?
  status      TryoutStatus  @default(PENDING)
  createdAt   DateTime  @default(now())
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

enum TryoutStatus { PENDING INVITED ATTENDED OFFERED ACCEPTED DECLINED }
```

This schema is the foundation — every feature you add slots in cleanly. The "all-in-one platform" you originally pitched? It's just additional models on top of this (`PickupGame`, `MarketplaceListing`, `ScoutReport`).

---

## 3. Full Feature Spec by Tenant Type

### Shared core (every tenant gets these)
- Tenant onboarding wizard (name, type, logo, color, locations)
- Auth (NextAuth: magic link + Google)
- Role-based access control
- Dashboard with tenant-typed widgets
- Schedule/calendar view (week, month, day)
- Roster/player list with filters
- Parent communication: in-app + email + SMS (opt-in)
- Payment unifier (Stripe Connect + manual entry for cash/check/Venmo/Zelle)
- Waiver system with digital signatures
- Mobile PWA (installable, offline read-only fallback)
- Settings, billing, team members

### COACH tenant (Product 1 — your personal site)

**MVP — sprints 1–3:**
- Public marketing page (hero, philosophy, results, testimonials, video clips)
- Booking flow: pick service → pick time → intake form → Stripe checkout
- Parent dashboard: upcoming sessions, history, receipts
- Coach dashboard: today's sessions, upcoming, intake responses
- Session notes: post-session note → auto-emailed to parent
- Package management: single, 5-pack, 10-pack, monthly

**Nice-to-haves (v2):**
- AI session-note assistant (you talk into your phone, Claude writes the parent-ready summary)
- Recurring bookings
- Discount codes
- Referral rewards

### INSTITUTION tenant (Product 2 — the SaaS bet)

**MVP — sprints 4–8:**
- Multi-location management
- Multi-coach with permissions
- Program creator (sessions, classes, camps, clinics)
- Registration flow: public catalog → register player → waiver → payment
- Roster per program with quick filters
- Attendance: tap-to-mark, bulk check-in, QR code at door
- Parent communication: email + SMS broadcasts, segmented by program/age/location
- Payment unifier: Stripe Connect for cards, manual entry for cash/check/Venmo with reconciliation dashboard
- Waiver system: per-program or per-tenant
- Financial reporting: revenue by program, location, coach
- Parent portal: see kid's schedule, attendance history, balance, pay invoices

**v2 (sprints 9–11):**
- Coach payroll: track coach hours, calculate pay, export to Gusto/Quickbooks
- Camp/clinic week-long management
- Waitlist auto-promotion
- Refund flow with policy
- Reports: attendance trends, retention, churn risk

**v3 (later):**
- White-label per institution
- API + webhooks
- Custom branded mobile app

### CLUB tenant (Product 3 — your future club)

**MVP — sprints 12+:**
- Team management (multiple teams by age/gender)
- Tryout signup form (public) → coach review dashboard → invite/offer flow
- Player profile: stats, position, jersey #, development notes
- Practice/game schedule with RSVP
- Game results, lineups, basic stats
- Season fees: payment plans, scholarships, refunds
- Player development tracker: scout-style notes with ratings
- Club-specific comms: parent/player/team-specific messages

**v2:**
- Recruitment scoring rubric
- Video upload for player evaluation
- Public team page (record, schedule, news)
- Showcase/tournament management

---

## 4. Sprint Plan (12 Weeks, Real Sequencing)

12 sprints, ~5 days each = ~60 working days = 3+ months. Goal: skills institution as paying customer by end of Week 8. Personal coach site ships earlier as validator and case study.

### Phase 1: Foundation (Weeks 1–2)

**Sprint 1 — Project scaffold + auth + tenant model**
- Next.js 15 App Router setup with Tailwind v4, shadcn/ui
- Prisma schema deployed to Neon (core models)
- NextAuth with magic links + Google OAuth
- Tenant creation flow: create tenant, pick type, get slug
- Path-based routing: `/t/[slug]/...` (subdomain in a later sprint)
- Membership invitation flow
- Basic dashboard shell per tenant type

**Sprint 2 — Core scheduling + roster**
- Event/calendar model wired up
- Week/month/day views
- Create event manually (single, recurring)
- Player/roster CRUD
- Parent-player linking
- Public profile page for tenant (marketing surface)

### Phase 2: Coach Tenant MVP (Weeks 3–4)

**Sprint 3 — Coach tenant: booking + Stripe**
- Public coach page: hero, philosophy, services, testimonials
- Service catalog: single sessions, 5-packs, 10-packs
- Booking flow: pick service → calendar → intake form → checkout
- Stripe Connect onboarding for the coach tenant
- Stripe checkout for one-off payments
- Email confirmations via Resend

**Goal at end of sprint:** Alej's personal coach site is live and parents can book and pay.

**Sprint 4 — Coach tenant: session notes + parent portal**
- Post-session note flow with markdown editor
- Auto-email session note to parent
- Parent dashboard: upcoming sessions, history, receipts, balance
- Coach mobile view: today's schedule with one-tap "complete + add note"
- Reminders: 24hr before session SMS/email

**Validation milestone:** book your first 3 paid sessions. If you can't, stop and figure out why before building Product 2.

### Phase 3: Institution Tenant MVP (Weeks 5–8)

**Sprint 5 — Institution: programs + registration**
- Program model fully wired (classes, camps, clinics, recurring)
- Public catalog page per institution
- Registration flow: select program → register player → intake → waiver → payment
- Multi-coach assignment to programs
- Multi-location selector

**Migration moment:** move the actual skills institution onto the platform in shadow mode.

**Sprint 6 — Institution: attendance + roster operations**
- Roster view per program, filter by age, level, location, coach
- Attendance UI: tap-to-mark, bulk operations
- QR code check-in (parent shows code at door, staff scans)
- Coach mobile view: today's class, take attendance in 30 seconds
- Attendance history per player

**Sprint 7 — Institution: payments + financial unification**
- Stripe Connect for institution → parents pay institution
- Manual payment entry: cash, check, Venmo, Zelle with reconciliation
- Invoice generation per enrollment
- Payment plans (split into installments)
- Outstanding balance dashboard
- Revenue reports: by program, location, coach, time period

This is the differentiator. No competitor handles all 4 payment methods cleanly with reconciliation.

**Sprint 8 — Institution: comms + go-live**
- Email broadcasts via Resend (segmented by program, age, location)
- SMS broadcasts via Twilio (with opt-in management)
- Templated messages: cancellation, weather, registration open, balance reminder
- Parent portal polish

The skills institution goes fully live on KickNScream. Paying customer #1.

### Phase 4: Polish + AI + Club Foundation (Weeks 9–12)

**Sprint 9 — Mobile PWA + reliability**
- Full PWA wrapping with next-pwa
- Offline-first for read operations (today's schedule, roster)
- Push notifications for parents
- Sentry monitoring
- Performance: target <1s page loads on 4G

**Sprint 10 — AI features (Claude API)**
- AI session note: voice-to-note for coaches
- AI intake summarizer
- AI message drafter

**Sprint 11 — Reporting + retention tools**
- Attendance heatmaps (which kids are at risk of dropping)
- Cohort retention reports
- Revenue forecasting
- Coach utilization
- Export to CSV for all reports

**Sprint 12 — Club tenant foundation**
- Team model wired up
- Public tryout signup form
- Coach review dashboard for tryouts
- Player development notes with rating system
- Game/practice scheduling reused from event model

---

## 5. Pricing & Monetization

### Coach tier
- **Free** — public booking page, up to 5 bookings/month, 5% platform fee on transactions
- **Pro — $19/mo** — unlimited bookings, custom domain, 0% platform fee (just Stripe's 2.9%), session notes auto-email, package management
- **Elite — $39/mo** — everything in Pro + AI session notes, SMS reminders, package discount codes

### Institution tier (the moneymaker)
- **Starter — $79/mo** — up to 100 active players, 2 locations, unlimited programs, all payment methods, basic reports
- **Growth — $179/mo** — up to 500 active players, 5 locations, payroll exports, SMS broadcasts, AI features
- **Scale — $349/mo** — unlimited players + locations, custom branding, priority support, API access, dedicated success person (you, initially)
- **Enterprise — custom** — for >2000 player institutions or multi-state operations

Skills institution at 500+ kids → Growth tier at $179/mo. That's your first ~$2,150/year MRR contract.

Compare to SportsEngine charging similar institutions $300–800/mo with worse UX. Your pricing is the second-strongest weapon after UX.

### Club tier
- **Standard — $99/mo** — up to 100 players, 5 teams, tryout funnel, parent comms
- **Pro — $249/mo** — unlimited players + teams, recruitment scoring, video uploads, public team pages, multi-season management

### Transaction fees
- For free coach tier: 5% on transactions (similar to Calendly/Acuity)
- For all paid tiers: 0% platform fee, just Stripe's 2.9% + $0.30

This makes the upgrade math obvious for any coach doing more than ~$400/mo in transactions.

---

## 6. Go-To-Market: Landing Customer Zero

The institution is already asking — don't sell them, partner with them.

**Step 1: Frame it as design partnership, not vendor sale.**

"I'm building software specifically for institutions like yours. I want you to be my founding partner. Here's the deal — I build it around your workflow, you get the first 6 months free, after that you pay $179/mo for as long as you stay. I get a real customer and a case study, you get software built for you at a fraction of what SportsEngine costs."

**Step 2: Weekly cadence.**

Tuesday 30-min call with the institution's admin. They tell you what's broken this week. Friday you ship the fix. By month 3, the software is operationally validated.

**Step 3: Shadow-mode migration.**

Don't ask them to switch cold. For 4 weeks (Sprint 5–8), they run KickNScream in parallel with their current software. Once KickNScream handles all critical workflows reliably, they cut the old one.

**Step 4: Case study.**

Month 4: write the case study. "How [Institution] saved $X/year and Y hours/week with KickNScream." This becomes your #1 sales asset for institution #2, #3, #4.

**Step 5: Niche-down for outreach.**

Cold outreach to soccer skills academies / private soccer institutions / small-to-mid soccer clubs in Oregon and Washington. Not generic youth sports. Soccer-specific. Mention the Portland case study. The first 5 customers come from your network and warm leads, not paid ads.

---

## 7. Design System: Pitch & Floodlight

Locked in Sprint 1. Every later sprint inherits these tokens.

- **Background:** `#0A1410` (midnight pitch)
- **Primary:** `#1FB663` (turf green) — CTAs, success, focus
- **Accent:** `#E8FF3C` (floodlight yellow) — key moments only, never default
- **Line/chalk:** `rgba(255,255,255,0.14)` — borders, grid, dividers
- **Text high:** `#F5F7F4`
- **Text low:** `#94A39B`
- **Font:** Geist Sans (UI) + Geist Mono (numbers, slugs, code)
- **Motion:** 180ms snap (cubic-bezier(0.2, 0, 0, 1)) — fast, definitive, no bouncy springs

Soccer-specific without being kitschy. Athletic but premium — Linear meets Nike Pro.

---

## 8. Reality Check on Fit With Your Current Slate

12 sprints @ ~5 days each = ~60 working days = 3+ months of focused work. That conflicts with Fetti and TableSharp launches.

**Sequencing discipline:**

- **Now → Week 2:** Sprints 1–2 in evenings/weekends. Foundation work. Doesn't block Fetti revenue push.
- **Weeks 3–4:** Sprint 3–4 (your coach site). Ship it. Validate with 3 bookings. This is also a Fetti marketing asset.
- **Week 5+:** Decision point. If Fetti has first revenue and TableSharp has first paying user, full-send on Sprints 5–12 for the institution. If Fetti and TableSharp are still pre-revenue, pause KickNScream after Sprint 4 and finish them first.

Don't do all three at once. The coach site (Sprints 1–4) can fit alongside Fetti because it's small and personally validating. The institution SaaS (Sprints 5–12) cannot — that needs full focus.
