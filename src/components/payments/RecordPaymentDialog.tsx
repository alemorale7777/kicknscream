"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { recordPaymentAction } from "@/actions/payment";
import { formatCents } from "@/lib/utils";
import { Loader2, Banknote } from "lucide-react";
import type { PaymentMethod } from "@prisma/client";

const METHODS: { value: PaymentMethod; label: string; emoji: string }[] = [
  { value: "CASH", label: "Cash", emoji: "💵" },
  { value: "CHECK", label: "Check", emoji: "🧾" },
  { value: "VENMO", label: "Venmo", emoji: "🟦" },
  { value: "ZELLE", label: "Zelle", emoji: "🟪" },
  { value: "PAYPAL", label: "PayPal", emoji: "🟦" },
  { value: "ACH", label: "ACH / Bank transfer", emoji: "🏦" },
  { value: "CARD", label: "Card (manual)", emoji: "💳" },
  { value: "OTHER", label: "Other", emoji: "✳️" },
];

const schema = z.object({
  amount: z.string().refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Enter an amount"),
  method: z.enum(["CARD", "CASH", "CHECK", "VENMO", "ZELLE", "PAYPAL", "ACH", "OTHER"]),
  reference: z.string().optional(),
  markPaid: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export function RecordPaymentDialog({
  tenantId,
  invoiceId,
  remainingCents,
  payerEmail,
  open,
  onOpenChange,
}: {
  tenantId: string;
  invoiceId: string;
  remainingCents: number;
  payerEmail: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: (remainingCents / 100).toFixed(2),
      method: "CASH",
      reference: "",
      markPaid: true,
    },
  });

  const method = watch("method");

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        await recordPaymentAction({
          tenantId,
          invoiceId,
          amount: Number(data.amount),
          method: data.method,
          reference: data.reference || undefined,
          markPaid: data.markPaid,
        });
        toast.success("Payment recorded");
        reset();
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-md bg-turf-400/15 text-turf-300 flex items-center justify-center">
              <Banknote className="h-4 w-4" />
            </div>
            <DialogTitle>Record payment</DialogTitle>
          </div>
          <DialogDescription>
            Log a cash, check, Venmo, Zelle, ACH or other manual payment from{" "}
            <span className="font-mono text-ink-50">{payerEmail}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono">$</span>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  {...register("amount")}
                  className="pl-7 font-mono"
                  autoFocus
                />
              </div>
              <p className="text-xs text-ink-500">
                Remaining: <span className="font-mono">{formatCents(remainingCents)}</span>
              </p>
              {errors.amount && <p className="text-xs text-danger">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setValue("method", v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <span className="mr-2">{m.emoji}</span>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input
              id="reference"
              {...register("reference")}
              placeholder={
                method === "CHECK"
                  ? "Check #1042"
                  : method === "VENMO"
                    ? "@parent-handle"
                    : method === "ZELLE"
                      ? "Confirmation #"
                      : "Receipt, txn ID, note"
              }
            />
            <p className="text-xs text-ink-500">For your records — shows on the payment row.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-300 cursor-pointer select-none">
            <input
              type="checkbox"
              {...register("markPaid")}
              className="rounded border-line bg-pitch-700 text-turf-400 focus:ring-turf-400/30"
            />
            Mark invoice fully paid (even if amount is less than balance)
          </label>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recording…
                </>
              ) : (
                "Record payment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
