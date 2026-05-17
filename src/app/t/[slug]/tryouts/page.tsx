import { requireTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TryoutPipeline } from "@/components/tryouts/TryoutPipeline";
import { env } from "@/lib/env";
import { Trophy, Share2, ExternalLink } from "lucide-react";

export const metadata = { title: "Tryouts" };

export default async function TryoutsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);
  if (tenant.type !== "CLUB") notFound();

  const signups = await db.tryoutSignup.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
  });

  const publicTryoutUrl = `${env.NEXTAUTH_URL}/${tenant.slug}/tryouts`;

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Tryouts</p>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">Recruiting pipeline</h1>
          <span className="text-ink-500 font-mono text-sm">{signups.length} total</span>
        </div>
      </header>

      <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-flood-400/30">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-md bg-flood-400/15 text-flood-400 flex items-center justify-center shrink-0">
            <Share2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-ink-500">Public tryouts URL</p>
            <p className="font-mono text-sm text-ink-50 truncate">{publicTryoutUrl}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${tenant.slug}/tryouts`} target="_blank" className="inline-flex items-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            Open form
          </Link>
        </Button>
      </Card>

      {signups.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <div className="mx-auto h-16 w-16 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
            <Trophy className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold text-ink-50">No applications yet</h3>
          <p className="text-sm text-ink-500 mt-1 mb-6 max-w-sm mx-auto">
            Share the public URL above on your socials, in your newsletter, or on your team page to start
            gathering applications.
          </p>
        </Card>
      ) : (
        <TryoutPipeline tenantId={tenant.id} signups={signups} />
      )}
    </div>
  );
}
