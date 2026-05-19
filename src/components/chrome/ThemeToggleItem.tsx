"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggleItem() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // useTheme() returns undefined during SSR / before next-themes hydrates.
  // Hold the trigger label stable until then to keep hydration clean.
  const ready = theme !== undefined;
  const TriggerIcon = !ready
    ? Monitor
    : theme === "light"
      ? Sun
      : theme === "dark"
        ? Moon
        : Monitor;
  const triggerStatus = !ready
    ? "Theme"
    : theme === "system"
      ? `System (${resolvedTheme})`
      : theme === "light"
        ? "Light"
        : "Dark";

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer flex items-center gap-2">
        <TriggerIcon className="h-4 w-4" />
        <span>Theme</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-500">
          {triggerStatus}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={ready ? theme : undefined}
          onValueChange={(v) => setTheme(v)}
        >
          <DropdownMenuRadioItem value="light" className="gap-2">
            <Sun className="h-4 w-4" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2">
            <Moon className="h-4 w-4" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2">
            <Monitor className="h-4 w-4" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
