"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { getStripe, stripeEnabled } from "@/lib/stripe";

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage billing");
  }
  return { user, membership };
}

/**
 * Start (or resume) a Stripe Connect Express onboarding flow.
 * Creates an Account if the tenant doesn't have one, then mints an
 * AccountLink and redirects the user to Stripe to complete KYC.
 */
export async function startStripeConnectOnboardingAction(tenantId: string) {
  const { membership } = await assertCanManage(tenantId);
  if (!stripeEnabled()) {
    throw new Error("Stripe is not configured on this deployment. Contact support.");
  }
  if (!membership.tenant) throw new Error("Tenant not found");

  const stripe = getStripe();
  let stripeAccountId = membership.tenant.stripeAccountId;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
      metadata: {
        tenantId: membership.tenant.id,
        tenantSlug: membership.tenant.slug,
      },
    });
    stripeAccountId = account.id;
    await db.tenant.update({
      where: { id: membership.tenant.id },
      data: { stripeAccountId },
    });
  }

  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${env.NEXTAUTH_URL}/t/${membership.tenant.slug}/coach/settings/billing?refresh=1`,
    return_url: `${env.NEXTAUTH_URL}/t/${membership.tenant.slug}/coach/settings/billing?ok=1`,
    type: "account_onboarding",
  });

  redirect(link.url);
}

/**
 * Open a Stripe-hosted Express dashboard so the connected coach/tenant
 * can manage their payouts, banking info, KYC, etc.
 */
export async function openStripeDashboardAction(tenantId: string) {
  const { membership } = await assertCanManage(tenantId);
  if (!stripeEnabled()) throw new Error("Stripe is not configured");
  if (!membership.tenant?.stripeAccountId) {
    throw new Error("Connect Stripe first");
  }
  const stripe = getStripe();
  const loginLink = await stripe.accounts.createLoginLink(
    membership.tenant.stripeAccountId
  );
  redirect(loginLink.url);
}

/**
 * Cheap status read — used by the billing settings page to render
 * the right CTA without going to Stripe on every render.
 */
export async function getStripeConnectStatus(tenantId: string): Promise<{
  configured: boolean;
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  needsAttention: boolean;
}> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Tenant not found");

  if (!stripeEnabled()) {
    return {
      configured: false,
      hasAccount: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      needsAttention: false,
    };
  }
  if (!tenant.stripeAccountId) {
    return {
      configured: true,
      hasAccount: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      needsAttention: false,
    };
  }

  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(tenant.stripeAccountId);
    return {
      configured: true,
      hasAccount: true,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      needsAttention:
        !account.charges_enabled ||
        !account.payouts_enabled ||
        (account.requirements?.currently_due?.length ?? 0) > 0,
    };
  } catch {
    return {
      configured: true,
      hasAccount: true,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      needsAttention: true,
    };
  }
}
