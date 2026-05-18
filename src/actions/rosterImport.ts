"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { normalizeEmail } from "@/lib/parent-link";

/**
 * Bulk CSV roster import.
 *
 * Client-side papaparse turns a CSV file into an array of {row, data} pairs;
 * the server-side action validates each row, optionally runs in dry-run
 * mode to surface errors before any writes, and returns row-level diagnostics
 * so the UI can render a precise preview.
 */

const rowSchema = z
  .object({
    firstName: z.string().min(1, "First name is required").max(60),
    lastName: z.string().min(1, "Last name is required").max(60),
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD")
      .optional()
      .or(z.literal("")),
    position: z.string().max(40).optional().or(z.literal("")),
    jerseyNumber: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => {
        if (v === undefined || v === null || v === "") return null;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      }),
    parentEmail: z
      .string()
      .email("Parent email must be a valid email")
      .optional()
      .or(z.literal("")),
    notes: z.string().max(2000).optional().or(z.literal("")),
  })
  .strict();

const importSchema = z.object({
  tenantId: z.string(),
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().min(1),
        data: z.record(z.string(), z.unknown()),
      })
    )
    .min(1)
    .max(1000),
  dryRun: z.boolean().default(true),
  inviteParents: z.boolean().default(false),
});

type RowResult =
  | { rowNumber: number; status: "ok"; firstName: string; lastName: string }
  | {
      rowNumber: number;
      status: "skipped";
      firstName: string;
      lastName: string;
      reason: string;
    }
  | { rowNumber: number; status: "error"; errors: string[]; raw: Record<string, unknown> };

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to import the roster");
  }
  if (!membership.tenant) throw new Error("Tenant not found");
  return { user, membership, tenant: membership.tenant };
}

export async function importRosterAction(input: z.infer<typeof importSchema>) {
  const data = importSchema.parse(input);
  const { user, tenant } = await assertCanManage(data.tenantId);

  // Pre-fetch existing players so we can dedupe by (firstName,lastName,dob).
  const existing = await db.player.findMany({
    where: { tenantId: data.tenantId },
    select: { firstName: true, lastName: true, dob: true },
  });
  const existingKey = new Set(
    existing.map(
      (p) =>
        `${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}|${
          p.dob.toISOString().slice(0, 10)
        }`
    )
  );

  // Pre-fetch parent users by email so the import can link rows up front
  // without making N round-trips.
  const proposedEmails = Array.from(
    new Set(
      data.rows
        .map((r) => {
          const e = r.data.parentEmail;
          return typeof e === "string" ? normalizeEmail(e) : null;
        })
        .filter((e): e is string => !!e)
    )
  );
  const parents = proposedEmails.length
    ? await db.user.findMany({
        where: { email: { in: proposedEmails } },
        include: { memberships: { where: { tenantId: data.tenantId } } },
      })
    : [];
  const parentByEmail = new Map(parents.map((u) => [u.email!.toLowerCase(), u]));

  const results: RowResult[] = [];
  const validRows: Array<{
    rowNumber: number;
    parsed: z.infer<typeof rowSchema>;
    dedupeKey: string;
  }> = [];

  for (const r of data.rows) {
    const parsed = rowSchema.safeParse(r.data);
    if (!parsed.success) {
      results.push({
        rowNumber: r.rowNumber,
        status: "error",
        errors: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "row"}: ${i.message}`
        ),
        raw: r.data,
      });
      continue;
    }
    const fn = parsed.data.firstName.trim();
    const ln = parsed.data.lastName.trim();
    const dobStr = parsed.data.dob && parsed.data.dob !== "" ? parsed.data.dob : null;
    const key = `${fn.toLowerCase()}|${ln.toLowerCase()}|${dobStr ?? ""}`;

    if (existingKey.has(key)) {
      results.push({
        rowNumber: r.rowNumber,
        status: "skipped",
        firstName: fn,
        lastName: ln,
        reason: "Already on roster (matched on name + date of birth)",
      });
      continue;
    }

    if (validRows.some((v) => v.dedupeKey === key)) {
      results.push({
        rowNumber: r.rowNumber,
        status: "skipped",
        firstName: fn,
        lastName: ln,
        reason: "Duplicate of an earlier row in this file",
      });
      continue;
    }

    validRows.push({ rowNumber: r.rowNumber, parsed: parsed.data, dedupeKey: key });
    results.push({ rowNumber: r.rowNumber, status: "ok", firstName: fn, lastName: ln });
  }

  if (data.dryRun) {
    return summarize(results);
  }

  if (validRows.length === 0) {
    return summarize(results);
  }

  // Commit phase — every valid row becomes a Player, parent linkage best-effort.
  for (const row of validRows) {
    const parsed = row.parsed;
    const fn = parsed.firstName.trim();
    const ln = parsed.lastName.trim();

    let parentId: string | null = null;
    const emailRaw = parsed.parentEmail ?? "";
    const email = normalizeEmail(emailRaw);
    if (email) {
      const existingParent = parentByEmail.get(email) ?? null;
      if (existingParent) {
        parentId = existingParent.id;
        if (existingParent.memberships.length === 0) {
          await db.membership.create({
            data: { userId: existingParent.id, tenantId: data.tenantId, role: "PARENT" },
          });
        }
      } else if (data.inviteParents) {
        const created = await db.user.create({ data: { email } });
        await db.membership.create({
          data: { userId: created.id, tenantId: data.tenantId, role: "PARENT" },
        });
        parentId = created.id;
      }
    }

    await db.player.create({
      data: {
        tenantId: data.tenantId,
        firstName: fn,
        lastName: ln,
        dob: parsed.dob && parsed.dob !== ""
          ? new Date(`${parsed.dob}T00:00:00.000Z`)
          : new Date("2010-01-01T00:00:00.000Z"),
        parentId,
        position: parsed.position && parsed.position !== "" ? parsed.position : null,
        jerseyNumber: parsed.jerseyNumber,
        notes: parsed.notes && parsed.notes !== "" ? parsed.notes : null,
      },
    });
  }

  await db.auditLog.create({
    data: {
      tenantId: data.tenantId,
      actorUserId: user.id,
      action: "roster.bulk_import",
      targetType: "Player",
      diff: {
        imported: validRows.length,
        skipped: results.filter((r) => r.status === "skipped").length,
        errors: results.filter((r) => r.status === "error").length,
      },
    },
  });

  revalidatePath(`/t/${tenant.slug}/coach/roster`);
  return summarize(results);
}

function summarize(results: RowResult[]) {
  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;
  return { total: results.length, ok, skipped, errors, rows: results };
}
