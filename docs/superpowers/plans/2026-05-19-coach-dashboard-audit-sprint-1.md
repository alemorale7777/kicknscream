# Coach Dashboard Audit — Sprint 1 (Top 5 Critical) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five highest-leverage issues from the 2026-05-19 dashboard audit so the schedule shows correct local times, every modal dismisses normally, the coach/admin shell split stops dumping users sideways, the $0 Monthly Membership stops leaking publicly, and internal/competitor copy is purged from user-facing surfaces.

**Architecture:**
- **Timezone fix** — introduce `Tenant.timeZone` (string IANA, default `"America/Los_Angeles"`) and a single `src/lib/datetime.ts` formatter that wraps `date-fns-tz`. Every render path (week grid, event modal, event detail page, public tenant page) funnels through it. Server components read the tenant timezone and pass it down; the EventDialog form does a clean local↔UTC round-trip without manual offset math.
- **Modal dismiss** — forward `onEscapeKeyDown` / `onInteractOutside` props through our `DialogContent` and `SheetContent` wrappers so Radix's defaults work everywhere.
- **Shell consolidation** — Sprint 1 keeps both shells but (a) adds an Admin section to the coach sidebar so admin routes are reachable, (b) fixes the dashboard "Outstanding" Stripe-connect CTAs so they don't silently swap shells, (c) deletes the duplicate coach billing page and redirects it.
- **$0 service** — filter MONTHLY programs with no `stripePriceId` out of the public page query.
- **Copy cleanup** — surgical string edits in five files.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript, Prisma 7 / Neon Postgres, vitest, Tailwind v4, Radix UI primitives, date-fns 4, date-fns-tz (new).

**Locked-file warning:** `prisma/schema.prisma` is listed as "locked after Sprint 1" in `AGENTS.md`. Task 1 adds a `Tenant.timeZone` column — this is the only schema change in this plan and is required to fix the timezone bug. Confirm with the user before running `pnpm db:push`.

---

## File Structure

**Create:**
- `src/lib/datetime.ts` — `formatEventTime`, `formatEventDate`, `toTenantLocalIsoMinute`, `fromTenantLocalIsoMinute`
- `src/tests/datetime.test.ts` — unit tests for the formatter
- `src/tests/modal-dismiss.test.tsx` — confirms Radix props are forwarded

**Modify:**
- `prisma/schema.prisma` — add `timeZone String @default("America/Los_Angeles")` to `Tenant`
- `src/components/schedule/WeekView.tsx` — replace `format(start, "h:mm")` with `formatEventTime(start, tenantTimeZone)`; accept `tenantTimeZone` prop
- `src/components/schedule/ScheduleClient.tsx` — accept `tenantTimeZone` prop and pass through to WeekView/DayView/MonthView/EventDialog; on click pass through the actual occurrence start, not the series anchor
- `src/components/schedule/EventDialog.tsx` — replace `toLocalIsoMinute` with `toTenantLocalIsoMinute`/`fromTenantLocalIsoMinute`; accept `tenantTimeZone`
- `src/components/schedule/DayView.tsx`, `MonthView.tsx` — same prop drilling
- `src/app/t/[slug]/coach/schedule/page.tsx` — pass `tenant.timeZone` into `ScheduleClient`
- `src/app/t/[slug]/coach/schedule/[eventId]/page.tsx` — use `formatEventDate`/`formatEventTime`
- `src/app/[slug]/page.tsx` — use the formatter for "What's coming up"; filter out unpriced MONTHLY programs in the services query
- `src/components/ui/dialog.tsx` — spread props onto `DialogPrimitive.Content` so escape/interact-outside callbacks pass through
- `src/components/ui/sheet.tsx` — same
- `src/lib/nav.ts` — add Admin section (Team / Permissions / Audit / Branding / Exports) gated by role to the coach sidebar
- `src/app/t/[slug]/coach/dashboard/page.tsx` — change Stripe-connect CTAs to point to the admin billing page consistently AND prefix the link with a small "Admin" badge so the shell swap isn't silent (or, simpler, rewrite the link to a coach-scoped `/coach/settings/stripe-connect` that wraps the admin billing snippet — the plan implements the simpler "consistent admin link + badge")
- `src/app/t/[slug]/coach/settings/billing/page.tsx` — delete the duplicate UI and `redirect()` to `/t/[slug]/admin/billing`
- `src/app/t/[slug]/coach/settings/page.tsx` — update the "Billing" tile description so it's clear it opens the admin billing page
- `src/app/page.tsx` — remove competitor names from hero copy
- `src/app/layout.tsx` — remove "SportsEngine alternative" from SEO keywords
- `src/app/t/[slug]/admin/permissions/page.tsx` — generalize "SportsEngine-style tenant" wording
- `src/components/settings/NotificationPreferencesForm.tsx` — rephrase the "Coming soon" line and make the SMS toggles visibly disabled

