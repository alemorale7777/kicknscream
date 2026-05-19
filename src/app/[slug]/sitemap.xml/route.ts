import { db } from "@/lib/db";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-tenant sitemap. Surfaced at /{slug}/sitemap.xml on the platform host
 * AND at https://{customDomain}/sitemap.xml (the proxy rewrites the latter
 * to /{slug}/sitemap.xml). When a tenant has a custom domain we use it as
 * the base URL so the links match the crawler's perspective.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { slug: true, customDomain: true, updatedAt: true },
  });
  if (!tenant) notFound();

  const base = tenant.customDomain
    ? `https://${tenant.customDomain}`
    : `${process.env.NEXTAUTH_URL ?? "https://kicknscream.vercel.app"}/${tenant.slug}`;

  const programs = await db.program.findMany({
    where: { tenant: { slug }, archived: false },
    select: { id: true },
  });

  const now = new Date().toISOString();
  const tenantLastMod = (tenant.updatedAt ?? new Date()).toISOString();

  const urls: Array<{ loc: string; lastmod: string; priority: number }> = [
    { loc: base, lastmod: tenantLastMod, priority: 1.0 },
    ...programs.map((p) => ({
      loc: `${base}/book/${p.id}`,
      lastmod: now,
      priority: 0.7,
    })),
    { loc: `${base}/tryouts`, lastmod: now, priority: 0.5 },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority.toFixed(1)}</priority></url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
