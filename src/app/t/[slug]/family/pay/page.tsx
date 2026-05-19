import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PayInvoiceButton } from "@/components/family/PayInvoiceButton";
import { BillingPortalButton } from "@/components/family/BillingPortalButton";
import { parentHasSubscriptions } from "@/lib/family/subscriptions";
import { formatCents } from "@/lib/utils";
import { format } from "date-fns";
import { Wallet, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Payments" };

export default async function FamilyPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ paid?: string; canceled?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tenant, user } = await requireTenant(slug);

  const invoices = await db.invoice.findMany({
    where: { tenantId: tenant.id, payerEmail: user.email ?? "@@none@@" },
    orderBy: { createdAt: "desc" },
    include: { payments: { select: { amount: true } } },
  });

  const showBillingPortal = await parentHasSubscriptions(tenant.id, user.email);

  const enriched = invoices.map((inv) => {
    const paidSoFar = inv.payments.reduce((acc, p) => acc + p.amount, 0);
    return { ...inv, paidSoFar, remainingCents: Math.max(0, inv.amount - paidSoFar) };
  });

  const open = enriched.filter(
    (i) =>
      ["SENT", "PARTIAL", "OVERDUE"].includes(i.status) && i.remainingCents > 0
  );
  const totalOpen = open.reduce((acc, i) => acc + i.remainingCents, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Payments</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Your invoices</h1>
      </header>

      {showBillingPortal && <BillingPortalButton tenantId={tenant.id} />}

      {sp.paid === "1" && (
        <Card className="p-4 border-turf-400/40 bg-turf-400/5">
          <p className="text-sm text-ink-50 font-medium inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-turf-300" />
            Payment received — thanks!
          </p>
        </Card>
      )}
      {sp.canceled === "1" && (
        <Card className="p-4 border-warn/40 bg-warn/5">
          <p className="text-sm text-ink-50">
            Checkout canceled — nothing was charged. Use the Pay button to try
            again whenever you&apos;re ready.
          </p>
        </Card>
      )}

      {open.length > 0 && (
        <Card className="p-5 border-warn/40 bg-warn/[0.04]">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-warn" />
            <div className="flex-1">
              <p className="font-semibold text-ink-50">
                {formatCents(totalOpen)} outstanding
              </p>
              <p className="text-xs text-ink-500">
                {open.length} {open.length === 1 ? "invoice" : "invoices"} open
              </p>
            </div>
          </div>
        </Card>
      )}

      <section className="space-y-2">
        {enriched.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <CheckCircle2 className="h-8 w-8 text-ink-700 mx-auto mb-3" />
            <p className="text-ink-300 font-medium">No invoices yet</p>
          </Card>
        ) : (
          enriched.map((inv) => {
            const isOpen =
              ["SENT", "PARTIAL", "OVERDUE"].includes(inv.status) &&
              inv.remainingCents > 0;
            return (
              <Card key={inv.id} className="p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <span className="text-xs font-mono text-ink-300 shrink-0 w-24">
                  {format(inv.createdAt, "MMM d, yyyy")}
                </span>
                <span className="flex-1 truncate text-ink-50">
                  {inv.description ?? "(invoice)"}
                </span>
                <span className="font-mono font-semibold text-flood-400">
                  {formatCents(inv.amount)}
                </span>
                <Badge
                  variant={
                    inv.status === "PAID"
                      ? "turf"
                      : inv.status === "OVERDUE"
                        ? "danger"
                        : "outline"
                  }
                  className="text-[10px]"
                >
                  {inv.status.toLowerCase()}
                </Badge>
                {isOpen && (
                  <PayInvoiceButton
                    invoiceId={inv.id}
                    remainingLabel={formatCents(inv.remainingCents)}
                  />
                )}
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