---

## Task 1 — Tenant timezone + central datetime formatter

**Files:**
- Modify: `prisma/schema.prisma:83-127` (Tenant model)
- Create: `src/lib/datetime.ts`
- Create: `src/tests/datetime.test.ts`

- [ ] **Step 1.1: Add `date-fns-tz` dependency**

Run: `pnpm add date-fns-tz@^3`
Expected: `package.json` and `pnpm-lock.yaml` updated.

- [ ] **Step 1.2: Add `Tenant.timeZone` column to Prisma schema**

Edit `prisma/schema.prisma`, inside the `model Tenant { ... }` block (around line 83-127), add this field next to the other string fields:

```prisma
  timeZone  String   @default("America/Los_Angeles")
```

- [ ] **Step 1.3: Push schema to Neon**

Run: `pnpm db:push`
Expected: prints `🚀 Your database is now in sync with your Prisma schema.` All existing tenants get the default value backfilled.

- [ ] **Step 1.4: Regenerate Prisma client**

Run: `pnpm prisma generate`
Expected: client regenerates without error. `TenantSelect`/`TenantFindFirstArgs` now include `timeZone`.

- [ ] **Step 1.5: Write failing tests for the datetime helper**

Create `src/tests/datetime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  formatEventTime,
  formatEventDate,
  toTenantLocalIsoMinute,
  fromTenantLocalIsoMinute,
} from "@/lib/datetime";

const PT = "America/Los_Angeles";
const ET = "America/New_York";

describe("formatEventTime", () => {
  it("renders a UTC instant in the tenant's local timezone", () => {
    // 2026-05-20T00:50:00Z === 2026-05-19 17:50 PT
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(formatEventTime(instant, PT)).toBe("5:50 PM");
  });

  it("respects a non-default tenant timezone", () => {
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(formatEventTime(instant, ET)).toBe("8:50 PM");
  });
});

describe("formatEventDate", () => {
  it("formats long-form date in tenant timezone", () => {
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(formatEventDate(instant, PT)).toBe("Tuesday, May 19");
  });

  it("crosses midnight boundary correctly", () => {
    // 2026-05-20T06:00:00Z === 2026-05-19 23:00 PT, 2026-05-20 02:00 ET
    const instant = new Date("2026-05-20T06:00:00Z");
    expect(formatEventDate(instant, PT)).toBe("Tuesday, May 19");
    expect(formatEventDate(instant, ET)).toBe("Wednesday, May 20");
  });
});

describe("tenant-local ISO minute round trip", () => {
  it("converts UTC instant → tenant-local 'YYYY-MM-DDTHH:mm' string", () => {
    const instant = new Date("2026-05-20T00:50:00Z");
    expect(toTenantLocalIsoMinute(instant, PT)).toBe("2026-05-19T17:50");
  });

  it("converts tenant-local 'YYYY-MM-DDTHH:mm' string → UTC instant", () => {
    const utc = fromTenantLocalIsoMinute("2026-05-19T17:50", PT);
    expect(utc.toISOString()).toBe("2026-05-20T00:50:00.000Z");
  });

  it("round-trips without drift", () => {
    const original = new Date("2026-07-04T19:30:00Z");
    const localStr = toTenantLocalIsoMinute(original, PT);
    const back = fromTenantLocalIsoMinute(localStr, PT);
    expect(back.toISOString()).toBe(original.toISOString());
  });

  it("handles DST forward jump (PT spring-forward 2026-03-08)", () => {
    // 2026-03-08T10:30Z = 2026-03-08 02:30 PST or 03:30 PDT — PT skips 2-3am
    const localStr = "2026-03-08T03:30"; // first valid time after spring forward
    const utc = fromTenantLocalIsoMinute(localStr, PT);
    expect(utc.toISOString()).toBe("2026-03-08T10:30:00.000Z");
  });
});
```

