import { headers } from "next/headers";

/**
 * Gate cron endpoints. Vercel Cron requests include the `x-vercel-cron` header
 * set to "1". For local testing or fallback we accept a `CRON_SECRET` bearer
 * token in the Authorization header.
 *
 * Throws (so callers can `await assertCronAuth()` and let it bubble to a
 * NextResponse 401) — keeps each route handler tight.
 */
export async function assertCronAuth(): Promise<void> {
  const h = await headers();
  if (h.get("x-vercel-cron") === "1") return;
  const cronSecret = process.env.CRON_SECRET;
  const auth = h.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return;
  throw new Error("Unauthorized cron call");
}
