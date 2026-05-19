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
          return "_build_stub_";
        },
      }
    ) as z.infer<typeof envSchema>);
