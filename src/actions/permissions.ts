"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { defaultLevel, type Feature } from "@/lib/auth/permissions";
import type { Role, PermissionLevel } from "@prisma/client";

const ROLES = ["OWNER", "ADMIN", "COACH", "PARENT", "PLAYER"] as const;
const LEVELS = ["NONE", "VIEW", "EDIT"] as const;

const schema = z.object({
  tenantId: z.string(),
  role: z.enum(ROLES),
  feature: z.string(),
  level: z.enum(LEVELS),
});

/**
 * Write a per-tenant override row for a (role, feature) pair. If `level`
 * equals the default for that role+feature, delete any existing override so
 * the table doesn't accumulate no-op rows.
 *
 * OWNER itself is locked — admins can't strip the OWNER role's powers, since
 * doing so would let them brick the tenant. (You can always invite a new
 * owner via team settings.)
 */
export async function setPermissionOverrideAction(
  input: z.infer<typeof schema>
) {
  const data = schema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === data.tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("Only owners and admins can edit permissions");
  }
  if (data.role === "OWNER") {
    throw new Error("OWNER permissions are locked");
  }

  const fallback = defaultLevel(data.feature as Feature, data.role as Role);

  if (data.level === fallback) {
    await db.permissionsOverride
      .delete({
        where: {
          tenantId_role_feature: {
            tenantId: data.tenantId,
            role: data.role as Role,
            feature: data.feature,
          },
        },
      })
      .catch(() => {
        // not present — no-op
      });
  } else {
    await db.permissionsOverride.upsert({
      where: {
        tenantId_role_feature: {
          tenantId: data.tenantId,
          role: data.role as Role,
          feature: data.feature,
        },
      },
      create: {
        tenantId: data.tenantId,
        role: data.role as Role,
        feature: data.feature,
        level: data.level as PermissionLevel,
      },
      update: { level: data.level as PermissionLevel },
    });
  }

  if (membership.tenant) {
    await db.auditLog.create({
      data: {
        tenantId: data.tenantId,
        actorUserId: user.id,
        action: "permission.override",
        targetType: "PermissionsOverride",
        diff: {
          role: data.role,
          feature: data.feature,
          level: data.level,
          fallback,
        },
      },
    });
    revalidatePath(`/t/${membership.tenant.slug}/admin/permissions`);
    revalidatePath(`/t/${membership.tenant.slug}/admin/audit`);
  }
}
