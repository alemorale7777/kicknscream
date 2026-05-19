import { redirect } from "next/navigation";

/**
 * The /coach/settings/billing route previously rendered a simpler billing
 * panel that duplicated /admin/billing. The audit flagged the split as a
 * silent shell-swap and "Sprint 7" copy. Collapsing to a redirect so there
 * is one canonical billing surface — the richer Stripe view at /admin/billing.
 */
export default async function CoachBillingRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/admin/billing`);
}
