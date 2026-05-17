"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const handler = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Service worker is non-critical; ignore failures silently.
        });
    };
    if (document.readyState === "complete") {
      handler();
    } else {
      window.addEventListener("load", handler, { once: true });
      return () => window.removeEventListener("load", handler);
    }
  }, []);

  return null;
}
