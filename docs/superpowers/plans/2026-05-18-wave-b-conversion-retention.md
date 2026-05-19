# Wave B — Conversion & Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four conversion/retention additions — save-and-resume booking (with 15-min slot hold), player photo upload, and weekly family digest email.

**Architecture:** One new `BookingDraft` model backs both save-and-resume and slot-hold (a draft IS a hold until claimed/expired). Photo uploads mirror the existing tenant-logo flow at `/api/uploads/logo` — Vercel Blob, server action wrapper, content-type + size validation. Family digest is a Sunday Vercel Cron that fans out a per-parent weekly recap email, skipping parents with nothing to report.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Vercel Blob (`@vercel/blob`), Resend, Vercel Cron, NextAuth v5, Tailwind v4. Zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-18-wave-b-conversion-retention-design.md`

---

## File Map

**New files:**
- `src/app/api/uploads/player-photo/route.ts` — POST handler for photo uploads
- `src/app/api/cron/expire-booking-drafts/route.ts` — cleanup cron
- `src/app/api/cron/family-digest/route.ts` — weekly digest cron
- `src/app/[slug]/book/[programId]/resume/page.tsx` — magic-link landing
- `src/lib/canEditPlayer.ts` — auth helper for player edits
- `src/actions/bookingDraft.ts` — save / claim drafts
- `src/components/book/SaveForLaterLink.tsx` — inline link + email-collection popover

**Modified files:**
- `prisma/schema.prisma` — `BookingDraft` model + back-relations
- `vercel.json` — two new cron entries
- `src/lib/analytics.ts` — three new event types
- `src/lib/email.ts` — `sendResumeBookingEmail` + `sendFamilyDigestEmail`
- `src/app/t/[slug]/admin/audit/page.tsx` — two new action labels
- `src/actions/booking.ts` — slot-hold check + claim-on-success
- `src/actions/player.ts` — `clearPlayerPhotoAction`
- `src/app/[slug]/book/[programId]/page.tsx` — merge held slots into busy list
- `src/components/book/BookingForm.tsx` — accept `initialState` + `SaveForLaterLink`
- `src/components/roster/PlayerDialog.tsx` — photo upload section

---

## Task 1: Analytics + audit-label foundation

- [ ] **Step 1: Extend analytics event union**

Edit `src/lib/analytics.ts`, replace the existing `AnalyticsEvent` type with:

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
  | "billing_portal_opened"
  | "booking_draft_saved"
  | "booking_draft_resumed"
  | "player_photo_uploaded";
```

- [ ] **Step 2: Add audit labels**

Edit `src/app/t/[slug]/admin/audit/page.tsx`, append to `ACTION_LABELS`:

```ts
  "booking.draft_saved": "Booking draft saved",
  "booking.draft_resumed": "Booking draft resumed",
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics.ts "src/app/t/[slug]/admin/audit/page.tsx"
git commit -m "chore(wave-b): analytics + audit labels for drafts/photos"
```

---

## Task 2: BookingDraft schema

- [ ] **Step 1: Add the model**

Edit `prisma/schema.prisma`. Append the model at the end of the file (just before any closing braces / after the last `model`):

```prisma
model BookingDraft {
  id         String   @id @default(cuid())
  tenantId   String
  programId  String
  email      String
  token      String   @unique
  startsAt   DateTime
  endsAt     DateTime
  payload    Json
  expiresAt  DateTime
  claimedAt  DateTime?
  createdAt  DateTime @default(now())

  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  program    Program  @relation(fields: [programId], references: [id], onDelete: Cascade)

  @@index([tenantId, startsAt])
  @@index([programId, expiresAt])
  @@index([email])
}
```

Then add the back-relations to existing models. In `model Tenant`, add:

```prisma
  bookingDrafts BookingDraft[]
```

In `model Program`, add:

```prisma
  bookingDrafts BookingDraft[]
```

- [ ] **Step 2: Push schema to DB + regenerate client**

Run:

```bash
pnpm exec prisma db push
pnpm exec prisma generate
```

