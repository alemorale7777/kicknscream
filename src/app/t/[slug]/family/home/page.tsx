import Link from "next/link";
import { requireFamilyAccess } from "@/lib/tenant";
import { db } from "@/lib/db";
import { parentModelV2EnabledFor } from "@/lib/env";
import { NextSessionHero } from "@/components/family/NextSessionHero";
import { KidsCarousel } from "@/components/family/KidsCarousel";
import { OutstandingStrip } from "@/components/family/OutstandingStrip";
import { Card } from "@/components/ui/card";
import { getEventWeather } from "@/lib/weather";
import { loadUpcomingFamilyEvents } from "@/lib/family/events";
import { greetingName } from "@/lib/greeting";
import { Button } from "@/components/ui/button";
import { ScrollText, ArrowRight, Users, Calendar } from "lucide-react";

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
  const { tenant, user, parent } = await requireFamilyAccess(slug);

  const playerWhere =
    parentModelV2EnabledFor(tenant.slug) && parent
      ? { tenantId: tenant.id, parentRefId: parent.id }
      : {
          tenantId: tenant.id,
          OR: [
            { parentId: user.id },
            { parentLinks: { some: { parentUserId: user.id } } },
          ],
        };

  const players = await db.player.findMany({
    where: playerWhere,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const [familyEvents, invoices, pendingWaivers] = await Promise.all([
    loadUpcomingFamilyEvents(tenant.id, user.id, { limit: 50, parent, tenantSlug: tenant.slug }),
    db.invoice.findMany({
      where: { tenantId: tenant.id, payerEmail: user.email ?? "@@none@@" },
      orderBy: { createdAt: "desc" },
    }),
    // Count (waiver × kid) pairs that have no signature yet, so the home
    // page can nudge the parent toward /family/forms.
    countPendingWaivers(tenant.id, players.map((p) => p.id)),
  ]);

  // Pick the soonest event each kid is enrolled into (familyEvents is
  // already sorted ascending by startsAt — first match wins).
  const heroByKid = players.map((p) => ({
    player: p,
    event:
      familyEvents.find((row) => row.players.some((rp) => rp.id === p.id))
        ?.event ?? null,
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
          Hello, {greetingName(user.name, "there")}
        </p>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
      </header>

      {players.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <div className="mx-auto h-12 w-12 rounded-full bg-turf-400/10 text-turf-300 flex items-center justify-center mb-3">
            <Users className="h-6 w-6" />
          </div>
          <p className="font-semibold text-ink-50">No players linked yet</p>
          <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
            Book a session with {tenant.name} and your kid shows up here.
            Already booked? Ask your coach to link your email to the roster.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" size="sm" asChild>
              <Link href={`/t/${tenant.slug}/family/book`}>
                <Calendar className="h-3.5 w-3.5" />
                Book a session
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/${tenant.slug}`}>View public page</Link>
            </Button>
          </div>
        </Card>
      ) : null}

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
            tenantTimeZone={tenant.timeZone ?? "America/Los_Angeles"}
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
