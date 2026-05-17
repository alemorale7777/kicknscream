import type { Role, PermissionLevel } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * KickNScream permission matrix.
 *
 * Each Feature is a dot-separated `domain.action` identifier.
 * Each role's default level is one of NONE | VIEW | EDIT.
 *
 * Per-tenant overrides live in the `PermissionsOverride` table — when present
 * they replace the default for that tenant + role + feature combination.
 *
 * Callers should always go through `can()` rather than reading this map
 * directly so overrides are honored.
 */
export type Feature =
  // Bookings & schedule
  | "bookings.view"
  | "bookings.edit"
  | "schedule.view"
  | "schedule.edit"
  | "attendance.mark"
  // Roster & development
  | "roster.view"
  | "roster.edit"
  | "roster.import"
  | "development.view"
  | "development.edit"
  | "notes.view"
  | "notes.edit"
  // Services / programs
  | "services.view"
  | "services.edit"
  // Payments / billing
  | "payments.view"
  | "payments.refund"
  | "billing.manage"
  // Comms / messages
  | "messages.view"
  | "messages.send"
  | "messages.broadcast"
  // Tenant administration
  | "settings.tenant"
  | "settings.locations"
  | "team.view"
  | "team.invite"
  | "team.remove"
  | "audit.view"
  | "data.export"
  | "tenant.delete"
  // Tryouts (CLUB)
  | "tryouts.view"
  | "tryouts.edit"
  // Family-facing
  | "family.dashboard"
  | "family.book"
  | "family.pay"
  | "family.forms"
  // Platform staff (KickNScream itself)
  | "platform.admin";

type LevelLetter = "N" | "V" | "E";
const N: LevelLetter = "N";
const V: LevelLetter = "V";
const E: LevelLetter = "E";

const MATRIX: Record<Feature, Record<Role, LevelLetter>> = {
  // Bookings & schedule
  "bookings.view":      { OWNER: E, ADMIN: E, COACH: E, PARENT: V, PLAYER: N },
  "bookings.edit":      { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },
  "schedule.view":      { OWNER: E, ADMIN: E, COACH: E, PARENT: V, PLAYER: V },
  "schedule.edit":      { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },
  "attendance.mark":    { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },

  // Roster & development
  "roster.view":        { OWNER: E, ADMIN: E, COACH: E, PARENT: V, PLAYER: V },
  "roster.edit":        { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },
  "roster.import":      { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },
  "development.view":   { OWNER: E, ADMIN: E, COACH: E, PARENT: V, PLAYER: V },
  "development.edit":   { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },
  "notes.view":         { OWNER: E, ADMIN: E, COACH: E, PARENT: V, PLAYER: V },
  "notes.edit":         { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },

  // Services / programs
  "services.view":      { OWNER: E, ADMIN: E, COACH: V, PARENT: V, PLAYER: V },
  "services.edit":      { OWNER: E, ADMIN: E, COACH: V, PARENT: N, PLAYER: N },

  // Payments / billing
  "payments.view":      { OWNER: E, ADMIN: E, COACH: V, PARENT: V, PLAYER: N },
  "payments.refund":    { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },
  "billing.manage":     { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },

  // Comms / messages
  "messages.view":      { OWNER: E, ADMIN: E, COACH: E, PARENT: E, PLAYER: V },
  "messages.send":      { OWNER: E, ADMIN: E, COACH: E, PARENT: E, PLAYER: N },
  "messages.broadcast": { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },

  // Tenant administration
  "settings.tenant":    { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },
  "settings.locations": { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },
  "team.view":          { OWNER: E, ADMIN: E, COACH: V, PARENT: N, PLAYER: N },
  "team.invite":        { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },
  "team.remove":        { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },
  "audit.view":         { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },
  "data.export":        { OWNER: E, ADMIN: E, COACH: N, PARENT: N, PLAYER: N },
  "tenant.delete":      { OWNER: E, ADMIN: N, COACH: N, PARENT: N, PLAYER: N },

  // Tryouts (CLUB)
  "tryouts.view":       { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },
  "tryouts.edit":       { OWNER: E, ADMIN: E, COACH: E, PARENT: N, PLAYER: N },

  // Family-facing
  "family.dashboard":   { OWNER: V, ADMIN: V, COACH: V, PARENT: E, PLAYER: V },
  "family.book":        { OWNER: V, ADMIN: V, COACH: V, PARENT: E, PLAYER: N },
  "family.pay":         { OWNER: V, ADMIN: V, COACH: V, PARENT: E, PLAYER: N },
  "family.forms":       { OWNER: V, ADMIN: V, COACH: V, PARENT: E, PLAYER: V },

  // Platform staff (KickNScream itself) — gated by a separate user flag,
  // not by tenant role. Always N here; checked via `isPlatformStaff()`.
  "platform.admin":     { OWNER: N, ADMIN: N, COACH: N, PARENT: N, PLAYER: N },
};

const LETTER_TO_LEVEL: Record<LevelLetter, PermissionLevel> = {
  N: "NONE",
  V: "VIEW",
  E: "EDIT",
};

const LEVEL_RANK: Record<PermissionLevel, number> = {
  NONE: 0,
  VIEW: 1,
  EDIT: 2,
};

/**
 * Default level for a (feature, role) pair, before per-tenant overrides.
 */
export function defaultLevel(feature: Feature, role: Role): PermissionLevel {
  return LETTER_TO_LEVEL[MATRIX[feature][role]];
}

/**
 * Returns the effective `PermissionLevel` for the given tenant + role + feature,
 * after applying any `PermissionsOverride` rows. Pure-default version is
 * available via `defaultLevel()` when you don't have a tenantId.
 */
export async function effectiveLevel(
  tenantId: string,
  role: Role,
  feature: Feature
): Promise<PermissionLevel> {
  const override = await db.permissionsOverride.findUnique({
    where: { tenantId_role_feature: { tenantId, role, feature } },
  });
  return override?.level ?? defaultLevel(feature, role);
}

/**
 * Returns true if the actor has at least the requested level for the feature
 * in the given tenant. Default `requested` is `VIEW` — i.e. "can see this".
 *
 * Usage in server actions:
 *   await assertCan(user, tenant, "bookings.edit");
 *
 * Usage in UI server components:
 *   const canEditBookings = await can(membership, "bookings.edit");
 *   {canEditBookings && <EditButton />}
 */
export async function can(
  args: { tenantId: string; role: Role },
  feature: Feature,
  requested: PermissionLevel = "VIEW"
): Promise<boolean> {
  const lvl = await effectiveLevel(args.tenantId, args.role, feature);
  return LEVEL_RANK[lvl] >= LEVEL_RANK[requested];
}

/**
 * Synchronous variant for when you already know there are no overrides for
 * this tenant (e.g. inside the same React render that's already loaded the
 * override map). Use sparingly.
 */
export function canDefault(
  role: Role,
  feature: Feature,
  requested: PermissionLevel = "VIEW"
): boolean {
  return LEVEL_RANK[defaultLevel(feature, role)] >= LEVEL_RANK[requested];
}

export async function assertCan(
  args: { tenantId: string; role: Role },
  feature: Feature,
  requested: PermissionLevel = "EDIT"
): Promise<void> {
  if (!(await can(args, feature, requested))) {
    throw new Error(`Forbidden: ${feature} (${requested.toLowerCase()})`);
  }
}

export type { PermissionLevel };
