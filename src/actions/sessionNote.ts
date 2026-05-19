"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { hasRole } from "@/lib/roles";
import { sendSessionNoteEmail } from "@/lib/email";

const createSchema = z.object({
  tenantId: z.string(),
  eventId: z.string(),
  playerId: z.string().optional().nullable(), // null = general session note for the whole event
  content: z.string().min(2).max(8000),
  visibleToParent: z.boolean().default(true),
});

async function assertCanWriteNote(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !hasRole(membership.role, "COACH")) {
    throw new Error("You don't have permission to add session notes");
  }
  return { user, membership };
}

export async function createSessionNoteAction(input: z.infer<typeof createSchema>) {
  const data = createSchema.parse(input);
  const { user, membership } = await assertCanWriteNote(data.tenantId);

  const event = await db.event.findUnique({ where: { id: data.eventId } });
  if (!event || event.tenantId !== data.tenantId) throw new Error("Event not found");

  const note = await db.sessionNote.create({
    data: {
      eventId: data.eventId,
      playerId: data.playerId || null,
      authorId: user.id,
      content: data.content,
      visibleToParent: data.visibleToParent,
    },
  });

  // If this note is targeted at a specific player and is visible to parent,
  // fire an email to the parent.
  if (data.visibleToParent && data.playerId) {
    const player = await db.player.findUnique({ where: { id: data.playerId } });
    if (player?.parentId) {
      const parent = await db.user.findUnique({ where: { id: player.parentId } });
      if (parent?.email && membership.tenant) {
        await sendSessionNoteEmail({
          to: parent.email,
          parentName: parent.name ?? parent.email,
          tenantName: membership.tenant.name,
          tenantSlug: membership.tenant.slug,
          playerName: `${player.firstName} ${player.lastName}`,
          coachName: user.name ?? user.email ?? "Your coach",
          eventTitle: event.title,
          eventDate: event.startsAt,
          content: data.content,
          timeZone: membership.tenant.timeZone ?? undefined,
        }).catch(() => {});
      }
    }
  }

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${data.eventId}`);
    revalidatePath(`/t/${membership.tenant.slug}/coach/dashboard`);
  }
  return note;
}

const updateSchema = z.object({
  tenantId: z.string(),
  noteId: z.string(),
  content: z.string().min(2).max(8000),
  visibleToParent: z.boolean().optional(),
});

export async function updateSessionNoteAction(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  const { user, membership } = await assertCanWriteNote(data.tenantId);
  const note = await db.sessionNote.findUnique({ where: { id: data.noteId } });
  if (!note) throw new Error("Note not found");
  // Only the author (or an ADMIN+) can edit
  if (note.authorId !== user.id && !hasRole(membership.role, "ADMIN")) {
    throw new Error("Only the author or an admin can edit this note");
  }
  await db.sessionNote.update({
    where: { id: data.noteId },
    data: {
      content: data.content,
      visibleToParent: data.visibleToParent ?? note.visibleToParent,
    },
  });
  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${note.eventId}`);
  }
}

export async function deleteSessionNoteAction(tenantId: string, noteId: string) {
  const { user, membership } = await assertCanWriteNote(tenantId);
  const note = await db.sessionNote.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("Note not found");
  if (note.authorId !== user.id && !hasRole(membership.role, "ADMIN")) {
    throw new Error("Only the author or an admin can delete this note");
  }
  await db.sessionNote.delete({ where: { id: noteId } });
  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/schedule/${note.eventId}`);
  }
}
