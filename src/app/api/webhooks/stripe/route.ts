import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { sendBookingConfirmation } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Stripe webhook handler. Currently listens for:
 * - checkout.session.completed → marks Invoice PAID, enrollment ACTIVE, sends confirmation email
 *
 * Future sprints will add:
 * - account.updated → keeps Tenant.stripeAccountId KYC status fresh
 * - charge.refunded → mark Invoice VOIDED + send refund email
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
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json(
      { error: `Invalid signature: ${(e as Error).message}` },
      { status: 400 }
    );
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
          }).catch(() => {});
        }
      }
      break;
    }
    case "account.updated": {
      // Future: persist KYC status changes
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
