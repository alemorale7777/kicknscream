# Wave C — Brand & SEO · Design Spec

**Status**: Approved 2026-05-18
**Implementation plan**: `docs/superpowers/plans/2026-05-18-wave-c-brand-seo.md`

## Goal

Three additive surface polishers — light theme, Vercel Domains API automation, per-tenant sitemap.

---

## C.1 — Light theme

Phase A spec item that never shipped. Add a light-palette CSS variable block plus next-themes wiring.

### Implementation

- `src/app/globals.css`: Add `[data-theme="light"]` block with palette inversions:
  - `--color-pitch-900: #F8FAF7` (page bg → near-white)
  - `--color-pitch-800: #FFFFFF` (card bg)
  - `--color-pitch-700: #EFF3EE` (raised surface)
  - `--color-ink-50: #0A1410` (primary text)
  - `--color-ink-300: #2A3530` (secondary)
  - `--color-ink-500: #5A6A62` (tertiary, unchanged — already mid-tone)
  - `--color-line: rgba(0, 0, 0, 0.08)` (borders)
  - Brand accents (`turf-400`, `flood-400`, etc.) stay the same — they read fine on both.
- `ThemeProvider.tsx`: flip `enableSystem={true}`, default `"system"`. Already on next-themes; just remove the dark-only lock.
- `UserMenu.tsx`: add a "Theme" submenu with Light / Dark / System triggers. Uses `useTheme()` from next-themes.

### Out of scope

- Per-tenant theme overrides
- Server-rendered theme (we accept FOUC on first paint — next-themes uses a tiny inline script to avoid the flash)

---

## C.2 — Vercel Domains API automation

The custom-domain card currently shows CLI commands for the owner to run manually. Wire the Vercel REST API so saving the domain provisions it automatically.

### Action

`updateTenantDomainAction` (in `src/actions/tenant.ts`) is extended:
- After persisting `Tenant.customDomain` to the DB, if `VERCEL_PROJECT_ID` and `VERCEL_TOKEN` env vars are set, call `POST https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains` with `{ name: customDomain }`.
- 200/201 response → domain attached.
- 409 (already attached) → no-op, safe.
- Any other error → store a `customDomainProvisioningError` on the tenant + surface it on the card so the owner knows to do it manually.
- On `customDomain` clear, call `DELETE https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains/${name}` (404 is fine — already gone).

### Verification endpoint

Add a `GET https://api.vercel.com/v6/domains/${name}/config` lookup that the card polls every few seconds after save to show the DNS-verification state. Surface "Pending DNS", "Verified", or "Misconfigured (check records)" on the card.

### Schema

One additive column on Tenant: `customDomainStatus String?` — store the latest known Vercel verification state. Zero-migration if we keep it nullable.

### Out of scope

- Apex-vs-subdomain routing differences (Vercel API handles both)
- Automatic CNAME/A record creation (still the owner's job at their registrar — only Cloudflare/Squarespace partner with us via their own APIs)
- Domain renewal billing surface

---

## C.3 — Public-page sitemap-per-tenant

A tenant with a custom domain wants its own `https://coach.example.com/sitemap.xml` and `/robots.txt`, not just the platform-wide one. Add per-tenant sitemap generation that the platform serves on both `/{slug}/sitemap.xml` AND (when a custom domain is set) the apex-domain `/sitemap.xml`.

### Routes

- `src/app/[slug]/sitemap.xml/route.ts`: returns the tenant's own URLs (public profile + all active programs' booking pages).
- `src/app/[slug]/robots.txt/route.ts`: per-tenant robots — disallow nothing (the tenant's surface is fully crawlable), reference the per-tenant sitemap.

Both routes set proper `Content-Type` headers and a short cache TTL (`s-maxage=3600`).

### Cross-link

Add `link rel="alternate"` from `/{slug}` pointing at the per-tenant sitemap to help indexer discovery on custom domains.

### Out of scope

- Per-tenant Open Graph image (logo→OG card composition is a bigger lift)
- Per-tenant favicon (same — Vercel/Next requires a static file)

---

## Verification

- **C.1**: `/account` → User menu → Theme → Light. Confirm palette flips, no FOUC, persists across reloads. Hit System, confirm matches OS preference.
- **C.2**: As owner, set a fake domain like `test.kicknscream.dev` on `/admin/branding`. Confirm Vercel API call succeeds (check Vercel project's Domains tab). Clear the domain, confirm it's removed.
- **C.3**: Hit `/smoke-coach-demo/sitemap.xml` — valid XML, lists the public profile + each program. Hit `/smoke-coach-demo/robots.txt` — references the sitemap.
