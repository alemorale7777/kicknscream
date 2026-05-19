import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ParentsList } from "@/components/parents/ParentsList";

export const metadata = { title: "Parents" };

type ParentRow = {
  parentId: string;
  status: "ACTIVE" | "REVOKED";
  parent: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    userId: string | null;
    claimedAt: Date | null;
    deletedAt: Date | null;
  };
  playerCount: number;
  lastBookingAt: Date | null;
  lifetimeCents: number;
  outstandingCents: number;
};

export default async function ParentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  const tps = await db.tenantParent.findMany({
    where: { tenantId: tenant.id },
    include: {
      parent: {
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          userId: true,
          claimedAt: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { registeredAt: "desc" },
  });

  const rows: ParentRow[] = await Promise.all(
    tps.map(async (tp) => {
      const [players, lastEnrollment, paidAgg, outstandingAgg] = await Promise.all([
        db.player.count({
          where: { tenantId: tenant.id, parentRefId: tp.parentId },
        }),
        db.enrollment.findFirst({
          where: { player: { tenantId: tenant.id, parentRefId: tp.parentId } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        db.invoice.aggregate({
          where: {
            tenantId: tenant.id,
            status: "PAID",
            enrollments: { some: { player: { parentRefId: tp.parentId } } },
          },
          _sum: { amount: true },
        }),
        db.invoice.aggregate({
          where: {
            tenantId: tenant.id,
            status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
            enrollments: { some: { player: { parentRefId: tp.parentId } } },
          },
          _sum: { amount: true },
        }),
      ]);
      return {
        parentId: tp.parentId,
        status: tp.status,
        parent: tp.parent,
        playerCount: players,
        lastBookingAt: lastEnrollment?.createdAt ?? null,
        lifetimeCents: paidAgg._sum.amount ?? 0,
        outstandingCents: outstandingAgg._sum.amount ?? 0,
      };
    })
  );

  const unclaimedCount = rows.filter((r) => !r.parent.claimedAt).length;
  const outstandingCount = rows.filter((r) => r.outstandingCents > 0).length;

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Parents"
        title="Your customer base"
        count={`${rows.length} parents · ${unclaimedCount} unclaimed · ${outstandingCount} with outstanding`}
        description="Search, filter, and manage every parent who has booked with you."
      />
      <ParentsList
        tenantSlug={tenant.slug}
        tenantTimeZone={tenant.timeZone ?? "America/Los_Angeles"}
        rows={rows}
      />
    </div>
  );
}
