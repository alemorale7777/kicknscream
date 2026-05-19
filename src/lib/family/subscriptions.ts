import { db } from "@/lib/db";

/**
 * Cheap eligibility check for the family-side billing portal CTA. Returns
 * true when this parent (matched by case-insensitive email) has ≥1
 * Enrollment in a MONTHLY-priceModel program on this tenant with a
 * Stripe-paid invoice — i.e., there's an active subscription Stripe
 * can show in the Customer Portal.
 */
export async function parentHasSubscriptions(
  tenantId: string,
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const count = await db.enrollment.count({
    where: {
      program: { tenantId, priceModel: "MONTHLY" },
      invoice: {
        payerEmail: normalized,
        stripePaymentIntentId: { not: null },
      },
    },
  });
  return count > 0;
}
