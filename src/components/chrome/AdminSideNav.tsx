"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Shield, Wallet, Activity, Download, Globe } from "lucide-react";
import type { Tenant } from "@prisma/client";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Team", icon: Users, segment: "team" },
  { label: "Permissions", icon: Shield, segment: "permissions" },
  { label: "Billing", icon: Wallet, segment: "billing" },
  { label: "Audit log", icon: Activity, segment: "audit" },
  { label: "Branding", icon: Globe, segment: "branding" },
  { label: "Exports", icon: Download, segment: "exports" },
] as const;

export function AdminSideNav({ tenant }: { tenant: Tenant }) {
  const pathname = usePathname() ?? "";
  return (
    <aside className="hidden lg:block sticky top-16 h-[calc(100vh-64px)] w-60 border-r border-line bg-pitch-900/60">
      <nav className="p-3 space-y-0.5">
        {ITEMS.map((it) => {
          const href = `/t/${tenant.slug}/admin/${it.segment}`;
          const active = pathname.startsWith(href);
          const Icon = it.icon;
          return (
            <Link
              key={it.segment}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-[120ms]",
                active
                  ? "bg-pitch-800 text-ink-50 border-l-2 border-flood-400 pl-[10px]"
                  : "text-ink-500 hover:bg-pitch-800/60 hover:text-ink-300"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/**
 * Horizontal scrolling pill nav for /admin/* on mobile. Renders below
 * the TopNav, sticky to the viewport. AdminSideNav stays desktop-only.
 */
export function AdminMobileNav({ tenant }: { tenant: Tenant }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="lg:hidden sticky top-16 z-30 border-b border-line bg-pitch-900/85 backdrop-blur-md overflow-x-auto">
      <div className="flex items-center gap-1 px-3 py-2 min-w-max">
        {ITEMS.map((it) => {
          const href = `/t/${tenant.slug}/admin/${it.segment}`;
          const active = pathname.startsWith(href);
          const Icon = it.icon;
          return (
            <Link
              key={it.segment}
              href={href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors duration-[120ms]",
                active
                  ? "bg-pitch-700 text-ink-50 border border-flood-400/40"
                  : "text-ink-500 border border-transparent hover:bg-pitch-800/60 hover:text-ink-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
