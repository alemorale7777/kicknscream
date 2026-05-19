/* eslint-disable no-console */
/**
 * seed-demo.ts — comprehensive demo fixture for /demo-coach.
 *
 * What it creates (idempotent — re-running upserts existing rows):
 *
 *  - one COACH tenant "Demo Coach" at slug "demo-coach"
 *  - owner + a coach membership
 *  - two parent users — one primary, one co-guardian
 *  - three players, one of whom has the co-guardian linked via ParentPlayer
 *  - four programs spanning every price model: PER_SESSION, PACKAGE,
 *    MONTHLY, FREE
 *  - past events with attendance rows (PRESENT/LATE/ABSENT mix) so the
 *    coach dashboard has data
 *  - upcoming events for the next two weeks
 *  - enrollments at every relevant status (PENDING, CONFIRMED, PAID,
 *    ACTIVE, NO_SHOW, COMPLETED) so admin tools render every code path
 *  - one PACKAGE enrollment with packBalance > 0 to exercise the
 *    pack-balance helper
 *  - two invoices — one PAID, one OVERDUE — so /admin/billing isn't empty
 *
 * Run with: pnpm tsx scripts/seed-demo.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { addDays, subDays, setHours, setMinutes } from "date-fns";

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (existsSync(full)) config({ path: full, override: false });
}

const SLUG = "demo-coach";
const OWNER_EMAIL = "owner@demo-coach.dev";
const COACH_EMAIL = "coach@demo-coach.dev";
const PARENT_EMAIL = "parent@demo-coach.dev";
const COPARENT_EMAIL = "co-guardian@demo-coach.dev";

function at(date: Date, hour: number, minute = 0): Date {
  return setMinutes(setHours(date, hour), minute);
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter });

  // ---------- tenant + owner ----------
  const tenant = await db.tenant.upsert({
    where: { slug: SLUG },
    create: {
      slug: SLUG,
      name: "Demo Coach",
      type: "COACH",
      primaryColor: "#1FB663",
      bio: "Trying out KickNScream with a fully-stocked demo workspace. Real-feeling players, programs, attendance history, and outstanding invoices.",
    },
    update: {},
  });
  console.log("Tenant:", tenant.slug);

  async function upsertUser(email: string, name: string) {
    return db.user.upsert({
      where: { email },
      create: { email, name, emailVerified: new Date() },
      update: { name },
    });
  }

  const owner = await upsertUser(OWNER_EMAIL, "Demo Owner");
  const coach = await upsertUser(COACH_EMAIL, "Demo Coach Asst");
  const parent = await upsertUser(PARENT_EMAIL, "Sam Parent");
  const coparent = await upsertUser(COPARENT_EMAIL, "Jordan Co-Guardian");
  console.log("Users:", { owner: owner.id, coach: coach.id, parent: parent.id, coparent: coparent.id });

  async function upsertMembership(userId: string, role: "OWNER" | "COACH" | "PARENT") {
    return db.membership.upsert({
      where: { userId_tenantId: { userId, tenantId: tenant.id } },
      create: { userId, tenantId: tenant.id, role },
      update: { role },
    });
  }

  await upsertMembership(owner.id, "OWNER");
  await upsertMembership(coach.id, "COACH");
  await upsertMembership(parent.id, "PARENT");
  await upsertMembership(coparent.id, "PARENT");

  // ---------- location ----------
  const location = await db.location.upsert({
    where: { id: "demo-location-1" },
    create: {
      id: "demo-location-1",
      tenantId: tenant.id,
      name: "Riverside Field",
      address: "123 River Rd",
    },
    update: {},
  });

  // ---------- programs ----------
  const perSession = await db.program.upsert({
    where: { id: "demo-prog-per-session" },
    create: {
      id: "demo-prog-per-session",
      tenantId: tenant.id,
      name: "1-on-1 Skills Session",
      description: "60-minute private lesson.",
      priceModel: "PER_SESSION",
      price: 6500,
      ageMin: 6,
      ageMax: 16,
    },
    update: {},
  });

  const pkg = await db.program.upsert({
    where: { id: "demo-prog-pack" },
    create: {
      id: "demo-prog-pack",
      tenantId: tenant.id,
      name: "5-Pack Skills",
      description: "Five 60-minute private lessons.",
      priceModel: "PACKAGE",
      price: 30000,
      packSize: 5,
      ageMin: 6,
      ageMax: 16,
    },
    update: {},
  });

  const monthly = await db.program.upsert({
    where: { id: "demo-prog-monthly" },
    create: {
      id: "demo-prog-monthly",
      tenantId: tenant.id,
      name: "Weekly Group Training (Monthly)",
      description: "Tuesdays + Thursdays, billed monthly.",
      priceModel: "MONTHLY",
      price: 18000,
      ageMin: 7,
      ageMax: 14,
    },
    update: {},
  });

  const free = await db.program.upsert({
    where: { id: "demo-prog-free" },
    create: {
      id: "demo-prog-free",
      tenantId: tenant.id,
      name: "Free Discovery Session",
      description: "30-minute intro session for new families.",
      priceModel: "FREE",
      price: 0,
    },
    update: {},
  });

  console.log("Programs:", [perSession.id, pkg.id, monthly.id, free.id]);

  // ---------- players ----------
  async function upsertPlayer(id: string, data: {
    firstName: string;
    lastName: string;
    dob: Date;
    parentId: string;
    jerseyNumber?: number;
    positions?: string[];
    skillTags?: string[];
  }) {
    return db.player.upsert({
      where: { id },
      create: {
        id,
        tenantId: tenant.id,
        firstName: data.firstName,
        lastName: data.lastName,
        dob: data.dob,
        parentId: data.parentId,
        positions: data.positions ?? [],
        skillTags: data.skillTags ?? [],
        jerseyNumber: data.jerseyNumber,
      },
      update: {
        positions: data.positions ?? [],
        skillTags: data.skillTags ?? [],
      },
    });
  }

  const alex = await upsertPlayer("demo-player-alex", {
    firstName: "Alex",
    lastName: "Parent",
    dob: new Date("2014-03-12"),
    parentId: parent.id,
    jerseyNumber: 7,
    positions: ["forward", "winger"],
    skillTags: ["first-touch", "finishing"],
  });
  const jamie = await upsertPlayer("demo-player-jamie", {
    firstName: "Jamie",
    lastName: "Parent",
    dob: new Date("2016-08-04"),
    parentId: parent.id,
    jerseyNumber: 11,
    positions: ["midfielder"],
    skillTags: ["passing"],
  });
  const riley = await upsertPlayer("demo-player-riley", {
    firstName: "Riley",
    lastName: "Solo",
    dob: new Date("2013-11-22"),
    parentId: parent.id,
    jerseyNumber: 4,
    positions: ["defender"],
  });

  // Co-guardian on Alex only — exercises ParentPlayer junction
  await db.parentPlayer.upsert({
    where: {
      parentUserId_playerId: { parentUserId: coparent.id, playerId: alex.id },
    },
    create: {
      parentUserId: coparent.id,
      playerId: alex.id,
      relationship: "co-guardian",
    },
    update: {},
  });

  console.log("Players + co-guardian:", [alex.id, jamie.id, riley.id]);

  // ---------- events ----------
  const today = new Date();
  // wipe existing demo events first so re-runs don't multiply rows
  await db.attendance.deleteMany({
    where: { event: { tenantId: tenant.id, title: { startsWith: "Demo " } } },
  });
  await db.event.deleteMany({
    where: { tenantId: tenant.id, title: { startsWith: "Demo " } },
  });

  // Two past events with attendance
  const past1 = await db.event.create({
    data: {
      tenantId: tenant.id,
      programId: monthly.id,
      locationId: location.id,
      type: "CLASS",
      title: "Demo Group Training (last week)",
      startsAt: at(subDays(today, 7), 17),
      endsAt: at(subDays(today, 7), 18),
    },
  });
  const past2 = await db.event.create({
    data: {
      tenantId: tenant.id,
      programId: monthly.id,
      locationId: location.id,
      type: "CLASS",
      title: "Demo Group Training (4d ago)",
      startsAt: at(subDays(today, 4), 17),
      endsAt: at(subDays(today, 4), 18),
    },
  });

  for (const [event, jamieStatus, alexStatus, rileyStatus] of [
    [past1, "PRESENT", "PRESENT", "ABSENT"],
    [past2, "PRESENT", "LATE", "PRESENT"],
  ] as const) {
    await db.attendance.createMany({
      data: [
        { eventId: event.id, playerId: alex.id, status: alexStatus },
        { eventId: event.id, playerId: jamie.id, status: jamieStatus },
        { eventId: event.id, playerId: riley.id, status: rileyStatus },
      ],
    });
  }

  // Three upcoming events
  await db.event.create({
    data: {
      tenantId: tenant.id,
      programId: monthly.id,
      locationId: location.id,
      type: "CLASS",
      title: "Demo Group Training (tomorrow)",
      startsAt: at(addDays(today, 1), 17),
      endsAt: at(addDays(today, 1), 18),
    },
  });
  await db.event.create({
    data: {
      tenantId: tenant.id,
      programId: perSession.id,
      locationId: location.id,
      type: "LESSON",
      title: "Demo 1-on-1 with Alex",
      startsAt: at(addDays(today, 2), 15),
      endsAt: at(addDays(today, 2), 16),
    },
  });
  await db.event.create({
    data: {
      tenantId: tenant.id,
      programId: pkg.id,
      locationId: location.id,
      type: "LESSON",
      title: "Demo Pack Session (next week)",
      startsAt: at(addDays(today, 7), 16),
      endsAt: at(addDays(today, 7), 17),
    },
  });

  // ---------- enrollments ----------
  // Wipe + reseed enrollments so statuses + packBalance are deterministic
  await db.enrollment.deleteMany({
    where: { player: { tenantId: tenant.id } },
  });

  await db.enrollment.create({
    data: { playerId: alex.id, programId: monthly.id, status: "ACTIVE" },
  });
  await db.enrollment.create({
    data: { playerId: jamie.id, programId: monthly.id, status: "ACTIVE" },
  });
  await db.enrollment.create({
    data: { playerId: riley.id, programId: monthly.id, status: "PENDING" },
  });
  await db.enrollment.create({
    data: {
      playerId: alex.id,
      programId: pkg.id,
      status: "PAID",
      packBalance: 3, // 2 of 5 used
    },
  });
  await db.enrollment.create({
    data: {
      playerId: jamie.id,
      programId: perSession.id,
      status: "CONFIRMED",
    },
  });
  await db.enrollment.create({
    data: {
      playerId: riley.id,
      programId: perSession.id,
      status: "NO_SHOW",
    },
  });
  await db.enrollment.create({
    data: {
      playerId: alex.id,
      programId: free.id,
      status: "COMPLETED",
    },
  });

  // ---------- invoices ----------
  await db.invoice.deleteMany({
    where: { tenantId: tenant.id, payerEmail: { endsWith: "@demo-coach.dev" } },
  });
  await db.invoice.create({
    data: {
      tenantId: tenant.id,
      payerEmail: PARENT_EMAIL,
      amount: 18000,
      status: "PAID",
      paidAt: subDays(today, 3),
    },
  });
  await db.invoice.create({
    data: {
      tenantId: tenant.id,
      payerEmail: PARENT_EMAIL,
      amount: 18000,
      status: "OVERDUE",
      description: "Past-due monthly fee",
    },
  });

  console.log("\nDemo fixture seeded. Sign in as one of:");
  console.log("  owner:", OWNER_EMAIL);
  console.log("  coach:", COACH_EMAIL);
  console.log("  parent:", PARENT_EMAIL, "(linked to Alex, Jamie, Riley)");
  console.log("  co-guardian:", COPARENT_EMAIL, "(linked to Alex only)");
  console.log("\nPublic page:    /" + tenant.slug);
  console.log("Coach portal:   /t/" + tenant.slug + "/coach/dashboard");
  console.log("Admin billing:  /t/" + tenant.slug + "/admin/billing");

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
