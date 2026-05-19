import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { BookingForm } from "@/components/book/BookingForm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/Wordmark";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Clock } from "lucide-react";

export const metadata = { title: "Pick up where you left off" };

export default async function ResumeBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; programId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug, programId } = await params;
  const { token } = await searchParams;

  if (!token) notFound();

  const draft = await db.bookingDraft.findUnique({
    where: { token },
    include: {
      program: true,
      tenant: { select: { id: true, name: true, slug: true } },
    },
  });

  const valid =
    !!draft &&
    draft.tenant.slug === slug &&
    draft.programId === programId &&
    !draft.claimedAt &&
    draft.expiresAt > new Date();

  if (!valid) {
    return (
      <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
        <ChalkGrid />
        <Floodlight />
        <header className="relative z-10 p-5 lg:px-12 border-b border-line">
          <Link href={`/${slug}`}>
            <Wordmark size="sm" />
          </Link>
        </header>
        <div className="relative z-10 max-w-md mx-auto px-5 py-16">
          <Card className="p-8 text-center border-dashed">
            <Clock className="h-8 w-8 text-ink-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-ink-50">This link expired</p>
            <p className="text-sm text-ink-500 mt-1">
              Resume links are good for 15 minutes. Start over below.
            </p>
            <Button variant="primary" size="sm" asChild className="mt-5">
              <Link href={`/${slug}/book/${programId}`}>Start a new booking</Link>
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  const program = draft!.program;
  const payload = draft!.payload as Record<string, unknown>;

  return (
    <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />
      <header className="relative z-10 p-5 lg:px-12 border-b border-line">
        <Link href={`/${slug}`}>
          <Wordmark size="sm" />
        </Link>
      </header>
      <div className="relative z-10 max-w-2xl mx-auto px-5 py-10 space-y-6">
        <Card className="p-4 border-turf-400/40 bg-turf-400/5">
          <p className="text-sm text-ink-50 font-medium">Welcome back — we restored your draft.</p>
          <p className="text-xs text-ink-500 mt-0.5">
            Submit when you&apos;re ready. Your slot is held for the next 15 minutes.
          </p>
        </Card>
        <BookingForm
          tenantSlug={slug}
          program={program}
          busyStartsAt={[]}
          initialState={payload}
        />
      </div>
    </main>
  );
}
