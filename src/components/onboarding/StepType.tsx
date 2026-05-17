"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TenantType } from "@prisma/client";
import { User, GraduationCap, Trophy, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  {
    type: "COACH" as const,
    title: "I'm a coach",
    desc: "Private lessons, small groups, my own clients.",
    detail: "Booking page · session notes · packages",
    Icon: User,
    tone: "turf",
  },
  {
    type: "INSTITUTION" as const,
    title: "I run an institution",
    desc: "Academy or skills center with multiple coaches, programs, parents.",
    detail: "Programs · attendance · payments · multi-location",
    Icon: GraduationCap,
    tone: "flood",
  },
  {
    type: "CLUB" as const,
    title: "I run a club",
    desc: "Competitive teams, tryouts, season fees, player development.",
    detail: "Teams · tryouts · development tracker · season management",
    Icon: Trophy,
    tone: "danger",
  },
] as const;

const TONE_CLASSES: Record<"turf" | "flood" | "danger", { bg: string; text: string; border: string; ring: string }> = {
  turf: {
    bg: "bg-turf-400/10",
    text: "text-turf-300",
    border: "border-turf-400/40",
    ring: "hover:border-turf-400 hover:shadow-[0_0_30px_-8px_var(--color-turf-400)]",
  },
  flood: {
    bg: "bg-flood-400/10",
    text: "text-flood-400",
    border: "border-flood-400/40",
    ring: "hover:border-flood-400 hover:shadow-[0_0_30px_-8px_var(--color-flood-400)]",
  },
  danger: {
    bg: "bg-danger/10",
    text: "text-danger",
    border: "border-danger/40",
    ring: "hover:border-danger hover:shadow-[0_0_30px_-8px_var(--color-danger)]",
  },
};

export function StepType({
  value,
  onNext,
}: {
  value?: TenantType;
  onNext: (t: TenantType) => void;
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em] text-balance">
          What are you building?
        </h1>
        <p className="text-ink-300 text-base max-w-xl">
          Pick the one that fits. You can run more than one tenant from a single account later.
        </p>
      </header>

      <div className="grid gap-3">
        {OPTIONS.map(({ type, title, desc, detail, Icon, tone }) => {
          const t = TONE_CLASSES[tone];
          const selected = value === type;
          return (
            <button
              key={type}
              onClick={() => onNext(type)}
              className={cn(
                "group text-left transition-all duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)]",
                "focus-visible:outline-none rounded-lg"
              )}
            >
              <Card
                className={cn(
                  "p-5 flex items-center gap-5 cursor-pointer",
                  "transition-[border-color,box-shadow,transform] duration-[180ms]",
                  selected ? t.border : "border-line",
                  t.ring,
                  "group-active:scale-[0.99]"
                )}
              >
                <div
                  className={cn(
                    "h-14 w-14 rounded-md flex items-center justify-center shrink-0 transition-colors",
                    t.bg,
                    t.text
                  )}
                >
                  <Icon className="h-7 w-7" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="font-semibold text-ink-50 text-lg">{title}</div>
                  <div className="text-sm text-ink-300">{desc}</div>
                  <div className={cn("text-xs uppercase tracking-wider mt-1.5", t.text)}>{detail}</div>
                </div>
                <ArrowRight className="h-5 w-5 text-ink-500 group-hover:text-ink-50 transition-colors shrink-0" />
              </Card>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-ink-500">
        Not sure? Pick what's closest — you can rename, restructure, or migrate later. Nothing is locked in.
      </p>
    </div>
  );
}

export { Button as _Button }; // keep tree-shake-safe export so onNext typing stays minimal
