import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { RosterList } from "@/components/roster/RosterList";

export const metadata = { title: "Roster" };

export default async function RosterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const canEdit = canManageTenant(membership.role);

  const players = await db.player.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  // Hydrate parent users in a single query (Player.parentId has no Prisma
  // relation declared, so we do the join manually)
  const parentIds = Array.from(new Set(players.map((p) => p.parentId).filter((id): id is string => !!id)));
  const parents = parentIds.length
    ? await db.user.findMany({ where: { id: { in: parentIds } } })
    : [];
  const parentById = new Map(parents.map((u) => [u.id, u]));

  const withParents = players.map((p) => ({
    ...p,
    parent: p.parentId ? parentById.get(p.parentId) ?? null : null,
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Roster</p>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
          <span className="text-ink-500 font-mono text-sm">
            {players.length} {players.length === 1 ? "player" : "players"}
          </span>
        </div>
      </header>

      <RosterList
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        players={withParents}
        canEdit={canEdit}
        showClubFields={tenant.type === "CLUB"}
      />
    </div>
  );
}
