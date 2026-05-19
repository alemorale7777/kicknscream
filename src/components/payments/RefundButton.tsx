"use client";

import { useState, useTransition } from "react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { refundInvoiceAction } from "@/actions/payment";
import { track } from "@/lib/analytics";
import { formatCents } from "@/lib/utils";
import { Loader2, Undo2 } from "lucide-react";

type Props = {
  tenantId: string;
  invoiceId: string;
  remainingCents: number;
  isStripe: boolean;
  description: string | null;
};

const REASON_OPTIONS = [
  { value: "requested_by_customer", label: "Requested by customer" },
  { value: "duplicate", label: "Duplicate charge" },
  { value: "fraudulent", label: "Fraudulent" },
  { value: "__notes_only__", label: "Other (notes only)" },
] as const;

export function RefundButton({
  tenantId,
  invoiceId,
  remainingCents,
  isStripe,
  description,
}: Props) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2));
  const [reason, setReason] = useState<string>("requested_by_customer");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const cents = full
      ? remainingCents
      : Math.round(parseFloat(amount || "0") * 100);
    if (!cents || cents <= 0) {
      toast.error("Enter an amount above zero");
      return;
    }
    if (cents > remainingCents) {
      toast.error(`Can't refund more than ${formatCents(remainingCents)}`);
      return;
    }
    const reasonForAction =
      reason === "__notes_only__"
        ? undefined
        : (reason as "duplicate" | "fraudulent" | "requested_by_customer");
    if (!reasonForAction && !notes.trim()) {
      toast.error("Pick a reason or add notes");
      return;
    }
    startTransition(async () => {
      try {
        await refundInvoiceAction({
          tenantId,
          invoiceId,
          amountCents: full ? undefined : cents,
          reason: reasonForAction,
          notes: notes.trim() || undefined,
        });
        track("refund_issued", {
          invoiceId,
          amountCents: cents,
          fullRefund: full,
          viaStripe: isStripe,
        });
        toast.success(
          full
            ? `Refunded ${formatCents(cents)} — invoice voided`
            : `Refunded ${formatCents(cents)}`
        );
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger hover:bg-danger/10"
        onClick={() => setOpen(true)}
      >
        <Undo2 className="h-3.5 w-3.5" />
        {isStripe ? "Refund" : "Mark refunded"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{isStripe ? "Issue refund" : "Mark refunded"}</SheetTitle>
            <SheetDescription>
              {isStripe
                ? `Refunds the Stripe charge, voids the invoice, marks the matching enrollment refunded, and emails the parent.`
                : `Marks this manually-paid invoice voided and the enrollment refunded. No money moves — record-keeping only.`}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="space-y-4">
              <div className="rounded-md border border-line bg-pitch-700/30 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-500">Invoice</p>
                <p className="text-sm text-ink-50 mt-0.5">{description ?? "(invoice)"}</p>
                <p className="text-xs text-ink-500 mt-1">
                  Remaining refundable:{" "}
                  <span className="font-mono text-flood-400">{formatCents(remainingCents)}</span>
                </p>
              </div>

              <div className="space-y-2">
                <div className="inline-flex rounded-md border border-line bg-pitch-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setFull(true)}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      full ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
                    }`}
                  >
                    Full refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setFull(false)}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      !full ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
                    }`}
                  >
                    Partial
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="refund-amount">Amount (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono">$</span>
                    <Input
                      id="refund-amount"
                      type="number"
                      step="0.01"
                      min={0}
                      max={remainingCents / 100}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={full}
                      className="pl-7 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="refund-notes">Internal notes (optional)</Label>
                <Textarea
                  id="refund-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Saved to the audit log for your own records — not shown to the parent."
                />
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              className="bg-danger text-pitch-950 hover:bg-danger/90"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isStripe ? "Issue refund" : "Mark refunded"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
