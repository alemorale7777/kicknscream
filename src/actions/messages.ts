"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { sendDirectMessageEmail } from "@/lib/email";
import { env } from "@/lib/env";

/**
 * Coach-side messaging. Threads here are always 1:1 between the coach (any
 * tenant manager) and a single parent — the broadcast composer still owns
 * the one-to-many path. Keeping threads small means reply semantics are
 * predictable: every message lands in exactly one parent's inbox.
 */

async function assertCanMessage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to send messages");
  }
  if (!membership.tenant) throw new Error("Tenant not found");
  return { user, membership, tenant: membership.tenant };
}

const createThreadSchema = z.object({
  tenantId: z.string(),
  recipientUserId: z.string(),
  subject: z.string().min(2).max(180),
  body: z.string().min(1).max(20000),
  sendEmail: z.boolean().optional(),
});

export async function createThreadAction(input: z.infer<typeof createThreadSchema>) {
  const data = createThreadSchema.parse(input);
  const { user, tenant } = await assertCanMessage(data.tenantId);

  const recipient = await db.user.findUnique({ where: { id: data.recipientUserId } });
  if (!recipient) throw new Error("Recipient not found");

  // Guard: the recipient must be a member of this tenant — prevents a
  // coach from messaging users from other tenants by id-guessing.
  const recipientMembership = await db.membership.findUnique({
    where: { userId_tenantId: { userId: recipient.id, tenantId: data.tenantId } },
  });
  if (!recipientMembership) {
    throw new Error("Recipient is not a member of this tenant");
  }

  // If there's already a 1:1 thread between these two, reuse it — saves us
  // an ever-growing list of single-message threads when a coach keeps
  // starting "new" conversations with the same parent.
  const existing = await db.thread.findFirst({
    where: {
      tenantId: data.tenantId,
      participantIds: { hasEvery: [user.id, recipient.id] },
    },
    select: { id: true, participantIds: true },
  });
  const reusable = existing && existing.participantIds.length === 2 ? existing : null;

  const thread = reusable
    ? await db.thread.update({
        where: { id: reusable.id },
        data: { lastMessageAt: new Date() },
      })
    : await db.thread.create({
        data: {
          tenantId: data.tenantId,
          subject: data.subject,
          participantIds: [user.id, recipient.id],
          lastMessageAt: new Date(),
        },
      });

  await db.message.create({
    data: {
      tenantId: data.tenantId,
      threadId: thread.id,
      senderUserId: user.id,
      body: data.body,
      channel: data.sendEmail ? "EMAIL" : "IN_APP",
      deliveredAt: new Date(),
    },
  });

  // Email side-channel: respects recipient's UserPreferences.emailMessages
  // and falls back to allow-on-missing-record so parents who never set
  // their prefs still hear from their coach.
  if (data.sendEmail !== false && recipient.email) {
    const prefs = await db.userPreferences.findUnique({ where: { userId: recipient.id } });
    const allowEmail = prefs ? prefs.emailMessages : true;
    if (allowEmail) {
      const replyUrl = `${env.NEXTAUTH_URL}/t/${tenant.slug}/family/home`;
      try {
        await sendDirectMessageEmail({
          to: recipient.email,
          recipientName: recipient.name,
          senderName: user.name ?? "Your coach",
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          subject: data.subject,
          bodyText: data.body,
          replyUrl,
        });
      } catch {
        // best-effort — in-app delivery already succeeded.
      }
    }
  }

  revalidatePath(`/t/${tenant.slug}/coach/messages`);
  return { threadId: thread.id };
}

const sendMessageSchema = z.object({
  tenantId: z.string(),
  threadId: z.string(),
  body: z.string().min(1).max(20000),
  sendEmail: z.boolean().optional(),
});

export async function sendMessageAction(input: z.infer<typeof sendMessageSchema>) {
  const data = sendMessageSchema.parse(input);
  const { user, tenant } = await assertCanMessage(data.tenantId);

  const thread = await db.thread.findUnique({ where: { id: data.threadId } });
  if (!thread || thread.tenantId !== data.tenantId) {
    throw new Error("Thread not found");
  }
  if (!thread.participantIds.includes(user.id)) {
    throw new Error("You're not a participant on this thread");
  }

  await db.$transaction([
    db.message.create({
      data: {
        tenantId: data.tenantId,
        threadId: thread.id,
        senderUserId: user.id,
        body: data.body,
        channel: data.sendEmail ? "EMAIL" : "IN_APP",
        deliveredAt: new Date(),
      },
    }),
    db.thread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  // Send to every other participant who allows email messages.
  if (data.sendEmail !== false) {
    const otherIds = thread.participantIds.filter((id) => id !== user.id);
    const [recipients, prefRows] = await Promise.all([
      db.user.findMany({ where: { id: { in: otherIds } } }),
      db.userPreferences.findMany({ where: { userId: { in: otherIds } } }),
    ]);
    const prefByUser = new Map(prefRows.map((p) => [p.userId, p]));
    const replyUrl = `${env.NEXTAUTH_URL}/t/${tenant.slug}/family/home`;
    const subject = thread.subject ? `Re: ${thread.subject}` : `Message from ${tenant.name}`;

    await Promise.all(
      recipients
        .filter((r) => {
          if (!r.email) return false;
          const pref = prefByUser.get(r.id);
          return pref ? pref.emailMessages : true;
        })
        .map((r) =>
          sendDirectMessageEmail({
            to: r.email,
            recipientName: r.name,
            senderName: user.name ?? "Your coach",
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            subject,
            bodyText: data.body,
            replyUrl,
          }).catch(() => {
            // best-effort — in-app delivery is the source of truth.
          })
        )
    );
  }

  revalidatePath(`/t/${tenant.slug}/coach/messages`);
  return { ok: true };
}

const markReadSchema = z.object({
  tenantId: z.string(),
  threadId: z.string(),
});

export async function loadThreadAction(tenantId: string, threadId: string) {
  const { user } = await assertCanMessage(tenantId);
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread || thread.tenantId !== tenantId) {
    throw new Error("Thread not found");
  }
  if (!thread.participantIds.includes(user.id)) {
    throw new Error("You're not a participant on this thread");
  }

  const [messages, participants] = await Promise.all([
    db.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        senderUserId: true,
        channel: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.user.findMany({
      where: { id: { in: thread.participantIds } },
      select: { id: true, name: true, email: true },
    }),
  ]);

  return {
    id: thread.id,
    subject: thread.subject,
    participantIds: thread.participantIds,
    participants,
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
    })),
  };
}

export async function markThreadReadAction(input: z.infer<typeof markReadSchema>) {
  const data = markReadSchema.parse(input);
  const { user, tenant } = await assertCanMessage(data.tenantId);

  const thread = await db.thread.findUnique({ where: { id: data.threadId } });
  if (!thread || thread.tenantId !== data.tenantId) {
    throw new Error("Thread not found");
  }
  if (!thread.participantIds.includes(user.id)) {
    throw new Error("You're not a participant on this thread");
  }

  await db.message.updateMany({
    where: {
      threadId: thread.id,
      readAt: null,
      senderUserId: { not: user.id },
    },
    data: { readAt: new Date() },
  });

  revalidatePath(`/t/${tenant.slug}/coach/messages`);
}
