"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { parentModelV2Enabled, parentModelV2Shadow } from "@/lib/env";
import { sendBookingConfirmation } from "@/lib/email";
import { stripeEnabled, getStripe } from "@/lib/stripe";
import { normalizeEmail, normalizePhone, matchParent } from "@/lib/parent-link";
import { fromTenantLocalIsoMinute } from "@/lib/datetime";
import { findOrCreateParent, issueClaimToken } from "@/lib/parents";
import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { logAudit } from "@/lib/audit";
import type { EventType } from "@prisma/client";

const bookingSchema = z.object({
  tenantSlug: z.string(),
  programId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().min(15).max(240).default(60),
  parentName: z.string().min(2).max(120),
  parentEmail: z.string().email(),
  parentPhone: z.string().max(40).optional(),
  playerFirstName: z.string().min(1).max(60),
  playerLastName: z.string().min(1).max(60),
  playerDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional(),
});

export type BookingInput = z.infer<typeof bookingSchema>;

const PROGRAM_TO_EVENT_TYPE: Record<string, EventType> = {
  // Default mapping — coaches mostly do lessons
  default: "LESSON",
};

/**
 * Create a pending booking, then either send to Stripe checkout (paid programs
 * when Stripe is configured) or finalize as PENDING-PAID-NA (free programs).
 */
