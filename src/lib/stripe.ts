import Stripe from "stripe";
import { env } from "./env";

/**
 * Lazy Stripe singleton. Calling `getStripe()` when keys are missing or are
 * still the build-stub values throws — callers should gate via `stripeEnabled()`
 * before invoking.
 */
let cached: Stripe | null = null;

export function stripeEnabled(): boolean {
  const key = env.STRIPE_SECRET_KEY;
  return !!key && key.startsWith("sk_") && key.length > 20;
}

export function getStripe(): Stripe {
  if (cached) return cached;
  if (!stripeEnabled()) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment to enable payments."
    );
  }
  cached = new Stripe(env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
    appInfo: {
      name: "KickNScream",
      version: "0.1.0",
    },
  });
  return cached;
}
