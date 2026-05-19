import Link from "next/link";
import { Card } from "@/components/ui/card";
import { differenceInYears } from "date-fns";
import { ChevronRight } from "lucide-react";
import type { Player } from "@prisma/client";

export function ParentKidsCard({
  players,
  tenantSlug,
  // Forward-compat; kid rows show age via date-fns and don't need a timezone
  // today, but the page passes one for parity with other cards.
  tenantTimeZone: _tenantTimeZone,
}: {
  players: Player[];
  tenantSlug: string;
  tenantTimeZone?: string;
}) {
  return (
    <Card className="px-6 py-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">
        Kids ({players.length})
      </p>
      {players.length === 0 ? (
        <p className="text-sm text-ink-500">No kids on this parent yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {players.map((p) => (
            <li key={p.id} className="py-2.5">
              <Link
                href={`/t/${tenantSlug}/coach/roster/${p.id}`}
                prefetch={false}
                className="group flex items-center gap-3 hover:bg-pitch-800/40 -mx-2 px-2 py-1 rounded cursor-pointer transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-pitch-700 flex items-center justify-center text-xs font-mono text-ink-300 shrink-0">
                  {p.firstName[0]}{p.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-50 truncate group-hover:text-turf-300 transition-colors">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-xs text-ink-500">
                    Age {differenceInYears(new Date(), p.dob)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-700 group-hover:text-ink-300 transition-colors shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
