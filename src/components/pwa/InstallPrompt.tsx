"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "kns.pwa-dismissed-at";
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isDismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (Number.isNaN(at)) return false;
    return Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  } catch {
    // ignore — private browsing / quota errors are non-critical
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (isDismissedRecently()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible || !deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "dismissed") markDismissed();
    setDeferred(null);
    setVisible(false);
  }

  function dismiss() {
    markDismissed();
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Install KickNScream as an app"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-[340px] z-40 rounded-lg border border-flood-400/30 bg-pitch-800/95 backdrop-blur-md shadow-2xl shadow-pitch-950/60 p-3.5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute right-2 top-2 h-6 w-6 rounded-md text-ink-500 hover:text-ink-50 hover:bg-pitch-700 transition-colors duration-[120ms] flex items-center justify-center"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="h-8 w-8 rounded-md bg-flood-400/15 text-flood-400 flex items-center justify-center shrink-0">
          <Download className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-50">Install KickNScream</p>
          <p className="text-xs text-ink-500 mt-0.5">
            One tap to your home screen — full-screen, offline-ready.
          </p>
          <button
            type="button"
            onClick={install}
            className="mt-2 px-3 py-1.5 rounded-md bg-flood-400 text-pitch-950 font-semibold text-xs hover:bg-flood-300 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flood-400 focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900"
          >
            Install app
          </button>
        </div>
      </div>
    </div>
  );
}
