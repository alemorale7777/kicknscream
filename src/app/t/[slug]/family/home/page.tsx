import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { NextSessionHero } from "@/components/family/NextSessionHero";
import { KidsCarousel } from "@/components/family/KidsCarousel";
import { OutstandingStrip } from "@/components/family/OutstandingStrip";

export const metadata = { title: "Home" };

export default async function FamilyHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user } = await requireTenant(slug);

  const players = await db.player.findMany({
    where: { tenantId: tenant.id, parentId: user.id },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const playerNames = players.map((p) => `${p.firstName} ${p.lastName}`);

  const [nextEvents, invoices] = await Promise.all([
    playerNames.length > 0
      ? db.event.findMany({
          where: {
            tenantId: tenant.id,
            startsAt: { gte: new Date() },
            title: { in: playerNames },
          },
          include: { location: true },
          orderBy: { startsAt: "asc" },
          take: playerNames.length,
        })
      : Promise.resolve([]),
    db.invoice.findMany({
      where: { tenantId: tenant.id, payerEmail: user.email ?? "@@none@@" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Match a next-session per kid: first event whose title contains the player's name
  const heroByKid = players.map((p) => ({
    player: p,
    event:
      nextEvents.find((e) => e.title.includes(`${p.firstName} ${p.lastName}`)) ?? null,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">
          Hello, {user.name ?? "there"}
        </p>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
      </header>

      <OutstandingStrip tenantSlug={tenant.slug} invoices={invoices} />

      <div className="space-y-3">
        {heroByKid.map(({ player, event }) => (
          <NextSessionHero
            key={player.id}
            tenantSlug={tenant.slug}
            event={event}
            player={player}
          />
        ))}
      </div>

      <KidsCarousel tenantSlug={tenant.slug} players={players} />
    </div>
  );
}
