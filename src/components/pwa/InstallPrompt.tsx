"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "kns.install-prompt.dismissed.v1";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (window.localStorage.getItem(DISMISSED_KEY)) return;

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
    if (choice.outcome === "dismissed") {
      try {
        window.localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // ignore
      }
    }
    setDeferred(null);
    setVisible(false);
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <Card className="pointer-events-auto max-w-md w-full border-flood-400/40 bg-pitch-800/95 backdrop-blur-md p-4 flex items-center gap-3 shadow-xl shadow-pitch-950/50">
        <div className="h-9 w-9 rounded-md bg-flood-400/15 text-flood-400 flex items-center justify-center shrink-0">
          <Download className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-50">Install KickNScream</p>
          <p className="text-xs text-ink-500 truncate">
            One tap on the home screen — like a real app.
          </p>
        </div>
        <Button variant="accent" size="sm" onClick={install}>
          Install
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="h-9 w-9 rounded-md text-ink-500 hover:text-ink-50 hover:bg-pitch-700 transition-colors duration-[120ms] flex items-center justify-center shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </Card>
    </div>
  );
}
