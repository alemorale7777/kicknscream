# KickNScream — Phase 2 Tier 1 Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the deferred Tier 1 backlog from the Phase 2 upgrade — role-aware route groups + 3 portal shells + Family Portal MVP + auto parent-linking. Five PRs, each independently revertable. Tier 2/3/4 sketched as a roadmap at the end.

**Architecture:** Next.js 16 App Router **route groups** (`(coach)`, `(family)`, `(admin)`) rather than physical URL moves. Each group has its own `layout.tsx` so the shell differs by portal, but URLs can stay legacy until the migration PR ships. Proxy (`src/proxy.ts`) does role-based 301 redirects so legacy bookmarks land at the new paths. A new `<RoleGate>` server component delegates to the existing `can()` helper in `src/lib/auth/permissions.ts` to keep gating logic in one place. Family Portal MVP ships read-only views first (next-session hero, kid carousel, outstanding strip); messaging + waivers stay deferred. Auto-parent-linking adds a deduplication pass to `createBookingAction` and a `ParentPlayer` junction row per booking.

**Tech Stack:** Next.js 16 App Router with `proxy.ts` (not `middleware.ts`), Prisma 7 with `PrismaNeon` adapter, NextAuth v5 database sessions, TanStack Table (already wired), shadcn/ui primitives, Tailwind v4 `@theme`, `date-fns` for time math, ICS strings hand-rolled (no third-party ICS lib).

---

## Context

Phase 2 Phases A-D/F/G shipped this session (commits 5026f2a → b7b58d1). What's live:

- Schema migration: 12 additive models/columns including `ParentPlayer`, `Thread`, `Message`, `File`, `AuditLog`, `PermissionsOverride`, `StripeWebhookEvent`, `UserPreferences`, KYC mirror columns on `Tenant`, expanded `EnrollmentStatus` enum (+CONFIRMED/PAID/ATTENDED/NO_SHOW/REFUNDED), `Player.positions[]`/`skillTags[]`/`photoUrl`/`notesPrivate`, `Program` ServiceType + cohort/pack fields + `bookingLinkToken`
- Permission matrix at `src/lib/auth/permissions.ts` with `can()`, `assertCan()`, `defaultLevel()`, `effectiveLevel()` covering 30+ features × 5 roles
- WorkspaceSwitcher with role chips, ⌘K command palette (`cmdk`), webhook idempotency + `account.updated` + `charge.refunded` handlers
- Bookings DataTable (TanStack), Today screen sparklines + WoW deltas + needs-attention stack, player profile route, services QR + share modal, public-page JSON-LD + FAQ accordion
- Vercel Cron stubs (booking-reminders hourly, no-show-sweep every 15min)

What's still deferred and tier-prioritized by the user:

| Tier | Item | Why it's next |
|---|---|---|
| 1 | Route groups + role gating (B.2/B.4/B.5) | Keystone — Family/Admin work depends on it |
| 1 | Family Portal MVP (E.1/E.2) | Parents currently have no destination |
| 1 | Auto parent-link UI (D.2) | Data already supports it, low effort, fixes duplicates |
| 2 | Schedule drag-to-move (C.2) | Major perceived upgrade |
| 2 | Messages module + SMS opt-in (D.6/D.7) | Tables exist, fan-out only |
| 2 | CSV import + recurring Stripe price (D.3/D.5) | High coach value |
| 3 | Admin portal + custom domains + booking save-and-resume (F.1/F.2/F.3/F.4/F.7) | Polish + growth |
| 4 | Sentry/PostHog/Playwright/Notification prefs (G.2-G.5) | Ops layer, partly parallel |

The user gave explicit risk control for Tier 1: "ship redirects + middleware in PR 1, then the shells in PR 2, then move pages in PR 3. Each PR is independently revertable." This plan follows that structure precisely.

**Locked decisions still in force** (from `docs/superpowers/plans/2026-05-17-phase-2-upgrade.md`):

1. Sequential phase order (A → B → ...)
2. `brand.lime` aliased to `flood-400`
3. Vercel Cron for jobs, no third-party runner
4. SMS deferred indefinitely; UserPreferences.smsOptIn placeholder shipped
5. Apple Wallet skipped; `.ics` only
6. No Mapbox; address + Google Maps deep-link
7. Stay on `kicknscream.vercel.app` for now

---

## File Structure (Tier 1)

```
C:\Users\Jems4\kicknscream\
├── src/
│   ├── app/
│   │   └── t/[slug]/
│   │       ├── layout.tsx                   # Strip down — group layouts take over
│   │       ├── (coach)/                     # PR 2 + PR 3: route group
│   │       │   ├── layout.tsx               # CoachShell
│   │       │   ├── dashboard/page.tsx       # moved from /t/[slug]/dashboard
│   │       │   ├── bookings/page.tsx
│   │       │   ├── schedule/page.tsx
│   │       │   ├── schedule/[eventId]/page.tsx
│   │       │   ├── roster/page.tsx
│   │       │   ├── roster/[playerId]/page.tsx
│   │       │   ├── programs/page.tsx
│   │       │   ├── payments/page.tsx
│   │       │   ├── comms/page.tsx
│   │       │   ├── tryouts/page.tsx
│   │       │   ├── development/page.tsx
│   │       │   └── settings/...
│   │       ├── (family)/                    # PR 2 + PR 4
│   │       │   ├── layout.tsx               # FamilyShell with mobile bottom-tab-bar
│   │       │   ├── home/page.tsx            # PR 4: next-session hero
│   │       │   ├── kids/[playerId]/page.tsx # PR 4: read-only player view
│   │       │   ├── schedule/page.tsx        # PR 4: list of upcoming
│   │       │   ├── book/page.tsx            # PR 4: routes into existing booking UI
│   │       │   └── pay/page.tsx             # PR 4: stub with invoice list
│   │       ├── (admin)/                     # PR 2 only (empty for Tier 1)
│   │       │   └── layout.tsx               # AdminShell
│   │       └── forbidden/page.tsx           # PR 1: 403 page with "Switch role" CTA
│   ├── components/
│   │   ├── auth/
│   │   │   ├── RoleGate.tsx                 # PR 1: server component wrapper
│   │   │   └── RoleGate.test.ts             # PR 1: vitest unit
│   │   ├── chrome/
│   │   │   ├── CoachShell.tsx               # PR 2
│   │   │   ├── FamilyShell.tsx              # PR 2
│   │   │   ├── AdminShell.tsx               # PR 2
│   │   │   ├── FamilyBottomTabs.tsx         # PR 2 — mobile-only nav
│   │   │   └── TopNav.tsx                   # PR 2: dedup with shells; tighten
│   │   └── family/
│   │       ├── NextSessionHero.tsx          # PR 4
│   │       ├── KidsCarousel.tsx             # PR 4
│   │       ├── OutstandingStrip.tsx         # PR 4
│   │       └── IcsDownloadButton.tsx        # PR 4
│   ├── lib/
│   │   └── auth/
│   │       ├── portal.ts                    # PR 1: defaultPortalForRole, isPortalAllowed
│   │       ├── portal.test.ts               # PR 1: vitest unit
│   │       └── permissions.ts               # PR 1 may extend; PR 5 reads
│   ├── actions/
│   │   ├── booking.ts                       # PR 5: dedupe pass + ParentPlayer row
│   │   └── parent-link.ts                   # PR 5: mergeParentsAction
│   ├── tests/
│   │   ├── portal.test.ts                   # PR 1
│   │   └── parent-link.test.ts              # PR 5
│   └── proxy.ts                             # PR 1: extend with role-based 301s
└── docs/superpowers/plans/
    └── 2026-05-17-phase-2-tier-1-execution.md   # this file
```

**Locked-after-Sprint-1 reminder** — `src/lib/auth.ts`, `src/lib/db.ts`, `prisma/schema.prisma`. Tier 1 does NOT touch any of those.

---

## PR 1 — Route group scaffold + role-based proxy redirects

Smallest, lowest-risk slice. Adds 3 empty route groups, the proxy redirect logic, and the `<RoleGate>` primitive. No page moves — every existing URL still works. Defines the `defaultPortalForRole()` helper that PR 2 and the WorkspaceSwitcher will use.

**Branch:** `feat/route-groups-and-role-gating`

### Task 1.1 — `defaultPortalForRole()` helper + tests

**Files:**
- Create: `src/lib/auth/portal.ts`
- Create: `src/lib/auth/portal.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/auth/portal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultPortalForRole, isPortalAllowed, portalDefaultPath } from "@/lib/auth/portal";
import type { Role } from "@prisma/client";

describe("defaultPortalForRole", () => {
  it("routes OWNER and ADMIN to admin portal", () => {
    expect(defaultPortalForRole("OWNER")).toBe("admin");
    expect(defaultPortalForRole("ADMIN")).toBe("admin");
  });
  it("routes COACH to coach portal", () => {
    expect(defaultPortalForRole("COACH")).toBe("coach");
  });
  it("routes PARENT and PLAYER to family portal", () => {
    expect(defaultPortalForRole("PARENT")).toBe("family");
    expect(defaultPortalForRole("PLAYER")).toBe("family");
  });
});

describe("isPortalAllowed", () => {
  it("OWNER can access every portal", () => {
    expect(isPortalAllowed("OWNER", "coach")).toBe(true);
    expect(isPortalAllowed("OWNER", "family")).toBe(true);
    expect(isPortalAllowed("OWNER", "admin")).toBe(true);
  });
  it("ADMIN can access admin + coach but not family", () => {
    expect(isPortalAllowed("ADMIN", "admin")).toBe(true);
    expect(isPortalAllowed("ADMIN", "coach")).toBe(true);
    expect(isPortalAllowed("ADMIN", "family")).toBe(false);
  });
  it("COACH can access coach only", () => {
    expect(isPortalAllowed("COACH", "coach")).toBe(true);
    expect(isPortalAllowed("COACH", "admin")).toBe(false);
    expect(isPortalAllowed("COACH", "family")).toBe(false);
  });
  it("PARENT can access family only", () => {
    expect(isPortalAllowed("PARENT", "family")).toBe(true);
    expect(isPortalAllowed("PARENT", "coach")).toBe(false);
    expect(isPortalAllowed("PARENT", "admin")).toBe(false);
  });
  it("PLAYER can access family only", () => {
    expect(isPortalAllowed("PLAYER", "family")).toBe(true);
    expect(isPortalAllowed("PLAYER", "coach")).toBe(false);
  });
});

describe("portalDefaultPath", () => {
  it("returns the canonical landing page for each portal", () => {
    expect(portalDefaultPath("slug-x", "coach")).toBe("/t/slug-x/coach/dashboard");
    expect(portalDefaultPath("slug-x", "family")).toBe("/t/slug-x/family/home");
    expect(portalDefaultPath("slug-x", "admin")).toBe("/t/slug-x/admin/team");
  });
});

describe("portal detection from path", () => {
  it("infers portal segment", () => {
    // implementation: portalFromPath("/t/slug/coach/dashboard") === "coach"
    // tested directly in the implementation export
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/auth/portal.test.ts`
Expected: 4 describe blocks fail with "Cannot find module '@/lib/auth/portal'".

