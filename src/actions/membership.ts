"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { generateInvitationToken, getInvitationUrl, sendInvitationEmail } from "@/lib/invitations";

const inviteSchema = z.object({
  tenantId: z.string(),
  email: z.string().email("Invalid email"),
  role: z.enum(["ADMIN", "COACH", "PARENT", "PLAYER"]),
});

export async function inviteMemberAction(input: z.infer<typeof inviteSchema>) {
  const data = inviteSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const membership = user.memberships.find((m) => m.tenantId === data.tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to invite members");
  }

  const tenant = await db.tenant.findUnique({ where: { id: data.tenantId } });
  if (!tenant) throw new Error("Tenant not found");

  const normalizedEmail = data.email.toLowerCase().trim();

  // Check if user is already a member
  const existingUser = await db.user.findUnique({
    where: { email: normalizedEmail },
    include: { memberships: { where: { tenantId: data.tenantId } } },
  });
  if (existingUser && existingUser.memberships.length > 0) {
    throw new Error(`${normalizedEmail} is already a member of this tenant`);
  }

  // Check for existing pending invitation
  const existingInvite = await db.invitation.findFirst({
    where: { tenantId: data.tenantId, email: normalizedEmail, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) {
    throw new Error(`${normalizedEmail} already has a pending invitation`);
  }

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.invitation.create({
    data: {
      tenantId: data.tenantId,
      email: normalizedEmail,
      role: data.role,
      token,
      expiresAt,
      invitedBy: user.id,
    },
  });

  await sendInvitationEmail({
    to: normalizedEmail,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    inviterName: user.name ?? user.email ?? "A teammate",
    role: data.role,
    acceptUrl: getInvitationUrl(token),
  });

  revalidatePath(`/t/${tenant.slug}/settings/team`);
}

export async function revokeInvitationAction(tenantId: string, invitationId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("Unauthorized");
  }
  await db.invitation.delete({ where: { id: invitationId } });
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (tenant) revalidatePath(`/t/${tenant.slug}/settings/team`);
}

export async function removeMemberAction(tenantId: string, userId: string) {
  const actor = await getCurrentUser();
  if (!actor) throw new Error("Not authenticated");
  const myMembership = actor.memberships.find((m) => m.tenantId === tenantId);
  if (!myMembership || !canManageTenant(myMembership.role)) {
    throw new Error("You don't have permission to remove members");
  }
  if (actor.id === userId) {
    throw new Error("Use the danger zone to leave your own tenant");
  }
  const targetMembership = await db.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (!targetMembership) throw new Error("Member not found");
  if (targetMembership.role === "OWNER") {
    throw new Error("The OWNER cannot be removed");
  }
  await db.membership.delete({ where: { userId_tenantId: { userId, tenantId } } });
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (tenant) revalidatePath(`/t/${tenant.slug}/settings/team`);
}

export async function acceptInvitationAction(token: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to accept an invitation");

  const invite = await db.invitation.findUnique({
    where: { token },
    include: { tenant: true },
  });
  if (!invite) throw new Error("Invitation not found");
  if (invite.acceptedAt) {
    redirect(`/t/${invite.tenant.slug}/dashboard`);
  }
  if (invite.expiresAt < new Date()) throw new Error("This invitation has expired");
  if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    throw new Error(`This invitation is for ${invite.email}. Sign in with that email to accept.`);
  }

  await db.$transaction([
    db.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: invite.tenantId } },
      create: { userId: user.id, tenantId: invite.tenantId, role: invite.role },
      update: { role: invite.role },
    }),
    db.invitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  redirect(`/t/${invite.tenant.slug}/dashboard`);
}
