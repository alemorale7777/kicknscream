import { z } from "zod";

/**
 * Server-only env contract. Imported by server modules that need secrets
 * (auth.ts, server actions, route handlers). Throws at module-load time
 * if anything required is missing so we fail fast and obviously.
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
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables:\n${issues}\n\nDid you copy .env.example to .env.local and fill it in?`);
}

export const env = parsed.data;
