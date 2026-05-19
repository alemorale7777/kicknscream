import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { invoiceDisplayStatus } from "@/lib/invoiceStatus";
import { ArrowLeft, Wallet, CheckCircle2, Clock, AlertTriangle, X } from "lucide-react";
import { RefundButton } from "@/components/payments/RefundButton";
import type { InvoiceStatus } from "@prisma/client";

export const metadata = { title: "Invoice" };

const STATUS_TONE: Record<
  InvoiceStatus,
  { label: string; icon: typeof CheckCircle2; tone: string; bg: string; border: string }
> = {
  PAID: { label: "Paid", icon: CheckCircle2, tone: "text-turf-300", bg: "bg-turf-400/10", border: "border-turf-400/40" },
  SENT: { label: "Open", icon: Clock, tone: "text-ink-300", bg: "bg-pitch-700", border: "border-line" },
  PARTIAL: { label: "Partial", icon: AlertTriangle, tone: "text-warn", bg: "bg-warn/10", border: "border-warn/40" },
  OVERDUE: { label: "Overdue", icon: AlertTriangle, tone: "text-danger", bg: "bg-danger/10", border: "border-danger/40" },
  DRAFT: { label: "Draft", icon: Clock, tone: "text-ink-500", bg: "bg-pitch-700", border: "border-line" },
  VOIDED: { label: "Voided", icon: X, tone: "text-ink-700", bg: "bg-pitch-800", border: "border-line" },
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string; invoiceId: string }>;
}) {
  const { slug, invoiceId } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const canEdit = canManageTenant(membership.role);
  const tz = tenant.timeZone ?? "America/Los_Angeles";

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: { orderBy: { createdAt: "asc" } },
      enrollments: {
        include: { player: true, program: true },
      },
    },
  });
  if (!invoice || invoice.tenantId !== tenant.id) notFound();

  // Surface the payer Parent record so coaches can pivot from an invoice
  // straight into the parent's detail page. We look it up via the first
  // enrollment's player; multi-player invoices share the same payer in
  // practice (BookingDraft → invoice creates one Invoice per payer email).
  const firstEnrollment = invoice.enrollments[0];
  let payerParent: { id: string; name: string | null; email: string } | null = null;
  if (firstEnrollment) {
    const enrollPlayer = await db.player.findUnique({
      where: { id: firstEnrollment.playerId },
      select: { parentRefId: true },
    });
    if (enrollPlayer?.parentRefId) {
      payerParent = await db.parent.findUnique({
        where: { id: enrollPlayer.parentRefId },
        select: { id: true, name: true, email: true },
      });
    }
  }

  const effectiveStatus = invoiceDisplayStatus(invoice);
  const tone = STATUS_TONE[effectiveStatus];
  const Icon = tone.icon;
  const paidSoFar = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const owed = invoice.amount - paidSoFar;

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/t/${slug}/coach/payments`}
        prefetch={false}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-50 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to payments
      </Link>

      <Card>
        <div className="px-6 py-5 border-b border-line flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-md ${tone.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${tone.tone}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Invoice</p>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-ink-50 truncate">
                {invoice.description ?? "Invoice"}
              </h1>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`${tone.border} ${tone.tone} bg-transparent`}
          >
            {tone.label}
          </Badge>
        </div>
        <div className="px-6 py-5 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-500">Amount</p>
            <p className="font-mono text-2xl font-bold mt-1">{formatCents(invoice.amount)}</p>
            {owed > 0 && effectiveStatus !== "VOIDED" && (
              <p className={`text-xs font-medium mt-1 ${tone.tone}`}>
                {formatCents(owed)} still due
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-500">Payer</p>
              {payerParent ? (
                <Link
                  href={`/t/${slug}/coach/parents/${payerParent.id}`}
                  prefetch={false}
                  className="font-medium text-ink-50 hover:text-turf-300"
                >
                  {payerParent.name ?? payerParent.email}
                </Link>
              ) : (
                <p className="font-medium text-ink-50">{invoice.payerEmail}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-500">Created</p>
              <p className="font-mono text-xs text-ink-300">
                {formatInTimeZone(invoice.createdAt, tz, "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
            {invoice.dueAt && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-500">Due</p>
                <p className="font-mono text-xs text-ink-300">
                  {formatInTimeZone(invoice.dueAt, tz, "MMM d, yyyy")}
                </p>
              </div>
            )}
            {invoice.paidAt && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-500">Paid</p>
                <p className="font-mono text-xs text-turf-300">
                  {formatInTimeZone(invoice.paidAt, tz, "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {invoice.enrollments.length > 0 && (
        <Card className="px-6 py-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">Linked enrollments</p>
          <ul className="space-y-2">
            {invoice.enrollments.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-ink-50">
                  {e.player.firstName} {e.player.lastName}
                </span>
                <span className="text-ink-500 text-xs">{e.program.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="px-6 py-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500">Payments</p>
          {canEdit && effectiveStatus !== "PAID" && effectiveStatus !== "VOIDED" && (
            <Link
              href={`/t/${slug}/coach/payments?record=${invoice.id}`}
              prefetch={false}
              className="inline-flex items-center gap-1.5 rounded-md border border-turf-400/40 bg-turf-400/10 px-3 py-1.5 text-xs font-medium text-turf-300 hover:bg-turf-400/20"
            >
              <Wallet className="h-3.5 w-3.5" />
              Record payment
            </Link>
          )}
        </div>
        {invoice.payments.length === 0 ? (
          <p className="text-sm text-ink-500">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {invoice.payments.map((p) => (
              <li key={p.id} className="py-2.5 flex items-center gap-3 text-sm">
                <Wallet className="h-3.5 w-3.5 text-ink-500 shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  {p.method}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="font-mono tabular-nums">{formatCents(p.amount)}</span>
                <span className="text-xs text-ink-500 font-mono shrink-0">
                  {formatInTimeZone(p.createdAt, tz, "MMM d")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && paidSoFar > 0 && (
          <div className="mt-4 pt-4 border-t border-line">
            <RefundButton
              tenantId={tenant.id}
              invoiceId={invoice.id}
              remainingCents={paidSoFar}
              isStripe={!!invoice.stripePaymentIntentId}
              description={invoice.description}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