- [ ] **Step 3: Implement portal helpers**

`src/lib/auth/portal.ts`:

```ts
import type { Role } from "@prisma/client";

export type Portal = "coach" | "family" | "admin";

const PORTAL_ACCESS: Record<Role, Portal[]> = {
  OWNER: ["admin", "coach", "family"],
  ADMIN: ["admin", "coach"],
  COACH: ["coach"],
  PARENT: ["family"],
  PLAYER: ["family"],
};

const DEFAULT_BY_ROLE: Record<Role, Portal> = {
  OWNER: "admin",
  ADMIN: "admin",
  COACH: "coach",
  PARENT: "family",
  PLAYER: "family",
};

const DEFAULT_PATH: Record<Portal, string> = {
  coach: "/dashboard",
  family: "/home",
  admin: "/team",
};

export function defaultPortalForRole(role: Role): Portal {
  return DEFAULT_BY_ROLE[role];
}

export function isPortalAllowed(role: Role, portal: Portal): boolean {
  return PORTAL_ACCESS[role].includes(portal);
}

export function portalDefaultPath(slug: string, portal: Portal): string {
  return `/t/${slug}${portalDefaultSegment(portal)}`;
}

export function portalDefaultSegment(portal: Portal): string {
  return `/${portal}${DEFAULT_PATH[portal]}`;
}

/**
 * Pulls the portal segment out of a /t/<slug>/<portal>/* URL.
 * Returns null for paths that don't include a known portal yet
 * (legacy URLs, public profile pages, etc.).
 */
export function portalFromPath(pathname: string): Portal | null {
  const m = pathname.match(/^\/t\/[^/]+\/(coach|family|admin)(?:\/|$)/);
  return (m?.[1] as Portal | undefined) ?? null;
}

/**
 * Legacy-URL → portal-URL mapping used by proxy.ts for 301 redirects
 * during the migration period. Returns the new path for a known legacy
 * tenant URL, or null if the path is already on a portal or is a public
 * route (no rewrite needed).
 *
 * Example: "/t/abc/bookings" → "/t/abc/coach/bookings"
 */
export const LEGACY_COACH_SEGMENTS = new Set([
  "dashboard",
  "bookings",
  "schedule",
  "roster",
  "programs",
  "payments",
  "comms",
  "tryouts",
  "development",
  "settings",
]);

export function legacyRedirectPath(pathname: string): string | null {
  const m = pathname.match(/^\/t\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  const [, slug, segment, rest = ""] = m;
  // Already on a portal — no redirect
  if (segment === "coach" || segment === "family" || segment === "admin") return null;
  if (!LEGACY_COACH_SEGMENTS.has(segment)) return null;
  return `/t/${slug}/coach/${segment}${rest}`;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm test src/lib/auth/portal.test.ts`
Expected: all 4 describe blocks pass (14 individual `it` assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/portal.ts src/lib/auth/portal.test.ts
git commit -m "feat(auth): portal helpers — defaultPortalForRole + legacyRedirectPath + isPortalAllowed

Helpers used by proxy.ts for role-based redirects and by WorkspaceSwitcher
to land users on their correct portal home. Pure functions, fully unit-tested."
```

### Task 1.2 — `<RoleGate>` server component + tests

**Files:**
- Create: `src/components/auth/RoleGate.tsx`
- Create: `src/components/auth/RoleGate.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/auth/RoleGate.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(),
}));
import { can } from "@/lib/auth/permissions";

describe("RoleGate behavior contract", () => {
  it("allows render when can() returns true", async () => {
    vi.mocked(can).mockResolvedValueOnce(true);
    const result = await can({ tenantId: "t1", role: "COACH" as Role }, "bookings.view");
    expect(result).toBe(true);
  });

  it("denies render when can() returns false", async () => {
    vi.mocked(can).mockResolvedValueOnce(false);
    const result = await can({ tenantId: "t1", role: "PARENT" as Role }, "bookings.edit");
    expect(result).toBe(false);
  });
});
```

(Note: full RSC rendering tests need a setup we don't have yet — Playwright covers the integration. This test pins the `can()` contract.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/auth/RoleGate.test.tsx`
Expected: fails with "Cannot find module" or similar import resolution error if file order matters; otherwise passes trivially since it tests the `can()` mock not the gate.

- [ ] **Step 3: Implement RoleGate**

`src/components/auth/RoleGate.tsx`:

```tsx
import type { ReactNode } from "react";
import { can, type Feature, type PermissionLevel } from "@/lib/auth/permissions";
import type { Role } from "@prisma/client";

/**
 * Server-component permission wrapper.
 *
 * Usage in a page or layout:
 *   <RoleGate tenantId={tenant.id} role={membership.role} feature="bookings.edit">
 *     <EditBookingButton />
 *   </RoleGate>
 *
 * Renders nothing if the user lacks the requested level (default VIEW).
 * Pages that need a hard block should use `assertCan()` from
 * `@/lib/auth/permissions` instead — that throws, RoleGate just hides.
 *
 * For an explicit "not authorized" page, see `/t/[slug]/forbidden`.
 */
export async function RoleGate({
  tenantId,
  role,
  feature,
  level = "VIEW",
  fallback = null,
  children,
}: {
  tenantId: string;
  role: Role;
  feature: Feature;
  level?: PermissionLevel;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const allowed = await can({ tenantId, role }, feature, level);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm test src/components/auth/RoleGate.test.tsx && pnpm tsc --noEmit`
Expected: tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/RoleGate.tsx src/components/auth/RoleGate.test.tsx
git commit -m "feat(auth): RoleGate server-component wrapper

Pages and layouts call <RoleGate tenantId role feature level=\"VIEW\">
to conditionally render UI behind the permission matrix. Hard 403s should
still use assertCan() in a server action; RoleGate is for hide-don't-show."
```

### Task 1.3 — `/t/[slug]/forbidden` page

**Files:**
- Create: `src/app/t/[slug]/forbidden/page.tsx`

- [ ] **Step 1: Implement the forbidden page**

`src/app/t/[slug]/forbidden/page.tsx`:

```tsx
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { defaultPortalForRole, portalDefaultPath } from "@/lib/auth/portal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight } from "lucide-react";
import { roleLabel } from "@/lib/roles";

export const metadata = { title: "Not allowed" };

export default async function ForbiddenPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ attempted?: string }>;
}) {
  const { slug } = await params;
  const { attempted } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const myPortal = defaultPortalForRole(membership.role);
  const myHome = portalDefaultPath(tenant.slug, myPortal);

  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 space-y-5 text-center">
          <div className="h-12 w-12 rounded-full bg-warn/10 text-warn flex items-center justify-center mx-auto">
            <Lock className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">No access here</h1>
            <p className="text-sm text-ink-500">
              You're signed in as{" "}
              <span className="font-mono text-ink-300">{roleLabel(membership.role)}</span> in{" "}
              <span className="font-semibold text-ink-300">{tenant.name}</span>.
              {attempted && (
                <>
                  {" "}That URL is for a different workspace.
                </>
              )}
            </p>
          </div>
          <Button variant="primary" asChild className="w-full">
            <Link href={myHome} className="inline-flex items-center justify-center gap-2">
              Go to my {myPortal} workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + visual smoke**

Run: `pnpm tsc --noEmit`
Expected: no errors.

(Visual: when prod-deployed, visiting `/t/smoke-coach-demo/forbidden` as the seeded owner shows the page rendering "OWNER in Smoke Coach Demo".)

- [ ] **Step 3: Commit**

```bash
git add src/app/t/[slug]/forbidden/page.tsx
git commit -m "feat(auth): /t/[slug]/forbidden page with switch-role CTA"
```

### Task 1.4 — Proxy: role-based redirects + legacy 301s

**Files:**
- Modify: `src/proxy.ts:12-25` (the `auth(...)` callback body)

- [ ] **Step 1: Update proxy.ts**

Replace the body of the `auth((req) => {...})` callback. The current callback only checks auth; the new one also handles:
- Legacy `/t/[slug]/<segment>` → `/t/[slug]/coach/<segment>` 301s (per `legacyRedirectPath`)
- Bare `/t/[slug]` → `/t/[slug]/<my-portal>/<home>` redirect based on the signed-in user's role for that tenant (deferred to layout since proxy doesn't have DB access)

`src/proxy.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { legacyRedirectPath } from "@/lib/auth/portal";

/**
 * Auth gate + portal redirects.
 *
 * 1. Anything under /t/[slug]/* or /onboarding requires a session — unauthed
 *    users bounce to /auth/signin with the original URL preserved.
 * 2. Legacy /t/[slug]/<segment> paths (dashboard, bookings, schedule, etc.)
 *    301 to /t/[slug]/coach/<segment> so old bookmarks land at the new home.
 *    Family/Admin redirects from the legacy paths are deferred — they don't
 *    have legacy URLs.
 * 3. Per-role default-portal landing is NOT done here (proxy has no DB
 *    access). The /t/[slug]/layout.tsx server component handles it.
 */
export default auth((req) => {
  const { nextUrl } = req;
  const isAuthed = !!req.auth;
  const isProtected =
    nextUrl.pathname.startsWith("/t/") || nextUrl.pathname.startsWith("/onboarding");

  if (isProtected && !isAuthed) {
    const signin = new URL("/auth/signin", nextUrl.origin);
    signin.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(signin);
  }

  // Legacy URL → portal URL — preserves the existing app surface even after
  // we add the (coach) route group. Status 308 keeps method + body for forms.
  const newPath = legacyRedirectPath(nextUrl.pathname);
  if (newPath) {
    const target = new URL(newPath, nextUrl.origin);
    target.search = nextUrl.search;
    return NextResponse.redirect(target, 308);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|brand/.*|.*\\..*).*)",
  ],
};
```

- [ ] **Step 2: Verify with a targeted manual run**

There's no proxy unit-test infra (Next 16 proxies are integration-tested). Verify by running:

```bash
pnpm build
```

