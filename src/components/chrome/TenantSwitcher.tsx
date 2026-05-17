"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TenantType } from "@prisma/client";

type AvailableTenant = {
  id: string;
  slug: string;
  name: string;
  type: TenantType;
};

const TYPE_VARIANT: Record<TenantType, "turf" | "flood" | "danger"> = {
  COACH: "turf",
  INSTITUTION: "flood",
  CLUB: "danger",
};

export function TenantSwitcher({
  current,
  available,
}: {
  current: AvailableTenant;
  available: AvailableTenant[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "group flex items-center gap-2.5 rounded-md border border-line bg-pitch-800/80 px-3 py-1.5",
          "transition-colors duration-[120ms] hover:bg-pitch-700 hover:border-turf-400/40",
          "focus-visible:outline-none focus-visible:border-turf-400 focus-visible:ring-2 focus-visible:ring-turf-400/30"
        )}
      >
        <span className="font-semibold text-sm text-ink-50 truncate max-w-[160px]">{current.name}</span>
        <Badge variant={TYPE_VARIANT[current.type]}>{current.type.toLowerCase()}</Badge>
        <ChevronsUpDown className="h-3.5 w-3.5 text-ink-500 group-hover:text-ink-300" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Your tenants</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map((t) => (
          <DropdownMenuItem key={t.id} asChild>
            <Link
              href={`/t/${t.slug}/dashboard`}
              className="flex justify-between items-center cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                {t.id === current.id ? (
                  <Check className="h-4 w-4 text-turf-400 shrink-0" />
                ) : (
                  <span className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate text-ink-50">{t.name}</span>
              </span>
              <Badge variant={TYPE_VARIANT[t.type]}>{t.type.toLowerCase()}</Badge>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding" className="cursor-pointer text-turf-300 focus:text-turf-200">
            <Plus className="h-4 w-4" />
            Create new tenant
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
