import type { Role } from "@prisma/client";

const ROLE_RANK: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  COACH: 2,
  PARENT: 1,
  PLAYER: 0,
};

/**
 * Roles that count as tenant *staff*. The team-management pages render this
 * set; PARENT/PLAYER memberships exist for portal routing and family-shell
 * access only and must not appear alongside coaches and admins.
 */
export const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "COACH"];

/**
 * Returns true if the actor's role meets or exceeds the required role.
 * Pure function — safe to use anywhere (client, server, tests).
 */
export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function canManageTenant(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function roleLabel(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
