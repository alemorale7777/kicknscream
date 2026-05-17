"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { sendBroadcastEmail } from "@/lib/email";

const schema = z.object({
  tenantId: z.string(),
  audience: z.enum(["ALL_PARENTS", "BY_PROGRAM"]),
  programId: z.string().optional(),
  subject: z.string().min(2).max(180),
  body: z.string().min(2).max(20000),
});

export async function sendBroadcastAction(input: z.infer<typeof schema>) {
  const data = schema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === data.tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to send broadcasts");
  }
  if (!membership.tenant) throw new Error("Tenant not found");

  // Resolve recipient emails based on audience
  let recipients: { email: string; name?: string | null }[] = [];

  if (data.audience === "ALL_PARENTS") {
    const parents = await db.membership.findMany({
      where: { tenantId: data.tenantId, role: "PARENT" },
      include: { user: true },
    });
    recipients = parents
      .map((m) => ({ email: m.user.email, name: m.user.name }))
      .filter((r): r is { email: string; name: string | null } => !!r.email);
  } else if (data.audience === "BY_PROGRAM" && data.programId) {
    const enrollments = await db.enrollment.findMany({
      where: { programId: data.programId, status: { in: ["ACTIVE", "PENDING"] } },
      include: { player: true },
    });
    const parentIds = Array.from(
      new Set(enrollments.map((e) => e.player.parentId).filter((id): id is string => !!id))
    );
    const parents = parentIds.length
      ? await db.user.findMany({ where: { id: { in: parentIds } } })
      : [];
    recipients = parents
      .map((u) => ({ email: u.email, name: u.name }))
      .filter((r): r is { email: string; name: string | null } => !!r.email);
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = recipients.filter((r) => {
    const k = r.email.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (unique.length === 0) {
    throw new Error("No recipients matched the audience filters");
  }

  // Send sequentially (small audiences). For larger blasts we'd batch.
  const tenantName = membership.tenant.name;
  const tenantSlug = membership.tenant.slug;
  let sent = 0;
  for (const r of unique) {
    try {
      await sendBroadcastEmail({
        to: r.email,
        recipientName: r.name,
        tenantName,
        tenantSlug,
        subject: data.subject,
        bodyMarkdown: data.body,
      });
      sent++;
    } catch {
      // best-effort — don't abort the whole blast on one failure
    }
  }

  return { sent, totalAudience: unique.length };
}

const TEMPLATES = [
  {
    id: "cancellation",
    label: "Practice cancellation",
    subject: "Today's session canceled",
    body: "Hi families,\n\nWe have to cancel today's session due to **{weather/field/coach}**. We'll make up the time next week.\n\nThanks for understanding,\n{your name}",
  },
  {
    id: "weather",
    label: "Weather alert",
    subject: "Heads up — weather watch",
    body: "Hi everyone,\n\nKeeping an eye on the weather. I'll send a final go/no-go call by **{time}**. If we play through, dress warm and bring an extra layer.\n\n— Coach",
  },
  {
    id: "registration",
    label: "Registration open",
    subject: "Registration is open for {program}",
    body: "Hi families,\n\nNew session is open for registration! Highlights:\n\n- **When:** {date range}\n- **Where:** {location}\n- **Who:** {age group / level}\n\nSpots are limited — register here when you're ready.\n\nLet me know if you have questions.",
  },
  {
    id: "balance",
    label: "Balance reminder",
    subject: "Friendly balance reminder",
    body: "Hi,\n\nQuick reminder that you have an outstanding balance for the recent program. You can pay through your portal, or reply to this email and we'll work something out.\n\nThanks!",
  },
];

export async function getBroadcastTemplates() {
  return TEMPLATES;
}
