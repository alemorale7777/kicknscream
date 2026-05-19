import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { BookingsTable, type BookingRow } from "@/components/bookings/BookingsTable";
import { PageHeader } from "@/components/chrome/PageHeader";

export const metadata = { title: "Bookings" };

export default async function BookingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  const enrollments = await db.enrollment.findMany({
    where: { player: { tenantId: tenant.id } },
    include: {
      player: true,
      program: true,
      invoice: true,
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  // Hydrate parent users for email column
  const parentIds = Array.from(
    new Set(enrollments.map((e) => e.player.parentId).filter((id): id is string => !!id))
  );
  const parents = parentIds.length
    ? await db.user.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, email: true },
      })
    : [];
  const parentEmailById = new Map(parents.map((u) => [u.id, u.email]));

  // Match each enrollment to its scheduled event (created in actions/booking.ts
  // with `${program.name} · ${player firstName} ${player lastName}` title).
  const eventCandidates = await db.event.findMany({
    where: {
      tenantId: tenant.id,
      programId: { in: enrollments.map((e) => e.programId) },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, programId: true, title: true, startsAt: true },
  });

  function findEvent(playerName: string, programId: string) {
    return eventCandidates.find(
      (ev) => ev.programId === programId && ev.title.includes(playerName)
    );
  }

  const rows: BookingRow[] = enrollments.map((e) => {
    const playerName = `${e.player.firstName} ${e.player.lastName}`;
    const ev = findEvent(playerName, e.programId);
    return {
      enrollmentId: e.id,
      status: e.status,
      invoiceStatus: e.invoice?.status ?? null,
      amount: e.invoice?.amount ?? null,
      playerId: e.player.id,
      playerName,
      programId: e.program.id,
      programName: e.program.name,
      parentEmail: e.player.parentId ? parentEmailById.get(e.player.parentId) ?? null : null,
      eventId: ev?.id ?? null,
      eventStart: ev?.startsAt.toISOString() ?? null,
      packBalance: e.packBalance,
      packSize: e.program.packSize,
      priceModel: e.program.priceModel,
    };
  });

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Bookings"
        title="Incoming registrations"
        count={`${rows.length} total`}
        description="Filter by status, search by player or parent. Click any row to open the linked event or player profile."
      />

      <BookingsTable
        tenantSlug={tenant.slug}
        tenantTimeZone={tenant.timeZone ?? "America/Los_Angeles"}
        rows={rows}
      />
    </div>
  );
}
