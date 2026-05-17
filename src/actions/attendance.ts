"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { hasRole } from "@/lib/roles";
import type { AttendanceStatus } from "@prisma/client";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "PENDING"] as const;

const markSchema = z.object({
  tenantId: z.string(),
  eventId: z.string(),
  playerId: z.string(),
  status: z.enum(STATUSES),
});

async function assertCanMark(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !hasRole(membership.role, "COACH")) {
    throw new Error("You don't have permission to take attendance");
  }
  return { user, membership };
}

export async function markAttendanceAction(input: z.infer<typeof markSchema>) {
  const data = markSchema.parse(input);
  const { user, membership } = await assertCanMark(data.tenantId);

  await db.attendance.upsert({
    where: { eventId_playerId: { eventId: data.eventId, playerId: data.playerId } },
    create: {
      eventId: data.eventId,
      playerId: data.playerId,
      status: data.status as AttendanceStatus,
      checkedInAt: data.status === "PRESENT" || data.status === "LATE" ? new Date() : null,
      checkedInBy: user.id,
    },
    update: {
      status: data.status as AttendanceStatus,
      checkedInAt: data.status === "PRESENT" || data.status === "LATE" ? new Date() : null,
      checkedInBy: user.id,
    },
  });

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/schedule/${data.eventId}`);
  }
}

const bulkSchema = z.object({
  tenantId: z.string(),
  eventId: z.string(),
  status: z.enum(STATUSES),
  playerIds: z.array(z.string()),
});

export async function bulkMarkAttendanceAction(input: z.infer<typeof bulkSchema>) {
  const data = bulkSchema.parse(input);
  const { user, membership } = await assertCanMark(data.tenantId);
  const status = data.status as AttendanceStatus;
  const at = status === "PRESENT" || status === "LATE" ? new Date() : null;

  await db.$transaction(
    data.playerIds.map((playerId) =>
      db.attendance.upsert({
        where: { eventId_playerId: { eventId: data.eventId, playerId } },
        create: { eventId: data.eventId, playerId, status, checkedInAt: at, checkedInBy: user.id },
        update: { status, checkedInAt: at, checkedInBy: user.id },
      })
    )
  );

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/schedule/${data.eventId}`);
  }
}
