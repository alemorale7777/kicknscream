import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { isReservedSlug } from "@/lib/slug";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Wordmark } from "@/components/brand/Wordmark";
import { ServiceCatalog } from "@/components/book/ServiceCatalog";
import { EVENT_TONE } from "@/lib/eventTone";
import { format, addDays } from "date-fns";
import {
  MapPin,
  Calendar,
  Trophy,
  GraduationCap,
  User,
  ArrowRight,
  Clock,
} from "lucide-react";
import type { TenantType } from "@prisma/client";
import type { Metadata } from "next";

const TYPE_COPY: Record<
  TenantType,
  { tagline: string; cta: string; icon: typeof User; tone: "turf" | "flood" | "danger" }
> = {
  COACH: {
    tagline: "Private coaching designed around your player.",
    cta: "Book a session",
    icon: User,
    tone: "turf",
  },
  INSTITUTION: {
    tagline: "Programs, classes, and camps built for players who want to get better.",
    cta: "See programs",
    icon: GraduationCap,
    tone: "flood",
  },
  CLUB: {
    tagline: "Competitive teams. Real development. Soccer the right way.",
    cta: "Apply for tryouts",
    icon: Trophy,
    tone: "danger",
  },
};

const TONE_CLASSES: Record<"turf" | "flood" | "danger", { ring: string; text: string; bg: string }> = {
  turf: { ring: "ring-turf-400/30", text: "text-turf-300", bg: "bg-turf-400/10" },
  flood: { ring: "ring-flood-400/30", text: "text-flood-400", bg: "bg-flood-400/10" },
  danger: { ring: "ring-danger/30", text: "text-danger", bg: "bg-danger/10" },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (isReservedSlug(slug)) return { title: "Not found" };
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) return { title: "Not found" };
  return {
    title: tenant.name,
    description: `${tenant.name} on KickNScream — ${TYPE_COPY[tenant.type].tagline}`,
    openGraph: {
      title: tenant.name,
      description: TYPE_COPY[tenant.type].tagline,
      images: tenant.logoUrl ? [{ url: tenant.logoUrl }] : undefined,
    },
  };
}

