/**
 * Pitch & Floodlight — typed design tokens.
 *
 * The CSS-side source of truth lives in `src/app/globals.css` `@theme`.
 * This module mirrors those values for JS consumers (chart libraries,
 * dynamic styling, design-system docs) so we keep a single semantic map.
 *
 * Spec note: brand.lime (#D8FF3D) and brand.green (#1FB663) from the
 * Engineering Upgrade Spec alias to flood.400 and turf.400 — perceptually
 * identical, no second yellow introduced.
 */

export const colors = {
  pitch: {
    950: "#050A07",
    900: "#0A1410",
    800: "#0F1C17",
    700: "#16261F",
    600: "#1F362C",
    500: "#2C4A3D",
  },
  turf: {
    50: "#E8FBF1",
    100: "#C3F5D8",
    200: "#88EAB1",
    300: "#4DDF8A",
    400: "#1FB663",
    500: "#189651",
    600: "#117540",
    700: "#0B5530",
  },
  flood: {
    200: "#F5FF99",
    300: "#EEFF66",
    400: "#E8FF3C",
    500: "#CFE52C",
  },
  ink: {
    50: "#F5F7F4",
    300: "#C4CDC7",
    500: "#94A39B",
    700: "#5A6A62",
  },
  chalk: "rgba(255, 255, 255, 0.08)",
  line: "rgba(255, 255, 255, 0.14)",
  status: {
    danger: "#FF4D4D",
    warn: "#FFB347",
    success: "#1FB663",
    info: "#4DDF8A",
  },
  brand: {
    lime: "#E8FF3C",
    green: "#1FB663",
  },
} as const;

export const spacing = {
  px1: 4,
  px2: 8,
  px3: 12,
  px4: 16,
  px6: 24,
  px8: 32,
  px12: 48,
  px16: 64,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

export const elevation = {
  sm: "0 1px 0 0 rgba(255,255,255,0.04) inset",
  md: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 6px 18px -8px rgba(0,0,0,0.6)",
  lg: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 18px 48px -16px rgba(0,0,0,0.7)",
} as const;

export const typography = {
  fontFamily: {
    sans: 'var(--font-geist-sans), "Inter", system-ui, -apple-system, sans-serif',
    mono: 'var(--font-geist-mono), "JetBrains Mono", ui-monospace, monospace',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
    "5xl": 48,
    "6xl": 60,
    "7xl": 72,
  },
  letterSpacing: {
    tight: "-0.02em",
    tighter: "-0.03em",
    snug: "-0.04em",
    wide: "0.2em",
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
} as const;

export const motion = {
  ease: {
    snap: "cubic-bezier(0.2, 0, 0, 1)",
  },
  duration: {
    fast: 120,
    base: 180,
    slow: 260,
  },
} as const;

export type Tokens = {
  colors: typeof colors;
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  typography: typeof typography;
  motion: typeof motion;
};

export const tokens: Tokens = {
  colors,
  spacing,
  radius,
  elevation,
  typography,
  motion,
};