Expected: "Your database is now in sync with your Prisma schema." + client regenerated.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(drafts): BookingDraft model for save-and-resume + slot hold"
```

---

## Task 3: Email helpers — resume + digest

- [ ] **Step 1: Add `sendResumeBookingEmail` to `src/lib/email.ts`**

Append:

```ts
export async function sendResumeBookingEmail(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  programName: string;
  startsAt: Date;
  resumeUrl: string;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const dateLine = format(opts.startsAt, "EEEE, MMMM d · h:mm a");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Pick up where you left off</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Booking draft saved</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">Pick up where you left off</h1>
      <p style="margin:0 0 12px;color:#C4CDC7;line-height:1.6;">Hi ${escapeHtml(opts.parentName.split(" ")[0])},</p>
      <p style="margin:0 0 16px;color:#C4CDC7;line-height:1.6;">
        You started booking <strong style="color:#F5F7F4;">${escapeHtml(opts.programName)}</strong>
        with ${escapeHtml(opts.tenantName)} for <strong style="color:#F5F7F4;">${escapeHtml(dateLine)}</strong>.
        Click below to finish — the slot is held for the next 15 minutes.
      </p>
      <p style="margin:16px 0 0;">
        <a href="${escapeHtml(opts.resumeUrl)}" style="display:inline-block;background:#1FB663;color:#050A07;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
          Finish booking →
        </a>
      </p>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">Powered by KickNScream</p>
  </div>
</body></html>`;
  const text = `Pick up where you left off booking ${opts.programName} with ${opts.tenantName} for ${dateLine}.\n${opts.resumeUrl}\n\nThe slot is held for 15 minutes.`;
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `Pick up where you left off · ${opts.tenantName}`,
    html,
    text,
  });
}
```

- [ ] **Step 2: Add `sendFamilyDigestEmail` to `src/lib/email.ts`**

Append:

```ts
type DigestKid = {
  firstName: string;
  lastName: string;
  attendedThisWeek: number;
  totalThisWeek: number;
  packBalance: number | null;
  packSize: number | null;
  notes: Array<{ content: string; eventTitle: string; createdAt: Date }>;
  nextSession: { title: string; startsAt: Date } | null;
};

export async function sendFamilyDigestEmail(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  kids: DigestKid[];
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const kidBlocks = opts.kids
    .map(
      (k) => `
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:20px;margin-bottom:12px;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(k.firstName)} ${escapeHtml(k.lastName)}</h2>
      ${
        k.totalThisWeek > 0
          ? `<p style="margin:0 0 8px;color:#C4CDC7;font-size:14px;">📅 ${k.attendedThisWeek} of ${k.totalThisWeek} sessions this week</p>`
          : ""
      }
      ${
        k.packBalance !== null && k.packSize !== null
          ? `<p style="margin:0 0 8px;color:#C4CDC7;font-size:14px;">🎟️ ${k.packBalance} of ${k.packSize} sessions left in pack</p>`
          : ""
      }
      ${
        k.nextSession
          ? `<p style="margin:0 0 8px;color:#C4CDC7;font-size:14px;">⏭️ Next: ${escapeHtml(k.nextSession.title)} · ${format(k.nextSession.startsAt, "EEE, MMM d · h:mm a")}</p>`
          : ""
      }
      ${
        k.notes.length > 0
          ? `<div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:12px;padding-top:12px;">
              <p style="margin:0 0 8px;color:#94A39B;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;">Coach notes</p>
              ${k.notes
                .slice(0, 3)
                .map(
                  (n) => `<p style="margin:0 0 8px;color:#C4CDC7;font-size:14px;line-height:1.5;"><em style="color:#94A39B;">${escapeHtml(n.eventTitle)}:</em> ${escapeHtml(n.content.slice(0, 200))}${n.content.length > 200 ? "…" : ""}</p>`
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>This week with ${escapeHtml(opts.tenantName)}</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <p style="margin:0 0 16px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Week recap · ${escapeHtml(opts.tenantName)}</p>
    <h1 style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:-0.03em;color:#F5F7F4;">Hi ${escapeHtml(opts.parentName.split(" ")[0])} 👋</h1>
    ${kidBlocks}
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">
      Powered by KickNScream · <a href="${env.NEXTAUTH_URL}/account/notifications" style="color:#5A6A62;">manage email settings</a>
    </p>
  </div>
</body></html>`;
  const text = `This week with ${opts.tenantName}\n\n${opts.kids
    .map(
      (k) =>
        `${k.firstName}: ${k.attendedThisWeek}/${k.totalThisWeek} sessions${
          k.packBalance !== null ? `, ${k.packBalance}/${k.packSize} left in pack` : ""
        }${k.notes.length ? `\n  Notes: ${k.notes.map((n) => n.content.slice(0, 80)).join("; ")}` : ""}`
    )
    .join("\n\n")}`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `This week with ${opts.tenantName}`,
    html,
    text,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(email): resume booking + family digest templates"
```

---

## Task 4: `saveBookingDraftAction` server action

**Files:** Create `src/actions/bookingDraft.ts`

- [ ] **Step 1: Implement the action**

Create `src/actions/bookingDraft.ts`:

```ts
"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { addMinutes } from "date-fns";

const HOLD_MINUTES = 15;

const saveSchema = z.object({
  tenantSlug: z.string(),
  programId: z.string(),
  email: z.string().email(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * Save a partially-filled booking form as a BookingDraft + email the
 * parent a magic-link to resume. The draft doubles as a 15-min slot
 * hold — other parents see the slot disappear from availability until
 * this draft expires.
 *
 * Idempotent per (tenantId, programId, email): hitting Save twice with
 * the same address overwrites the prior draft rather than creating
 * duplicates.
 */
export async function saveBookingDraftAction(
  input: z.infer<typeof saveSchema>
): Promise<{ ok: true }> {
  const data = saveSchema.parse(input);

  const tenant = await db.tenant.findUnique({
    where: { slug: data.tenantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const program = await db.program.findUnique({
    where: { id: data.programId },
    select: { id: true, name: true, tenantId: true },
  });
  if (!program || program.tenantId !== tenant.id) throw new Error("Program not found");

  const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
  const endsAt = data.endsAt
    ? new Date(data.endsAt)
    : new Date(startsAt.getTime() + 60 * 60 * 1000);
  const expiresAt = addMinutes(new Date(), HOLD_MINUTES);

  // Upsert keyed on (tenantId, programId, email).
  const existing = await db.bookingDraft.findFirst({
    where: { tenantId: tenant.id, programId: program.id, email: data.email },
  });

  const token = cryptoRandomToken();
  const draft = existing
    ? await db.bookingDraft.update({
        where: { id: existing.id },
        data: {
          token,
          startsAt,
          endsAt,
          payload: data.payload,
          expiresAt,
          claimedAt: null,
        },
      })
    : await db.bookingDraft.create({
        data: {
          tenantId: tenant.id,
          programId: program.id,
          email: data.email,
          token,
          startsAt,
          endsAt,
          payload: data.payload,
          expiresAt,
        },
      });

  const resumeUrl = `${env.NEXTAUTH_URL}/${tenant.slug}/book/${program.id}/resume?token=${draft.token}`;

  const { sendResumeBookingEmail } = await import("@/lib/email");
  await sendResumeBookingEmail({
    to: data.email,
    parentName: (data.payload.parentName as string | undefined) ?? data.email,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    programName: program.name,
    startsAt,
    resumeUrl,
  }).catch(() => {
    // Best-effort — draft is saved either way.
  });

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: null,
      action: "booking.draft_saved",
      targetType: "BookingDraft",
      diff: { draftId: draft.id, programId: program.id, email: data.email },
    },
  });

  return { ok: true };
}

function cryptoRandomToken(length = 32): string {
  // Same alphabet as cuid2 — URL-safe, unguessable at 32 chars.
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/actions/bookingDraft.ts
git commit -m "feat(drafts): saveBookingDraftAction + magic-link email"
```

---

## Task 5: Resume page + GET route

**Files:** Create `src/app/[slug]/book/[programId]/resume/page.tsx`

- [ ] **Step 1: Implement the resume page**

Create the file:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { BookingForm } from "@/components/book/BookingForm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/Wordmark";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Clock } from "lucide-react";

export const metadata = { title: "Pick up where you left off" };

export default async function ResumeBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; programId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug, programId } = await params;
  const { token } = await searchParams;

  if (!token) notFound();

  const draft = await db.bookingDraft.findUnique({
    where: { token },
    include: {
      program: true,
      tenant: { select: { id: true, name: true, slug: true } },
    },
  });

  const valid =
    !!draft &&
    draft.tenant.slug === slug &&
    draft.programId === programId &&
    !draft.claimedAt &&
    draft.expiresAt > new Date();

  if (!valid) {
    return (
      <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
        <ChalkGrid />
        <Floodlight />
        <header className="relative z-10 p-5 lg:px-12 border-b border-line">
          <Link href={`/${slug}`}>
            <Wordmark size="sm" />
          </Link>
        </header>
        <div className="relative z-10 max-w-md mx-auto px-5 py-16">
          <Card className="p-8 text-center border-dashed">
            <Clock className="h-8 w-8 text-ink-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-ink-50">This link expired</p>
            <p className="text-sm text-ink-500 mt-1">
              Resume links are good for 15 minutes. Start over below.
            </p>
            <Button variant="primary" size="sm" asChild className="mt-5">
              <Link href={`/${slug}/book/${programId}`}>Start a new booking</Link>
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  const program = draft!.program;
  const payload = draft!.payload as Record<string, unknown>;

  return (
    <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />
      <header className="relative z-10 p-5 lg:px-12 border-b border-line">
        <Link href={`/${slug}`}>
          <Wordmark size="sm" />
        </Link>
      </header>
      <div className="relative z-10 max-w-2xl mx-auto px-5 py-10 space-y-6">
        <Card className="p-4 border-turf-400/40 bg-turf-400/5">
          <p className="text-sm text-ink-50 font-medium">Welcome back — we restored your draft.</p>
          <p className="text-xs text-ink-500 mt-0.5">
            Submit when you&apos;re ready. Your slot is held for the next 15 minutes.
          </p>
        </Card>
        <BookingForm
          tenantSlug={slug}
          program={program}
          busyStartsAt={[]}
          initialState={payload}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Note: `BookingForm` needs `initialState` prop — added in Task 7.

Hold the commit until Task 7 to keep this commit compilable.

---

## Task 6: SaveForLaterLink component

**Files:** Create `src/components/book/SaveForLaterLink.tsx`

- [ ] **Step 1: Implement the component**

Create the file:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { saveBookingDraftAction } from "@/actions/bookingDraft";
import { track } from "@/lib/analytics";
import { Loader2, Mail, Check } from "lucide-react";

export function SaveForLaterLink({
  tenantSlug,
  programId,
  getDraftPayload,
}: {
  tenantSlug: string;
  programId: string;
  getDraftPayload: () => {
    email: string | null;
    startsAt: string | null;
    endsAt: string | null;
    payload: Record<string, unknown>;
  };
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function submit() {
    const draft = getDraftPayload();
    const targetEmail = email.trim() || draft.email?.trim() || "";
    if (!targetEmail) {
      toast.error("Enter your email so we can send the link");
      return;
    }
    startTransition(async () => {
      try {
        await saveBookingDraftAction({
          tenantSlug,
          programId,
          email: targetEmail,
          startsAt: draft.startsAt ?? undefined,
          endsAt: draft.endsAt ?? undefined,
          payload: draft.payload,
        });
        track("booking_draft_saved", { tenantSlug, programId });
        setSent(true);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (sent) {
    return (
      <div className="inline-flex items-center gap-1.5 text-sm text-turf-300">
        <Check className="h-3.5 w-3.5" />
        Sent — check your inbox.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          const draft = getDraftPayload();
          if (draft.email) setEmail(draft.email);
        }}
        className="text-sm text-ink-500 hover:text-ink-300 underline-offset-4 hover:underline inline-flex items-center gap-1"
      >
        <Mail className="h-3.5 w-3.5" />
        Save for later
      </button>
    );
  }

  return (
    <div className="inline-flex items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="save-email" className="text-xs text-ink-500">
          Email a resume link to
        </Label>
        <Input
          id="save-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-9 w-64"
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={submit} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        Send
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Hold commit for Task 7 (used together)**

---

## Task 7: BookingForm `initialState` + SaveForLaterLink integration

**Files:** Modify `src/components/book/BookingForm.tsx`

- [ ] **Step 1: Accept `initialState` prop**

Open `src/components/book/BookingForm.tsx`. Extend the props type to include `initialState?: Record<string, unknown>` and the function signature destructure:

```ts
export function BookingForm({
  tenantSlug,
  program,
  busyStartsAt = [],
  initialState,
}: {
  tenantSlug: string;
  program: Program;
  busyStartsAt?: BusyEvent[];
  initialState?: Record<string, unknown>;
}) {
```

In `useForm`, extend `defaultValues` to merge `initialState`:

```ts
  const { register, handleSubmit, control, setValue, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: minDate,
      startTime: "10:00",
      ...(initialState ?? {}),
    },
  });
```

(Add `getValues` to the destructure if it isn't already pulled out.)

- [ ] **Step 2: Wire SaveForLaterLink into the submit footer**

Find the sticky submit Card at the bottom of the form. Inside the Card, before the `<Button type="submit">`, add:

```tsx
<SaveForLaterLink
  tenantSlug={tenantSlug}
  programId={program.id}
  getDraftPayload={() => {
    const values = getValues();
    const startsAt = values.date && values.startTime
      ? new Date(`${values.date}T${values.startTime}:00`).toISOString()
      : null;
    const endsAt = startsAt
      ? new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString()
      : null;
    return {
      email: values.parentEmail ?? null,
      startsAt,
      endsAt,
      payload: values as unknown as Record<string, unknown>,
    };
  }}
/>
```

Add the import at the top:

```ts
import { SaveForLaterLink } from "./SaveForLaterLink";
```

- [ ] **Step 3: Typecheck + commit (resume + save-link wave)**

```bash
pnpm exec tsc --noEmit
git add "src/app/[slug]/book/[programId]/resume/page.tsx" src/components/book/SaveForLaterLink.tsx src/components/book/BookingForm.tsx
git commit -m "feat(book): save-and-resume booking via magic link"
```

---

## Task 8: Slot-hold integration on book page

**Files:** Modify `src/app/[slug]/book/[programId]/page.tsx`

- [ ] **Step 1: Merge held slots into `busyStartsAt`**

Open the file. Find where `busyStartsAt` is built (existing query). Extend the page's data load to also query active drafts:

```ts
  const heldDrafts = await db.bookingDraft.findMany({
    where: {
      programId: program.id,
      claimedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { startsAt: true, endsAt: true },
  });

  const busyStartsAt = [
    ...existingBusy.map((e) => ({
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
    })),
    ...heldDrafts.map((d) => ({
      startsAt: d.startsAt.toISOString(),
      endsAt: d.endsAt.toISOString(),
    })),
  ];
```

Replace whatever `existingBusy` variable already exists with this merged result before passing to `<BookingForm busyStartsAt={busyStartsAt} />`.

- [ ] **Step 2: Commit**

```bash
pnpm exec tsc --noEmit
git add "src/app/[slug]/book/[programId]/page.tsx"
git commit -m "feat(drafts): held draft slots hide from availability"
```

---

## Task 9: `createBookingAction` claims drafts + rejects held slots

**Files:** Modify `src/actions/booking.ts`

- [ ] **Step 1: Add slot-hold check + claim**

In `createBookingAction`, find the spot just before `db.event.create(...)`. Insert:

```ts
  // Reject if another parent has an active hold on the same slot
  // (within ±5 minutes — drafts targeting the same hour count as conflicting).
  const overlapStart = new Date(startsAt.getTime() - 5 * 60 * 1000);
  const overlapEnd = new Date(endsAt.getTime() + 5 * 60 * 1000);
  const heldByOther = await db.bookingDraft.findFirst({
    where: {
      programId: program.id,
      email: { not: parentEmail },
      claimedAt: null,
      expiresAt: { gt: new Date() },
      startsAt: { gte: overlapStart, lte: overlapEnd },
    },
  });
  if (heldByOther) {
    throw new Error("Another family is finishing checkout for this slot — pick a different time.");
  }
```

Then, right after `const event = await db.event.create({...})`, add:

```ts
  // Claim any draft this parent had open for this program — keeps the
  // audit trail (number of resumes before completing) intact.
  await db.bookingDraft.updateMany({
    where: {
      tenantId: tenant.id,
      programId: program.id,
      email: parentEmail,
      claimedAt: null,
    },
    data: { claimedAt: new Date() },
  });
```

- [ ] **Step 2: Commit**

```bash
pnpm exec tsc --noEmit
git add src/actions/booking.ts
git commit -m "feat(drafts): createBookingAction respects holds + claims drafts"
```

---

## Task 10: Expire-drafts cron

**Files:** Create `src/app/api/cron/expire-booking-drafts/route.ts`, modify `vercel.json`

- [ ] **Step 1: Add the cron endpoint**

Create the file:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every 15 minutes — delete unclaimed booking drafts that have
 * expired. Claimed drafts stay (they're the audit trail for "this
 * parent saved 3 drafts before finishing").
 */
export async function GET() {
  try {
    await assertCronAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await db.bookingDraft.deleteMany({
    where: {
      claimedAt: null,
      expiresAt: { lt: new Date() },
    },
  });
  console.log("[cron:expire-booking-drafts]", { deleted: result.count });
  return NextResponse.json({ ok: true, deleted: result.count });
}
```

- [ ] **Step 2: Register cron in vercel.json**

Open `vercel.json`. Add to the `crons` array:

```json
{
  "path": "/api/cron/expire-booking-drafts",
  "schedule": "*/15 * * * *"
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/cron/expire-booking-drafts/route.ts" vercel.json
git commit -m "feat(drafts): expire-booking-drafts cron every 15 min"
```

---

## Task 11: `canEditPlayer` helper + clearPlayerPhotoAction

**Files:** Create `src/lib/canEditPlayer.ts`, modify `src/actions/player.ts`

- [ ] **Step 1: Helper for the photo upload auth check**

Create `src/lib/canEditPlayer.ts`:

```ts
import { db } from "@/lib/db";
import { hasRole } from "@/lib/roles";

/**
 * Returns true when `user` is allowed to edit `player` — either as a
 * COACH+ member of the player's tenant, or as the player's parent
 * (via direct parentId OR the ParentPlayer junction).
 */
export async function canEditPlayer(
  userId: string,
  playerId: string
): Promise<boolean> {
  const player = await db.player.findUnique({
    where: { id: playerId },
    select: {
      tenantId: true,
      parentId: true,
      parentLinks: { select: { parentUserId: true } },
    },
  });
  if (!player) return false;

  if (player.parentId === userId) return true;
  if (player.parentLinks.some((l) => l.parentUserId === userId)) return true;

  const membership = await db.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId: player.tenantId } },
    select: { role: true },
  });
  if (membership && hasRole(membership.role, "COACH")) return true;

  return false;
}
```

- [ ] **Step 2: Add `clearPlayerPhotoAction` to `src/actions/player.ts`**

Append:

```ts
const clearPhotoSchema = z.object({ playerId: z.string() });

export async function clearPlayerPhotoAction(
  input: z.infer<typeof clearPhotoSchema>
): Promise<void> {
  const data = clearPhotoSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { canEditPlayer } = await import("@/lib/canEditPlayer");
  if (!(await canEditPlayer(user.id, data.playerId))) {
    throw new Error("You don't have permission to edit this player");
  }
  await db.player.update({
    where: { id: data.playerId },
    data: { photoUrl: null },
  });
}
```

Verify `z` and `getCurrentUser` are already imported in `src/actions/player.ts`. If not, add them.

- [ ] **Step 3: Commit**

```bash
pnpm exec tsc --noEmit
git add src/lib/canEditPlayer.ts src/actions/player.ts
git commit -m "feat(player): canEditPlayer helper + clearPlayerPhotoAction"
```

---

## Task 12: Player photo upload route

**Files:** Create `src/app/api/uploads/player-photo/route.ts`

- [ ] **Step 1: Implement the upload endpoint**

Create the file:

```ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canEditPlayer } from "@/lib/canEditPlayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("file");
  const playerId = form.get("playerId");
  if (!file || !(file instanceof Blob) || typeof playerId !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 5MB)" }, { status: 413 });
  }
  if (!(await canEditPlayer(session.user.id, playerId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ext = file.type.split("/")[1]?.split("+")[0] ?? "jpg";
  const result = await put(`player-photos/${playerId}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  await db.player.update({
    where: { id: playerId },
    data: { photoUrl: result.url },
  });

  return NextResponse.json({ url: result.url });
}
```

- [ ] **Step 2: Commit**

```bash
pnpm exec tsc --noEmit
git add "src/app/api/uploads/player-photo/route.ts"
git commit -m "feat(player): photo upload endpoint via Vercel Blob"
```

---

## Task 13: PlayerDialog photo upload UI

**Files:** Modify `src/components/roster/PlayerDialog.tsx`

- [ ] **Step 1: Add upload UI**

Open the file. At the top of the body (just above the first-name/last-name grid inside the form), add:

```tsx
{isEdit && player && (
  <div className="space-y-1.5">
    <Label>Photo</Label>
    <PlayerPhotoField
      playerId={player.id}
      initialUrl={player.photoUrl ?? null}
      onChange={(url) => setValue("photoUrl" as never, url as never)}
    />
  </div>
)}
```

(Photo upload is edit-only — you can't upload before the Player row exists. New players upload from the roster profile page after creation.)

- [ ] **Step 2: Implement the inline component**

In the same file, before the main `PlayerDialog` export, add:

```tsx
function PlayerPhotoField({
  playerId,
  initialUrl,
}: {
  playerId: string;
  initialUrl: string | null;
  onChange?: (url: string | null) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("playerId", playerId);
      const res = await fetch("/api/uploads/player-photo", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      const { url: newUrl } = await res.json();
      setUrl(newUrl);
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    try {
      const { clearPlayerPhotoAction } = await import("@/actions/player");
      await clearPlayerPhotoAction({ playerId });
      setUrl(null);
      toast.success("Photo removed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 rounded-full bg-pitch-700 flex items-center justify-center overflow-hidden">
        {url ? (
          <Image src={url} alt="" width={64} height={64} className="h-full w-full object-cover" />
        ) : (
          <UserPlus className="h-6 w-6 text-ink-500" />
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {url ? "Replace" : "Upload"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClear}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
```

Add necessary imports at the top: `useRef`, `Image` from `next/image`. `Loader2`, `UserPlus`, `Button`, `toast` already imported (verify).

- [ ] **Step 3: Commit**

```bash
pnpm exec tsc --noEmit
git add src/components/roster/PlayerDialog.tsx
git commit -m "feat(player): photo upload UI in PlayerDialog"
```

---

## Task 14: Family digest cron

**Files:** Create `src/app/api/cron/family-digest/route.ts`, modify `vercel.json`

- [ ] **Step 1: Implement the endpoint**

Create the file:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";
import { sendFamilyDigestEmail } from "@/lib/email";
import { subDays, addDays } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sunday 15:00 UTC — fan-out a weekly recap email to every parent
 * with email-reminders enabled. Skips parents with nothing to report
 * (no attended sessions, no notes, no pack changes this week).
 */
export async function GET() {
  try {
    await assertCronAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStart = subDays(new Date(), 7);
  const weekEnd = new Date();
  const nextWeekEnd = addDays(weekEnd, 7);

  const parents = await db.user.findMany({
    where: {
      email: { not: null },
      memberships: { some: { role: { in: ["PARENT", "PLAYER"] } } },
      OR: [
        { preferences: null },
        { preferences: { emailReminders: true } },
      ],
    },
    select: { id: true, email: true, name: true, memberships: { select: { tenantId: true } } },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const parent of parents) {
    if (!parent.email) {
      skipped++;
      continue;
    }
    for (const m of parent.memberships) {
      try {
        const tenant = await db.tenant.findUnique({
          where: { id: m.tenantId },
          select: { id: true, name: true, slug: true },
        });
        if (!tenant) continue;
        const players = await db.player.findMany({
          where: {
            tenantId: tenant.id,
            OR: [
              { parentId: parent.id },
              { parentLinks: { some: { parentUserId: parent.id } } },
            ],
          },
          select: { id: true, firstName: true, lastName: true },
        });
        if (players.length === 0) continue;
        const kids = await Promise.all(
          players.map(async (p) => {
            const [attendances, notes, enrollments, nextEvent] = await Promise.all([
              db.attendance.findMany({
                where: {
                  playerId: p.id,
                  event: { startsAt: { gte: weekStart, lt: weekEnd } },
                },
                include: { event: true },
              }),
              db.sessionNote.findMany({
                where: {
                  playerId: p.id,
                  visibleToParent: true,
                  createdAt: { gte: weekStart, lt: weekEnd },
                },
                include: { event: { select: { title: true } } },
              }),
              db.enrollment.findMany({
                where: {
                  playerId: p.id,
                  status: { in: ["ACTIVE", "CONFIRMED", "PAID"] },
                  program: { priceModel: "PACKAGE" },
                },
                include: { program: { select: { packSize: true } } },
                take: 1,
              }),
              db.event.findFirst({
                where: {
                  tenantId: tenant.id,
                  startsAt: { gte: weekEnd, lt: nextWeekEnd },
                  program: {
                    enrollments: {
                      some: {
                        playerId: p.id,
                        status: { in: ["ACTIVE", "CONFIRMED", "PAID"] },
                      },
                    },
                  },
                },
                orderBy: { startsAt: "asc" },
                select: { title: true, startsAt: true },
              }),
            ]);
            const attendedThisWeek = attendances.filter(
              (a) => a.status === "PRESENT" || a.status === "LATE"
            ).length;
            const enrollment = enrollments[0];
            return {
              firstName: p.firstName,
              lastName: p.lastName,
              attendedThisWeek,
              totalThisWeek: attendances.length,
              packBalance: enrollment?.packBalance ?? null,
              packSize: enrollment?.program?.packSize ?? null,
              notes: notes.map((n) => ({
                content: n.content,
                eventTitle: n.event.title,
                createdAt: n.createdAt,
              })),
              nextSession: nextEvent
                ? { title: nextEvent.title, startsAt: nextEvent.startsAt }
                : null,
            };
          })
        );

        // Skip if there's nothing worth reporting.
        const hasContent = kids.some(
          (k) => k.totalThisWeek > 0 || k.notes.length > 0 || k.nextSession
        );
        if (!hasContent) {
          skipped++;
          continue;
        }

        await sendFamilyDigestEmail({
          to: parent.email,
          parentName: parent.name ?? "there",
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          kids,
        });
        sent++;
      } catch (err) {
        failed++;
        console.error("[cron:family-digest] send failed", {
          parentId: parent.id,
          tenantId: m.tenantId,
          err: (err as Error).message,
        });
      }
    }
  }

  console.log("[cron:family-digest]", { sent, skipped, failed });
  return NextResponse.json({ ok: true, sent, skipped, failed });
}
```

- [ ] **Step 2: Register cron in vercel.json**

Add to the `crons` array:

```json
{
  "path": "/api/cron/family-digest",
  "schedule": "0 15 * * 0"
}
```

- [ ] **Step 3: Commit**

```bash
pnpm exec tsc --noEmit
git add "src/app/api/cron/family-digest/route.ts" vercel.json
git commit -m "feat(family): weekly Sunday digest cron"
```

---

## Task 15: Verify, push, deploy, smoke

- [ ] **Step 1: Full verify**

```bash
pnpm exec tsc --noEmit
pnpm run test
pnpm run lint
pnpm run build
```

Expected: typecheck silent, vitest 62+ pass, lint shows only the 1 known TanStack-Table warning, build completes.

- [ ] **Step 2: Push + deploy**

```bash
git push origin main
vercel deploy --prod --yes
```

- [ ] **Step 3: Smoke test each component**

- **B.1 save-and-resume**: Start a booking, hit Save for later, enter email, check inbox, click resume link, verify form mounts pre-filled, submit, verify booking lands.
- **B.1 slot hold**: With a draft saved, open the booking page in a private window — confirm the held slot is missing from available times.
- **B.2 photo upload**: Coach → roster → edit a player → upload a JPG → confirm avatar updates → close + reopen → confirm photo persists → Remove → confirm initials return.
- **B.3 digest**: Hit `/api/cron/family-digest` with `Authorization: Bearer $CRON_SECRET` after seeding a kid with one attended session this week — confirm the parent's inbox gets the email.

- [ ] **Step 4: Update tasks**

Mark Wave B task #72 completed. Move to Wave C.

---

## Verification matrix

| Spec section | Task |
|---|---|
| BookingDraft schema | Task 2 |
| saveBookingDraftAction | Task 4 |
| Resume page | Task 5 |
| SaveForLaterLink | Task 6 |
| BookingForm initialState | Task 7 |
| Slot hold in availability | Task 8 |
| Slot conflict reject + claim | Task 9 |
| Expire-drafts cron | Task 10 |
| canEditPlayer helper | Task 11 |
| clearPlayerPhotoAction | Task 11 |
| Photo upload route | Task 12 |
| Photo UI in PlayerDialog | Task 13 |
| Family digest cron | Task 14 |
| Resume + digest emails | Task 3 |
| Analytics + audit labels | Task 1 |
| Smoke verification | Task 15 |
