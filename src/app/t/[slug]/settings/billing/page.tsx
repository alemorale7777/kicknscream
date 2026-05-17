import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { notFound } from "next/navigation";
import { getStripeConnectStatus } from "@/actions/stripe";
import { BillingPanel } from "@/components/settings/BillingPanel";

export const metadata = { title: "Billing" };

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; refresh?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  if (!canManageTenant(membership.role)) notFound();

  const status = await getStripeConnectStatus(tenant.id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Billing</h1>
        <p className="text-ink-500 text-sm">
          Connect Stripe to accept card payments from parents. Cash/check/Venmo reconciliation lands in Sprint 7.
        </p>
      </header>

      {sp.ok && (
        <div className="rounded-md border border-turf-400/40 bg-turf-400/10 p-4 text-sm text-turf-300">
          Stripe returned — checking your status…
        </div>
      )}
      {sp.refresh && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          Onboarding link expired — start again below.
        </div>
      )}

      <BillingPanel tenantId={tenant.id} status={status} />
    </div>
  );
}
