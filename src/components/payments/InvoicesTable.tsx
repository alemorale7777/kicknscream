"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { toast } from "sonner";
import { sendBalanceReminderAction, voidInvoiceAction } from "@/actions/payment";
import { formatCents, cn } from "@/lib/utils";
import { format, isPast } from "date-fns";
import {
  Search,
  Banknote,
  Mail,
  MoreHorizontal,
  Ban,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
} from "lucide-react";
import type { Invoice, InvoiceStatus, Payment, PaymentMethod } from "@prisma/client";

type InvoiceWithPayments = Invoice & { payments: Payment[] };

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

const METHOD_EMOJI: Record<PaymentMethod, string> = {
  CASH: "💵",
  CHECK: "🧾",
  VENMO: "🟦",
  ZELLE: "🟪",
  PAYPAL: "🟦",
  ACH: "🏦",
  CARD: "💳",
  OTHER: "✳️",
};

type Filter = "all" | "open" | "paid" | "voided";

export function InvoicesTable({
  tenantId,
  invoices,
  canEdit,
}: {
  tenantId: string;
  invoices: InvoiceWithPayments[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [dialogInvoice, setDialogInvoice] = useState<InvoiceWithPayments | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((i) => {
      if (filter === "open" && !["SENT", "PARTIAL", "OVERDUE"].includes(i.status)) return false;
      if (filter === "paid" && i.status !== "PAID") return false;
      if (filter === "voided" && i.status !== "VOIDED") return false;
      if (!q) return true;
      return (
        i.payerEmail.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, query, filter]);

  function balance(i: InvoiceWithPayments) {
    const paid = i.payments.reduce((s, p) => s + p.amount, 0);
    return i.amount - paid;
  }

  function handleReminder(i: InvoiceWithPayments) {
    setPendingId(i.id);
    startTransition(async () => {
      try {
        await sendBalanceReminderAction({ tenantId, invoiceId: i.id });
        toast.success(`Reminder sent to ${i.payerEmail}`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleVoid(i: InvoiceWithPayments) {
    if (!confirm(`Void invoice for ${i.payerEmail}? Payments stay logged.`)) return;
    setPendingId(i.id);
    startTransition(async () => {
      try {
        await voidInvoiceAction({ tenantId, invoiceId: i.id });
        toast.success("Invoice voided");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email or description"
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All invoices</SelectItem>
              <SelectItem value="open">Open balance</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs uppercase tracking-wider text-ink-500">
          {filtered.length} {filtered.length === 1 ? "invoice" : "invoices"}
        </p>

        {filtered.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <Banknote className="h-7 w-7 text-ink-700 mx-auto mb-3" />
            <p className="text-ink-300 font-medium">No invoices match</p>
            <p className="text-xs text-ink-500 mt-1">Adjust the filter or search to see more.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((i) => {
              const tone = STATUS_TONE[i.status];
              const owed = balance(i);
              const overdue = i.status === "SENT" && isPast(i.createdAt);
              const effectiveTone = overdue ? STATUS_TONE.OVERDUE : tone;
              const EffectiveIcon = effectiveTone.icon;
              const isPending = pendingId === i.id;

              return (
                <Card
                  key={i.id}
                  className={cn(
                    "p-4 flex items-center gap-4 transition-colors",
                    i.status === "PAID" && "opacity-80",
                    overdue && "border-danger/30"
                  )}
                >
                  <div className="hidden sm:flex h-10 w-10 rounded-md bg-pitch-700 items-center justify-center shrink-0">
                    <EffectiveIcon className={cn("h-5 w-5", effectiveTone.tone)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-50 truncate">{i.description ?? "Invoice"}</p>
                      <Badge
                        variant="outline"
                        className={cn(effectiveTone.border, effectiveTone.tone, "bg-transparent")}
                      >
                        {effectiveTone.label}
                      </Badge>
                      {i.payments.length > 0 && (
                        <span className="text-[10px] text-ink-500 inline-flex items-center gap-0.5">
                          {i.payments.map((p, idx) => (
                            <span key={p.id} title={p.method}>
                              {METHOD_EMOJI[p.method]}
                              {idx < i.payments.length - 1 ? " " : ""}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ink-500 mt-1 flex-wrap">
                      <span>{i.payerEmail}</span>
                      <span className="text-ink-700">·</span>
                      <span className="font-mono">{format(i.createdAt, "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold tabular-nums">{formatCents(i.amount)}</p>
                    {i.status !== "PAID" && i.status !== "VOIDED" && owed !== i.amount && (
                      <p className={cn("text-[10px] uppercase tracking-wider", effectiveTone.tone)}>
                        {formatCents(owed)} due
                      </p>
                    )}
                    {i.status === "PAID" && i.paidAt && (
                      <p className="text-[10px] uppercase tracking-wider text-turf-300">
                        paid {format(i.paidAt, "MMM d")}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="iconSm" aria-label="Invoice actions">
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4 text-ink-500" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {i.status !== "PAID" && i.status !== "VOIDED" && (
                          <DropdownMenuItem onClick={() => setDialogInvoice(i)} className="cursor-pointer">
                            <Banknote className="h-4 w-4" />
                            Record payment
                          </DropdownMenuItem>
                        )}
                        {i.status !== "PAID" && i.status !== "VOIDED" && (
                          <DropdownMenuItem onClick={() => handleReminder(i)} className="cursor-pointer">
                            <Mail className="h-4 w-4" />
                            Send reminder
                          </DropdownMenuItem>
                        )}
                        {i.status !== "PAID" && i.status !== "VOIDED" && <DropdownMenuSeparator />}
                        {i.status !== "VOIDED" && (
                          <DropdownMenuItem
                            onClick={() => handleVoid(i)}
                            className="cursor-pointer text-danger focus:text-danger"
                          >
                            <Ban className="h-4 w-4" />
                            Void invoice
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {dialogInvoice && (
        <RecordPaymentDialog
          tenantId={tenantId}
          invoiceId={dialogInvoice.id}
          remainingCents={balance(dialogInvoice)}
          payerEmail={dialogInvoice.payerEmail}
          open={!!dialogInvoice}
          onOpenChange={(v) => !v && setDialogInvoice(null)}
        />
      )}
    </>
  );
}
