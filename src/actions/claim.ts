"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeClaimToken } from "@/lib/parents";

/**
 * Magic-link claim flow. Resolves the token to a Parent and attaches the
 * signed-in User, then redirects to the family portal home for one of the
 * Parent's tenants. Unknown / expired tokens fall through to
 * /claim/expired; sign-in is bounced through /auth/signin with a
 * callbackUrl so the user lands back here after auth.
 */
export async function consumeClaimTokenAction(token: string): Promise<never> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/claim/${token}`);
  }
  const result = await consumeClaimToken(db, {
    token,
    userId: session.user.id,
  });
  if (!result) {
    redirect("/claim/expired");
  }
  const firstLink = await db.tenantParent.findFirst({
    where: { parentId: result.parent.id, status: "ACTIVE" },
    include: { tenant: { select: { slug: true } } },
  });
  if (!firstLink) {
    redirect("/");
  }
  redirect(`/t/${firstLink.tenant.slug}/family/home`);
}