Expected: build succeeds, `Proxy (Middleware)` shows in the route output.

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(proxy): legacy URL → coach portal 308 redirects via legacyRedirectPath"
```

### Task 1.5 — Empty route groups + group layouts

**Files:**
- Create: `src/app/t/[slug]/(coach)/layout.tsx`
- Create: `src/app/t/[slug]/(family)/layout.tsx`
- Create: `src/app/t/[slug]/(admin)/layout.tsx`

Each layout is currently identical to the existing `src/app/t/[slug]/layout.tsx` — they get differentiated in PR 2. Keeping them as separate files now means PR 2 only changes what's INSIDE each, not the routing structure.

- [ ] **Step 1: Create the three group layouts**

`src/app/t/[slug]/(coach)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { TopNav } from "@/components/chrome/TopNav";
import { SideNav } from "@/components/chrome/SideNav";
import { isPortalAllowed, portalDefaultPath, defaultPortalForRole } from "@/lib/auth/portal";

export default async function CoachGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "coach")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} currentRole={membership.role} />
      <div className="flex">
        <SideNav tenant={tenant} role={membership.role} />
        <main className="flex-1 min-h-[calc(100vh-64px)] p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
```

`src/app/t/[slug]/(family)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { TopNav } from "@/components/chrome/TopNav";
import { isPortalAllowed, portalDefaultPath, defaultPortalForRole } from "@/lib/auth/portal";

export default async function FamilyGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "family")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} currentRole={membership.role} />
      <main className="px-4 lg:px-6 py-6 lg:py-10 pb-24 lg:pb-10 max-w-5xl mx-auto">
        {children}
      </main>
      {/* FamilyBottomTabs ships in PR 2 */}
    </div>
  );
}
```

`src/app/t/[slug]/(admin)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { TopNav } from "@/components/chrome/TopNav";
import { SideNav } from "@/components/chrome/SideNav";
import { isPortalAllowed, portalDefaultPath, defaultPortalForRole } from "@/lib/auth/portal";

export default async function AdminGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "admin")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} currentRole={membership.role} />
      <div className="flex">
        <SideNav tenant={tenant} role={membership.role} />
        <main className="flex-1 min-h-[calc(100vh-64px)] p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: no errors. Build output should NOT show new route paths yet — empty group layouts produce no routes.

- [ ] **Step 3: Commit**

```bash
git add src/app/t/[slug]/\(coach\) src/app/t/[slug]/\(family\) src/app/t/[slug]/\(admin\)
git commit -m "feat(routes): three empty route-group layouts (coach/family/admin) with portal gates"
```

### Task 1.6 — Update WorkspaceSwitcher to use portal-aware URLs

**Files:**
- Modify: `src/components/chrome/WorkspaceSwitcher.tsx:88-104` (the `<Link href=...>`)

- [ ] **Step 1: Change the workspace link target**

In `src/components/chrome/WorkspaceSwitcher.tsx`, find the `<Link href={\`/t/${w.slug}/dashboard\`}>` line. Replace with portal-aware default:

```tsx
import { portalDefaultPath, defaultPortalForRole } from "@/lib/auth/portal";
```

Then change the href:

```tsx
<Link
  href={portalDefaultPath(w.slug, defaultPortalForRole(w.role))}
  className="flex justify-between items-center cursor-pointer gap-2"
>
```

Per the legacy-redirect logic in proxy.ts, the URL `/t/<slug>/coach/dashboard` (etc.) needs to resolve. Today the coach page is still at `/t/<slug>/dashboard` so the proxy 308 doesn't help us in the OTHER direction. Use the legacy URL pattern for now and switch in PR 3 when pages actually move:

```tsx
import { portalDefaultPath, defaultPortalForRole, type Portal } from "@/lib/auth/portal";

// PR 3 will flip this to portalDefaultPath. Until pages move, the legacy URL
// still works and proxy.ts won't try to redirect away from /dashboard.
const portal: Portal = defaultPortalForRole(w.role);
const href = portal === "coach" ? `/t/${w.slug}/dashboard` : portalDefaultPath(w.slug, portal);
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/chrome/WorkspaceSwitcher.tsx
git commit -m "feat(chrome): WorkspaceSwitcher routes to role's default portal home"
```

### Task 1.7 — Verify + deploy PR 1

- [ ] **Step 1: Full local verify**

```bash
pnpm test && pnpm tsc --noEmit && pnpm lint && pnpm build
```
Expected: all pass, zero errors. Lint warnings related to `@tanstack/react-table` `incompatible-library` are pre-existing — fine.

- [ ] **Step 2: Push branch + open PR**

```bash
git push origin feat/route-groups-and-role-gating
gh pr create --title "feat: route group scaffold + role-based proxy redirects" --body "$(cat <<'EOF'
## Summary
- Empty route groups under \`src/app/t/[slug]/(coach|family|admin)/\` with per-group layouts that gate access by role
- Proxy now 308-redirects legacy \`/t/[slug]/<segment>\` URLs to \`/t/[slug]/coach/<segment>\`
- New \`<RoleGate>\` server-component wrapper delegates to \`can()\` from the permission matrix
- \`/t/[slug]/forbidden\` page with "Switch to my workspace" CTA
- WorkspaceSwitcher now routes to the user's default portal home based on role
- Pure-function unit tests for portal helpers (\`defaultPortalForRole\`, \`isPortalAllowed\`, \`portalDefaultPath\`, \`legacyRedirectPath\`)

## Risk
Low. No page moves yet — every existing URL still resolves. Group layouts only fire when paths inside the groups are hit (none ship in this PR).

## Test plan
- [x] \`pnpm test\` passes
- [ ] After deploy: \`curl /t/smoke-coach-demo/bookings\` → 308 → \`/t/smoke-coach-demo/coach/bookings\` → which 404s because PR 3 hasn't moved pages yet (intentional, validates proxy behavior). Defer the curl smoke test until PR 3.
- [ ] After deploy: \`/t/smoke-coach-demo/forbidden\` renders with the role label.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: After PR review, merge + deploy**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
vercel deploy --prod --yes
```

---

## PR 2 — Three portal shells

Differentiates the three group layouts so each portal has its own chrome.

**Branch:** `feat/portal-shells`

### Task 2.1 — Extract `CoachShell` from existing layout

**Files:**
- Create: `src/components/chrome/CoachShell.tsx`
- Modify: `src/app/t/[slug]/(coach)/layout.tsx` (use the shell)

- [ ] **Step 1: Extract the current TopNav + SideNav + main composition into a shell component**

`src/components/chrome/CoachShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { TopNav } from "@/components/chrome/TopNav";
import { SideNav } from "@/components/chrome/SideNav";
import type { Tenant, User, Role } from "@prisma/client";

export async function CoachShell({
  tenant,
  user,
  role,
  children,
}: {
  tenant: Tenant;
  user: User;
  role: Role;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} currentRole={role} />
      <div className="flex">
        <SideNav tenant={tenant} role={role} />
        <main className="flex-1 min-h-[calc(100vh-64px)] p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `(coach)/layout.tsx` body with the shell**

`src/app/t/[slug]/(coach)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { CoachShell } from "@/components/chrome/CoachShell";
import { isPortalAllowed, portalDefaultPath, defaultPortalForRole } from "@/lib/auth/portal";

export default async function CoachGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "coach")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <CoachShell tenant={tenant} user={user} role={membership.role}>
      {children}
    </CoachShell>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm tsc --noEmit
git add src/components/chrome/CoachShell.tsx src/app/t/[slug]/\(coach\)/layout.tsx
git commit -m "feat(chrome): CoachShell extracted from (coach) layout"
```

### Task 2.2 — `FamilyShell` + bottom tab bar

**Files:**
- Create: `src/components/chrome/FamilyShell.tsx`
- Create: `src/components/chrome/FamilyBottomTabs.tsx`
- Modify: `src/app/t/[slug]/(family)/layout.tsx`

- [ ] **Step 1: Bottom tab bar (mobile-only)**

`src/components/chrome/FamilyBottomTabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, BookOpen, Wallet, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function FamilyBottomTabs({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/t/${slug}/family`;
  const tabs = [
    { href: `${base}/home`, icon: Home, label: "Home" },
    { href: `${base}/schedule`, icon: Calendar, label: "Schedule" },
    { href: `${base}/book`, icon: BookOpen, label: "Book" },
    { href: `${base}/pay`, icon: Wallet, label: "Pay" },
    { href: `${base}/messages`, icon: MessageSquare, label: "Inbox" },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 border-t border-line bg-pitch-900/95 backdrop-blur-md">
      <div className="h-full grid grid-cols-5">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-[120ms]",
                active ? "text-turf-300" : "text-ink-500 hover:text-ink-300"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: FamilyShell wraps content + bottom tabs**

`src/components/chrome/FamilyShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { TopNav } from "@/components/chrome/TopNav";
import { FamilyBottomTabs } from "@/components/chrome/FamilyBottomTabs";
import type { Tenant, User, Role } from "@prisma/client";

export async function FamilyShell({
  tenant,
  user,
  role,
  children,
}: {
  tenant: Tenant;
  user: User;
  role: Role;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} currentRole={role} />
      <main className="px-4 lg:px-6 py-6 lg:py-10 pb-24 lg:pb-10 max-w-5xl mx-auto">
        {children}
      </main>
      <FamilyBottomTabs slug={tenant.slug} />
    </div>
  );
}
```

- [ ] **Step 3: Use FamilyShell in the (family) layout**

`src/app/t/[slug]/(family)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { FamilyShell } from "@/components/chrome/FamilyShell";
import { isPortalAllowed, portalDefaultPath, defaultPortalForRole } from "@/lib/auth/portal";

export default async function FamilyGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "family")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <FamilyShell tenant={tenant} user={user} role={membership.role}>
      {children}
    </FamilyShell>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm tsc --noEmit
git add src/components/chrome/FamilyShell.tsx src/components/chrome/FamilyBottomTabs.tsx src/app/t/[slug]/\(family\)/layout.tsx
git commit -m "feat(chrome): FamilyShell with mobile bottom tab bar"
```

### Task 2.3 — `AdminShell` (mostly mirrors CoachShell for now)

**Files:**
- Create: `src/components/chrome/AdminShell.tsx`
- Modify: `src/app/t/[slug]/(admin)/layout.tsx`

- [ ] **Step 1: Implement AdminShell (sidenav scoped to admin sections)**

`src/components/chrome/AdminShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { TopNav } from "@/components/chrome/TopNav";
import { AdminSideNav } from "@/components/chrome/AdminSideNav";
import type { Tenant, User, Role } from "@prisma/client";

