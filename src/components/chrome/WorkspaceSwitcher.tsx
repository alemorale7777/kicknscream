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
import { ChevronsUpDown, Plus, Check, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";
import type { TenantType, Role } from "@prisma/client";

type Workspace = {
  id: string;
  slug: string;
  name: string;
  type: TenantType;
  role: Role;
};

const TYPE_VARIANT: Record<TenantType, "turf" | "flood" | "danger"> = {
  COACH: "turf",
  INSTITUTION: "flood",
  CLUB: "danger",
};

const ROLE_TONE: Record<Role, string> = {
  OWNER: "bg-flood-400/15 text-flood-400 border-flood-400/40",
  ADMIN: "bg-turf-400/15 text-turf-300 border-turf-400/40",
  COACH: "bg-turf-400/10 text-turf-300 border-turf-400/30",
  PARENT: "bg-pitch-700 text-ink-300 border-line",
  PLAYER: "bg-pitch-700 text-ink-500 border-line",
};

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: Workspace;
  workspaces: Workspace[];
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
        <span className="font-semibold text-sm text-ink-50 truncate max-w-[160px]">
          {current.name}
        </span>
        <Badge variant={TYPE_VARIANT[current.type]}>{current.type.toLowerCase()}</Badge>
        <span
          className={cn(
            "hidden sm:inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wider",
            ROLE_TONE[current.role]
          )}
        >
          <Shield className="h-2.5 w-2.5" />
          {roleLabel(current.role)}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-ink-500 group-hover:text-ink-300" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Your workspaces</span>
          <span className="text-[10px] font-normal text-ink-500 normal-case tracking-normal">
            {workspaces.length}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link
              href={`/t/${w.slug}/dashboard`}
              className="flex justify-between items-center cursor-pointer gap-2"
            >
              <span className="flex items-center gap-2 truncate flex-1 min-w-0">
                {w.id === current.id ? (
                  <Check className="h-4 w-4 text-turf-400 shrink-0" />
                ) : (
                  <span className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate text-ink-50">{w.name}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <Badge variant={TYPE_VARIANT[w.type]} className="text-[9px]">
                  {w.type.toLowerCase()}
                </Badge>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] uppercase tracking-wider",
                    ROLE_TONE[w.role]
                  )}
                >
                  {roleLabel(w.role)}
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href="/onboarding"
            className="cursor-pointer text-turf-300 focus:text-turf-200"
          >
            <Plus className="h-4 w-4" />
            Create new workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
