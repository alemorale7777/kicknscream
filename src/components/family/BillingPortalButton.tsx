"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createBillingPortalSessionAction } from "@/actions/payment";
import { track } from "@/lib/analytics";
import { Loader2, ExternalLink, Wallet } from "lucide-react";

export function BillingPortalButton({ tenantId }: { tenantId: string }) {
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      try {
        const { url } = await createBillingPortalSessionAction({ tenantId });
        track("billing_portal_opened", { tenantId });
        window.location.assign(url);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md bg-flood-400/10 text-flood-400 flex items-center justify-center shrink-0">
        <Wallet className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink-50">Manage billing</p>
        <p className="text-xs text-ink-500 mt-0.5">
          Cancel a subscription, update your card, or download receipts.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={open}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ExternalLink className="h-3.5 w-3.5" />
        )}
        Open portal
      </Button>
    </Card>
  );
}
