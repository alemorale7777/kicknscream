import type { ReactNode } from "react";
import { can, type Feature, type PermissionLevel } from "@/lib/auth/permissions";
import type { Role } from "@prisma/client";

/**
 * Server-component permission wrapper.
 *
 * Usage in a page or layout:
 *   <RoleGate tenantId={tenant.id} role={membership.role} feature="bookings.edit">
 *     <EditBookingButton />
 *   </RoleGate>
 *
 * Renders nothing (or `fallback`) if the user lacks the requested level.
 * Pages that need a hard block should use `assertCan()` from
 * `@/lib/auth/permissions` instead — that throws; RoleGate just hides.
 *
 * For an explicit "not authorized" page, see /t/[slug]/forbidden.
 */
export async function RoleGate({
  tenantId,
  role,
  feature,
  level = "VIEW",
  fallback = null,
  children,
}: {
  tenantId: string;
  role: Role;
  feature: Feature;
  level?: PermissionLevel;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const allowed = await can({ tenantId, role }, feature, level);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
