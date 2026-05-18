"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/**
 * Fires `booking_completed` once on mount. Mounted by the success page so
 * we only count completions that actually rendered the confirmation, not
 * pending or canceled checkouts.
 */
export function BookingCompletedBeacon({
  invoiceId,
  amountCents,
  pending,
}: {
  invoiceId: string | null;
  amountCents: number | null;
  pending: boolean;
}) {
  useEffect(() => {
    track("booking_completed", {
      invoiceId: invoiceId ?? undefined,
      amountCents: amountCents ?? undefined,
      pending,
    });
  }, [invoiceId, amountCents, pending]);
  return null;
}