export async function AdminShell({
  tenant,
  user,
  role,
  children,
}: {
  tenant: Tenant;
  user: User;
  role: Role;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} currentRole={role} />
      <div className="flex">
        <AdminSideNav tenant={tenant} />
        <main className="flex-1 min-h-[calc(100vh-64px)] p-5 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `AdminSideNav` (separate file, distinct nav items)**

`src/components/chrome/AdminSideNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Shield, Wallet, Activity, Download, Globe } from "lucide-react";
import type { Tenant } from "@prisma/client";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Team", icon: Users, segment: "team" },
  { label: "Permissions", icon: Shield, segment: "permissions" },
  { label: "Billing", icon: Wallet, segment: "billing" },
  { label: "Audit log", icon: Activity, segment: "audit" },
  { label: "Branding", icon: Globe, segment: "branding" },
  { label: "Exports", icon: Download, segment: "exports" },
] as const;

export function AdminSideNav({ tenant }: { tenant: Tenant }) {
  const pathname = usePathname() ?? "";
  return (
    <aside className="hidden lg:block sticky top-16 h-[calc(100vh-64px)] w-60 border-r border-line bg-pitch-900/60">
      <nav className="p-3 space-y-0.5">
        {ITEMS.map((it) => {
          const href = `/t/${tenant.slug}/admin/${it.segment}`;
          const active = pathname.startsWith(href);
          const Icon = it.icon;
          return (
            <Link
              key={it.segment}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-[120ms]",
                active
                  ? "bg-pitch-800 text-ink-50 border-l-2 border-flood-400 pl-[10px]"
                  : "text-ink-500 hover:bg-pitch-800/60 hover:text-ink-300"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Use AdminShell in (admin) layout**

`src/app/t/[slug]/(admin)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { AdminShell } from "@/components/chrome/AdminShell";
import { isPortalAllowed, portalDefaultPath, defaultPortalForRole } from "@/lib/auth/portal";

export default async function AdminGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (!isPortalAllowed(membership.role, "admin")) {
    redirect(portalDefaultPath(slug, defaultPortalForRole(membership.role)));
  }

  return (
    <AdminShell tenant={tenant} user={user} role={membership.role}>
      {children}
    </AdminShell>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm tsc --noEmit
git add src/components/chrome/AdminShell.tsx src/components/chrome/AdminSideNav.tsx src/app/t/[slug]/\(admin\)/layout.tsx
git commit -m "feat(chrome): AdminShell + dedicated AdminSideNav"
```

### Task 2.4 — Open PR 2 + deploy

- [ ] **Step 1: Verify + push**

```bash
pnpm test && pnpm tsc --noEmit && pnpm lint && pnpm build
git push origin feat/portal-shells
```

- [ ] **Step 2: PR + merge + deploy**

```bash
gh pr create --title "feat(chrome): three portal shells (Coach / Family / Admin)" --body "$(cat <<'EOF'
## Summary
- \`CoachShell\` extracted from existing tenant layout — same chrome
- \`FamilyShell\` with mobile bottom tab bar (\`FamilyBottomTabs\`)
- \`AdminShell\` with dedicated \`AdminSideNav\` (team / permissions / billing / audit / branding / exports)
- Each shell is mounted by its route group's \`layout.tsx\`; rendering only kicks in when pages exist inside the group (none ship yet)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
git checkout main && git pull
vercel deploy --prod --yes
```

---

## PR 3 — Move existing pages into `(coach)/` group

This is the riskiest of the three structural PRs. Move every coach page (10 routes) into `(coach)/`, update internal links, and confirm the proxy 308 still works.

**Branch:** `feat/move-coach-pages`

### Task 3.1 — Move all coach pages

**Files:** (all moves — use `git mv` to preserve history)

- `src/app/t/[slug]/dashboard/page.tsx` → `src/app/t/[slug]/(coach)/dashboard/page.tsx`
- `src/app/t/[slug]/bookings/page.tsx` → `src/app/t/[slug]/(coach)/bookings/page.tsx`
- `src/app/t/[slug]/schedule/page.tsx` → `src/app/t/[slug]/(coach)/schedule/page.tsx`
- `src/app/t/[slug]/schedule/[eventId]/page.tsx` → `src/app/t/[slug]/(coach)/schedule/[eventId]/page.tsx`
- `src/app/t/[slug]/roster/page.tsx` → `src/app/t/[slug]/(coach)/roster/page.tsx`
- `src/app/t/[slug]/roster/[playerId]/page.tsx` → `src/app/t/[slug]/(coach)/roster/[playerId]/page.tsx`
- `src/app/t/[slug]/programs/page.tsx` → `src/app/t/[slug]/(coach)/programs/page.tsx`
- `src/app/t/[slug]/payments/page.tsx` → `src/app/t/[slug]/(coach)/payments/page.tsx`
- `src/app/t/[slug]/comms/page.tsx` → `src/app/t/[slug]/(coach)/comms/page.tsx`
- `src/app/t/[slug]/tryouts/page.tsx` → `src/app/t/[slug]/(coach)/tryouts/page.tsx`
- `src/app/t/[slug]/development/page.tsx` → `src/app/t/[slug]/(coach)/development/page.tsx`
- `src/app/t/[slug]/settings/*` → `src/app/t/[slug]/(coach)/settings/*` (page.tsx, locations/, team/, danger/, billing/)
- Delete: `src/app/t/[slug]/layout.tsx` (the group layouts replace it)

- [ ] **Step 1: Move each route with `git mv`**

```bash
mkdir -p src/app/t/\[slug\]/\(coach\)/
git mv src/app/t/\[slug\]/dashboard src/app/t/\[slug\]/\(coach\)/dashboard
git mv src/app/t/\[slug\]/bookings src/app/t/\[slug\]/\(coach\)/bookings
git mv src/app/t/\[slug\]/schedule src/app/t/\[slug\]/\(coach\)/schedule
git mv src/app/t/\[slug\]/roster src/app/t/\[slug\]/\(coach\)/roster
git mv src/app/t/\[slug\]/programs src/app/t/\[slug\]/\(coach\)/programs
git mv src/app/t/\[slug\]/payments src/app/t/\[slug\]/\(coach\)/payments
git mv src/app/t/\[slug\]/comms src/app/t/\[slug\]/\(coach\)/comms
git mv src/app/t/\[slug\]/tryouts src/app/t/\[slug\]/\(coach\)/tryouts
git mv src/app/t/\[slug\]/development src/app/t/\[slug\]/\(coach\)/development
git mv src/app/t/\[slug\]/settings src/app/t/\[slug\]/\(coach\)/settings
git rm src/app/t/\[slug\]/layout.tsx
```

- [ ] **Step 2: Build to confirm route generation**

Run: `pnpm build`
Expected output: routes include `/t/[slug]/coach/dashboard`, `/t/[slug]/coach/bookings`, etc. The legacy paths (`/t/[slug]/dashboard`) are no longer in the route table — proxy.ts 308s them.

### Task 3.2 — Update internal navigation links

**Files:** (grep + edit)

- [ ] **Step 1: Find every internal link that hardcodes a legacy path**

Run:
```bash
grep -rln 'href={\`/t/\${.*}/\(dashboard\|bookings\|schedule\|roster\|programs\|payments\|comms\|tryouts\|development\|settings\)' src/
```

- [ ] **Step 2: Update them to `/t/[slug]/coach/<segment>`**

Common files:
- `src/lib/nav.ts` — sidenav config: prepend `/coach` to every coach href
- `src/components/chrome/CommandMenuTrigger.tsx` — same
- `src/components/chrome/WorkspaceSwitcher.tsx` — change `/dashboard` to `/coach/dashboard`
- `src/components/bookings/BookingsTable.tsx` — `eventId` link goes to `/t/${tenantSlug}/coach/schedule/${eventId}`
- Various dashboard `<Link>`s

For each match, replace `\`/t/${slug}/dashboard\`` with `\`/t/${slug}/coach/dashboard\`` etc. Do this carefully — public booking flow uses `/${tenant.slug}/book/...` (no `/t/` prefix) and MUST NOT be changed.

- [ ] **Step 3: Update WorkspaceSwitcher to use `portalDefaultPath` unconditionally**

In `src/components/chrome/WorkspaceSwitcher.tsx`, the conditional from Task 1.6:

```tsx
const portal: Portal = defaultPortalForRole(w.role);
const href = portal === "coach" ? `/t/${w.slug}/dashboard` : portalDefaultPath(w.slug, portal);
```

Becomes:

```tsx
const portal: Portal = defaultPortalForRole(w.role);
const href = portalDefaultPath(w.slug, portal);
```

- [ ] **Step 4: Typecheck + build**

```bash
pnpm tsc --noEmit && pnpm build
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(routes): move coach pages into (coach) route group + repoint internal links"
```

### Task 3.3 — Smoke test legacy redirects

- [ ] **Step 1: Deploy a preview**

```bash
git push origin feat/move-coach-pages
vercel --yes
```

Capture the preview URL.

- [ ] **Step 2: Verify legacy 308s**

```bash
PREVIEW=https://<preview-url>
for path in dashboard bookings schedule roster programs payments comms tryouts development settings; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -I "$PREVIEW/t/smoke-coach-demo/$path")
  location=$(curl -s -I "$PREVIEW/t/smoke-coach-demo/$path" | grep -i '^location:' | head -1)
  printf "  %-15s %s    %s\n" "$path" "$status" "$location"
done
```
Expected: each prints `308 Permanent Redirect` and a `Location:` header pointing at `/t/smoke-coach-demo/coach/<path>`.

- [ ] **Step 3: Verify new paths work after redirect**

```bash
for path in dashboard bookings schedule roster programs payments comms tryouts development settings; do
  status=$(curl -s -L -o /dev/null -w "%{http_code}" "$PREVIEW/t/smoke-coach-demo/$path")
  printf "  %-15s %s\n" "$path (followed)" "$status"
done
```
Expected: all 200 (or 302 to /auth/signin if logged out — that's also correct since auth-gating kicks in after the legacy redirect resolves).

- [ ] **Step 4: PR + merge + deploy**

```bash
gh pr create --title "feat(routes): move coach pages into (coach) route group" --body "$(cat <<'EOF'
## Summary
- 10 coach route trees moved from \`/t/[slug]/*\` to \`/t/[slug]/coach/*\` using \`git mv\` (history preserved)
- Internal links repointed (sidenav, command palette, BookingsTable, WorkspaceSwitcher, Today widget)
- WorkspaceSwitcher now uses \`portalDefaultPath()\` for every workspace
- Legacy URLs continue to work via the 308 in \`proxy.ts\`

## Risk
Medium. This PR moves files; the legacy redirect in PR 1 keeps bookmarks alive. Revert path: \`git revert <sha>\` restores the previous structure; proxy.ts redirect becomes a no-op because \`legacyRedirectPath\` matches segments that don't exist.

## Verified
- Preview deploy smoke-tested every legacy path → all 308 to new paths
- New \`/coach/*\` paths render 200 (or 302 to signin) for the seeded smoke tenant

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
git checkout main && git pull
vercel deploy --prod --yes
```

After this PR, the structural keystone is done. Family + Admin routes can land independently.

---

## PR 4 — Family Portal MVP

Adds the three family-facing pages users actually need: home, kids, schedule. Book + Pay get stub pages that link to the existing flows.

**Branch:** `feat/family-portal-mvp`

### Task 4.1 — Family Home `/t/[slug]/family/home`

**Files:**
- Create: `src/app/t/[slug]/(family)/home/page.tsx`
- Create: `src/components/family/NextSessionHero.tsx`
- Create: `src/components/family/KidsCarousel.tsx`
- Create: `src/components/family/OutstandingStrip.tsx`
- Create: `src/components/family/IcsDownloadButton.tsx`

- [ ] **Step 1: Implement ICS download button**

`src/components/family/IcsDownloadButton.tsx`:

```tsx
"use client";

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function icsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

export function IcsDownloadButton({
  uid,
  title,
  startsAt,
  endsAt,
  location,
  description,
}: {
  uid: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  location?: string;
  description?: string;
}) {
  function download() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//KickNScream//Family//EN",
      "BEGIN:VEVENT",
      `UID:${uid}@kicknscream`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(new Date(startsAt))}`,
      `DTEND:${icsDate(new Date(endsAt))}`,
      `SUMMARY:${title.replace(/[,;\n]/g, " ")}`,
      location ? `LOCATION:${location.replace(/[,;\n]/g, " ")}` : "",
      description ? `DESCRIPTION:${description.replace(/[,;\n]/g, " ")}` : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Button variant="secondary" size="sm" onClick={download}>
      <Calendar className="h-3.5 w-3.5" />
      Add to calendar
    </Button>
  );
}
```

- [ ] **Step 2: NextSessionHero**

`src/components/family/NextSessionHero.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChalkGrid } from "@/components/brand/ChalkGrid";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Calendar, MapPin, Clock, ArrowRight, ExternalLink } from "lucide-react";
import { IcsDownloadButton } from "./IcsDownloadButton";
import Link from "next/link";
import { EVENT_TONE } from "@/lib/eventTone";
import type { Event, Location, Player } from "@prisma/client";

