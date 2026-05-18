import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import { differenceInYears } from "date-fns";
import { ChevronRight, Users } from "lucide-react";

export const metadata = { title: "Kids" };

/**
 * Family-side "Kids" tab landing page. The bottom-tab nav points here;
 * before, the link 404'd because only the per-kid /[playerId] page
 * existed. This is the index that lets a parent pick which kid to dive
 * into — minimum is a name + age + photo, and an attendance summary
 * once we have enough Attendance rows to be meaningful.
 */
export default async function FamilyKidsListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user } = await requireTenant(slug);

  const players = await db.player.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        { parentId: user.id },
        { parentLinks: { some: { parentUserId: user.id } } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      attendances: {
        select: { status: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Kids</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Your players</h1>
        <p className="text-sm text-ink-500 mt-1">
          Tap a kid for upcoming sessions, attendance, and coach notes.
        </p>
      </header>

      {players.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <Users className="h-8 w-8 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">No kids linked to your account yet</p>
          <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
            Once you book a session — or a coach adds you to the roster —
            your kids will show up here.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => {
            const age = differenceInYears(new Date(), p.dob);
            const present = p.attendances.filter(
              (a) => a.status === "PRESENT" || a.status === "LATE"
            ).length;
            const pct =
              p.attendances.length === 0
                ? null
                : Math.round((present / p.attendances.length) * 100);
            return (
              <li key={p.id}>
                <Link
                  href={`/t/${tenant.slug}/family/kids/${p.id}`}
                  className="block group"
                >
                  <Card className="p-4 flex items-center gap-3 transition-colors hover:bg-pitch-700/40">
                    <Avatar className="h-12 w-12 shrink-0">
                      {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                      <AvatarFallback>
                        {getInitials(`${p.firstName} ${p.lastName}`)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink-50 truncate">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="text-xs text-ink-500 font-mono mt-0.5">
                        age {age}
                      </p>
                    </div>
                    {pct !== null && (
                      <Badge
                        variant="outline"
                        className="border-turf-400/30 text-turf-300 bg-turf-400/5 font-mono"
                      >
                        {pct}% attendance
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-ink-500 group-hover:text-turf-300 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
