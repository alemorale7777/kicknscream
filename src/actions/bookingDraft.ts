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
          payload: data.payload as Record<string, unknown> as never,
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
          payload: data.payload as Record<string, unknown> as never,
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
