"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Building2, MapPin, Users, AlertTriangle, Wallet, Bell } from "lucide-react";
import type { Tenant } from "@prisma/client";

export function SettingsNav({
  tenant,
  isOwner,
  canManage,
}: {
  tenant: Tenant;
  isOwner: boolean;
  /** True for OWNER/ADMIN — gates rows that resolve to admin-shell routes. */
  canManage?: boolean;
}) {
  const pathname = usePathname();
  const base = `/t/${tenant.slug}/coach/settings`;
  const adminBase = `/t/${tenant.slug}/admin`;

  type Item = {
    href: string;
    label: string;
    icon: typeof Building2;
    danger?: boolean;
    /** Hint that the row jumps to the admin shell — rendered as an "Admin" pill. */
    admin?: boolean;
  };

  const items: Item[] = [
    { href: base, label: "Tenant info", icon: Building2 },
    ...(tenant.type !== "COACH"
      ? [{ href: `${base}/locations`, label: "Locations", icon: MapPin }]
      : []),
    // Billing surface lives at /admin/billing. Only render this row to
    // OWNER/ADMIN — non-managers would bounce off the portal gate.
    ...(canManage
      ? [{ href: `${adminBase}/billing`, label: "Billing", icon: Wallet, admin: true }]
      : []),
    { href: `${base}/team`, label: "Team", icon: Users },
    { href: `${base}/notifications`, label: "Notifications", icon: Bell },
    ...(isOwner
      ? [{ href: `${base}/danger`, label: "Danger zone", icon: AlertTriangle, danger: true }]
      : []),
  ];

  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        const isDanger = item.danger === true;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
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
            <span className="flex-1">{item.label}</span>
            {item.admin && (
              <span className="inline-flex items-center rounded bg-pitch-700 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-ink-300 font-medium">
                Admin
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
