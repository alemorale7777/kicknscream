import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (m) process.env[m[1]] = m[2];
}

neonConfig.poolQueryViaFetch = true;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const EMAIL = process.argv[2];
const TENANT_SLUG = process.argv[3] ?? "smoke-coach-demo";

if (!EMAIL) {
  console.error("Usage: node scripts/attach-owner.mjs <email> [tenant-slug]");
  process.exit(1);
}

const tenant = await db.tenant.findUnique({ where: { slug: TENANT_SLUG } });
if (!tenant) {
  console.error(`Tenant '${TENANT_SLUG}' not found.`);
  process.exit(1);
}

const email = EMAIL.toLowerCase().trim();
const user = await db.user.upsert({
  where: { email },
  create: { email, name: email.split("@")[0] },
  update: {},
});

const membership = await db.membership.upsert({
  where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
  create: { userId: user.id, tenantId: tenant.id, role: "OWNER" },
  update: { role: "OWNER" },
});

console.log("✓ Attached:");
console.log(`  User:       ${user.email} (id=${user.id})`);
console.log(`  Tenant:     ${tenant.slug} — ${tenant.name} (id=${tenant.id})`);
console.log(`  Role:       ${membership.role}`);
console.log(`\nNext: sign in at https://kicknscream.vercel.app/auth/signin with ${user.email}`);
console.log(`Then you'll land at /t/${tenant.slug}/dashboard`);

await db.$disconnect();