- [ ] **Step 1.6: Run the tests to confirm they fail with module-not-found**

Run: `pnpm vitest run src/tests/datetime.test.ts`
Expected: FAIL with `Cannot find module '@/lib/datetime'`.

- [ ] **Step 1.7: Implement the datetime helper**

Create `src/lib/datetime.ts`:

```ts
import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export function formatEventTime(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "h:mm a");
}

export function formatEventDate(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "EEEE, MMMM d");
}

export function formatEventDateTime(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "EEE MMM d · h:mm a");
}

export function formatEventShort(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "EEE h:mm a");
}

export function toTenantLocalIsoMinute(instant: Date, timeZone: string): string {
  const zoned = toZonedTime(instant, timeZone);
  return format(zoned, "yyyy-MM-dd'T'HH:mm");
}

export function fromTenantLocalIsoMinute(local: string, timeZone: string): Date {
  return fromZonedTime(local, timeZone);
}
```

- [ ] **Step 1.8: Run the tests to confirm they pass**

Run: `pnpm vitest run src/tests/datetime.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 1.9: Commit**

```bash
git add prisma/schema.prisma package.json pnpm-lock.yaml src/lib/datetime.ts src/tests/datetime.test.ts
git commit -m "feat(datetime): tenant-scoped event time formatter"
```

---

## Task 2 — Wire formatter into schedule + event detail + public page

**Files:**
- Modify: `src/components/schedule/ScheduleClient.tsx`
- Modify: `src/components/schedule/WeekView.tsx`
- Modify: `src/components/schedule/DayView.tsx`
- Modify: `src/components/schedule/MonthView.tsx`
- Modify: `src/components/schedule/EventDialog.tsx`
- Modify: `src/app/t/[slug]/coach/schedule/page.tsx`
- Modify: `src/app/t/[slug]/coach/schedule/[eventId]/page.tsx`
- Modify: `src/app/[slug]/page.tsx`

- [ ] **Step 2.1: Thread `tenantTimeZone` from the schedule page through ScheduleClient**

In `src/app/t/[slug]/coach/schedule/page.tsx` find the call to `<ScheduleClient ... />` and add `tenantTimeZone={tenant.timeZone}`. Confirm the `requireTenant`/Prisma select includes `timeZone` (add it to the `select` if it's an explicit selection).

In `src/components/schedule/ScheduleClient.tsx`, add `tenantTimeZone: string` to the props interface and pass it into `<WeekView>`, `<DayView>`, `<MonthView>`, and `<EventDialog>`.

- [ ] **Step 2.2: Update WeekView to use the formatter**

Edit `src/components/schedule/WeekView.tsx` around lines 360-362. Replace:

```tsx
{format(start, "h:mm")}
```

with:

```tsx
{formatEventTime(start, tenantTimeZone)}
```

Add `import { formatEventTime } from "@/lib/datetime";` at the top. Remove the `format` import from `date-fns` if it's no longer used in this file. Add `tenantTimeZone: string` to the WeekView props.

- [ ] **Step 2.3: Update DayView and MonthView**

Do the same prop addition and `format(...)` → `formatEventTime(...)` swap in `DayView.tsx` and `MonthView.tsx`. For day headers that show full dates (e.g., "Tuesday, May 19"), use `formatEventDate(start, tenantTimeZone)`.

- [ ] **Step 2.4: Fix the recurring-event click bug in ScheduleClient**

In `src/components/schedule/ScheduleClient.tsx` around line 122, find `handleEventClick`. The current implementation passes the event object as-is to the dialog, which causes the dialog to show the series-anchor occurrence rather than the clicked instance.

The fix depends on how recurring events are expanded — verify in the file whether the WeekView is iterating over an expanded list of occurrences (each with a real `startsAt`) or over the series anchor plus a recurrence rule. If occurrences are expanded, ensure the click handler is being given the expanded occurrence object (which has the correct `startsAt`/`endsAt` for the clicked Tuesday), not the original series row. If the WeekView is currently passing the series row, change it to pass the occurrence instead.

Add a vitest test in `src/tests/schedule-click.test.tsx` that constructs a fake recurring event with two occurrences and asserts that clicking the second occurrence calls `onEventClick` with the second occurrence's `startsAt`, not the first.

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import WeekView from "@/components/schedule/WeekView";

describe("WeekView recurring event click", () => {
  it("passes the clicked occurrence to onEventClick, not the series anchor", () => {
    const onEventClick = vi.fn();
    const occurrences = [
      { id: "u10-1", startsAt: new Date("2026-05-19T00:50:00Z"), endsAt: new Date("2026-05-19T01:50:00Z"), title: "U10 Skills", seriesId: "u10" },
      { id: "u10-2", startsAt: new Date("2026-05-26T00:50:00Z"), endsAt: new Date("2026-05-26T01:50:00Z"), title: "U10 Skills", seriesId: "u10" },
    ];
    render(<WeekView events={occurrences} weekStart={new Date("2026-05-18T07:00:00Z")} tenantTimeZone="America/Los_Angeles" onEventClick={onEventClick} />);
    const cards = screen.getAllByText(/U10 Skills/i);
    fireEvent.click(cards[1]);
    expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ id: "u10-2" }));
  });
});
```

