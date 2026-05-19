import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canManageTenant } from "@/lib/roles";
import { toCSV, csvFilename } from "@/lib/csv";
import { invoiceDisplayStatus } from "@/lib/invoiceStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-tenant CSV export endpoints. Path: /api/exports/[slug]/[entity].
 * Auth: signed-in user with a manage-tenant membership on the slug.
 *
 * Supported entities:
 *   - roster        Player list with parent email
 *   - bookings      Enrollment + invoice rollup
 *   - payments      Invoice rows
 *   - schedule      Event rows in a 1y window
 *   - audit         AuditLog rows
 *
 * Every export writes a "data.export" audit log row.
 */

const HEADERS: Record<string, string[]> = {
  roster: [
    "id",
    "firstName",
    "lastName",
    "dob",
    "position",
    "jerseyNumber",
    "parentEmail",
    "notes",
  ],
  bookings: [
    "enrollmentId",
    "playerFirstName",
    "playerLastName",
    "programName",
    "status",
    "invoiceAmountCents",
    "invoiceStatus",
    "parentEmail",
    "createdAt",
  ],
  payments: [
    "invoiceId",
    "payerEmail",
    "amountCents",
    "currency",
    "status",
    "description",
    "stripePaymentIntentId",
    "createdAt",
    "dueAt",
    "paidAt",
  ],
  schedule: [
    "eventId",
    "title",
    "type",
    "startsAt",
    "endsAt",
    "programName",
    "locationName",
    "capacity",
    "recurringSeriesId",
  ],
  audit: [
    "id",
    "actorUserId",
    "action",
    "targetType",
    "targetId",
    "createdAt",
    "diff",
  ],
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; entity: string }> }
) {
  const { slug, entity } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await db.tenant.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id }, select: { role: true } },
    },
  });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = tenant.memberships[0]?.role;
  if (!role || !canManageTenant(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers = HEADERS[entity];
  if (!headers) return NextResponse.json({ error: "Unknown entity" }, { status: 400 });

  let rows: Record<string, unknown>[] = [];
  switch (entity) {
    case "roster": {
      const players = await db.player.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
      const parentIds = Array.from(
        new Set(players.map((p) => p.parentId).filter((id): id is string => !!id))
      );
      const parents = parentIds.length
        ? await db.user.findMany({
            where: { id: { in: parentIds } },
            select: { id: true, email: true },
          })
        : [];
      const parentEmailById = new Map(parents.map((u) => [u.id, u.email]));
      rows = players.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        dob: p.dob,
        position: p.position,
        jerseyNumber: p.jerseyNumber,
        parentEmail: p.parentId ? parentEmailById.get(p.parentId) ?? "" : "",
        notes: p.notes,
      }));
      break;
    }
    case "bookings": {
      const enrollments = await db.enrollment.findMany({
        where: { player: { tenantId: tenant.id } },
        include: { player: true, program: true, invoice: true },
        orderBy: { createdAt: "desc" },
      });
      const parentIds = Array.from(
        new Set(
          enrollments
            .map((e) => e.player.parentId)
            .filter((id): id is string => !!id)
        )
      );
      const parents = parentIds.length
        ? await db.user.findMany({
            where: { id: { in: parentIds } },
            select: { id: true, email: true },
          })
        : [];
      const parentEmailById = new Map(parents.map((u) => [u.id, u.email]));
      rows = enrollments.map((e) => ({
        enrollmentId: e.id,
        playerFirstName: e.player.firstName,
        playerLastName: e.player.lastName,
        programName: e.program.name,
        status: e.status,
        invoiceAmountCents: e.invoice?.amount ?? "",
        invoiceStatus: e.invoice ? invoiceDisplayStatus(e.invoice) : "",
        parentEmail: e.player.parentId
          ? parentEmailById.get(e.player.parentId) ?? ""
          : "",
        createdAt: e.createdAt,
      }));
      break;
    }
    case "payments": {
      const invoices = await db.invoice.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
      });
      rows = invoices.map((i) => ({
        invoiceId: i.id,
        payerEmail: i.payerEmail,
        amountCents: i.amount,
        currency: i.currency,
        // KNS-23: surface the same OVERDUE/PAID/etc. label the coach UI shows,
        // so the export and the on-screen table never disagree.
        status: invoiceDisplayStatus(i),
        description: i.description,
        stripePaymentIntentId: i.stripePaymentIntentId,
        createdAt: i.createdAt,
        dueAt: i.dueAt,
        paidAt: i.paidAt,
      }));
      break;
    }
    case "schedule": {
      const events = await db.event.findMany({
        where: { tenantId: tenant.id },
        include: { program: true, location: true },
        orderBy: { startsAt: "asc" },
      });
      rows = events.map((e) => ({
        eventId: e.id,
        title: e.title,
        type: e.type,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        programName: e.program?.name ?? "",
        locationName: e.location?.name ?? "",
        capacity: e.capacity,
        recurringSeriesId: e.recurringSeriesId,
      }));
      break;
    }
    case "audit": {
      const entries = await db.auditLog.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      rows = entries.map((e) => ({
        id: e.id,
        actorUserId: e.actorUserId,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        createdAt: e.createdAt,
        diff: e.diff,
      }));
      break;
    }
  }

  const csv = toCSV(headers, rows);

  // Audit the export so we can prove later who pulled what.
  await db.auditLog
    .create({
      data: {
        tenantId: tenant.id,
        actorUserId: session.user.id,
        action: "data.export",
        targetType: entity,
        diff: { rowCount: rows.length },
      },
    })
    .catch(() => {
      // Don't block the download on audit failure.
    });

  // Avoid the unused-binding warning for the request param.
  void req;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(entity, tenant.slug)}"`,
      "Cache-Control": "no-store",
    },
  });
}
