import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { isReservedSlug } from "@/lib/slug";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Wordmark } from "@/components/brand/Wordmark";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Tryout submitted" };

export default async function TryoutThanksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();

  return (
    <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />
      <header className="relative z-10 flex items-center justify-between p-5 lg:px-12 border-b border-line backdrop-blur-sm">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Wordmark size="sm" />
        </Link>
      </header>

      <div className="relative z-10 max-w-2xl mx-auto px-5 lg:px-12 py-16 lg:py-24">
        <div className="text-center mb-8">
          <div className="mx-auto h-20 w-20 rounded-full bg-turf-400/15 text-turf-300 flex items-center justify-center mb-6 shadow-[0_0_40px_-8px_var(--color-turf-400)]">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold tracking-[-0.04em] text-balance">
            Application received
          </h1>
          <p className="mt-4 text-ink-300 text-lg max-w-md mx-auto">
            Coaches at <strong className="text-ink-50">{tenant.name}</strong> will review your submission and reach out within 3–5 days.
          </p>
        </div>

        <Card className="p-5 space-y-3 border-flood-400/30 bg-flood-400/5">
          <p className="text-xs uppercase tracking-wider text-flood-400 inline-flex items-center gap-2">
            <Trophy className="h-3 w-3" /> While you wait
          </p>
          <ul className="text-sm text-ink-300 space-y-2 list-disc list-inside">
            <li>Make sure your video URL is publicly accessible</li>
            <li>Watch your inbox (and spam) for the invite</li>
            <li>If invited, the coach will share a date and location</li>
          </ul>
        </Card>

        <div className="mt-8 flex justify-center">
          <Button variant="primary" asChild>
            <Link href={`/${slug}`}>Back to {tenant.name}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
