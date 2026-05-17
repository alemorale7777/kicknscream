import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (existsSync(full)) config({ path: full, override: false });
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter });

  const tenant = await db.tenant.upsert({
    where: { slug: "smoke-coach-demo" },
    create: {
      slug: "smoke-coach-demo",
      name: "Smoke Coach Demo",
      type: "COACH",
      primaryColor: "#1FB663",
    },
    update: {},
  });
  console.log("Tenant:", tenant.slug, tenant.id);

  const program = await db.program.upsert({
    where: { id: "smoke-program-demo" },
    create: {
      id: "smoke-program-demo",
      tenantId: tenant.id,
      name: "1-on-1 Skills Session",
      description:
        "60-minute private lesson focused on first-touch, dribbling, and finishing.",
      priceModel: "PER_SESSION",
      price: 6500,
      ageMin: 6,
      ageMax: 16,
    },
    update: {},
  });
  console.log("Program:", program.id, program.name);

  const free = await db.program.upsert({
    where: { id: "smoke-program-free" },
    create: {
      id: "smoke-program-free",
      tenantId: tenant.id,
      name: "Free Discovery Session",
      description: "30-minute intro session for new families.",
      priceModel: "FREE",
      price: 0,
    },
    update: {},
  });
  console.log("Program (free):", free.id, free.name);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
