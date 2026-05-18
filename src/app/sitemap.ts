import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const BASE_URL =
  process.env.NEXTAUTH_URL ?? "https://kicknscream.vercel.app";

/**
 * Generates a sitemap that crawls Google + Bing pick up. Lists:
 *
 *  - the marketing root
 *  - every public tenant profile at /{slug}
 *  - every active program's booking page at /{slug}/book/{programId}
 *
 * Authenticated portal pages (/t/[slug]/* and /account/*) and the
 * onboarding wizard are not listed — they 401 to non-authed crawlers.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [tenants, programs] = await Promise.all([
    db.tenant.findMany({
      select: { slug: true, updatedAt: true },
    }),
    db.program.findMany({
      where: { archived: false },
      include: { tenant: { select: { slug: true } } },
    }),
  ]);

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    ...tenants.map((t) => ({
      url: `${BASE_URL}/${t.slug}`,
      lastModified: t.updatedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...programs.map((p) => ({
      url: `${BASE_URL}/${p.tenant.slug}/book/${p.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
