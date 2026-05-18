import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MessagesClient } from "@/components/messages/MessagesClient";

export const metadata = { title: "Messages" };

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, membership, user } = await requireTenant(slug);
  if (!canManageTenant(membership.role)) notFound();

  const [threads, parentMemberships] = await Promise.all([
    db.thread.findMany({
      where: { tenantId: tenant.id, participantIds: { has: user.id } },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, senderUserId: true, createdAt: true, readAt: true },
        },
      },
    }),
    db.membership.findMany({
      where: { tenantId: tenant.id, role: "PARENT" },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const participantIds = Array.from(
    new Set(threads.flatMap((t) => t.participantIds))
  );
  const participants = await db.user.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, name: true, email: true },
  });
  const participantById = new Map(participants.map((p) => [p.id, p]));

  const threadSummaries = threads.map((t) => {
    const last = t.messages[0];
    const otherIds = t.participantIds.filter((id) => id !== user.id);
    const others = otherIds
      .map((id) => participantById.get(id))
      .filter((p): p is { id: string; name: string | null; email: string } => !!p);
    return {
      id: t.id,
      subject: t.subject,
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastMessageBody: last?.body ?? null,
      lastMessageMine: last ? last.senderUserId === user.id : false,
      unread: !!last && last.senderUserId !== user.id && !last.readAt,
      others,
    };
  });

  const parents = parentMemberships
    .map((m) => m.user)
    .filter(
      (u): u is { id: string; name: string | null; email: string } => !!u.email
    );

  return (
    <MessagesClient
      tenantId={tenant.id}
      currentUserId={user.id}
      threads={threadSummaries}
      parents={parents}
    />
  );
}
