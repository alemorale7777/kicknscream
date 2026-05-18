import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXTAUTH_URL ?? "https://kicknscream.vercel.app";

/**
 * robots.txt for crawlers. Allows the marketing surface + public tenant
 * pages, blocks portal routes (which 401 anyway), API endpoints, and
 * auth-flow pages so search results don't surface "Check your email"
 * landing pages or query-stringed redirect URLs.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/t/",
          "/account/",
          "/onboarding",
          "/auth/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
