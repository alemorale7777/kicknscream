import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canEditPlayer } from "@/lib/canEditPlayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get("file");
  const playerId = form.get("playerId");
  if (!file || !(file instanceof Blob) || typeof playerId !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image too large (max 5MB)" },
      { status: 413 }
    );
  }
  if (!(await canEditPlayer(session.user.id, playerId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ext = file.type.split("/")[1]?.split("+")[0] ?? "jpg";
  const result = await put(`player-photos/${playerId}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  await db.player.update({
    where: { id: playerId },
    data: { photoUrl: result.url },
  });

  return NextResponse.json({ url: result.url });
}
