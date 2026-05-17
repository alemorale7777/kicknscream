import { db } from "./db";

/**
 * Convert any input to a URL-safe tenant slug.
 * - Strips accents, punctuation, emoji
 * - Collapses repeated separators
 * - Caps at 48 chars
 * - Falls back to "tenant" if input becomes empty
 */
export function generateSlug(input: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return cleaned || "tenant";
}

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "auth",
  "billing",
  "dashboard",
  "docs",
  "help",
  "invite",
  "login",
  "logout",
  "onboarding",
  "pricing",
  "privacy",
  "settings",
  "signin",
  "signup",
  "support",
  "t",
  "terms",
  "verify",
  "verify-request",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export async function isSlugAvailable(slug: string, ignoreId?: string): Promise<boolean> {
  if (isReservedSlug(slug)) return false;
  const existing = await db.tenant.findUnique({ where: { slug } });
  return !existing || existing.id === ignoreId;
}

export async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = generateSlug(base);
  if (isReservedSlug(slug)) slug = `${slug}-team`;
  let suffix = 1;
  while (!(await isSlugAvailable(slug))) {
    suffix += 1;
    slug = `${generateSlug(base).slice(0, 44)}-${suffix}`;
  }
  return slug;
}
