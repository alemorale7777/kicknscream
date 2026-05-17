"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendBookingConfirmation } from "@/lib/email";
import { stripeEnabled, getStripe } from "@/lib/stripe";
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

  const startsAt = new Date(`${data.date}T${data.startTime}:00`);
  const endsAt = new Date(startsAt.getTime() + data.durationMin * 60 * 1000);
  if (startsAt < new Date()) throw new Error("Pick a time in the future");

  // Upsert parent user
  const parentEmail = data.parentEmail.toLowerCase().trim();
  const parentUser = await db.user.upsert({
    where: { email: parentEmail },
    create: { email: parentEmail, name: data.parentName, phone: data.parentPhone || null },
    update: {
      name: data.parentName,
      phone: data.parentPhone || undefined,
    },
  });

  // Upsert parent membership (PARENT role)
  await db.membership.upsert({
    where: { userId_tenantId: { userId: parentUser.id, tenantId: tenant.id } },
    create: { userId: parentUser.id, tenantId: tenant.id, role: "PARENT" },
    update: {},
  });

  // Find-or-create player by (tenant, parent, first+last+dob)
  const playerDob = new Date(`${data.playerDob}T00:00:00.000Z`);
  let player = await db.player.findFirst({
    where: {
      tenantId: tenant.id,
      parentId: parentUser.id,
      firstName: data.playerFirstName,
      lastName: data.playerLastName,
    },
  });
  if (!player) {
    player = await db.player.create({
      data: {
        tenantId: tenant.id,
        parentId: parentUser.id,
        firstName: data.playerFirstName,
        lastName: data.playerLastName,
        dob: playerDob,
        notes: data.notes || null,
      },
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
      description: `${program.name} · ${data.date} ${data.startTime}`,
      paidAt: program.priceModel === "FREE" ? new Date() : null,
    },
  });

  // Create enrollment linking player → program → invoice
  await db.enrollment.create({
    data: {
      playerId: player.id,
      programId: program.id,
      invoiceId: invoice.id,
      status: program.priceModel === "FREE" ? "ACTIVE" : "PENDING",
    },
  });

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
    }).catch(() => {
      // Best-effort — don't block redirect on email failure
    });
    redirect(`/${tenant.slug}/book/success?invoice=${invoice.id}`);
  }

  // Paid program — if Stripe is configured AND the tenant has a Connect account,
  // create a checkout session and redirect there.
  if (stripeEnabled() && tenant.stripeAccountId) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: parentEmail,
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
      metadata: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        enrollmentEventId: event.id,
      },
      success_url: `${env.NEXTAUTH_URL}/${tenant.slug}/book/success?invoice=${invoice.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.NEXTAUTH_URL}/${tenant.slug}/book/${program.id}?canceled=1`,
    });

    await db.invoice.update({
      where: { id: invoice.id },
      data: { stripePaymentIntentId: session.payment_intent as string | null },
    });

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
  }).catch(() => {});

  redirect(`/${tenant.slug}/book/success?invoice=${invoice.id}&pending=1`);
}
