import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";
import { format } from "date-fns";
import { Wallet, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Payments" };

export default async function FamilyPayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user } = await requireTenant(slug);

  const invoices = await db.invoice.findMany({
    where: { tenantId: tenant.id, payerEmail: user.email ?? "@@none@@" },
    orderBy: { createdAt: "desc" },
  });

  const open = invoices.filter((i) =>
    ["SENT", "PARTIAL", "OVERDUE"].includes(i.status)
  );
  const totalOpen = open.reduce((acc, i) => acc + i.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Payments</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Your invoices</h1>
      </header>

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
        {invoices.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <CheckCircle2 className="h-8 w-8 text-ink-700 mx-auto mb-3" />
            <p className="text-ink-300 font-medium">No invoices yet</p>
          </Card>
        ) : (
          invoices.map((inv) => (
            <Card key={inv.id} className="p-3 flex items-center gap-3">
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
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
