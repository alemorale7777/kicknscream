import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { isReservedSlug } from "@/lib/slug";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Wordmark } from "@/components/brand/Wordmark";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";
import { CheckCircle2, Clock, Mail } from "lucide-react";
import { BookingCompletedBeacon } from "@/components/analytics/BookingCompletedBeacon";

export const metadata = { title: "Booking confirmed" };

export default async function BookingSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invoice?: string; pending?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  if (isReservedSlug(slug)) notFound();

  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();

  const invoice = sp.invoice
    ? await db.invoice.findUnique({ where: { id: sp.invoice } })
    : null;

  const isPending = !!sp.pending;

  return (
    <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
      <BookingCompletedBeacon
        invoiceId={invoice?.id ?? null}
        amountCents={invoice?.amount ?? null}
        pending={isPending}
      />
      <ChalkGrid />
      <Floodlight />
      <header className="relative z-10 flex items-center justify-between p-5 lg:px-12 border-b border-line backdrop-blur-sm">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Wordmark size="sm" />
        </Link>
      </header>

      <div className="relative z-10 max-w-2xl mx-auto px-5 lg:px-12 py-16 lg:py-24">
        <div className="text-center mb-8">
          <div
            className={`mx-auto h-20 w-20 rounded-full flex items-center justify-center mb-6 ${
              isPending
                ? "bg-warn/15 text-warn"
                : "bg-turf-400/15 text-turf-300 shadow-[0_0_40px_-8px_var(--color-turf-400)]"
            }`}
          >
            {isPending ? <Clock className="h-10 w-10" /> : <CheckCircle2 className="h-10 w-10" />}
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-[-0.04em] text-balance">
            {isPending ? "Booking received" : "You're booked!"}
          </h1>
          <p className="mt-4 text-ink-300 text-lg max-w-md mx-auto text-pretty">
            {isPending
              ? `${tenant.name} will reach out about payment shortly.`
              : `${tenant.name} will see your booking and confirm in the next 24 hours.`}
          </p>
        </div>

        <Card className="p-6 space-y-4 mb-6">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <p className="text-xs uppercase tracking-wider text-ink-500">Tenant</p>
            <p className="font-semibold">{tenant.name}</p>
          </div>
          {invoice && (
            <>
              {invoice.description && (
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <p className="text-xs uppercase tracking-wider text-ink-500">Program</p>
                  <p className="font-semibold">{invoice.description}</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-ink-500">
                  {isPending ? "Amount due" : invoice.amount === 0 ? "Cost" : "Paid"}
                </p>
                <p
                  className={`font-mono font-bold text-lg ${
                    isPending ? "text-warn" : invoice.amount === 0 ? "text-turf-300" : "text-flood-400"
                  }`}
                >
                  {invoice.amount === 0 ? "Free" : formatCents(invoice.amount)}
                </p>
              </div>
            </>
          )}
        </Card>

        <Card className="p-5 border-turf-400/30 bg-turf-400/5">
          <p className="text-xs uppercase tracking-wider text-turf-300 mb-2 inline-flex items-center gap-2">
            <Mail className="h-3 w-3" /> Confirmation sent
          </p>
          <p className="text-sm text-ink-300">
            Check your inbox for a confirmation email with the booking details. Reply to that email if you need to change anything.
          </p>
        </Card>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Button variant="primary" asChild>
            <Link href={`/${slug}`}>Back to {tenant.name}</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/auth/signin">Sign in to manage</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
