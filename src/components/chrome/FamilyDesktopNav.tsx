"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, BookOpen, Wallet, User, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Parent-side horizontal nav at lg+ viewports. The mobile experience
 * uses FamilyBottomTabs (lg:hidden); at desktop the bottom tab bar
 * disappears and parents had no way to move between Home / Schedule /
 * Book / Pay / Kids / Forms without typing URLs.
 *
 * Renders below the TopNav, sticky to the viewport.
 */
export function FamilyDesktopNav({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/t/${slug}/family`;
  const items = [
    { href: `${base}/home`, icon: Home, label: "Home" },
    { href: `${base}/schedule`, icon: Calendar, label: "Schedule" },
    { href: `${base}/book`, icon: BookOpen, label: "Book" },
    { href: `${base}/pay`, icon: Wallet, label: "Pay" },
    { href: `${base}/forms`, icon: ScrollText, label: "Forms" },
    { href: `${base}/kids`, icon: User, label: "Kids" },
  ];

  return (
    <nav className="hidden lg:block sticky top-16 z-30 border-b border-line bg-pitch-900/85 backdrop-blur-md">
      <div className="max-w-5xl mx-auto flex items-center gap-1 px-6 py-2">
        {items.map((it) => {
          // Active = exact match or sub-page (so /family/kids/[id] keeps
          // the "Kids" tab highlighted).
          const active =
            pathname === it.href || pathname.startsWith(`${it.href}/`);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors duration-[120ms]",
                active
                  ? "bg-pitch-800 text-ink-50 border border-turf-400/40"
                  : "text-ink-500 border border-transparent hover:bg-pitch-800/60 hover:text-ink-300"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
