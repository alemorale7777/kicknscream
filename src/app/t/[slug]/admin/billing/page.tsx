import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/chrome/PageHeader";
import { formatCents } from "@/lib/utils";
import { format } from "date-fns";
import {
  CheckCircle2,
  AlertCircle,
  Wallet,
  Receipt,
  TrendingUp,
  ExternalLink,
  CircleDashed,
} from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Billing" };

async function loadStripeData(stripeAccountId: string) {
  if (!stripeEnabled()) return null;
  const stripe = getStripe();
  try {
    const [account, payouts, balanceTx] = await Promise.all([
      stripe.accounts.retrieve(stripeAccountId),
      stripe.payouts.list(
        { limit: 10 },
        { stripeAccount: stripeAccountId }
      ),
      stripe.balanceTransactions.list(
        { limit: 30 },
        { stripeAccount: stripeAccountId }
      ),
    ]);

    // 30-day rollup of net + fees from balance transactions
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = balanceTx.data.filter(
      (tx) => tx.created * 1000 >= since
    );
    const grossCents = recent
      .filter((tx) => tx.type === "charge")
      .reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
    const feesCents = recent
      .filter((tx) => tx.type === "charge" || tx.type === "stripe_fee")
      .reduce((sum, tx) => sum + Math.abs(tx.fee ?? 0), 0);
    const refundsCents = Math.abs(
      recent
        .filter((tx) => tx.type === "refund" || tx.type === "payment_refund")
        .reduce((sum, tx) => sum + (tx.amount ?? 0), 0)
    );

    return {
      account,
      payouts: payouts.data,
      grossCents,
      feesCents,
      refundsCents,
    };
  } catch {
    return null;
  }
}

export default async function AdminBillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  // Pull recent refunds from Enrollment.status=REFUNDED, hydrating the
  // attached invoice for the amount + payer email.
  const refundedEnrollments = await db.enrollment.findMany({
    where: { status: "REFUNDED", player: { tenantId: tenant.id } },
    include: { invoice: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const recentRefunds = refundedEnrollments
    .filter((e) => !!e.invoice)
    .map((e) => ({
      id: e.id,
      amount: e.invoice!.amount,
      payerEmail: e.invoice!.payerEmail,
      at: e.createdAt,
    }));

  const stripeData = tenant.stripeAccountId
    ? await loadStripeData(tenant.stripeAccountId)
    : null;

  // Pre-compute outside the JSX so the React Compiler doesn't flag
  // Date.now() as impure-during-render — new Date() is the accepted
  // pattern elsewhere in this codebase.
  const now = new Date();
  const requirementsDueSoon =
    !!tenant.stripeRequirementsDueAt &&
    tenant.stripeRequirementsDueAt.getTime() - now.getTime() <
      30 * 24 * 60 * 60 * 1000;

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Billing"
        title="Payments overview"
        description="Stripe Connect status, recent payouts, refunds, and 30-day fees roll up here for tenant owners and admins."
      />

      <ConnectStatus tenant={tenant} requirementsDueSoon={requirementsDueSoon} />

      {stripeData && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              icon={TrendingUp}
              label="Gross · 30d"
              value={formatCents(stripeData.grossCents)}
              tone="primary"
            />
            <KpiCard
              icon={Receipt}
              label="Stripe fees · 30d"
              value={formatCents(stripeData.feesCents)}
              tone="muted"
            />
            <KpiCard
              icon={Wallet}
              label="Refunded · 30d"
              value={formatCents(stripeData.refundsCents)}
              tone={stripeData.refundsCents > 0 ? "warn" : "muted"}
            />
          </section>

          <PayoutsList payouts={stripeData.payouts} />
        </>
      )}

      <RefundsList tenantSlug={tenant.slug} refunds={recentRefunds} />
    </div>
  );
}

