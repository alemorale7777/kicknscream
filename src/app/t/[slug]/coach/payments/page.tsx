import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { InvoicesTable } from "@/components/payments/InvoicesTable";
import { formatCents } from "@/lib/utils";
import { isPast } from "date-fns";
import { Wallet, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const canEdit = canManageTenant(membership.role);

  const invoices = await db.invoice.findMany({
    where: { tenantId: tenant.id },
    include: { payments: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Aggregates
  const totalCollectedCents = invoices.reduce(
    (sum, i) => sum + i.payments.reduce((s, p) => s + p.amount, 0),
    0
  );
  const totalOutstandingCents = invoices
    .filter((i) => i.status === "SENT" || i.status === "PARTIAL" || i.status === "OVERDUE")
    .reduce((sum, i) => {
      const paid = i.payments.reduce((s, p) => s + p.amount, 0);
      return sum + (i.amount - paid);
    }, 0);
  const overdueCount = invoices.filter(
    (i) =>
      (i.status === "SENT" || i.status === "PARTIAL") &&
      isPast(i.createdAt)
  ).length;
  const paidCount = invoices.filter((i) => i.status === "PAID").length;

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Payments</p>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">Invoices &amp; balances</h1>
        </div>
        <p className="text-sm text-ink-500 mt-2">
          Stripe charges land here automatically. For cash, check, Venmo, Zelle, ACH — record them
          manually and they reconcile against the same invoice.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Collected"
          value={formatCents(totalCollectedCents)}
          sublabel="all time"
          tone="turf"
        />
        <StatCard
          icon={Wallet}
          label="Outstanding"
          value={formatCents(totalOutstandingCents)}
          sublabel="open balance"
          tone={totalOutstandingCents > 0 ? "warn" : "default"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={overdueCount.toString()}
          sublabel={overdueCount === 1 ? "invoice" : "invoices"}
          tone={overdueCount > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={CheckCircle2}
          label="Paid"
          value={paidCount.toString()}
          sublabel={paidCount === 1 ? "invoice" : "invoices"}
        />
      </section>

      <InvoicesTable tenantId={tenant.id} invoices={invoices} canEdit={canEdit} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = "default",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sublabel: string;
  tone?: "default" | "turf" | "warn" | "danger";
}) {
  const color =
    tone === "turf" ? "text-turf-300" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-ink-500">{label}</p>
          <Icon className="h-4 w-4 text-ink-700" />
        </div>
        <p className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${color}`}>{value}</p>
        <p className="text-xs text-ink-500 mt-1.5">{sublabel}</p>
      </CardContent>
    </Card>
  );
}
