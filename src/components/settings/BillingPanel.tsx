"use client";

import { useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  startStripeConnectOnboardingAction,
  openStripeDashboardAction,
} from "@/actions/stripe";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Wallet,
} from "lucide-react";

type Status = {
  configured: boolean;
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  needsAttention: boolean;
};

export function BillingPanel({ tenantId, status }: { tenantId: string; status: Status }) {
  const [pending, startTransition] = useTransition();

  function onboard() {
    startTransition(async () => {
      try {
        await startStripeConnectOnboardingAction(tenantId);
      } catch (e) {
        const err = e as Error & { digest?: string };
        if (err.digest?.startsWith("NEXT_REDIRECT")) return;
        toast.error(err.message);
      }
    });
  }

  function openDashboard() {
    startTransition(async () => {
      try {
        await openStripeDashboardAction(tenantId);
      } catch (e) {
        const err = e as Error & { digest?: string };
        if (err.digest?.startsWith("NEXT_REDIRECT")) return;
        toast.error(err.message);
      }
    });
  }

  // Stripe not configured on the deployment
  if (!status.configured) {
    return (
      <Card className="border-line">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-md bg-pitch-700 text-ink-500 flex items-center justify-center">
              <Wallet className="h-5 w-5" />
            </div>
            <CardTitle>Stripe payments</CardTitle>
          </div>
          <CardDescription>
            Stripe isn&apos;t configured on this KickNScream deployment yet. Once the platform
            owner adds STRIPE_SECRET_KEY, you&apos;ll be able to onboard here and accept card payments.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // No Connect account yet
  if (!status.hasAccount) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-md bg-flood-400/15 text-flood-400 flex items-center justify-center">
              <CreditCard className="h-5 w-5" />
            </div>
            <CardTitle>Connect Stripe to accept payments</CardTitle>
          </div>
          <CardDescription>
            Set up a Stripe Connect account in about 3 minutes. Parents pay you directly, you keep 100% of the
            session fee (Stripe takes 2.9% + 30¢ per charge).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="accent" onClick={onboard} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Start Stripe onboarding
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Account exists — needs attention OR is good to go
  return (
    <div className="space-y-4">
      <Card className={status.needsAttention ? "border-warn/40" : "border-turf-400/40"}>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div
              className={`h-10 w-10 rounded-md flex items-center justify-center ${
                status.needsAttention ? "bg-warn/15 text-warn" : "bg-turf-400/15 text-turf-300"
              }`}
            >
              {status.needsAttention ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
            <CardTitle>
              {status.needsAttention ? "Stripe needs your attention" : "Stripe connected"}
            </CardTitle>
          </div>
          <CardDescription>
            {status.needsAttention
              ? "Finish onboarding to start accepting payments. Stripe usually needs a few documents (ID, bank account)."
              : "Parents can pay you directly. You can manage payouts and banking from the Stripe dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatusPill label="Details" ok={status.detailsSubmitted} />
            <StatusPill label="Charges" ok={status.chargesEnabled} />
            <StatusPill label="Payouts" ok={status.payoutsEnabled} />
          </div>
          <div className="flex flex-wrap gap-2">
            {status.needsAttention && (
              <Button variant="primary" onClick={onboard} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Continue onboarding
              </Button>
            )}
            <Button variant="outline" onClick={openDashboard} disabled={pending}>
              <ExternalLink className="h-4 w-4" />
              Open Stripe dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        ok ? "border-turf-400/30 bg-turf-400/5" : "border-line bg-pitch-700"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-ink-500">{label}</p>
      <p className="text-sm font-medium mt-0.5">
        {ok ? (
          <Badge variant="turf">enabled</Badge>
        ) : (
          <Badge variant="outline">pending</Badge>
        )}
      </p>
    </div>
  );
}
