import { redirect } from "next/navigation";

/**
 * /coach index — redirect to /coach/dashboard. Aligned with portal.ts
 * (coach → /dashboard).
 */
export default async function CoachIndex({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/coach/dashboard`);
}
