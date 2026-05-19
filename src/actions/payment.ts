"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import type { PaymentMethod } from "@prisma/client";

const PAYMENT_METHODS = ["CARD", "CASH", "CHECK", "VENMO", "ZELLE", "PAYPAL", "ACH", "OTHER"] as const;

const recordSchema = z.object({
  tenantId: z.string(),
  invoiceId: z.string(),
  amount: z.number().min(0.01).max(99999),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(200).optional(),
  markPaid: z.boolean().optional(),
});

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage payments");
  }
  return { user, membership };
}

export async function recordPaymentAction(input: z.infer<typeof recordSchema>) {
  const data = recordSchema.parse(input);
  const { user, membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const invoice = await db.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { payments: true },
  });
  if (!invoice || invoice.tenantId !== data.tenantId) throw new Error("Invoice not found");

  const amountCents = Math.round(data.amount * 100);
  const paidSoFar = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const newTotalPaid = paidSoFar + amountCents;

  let newStatus = invoice.status;
  if (newTotalPaid >= invoice.amount || data.markPaid) {
    newStatus = "PAID";
  } else if (newTotalPaid > 0) {
    newStatus = "PARTIAL";
  }

  await db.$transaction([
    db.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: amountCents,
        method: data.method as PaymentMethod,
        reference: data.reference || null,
        recordedBy: user.id,
      },
    }),
    db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: newStatus,
        paidAt: newStatus === "PAID" ? new Date() : invoice.paidAt,
      },
    }),
    ...(newStatus === "PAID"
      ? [
          db.enrollment.updateMany({
            where: { invoiceId: invoice.id, status: "PENDING" },
            data: { status: "ACTIVE" },
          }),
        ]
      : []),
  ]);

  revalidatePath(`/t/${membership.tenant.slug}/coach/payments`);
  revalidatePath(`/t/${membership.tenant.slug}/coach/dashboard`);
}

const voidSchema = z.object({ tenantId: z.string(), invoiceId: z.string() });
export async function voidInvoiceAction(input: z.infer<typeof voidSchema>) {
  const data = voidSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");
  await db.invoice.update({ where: { id: data.invoiceId }, data: { status: "VOIDED" } });
  revalidatePath(`/t/${membership.tenant.slug}/coach/payments`);
}

const refundReasonEnum = z.enum(["duplicate", "fraudulent", "requested_by_customer"]);

const refundSchema = z.object({
  tenantId: z.string(),
  invoiceId: z.string(),
  amountCents: z.number().int().positive().optional(),
  reason: refundReasonEnum.optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Issue a refund against a paid invoice. Two code paths:
 *  - Stripe-paid invoice (stripePaymentIntentId set): hits
 *    stripe.refunds.create on the connected account.
 *  - Manually-recorded payment: skips Stripe, just marks the invoice
 *    voided and writes a negative Payment row.
 *
 * Idempotent against the existing charge.refunded webhook — the
 * webhook does a conditional update that becomes a no-op once this
 * action has already moved the invoice to VOIDED.
 */
export async function refundInvoiceAction(
  input: z.infer<typeof refundSchema>
): Promise<void> {
  const data = refundSchema.parse(input);
  const { user, membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const invoice = await db.invoice.findUnique({
    where: { id: data.invoiceId },
    include: {
      payments: true,
      tenant: true,
      enrollments: { include: { program: true } },
    },
  });
  if (!invoice || invoice.tenantId !== data.tenantId) {
    throw new Error("Invoice not found");
  }
  if (invoice.status === "VOIDED") throw new Error("Invoice is already voided");

  const paidSoFar = invoice.payments.reduce((acc, p) => acc + p.amount, 0);
  if (paidSoFar <= 0) throw new Error("Nothing paid on this invoice to refund");

  const refundAmount = data.amountCents ?? paidSoFar;
  if (refundAmount > paidSoFar) {
    throw new Error(
      `Refund amount (${(refundAmount / 100).toFixed(2)}) exceeds paid balance (${(paidSoFar / 100).toFixed(2)})`
    );
  }

  let stripeRefundId: string | null = null;
  if (
    invoice.stripePaymentIntentId &&
    stripeEnabled() &&
    invoice.tenant.stripeAccountId
  ) {
    const stripe = getStripe();
    const refund = await stripe.refunds.create(
      {
        payment_intent: invoice.stripePaymentIntentId,
        amount: refundAmount,
        reason: data.reason,
      },
      { stripeAccount: invoice.tenant.stripeAccountId }
    );
    stripeRefundId = refund.id;
  }

  // Pick a sensible method for the negative Payment row — latest
  // positive payment's method, defaulting to CARD.
  const lastPositive = [...invoice.payments]
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const method: PaymentMethod = (lastPositive?.method ?? "CARD") as PaymentMethod;

  const fullRefund = refundAmount >= paidSoFar;

  await db.$transaction([
    db.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: -refundAmount,
        method,
        reference: stripeRefundId,
        recordedBy: user.id,
      },
    }),
    ...(fullRefund
      ? [
          db.invoice.update({
            where: { id: invoice.id },
            data: { status: "VOIDED" },
          }),
          db.enrollment.updateMany({
            where: { invoiceId: invoice.id, status: { not: "REFUNDED" } },
            data: { status: "REFUNDED", cancellationReason: data.reason ?? "refund" },
          }),
        ]
      : []),
  ]);

  await db.auditLog.create({
    data: {
      tenantId: data.tenantId,
      actorUserId: user.id,
      action: "payment.refund",
      targetType: "Invoice",
      diff: {
        invoiceId: invoice.id,
        amountCents: refundAmount,
        fullRefund,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        viaStripe: !!stripeRefundId,
      },
    },
  });

  // Resolve parent display name from the payer's User row when possible.
  const payer = await db.user.findFirst({
    where: { email: invoice.payerEmail },
    select: { name: true },
  });
  const programName = invoice.enrollments[0]?.program?.name ?? null;
  const { sendRefundConfirmation } = await import("@/lib/email");
  await sendRefundConfirmation({
    to: invoice.payerEmail,
    parentName: payer?.name ?? "there",
    tenantName: invoice.tenant.name,
    tenantSlug: invoice.tenant.slug,
    programName,
    amountCents: refundAmount,
    fullRefund,
    reason: data.reason ?? null,
  }).catch(() => {
    // Best-effort — refund succeeded even if email failed.
  });

  revalidatePath(`/t/${membership.tenant.slug}/coach/payments`);
  revalidatePath(`/t/${membership.tenant.slug}/admin/audit`);
  revalidatePath(`/t/${membership.tenant.slug}/family/pay`);
}

