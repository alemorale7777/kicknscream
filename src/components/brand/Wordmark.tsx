import { cn } from "@/lib/utils";

type WordmarkSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<WordmarkSize, { font: number; dot: string; gap: string }> = {
  sm: { font: 16, dot: "h-1 w-1", gap: "gap-1" },
  md: { font: 22, dot: "h-1.5 w-1.5", gap: "gap-1.5" },
  lg: { font: 32, dot: "h-2 w-2", gap: "gap-2" },
  xl: { font: 56, dot: "h-3 w-3", gap: "gap-2.5" },
};

export function Wordmark({
  size = "md",
  className,
}: {
  size?: WordmarkSize;
  className?: string;
}) {
  const cfg = SIZE_PX[size];
  return (
    <div
      className={cn("flex items-end select-none text-ink-50", cfg.gap, className)}
      aria-label="KickNScream"
    >
      <span
        style={{
          fontSize: cfg.font,
          fontWeight: 800,
          letterSpacing: "-0.045em",
          lineHeight: 1,
          fontFamily: "var(--font-sans)",
        }}
      >
        KICK<span className="text-turf-400">N</span>SCREAM
      </span>
      <span
        aria-hidden
        className={cn("rounded-full bg-flood-400 shadow-[0_0_18px_-2px_var(--color-flood-400)]", cfg.dot)}
      />
    </div>
  );
}
