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

