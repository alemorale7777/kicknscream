"use client";

import { useEffect } from "react";
import { identify } from "@/lib/analytics";

/**
 * Mounts once per shell with the signed-in user's id so PostHog ties
 * subsequent events to a stable distinct_id. Drops silently when
 * NEXT_PUBLIC_POSTHOG_KEY isn't set.
 *
 * Deliberately runs as a microtask-deferred effect to play nice with
 * React Compiler's set-state-in-effect rule (identify itself is a side
 * effect, not a setState, so we don't even need the workaround — but
 * the pattern stays consistent with other client effects in this
 * codebase).
 */
export function Identify({
  userId,
  email,
  name,
}: {
  userId: string;
  email?: string | null;
  name?: string | null;
}) {
  useEffect(() => {
    identify(userId, {
      email: email ?? undefined,
      name: name ?? undefined,
    });
  }, [userId, email, name]);
  return null;
}