function ConnectStatus({
  tenant,
  requirementsDueSoon,
}: {
  tenant: {
    slug: string;
    stripeAccountId: string | null;
    stripeChargesEnabled: boolean;
    stripePayoutsEnabled: boolean;
    stripeDetailsSubmitted: boolean;
    stripeRequirementsDueAt: Date | null;
  };
  requirementsDueSoon: boolean;
}) {
  if (!tenant.stripeAccountId) {
    return (
      <Card className="border-warn/30 bg-warn/5">
        <CardContent className="p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-md bg-warn/15 text-warn flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink-50">Stripe not connected</p>
            <p className="text-sm text-ink-300 mt-1">
              Connect a Stripe account to take payments. Until then, bookings
              fall back to manual payment with a follow-up email.
            </p>
            <Button variant="primary" size="sm" asChild className="mt-3">
              <Link href={`/t/${tenant.slug}/coach/settings/billing`}>
                Connect Stripe
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const fullyLive = tenant.stripeChargesEnabled && tenant.stripePayoutsEnabled;
  const dueSoon = requirementsDueSoon;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-500">
              Stripe Connect
            </p>
            <p className="font-semibold text-ink-50 mt-0.5">
              {fullyLive ? "Live — accepting payments" : "Connected · partial"}
            </p>
          </div>
          {fullyLive ? (
            <Badge
              variant="outline"
              className="border-turf-400/40 bg-turf-400/10 text-turf-300"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Live
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-warn/40 bg-warn/10 text-warn"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Action needed
            </Badge>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <StatusLine
            label="Charges"
            ok={tenant.stripeChargesEnabled}
            okText="Enabled"
            offText="Disabled"
          />
          <StatusLine
            label="Payouts"
            ok={tenant.stripePayoutsEnabled}
            okText="Enabled"
            offText="Disabled"
          />
          <StatusLine
            label="KYC"
            ok={tenant.stripeDetailsSubmitted}
            okText="Submitted"
            offText="Incomplete"
          />
        </div>

        {dueSoon && tenant.stripeRequirementsDueAt && (
          <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-sm">
            <p className="text-warn font-medium">
              Stripe needs more info from you by{" "}
              {format(tenant.stripeRequirementsDueAt, "MMM d, yyyy")}
            </p>
            <p className="text-xs text-ink-500 mt-1">
              Open Stripe to upload the missing documents — payouts pause if
              this isn&apos;t handled in time.
            </p>
          </div>
        )}

        <div className="pt-1">
          <a
            href={`https://dashboard.stripe.com/connect/accounts/${tenant.stripeAccountId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-50"
          >
            <ExternalLink className="h-3 w-3" />
            Open in Stripe Dashboard
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusLine({
  label,
  ok,
  okText,
  offText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  offText: string;
}) {
  const Icon = ok ? CheckCircle2 : CircleDashed;
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={`h-4 w-4 ${ok ? "text-turf-300" : "text-warn"} shrink-0`}
      />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-ink-500">
          {label}
        </p>
        <p className="text-ink-50 text-sm">{ok ? okText : offText}</p>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: "primary" | "muted" | "warn";
}) {
  const color =
    tone === "primary"
      ? "text-turf-300"
      : tone === "warn"
        ? "text-warn"
        : "text-ink-300";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wider text-ink-500">
            {label}
          </p>
          <Icon className="h-4 w-4 text-ink-700" />
        </div>
        <p className={`text-2xl font-bold font-mono tracking-tight ${color}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function PayoutsList({
  payouts,
}: {
  payouts: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    arrival_date: number;
  }>;
}) {
  if (payouts.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider text-ink-500">
        Recent payouts
      </h3>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-pitch-900/40">
            <tr className="border-b border-line">
              <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                Arrival
              </th>
              <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                Amount
              </th>
              <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-b border-line/40 last:border-0">
                <td className="px-4 py-2.5 text-ink-300 font-mono tabular-nums">
                  {format(new Date(p.arrival_date * 1000), "MMM d, yyyy")}
                </td>
                <td className="px-4 py-2.5 font-mono text-flood-400">
                  {formatCents(p.amount)}
                </td>
                <td className="px-4 py-2.5">
                  <PayoutStatus status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function PayoutStatus({ status }: { status: string }) {
  const tone =
    status === "paid"
      ? "border-turf-400/40 bg-turf-400/10 text-turf-300"
      : status === "in_transit" || status === "pending"
        ? "border-warn/40 bg-warn/10 text-warn"
        : status === "failed"
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-line bg-pitch-800 text-ink-500";
  return (
    <Badge variant="outline" className={tone}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function RefundsList({
  tenantSlug,
  refunds,
}: {
  tenantSlug: string;
  refunds: { id: string; amount: number; payerEmail: string; at: Date }[];
}) {
  if (refunds.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] uppercase tracking-wider text-ink-500">
        Recent refunds
      </h3>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {refunds.map((r) => (
            <li
              key={r.id}
              className="px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-ink-50 truncate">{r.payerEmail}</p>
                <p className="text-xs text-ink-500">
                  {format(r.at, "MMM d, yyyy · h:mm a")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-danger">
                  -{formatCents(r.amount)}
                </p>
                <Link
                  href={`/t/${tenantSlug}/coach/payments`}
                  className="text-xs text-ink-500 hover:text-ink-50"
                >
                  View invoice →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
