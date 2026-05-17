import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { isReservedSlug } from "@/lib/slug";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Wordmark } from "@/components/brand/Wordmark";
import { Badge } from "@/components/ui/badge";
import { TryoutForm } from "@/components/tryouts/TryoutForm";
import { ArrowLeft, Trophy } from "lucide-react";

export const metadata = { title: "Tryouts" };

export default async function PublicTryoutsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (isReservedSlug(slug)) notFound();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();
  if (tenant.type !== "CLUB") notFound();

  return (
    <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />
      <header className="relative z-10 flex items-center justify-between p-5 lg:px-12 border-b border-line backdrop-blur-sm">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Wordmark size="sm" />
        </Link>
      </header>

      <div className="relative z-10 max-w-3xl mx-auto px-5 lg:px-12 py-10 lg:py-16 space-y-8">
        <Link
          href={`/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-50 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {tenant.name}
        </Link>

        <header className="space-y-4">
          <Badge variant="danger" className="inline-flex">
            <Trophy className="h-3 w-3 mr-1" />
            Open tryouts
          </Badge>
          <h1 className="text-4xl lg:text-6xl font-bold tracking-[-0.04em] leading-[0.95] text-balance">
            Tryout for {tenant.name}
          </h1>
          <p className="text-lg text-ink-300 max-w-2xl leading-relaxed text-pretty">
            Submit the form below. Coaches review every application — bring your tape and your work ethic, we&apos;ll bring the rest.
          </p>
        </header>

        <TryoutForm tenantSlug={slug} />
      </div>
    </main>
  );
}
