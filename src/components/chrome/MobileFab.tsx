"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Calendar,
  Users,
  GraduationCap,
  MessageSquare,
  X,
} from "lucide-react";

/**
 * Mobile-only quick-action FAB on coach surfaces. Desktop users have ⌘K;
 * this is the touch equivalent — a single bottom-right button that fans
 * out a tiny sheet of create-actions: new event, new player, new
 * service, new broadcast.
 *
 * Each action deep-links into the matching list page with ?new=1 (or in
 * the broadcast case, ?new=broadcast on /coach/messages) so the
 * destination page auto-opens its New dialog on mount.
 */
export function MobileFab({ tenantSlug }: { tenantSlug: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const base = `/t/${tenantSlug}/coach`;
  const actions = [
    {
      label: "New event",
      icon: Calendar,
      href: `${base}/schedule?new=1`,
    },
    {
      label: "Add a player",
      icon: Users,
      href: `${base}/roster?new=1`,
    },
    {
      label: "New service",
      icon: GraduationCap,
      href: `${base}/programs?new=1`,
    },
    {
      label: "Send broadcast",
      icon: MessageSquare,
      href: `${base}/messages?new=broadcast`,
    },
  ];

  return (
    <>
      {open && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close quick actions"
          className="md:hidden fixed inset-0 z-40 bg-pitch-950/60 backdrop-blur-sm"
        />
      )}

      {open && (
        <div className="md:hidden fixed bottom-24 right-4 z-50 flex flex-col gap-2 items-end">
          {actions.map(({ label, icon: Icon, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-2.5 rounded-full border border-line bg-pitch-800 px-4 py-2.5 text-sm font-medium text-ink-50 shadow-xl shadow-pitch-950/40 hover:bg-pitch-700 active:scale-[0.98] transition-all duration-[120ms]"
            >
              <span className="h-7 w-7 rounded-full bg-turf-400/15 text-turf-300 flex items-center justify-center">
                <Icon className="h-3.5 w-3.5" />
              </span>
              {label}
            </Link>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        aria-expanded={open}
        className="md:hidden fixed bottom-6 right-4 z-50 h-14 w-14 rounded-full bg-turf-400 text-pitch-950 shadow-2xl shadow-pitch-950/50 flex items-center justify-center transition-transform duration-[150ms] active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-turf-400 focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900"
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </>
  );
}
