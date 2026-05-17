# KickNScream

> Soccer-specific operations platform — coaches, academies, and clubs on one stack.

Built by a coach who lives the workflow. Replaces SportsEngine, TeamSnap, and three other apps with a mobile-first SaaS designed for parents.

## What's here (Sprint 1)

The foundation:

- **Multi-tenant data model** — one Postgres schema serving three tenant archetypes: COACH, INSTITUTION, CLUB. Sharing 80%, feature-flagged at the app layer for the rest.
- **Auth** — magic links (Resend) + Google OAuth via NextAuth v5
- **Path-based tenant routing** — `/t/[slug]/...`, gated by a `proxy.ts` auth middleware
- **Tenant onboarding wizard** — 4 steps (type → details → optional location → confirm) with Vercel Blob logo upload + live slug availability
- **Tenant dashboard shell** — tenant-typed welcome state, side nav, stat cards
- **Settings** — tenant info, locations CRUD, team management, danger-zone delete
- **Invitations** — branded email, 7-day token, accept/revoke flow
- **Design system: Pitch & Floodlight** — midnight pitch + turf green + floodlight yellow + chalk-line grid

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, RSC, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind v4 (`@theme` CSS-first) + custom token system |
| UI primitives | shadcn-style on Radix, retuned to Pitch & Floodlight |
| Auth | NextAuth v5 (Auth.js) — Resend magic link + Google OAuth |
| Database | Neon Postgres via Prisma 7 + `@prisma/adapter-neon` |
| ORM | Prisma 7 |
| File storage | Vercel Blob |
| Email | Resend |
| Forms | react-hook-form + zod |
| Toasts | sonner |
| Tests | vitest |
| Fonts | Geist Sans + Geist Mono |
| Hosting | Vercel |

## Getting started

```bash
# 1. Install
pnpm install

# 2. Configure secrets
cp .env.example .env.local
# Edit .env.local with real values (see ENV section below)

# 3. Push schema to Neon
pnpm db:push

# 4. Run dev
pnpm dev
```

Open http://localhost:3000.

## Required environment variables

See `.env.example` for the full list. To get Sprint 1 working you need:

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Neon dashboard → Connection details → Pooled connection |
| `DIRECT_URL` | Neon dashboard → Connection details → Direct connection |
| `AUTH_SECRET` | Run `pnpm dlx auth secret` or `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` in dev, your prod URL in prod |
| `AUTH_RESEND_KEY` | Resend dashboard → API keys |
| `EMAIL_FROM` | A verified Resend sender (use `onboarding@resend.dev` to start) |
| `AUTH_GOOGLE_ID` | Google Cloud Console → APIs & Services → Credentials |
| `AUTH_GOOGLE_SECRET` | Same |
| `BLOB_READ_WRITE_TOKEN` | Auto-injected by `vercel link` once a Blob store is connected |

### Google OAuth redirect URIs

In Google Cloud Console, add these to your OAuth client's authorized redirect URIs:
- `http://localhost:3000/api/auth/callback/google` (dev)
- `https://<your-prod-domain>/api/auth/callback/google` (prod)

## Scripts

```bash
pnpm dev          # next dev (Turbopack)
pnpm build        # prisma generate + next build
pnpm start        # production server
pnpm test         # vitest run
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm db:push      # prisma db push (sync schema to DB without migrations)
pnpm db:studio    # prisma studio (visual DB explorer)
pnpm db:migrate   # prisma migrate dev (create + apply migration)
```

## Architecture

### Multi-tenancy

Every user can belong to multiple tenants via `Membership` rows with one of 5 roles:
- **OWNER** — founder, only one per tenant, can delete the tenant
- **ADMIN** — full management access
- **COACH** — leads sessions, takes attendance, writes notes
- **PARENT** — has player(s) registered
- **PLAYER** — the kid

Role hierarchy: `OWNER > ADMIN > COACH > PARENT > PLAYER`. See `src/lib/roles.ts` for `hasRole()`.

### Tenant resolution

Pages under `/t/[slug]/*` resolve via `requireTenant(slug)` in `src/lib/tenant.ts`. Returns `{ tenant, user, membership }` or 404s on missing tenant / non-member.

### Folder layout

```
src/
├── actions/        # 'use server' server actions
├── app/            # App Router pages and routes
├── components/
│   ├── brand/      # Wordmark, ChalkGrid, Floodlight
│   ├── chrome/     # TopNav, SideNav, TenantSwitcher, UserMenu, SettingsNav
│   ├── onboarding/ # Wizard + 4 step components
│   ├── providers/  # ThemeProvider
│   ├── settings/   # TenantSettingsForm, LocationsManager, TeamManager, DangerZone
│   └── ui/         # shadcn-style primitives on Radix
├── lib/            # auth, db, env, slug, nav, roles, tenant, invitations, utils
├── tests/          # vitest unit tests (slug, nav, roles)
└── types/          # next-auth augmentation
```

## Locked-after-Sprint-1 files

Do not modify without explicit instruction:
- `src/lib/auth.ts`
- `src/lib/db.ts`
- `prisma/schema.prisma`

## Design system: Pitch & Floodlight

See `docs/design-tokens.md` for the full reference. TL;DR:

- **Background:** `pitch-900` (`#0A1410`)
- **Primary:** `turf-400` (`#1FB663`)
- **Accent:** `flood-400` (`#E8FF3C`)
- **Lines:** `rgba(255,255,255,0.14)` chalk
- **Motion:** 180ms snap, no springs

## What's next (Sprint 2)

- Event/Calendar model + week/month/day views
- Player/roster CRUD
- Parent-player linking
- Public tenant profile page

The full 12-sprint plan lives in [kicknscream.md](./kicknscream.md).
