# Pitch & Floodlight — Design Tokens

The KickNScream visual identity. Locked in Sprint 1; every later sprint inherits.

## Palette

| Role | Token | Hex | Use |
| --- | --- | --- | --- |
| Background base | `pitch-900` | `#0A1410` | Page bg, default surface |
| Background deeper | `pitch-950` | `#050A07` | Modal overlays, footer |
| Surface raised | `pitch-800` | `#0F1C17` | Cards, popovers, inputs |
| Surface hover | `pitch-700` | `#16261F` | Menu items, secondary buttons |
| Primary | `turf-400` | `#1FB663` | CTAs, success, active states |
| Primary hover | `turf-300` | `#4DDF8A` | Primary CTA hover |
| Accent | `flood-400` | `#E8FF3C` | Key CTAs, focus rings, glows |
| Border / chalk | `line` | `rgba(255,255,255,0.14)` | Default borders |
| Dim chalk | `chalk` | `rgba(255,255,255,0.08)` | Decorative grid |
| Text high | `ink-50` | `#F5F7F4` | Body, headings |
| Text mid | `ink-300` | `#C4CDC7` | Secondary copy |
| Text low | `ink-500` | `#94A39B` | Captions, helper text |
| Text placeholder | `ink-700` | `#5A6A62` | Input placeholders |
| Danger | `danger` | `#FF4D4D` | Destructive actions, errors |
| Warn | `warn` | `#FFB347` | Warnings, partial states |

## Typography

- **Sans:** Geist Sans — UI, body, headings
- **Mono:** Geist Mono — numbers, slugs, IDs, jersey numbers, code

Feature settings: `cv11`, `ss01` (rounded letterforms for soccer-personality).

Display headings use letter-spacing `-0.04em` and weight 800.

## Motion

- **Easing:** `cubic-bezier(0.2, 0, 0, 1)` — snappy and definitive, no overshoot
- **Durations:**
  - `120ms` micro-interactions (hover, focus border)
  - `180ms` standard transitions
  - `260ms` panels, modals
- **No bouncy springs.** This is athletic precision, not playful — soccer is decisive.

## Utilities

```
.bg-chalk-grid       — 40px chalk grid background
.bg-chalk-grid-sm    — 24px denser variant
.glow-flood          — floodlight yellow halo
.glow-turf           — turf green halo
.chalk-underline     — yellow underline accent
.text-balance        — text-wrap: balance for hero copy
```

Decorative components:
- `<ChalkGrid />` — chalk grid bg with radial fade mask
- `<Floodlight />` — soft turf-green radial glow from top

## Rules

1. Default text on `pitch-900` background is `ink-50`.
2. Primary CTAs use `turf-400` bg with `pitch-950` text (high contrast).
3. Accent CTAs (`flood-400`) reserved for one-per-screen key moments.
4. All borders use `line` by default; focus state shifts to `turf-400`.
5. Never use pure `#000` or `#FFF` in UI chrome — always pitch/ink scale.
6. Mono font for ALL numeric values (currency, counts, jersey numbers, dates with day-of-month).
7. Focus rings are `flood-400` 2px with `pitch-900` offset.
8. Active states (selected nav, etc.) get a `turf-400` left-border + `turf-400/10` bg + `turf-300` text.

## Component voice

- **Buttons:** uppercase only when status (badge, label) — never for actions
- **Labels:** uppercase, tracking-wider, `text-xs`, `ink-300`
- **Empty states:** soft, instructive, never blameful ("No events yet — add your first")
- **Errors:** specific and actionable ("Email already invited" not "Validation failed")
