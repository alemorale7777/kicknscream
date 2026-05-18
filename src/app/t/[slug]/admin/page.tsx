import { redirect } from "next/navigation";

/**
 * /admin index — redirect to /admin/team. Keep aligned with the
 * portal-default segment in src/lib/auth/portal.ts (admin → /team)
 * so WorkspaceSwitcher and direct /admin links land in the same place.
 */
export default async function AdminIndex({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/admin/team`);
}
