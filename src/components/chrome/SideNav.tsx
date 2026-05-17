"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navForTenantType } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { Tenant, Role } from "@prisma/client";

export function SideNav({ tenant }: { tenant: Tenant; role?: Role }) {
  const pathname = usePathname();
  const items = navForTenantType(tenant.type, tenant.slug);

  return (
    <aside className="hidden lg:flex sticky top-16 h-[calc(100vh-64px)] w-60 shrink-0 border-r border-line bg-pitch-900 flex-col">
      <nav className="flex-1 p-4 space-y-1">
        {items.map((item) => {
          const active =
            item.href === `/t/${tenant.slug}/dashboard`
              ? pathname === item.href
              : pathname?.startsWith(item.href);
          const Icon = item.icon;
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
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-line">
        <div className="rounded-md bg-pitch-800 border border-line p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-flood-400">Sprint 1</p>
          <p className="text-xs text-ink-300 leading-relaxed">
            Foundation shipped. Calendar & roster land in Sprint 2.
          </p>
        </div>
      </div>
    </aside>
  );
}
