"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import type { TryoutStatus } from "@prisma/client";

const submitSchema = z.object({
  tenantSlug: z.string(),
  playerName: z.string().min(2).max(120),
  parentEmail: z.string().email(),
  parentPhone: z.string().max(40).optional(),
  ageGroup: z.string().min(1).max(40),
  videoUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

/**
 * Public tryout submission — no auth required.
 * Anyone can submit, anti-abuse is via Vercel's WAF + rate limits.
 */
export async function submitTryoutAction(input: z.infer<typeof submitSchema>) {
  const data = submitSchema.parse(input);
  const tenant = await db.tenant.findUnique({ where: { slug: data.tenantSlug } });
  if (!tenant) throw new Error("Tenant not found");
  if (tenant.type !== "CLUB") throw new Error("This tenant doesn't run tryouts");

  await db.tryoutSignup.create({
    data: {
      tenantId: tenant.id,
      playerName: data.playerName,
      parentEmail: data.parentEmail.toLowerCase().trim(),
      parentPhone: data.parentPhone || null,
      ageGroup: data.ageGroup,
      videoUrl: data.videoUrl || null,
      notes: data.notes || null,
      status: "PENDING",
    },
  });

  redirect(`/${tenant.slug}/tryouts/thanks`);
}

const STATUSES = ["PENDING", "INVITED", "ATTENDED", "OFFERED", "ACCEPTED", "DECLINED"] as const;

const updateSchema = z.object({
  tenantId: z.string(),
  tryoutId: z.string(),
  status: z.enum(STATUSES),
});

export async function updateTryoutStatusAction(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === data.tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage tryouts");
  }
  if (!membership.tenant) throw new Error("Tenant not found");

  await db.tryoutSignup.update({
    where: { id: data.tryoutId },
    data: { status: data.status as TryoutStatus },
  });

  revalidatePath(`/t/${membership.tenant.slug}/coach/tryouts`);
}

export async function deleteTryoutAction(tenantId: string, tryoutId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("Unauthorized");
  }
  if (!membership.tenant) throw new Error("Tenant not found");
  await db.tryoutSignup.delete({ where: { id: tryoutId } });
  revalidatePath(`/t/${membership.tenant.slug}/coach/tryouts`);
}
