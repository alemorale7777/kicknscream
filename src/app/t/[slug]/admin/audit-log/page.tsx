import { redirect } from "next/navigation";

/**
 * /admin/audit-log alias — the actual route is /admin/audit. People who
 * type the full word land here. Permanent-flavored redirect (Next 16
 * doesn't expose 301 from server pages without a custom Response, but
 * a server-side redirect() is good enough for both UX and SEO since
 * robots.txt blocks /t/* anyway).
 */
export default async function AuditLogAliasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/admin/audit`);
}
