import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";
import { ArrowRight, Users, Sparkles } from "lucide-react";
import type { Program, PriceModel } from "@prisma/client";

const PRICE_LABEL: Record<PriceModel, string> = {
  PER_SESSION: "per session",
  PACKAGE: "package",
  MONTHLY: "per month",
  SEASON: "per season",
  FREE: "free",
};

export function ServiceCatalog({
  programs,
  tenantSlug,
  variant = "embedded",
}: {
  programs: Program[];
  tenantSlug: string;
  variant?: "embedded" | "full";
}) {
  if (programs.length === 0) {
    return (
      <Card className="p-10 text-center border-dashed">
        <Sparkles className="h-8 w-8 text-ink-700 mx-auto mb-3" />
        <p className="text-ink-300 font-medium">Programs coming soon</p>
        <p className="text-xs text-ink-500 mt-1">The team is still setting up. Check back in a day or two.</p>
      </Card>
    );
  }

  return (
    <div className={variant === "full" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
      {programs.map((p) => (
        <Card
          key={p.id}
          className="group p-5 flex flex-col gap-3 transition-all duration-[180ms] hover:border-turf-400/50 hover:shadow-[0_0_30px_-8px_var(--color-turf-400)]"
        >
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-ink-50 text-lg leading-tight">{p.name}</h3>
              {(p.ageMin || p.ageMax) && (
                <Badge variant="outline">
                  {p.ageMin ?? "any"}
                  {p.ageMax ? `–${p.ageMax}` : "+"} yrs
                </Badge>
              )}
            </div>
            {p.description && <p className="text-sm text-ink-300 leading-relaxed">{p.description}</p>}
          </div>

          <div className="flex items-end justify-between pt-3 border-t border-line">
            <div>
              {p.priceModel === "FREE" ? (
                <p className="text-xl font-bold text-turf-300">Free</p>
              ) : (
                <>
                  <p className="text-2xl font-bold font-mono tracking-tight text-flood-400">
                    {formatCents(p.price)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-ink-500">
                    {PRICE_LABEL[p.priceModel]}
                  </p>
                </>
              )}
            </div>
            {p.capacity && (
              <p className="text-[10px] uppercase tracking-wider text-ink-500 flex items-center gap-1 mb-1">
                <Users className="h-3 w-3" />
                {p.capacity}-cap
              </p>
            )}
          </div>

          <Button variant="primary" size="sm" className="w-full" asChild>
            <Link
              href={`/${tenantSlug}/book/${p.id}`}
              className="inline-flex items-center justify-center gap-2"
            >
              Book this <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </Button>
        </Card>
      ))}
    </div>
  );
}
