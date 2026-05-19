import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertCronAuth } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every 15 minutes — delete unclaimed booking drafts that have
 * expired. Claimed drafts stay (they're the audit trail for "this
 * parent saved 3 drafts before finishing").
 */
export async function GET() {
  try {
    await assertCronAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await db.bookingDraft.deleteMany({
    where: {
      claimedAt: null,
      expiresAt: { lt: new Date() },
    },
  });
  console.log("[cron:expire-booking-drafts]", { deleted: result.count });
  return NextResponse.json({ ok: true, deleted: result.count });
}
