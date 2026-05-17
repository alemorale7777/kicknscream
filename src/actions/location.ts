"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";

const locationSchema = z.object({
  tenantId: z.string(),
  name: z.string().min(2).max(80),
  address: z.string().max(200).optional(),
});

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage locations");
  }
  return { user, membership };
}

export async function createLocationAction(input: z.infer<typeof locationSchema>) {
  const data = locationSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  await db.location.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      address: data.address || null,
    },
  });
  if (membership.tenant) revalidatePath(`/t/${membership.tenant.slug}/coach/settings/locations`);
}

const updateSchema = locationSchema.extend({ id: z.string() });

export async function updateLocationAction(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  await db.location.update({
    where: { id: data.id },
    data: {
      name: data.name,
      address: data.address || null,
    },
  });
  if (membership.tenant) revalidatePath(`/t/${membership.tenant.slug}/coach/settings/locations`);
}

export async function deleteLocationAction(tenantId: string, id: string) {
  const { membership } = await assertCanManage(tenantId);
  await db.location.delete({ where: { id } });
  if (membership.tenant) revalidatePath(`/t/${membership.tenant.slug}/coach/settings/locations`);
}
