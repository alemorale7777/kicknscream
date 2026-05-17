/**
 * Lightweight inline-SVG sparkline. No external chart dep — keeps bundle tight
 * and renders identically server-side.
 */

export function Sparkline({
  values,
  width = 80,
  height = 24,
  stroke = "currentColor",
  fill,
  strokeWidth = 1.5,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
}) {
  if (values.length === 0) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-line)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / Math.max(values.length - 1, 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPath = fill
    ? `M0,${height} L${points.split(" ").join(" L")} L${width},${height} Z`
    : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {areaPath && <path d={areaPath} fill={fill} opacity={0.15} />}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={(values.length - 1) * stepX}
        cy={height - ((values[values.length - 1] - min) / range) * height}
        r={2}
        fill={stroke}
      />
    </svg>
  );
}

/**
 * Renders a percentage delta chip. Positive = lime (good), negative = red.
 * Neutral (0%) renders gray.
 */
export function DeltaChip({ pct }: { pct: number | null }) {
  if (pct === null || !Number.isFinite(pct)) {
    return (
      <span className="text-[10px] uppercase tracking-wider font-mono text-ink-700">
        —
      </span>
    );
  }
  const sign = pct > 0 ? "+" : "";
  const tone =
    pct > 0
      ? "text-turf-300 bg-turf-400/10 border-turf-400/30"
      : pct < 0
        ? "text-danger bg-danger/10 border-danger/30"
        : "text-ink-500 bg-pitch-700 border-line";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-mono font-medium ${tone}`}
    >
      {sign}
      {pct.toFixed(0)}%
    </span>
  );
}
