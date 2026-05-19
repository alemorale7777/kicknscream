import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { sendBookingConfirmation } from "@/lib/email";
import type Stripe from "stripe";

export const runtime = "nodejs";

/**
 * Stripe webhook handler. Listens for:
 * - checkout.session.completed → marks Invoice PAID, enrollment ACTIVE, sends confirmation email
 * - account.updated → keeps Tenant KYC mirror columns (charges/payouts/details) fresh
 * - charge.refunded → marks Invoice VOIDED, flips Enrollment to REFUNDED
 *
 * All processed events are logged in StripeWebhookEvent (keyed by event.id) so
 * Stripe's retry behavior becomes a no-op rather than re-firing side effects.
 */
export async function POST(req: Request) {
  if (!stripeEnabled() || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 503 }
    );
  }

  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json(
      { error: `Invalid signature: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  // Idempotency — if we've already processed this event ID, return 200 immediately
  // so Stripe stops retrying without re-running side effects.
  const seen = await db.stripeWebhookEvent.findUnique({ where: { stripeId: event.id } });
  if (seen) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const invoiceId = session.metadata?.invoiceId;
      if (!invoiceId) break;

      const invoice = await db.invoice.findUnique({
        where: { id: invoiceId },
        include: { tenant: true, enrollments: { include: { player: true, program: true } } },
      });
      if (!invoice) break;
      if (invoice.status === "PAID") break;

      await db.$transaction([
        db.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            stripePaymentIntentId: session.payment_intent as string | null,
          },
        }),
        db.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: invoice.amount,
            method: "CARD",
            reference: session.id,
          },
        }),
        db.enrollment.updateMany({
          where: { invoiceId: invoice.id, status: "PENDING" },
          data: { status: "ACTIVE" },
        }),
      ]);

      // Best-effort confirmation email (we already sent one at intake; this is the
      // post-payment receipt). Keep it independent of the transaction commit.
      const firstEnrollment = invoice.enrollments[0];
      if (firstEnrollment) {
        // Look up the matching event for nice copy
        const event = await db.event.findFirst({
          where: { programId: firstEnrollment.programId, tenantId: invoice.tenantId },
          orderBy: { startsAt: "asc" },
        });
        if (event) {
          await sendBookingConfirmation({
            to: invoice.payerEmail,
            parentName: firstEnrollment.player.firstName,
            tenantName: invoice.tenant.name,
            tenantSlug: invoice.tenant.slug,
            programName: firstEnrollment.program.name,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            amountCents: invoice.amount,
            timeZone: invoice.tenant.timeZone ?? undefined,
          }).catch(() => {});
        }
      }
      break;
    }
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      // Find the tenant that owns this connected account, if any
      const tenant = await db.tenant.findFirst({ where: { stripeAccountId: account.id } });
      if (tenant) {
        const requirementsDueAt =
          (account.requirements?.currently_due?.length ?? 0) > 0
            ? new Date()
            : null;
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            stripeChargesEnabled: account.charges_enabled,
            stripePayoutsEnabled: account.payouts_enabled,
            stripeDetailsSubmitted: account.details_submitted,
            stripeRequirementsDueAt: requirementsDueAt,
          },
        });
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (paymentIntentId) {
        const invoice = await db.invoice.findFirst({
          where: { stripePaymentIntentId: paymentIntentId },
          include: { enrollments: true },
        });
        if (invoice) {
          await db.$transaction([
            db.invoice.update({
              where: { id: invoice.id },
              data: { status: "VOIDED" },
            }),
            db.enrollment.updateMany({
              where: { invoiceId: invoice.id },
              data: { status: "REFUNDED", cancellationReason: "refund" },
            }),
          ]);
        }
      }
      break;
    }
    default:
      break;
  }

  // Persist that we've processed this event so retries are no-ops.
  await db.stripeWebhookEvent
    .create({
      data: {
        stripeId: event.id,
        type: event.type,
      },
    })
    .catch(() => {
      // Race: another concurrent retry beat us to it. The unique constraint
      // on stripeId enforces single-write. Either way, the event is done.
    });

  return NextResponse.json({ received: true });
}
