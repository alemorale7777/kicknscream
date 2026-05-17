import { cn } from "@/lib/utils";

/**
 * Decorative chalk-line grid background — the pitch metaphor.
 * Faded toward edges via radial mask. Pure CSS, no JS, no images.
 */
export function ChalkGrid({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "dense";
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 opacity-60",
        variant === "dense" ? "bg-chalk-grid-sm" : "bg-chalk-grid",
        "[mask-image:radial-gradient(ellipse_at_center,black_0%,black_45%,transparent_85%)]",
        className
      )}
    />
  );
}

/**
 * A subtle flood-light radial glow that reads as stadium lighting.
 * Place absolutely-positioned over hero/auth surfaces.
 */
export function Floodlight({
  className,
  intensity = "soft",
}: {
  className?: string;
  intensity?: "soft" | "bright";
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0",
        intensity === "bright"
          ? "bg-[radial-gradient(ellipse_at_top,var(--color-turf-400)/0.18,transparent_55%)]"
          : "bg-[radial-gradient(ellipse_at_top,rgba(31,182,99,0.10),transparent_60%)]",
        className
      )}
    />
  );
}
