import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { differenceInYears } from "date-fns";
import { getInitials } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import type { Player } from "@prisma/client";

export function KidsCarousel({
  tenantSlug,
  players,
}: {
  tenantSlug: string;
  players: Player[];
}) {
  if (players.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-[0.2em] text-ink-500">My kids</h2>
        <span className="text-xs font-mono text-ink-500">{players.length}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible lg:mx-0 lg:px-0">
        {players.map((p) => {
          const age = differenceInYears(new Date(), p.dob);
          return (
            <Link
              key={p.id}
              href={`/t/${tenantSlug}/family/kids/${p.id}`}
              className="shrink-0 w-64 lg:w-auto block group"
            >
              <Card className="hover:border-turf-400/40 transition-colors duration-[120ms] h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="h-12 w-12 shrink-0">
                    {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                    <AvatarFallback>{getInitials(`${p.firstName} ${p.lastName}`)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink-50 truncate">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-xs text-ink-500">age {age}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-500 group-hover:text-turf-300 transition-colors" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
