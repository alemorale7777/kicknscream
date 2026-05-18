import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { NextSessionHero } from "@/components/family/NextSessionHero";
import { KidsCarousel } from "@/components/family/KidsCarousel";
import { OutstandingStrip } from "@/components/family/OutstandingStrip";
import { Card } from "@/components/ui/card";
import { getEventWeather } from "@/lib/weather";
import { ScrollText, ArrowRight } from "lucide-react";

export const metadata = { title: "Home" };

async function countPendingWaivers(tenantId: string, playerIds: string[]) {
  if (playerIds.length === 0) return 0;
  const waivers = await db.waiver.findMany({
    where: { tenantId },
    select: { id: true },
  });
  if (waivers.length === 0) return 0;
  const total = waivers.length * playerIds.length;
  const signedCount = await db.waiverSignature.count({
    where: {
      waiverId: { in: waivers.map((w) => w.id) },
      playerId: { in: playerIds },
    },
  });
  return Math.max(0, total - signedCount);
}

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

  const [nextEvents, invoices, pendingWaivers] = await Promise.all([
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
    // Count (waiver × kid) pairs that have no signature yet, so the home
    // page can nudge the parent toward /family/forms.
    countPendingWaivers(tenant.id, players.map((p) => p.id)),
  ]);

  // Match a next-session per kid: first event whose title contains the player's name
  const heroByKid = players.map((p) => ({
    player: p,
    event:
      nextEvents.find((e) => e.title.includes(`${p.firstName} ${p.lastName}`)) ?? null,
  }));

  // Forecast lookup per kid hero — parallel and gracefully nullable.
  // Open-Meteo geocodes + caches at the framework fetch layer so the same
  // address across many kids only hits the network once an hour.
  const heroWeather = await Promise.all(
    heroByKid.map(async ({ event }) => {
      if (!event?.location?.address) return null;
      return getEventWeather(event.location.address, event.startsAt);
    })
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">
          Hello, {user.name ?? "there"}
        </p>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
      </header>

      <OutstandingStrip tenantSlug={tenant.slug} invoices={invoices} />

      {pendingWaivers > 0 && (
        <Link href={`/t/${tenant.slug}/family/forms`} className="block group">
          <Card className="p-4 flex items-center gap-3 border-warn/30 bg-warn/5 transition-colors hover:border-warn/60">
            <div className="h-10 w-10 rounded-md bg-warn/15 text-warn flex items-center justify-center shrink-0">
              <ScrollText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink-50">
                {pendingWaivers} {pendingWaivers === 1 ? "waiver needs" : "waivers need"} your signature
              </p>
              <p className="text-xs text-ink-500 mt-0.5">
                Typed-signature — under a minute per kid.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-warn group-hover:translate-x-0.5 transition-transform" />
          </Card>
        </Link>
      )}

      <div className="space-y-3">
        {heroByKid.map(({ player, event }, i) => (
          <NextSessionHero
            key={player.id}
            tenantSlug={tenant.slug}
            event={event}
            player={player}
            weather={heroWeather[i]}
          />
        ))}
      </div>

      <KidsCarousel tenantSlug={tenant.slug} players={players} />
    </div>
  );
}
