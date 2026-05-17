import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { env } from "./env";

/**
 * Singleton Prisma client wired to the Neon HTTP adapter.
 * - Edge & Node-compatible (Neon driver uses fetch under the hood)
 * - Single instance across hot reloads in dev
 *
 * Locked Sprint 1 — do NOT modify post-Sprint-1 without explicit approval.
 */
function makeClient() {
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof makeClient> };

export const db = globalForPrisma.prisma ?? makeClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
