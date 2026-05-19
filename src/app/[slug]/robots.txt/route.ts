import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-tenant robots.txt. Points crawlers at the tenant's sitemap (uses
 * customDomain when set, falls back to the platform host).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { slug: true, customDomain: true },
  });
  if (!tenant) notFound();

  const sitemapUrl = tenant.customDomain
    ? `https://${tenant.customDomain}/sitemap.xml`
    : `${process.env.NEXTAUTH_URL ?? "https://kicknscream.vercel.app"}/${tenant.slug}/sitemap.xml`;

  const body = `User-agent: *
Allow: /
Disallow: /t/
Disallow: /account/
Disallow: /api/

Sitemap: ${sitemapUrl}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
