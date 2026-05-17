"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { hasRole } from "@/lib/roles";

const CATEGORIES = [
  "Technical",
  "Tactical",
  "Physical",
  "Mental",
  "Ball Control",
  "First Touch",
  "Passing",
  "Shooting",
  "Defending",
  "1v1",
  "Decision Making",
  "Leadership",
  "Other",
] as const;

const schema = z.object({
  tenantId: z.string(),
  playerId: z.string(),
  category: z.string().max(60).optional(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  content: z.string().min(2).max(4000),
});

async function assertCanWrite(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const m = user.memberships.find((x) => x.tenantId === tenantId);
  if (!m || !hasRole(m.role, "COACH")) throw new Error("You don't have permission to write development notes");
  return { user, membership: m };
}

export async function createDevelopmentNoteAction(input: z.infer<typeof schema>) {
  const data = schema.parse(input);
  const { user, membership } = await assertCanWrite(data.tenantId);

  const player = await db.player.findUnique({ where: { id: data.playerId } });
  if (!player || player.tenantId !== data.tenantId) throw new Error("Player not found");

  await db.developmentNote.create({
    data: {
      playerId: data.playerId,
      authorId: user.id,
      category: data.category || null,
      rating: data.rating ?? null,
      content: data.content,
    },
  });

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/development`);
  }
}

export async function deleteDevelopmentNoteAction(tenantId: string, noteId: string) {
  const { user, membership } = await assertCanWrite(tenantId);
  const note = await db.developmentNote.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("Note not found");
  if (note.authorId !== user.id && !hasRole(membership.role, "ADMIN")) {
    throw new Error("Only the author or an admin can delete this note");
  }
  await db.developmentNote.delete({ where: { id: noteId } });
  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/development`);
  }
}

export async function getDevelopmentCategories(): Promise<string[]> {
  return [...CATEGORIES];
}
