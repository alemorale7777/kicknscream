import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

// Prisma CLI doesn't load Next.js's .env.local by default — wire it up here
// so commands like `prisma db push` and `prisma migrate dev` see the same
// secrets the dev server uses.
const envCandidates = [".env.local", ".env.development", ".env"];
for (const file of envCandidates) {
  const full = path.resolve(process.cwd(), file);
  if (existsSync(full)) loadEnv({ path: full, override: false });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
