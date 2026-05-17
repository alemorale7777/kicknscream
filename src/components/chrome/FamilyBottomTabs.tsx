"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, BookOpen, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function FamilyBottomTabs({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/t/${slug}/family`;
  const tabs = [
    { href: `${base}/home`, icon: Home, label: "Home" },
    { href: `${base}/schedule`, icon: Calendar, label: "Schedule" },
    { href: `${base}/book`, icon: BookOpen, label: "Book" },
    { href: `${base}/pay`, icon: Wallet, label: "Pay" },
    { href: `${base}/kids`, icon: User, label: "Kids" },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 border-t border-line bg-pitch-900/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="h-full grid grid-cols-5">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors duration-[120ms]",
                active ? "text-turf-300" : "text-ink-500 hover:text-ink-300"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
