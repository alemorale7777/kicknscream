import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getBroadcastTemplates } from "@/actions/broadcast";
import { BroadcastComposer } from "@/components/comms/BroadcastComposer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowRight } from "lucide-react";

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

      {parentCount === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <MessageSquare className="h-8 w-8 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">No parents yet</p>
          <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
            Broadcasts go to parents on your roster. Add players (and their parents) first, or share
            your public page so parents can register themselves.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            <Button variant="primary" size="sm" asChild>
              <Link href={`/t/${tenant.slug}/coach/roster`} className="inline-flex items-center gap-2">
                Add players
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/${tenant.slug}`}>View public page</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <BroadcastComposer
          tenantId={tenant.id}
          programs={programs}
          templates={templates}
          audienceCounts={{ allParents: parentCount }}
        />
      )}
    </div>
  );
}