export default async function PublicTenantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();

  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();

  const [upcomingEvents, locations, programs] = await Promise.all([
    db.event.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: new Date(), lte: addDays(new Date(), 14) },
      },
      include: { location: true },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    db.location.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
    db.program.findMany({
      where: { tenantId: tenant.id, archived: false },
      orderBy: [{ priceModel: "asc" }, { price: "asc" }],
    }),
  ]);

  const copy = TYPE_COPY[tenant.type];
  const tone = TONE_CLASSES[copy.tone];
  const Icon = copy.icon;
  const accentColor = tenant.primaryColor ?? "#1FB663";

  return (
    <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between p-5 lg:px-12 border-b border-line backdrop-blur-sm">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Wordmark size="sm" />
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/auth/signin">Sign in</Link>
        </Button>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-5 lg:px-12 pt-12 lg:pt-24 max-w-5xl">
        <div className="flex items-center gap-5 mb-8">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logoUrl}
              alt=""
              className="h-20 w-20 lg:h-24 lg:w-24 rounded-xl object-cover border border-line shadow-2xl shadow-pitch-950/40"
            />
          ) : (
            <div
              className={`h-20 w-20 lg:h-24 lg:w-24 rounded-xl flex items-center justify-center text-4xl font-bold border border-line`}
              style={{ background: accentColor, color: "#0A1410" }}
            >
              {tenant.name[0].toUpperCase()}
            </div>
          )}
          <Badge variant={copy.tone}>
            <Icon className="h-3 w-3 mr-1" />
            {tenant.type.toLowerCase()}
          </Badge>
        </div>

        <h1 className="text-5xl lg:text-7xl font-bold tracking-[-0.04em] leading-[0.95] text-balance">
          {tenant.name}
        </h1>
        <p className="mt-6 text-xl text-ink-300 max-w-2xl leading-relaxed text-pretty">
          {copy.tagline}
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button variant="accent" size="lg" asChild>
            <Link href={`/auth/signin?callbackUrl=/t/${tenant.slug}/dashboard`} className="inline-flex items-center gap-2">
              {copy.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Services / programs */}
      {programs.length > 0 && (
        <section className="relative z-10 px-5 lg:px-12 mt-20 max-w-5xl">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                {tenant.type === "COACH" ? "Services" : "Programs"}
              </p>
              <h2 className="text-2xl font-bold tracking-[-0.02em] mt-1">
                {tenant.type === "COACH" ? "Book a session" : "What's open"}
              </h2>
            </div>
          </div>
          <ServiceCatalog programs={programs} tenantSlug={tenant.slug} variant="full" />
        </section>
      )}

      {/* Locations strip */}
      {locations.length > 0 && (
        <section className="relative z-10 px-5 lg:px-12 mt-20 max-w-5xl">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500 mb-4">Where we run</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((loc) => (
              <Card key={loc.id} className="p-4 flex items-start gap-3 border-line/60">
                <div className={`h-10 w-10 rounded-md ${tone.bg} ${tone.text} flex items-center justify-center shrink-0`}>
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-ink-50 truncate">{loc.name}</p>
                  {loc.address && <p className="text-xs text-ink-500 mt-0.5 truncate">{loc.address}</p>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming events strip */}
      <section className="relative z-10 px-5 lg:px-12 mt-16 max-w-5xl">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-500">What&apos;s coming up</p>
            <h2 className="text-2xl font-bold tracking-[-0.02em] mt-1">Next 2 weeks</h2>
          </div>
          {upcomingEvents.length > 0 && (
            <Link
              href={`/auth/signin?callbackUrl=/t/${tenant.slug}/schedule`}
              className="text-sm text-turf-300 hover:text-turf-200 underline-offset-4 hover:underline"
            >
              See full schedule →
            </Link>
          )}
        </div>

        {upcomingEvents.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <Calendar className="h-8 w-8 text-ink-700 mx-auto mb-3" />
            <p className="text-ink-300 font-medium">Nothing scheduled in the next 2 weeks</p>
            <p className="text-xs text-ink-500 mt-1">Check back soon, or sign in to see the full calendar.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((e) => {
              const eventTone = EVENT_TONE[e.type];
              return (
                <Card
                  key={e.id}
                  className="p-4 flex items-center gap-4 hover:border-turf-400/40 transition-colors"
                >
                  <div className="text-center w-14 shrink-0 border-r border-line pr-3 font-mono">
                    <p className="text-[10px] uppercase tracking-wider text-ink-500">{format(e.startsAt, "MMM")}</p>
                    <p className="text-2xl font-bold leading-none mt-0.5">{format(e.startsAt, "d")}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-50 truncate">{e.title}</p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${eventTone.bg} ${eventTone.border} ${eventTone.text}`}
                      >
                        <span className={`h-1 w-1 rounded-full ${eventTone.dot}`} />
                        {eventTone.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ink-500 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(e.startsAt, "EEE h:mm a")}
                      </span>
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {e.location.name}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* CTA card */}
      <section className="relative z-10 px-5 lg:px-12 mt-20 max-w-5xl">
        <Card className="relative overflow-hidden p-8 lg:p-12 text-center">
          <ChalkGrid className="opacity-30" />
          <div className="relative">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em] text-balance">
              Ready to get started?
            </h2>
            <p className="mt-3 text-ink-300 max-w-xl mx-auto text-pretty">
              Sign in or create an account to register, manage your kid&apos;s schedule, and message the staff.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <Button variant="accent" size="lg" asChild>
                <Link href={`/auth/signin?callbackUrl=/t/${tenant.slug}/dashboard`}>{copy.cta}</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/auth/signin">Sign in</Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>

      <footer className="relative z-10 mt-24 border-t border-line py-8 px-5 lg:px-12 flex justify-between items-center text-xs text-ink-500">
        <div className="flex items-center gap-3">
          <Wordmark size="sm" />
          <span className="text-ink-700">·</span>
          <span>Powered by KickNScream</span>
        </div>
        <Link href="/" className="hover:text-ink-50 transition-colors">
          What is this?
        </Link>
      </footer>
    </main>
  );
}
