import { redirect } from "next/navigation";

/**
 * /family index — redirect to /family/home. Aligned with portal.ts
 * (family → /home) so direct /family links + bookmarks land where the
 * bottom-tab nav's Home tab does.
 */
export default async function FamilyIndex({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/family/home`);
}
