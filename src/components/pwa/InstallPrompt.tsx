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
    <div className="sticky top-0 z-40 h-8 w-full border-b border-flood-400/30 bg-flood-400/[0.06] backdrop-blur-md">
      <div className="mx-auto h-full max-w-7xl px-4 flex items-center gap-3 text-xs">
        <Download className="h-3.5 w-3.5 text-flood-400 shrink-0" />
        <p className="flex-1 min-w-0 truncate text-ink-200">
          <span className="font-semibold text-ink-50">Install KickNScream</span>
          <span className="text-ink-500 hidden sm:inline">
            {" "}
            · One tap on your home screen, full-screen, offline-ready.
          </span>
        </p>
        <button
          type="button"
          onClick={install}
          className="px-2.5 py-1 rounded-md bg-flood-400 text-pitch-950 font-semibold text-[11px] hover:bg-flood-300 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flood-400 focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="h-6 w-6 rounded-md text-ink-500 hover:text-ink-50 hover:bg-pitch-700 transition-colors duration-[120ms] flex items-center justify-center shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
