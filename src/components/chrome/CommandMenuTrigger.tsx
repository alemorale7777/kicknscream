"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Settings,
  GraduationCap,
  ClipboardList,
  Wallet,
  MessageSquare,
  Trophy,
  Search,
  Plus,
  ExternalLink,
  Command as CommandIcon,
  Wand2,
} from "lucide-react";
import type { TenantType } from "@prisma/client";
import { cn } from "@/lib/utils";

type ActionGroup = {
  label: string;
  items: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    keywords?: string[];
  }>;
};

function actionsFor(slug: string, type: TenantType): ActionGroup[] {
  // Portal-scoped under /coach/* — all operator UI lives there after the
  // Phase B route split.
  const base = `/t/${slug}/coach`;
  const navigation: ActionGroup = {
    label: "Navigation",
    items: [
      { label: "Dashboard", href: `${base}/dashboard`, icon: LayoutDashboard, keywords: ["home"] },
      { label: "Schedule", href: `${base}/schedule`, icon: Calendar, keywords: ["calendar", "events"] },
      { label: "Players", href: `${base}/roster`, icon: Users, keywords: ["roster"] },
      { label: "Bookings", href: `${base}/bookings`, icon: ClipboardList, keywords: ["registrations"] },
      { label: "Services", href: `${base}/programs`, icon: GraduationCap, keywords: ["programs"] },
      { label: "Payments", href: `${base}/payments`, icon: Wallet, keywords: ["invoices", "money"] },
      { label: "Messages", href: `${base}/messages`, icon: MessageSquare, keywords: ["email", "broadcast", "threads"] },
      { label: "Notes", href: `${base}/notes`, icon: ClipboardList, keywords: ["session notes", "writeups"] },
      { label: "Reports", href: `${base}/reports`, icon: Trophy, keywords: ["kpi", "metrics"] },
      { label: "Settings", href: `${base}/settings`, icon: Settings, keywords: ["billing", "team", "branding"] },
    ],
  };
  if (type === "CLUB") {
    navigation.items.push(
      { label: "Tryouts", href: `${base}/tryouts`, icon: Search, keywords: ["recruiting"] },
      { label: "Development", href: `${base}/development`, icon: Trophy, keywords: ["notes", "stars"] }
    );
  }
  const quick: ActionGroup = {
    label: "Quick actions",
    items: [
      { label: "Add a player", href: `${base}/roster?new=1`, icon: Plus, keywords: ["create"] },
      { label: "New event", href: `${base}/schedule?new=1`, icon: Plus, keywords: ["create"] },
      { label: "New service", href: `${base}/programs?new=1`, icon: Plus, keywords: ["create", "program"] },
      { label: "Send broadcast", href: `${base}/comms`, icon: Wand2, keywords: ["email"] },
      { label: "View public page", href: `/${slug}`, icon: ExternalLink, keywords: ["public", "preview"] },
    ],
  };
  return [navigation, quick];
}

export function CommandMenuTrigger({
  tenantSlug,
  tenantType,
}: {
  tenantSlug: string;
  tenantType: TenantType;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  // Suppress on the family portal even for multi-role users — the palette
  // is a coach tool, the parent surfaces have their own bottom-tab nav.
  const onFamilyPortal = /^\/t\/[^/]+\/family(\/|$)/.test(pathname);

  useEffect(() => {
    if (onFamilyPortal) return;
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFamilyPortal]);

  if (onFamilyPortal) return null;

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  const groups = actionsFor(tenantSlug, tenantType);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "hidden sm:inline-flex items-center gap-2 rounded-md border border-line bg-pitch-800/80 px-2.5 py-1.5",
          "text-xs text-ink-500 hover:text-ink-300 hover:bg-pitch-700 hover:border-turf-400/40",
          "transition-colors duration-[120ms]",
          "focus-visible:outline-none focus-visible:border-turf-400 focus-visible:ring-2 focus-visible:ring-turf-400/30"
        )}
        aria-label="Open command menu"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Go to…</span>
        <span className="ml-2 inline-flex items-center gap-0.5 rounded border border-line bg-pitch-900 px-1 py-0.5 font-mono text-[10px] text-ink-500">
          <CommandIcon className="h-2.5 w-2.5" />K
        </span>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sm:hidden h-9 w-9 rounded-md border border-line bg-pitch-800/80 text-ink-300 hover:text-ink-50 hover:bg-pitch-700 transition-colors duration-[120ms] flex items-center justify-center"
        aria-label="Open command menu"
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-12"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed inset-0 bg-pitch-950/80 backdrop-blur-sm"
            aria-hidden
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-2xl"
          >
            <Command
              label="Command menu"
              className="rounded-lg border border-line bg-pitch-800 shadow-2xl shadow-pitch-950/60 overflow-hidden"
            >
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search className="h-4 w-4 text-ink-500 shrink-0" />
                <Command.Input
                  placeholder="Go to a page…"
                  className="flex-1 bg-transparent py-3 text-sm text-ink-50 placeholder:text-ink-500 outline-none"
                  autoFocus
                />
                <kbd className="hidden sm:inline-flex items-center rounded border border-line bg-pitch-900 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                  esc
                </kbd>
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-sm text-ink-500">
                  No matches.
                </Command.Empty>
                {groups.map((g) => (
                  <Command.Group
                    key={g.label}
                    heading={g.label}
                    className="text-[10px] uppercase tracking-wider text-ink-500 px-2 py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                  >
                    {g.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Command.Item
                          key={item.href}
                          value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
                          onSelect={() => navigate(item.href)}
                          className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-ink-300 cursor-pointer data-[selected=true]:bg-turf-400/15 data-[selected=true]:text-ink-50 transition-colors duration-[60ms]"
                        >
                          <Icon className="h-4 w-4 text-ink-500" />
                          <span>{item.label}</span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ))}
              </Command.List>
              <div className="border-t border-line px-3 py-2 text-[10px] text-ink-500 flex items-center justify-between">
                <span>
                  <kbd className="font-mono">↑↓</kbd> to navigate ·{" "}
                  <kbd className="font-mono">↵</kbd> to select
                </span>
                <span className="font-mono">⌘K to toggle</span>
              </div>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
