import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents, cn } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { invoiceDisplayStatus } from "@/lib/invoiceStatus";
import type { Invoice, Payment } from "@prisma/client";

type InvoiceWithPayments = Invoice & { payments: Payment[] };

const TONE = {
  PAID: "border-turf-400/40 text-turf-300",
  SENT: "border-line text-ink-300",
  PARTIAL: "border-warn/40 text-warn",
  OVERDUE: "border-danger/40 text-danger",
  DRAFT: "border-line text-ink-500",
  VOIDED: "border-line text-ink-700",
} as const;

export function ParentInvoicesCard({
  invoices,
  tenantSlug,
  tenantTimeZone,
}: {
  invoices: InvoiceWithPayments[];
  tenantSlug: string;
  tenantTimeZone: string;
}) {
  return (
    <Card className="px-6 py-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">
        Invoices ({invoices.length})
      </p>
      {invoices.length === 0 ? (
        <p className="text-sm text-ink-500">No invoices yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {invoices.map((i) => {
            const eff = invoiceDisplayStatus(i);
            return (
              <li key={i.id} className="py-2.5">
                <Link
                  href={`/t/${tenantSlug}/coach/payments/${i.id}`}
                  prefetch={false}
                  className="flex items-center gap-3 hover:bg-pitch-800/40 -mx-2 px-2 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink-50 truncate text-sm">
                        {i.description ?? "Invoice"}
                      </p>
                      <Badge variant="outline" className={cn(TONE[eff], "bg-transparent")}>
                        {eff.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink-500 font-mono">
                      {formatInTimeZone(i.createdAt, tenantTimeZone, "MMM d, yyyy")}
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {formatCents(i.amount)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