const parentPaySchema = z.object({ invoiceId: z.string() });

/**
 * Parent-initiated Stripe checkout for an outstanding invoice. Auths the
 * caller as the invoice's payer (matched by session email — the same
 * surface that's used to scope /family/pay), checks Stripe is configured
 * for the tenant, and returns a hosted-checkout URL the client redirects
 * to. The standard /api/webhooks/stripe handler closes the loop on
 * checkout.session.completed.
 *
 * Idempotency note: each click creates a new Stripe Checkout Session,
 * which is fine — Stripe expires unused sessions automatically and the
 * webhook is idempotent on session.id via StripeWebhookEvent.
 */
export async function createParentInvoiceCheckoutAction(
  input: z.infer<typeof parentPaySchema>
): Promise<{ url: string }> {
  const data = parentPaySchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (!user.email) throw new Error("Missing email on account");

  const invoice = await db.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { tenant: true, payments: true },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.payerEmail.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("This invoice isn't on your account");
  }
  if (invoice.status === "PAID") throw new Error("This invoice is already paid");
  if (invoice.status === "VOIDED") throw new Error("This invoice has been voided");

  const paidSoFar = invoice.payments.reduce((acc, p) => acc + p.amount, 0);
  const remainingCents = invoice.amount - paidSoFar;
  if (remainingCents <= 0) throw new Error("Nothing left to pay on this invoice");

  if (!stripeEnabled()) {
    throw new Error(
      "Online payment isn't configured yet — reach out to the coach to settle."
    );
  }
  if (!invoice.tenant.stripeAccountId) {
    throw new Error(
      "This club hasn't connected Stripe — payment must be handled manually."
    );
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.payerEmail,
    line_items: [
      {
        price_data: {
          currency: invoice.currency || "usd",
          product_data: {
            name: invoice.description ?? `Invoice from ${invoice.tenant.name}`,
          },
          unit_amount: remainingCents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: 0,
      transfer_data: { destination: invoice.tenant.stripeAccountId },
      on_behalf_of: invoice.tenant.stripeAccountId,
      metadata: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
      },
    },
    metadata: {
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
    },
    success_url: `${env.NEXTAUTH_URL}/t/${invoice.tenant.slug}/family/pay?invoice=${invoice.id}&paid=1`,
    cancel_url: `${env.NEXTAUTH_URL}/t/${invoice.tenant.slug}/family/pay?invoice=${invoice.id}&canceled=1`,
  });

  if (!session.url) throw new Error("Stripe didn't return a checkout URL");

  await db.invoice.update({
    where: { id: invoice.id },
    data: { stripePaymentIntentId: session.payment_intent as string | null },
  });

  return { url: session.url };
}

const reminderSchema = z.object({ tenantId: z.string(), invoiceId: z.string() });
export async function sendBalanceReminderAction(input: z.infer<typeof reminderSchema>) {
  const data = reminderSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const invoice = await db.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { payments: true },
  });
  if (!invoice || invoice.tenantId !== data.tenantId) throw new Error("Invoice not found");

  const paidSoFar = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceCents = invoice.amount - paidSoFar;
  if (balanceCents <= 0) throw new Error("Nothing owed on this invoice");

  // For now route through the broadcast email helper as a simple balance ping
  const { sendBroadcastEmail } = await import("@/lib/email");
  await sendBroadcastEmail({
    to: invoice.payerEmail,
    recipientName: null,
    tenantName: membership.tenant.name,
    tenantSlug: membership.tenant.slug,
    subject: `Balance reminder · ${membership.tenant.name}`,
    bodyMarkdown:
      `Hi! Just a friendly reminder that you have an outstanding balance of **$${(balanceCents / 100).toFixed(2)}** on:\n\n- ${invoice.description ?? "Invoice"}\n\nPlease reach out if you have any questions, or reply to this email to arrange payment.`,
  });
}
