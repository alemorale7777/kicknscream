import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { invoiceDisplayStatus } from "@/lib/invoiceStatus";
import type { Invoice, Payment } from "@prisma/client";

type InvoiceWithPayments = Invoice & { payments: Payment[] };

export function ParentStatsStrip({
  playerCount,
  invoices,
  tenantTimeZone,
}: {
  playerCount: number;
  invoices: InvoiceWithPayments[];
  tenantTimeZone: string;
}) {
  const lifetimeCents = invoices
    .filter((i) => i.status === "PAID")
    .reduce((s, i) => s + i.amount, 0);
  const outstandingCents = invoices
    .filter((i) => {
      const eff = invoiceDisplayStatus(i);
      return eff === "SENT" || eff === "PARTIAL" || eff === "OVERDUE";
    })
    .reduce((s, i) => {
      const paid = i.payments.reduce((p, q) => p + q.amount, 0);
      return s + (i.amount - paid);
    }, 0);
  const lastInvoice = invoices[0]; // already sorted by createdAt desc

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Kids</p>
        <p className="font-mono text-2xl font-bold mt-1">{playerCount}</p>
      </Card>
      <Card className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Lifetime</p>
        <p className="font-mono text-2xl font-bold mt-1">{formatCents(lifetimeCents)}</p>
      </Card>
      <Card className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Outstanding</p>
        <p
          className={`font-mono text-2xl font-bold mt-1 ${
            outstandingCents > 0 ? "text-danger" : ""
          }`}
        >
          {outstandingCents > 0 ? formatCents(outstandingCents) : "$0"}
        </p>
      </Card>
      <Card className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Last activity</p>
        <p className="font-mono text-xs text-ink-300 mt-1">
          {lastInvoice
            ? formatInTimeZone(lastInvoice.createdAt, tenantTimeZone, "MMM d, yyyy")
            : "—"}
        </p>
      </Card>
    </div>
  );
}
