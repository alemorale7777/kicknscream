"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

/**
 * Next.js wraps unhandled render errors with a fallback. We forward the
 * error to Sentry (where Sentry is configured) and present a tiny dark-
 * themed shell instead of the default white error screen.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#0A1410",
          color: "#F5F7F4",
          fontFamily: "-apple-system, system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#94A39B",
              margin: 0,
            }}
          >
            Something broke
          </p>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "8px 0 12px",
            }}
          >
            We&apos;re on it.
          </h1>
          <p style={{ color: "#C4CDC7", lineHeight: 1.6, margin: "0 0 20px" }}>
            The error has been reported. Try refreshing — and if it keeps
            happening, message your coach so they can flag it.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 11,
                color: "#5A6A62",
                fontFamily: "ui-monospace, monospace",
                margin: "0 0 24px",
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <Link
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 8,
              background: "#1FB663",
              color: "#0A1410",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Back to home
          </Link>
        </div>
      </body>
    </html>
  );
}
