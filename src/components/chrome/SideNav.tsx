"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavForRole, navForTenantType, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { Tenant, Role } from "@prisma/client";

/**
 * `badges` is a small map keyed by the lowercased final nav-item label
 * ({"messages": 3}). Keeps the contract simple — no need to thread feature
 * keys through navForTenantType — and matches by lowercase so callers
 * don't have to care about display casing.
 */
export function SideNav({
  tenant,
  role,
  badges,
}: {
  tenant: Tenant;
  role?: Role;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const items = navForTenantType(tenant.type, tenant.slug);
  const adminItems = role ? adminNavForRole(role, tenant.slug) : [];

  const renderItem = (item: NavItem) => {
    const active =
      item.href === `/t/${tenant.slug}/coach/dashboard`
        ? pathname === item.href
        : pathname?.startsWith(item.href);
    const Icon = item.icon;
    const badgeCount = badges?.[item.label.toLowerCase()] ?? 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
          "transition-[background,color,border-color] duration-[120ms]",
          active
            ? "bg-turf-400/10 text-turf-300 border-l-2 border-turf-400 pl-[10px]"
            : "text-ink-300 hover:text-ink-50 hover:bg-pitch-800"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active && "text-turf-300")} />
        <span className="truncate flex-1">{item.label}</span>
        {badgeCount > 0 && (
          <span
            aria-label={`${badgeCount} unread`}
            className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-turf-400 text-pitch-950 text-[10px] font-mono font-semibold tabular-nums"
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex sticky top-16 h-[calc(100vh-64px)] w-60 shrink-0 border-r border-line bg-pitch-900 flex-col">
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {items.map(renderItem)}

        {adminItems.length > 0 && (
          <div className="pt-4 mt-4 border-t border-line space-y-1">
            <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-ink-500 font-medium">
              Admin
            </p>
            {adminItems.map(renderItem)}
          </div>
        )}
      </nav>
    </aside>
  );
}
