import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { isReservedSlug } from "@/lib/slug";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Wordmark } from "@/components/brand/Wordmark";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookingForm } from "@/components/book/BookingForm";
import { formatCents } from "@/lib/utils";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { addDays } from "date-fns";

export const metadata = { title: "Book a session" };

export default async function BookProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; programId: string }>;
  searchParams: Promise<{ canceled?: string }>;
}) {
  const { slug, programId } = await params;
  const sp = await searchParams;
  if (isReservedSlug(slug)) notFound();

  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();

  const program = await db.program.findUnique({ where: { id: programId } });
  if (!program || program.tenantId !== tenant.id) notFound();

  // Look up every event already on the calendar in the booking window. We
  // pass starts-at strings to the client so it can grey out occupied slots
  // when the parent picks a date. 60-day window mirrors the form's max
  // selectable date.
  const windowStart = new Date();
  const windowEnd = addDays(new Date(), 65);
  const busyEvents = await db.event.findMany({
    where: {
      tenantId: tenant.id,
      startsAt: { gte: windowStart, lte: windowEnd },
    },
    select: { startsAt: true, endsAt: true },
  });
  const busyStartsAt = busyEvents.map((e) => ({
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
  }));
  if (program.archived) {
    return (
      <Shell>
        <Card className="p-8 text-center border-warn/30">
          <AlertTriangle className="h-8 w-8 text-warn mx-auto mb-3" />
          <h2 className="text-lg font-semibold">This program isn&apos;t accepting bookings</h2>
          <p className="text-sm text-ink-500 mt-1 mb-4">It may have been archived or moved.</p>
          <Button variant="primary" asChild>
            <Link href={`/${slug}`}>Back to {tenant.name}</Link>
          </Button>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link
        href={`/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-50 transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to {tenant.name}
      </Link>

      {sp.canceled && (
        <div className="mb-6 rounded-md border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          Payment was canceled. Your booking is not yet confirmed — finish the form below to retry.
        </div>
      )}

      <header className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="turf">Book a session</Badge>
          {(program.ageMin || program.ageMax) && (
            <Badge variant="outline">
              Ages {program.ageMin ?? "any"}
              {program.ageMax ? `–${program.ageMax}` : "+"}
            </Badge>
          )}
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-[-0.04em] text-balance">{program.name}</h1>
        {program.description && (
          <p className="mt-4 text-ink-300 max-w-2xl leading-relaxed text-pretty">{program.description}</p>
        )}
        <p className="mt-4 text-xs uppercase tracking-wider text-ink-500">
          {program.priceModel === "FREE" ? "Free" : `${formatCents(program.price)} · ${program.priceModel.toLowerCase().replace("_", " ")}`}
        </p>
      </header>

      <BookingForm
        tenantSlug={slug}
        program={program}
        busyStartsAt={busyStartsAt}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />
      <header className="relative z-10 flex items-center justify-between p-5 lg:px-12 border-b border-line backdrop-blur-sm">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Wordmark size="sm" />
        </Link>
      </header>
      <div className="relative z-10 max-w-3xl mx-auto px-5 lg:px-12 py-10 lg:py-16">{children}</div>
    </main>
  );
}
