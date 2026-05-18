import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook. Runs once per runtime (node, edge) at boot
 * and gives us a place to init server-side observability. Only fires when
 * a Sentry DSN is present, so local/dev with no Sentry config is a no-op.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Surfaces server-side route, action, and fetch errors to Sentry. Next 16
 * calls this for unhandled errors in RSCs, route handlers, and server
 * actions — without it those drop straight to a 500 with nothing reported.
 */
export const onRequestError = Sentry.captureRequestError;
