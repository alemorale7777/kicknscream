"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Building2, MapPin, Users, AlertTriangle } from "lucide-react";
import type { Tenant } from "@prisma/client";

export function SettingsNav({ tenant, isOwner }: { tenant: Tenant; isOwner: boolean }) {
  const pathname = usePathname();
  const base = `/t/${tenant.slug}/settings`;

  const items = [
    { href: base, label: "Tenant info", icon: Building2 },
    ...(tenant.type !== "COACH" ? [{ href: `${base}/locations`, label: "Locations", icon: MapPin }] : []),
    { href: `${base}/team`, label: "Team", icon: Users },
    ...(isOwner ? [{ href: `${base}/danger`, label: "Danger zone", icon: AlertTriangle, danger: true }] : []),
  ];

  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        const isDanger = "danger" in item && item.danger;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-[120ms]",
              active
                ? isDanger
                  ? "bg-danger/10 text-danger border-l-2 border-danger pl-[10px]"
                  : "bg-turf-400/10 text-turf-300 border-l-2 border-turf-400 pl-[10px]"
                : isDanger
                  ? "text-ink-500 hover:text-danger hover:bg-danger/5"
                  : "text-ink-300 hover:text-ink-50 hover:bg-pitch-800"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