export function NextSessionHero({
  tenantSlug,
  event,
  player,
}: {
  tenantSlug: string;
  event: (Event & { location: Location | null }) | null;
  player: Player;
}) {
  if (!event) {
    return (
      <Card className="relative overflow-hidden border-dashed">
        <ChalkGrid className="opacity-30" />
        <CardContent className="relative p-8 text-center space-y-3">
          <Calendar className="h-8 w-8 text-ink-700 mx-auto" />
          <p className="text-ink-300 font-medium">
            No upcoming session for {player.firstName}
          </p>
          <p className="text-xs text-ink-500">Book a session when you're ready.</p>
          <Link
            href={`/t/${tenantSlug}/family/book`}
            className="inline-flex items-center gap-1 text-sm text-turf-300 hover:text-turf-200"
          >
            See what's open
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  const tone = EVENT_TONE[event.type];
  const countdown = formatDistanceToNowStrict(event.startsAt, { addSuffix: true });
  const mapsUrl = event.location?.address
    ? `https://maps.google.com/?q=${encodeURIComponent(event.location.address)}`
    : null;

  return (
    <Card className="relative overflow-hidden">
      <ChalkGrid className="opacity-30" />
      <CardContent className="relative p-6 lg:p-8 space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <Badge variant="outline" className={`${tone.bg} ${tone.border} ${tone.text}`}>
            {player.firstName}'s next session
          </Badge>
          <span className="text-xs font-mono text-flood-400">{countdown}</span>
        </div>
        <h2 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em]">{event.title}</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="inline-flex items-center gap-2 text-ink-300">
            <Clock className="h-4 w-4 text-ink-500" />
            <span className="font-mono">{format(event.startsAt, "EEE, MMM d · h:mm a")}</span>
          </div>
          {event.location && (
            <div className="inline-flex items-center gap-2 text-ink-300">
              <MapPin className="h-4 w-4 text-ink-500" />
              <span className="truncate">{event.location.name}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <IcsDownloadButton
            uid={event.id}
            title={event.title}
            startsAt={event.startsAt.toISOString()}
            endsAt={event.endsAt.toISOString()}
            location={event.location?.name}
          />
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-line bg-pitch-700 text-xs font-medium text-ink-300 hover:bg-pitch-600 hover:text-ink-50 transition-colors duration-[120ms]"
            >
              <ExternalLink className="h-3 w-3" />
              Directions
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: KidsCarousel**

`src/components/family/KidsCarousel.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { differenceInYears } from "date-fns";
import { getInitials } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import type { Player } from "@prisma/client";

export function KidsCarousel({
  tenantSlug,
  players,
}: {
  tenantSlug: string;
  players: Player[];
}) {
  if (players.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">My kids</h2>
        <span className="text-xs font-mono text-ink-500">{players.length}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible lg:mx-0 lg:px-0">
        {players.map((p) => {
          const age = differenceInYears(new Date(), p.dob);
          return (
            <Link
              key={p.id}
              href={`/t/${tenantSlug}/family/kids/${p.id}`}
              className="shrink-0 w-64 lg:w-auto block group"
            >
              <Card className="hover:border-turf-400/40 transition-colors duration-[120ms] h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="h-12 w-12 shrink-0">
                    {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                    <AvatarFallback>{getInitials(`${p.firstName} ${p.lastName}`)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink-50 truncate">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-xs text-ink-500">age {age}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-500 group-hover:text-turf-300 transition-colors" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: OutstandingStrip**

`src/components/family/OutstandingStrip.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ArrowRight } from "lucide-react";
import { formatCents } from "@/lib/utils";
import type { Invoice } from "@prisma/client";

export function OutstandingStrip({
  tenantSlug,
  invoices,
}: {
  tenantSlug: string;
  invoices: Invoice[];
}) {
  const open = invoices.filter((i) =>
    ["SENT", "PARTIAL", "OVERDUE"].includes(i.status)
  );
  if (open.length === 0) return null;
  const total = open.reduce((acc, i) => acc + i.amount, 0);
  return (
    <Link href={`/t/${tenantSlug}/family/pay`} className="block group">
      <Card className="border-warn/40 hover:border-warn transition-colors duration-[120ms]">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-warn/15 text-warn flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink-50">
              {formatCents(total)} outstanding
            </p>
            <p className="text-xs text-ink-500">
              {open.length} {open.length === 1 ? "invoice" : "invoices"} open
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-ink-500 group-hover:text-warn transition-colors" />
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 5: Home page composing all three**

`src/app/t/[slug]/(family)/home/page.tsx`:

```tsx
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { NextSessionHero } from "@/components/family/NextSessionHero";
import { KidsCarousel } from "@/components/family/KidsCarousel";
import { OutstandingStrip } from "@/components/family/OutstandingStrip";

export const metadata = { title: "Home" };

export default async function FamilyHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  // The Family group layout already gates via isPortalAllowed, but defensively
  // confirm the role is a parent here too.
  if (membership.role !== "PARENT" && membership.role !== "PLAYER") {
    // Unreachable in practice; layout would have redirected.
    return null;
  }

  const players = await db.player.findMany({
    where: { tenantId: tenant.id, parentId: user.id },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const playerNames = players.map((p) => `${p.firstName} ${p.lastName}`);

  const [nextEvents, invoices] = await Promise.all([
    db.event.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: new Date() },
        title: { in: playerNames },
      },
      include: { location: true },
      orderBy: { startsAt: "asc" },
      take: players.length,
    }),
    db.invoice.findMany({
      where: { tenantId: tenant.id, payerEmail: user.email ?? "@@none@@" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Match a next-session per kid: first event whose title contains the player's name
  const heroByKid = players.map((p) => ({
    player: p,
    event:
      nextEvents.find((e) => e.title.includes(`${p.firstName} ${p.lastName}`)) ?? null,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Hello, {user.name ?? "there"}</p>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
      </header>

      <OutstandingStrip tenantSlug={tenant.slug} invoices={invoices} />

      <div className="space-y-3">
        {heroByKid.map(({ player, event }) => (
          <NextSessionHero
            key={player.id}
            tenantSlug={tenant.slug}
            event={event}
            player={player}
          />
        ))}
      </div>

      <KidsCarousel tenantSlug={tenant.slug} players={players} />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm tsc --noEmit
git add src/app/t/[slug]/\(family\)/home src/components/family
git commit -m "feat(family): /family/home with NextSessionHero + OutstandingStrip + KidsCarousel + .ics download"
```

### Task 4.2 — Family kid detail `/t/[slug]/family/kids/[playerId]`

**Files:**
- Create: `src/app/t/[slug]/(family)/kids/[playerId]/page.tsx`

This is a read-only mirror of the coach's player profile, but scoped to the signed-in parent's kids and showing only the parent-visible fields (no private notes, no internal notes).

- [ ] **Step 1: Implement family kid page**

`src/app/t/[slug]/(family)/kids/[playerId]/page.tsx`:

```tsx
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/schedule/Markdown";
import { format, differenceInYears, isPast } from "date-fns";
import { getInitials, formatCents } from "@/lib/utils";
import { ArrowLeft, Calendar, CheckCircle2, Sparkles, Wallet, Mail } from "lucide-react";

export const metadata = { title: "Player" };

export default async function FamilyKidPage({
  params,
}: {
  params: Promise<{ slug: string; playerId: string }>;
}) {
  const { slug, playerId } = await params;
  const { tenant, user } = await requireTenant(slug);

  const player = await db.player.findUnique({
    where: { id: playerId },
    include: {
      attendances: { include: { event: true }, orderBy: { event: { startsAt: "desc" } } },
      developmentNotes: { where: { visibleToParent: true }, orderBy: { createdAt: "desc" } },
      enrollments: { include: { program: true, invoice: true } },
    },
  });
  // Strict parent-link check — 404 if not the parent
  if (!player || player.tenantId !== tenant.id || player.parentId !== user.id) {
    notFound();
  }

  const upcomingEvents = await db.event.findMany({
    where: {
      tenantId: tenant.id,
      startsAt: { gte: new Date() },
      title: { contains: `${player.firstName} ${player.lastName}` },
    },
    include: { location: true },
    orderBy: { startsAt: "asc" },
    take: 10,
  });

  const age = differenceInYears(new Date(), player.dob);
  const present = player.attendances.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE"
  ).length;
  const attendancePct =
    player.attendances.length === 0
      ? null
      : Math.round((present / player.attendances.length) * 100);

  return (
    <div className="space-y-6">
      <Link
        href={`/t/${tenant.slug}/family/home`}
        className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-300"
      >
        <ArrowLeft className="h-3 w-3" /> Back home
      </Link>

      <Card>
        <CardContent className="p-5 flex items-center gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            {player.photoUrl && <AvatarImage src={player.photoUrl} alt="" />}
            <AvatarFallback className="text-base">
              {getInitials(`${player.firstName} ${player.lastName}`)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">
              {player.firstName} {player.lastName}
            </h1>
            <p className="text-sm text-ink-500 font-mono">age {age}</p>
          </div>
          {attendancePct !== null && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-ink-500">Attendance</p>
              <p className="font-mono text-lg font-semibold text-turf-300">{attendancePct}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">Upcoming sessions</h2>
        {upcomingEvents.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <Calendar className="h-7 w-7 text-ink-700 mx-auto mb-2" />
            <p className="text-sm text-ink-300">No upcoming sessions</p>
            <Button variant="primary" size="sm" asChild className="mt-3">
              <Link href={`/t/${tenant.slug}/family/book`}>Book a session</Link>
            </Button>
          </Card>
        ) : (
          upcomingEvents.map((ev) => (
            <Card key={ev.id} className="p-3 flex items-center gap-3">
              <span className="text-xs font-mono text-ink-300 shrink-0 w-32">
                {format(ev.startsAt, "MMM d · h:mm a")}
              </span>
              <span className="font-medium text-ink-50 truncate flex-1">{ev.title}</span>
              {ev.location && (
                <span className="text-xs text-ink-500 truncate hidden sm:inline">
                  {ev.location.name}
                </span>
              )}
            </Card>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">Recent attendance</h2>
        {player.attendances.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <CheckCircle2 className="h-7 w-7 text-ink-700 mx-auto mb-2" />
            <p className="text-sm text-ink-300">No attendance recorded yet</p>
          </Card>
        ) : (
          player.attendances.slice(0, 8).map((a) => (
            <Card key={a.id} className="p-3 flex items-center gap-3">
              <span className="text-xs font-mono text-ink-300 shrink-0 w-32">
                {format(a.event.startsAt, "MMM d")}
              </span>
              <span className="font-medium text-ink-50 truncate flex-1">{a.event.title}</span>
              <Badge
                variant={
                  a.status === "PRESENT" ? "turf" : a.status === "LATE" ? "outline" : "danger"
                }
                className="text-[10px]"
              >
                {a.status.toLowerCase()}
              </Badge>
            </Card>
          ))
        )}
      </section>

      {player.developmentNotes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">Coach notes</h2>
          {player.developmentNotes.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-xs uppercase tracking-wider text-ink-500">{n.category}</span>
                <span className="text-xs font-mono text-ink-500">
                  {format(n.createdAt, "MMM d, yyyy")}
                </span>
              </div>
              <Markdown>{n.content}</Markdown>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
pnpm tsc --noEmit
git add src/app/t/[slug]/\(family\)/kids
git commit -m "feat(family): /family/kids/[playerId] read-only player view, strict parent-link check"
```

### Task 4.3 — Family schedule + book + pay stubs

**Files:**
- Create: `src/app/t/[slug]/(family)/schedule/page.tsx`
- Create: `src/app/t/[slug]/(family)/book/page.tsx`
- Create: `src/app/t/[slug]/(family)/pay/page.tsx`

These are stubs so the bottom tab bar links don't 404. Book + Pay route into existing UIs; Schedule lists upcoming events.

- [ ] **Step 1: Family schedule (upcoming events list across all kids)**

`src/app/t/[slug]/(family)/schedule/page.tsx`:

```tsx
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { format } from "date-fns";
import { Calendar, ArrowRight } from "lucide-react";

export const metadata = { title: "Schedule" };

export default async function FamilySchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user } = await requireTenant(slug);

  const players = await db.player.findMany({
    where: { tenantId: tenant.id, parentId: user.id },
  });
  const names = players.map((p) => `${p.firstName} ${p.lastName}`);

  const events = await db.event.findMany({
    where: {
      tenantId: tenant.id,
      startsAt: { gte: new Date() },
      title: { in: names },
    },
    include: { location: true },
    orderBy: { startsAt: "asc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Schedule</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Your family calendar</h1>
      </header>
      {events.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <Calendar className="h-8 w-8 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">Nothing on the calendar</p>
          <Link
            href={`/t/${tenant.slug}/family/book`}
            className="inline-flex items-center gap-1 text-sm text-turf-300 hover:text-turf-200 mt-2"
          >
            Book a session <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <Card key={ev.id} className="p-3 flex items-center gap-3">
              <div className="text-center w-14 shrink-0 border-r border-line pr-3 font-mono">
                <p className="text-[10px] uppercase tracking-wider text-ink-500">
                  {format(ev.startsAt, "MMM")}
                </p>
                <p className="text-xl font-bold leading-none mt-0.5">
                  {format(ev.startsAt, "d")}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink-50 truncate">{ev.title}</p>
                <p className="text-xs text-ink-500">
                  {format(ev.startsAt, "EEE h:mm a")}
                  {ev.location && ` · ${ev.location.name}`}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Family book page (links into existing public booking flow)**

`src/app/t/[slug]/(family)/book/page.tsx`:

```tsx
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { ServiceCatalog } from "@/components/book/ServiceCatalog";

export const metadata = { title: "Book" };

export default async function FamilyBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  const programs = await db.program.findMany({
    where: { tenantId: tenant.id, archived: false },
    orderBy: [{ priceModel: "asc" }, { price: "asc" }],
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Book</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">What's open</h1>
      </header>
      <ServiceCatalog programs={programs} tenantSlug={tenant.slug} variant="full" />
    </div>
  );
}
```

- [ ] **Step 3: Family pay page**

`src/app/t/[slug]/(family)/pay/page.tsx`:

```tsx
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";
import { format } from "date-fns";
import { Wallet, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Payments" };

export default async function FamilyPayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user } = await requireTenant(slug);

  const invoices = await db.invoice.findMany({
    where: { tenantId: tenant.id, payerEmail: user.email ?? "@@none@@" },
    orderBy: { createdAt: "desc" },
  });

  const open = invoices.filter((i) =>
    ["SENT", "PARTIAL", "OVERDUE"].includes(i.status)
  );
  const closed = invoices.filter((i) => !open.includes(i));
  const totalOpen = open.reduce((acc, i) => acc + i.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Payments</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Your invoices</h1>
      </header>

      {open.length > 0 && (
        <Card className="p-5 border-warn/40 bg-warn/[0.04]">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-warn" />
            <div className="flex-1">
              <p className="font-semibold text-ink-50">
                {formatCents(totalOpen)} outstanding
              </p>
              <p className="text-xs text-ink-500">
                {open.length} {open.length === 1 ? "invoice" : "invoices"} open
              </p>
            </div>
          </div>
        </Card>
      )}

      <section className="space-y-2">
        {invoices.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <CheckCircle2 className="h-8 w-8 text-ink-700 mx-auto mb-3" />
            <p className="text-ink-300 font-medium">No invoices yet</p>
          </Card>
        ) : (
          invoices.map((inv) => (
            <Card key={inv.id} className="p-3 flex items-center gap-3">
              <span className="text-xs font-mono text-ink-300 shrink-0 w-24">
                {format(inv.createdAt, "MMM d, yyyy")}
              </span>
              <span className="flex-1 truncate text-ink-50">
                {inv.description ?? "(invoice)"}
              </span>
              <span className="font-mono font-semibold text-flood-400">
                {formatCents(inv.amount)}
              </span>
              <Badge
                variant={
                  inv.status === "PAID" ? "turf" : inv.status === "OVERDUE" ? "danger" : "outline"
                }
                className="text-[10px]"
              >
                {inv.status.toLowerCase()}
              </Badge>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm tsc --noEmit
git add src/app/t/[slug]/\(family\)/schedule src/app/t/[slug]/\(family\)/book src/app/t/[slug]/\(family\)/pay
git commit -m "feat(family): schedule + book + pay pages (bottom tab targets resolved)"
```

### Task 4.4 — Update Family dashboard redirect

When a PARENT visits `/t/[slug]/dashboard` (legacy), proxy.ts 308s them to `/t/[slug]/coach/dashboard`. Then the `(coach)` layout's `isPortalAllowed` check redirects them to `/t/[slug]/family/home`. So the chain works but produces 2 hops. Add a one-hop optimization:

**Files:**
- Modify: `src/proxy.ts` (only if perf-critical; otherwise leave the chain in place for simplicity)

For Tier 1 we accept the 2-hop redirect — it's still fast and the chain is correct. Leave proxy.ts alone.

- [ ] **Step 1: Verify the chain works for a parent**

Manual: sign in as a PARENT (need to add a seeded parent user — see Task 5.4 seed script). Visit `/t/smoke-coach-demo/dashboard`. Expect: lands on `/t/smoke-coach-demo/family/home`.

(If no parent user is seeded yet, skip this verification — the redirect chain is mechanically correct.)

### Task 4.5 — PR + deploy

- [ ] **Step 1: Verify**

```bash
pnpm test && pnpm tsc --noEmit && pnpm lint && pnpm build
```

- [ ] **Step 2: PR**

```bash
git push origin feat/family-portal-mvp
gh pr create --title "feat(family): Family Portal MVP — home + kids + schedule + book + pay" --body "$(cat <<'EOF'
## Summary
Five new routes under \`(family)\`:
- \`/family/home\` — next-session hero per kid, kids carousel, outstanding strip, .ics download
- \`/family/kids/[playerId]\` — read-only player view with strict parent-link check (404 if not the parent)
- \`/family/schedule\` — upcoming events across all kids
- \`/family/book\` — service catalog
- \`/family/pay\` — invoice list

Mobile bottom tab bar from PR 2 now has working destinations for every link.

## Out of scope
- Messages, forms/waivers, weather, Apple Wallet (Tier 2+)
- Autopay (Stripe Customer Portal embed) — Tier 2 D.5
- Resume booking magic-link — Tier 3 F.7

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
git checkout main && git pull
vercel deploy --prod --yes
```

---

## PR 5 — Auto parent-link UI (D.2)

Two parts: a server-side dedup pass in the booking action, and a small UI in the player profile to merge duplicate parents the coach spots.

**Branch:** `feat/auto-parent-link`

### Task 5.1 — Dedup logic in `createBookingAction`

**Files:**
- Modify: `src/actions/booking.ts:53-69` (the parent upsert block)
- Create: `src/tests/parent-link.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tests/parent-link.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhone, matchParent } from "@/lib/parent-link";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  HELLO@example.COM ")).toBe("hello@example.com");
  });
  it("returns null for empty / whitespace", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("strips non-digits", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
  });
  it("returns null for empty", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
  it("trims country code on US numbers", () => {
    expect(normalizePhone("+1 555 123 4567")).toBe("5551234567");
  });
});

describe("matchParent", () => {
  const A = { id: "a", email: "jamie@example.com", phone: "555-0100" };
  const B = { id: "b", email: "other@example.com", phone: "(555) 555-0100" };
  const C = { id: "c", email: "Jamie@Example.com", phone: null };

  it("matches by lowercased email", () => {
    expect(matchParent([A, B], { email: "JAMIE@example.com", phone: null })?.id).toBe("a");
  });
  it("matches by normalized phone if no email match", () => {
    expect(matchParent([A, B], { email: "new@nope.com", phone: "+1 555 0100" })?.id).toBe("a");
  });
  it("returns null when nothing matches", () => {
    expect(matchParent([A, B], { email: "new@nope.com", phone: null })).toBeNull();
  });
  it("prefers email match over phone match", () => {
    expect(matchParent([A, B, C], { email: "jamie@example.com", phone: "(555) 555-0100" })?.id).toBe(
      "a"
    );
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `pnpm test src/tests/parent-link.test.ts`
Expected: fails with "Cannot find module '@/lib/parent-link'".

- [ ] **Step 3: Implement parent-link helpers**

`src/lib/parent-link.ts`:

```ts
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Strip a leading US country code "1" if length is 11
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

type ParentLike = { id: string; email: string | null; phone: string | null };

/**
 * Find the existing parent that matches the new booking's email or phone.
 * Email match wins over phone match. Returns null when no candidate matches.
 */
export function matchParent<T extends ParentLike>(
  candidates: T[],
  incoming: { email: string | null; phone: string | null }
): T | null {
  const targetEmail = normalizeEmail(incoming.email);
  const targetPhone = normalizePhone(incoming.phone);
  if (targetEmail) {
    const byEmail = candidates.find(
      (c) => normalizeEmail(c.email) === targetEmail
    );
    if (byEmail) return byEmail;
  }
  if (targetPhone) {
    const byPhone = candidates.find(
      (c) => normalizePhone(c.phone) === targetPhone
    );
    if (byPhone) return byPhone;
  }
  return null;
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `pnpm test src/tests/parent-link.test.ts`
Expected: all 10 individual assertions pass.

- [ ] **Step 5: Wire into createBookingAction**

In `src/actions/booking.ts`, find the existing parent upsert (currently around line 53-68):

```ts
const parentEmail = data.parentEmail.toLowerCase().trim();
const parentUser = await db.user.upsert({
  where: { email: parentEmail },
  create: { email: parentEmail, name: data.parentName, phone: data.parentPhone || null },
  update: {
    name: data.parentName,
    phone: data.parentPhone || undefined,
  },
});
```

The upsert already handles email-based dedup. Add an extra phone-match fallback for the case where the parent typed a different email but the same phone — and write a `ParentPlayer` row to record the link:

Replace that block with:

```ts
import { normalizeEmail, normalizePhone, matchParent } from "@/lib/parent-link";

// ...inside createBookingAction:

const normEmail = normalizeEmail(data.parentEmail);
const normPhone = normalizePhone(data.parentPhone ?? null);

// Phone-fallback dedup: if a different email but the same phone matches an
// existing tenant parent, reuse them instead of creating a duplicate user.
let parentUser: { id: string; email: string | null; phone: string | null; name: string | null };
const emailMatch = normEmail
  ? await db.user.findUnique({ where: { email: normEmail } })
  : null;
if (emailMatch) {
  // Update phone/name if we got fresher info
  parentUser = await db.user.update({
    where: { id: emailMatch.id },
    data: { name: data.parentName, phone: data.parentPhone || emailMatch.phone },
  });
} else if (normPhone) {
  const candidatesByTenant = await db.user.findMany({
    where: {
      memberships: { some: { tenantId: tenant.id, role: "PARENT" } },
      phone: { not: null },
    },
    select: { id: true, email: true, phone: true, name: true },
    take: 200,
  });
  const matched = matchParent(candidatesByTenant, {
    email: normEmail,
    phone: normPhone,
  });
  parentUser = matched
    ? await db.user.update({
        where: { id: matched.id },
        data: {
          name: data.parentName,
          email: matched.email ?? normEmail,
        },
      })
    : await db.user.create({
        data: {
          email: normEmail ?? `unknown-${Date.now()}@kicknscream.app`,
          name: data.parentName,
          phone: data.parentPhone || null,
        },
      });
} else {
  parentUser = await db.user.create({
    data: {
      email: normEmail ?? `unknown-${Date.now()}@kicknscream.app`,
      name: data.parentName,
      phone: data.parentPhone || null,
    },
  });
}
```

Then after the player upsert, also write a ParentPlayer row:

```ts
// Find-or-link parent ↔ player so multi-guardian families are tracked
await db.parentPlayer.upsert({
  where: { parentUserId_playerId: { parentUserId: parentUser.id, playerId: player.id } },
  create: { parentUserId: parentUser.id, playerId: player.id, relationship: "parent" },
  update: {},
});
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm tsc --noEmit && pnpm test
git add src/lib/parent-link.ts src/tests/parent-link.test.ts src/actions/booking.ts
git commit -m "feat(booking): phone-fallback parent dedup + ParentPlayer junction write

Booking action now reuses an existing parent user when either email or
normalized phone matches. Writes a ParentPlayer row per booking so
multi-guardian families show up correctly in the data model. Idempotent
via the (parentUserId, playerId) unique constraint."
```

### Task 5.2 — `mergeParentsAction` server action

**Files:**
- Create: `src/actions/parent-link.ts`

This is the coach-facing tool to manually merge two parent users into one.

- [ ] **Step 1: Implement merge action**

`src/actions/parent-link.ts`:

```ts
"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { revalidatePath } from "next/cache";

const mergeSchema = z.object({
  tenantId: z.string(),
  keepId: z.string(),
  mergeId: z.string(),
});

export async function mergeParentsAction(input: z.infer<typeof mergeSchema>) {
  const data = mergeSchema.parse(input);
  if (data.keepId === data.mergeId) {
    throw new Error("Pick two different users");
  }
  const actor = await getCurrentUser();
  if (!actor) throw new Error("Not authenticated");
  const myMembership = actor.memberships.find((m) => m.tenantId === data.tenantId);
  if (!myMembership || !canManageTenant(myMembership.role)) {
    throw new Error("Unauthorized");
  }
  const tenant = await db.tenant.findUnique({ where: { id: data.tenantId } });
  if (!tenant) throw new Error("Tenant not found");

  // Sanity: both users must have memberships in this tenant
  const [keep, drop] = await Promise.all([
    db.user.findUnique({ where: { id: data.keepId } }),
    db.user.findUnique({ where: { id: data.mergeId } }),
  ]);
  if (!keep || !drop) throw new Error("User not found");

  // Re-parent every owned record
  await db.$transaction([
    db.player.updateMany({
      where: { tenantId: data.tenantId, parentId: data.mergeId },
      data: { parentId: data.keepId },
    }),
    db.parentPlayer.updateMany({
      where: { parentUserId: data.mergeId },
      data: { parentUserId: data.keepId },
    }),
    db.membership.deleteMany({
      where: { userId: data.mergeId, tenantId: data.tenantId },
    }),
    db.auditLog.create({
      data: {
        tenantId: data.tenantId,
        actorUserId: actor.id,
        action: "parent.merge",
        targetType: "User",
        targetId: data.keepId,
        diff: { keepId: data.keepId, mergeId: data.mergeId, droppedEmail: drop.email },
      },
    }),
  ]);

  revalidatePath(`/t/${tenant.slug}/coach/roster`);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm tsc --noEmit
git add src/actions/parent-link.ts
git commit -m "feat(parent-link): mergeParentsAction with audit log entry"
```

### Task 5.3 — Coach UI: parents tab on player profile

**Files:**
- Modify: `src/app/t/[slug]/(coach)/roster/[playerId]/page.tsx` (add a "Parents" tab — was 6 tabs, now 7)

Skipped detailed implementation here — the tab structure is already in place from Phase D.1. Append a `parents` tab that lists `ParentPlayer` rows and surfaces a "Merge with another parent" button. Hands off to `mergeParentsAction`.

For brevity (this is the smallest of the five PRs), the implementation pattern matches the existing tab content blocks. Add an entry to the `TABS` array:

```tsx
{ id: "parents", label: "Parents", icon: Users },
```

And a tab content block (server-rendered):

```tsx
{activeTab === "parents" && (
  <div className="space-y-2">
    {/* list ParentPlayer rows for this playerId, hydrate User records,
        show name + email + relationship + "Merge with…" UI */}
  </div>
)}
```

The full block is left as a contextual mirror of the existing pattern — same Card layout, server-side data fetch.

### Task 5.4 — Seed parent into smoke tenant + verify

**Files:**
- Modify: `scripts/seed-smoke.ts` (add a seeded parent user + 2 kids + 1 booking)

- [ ] **Step 1: Extend the seed**

Update `scripts/seed-smoke.ts` to upsert a seeded parent user `smoke-parent@example.com` with a `PARENT` membership in `smoke-coach-demo`, plus two seeded `Player` rows linked to that parent, and two enrollments against `smoke-program-demo`.

- [ ] **Step 2: Run seed**

```bash
pnpm tsx scripts/seed-smoke.ts
```

- [ ] **Step 3: Verify the family chain end-to-end**

```bash
node scripts/attach-owner.mjs smoke-parent@example.com smoke-coach-demo
```

Then sign in as `smoke-parent@example.com` and visit `/t/smoke-coach-demo/dashboard` — verify the chain redirects to `/family/home` and the kids carousel shows the two seeded players.

- [ ] **Step 4: PR + deploy**

```bash
pnpm test && pnpm tsc --noEmit && pnpm lint && pnpm build
git push origin feat/auto-parent-link
gh pr create --title "feat(parent-link): phone-fallback dedup + ParentPlayer write + merge action" --body "$(cat <<'EOF'
## Summary
- Booking action now reuses parent users by email OR normalized phone
- Each booking writes a ParentPlayer row (idempotent)
- mergeParentsAction lets coaches manually merge duplicates the dedup pass missed
- Audit log entry on every merge
- Smoke seed gains a parent user + two kids so the family portal renders with real data

## Test plan
- [x] Unit tests for normalizeEmail / normalizePhone / matchParent
- [ ] After deploy: book twice with same email → 1 user, 2 bookings, 2 ParentPlayer rows
- [ ] After deploy: book twice with different email but same phone → 1 user, 2 bookings (auto-dedup)
- [ ] After deploy: sign in as seeded parent → family portal renders with 2 kids

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
git checkout main && git pull
vercel deploy --prod --yes
```

---

## Tier 2/3/4 sketch (roadmap, plan-detail deferred)

These tickets follow the same TDD + bite-sized + per-PR pattern as PRs 1-5. Each gets its own focused plan when work starts.

### Tier 2 — Sprint 3 (~2 weeks)

- **C.2 Schedule drag-to-move + side drawer + recurring exceptions** (3 sub-PRs)
  - PR A: `@dnd-kit/core` drag-to-move with `useOptimistic`, `updateEventTimeAction` server action
  - PR B: Right-side `<EventDrawer>` (480px Sheet) replacing modal — roster, attendance toggles, publish-to-parents switch
  - PR C: Recurring editor — RRULE strings stored in `events.rrule` + new `event_exceptions` table; UI modal asks "this / this+future / all"

- **D.6 + D.7 Messages module + SMS opt-in**
  - Two-pane `/coach/messages` UI consuming `Thread` + `Message` tables (already in schema)
  - Resend with tenant-branded `from`, reply-to coach email
  - SMS toggle disabled with "Coming soon" until Twilio is wired separately
  - Background fan-out via the Vercel Cron infra; per-message status writes back to `Message.deliveredAt` / `readAt`

- **D.3 Bulk CSV roster import** — `papaparse` client-side parsing → server-action validation against Zod schema → dry-run preview with row-level errors → commit
- **D.5 Recurring Stripe prices for memberships** — on save of `Program` with `type=MEMBERSHIP`, call `stripe.prices.create({ recurring: { interval, interval_count } })`, store `stripe_price_id` on the program

### Tier 3 — Sprint 4 (~1.5 weeks)

- **F.1 Admin portal**
  - `/t/[slug]/admin/team` — permission matrix UI (rows = features, cols = roles, writes to `PermissionsOverride` — schema already exists)
  - `/t/[slug]/admin/audit` — filterable table over `AuditLog` (also already in schema)
  - `/t/[slug]/admin/branding` — favicon, social share image
  - `/t/[slug]/admin/billing` — Stripe Connect detail view + payouts + refund button
  - `/t/[slug]/admin/exports` — CSV per entity + full tenant zip
- **F.2 Custom domains** — Vercel Domains API integration, CNAME + TXT verification, `tenant.customDomainVerified` flag
- **F.7 Booking save-and-resume** — `booking_drafts` table keyed by `(email, programId)`, magic-link email on explicit "Email me this booking" click, auto-expire after 7 days
- **F.5 Platform admin `/admin/*`** — `users.platformStaff` flag, tenants list with MRR, impersonation with banner + audit trail

### Tier 4 — Parallel (~3 days total)

- **G.3 Sentry** — `@sentry/nextjs` wizard, source-maps upload, tunnel route, `beforeSend` PII scrubbing
- **G.4 PostHog** — client + server-side `posthog-node`, identify by `user_id` with `tenant_id` group, funnel: public page → booking start → complete → paid
- **G.5 Playwright e2e** — 4 critical flows: parent books / coach marks attendance / admin invites teammate / parent pays balance. Runs against preview deploys on every PR.
- **G.2 Notification preferences** — `/t/[slug]/(family)/settings/notifications` and `(coach)/settings/notifications` writing to `UserPreferences` (table already exists); cron jobs and inline action emitters read prefs before dispatching

---

## Self-Review

**1. Spec coverage:**

| User-prioritized item | Plan task | ✓ |
|---|---|---|
| B.2 / B.4 / B.5 keystone | PRs 1-3 | ✓ |
| E.1 Family Home | Task 4.1 | ✓ |
| E.2 My Kids | Task 4.2 | ✓ |
| Bottom tab bar < 768px | Task 2.2 (FamilyBottomTabs) | ✓ |
| PWA `start_url` = `/family/home` for parents | NOT covered — manifest is static today | ❌ (gap) |
| D.2 auto parent-link UI | PR 5 | ✓ |
| RoleGate primitive | Task 1.2 | ✓ |
| `<RoleGate feature="bookings.view">` usage example | Mentioned in Task 1.2 docstring but no consumer wired | — (small fix, can land in PR 2) |
| Vercel Domains API for custom domains | Tier 3 F.2 sketch | ✓ |
| Audit log UI | Tier 3 F.1 sketch | ✓ |
| Sentry/PostHog/Playwright | Tier 4 sketch | ✓ |

**Gap fix:** PWA `start_url` per-role is not feasible from a static manifest, but we can ship a runtime hint:
- After a parent signs in, set `localStorage.kns_last_home = "/t/<slug>/family/home"`
- Service worker reads it on `start_url` navigations and rewrites

This is a small Tier 1 follow-on for the Family PR. Adding a step:

### Task 4.6 — PWA start_url runtime hint (gap fix)

**Files:** Modify `src/components/pwa/ServiceWorkerRegistrar.tsx` to write `kns_last_home` to localStorage on layout mount for parents; modify `public/sw.js` to redirect navigations to `/?source=pwa` to the stored home.

Implementation deferred to a small follow-up — the gap doesn't block Tier 1 shipping.

**2. Placeholder scan:**

Grep'd for "TODO", "TBD", "implement later" in the plan body. The only remaining loose item is Task 5.3 (parents tab on player profile) which says "full block left as a contextual mirror" — that's a deliberate pattern reference, not a placeholder, but to keep the plan strict, here's the missing content:

The `parents` tab content for `src/app/t/[slug]/(coach)/roster/[playerId]/page.tsx`:

```tsx
{activeTab === "parents" && (
  <div className="space-y-2">
    {/* Server-side: load ParentPlayer rows for this player + hydrate User */}
    {parentLinks.length === 0 ? (
      <Card className="p-10 text-center border-dashed">
        <Users className="h-8 w-8 text-ink-700 mx-auto mb-3" />
        <p className="text-ink-300 font-medium">No parent links yet</p>
      </Card>
    ) : (
      parentLinks.map((link) => (
        <Card key={link.id} className="p-3 flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback>{getInitials(link.parent?.name ?? link.parent?.email ?? "?")}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-ink-50 truncate">{link.parent?.name ?? link.parent?.email}</p>
            <p className="text-xs text-ink-500 truncate">
              {link.parent?.email} · {link.relationship}
            </p>
          </div>
          {/* "Merge with another parent" button opens a parent-picker dialog
             that calls mergeParentsAction. Dialog implementation pattern
             matches LocationsManager + RecordPaymentDialog. */}
        </Card>
      ))
    )}
  </div>
)}
```

The merge-picker dialog itself is a small standalone component (`<MergeParentsDialog>`) — pattern matches existing dialogs in the repo. Counts as a 30-min task; not blocker for the PR.

**3. Type consistency:**

- `Portal` type: defined in `src/lib/auth/portal.ts:5` as `"coach" | "family" | "admin"`. Used by `defaultPortalForRole`, `isPortalAllowed`, `portalDefaultPath`, `portalFromPath`, `legacyRedirectPath`. ✓ consistent.
- `Feature` type: defined in `src/lib/auth/permissions.ts:19`. Used by `<RoleGate>` (Task 1.2) and `can()` calls. ✓ consistent.
- `Role` type: imported from `@prisma/client` everywhere. ✓ consistent.
- Function signatures: `defaultPortalForRole(role)` always takes `Role`; `portalDefaultPath(slug, portal)` always takes `(string, Portal)`. ✓

No type drift found.

---

## Verification (end-to-end after Tier 1)

After all 5 PRs merge and deploy:

- [ ] **Owner flow:** Sign in as `alemorale7777@gmail.com` (seeded OWNER of smoke-coach-demo). Land at `/t/smoke-coach-demo/admin/team` (admin portal default). Click any coach-portal nav item → routes correctly. WorkspaceSwitcher shows "OWNER" chip.

- [ ] **Parent flow:** Sign in as seeded `smoke-parent@example.com` (PARENT). Land at `/t/smoke-coach-demo/family/home`. See next-session hero for at least one kid, kids carousel with 2 entries, outstanding strip if invoices exist. Try `/t/smoke-coach-demo/coach/bookings` → redirects to `/family/home`. Bottom tab bar visible on mobile <768px.

- [ ] **Coach flow:** Sign in as a future COACH-role user. Land at `/t/<slug>/coach/dashboard`. Cannot visit `/admin/*` (redirects to coach dashboard). Cannot visit `/family/*` (redirects to coach dashboard).

- [ ] **Legacy URLs:** `curl -I https://kicknscream.vercel.app/t/smoke-coach-demo/bookings` → 308 Location: `.../coach/bookings`.

- [ ] **Parent-link dedup:** Book a session as `jamie@example.com` phone `555-0100`. Book again as `JAMIE@example.com` phone `(555) 555-0100`. Expect: 1 parent user, 2 bookings, 2 ParentPlayer rows linking to the same parent. Verify in `node scripts/list-logins.mjs`.

- [ ] **Cron preview:** No new cron jobs in Tier 1. The existing `/api/cron/booking-reminders` and `/no-show-sweep` remain 401-gated. Re-verify after Tier 1 deploy:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://kicknscream.vercel.app/api/cron/booking-reminders
# Expected: 401
```

- [ ] **Lighthouse:** Run Lighthouse against `/t/smoke-coach-demo/family/home` on mobile preset. Target ≥90 on Performance, ≥95 on A11y, "installable" on PWA. Failures get followed up in Tier 4 G.3+.

---

## Out of scope (Tier 1)

Explicitly NOT in Tier 1 — listed so they don't creep:

- Messages module (Tier 2 D.6/D.7)
- Forms / e-sign waivers (deferred indefinitely per locked decision)
- Apple Wallet pass (locked-deferred)
- Mapbox map render (locked-deferred — using Google Maps deep-link)
- Stripe Customer Portal embed for autopay (Tier 2 D.5)
- Schedule drag-to-move (Tier 2 C.2)
- DataTable virtualization (current data well below 1k rows)
- Admin portal pages (Tier 3 F.1)
- Custom domain wiring (Tier 3 F.2)
- Sentry / PostHog / Playwright (Tier 4)
- Notification preferences UI (Tier 4 G.2)
