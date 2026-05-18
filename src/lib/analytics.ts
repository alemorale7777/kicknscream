/**
 * Thin wrapper over PostHog. Lives behind a typed `track()` function so
 * callsites don't bind to posthog-js directly — makes it cheap to swap or
 * mock for tests.
 *
 * All initialization is gated on NEXT_PUBLIC_POSTHOG_KEY. Absent key =
 * no-op, both client and server, so local/dev without analytics doesn't
 * throw.
 */
import type { PostHog } from "posthog-js";

/**
 * Canonical funnel + product events. Keep the union closed so typos at
 * callsites become compile errors and PostHog dashboards stay clean.
 */
export type AnalyticsEvent =
  | "booking_started"
  | "booking_completed"
  | "booking_canceled"
  | "attendance_marked"
  | "broadcast_sent"
  | "message_sent"
  | "program_created"
  | "program_published"
  | "waiver_signed"
  | "calendar_subscribed"
  | "team_invited"
  | "stripe_connect_started";

type Properties = Record<string, string | number | boolean | null | undefined>;

let client: PostHog | null = null;
let attempted = false;

async function getClient(): Promise<PostHog | null> {
  if (typeof window === "undefined") return null;
  if (client) return client;
  if (attempted) return null;
  attempted = true;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  const { default: posthog } = await import("posthog-js");
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // we'd rather hand-pick the events we record.
    persistence: "localStorage+cookie",
  });
  client = posthog;
  return posthog;
}

/**
 * Fire-and-forget event capture. Resolves immediately when PostHog isn't
 * configured, so calls don't block the user-facing path. Server-side
 * callers (server actions) should pass `serverFlush: true` to make sure
 * the event lands before the lambda exits.
 */
export async function track(event: AnalyticsEvent, properties?: Properties) {
  const c = await getClient();
  if (!c) return;
  try {
    c.capture(event, properties);
  } catch {
    // Telemetry is non-critical — swallow any client init failures.
  }
}

/**
 * Associate the current PostHog session with a signed-in user. Called from
 * the user menu / shell once we have the session.
 */
export async function identify(userId: string, properties?: Properties) {
  const c = await getClient();
  if (!c) return;
  try {
    c.identify(userId, properties);
  } catch {
    // ignore
  }
}

export async function reset() {
  const c = await getClient();
  if (!c) return;
  try {
    c.reset();
  } catch {
    // ignore
  }
}
