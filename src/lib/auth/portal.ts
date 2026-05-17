import type { Role } from "@prisma/client";

export type Portal = "coach" | "family" | "admin";

const PORTAL_ACCESS: Record<Role, Portal[]> = {
  OWNER: ["admin", "coach", "family"],
  ADMIN: ["admin", "coach"],
  COACH: ["coach"],
  PARENT: ["family"],
  PLAYER: ["family"],
};

const DEFAULT_BY_ROLE: Record<Role, Portal> = {
  OWNER: "admin",
  ADMIN: "admin",
  COACH: "coach",
  PARENT: "family",
  PLAYER: "family",
};

const DEFAULT_PATH: Record<Portal, string> = {
  coach: "/dashboard",
  family: "/home",
  admin: "/team",
};

export function defaultPortalForRole(role: Role): Portal {
  return DEFAULT_BY_ROLE[role];
}

export function isPortalAllowed(role: Role, portal: Portal): boolean {
  return PORTAL_ACCESS[role].includes(portal);
}

export function portalDefaultSegment(portal: Portal): string {
  return `/${portal}${DEFAULT_PATH[portal]}`;
}

export function portalDefaultPath(slug: string, portal: Portal): string {
  return `/t/${slug}${portalDefaultSegment(portal)}`;
}

/**
 * Pulls the portal segment out of a /t/<slug>/<portal>/* URL.
 * Returns null for paths that don't include a known portal yet
 * (legacy URLs, public profile pages, etc.).
 */
export function portalFromPath(pathname: string): Portal | null {
  const m = pathname.match(/^\/t\/[^/]+\/(coach|family|admin)(?:\/|$)/);
  return (m?.[1] as Portal | undefined) ?? null;
}

/**
 * Legacy coach segments that existed before the route-group split. Used by
 * proxy.ts to 308-redirect old bookmarks to the new portal-scoped paths.
 */
export const LEGACY_COACH_SEGMENTS = new Set([
  "dashboard",
  "bookings",
  "schedule",
  "roster",
  "programs",
  "payments",
  "comms",
  "tryouts",
  "development",
  "settings",
]);

/**
 * Legacy-URL → portal-URL mapping for 308 redirects.
 * Returns the new path for a known legacy tenant URL, or null if the path is
 * already on a portal or is a public route (no rewrite needed).
 *
 * Example: "/t/abc/bookings" → "/t/abc/coach/bookings"
 */
export function legacyRedirectPath(pathname: string): string | null {
  const m = pathname.match(/^\/t\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  const [, slug, segment, rest = ""] = m;
  if (segment === "coach" || segment === "family" || segment === "admin") return null;
  if (!LEGACY_COACH_SEGMENTS.has(segment)) return null;
  return `/t/${slug}/coach/${segment}${rest}`;
}
