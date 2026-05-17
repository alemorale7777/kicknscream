import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ArrowRight } from "lucide-react";
import { formatCents } from "@/lib/utils";
import type { Invoice } from "@prisma/client";

export function OutstandingStrip({
  tenantSlug,
  invoices,
}: {
  tenantSlug: string;
  invoices: Invoice[];
}) {
  const open = invoices.filter((i) =>
    ["SENT", "PARTIAL", "OVERDUE"].includes(i.status)
  );
  if (open.length === 0) return null;
  const total = open.reduce((acc, i) => acc + i.amount, 0);
  return (
    <Link href={`/t/${tenantSlug}/family/pay`} className="block group">
      <Card className="border-warn/40 hover:border-warn transition-colors duration-[120ms]">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-warn/15 text-warn flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink-50">{formatCents(total)} outstanding</p>
            <p className="text-xs text-ink-500">
              {open.length} {open.length === 1 ? "invoice" : "invoices"} open
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-ink-500 group-hover:text-warn transition-colors" />
        </CardContent>
      </Card>
    </Link>
  );
}
