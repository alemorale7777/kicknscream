"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import type { PriceModel, SkillLevel } from "@prisma/client";

const PRICE_MODEL = z.enum(["PER_SESSION", "PACKAGE", "MONTHLY", "SEASON", "FREE"]);
const SKILL_LEVEL = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ELITE"]);

const baseSchema = z.object({
  tenantId: z.string(),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  ageMin: z.union([z.number().int().min(2).max(99), z.literal("")]).optional().nullable(),
  ageMax: z.union([z.number().int().min(2).max(99), z.literal("")]).optional().nullable(),
  skillLevel: SKILL_LEVEL.optional().nullable(),
  priceModel: PRICE_MODEL,
  // Dollars on the wire; we store cents
  priceDollars: z.number().min(0).max(99999),
  capacity: z.union([z.number().int().min(1).max(2000), z.literal("")]).optional().nullable(),
});

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage programs");
  }
  return { user, membership };
}

export async function createProgramAction(input: z.infer<typeof baseSchema>) {
  const data = baseSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  await db.program.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      description: data.description || null,
      ageMin: typeof data.ageMin === "number" ? data.ageMin : null,
      ageMax: typeof data.ageMax === "number" ? data.ageMax : null,
      skillLevel: (data.skillLevel as SkillLevel) || null,
      priceModel: data.priceModel as PriceModel,
      price: Math.round(data.priceDollars * 100),
      capacity: typeof data.capacity === "number" ? data.capacity : null,
    },
  });

  revalidatePath(`/t/${membership.tenant.slug}/programs`);
  revalidatePath(`/${membership.tenant.slug}`);
  revalidatePath(`/${membership.tenant.slug}/book`);
}

const updateSchema = baseSchema.extend({ id: z.string(), archived: z.boolean().optional() });

export async function updateProgramAction(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  await db.program.update({
    where: { id: data.id },
    data: {
      name: data.name,
      description: data.description || null,
      ageMin: typeof data.ageMin === "number" ? data.ageMin : null,
      ageMax: typeof data.ageMax === "number" ? data.ageMax : null,
      skillLevel: (data.skillLevel as SkillLevel) || null,
      priceModel: data.priceModel as PriceModel,
      price: Math.round(data.priceDollars * 100),
      capacity: typeof data.capacity === "number" ? data.capacity : null,
      archived: data.archived ?? false,
    },
  });

  revalidatePath(`/t/${membership.tenant.slug}/programs`);
  revalidatePath(`/${membership.tenant.slug}`);
  revalidatePath(`/${membership.tenant.slug}/book`);
}

export async function archiveProgramAction(tenantId: string, programId: string, archived: boolean) {
  const { membership } = await assertCanManage(tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");
  await db.program.update({ where: { id: programId }, data: { archived } });
  revalidatePath(`/t/${membership.tenant.slug}/programs`);
  revalidatePath(`/${membership.tenant.slug}`);
}

export async function deleteProgramAction(tenantId: string, programId: string) {
  const { membership } = await assertCanManage(tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");
  // Soft-protect: refuse if there are enrollments
  const enrollmentCount = await db.enrollment.count({ where: { programId } });
  if (enrollmentCount > 0) {
    throw new Error(
      `This program has ${enrollmentCount} enrollment${enrollmentCount === 1 ? "" : "s"}. Archive it instead so historical data is preserved.`
    );
  }
  await db.program.delete({ where: { id: programId } });
  revalidatePath(`/t/${membership.tenant.slug}/programs`);
  revalidatePath(`/${membership.tenant.slug}`);
}
