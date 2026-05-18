"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";

const signSchema = z.object({
  waiverId: z.string(),
  playerId: z.string(),
  signerName: z.string().min(2).max(120),
});

/**
 * Records a typed e-signature. We capture:
 *  - signer name (typed into the form),
 *  - signer email (from the session — never trust the form),
 *  - IP address (best-effort via x-forwarded-for; useful for chargebacks),
 *  - signedAt (server timestamp).
 *
 * Authorization: the signer must be the parent on the player record, and
 * the waiver must belong to the same tenant as the player. We don't allow
 * a parent to re-sign — the first signature is canonical.
 */
export async function signWaiverAction(input: z.infer<typeof signSchema>) {
  const data = signSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in to sign a waiver");
  if (!user.email) throw new Error("Your account needs an email to e-sign");

  const player = await db.player.findUnique({ where: { id: data.playerId } });
  if (!player) throw new Error("Player not found");
  if (player.parentId !== user.id) {
    throw new Error("You can only sign waivers for your own player");
  }

  const waiver = await db.waiver.findUnique({ where: { id: data.waiverId } });
  if (!waiver || waiver.tenantId !== player.tenantId) {
    throw new Error("Waiver not found");
  }

  // First-signature-wins: if this parent already signed, treat as no-op.
  const existing = await db.waiverSignature.findFirst({
    where: { waiverId: waiver.id, playerId: player.id, signerEmail: user.email },
  });
  if (existing) return { ok: true, alreadySigned: true };

  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

  await db.waiverSignature.create({
    data: {
      waiverId: waiver.id,
      playerId: player.id,
      signerName: data.signerName,
      signerEmail: user.email,
      ipAddress: ip,
    },
  });

  const tenant = await db.tenant.findUnique({ where: { id: player.tenantId } });
  if (tenant) {
    revalidatePath(`/t/${tenant.slug}/family/forms`);
  }
  return { ok: true, alreadySigned: false };
}