export async function createBookingAction(input: BookingInput) {
  const data = bookingSchema.parse(input);

  const tenant = await db.tenant.findUnique({ where: { slug: data.tenantSlug } });
  if (!tenant) throw new Error("Tenant not found");

  const program = await db.program.findUnique({ where: { id: data.programId } });
  if (!program) throw new Error("Program not found");
  if (program.tenantId !== tenant.id) throw new Error("Program mismatch");
  if (program.archived) throw new Error("This program is no longer accepting bookings");

  // Parse the form-submitted local time in the tenant's timezone so a parent
  // booking "10:00" in PT lands as the right UTC instant regardless of where
  // this server action runs.
  const tenantTimeZone = tenant.timeZone ?? "America/Los_Angeles";
  const startsAt = fromTenantLocalIsoMinute(
    `${data.date}T${data.startTime}`,
    tenantTimeZone
  );
  const endsAt = new Date(startsAt.getTime() + data.durationMin * 60 * 1000);
  if (startsAt < new Date()) throw new Error("Pick a time in the future");

  // Parent dedup pass — email match wins; phone fallback for same-family
  // parents with different inboxes. Writes a ParentPlayer link row at the end
  // so multi-guardian families are tracked.
  const parentEmail = normalizeEmail(data.parentEmail) ?? data.parentEmail.toLowerCase().trim();
  const normPhone = normalizePhone(data.parentPhone ?? null);

  // PARENT_MODEL_V2 shadow path: write Parent + TenantParent alongside (or
  // instead of) the legacy User+PARENT-Membership pair. In "shadow" mode both
  // paths run so the new tables backfill while booking still flows through
  // the old code; in "true" mode the legacy User upsert + PARENT Membership
  // upsert are skipped entirely and Player.parentRefId becomes the source of
  // truth for parent identity on this booking.
  let parentRefId: string | null = null;
  if (parentModelV2Shadow()) {
    const result = await findOrCreateParent(db, {
      tenantId: tenant.id,
      email: parentEmail,
      name: data.parentName,
      phone: data.parentPhone ?? null,
    });
    parentRefId = result.parent.id;
    // If a User row already exists for this email (e.g., prior staff invite),
    // attach it so cross-tenant continuity works from booking #1.
    if (!result.parent.userId) {
      const existingUser = await db.user.findUnique({
        where: { email: parentEmail },
      });
      if (existingUser) {
        await db.parent.update({
          where: { id: result.parent.id },
          data: { userId: existingUser.id },
        });
      }
    }
  }

  let parentUser: { id: string; email: string | null; phone: string | null; name: string | null } | null = null;
  if (!parentModelV2Enabled()) {
    const emailMatch = await db.user.findUnique({ where: { email: parentEmail } });
    if (emailMatch) {
      parentUser = await db.user.update({
        where: { id: emailMatch.id },
        data: {
          name: data.parentName,
          phone: data.parentPhone || emailMatch.phone,
        },
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
        email: parentEmail,
        phone: normPhone,
      });
      parentUser = matched
        ? await db.user.update({
            where: { id: matched.id },
            data: { name: data.parentName },
          })
        : await db.user.create({
            data: {
              email: parentEmail,
              name: data.parentName,
              phone: data.parentPhone || null,
            },
          });
    } else {
      parentUser = await db.user.create({
        data: {
          email: parentEmail,
          name: data.parentName,
          phone: data.parentPhone || null,
        },
      });
    }

    // Upsert parent membership (PARENT role). This row exists solely to grant
    // family-portal access for this parent — it is *not* a team membership.
    // The /admin/team and /coach/settings/team pages filter on STAFF_ROLES so
    // these PARENT rows never appear alongside coaches and admins (KNS-22).
    await db.membership.upsert({
      where: { userId_tenantId: { userId: parentUser.id, tenantId: tenant.id } },
      create: { userId: parentUser.id, tenantId: tenant.id, role: "PARENT" },
      update: {},
    });
  }

  // Find-or-create player by (tenant, parent, first+last+dob). When the V2
  // flag is fully on we have no parentUser to key on, so we look up by the
  // new parentRefId column instead. In shadow + off modes parentUser exists
  // and the legacy parentId column is the source of truth for lookup.
  const playerDob = new Date(`${data.playerDob}T00:00:00.000Z`);
  let player = await db.player.findFirst({
    where: {
      tenantId: tenant.id,
      ...(parentUser
        ? { parentId: parentUser.id }
        : { parentRefId: parentRefId! }),
      firstName: data.playerFirstName,
      lastName: data.playerLastName,
    },
  });
  if (!player) {
    player = await db.player.create({
      data: {
        tenantId: tenant.id,
        parentId: parentUser?.id ?? null, // legacy mirror
        parentRefId: parentRefId, // new column (set whenever shadow|true)
        firstName: data.playerFirstName,
        lastName: data.playerLastName,
        dob: playerDob,
        notes: data.notes || null,
      },
    });
  }

  // Track parent ↔ player link (multi-guardian families). ParentPlayer.parentUserId
  // is still required by the schema, so we only write this row when we have a
  // parentUser (shadow + off modes). In flag-true mode the link is captured by
  // Player.parentRefId alone.
  if (parentUser) {
    await db.parentPlayer.upsert({
      where: {
        parentUserId_playerId: { parentUserId: parentUser.id, playerId: player.id },
      },
      create: {
        parentUserId: parentUser.id,
        playerId: player.id,
        relationship: "parent",
        parentRefId: parentRefId, // mirror onto new column when available
      },
      update: {},
    });
  }

  // Create invoice in PENDING state with full price
  const invoice = await db.invoice.create({
    data: {
      tenantId: tenant.id,
      payerEmail: parentEmail,
      amount: program.price,
      currency: "usd",
      status: program.priceModel === "FREE" ? "PAID" : "SENT",
      description: `${program.name} · ${formatInTimeZone(startsAt, tenantTimeZone, "MMM d, yyyy 'at' h:mm a")}`,
      paidAt: program.priceModel === "FREE" ? new Date() : null,
      // 24h after the booked session — FREE invoices are already PAID so the
      // dueAt would never fire; leave null in that case.
      dueAt:
        program.priceModel === "FREE" ? null : addDays(startsAt, 1),
    },
  });

  // Create enrollment linking player → program → invoice
  const enrollment = await db.enrollment.create({
    data: {
      playerId: player.id,
      programId: program.id,
      invoiceId: invoice.id,
      status: program.priceModel === "FREE" ? "ACTIVE" : "PENDING",
    },
  });

  // Audit trail: public booking. `actorUserId` stays null — the parent did
  // not authenticate. /admin/audit renders null actors as "Public booking".
  await logAudit({
    tenantId: tenant.id,
    actorUserId: null,
    action: "booking.create",
    targetType: "enrollment",
    targetId: enrollment.id,
    diff: {
      programId: program.id,
      programName: program.name,
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      invoiceId: invoice.id,
      parentEmail,
    },
  });

  // PACKAGE programs seed the remaining-sessions counter from the
  // program's packSize. Attendance writes decrement this; hitting 0
  // auto-completes the enrollment.
  if (
    program.priceModel === "PACKAGE" &&
    program.packSize &&
    program.packSize > 0
  ) {
    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { packBalance: program.packSize },
    });
  }

  // Reject if another parent has an active hold on the same slot
  // (within ±5 minutes — drafts targeting the same hour count as
  // conflicting).
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
    throw new Error(
      "Another family is finishing checkout for this slot — pick a different time."
    );
  }

  // Create the actual scheduled event
  const event = await db.event.create({
    data: {
      tenantId: tenant.id,
      programId: program.id,
      type: PROGRAM_TO_EVENT_TYPE.default,
      title: `${program.name} · ${data.playerFirstName} ${data.playerLastName}`,
      startsAt,
      endsAt,
    },
  });

  // Claim any draft this parent had open for this program — keeps the
  // audit trail (how many resumes before they finished) intact.
  await db.bookingDraft.updateMany({
    where: {
      tenantId: tenant.id,
      programId: program.id,
      email: parentEmail,
      claimedAt: null,
    },
    data: { claimedAt: new Date() },
  });

  // Magic-link claim CTA — only when the Parent row has no User attached
  // yet (i.e. the parent has not signed in / claimed via this flow yet).
  // Flag-off mode skips this entirely because the legacy User upsert above
  // already authenticates the parent identity, so there is nothing to
  // claim.
  let claimUrl: string | undefined;
  if (parentModelV2Shadow() && parentRefId) {
    const parentRow = await db.parent.findUniqueOrThrow({
      where: { id: parentRefId },
    });
    if (!parentRow.userId) {
      const token = await issueClaimToken(db, parentRefId);
      claimUrl = `${env.NEXTAUTH_URL}/claim/${token}`;
    }
  }

  // Free program → finalize, send email, redirect to confirmation
  if (program.priceModel === "FREE" || program.price === 0) {
    await sendBookingConfirmation({
      to: parentEmail,
      parentName: data.parentName,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      programName: program.name,
      startsAt,
      endsAt,
      amountCents: 0,
      timeZone: tenant.timeZone ?? undefined,
      claimUrl,
    }).catch(() => {
      // Best-effort — don't block redirect on email failure
    });
    redirect(`/${tenant.slug}/book/success?invoice=${invoice.id}`);
  }

  // Paid program — if Stripe is configured AND the tenant has a Connect account,
  // create a checkout session and redirect there.
  if (stripeEnabled() && tenant.stripeAccountId) {
    const stripe = getStripe();

    // MONTHLY programs that have a Stripe Price attached become a subscription
    // checkout — recurring billing handled by Stripe, with the destination
    // charge wired through subscription_data so the merchant sees their own
    // brand on the customer's invoices.
    const isRecurring =
      program.priceModel === "MONTHLY" && !!program.stripePriceId;

    const baseSession = {
      customer_email: parentEmail,
      metadata: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        enrollmentEventId: event.id,
      },
      success_url: `${env.NEXTAUTH_URL}/${tenant.slug}/book/success?invoice=${invoice.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.NEXTAUTH_URL}/${tenant.slug}/book/${program.id}?canceled=1`,
    } as const;

    const session = isRecurring
      ? await stripe.checkout.sessions.create({
          ...baseSession,
          mode: "subscription",
          line_items: [{ price: program.stripePriceId!, quantity: 1 }],
          subscription_data: {
            on_behalf_of: tenant.stripeAccountId,
            transfer_data: { destination: tenant.stripeAccountId },
            application_fee_percent: 0,
            metadata: {
              tenantId: tenant.id,
              invoiceId: invoice.id,
              enrollmentEventId: event.id,
            },
          },
        })
      : await stripe.checkout.sessions.create({
          ...baseSession,
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: program.name,
                  description: program.description ?? undefined,
                },
                unit_amount: program.price,
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            application_fee_amount: 0,
            transfer_data: { destination: tenant.stripeAccountId },
            on_behalf_of: tenant.stripeAccountId,
            metadata: {
              tenantId: tenant.id,
              invoiceId: invoice.id,
              enrollmentEventId: event.id,
            },
          },
        });

    if (!isRecurring) {
      await db.invoice.update({
        where: { id: invoice.id },
        data: { stripePaymentIntentId: session.payment_intent as string | null },
      });
    }

    if (session.url) redirect(session.url);
  }

  // No Stripe configured — fall through to a "request received, we'll follow up" path.
  await sendBookingConfirmation({
    to: parentEmail,
    parentName: data.parentName,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    programName: program.name,
    startsAt,
    endsAt,
    amountCents: program.price,
    pendingPayment: true,
    timeZone: tenant.timeZone ?? undefined,
    claimUrl,
  }).catch(() => {});

  redirect(`/${tenant.slug}/book/success?invoice=${invoice.id}&pending=1`);
}
