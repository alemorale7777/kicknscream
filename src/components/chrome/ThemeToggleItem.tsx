"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function ThemeToggleItem() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // useTheme() returns undefined during SSR / before next-themes hydrates.
  // Renders a stable placeholder until then to keep hydration clean.
  const ready = theme !== undefined;

  function cycle() {
    const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(next);
  }

  const label = !ready
    ? "Theme"
    : theme === "system"
      ? `System (${resolvedTheme})`
      : theme === "light"
        ? "Light"
        : "Dark";
  const Icon = !ready ? Monitor : theme === "light" ? Sun : theme === "system" ? Monitor : Moon;

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        if (ready) cycle();
      }}
      disabled={!ready}
      className="cursor-pointer flex items-center justify-between"
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" />
        Theme
      </span>
      <span className="text-[10px] uppercase tracking-wider text-ink-500">{label}</span>
    </DropdownMenuItem>
  );
}
