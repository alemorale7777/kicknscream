"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
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

  revalidatePath(`/t/${membership.tenant.slug}/payments`);
  revalidatePath(`/t/${membership.tenant.slug}/dashboard`);
}

const voidSchema = z.object({ tenantId: z.string(), invoiceId: z.string() });
export async function voidInvoiceAction(input: z.infer<typeof voidSchema>) {
  const data = voidSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");
  await db.invoice.update({ where: { id: data.invoiceId }, data: { status: "VOIDED" } });
  revalidatePath(`/t/${membership.tenant.slug}/payments`);
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
