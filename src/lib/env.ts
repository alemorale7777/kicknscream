import { z } from "zod";

/**
 * Server-only env contract.
 *
 * During Next.js build (phase-production-build) we tolerate missing values
 * because the build pass executes server modules for route discovery and
 * doesn't actually need real secrets. At runtime (dev server, production
 * runtime) we fail fast and obviously.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(20),
  DIRECT_URL: z.string().min(20),
  AUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  AUTH_RESEND_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(5),
  AUTH_GOOGLE_ID: z.string().min(10),
  AUTH_GOOGLE_SECRET: z.string().min(10),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  AUDIT_EMAIL_HMAC_SECRET: z.string().min(32, "Must be at least 32 chars"),
  NEXT_PUBLIC_PARENT_MODEL_V2: z.enum(["false", "shadow", "true"]).default("false"),
  PARENT_MODEL_V2_TENANT_OVERRIDE: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

const parsed = envSchema.safeParse(process.env);

if (!parsed.success && !isBuildPhase) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment variables:\n${issues}\n\nDid you copy .env.example to .env.local and fill it in?`
  );
}

/**
 * In build phase we expose a partial Proxy that returns stub strings for
 * missing keys so module-load doesn't blow up. Reads after build (runtime)
 * always hit real env vars.
 */
export const env = parsed.success
  ? parsed.data
  : (new Proxy(
      {} as z.infer<typeof envSchema>,
      {
        get(_t, key: string) {
          const val = process.env[key];
          if (val !== undefined) return val;
          // build-time stub
          if (key === "NODE_ENV") return "production";
          if (key === "NEXT_PUBLIC_PARENT_MODEL_V2") return "false";
          return "_build_stub_";
        },
      }
    ) as z.infer<typeof envSchema>);

export const PARENT_MODEL_V2 = env.NEXT_PUBLIC_PARENT_MODEL_V2;
export const parentModelV2Enabled = () => PARENT_MODEL_V2 === "true";
export const parentModelV2Shadow = () =>
  PARENT_MODEL_V2 === "shadow" || PARENT_MODEL_V2 === "true";

/**
 * Per-tenant override for staged rollout. When the global flag is "true",
 * everyone gets v2. When the global flag is "false" or "shadow", only slugs
 * present in PARENT_MODEL_V2_TENANT_OVERRIDE (comma-separated) get the v2
 * read/write path.
 */
export const parentModelV2EnabledFor = (slug: string): boolean => {
  if (parentModelV2Enabled()) return true;
  const overrides = (env.PARENT_MODEL_V2_TENANT_OVERRIDE ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return overrides.includes(slug);
};

/**
 * Shadow-or-enabled variant of the per-tenant override. Returns true when
 * the global flag is "shadow"/"true" OR the slug is in the override list.
 * Used by code paths that should run during shadow rollout (e.g. dual-write
 * to the Parent table during booking).
 */
export const parentModelV2ShadowFor = (slug: string): boolean => {
  return parentModelV2Shadow() || parentModelV2EnabledFor(slug);
};