Run: `pnpm vitest run src/tests/schedule-click.test.tsx`
Expected: PASSES once you've verified the right occurrence is being passed.

- [ ] **Step 2.5: Update EventDialog to use tenant-local conversions**

In `src/components/schedule/EventDialog.tsx` around line 83-86 (`toLocalIsoMinute`), replace the manual `getTimezoneOffset` math with:

```tsx
import { toTenantLocalIsoMinute, fromTenantLocalIsoMinute } from "@/lib/datetime";

// (delete the existing toLocalIsoMinute helper)
```

Add `tenantTimeZone: string` to the dialog props. When the dialog opens with an event, pre-fill the date/time inputs with `toTenantLocalIsoMinute(event.startsAt, tenantTimeZone)`. When the form submits, convert back with `fromTenantLocalIsoMinute(formValue, tenantTimeZone)` before sending to the server action.

- [ ] **Step 2.6: Fix the event-detail page**

Edit `src/app/t/[slug]/coach/schedule/[eventId]/page.tsx` around lines 142 and 146. Replace:

```tsx
{format(event.startsAt, "EEEE, MMMM d")}
{format(event.startsAt, "h:mm a")}
```

with:

```tsx
{formatEventDate(event.startsAt, tenant.timeZone)}
{formatEventTime(event.startsAt, tenant.timeZone)} – {formatEventTime(event.endsAt, tenant.timeZone)}
```

Add `import { formatEventDate, formatEventTime } from "@/lib/datetime";`. Confirm the page reads `tenant.timeZone` via `requireTenant` — if the select doesn't include it, add `timeZone: true` to the tenant select.

- [ ] **Step 2.7: Fix the public tenant page**

Edit `src/app/[slug]/page.tsx` around line 368 ("What's coming up"). Replace `format(e.startsAt, "EEE h:mm a")` with `formatEventShort(e.startsAt, tenant.timeZone)`. The tenant object passed to this page already includes `timeZone` after the schema change; if not, add it to the select.

- [ ] **Step 2.8: Manually verify by starting the dev server**

Run: `pnpm dev`
Open `http://localhost:3000` and navigate to the demo tenant's coach schedule (`/t/<slug>/coach/schedule`). Confirm:
- The "U10 Skills Session" card on Tuesday shows `5:50 PM`.
- Clicking the Tuesday card opens the edit modal with date `2026-05-19` and time `17:50`, not 5/24.
- Visiting `/t/<slug>/coach/schedule/<event-id>` shows "Tuesday, May 19 · 5:50 PM – 6:50 PM".
- Visiting the public `/t/<slug>` page "What's coming up" shows "Tue 5:50 PM".
- No `React #418` minified error in the console.

- [ ] **Step 2.9: Commit**

