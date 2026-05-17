"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { generateInvitationToken, getInvitationUrl, sendInvitationEmail } from "@/lib/invitations";

const createPlayerSchema = z.object({
  tenantId: z.string(),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
  position: z.string().max(40).optional(),
  jerseyNumber: z
    .union([z.string(), z.number()])
    .transform((v) => (v === "" || v === null ? null : Number(v)))
    .nullable()
    .optional(),
  notes: z.string().max(2000).optional(),
  parentEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  inviteParentIfNew: z.boolean().optional(),
});

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage the roster");
  }
  return { user, membership };
}

export async function createPlayerAction(input: z.infer<typeof createPlayerSchema>) {
  const data = createPlayerSchema.parse(input);
  const { user, membership } = await assertCanManage(data.tenantId);
  const tenant = membership.tenant;
  if (!tenant) throw new Error("Tenant not found");

  let parentId: string | null = null;
  let parentInvited = false;

  if (data.parentEmail) {
    const email = data.parentEmail.toLowerCase().trim();
    const parent = await db.user.findUnique({
      where: { email },
      include: { memberships: { where: { tenantId: data.tenantId } } },
    });

    if (parent) {
      parentId = parent.id;
      // If they exist but have no membership on this tenant, add a PARENT membership
      if (parent.memberships.length === 0) {
        await db.membership.create({
          data: { userId: parent.id, tenantId: data.tenantId, role: "PARENT" },
        });
      }
    } else if (data.inviteParentIfNew) {
      // Send a PARENT invitation; the parentId will be linked when they accept
      const token = generateInvitationToken();
      await db.invitation.create({
        data: {
          tenantId: data.tenantId,
          email,
          role: "PARENT",
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedBy: user.id,
        },
      });
      await sendInvitationEmail({
        to: email,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        inviterName: user.name ?? user.email ?? "A teammate",
        role: "PARENT",
        acceptUrl: getInvitationUrl(token),
      });
      parentInvited = true;
    }
  }

  await db.player.create({
    data: {
      tenantId: data.tenantId,
      firstName: data.firstName,
      lastName: data.lastName,
      dob: new Date(`${data.dob}T00:00:00.000Z`),
      parentId,
      position: data.position || null,
      jerseyNumber: data.jerseyNumber ?? null,
      notes: data.notes || null,
    },
  });

  revalidatePath(`/t/${tenant.slug}/roster`);
  return { parentInvited };
}

const updatePlayerSchema = createPlayerSchema.extend({ id: z.string() });

export async function updatePlayerAction(input: z.infer<typeof updatePlayerSchema>) {
  const data = updatePlayerSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  let parentId: string | null = null;
  if (data.parentEmail) {
    const email = data.parentEmail.toLowerCase().trim();
    const parent = await db.user.findUnique({ where: { email } });
    if (parent) parentId = parent.id;
  }

  await db.player.update({
    where: { id: data.id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      dob: new Date(`${data.dob}T00:00:00.000Z`),
      parentId,
      position: data.position || null,
      jerseyNumber: data.jerseyNumber ?? null,
      notes: data.notes || null,
    },
  });

  revalidatePath(`/t/${membership.tenant.slug}/roster`);
}

export async function deletePlayerAction(tenantId: string, playerId: string) {
  const { membership } = await assertCanManage(tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");
  await db.player.delete({ where: { id: playerId } });
  revalidatePath(`/t/${membership.tenant.slug}/roster`);
}
