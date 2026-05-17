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

const users = await db.user.findMany({
  include: { memberships: { include: { tenant: true } } },
  orderBy: { createdAt: "asc" },
});
const tenants = await db.tenant.findMany({
  include: { _count: { select: { memberships: true, players: true, programs: true } } },
  orderBy: { createdAt: "asc" },
});
const invites = await db.invitation.findMany({
  where: { acceptedAt: null, expiresAt: { gt: new Date() } },
  include: { tenant: true },
});

console.log(`\n=== TENANTS (${tenants.length}) ===`);
for (const t of tenants) {
  console.log(`  /t/${t.slug}  (${t.type})  "${t.name}"`);
  console.log(`    ${t._count.memberships} members, ${t._count.players} players, ${t._count.programs} programs`);
}

console.log(`\n=== USERS (${users.length}) ===`);
for (const u of users) {
  const roles =
    u.memberships.map((m) => `${m.tenant.slug}:${m.role}`).join(", ") || "(no memberships)";
  console.log(`  ${u.email}  ${u.name ? `· ${u.name}` : ""}`);
  console.log(`    ${roles}`);
}

if (invites.length) {
  console.log(`\n=== PENDING INVITATIONS (${invites.length}) ===`);
  for (const i of invites) {
    console.log(`  ${i.email} → ${i.tenant.slug} as ${i.role} (expires ${i.expiresAt.toISOString().slice(0, 10)})`);
  }
}

await db.$disconnect();
