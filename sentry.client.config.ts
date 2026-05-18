import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Tracing is opt-in here — we surface errors first, performance later.
    tracesSampleRate: 0.1,
    // Drop replays for now; revisit when we have a use case beyond crashes.
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
