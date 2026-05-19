import type { Program } from "@prisma/client";

/**
 * Subset of Program that drives the public-page bookability check.
 * Accepts Pick<Program, ...> so callers can pass either a full row from
 * the DB or a hand-built fixture in tests.
 */
export type PubliclyBookableInput = Pick<
  Program,
  "archived" | "priceModel" | "price" | "stripePriceId"
>;

/**
 * True when a program is safe to render on the public tenant page.
 * Hides recurring services that have no Stripe price attached yet —
 * those show $0/per month publicly even though the coach UI flags them
 * as "Recurring price pending", which is a booking foot-gun.
 */
export function isPubliclyBookable(program: PubliclyBookableInput): boolean {
  if (program.archived) return false;
  if (program.priceModel === "MONTHLY" && !program.stripePriceId) return false;
  return true;
}
