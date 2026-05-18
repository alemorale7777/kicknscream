"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CreditCard } from "lucide-react";
import { createParentInvoiceCheckoutAction } from "@/actions/payment";

/**
 * Bottom-right CTA on outstanding invoices in /family/pay. Hits the
 * server action, then redirects to the Stripe-hosted checkout URL.
 * Errors land in a toast — most common is "tenant hasn't connected
 * Stripe" or "invoice already paid", both of which are best as inline
 * feedback rather than a hard error page.
 */
export function PayInvoiceButton({
  invoiceId,
  remainingLabel,
}: {
  invoiceId: string;
  remainingLabel: string;
}) {
  const [pending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      try {
        const { url } = await createParentInvoiceCheckoutAction({ invoiceId });
        window.location.assign(url);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      onClick={go}
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </>
      ) : (
        <>
          <CreditCard className="h-3.5 w-3.5" />
          Pay {remainingLabel}
        </>
      )}
    </Button>
  );
}
