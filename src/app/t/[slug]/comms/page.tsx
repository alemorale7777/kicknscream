import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getBroadcastTemplates } from "@/actions/broadcast";
import { BroadcastComposer } from "@/components/comms/BroadcastComposer";

export const metadata = { title: "Comms" };

export default async function CommsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  if (!canManageTenant(membership.role)) notFound();

  const [programs, parentCount, templates] = await Promise.all([
    db.program.findMany({
      where: { tenantId: tenant.id, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.membership.count({ where: { tenantId: tenant.id, role: "PARENT" } }),
    getBroadcastTemplates(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Comms</p>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">Send a broadcast</h1>
        <p className="text-sm text-ink-500 mt-2">
          Email all parents — or just the parents of one program — in one shot. Markdown supported.
          Templates below cover the common ones (cancellation, weather, registration, balance).
        </p>
      </header>

      <BroadcastComposer
        tenantId={tenant.id}
        programs={programs}
        templates={templates}
        audienceCounts={{ allParents: parentCount }}
      />
    </div>
  );
}
