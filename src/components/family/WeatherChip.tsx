import {
  Sun,
  Cloud,
  CloudSun,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from "lucide-react";
import type { WeatherSummary } from "@/lib/weather";

const ICON_MAP: Record<string, LucideIcon> = {
  sun: Sun,
  cloud: Cloud,
  "cloud-sun": CloudSun,
  "cloud-fog": CloudFog,
  "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain,
  snowflake: CloudSnow,
  "cloud-lightning": CloudLightning,
};

/**
 * Inline weather chip for the next-session hero. Surfaces the forecast on a
 * single line: icon · label · high/low · "60% rain" when precip is meaningful.
 * Wet conditions get an amber tint so parents pre-scan the day.
 */
export function WeatherChip({ weather }: { weather: WeatherSummary }) {
  const Icon = ICON_MAP[weather.icon] ?? Cloud;
  const wet = weather.precipPct >= 40;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        wet
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-line bg-pitch-800 text-ink-300"
      }`}
      aria-label={`Forecast: ${weather.label}, high ${weather.high}°F, low ${weather.low}°F`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{weather.label}</span>
      <span className="text-ink-500">·</span>
      <span className="font-mono tabular-nums">
        {weather.high}° / {weather.low}°
      </span>
      {weather.precipPct >= 20 && (
        <>
          <span className="text-ink-500">·</span>
          <span className="font-mono tabular-nums">{weather.precipPct}% rain</span>
        </>
      )}
    </span>
  );
}
