import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { BookingsTable, type BookingRow } from "@/components/bookings/BookingsTable";

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
    };
  });

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Bookings</p>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">
            Incoming registrations
          </h1>
          <span className="text-ink-500 font-mono text-sm">{rows.length} total</span>
        </div>
        <p className="text-sm text-ink-500 mt-2">
          Filter by status, search by player or parent. Click any row to open the event detail.
        </p>
      </header>

      <BookingsTable tenantSlug={tenant.slug} rows={rows} />
    </div>
  );
}
