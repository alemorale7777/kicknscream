import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { ParentHeader } from "@/components/parents/ParentHeader";
import { ParentStatsStrip } from "@/components/parents/ParentStatsStrip";
import { ParentKidsCard } from "@/components/parents/ParentKidsCard";
import { ParentBookingsCard } from "@/components/parents/ParentBookingsCard";
import { ParentInvoicesCard } from "@/components/parents/ParentInvoicesCard";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Parent" };

export default async function ParentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; parentId: string }>;
}) {
  const { slug, parentId } = await params;
  const { tenant } = await requireTenant(slug);
  const tz = tenant.timeZone ?? "America/Los_Angeles";

  const tenantParent = await db.tenantParent.findUnique({
    where: { tenantId_parentId: { tenantId: tenant.id, parentId } },
    include: { parent: true },
  });
  if (!tenantParent) notFound();

  const players = await db.player.findMany({
    where: { tenantId: tenant.id, parentRefId: parentId },
    orderBy: { firstName: "asc" },
  });

  const enrollments = await db.enrollment.findMany({
    where: { player: { tenantId: tenant.id, parentRefId: parentId } },
    include: {
      program: { select: { name: true } },
      player: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const invoices = await db.invoice.findMany({
    where: {
      tenantId: tenant.id,
      enrollments: { some: { player: { parentRefId: parentId } } },
    },
    include: { payments: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href={`/t/${slug}/coach/parents`}
        prefetch={false}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to parents
      </Link>
      <ParentHeader tenantParent={tenantParent} tenantSlug={slug} />
      <ParentStatsStrip
        playerCount={players.length}
        invoices={invoices}
        tenantTimeZone={tz}
      />
      <ParentKidsCard players={players} tenantSlug={slug} tenantTimeZone={tz} />
      <ParentBookingsCard enrollments={enrollments} tenantSlug={slug} tenantTimeZone={tz} />
      <ParentInvoicesCard invoices={invoices} tenantSlug={slug} tenantTimeZone={tz} />
    </div>
  );
}