```bash
git add src/components/schedule src/app/t/[slug]/coach/schedule src/app/[slug]/page.tsx src/tests/schedule-click.test.tsx
git commit -m "fix(schedule): render event times in tenant timezone end-to-end"
```

---

## Task 3 — Modal Escape + backdrop dismiss

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/sheet.tsx`
- Create: `src/tests/modal-dismiss.test.tsx`

- [ ] **Step 3.1: Read the current wrappers**

Open `src/components/ui/dialog.tsx` and `src/components/ui/sheet.tsx` and locate the `DialogContent` / `SheetContent` `forwardRef`. Confirm that `{...props}` is or isn't being spread onto the underlying `DialogPrimitive.Content`. The Explore agent's finding was that the props aren't being forwarded, but verify by reading the code.

- [ ] **Step 3.2: Write a failing test for Escape dismissal**

Create `src/tests/modal-dismiss.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

describe("Sheet dismiss behavior", () => {
  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent>hello</SheetContent>
      </Sheet>
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("Dialog dismiss behavior", () => {
  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>hello</DialogContent>
      </Dialog>
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

Run: `pnpm vitest run src/tests/modal-dismiss.test.tsx`
Expected: tests FAIL (Radix not closing because props/handlers aren't wired).

- [ ] **Step 3.3: Forward props through DialogContent and SheetContent**

In both `src/components/ui/dialog.tsx` and `src/components/ui/sheet.tsx`, ensure the underlying `DialogPrimitive.Content` (or `SheetPrimitive.Content`) gets `{...props}` spread onto it, including `onEscapeKeyDown` and `onPointerDownOutside`. If a `className` or other prop is being plucked out, use rest-spread:

```tsx
const SheetContent = React.forwardRef<...>(({ className, children, side = "right", ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content ref={ref} className={cn(...)} {...props}>
      {children}
      <SheetPrimitive.Close className="...">...</SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
));
```

Do the same for `DialogContent`.

- [ ] **Step 3.4: Run the tests to confirm they pass**

Run: `pnpm vitest run src/tests/modal-dismiss.test.tsx`
Expected: both tests PASS.

- [ ] **Step 3.5: Manually verify with the dev server**

Open `/t/<slug>/coach/schedule`, click "New Event", press Escape — drawer should close. Click the backdrop — drawer should close. Repeat for Add Player on `/coach/roster`.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/tests/modal-dismiss.test.tsx
git commit -m "fix(ui): forward Radix dismiss handlers through Dialog/Sheet wrappers"
```

---

## Task 4 — Sidebar surfaces admin routes + dashboard CTAs stop swapping shells silently

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `src/components/chrome/SideNav.tsx` (if it filters or renders sections)
- Modify: `src/app/t/[slug]/coach/dashboard/page.tsx`
- Modify: `src/app/t/[slug]/coach/settings/billing/page.tsx` (delete + redirect)
- Modify: `src/app/t/[slug]/coach/settings/page.tsx` (update billing tile description)
- Modify: `src/tests/nav.test.ts` (extend)

- [ ] **Step 4.1: Read the current nav definitions**

Open `src/lib/nav.ts` and `src/components/chrome/SideNav.tsx`. Identify how sections are defined and how role gating works. Note where ADMIN/OWNER-only sections should live.

- [ ] **Step 4.2: Add an Admin section to the coach sidebar**

In `src/lib/nav.ts`, after the existing coach sections, add a new section that's only included when `hasRole(membership, "ADMIN")`:

```ts
{
  heading: "Admin",
  items: [
    { label: "Team", href: `/t/${slug}/admin/team`, icon: "users" },
    { label: "Permissions", href: `/t/${slug}/admin/permissions`, icon: "shield" },
    { label: "Billing", href: `/t/${slug}/admin/billing`, icon: "credit-card" },
    { label: "Branding", href: `/t/${slug}/admin/branding`, icon: "palette" },
    { label: "Audit log", href: `/t/${slug}/admin/audit`, icon: "list" },
    { label: "Exports", href: `/t/${slug}/admin/exports`, icon: "download" },
  ],
}
```

Use whatever item/section shape the file already uses. Reuse existing icon names.

- [ ] **Step 4.3: Extend the nav test**

In `src/tests/nav.test.ts` add a case that asserts the Admin section is present for an `ADMIN` membership and absent for a `COACH` membership.

Run: `pnpm vitest run src/tests/nav.test.ts`
Expected: new assertions PASS; existing ones still pass.

- [ ] **Step 4.4: Fix the dashboard "Outstanding" Stripe-connect links**

In `src/app/t/[slug]/coach/dashboard/page.tsx` find the "Stripe-connect missing" and "Stripe requirements due" CTAs at lines 206 and 220. Keep the link target as `/t/${slug}/admin/billing` (the rich Stripe UI lives there), but append a small `Admin` badge / `→` indicator next to the CTA copy so the user knows the click navigates them out of the coach shell. Concretely:

```tsx
<Link href={`/t/${slug}/admin/billing`} className="...">
  Connect Stripe
  <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-xs uppercase tracking-wide text-slate-200">Admin</span>
</Link>
```

Do the same for the "Finish requirements" CTA.

- [ ] **Step 4.5: Delete the duplicate coach billing page**

The richer billing UI is at `/admin/billing`; the simple form at `/coach/settings/billing` is the duplicate. Replace its body with a `redirect()`:

```tsx
// src/app/t/[slug]/coach/settings/billing/page.tsx
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/t/${slug}/admin/billing`);
}
```

- [ ] **Step 4.6: Update the Settings index "Billing" tile**

In `src/app/t/[slug]/coach/settings/page.tsx`, find the Billing tile description and update it to read: `"Connected accounts, payouts, refunds, and Stripe requirements. Opens admin."` (or similar — be clear it leaves the coach shell.)

- [ ] **Step 4.7: Manually verify**

Run `pnpm dev`. Sign in as an ADMIN; the coach sidebar should now show the Admin section. Sign in as a COACH (non-admin); the Admin section should be hidden. Click the dashboard "Connect Stripe" CTA — confirm the Admin badge and that it lands on `/admin/billing`. Visit `/coach/settings/billing` — confirm redirect to `/admin/billing`.

- [ ] **Step 4.8: Commit**

```bash
git add src/lib/nav.ts src/components/chrome/SideNav.tsx src/app/t/[slug]/coach/dashboard/page.tsx src/app/t/[slug]/coach/settings/billing/page.tsx src/app/t/[slug]/coach/settings/page.tsx src/tests/nav.test.ts
git commit -m "fix(nav): surface admin routes in coach sidebar; collapse duplicate billing UI"
```

---

## Task 5 — Hide unpriced MONTHLY services from the public page

**Files:**
- Modify: `src/app/[slug]/page.tsx`
- Create: `src/tests/public-services-filter.test.ts` (or inline within the page-rendering test if one exists)

- [ ] **Step 5.1: Confirm the Prisma `Program` shape**

Open `prisma/schema.prisma` and locate the `Program` model. Verify it has `priceModel`, `price`, `stripePriceId`, `archived` fields (per Explore findings).

- [ ] **Step 5.2: Write a failing unit test**

Create `src/tests/public-services-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isPubliclyBookable } from "@/lib/programs";

describe("isPubliclyBookable", () => {
  it("includes PER_SESSION services with a price", () => {
    expect(isPubliclyBookable({ archived: false, priceModel: "PER_SESSION", price: 5000, stripePriceId: null })).toBe(true);
  });
  it("includes FREE services", () => {
    expect(isPubliclyBookable({ archived: false, priceModel: "FREE", price: 0, stripePriceId: null })).toBe(true);
  });
  it("excludes MONTHLY services without a stripePriceId", () => {
    expect(isPubliclyBookable({ archived: false, priceModel: "MONTHLY", price: 0, stripePriceId: null })).toBe(false);
  });
  it("includes MONTHLY services with a stripePriceId", () => {
    expect(isPubliclyBookable({ archived: false, priceModel: "MONTHLY", price: 2500, stripePriceId: "price_xyz" })).toBe(true);
  });
  it("excludes archived services", () => {
    expect(isPubliclyBookable({ archived: true, priceModel: "PER_SESSION", price: 5000, stripePriceId: null })).toBe(false);
  });
});
```

Run: `pnpm vitest run src/tests/public-services-filter.test.ts`
Expected: FAILS — `@/lib/programs` exports no `isPubliclyBookable`.

- [ ] **Step 5.3: Create the helper**

Create `src/lib/programs.ts`:

```ts
import type { Program } from "@prisma/client";

export type PubliclyBookableInput = Pick<Program, "archived" | "priceModel" | "price" | "stripePriceId">;

export function isPubliclyBookable(program: PubliclyBookableInput): boolean {
  if (program.archived) return false;
  if (program.priceModel === "MONTHLY" && !program.stripePriceId) return false;
  return true;
}
```

- [ ] **Step 5.4: Run the test to confirm it passes**

Run: `pnpm vitest run src/tests/public-services-filter.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5.5: Filter the public page query**

Edit `src/app/[slug]/page.tsx` around lines 107-110. Replace the existing programs query:

```ts
const programs = await prisma.program.findMany({
  where: { tenantId: tenant.id, archived: false },
});
```

with:

```ts
const programsRaw = await prisma.program.findMany({
  where: {
    tenantId: tenant.id,
    archived: false,
    OR: [
      { priceModel: { not: "MONTHLY" } },
      { priceModel: "MONTHLY", stripePriceId: { not: null } },
    ],
  },
});
const programs = programsRaw.filter(isPubliclyBookable); // defense in depth
```

Add `import { isPubliclyBookable } from "@/lib/programs";`.

- [ ] **Step 5.6: Verify the coach-side "RECURRING PRICE PENDING" badge still shows**

The badge lives in `src/components/programs/ProgramsList.tsx:294-312` and is rendered from the coach query (which does NOT use the filter). Confirm by running `pnpm dev`, visiting `/coach/programs` as an admin — the badge should still appear on the unpriced MONTHLY row. Visiting the public `/t/<slug>` page — the row should be hidden.

- [ ] **Step 5.7: Commit**

```bash
git add src/lib/programs.ts src/app/[slug]/page.tsx src/tests/public-services-filter.test.ts
git commit -m "fix(public): hide unpriced recurring services from public page"
```

---

## Task 6 — Strip internal/dev/competitor copy

**Files:**
- Modify: `src/app/page.tsx` (line 60)
- Modify: `src/app/layout.tsx` (line 18)
- Modify: `src/app/t/[slug]/admin/permissions/page.tsx` (line 128)
- Modify: `src/components/settings/NotificationPreferencesForm.tsx` (line 112)
- Modify: `src/components/admin/BrandingEditor.tsx` (line 101)
- Modify: `src/components/settings/CalendarSubscribeCard.tsx` (line 82-99, audience copy review)

The `/coach/settings/billing` page that contained `"Sprint 7"` is deleted in Task 4 — no edit needed.

- [ ] **Step 6.1: Update the landing hero copy**

Edit `src/app/page.tsx:60`. Find the line referencing "SportsEngine, TeamSnap, and three other apps" and replace with:

```
KickNScream replaces the patchwork of generic team apps soccer coaches resort to — one mobile-first stack built by a coach.
```

Run the page lint check (or just `pnpm dev` and inspect the landing).

- [ ] **Step 6.2: Update SEO keywords**

Edit `src/app/layout.tsx:18`. Remove `"SportsEngine alternative"` from the `keywords` array. If keywords is empty after, remove the field entirely.

- [ ] **Step 6.3: Generalize permissions copy**

Edit `src/app/t/[slug]/admin/permissions/page.tsx:128`. Replace `"Defaults shown here cover the typical SportsEngine-style tenant."` with `"Defaults below match what most coaches and academies need on day one — adjust per row as your team grows."`.

- [ ] **Step 6.4: Disable + relabel SMS toggles**

Edit `src/components/settings/NotificationPreferencesForm.tsx:112`. Replace the `"Coming soon"` help line with a clearer signal:

```
SMS reminders are in private beta. Email reminders cover the same events for now.
```

Also disable the SMS row's toggle (`disabled` prop + `opacity-50 cursor-not-allowed` on the wrapper) so it doesn't look interactive.

- [ ] **Step 6.5: Update BrandingEditor description**

Edit `src/components/admin/BrandingEditor.tsx:101`. Replace `"For COACH-type tenants we emit an additional Person JSON-LD block..."` with `"Coach pages also publish a Person profile so search engines connect your bio to your sessions — no action needed."`.

- [ ] **Step 6.6: Review CalendarSubscribeCard audience copy**

Open `src/components/settings/CalendarSubscribeCard.tsx`. The Explore agent flagged the "Apple Calendar · iOS / macOS" string as neutral (it's just the app name), but the audit specifically called out parent-voice copy bleeding into coach surfaces ("Every event on your kid's schedule lands in Apple Calendar"). Search this file (and `src/app/account/notifications` if it has its own copy) for the phrase "your kid's" or "kid's schedule" — rewrite to be role-agnostic on the coach surface, e.g. `"Subscribe and the events you're coaching show up in your calendar app automatically."`.

- [ ] **Step 6.7: Run the test suite**

Run: `pnpm vitest run`
Expected: full suite passes — no copy edits should break tests, but the run confirms nothing else regressed.

- [ ] **Step 6.8: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx src/app/t/[slug]/admin/permissions/page.tsx src/components/settings/NotificationPreferencesForm.tsx src/components/admin/BrandingEditor.tsx src/components/settings/CalendarSubscribeCard.tsx
git commit -m "chore(copy): remove internal sprint references and competitor names from user-facing surfaces"
```

---

## Task 7 — End-to-end smoke + type/lint gate

- [ ] **Step 7.1: Typecheck**

Run: `pnpm typecheck`
Expected: clean (or the same pre-existing failures, if any — diff vs. baseline).

- [ ] **Step 7.2: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 7.3: Run all tests**

Run: `pnpm vitest run`
Expected: full suite green.

- [ ] **Step 7.4: Manual browser walkthrough**

With `pnpm dev` running, walk through these flows:

1. `/t/<slug>/coach/schedule` — week view shows "U10 Skills Session" at 5:50 PM Tue; click it, modal shows 2026-05-19 17:50.
2. `/t/<slug>/coach/schedule/<event-id>` — header reads "Tuesday, May 19 · 5:50 PM – 6:50 PM"; no console errors (especially no React #418).
3. `/t/<slug>` (public) — "What's coming up" shows Tue 5:50 PM; unpriced Monthly Membership row is NOT visible. PER_SESSION + FREE services still visible.
4. Open Add Player on `/coach/roster`, press Escape — dialog closes. Click backdrop — closes. Open New Event, same checks.
5. Sign in as ADMIN — sidebar shows Admin section with Team / Permissions / Billing / Branding / Audit log / Exports. Click dashboard "Connect Stripe" — Admin badge present, lands on `/admin/billing`.
6. Sign in as COACH (non-admin) — Admin section hidden; `/coach/settings/billing` still redirects to `/admin/billing`, and the admin page enforces its existing permission gate.
7. `/` landing — no SportsEngine/TeamSnap names.
8. `/t/<slug>/coach/settings/notifications` — SMS row visibly disabled; copy reads "private beta", not "Coming soon"/"Sprint X".

- [ ] **Step 7.5: Final commit if anything trailing**

```bash
git status
# If clean, no commit. If anything trailing, commit with a focused message.
```

---

## Out of scope for this sprint (will be future plans)

Items 7-24 from the audit are deferred. Notably:
- **Item 3 (dashboard "This Week" vs Schedule count mismatch)** — needs a shared query helper.
- **Item 5 (Add Player validation message)** — small but its own form-validation pass.
- **Item 9 (Services/Programs/Roster/Players naming consistency)** — IA pass, separate plan.
- **Item 10 (Messages page missing header)** — page-layout pass.
- **Item 13–16 (AI polish wiring, Bookings filter chips, manual payment recording, slug self-service)** — feature work, not bug-fixes.
- **Item 21 (New Event missing fields — location, coach, program, description)** — schema + form expansion.
- **Item 23 (Command palette is nav-only despite "search" copy)** — cross-entity search is a larger build.

A follow-up plan should bundle items 3, 5, 9, 10, 18, 19, 20, 22 as a low-risk polish wave.
