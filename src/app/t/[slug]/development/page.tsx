import { requireTenant } from "@/lib/tenant";
import { hasRole } from "@/lib/roles";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DevelopmentBoard } from "@/components/development/DevelopmentBoard";
import { getDevelopmentCategories } from "@/actions/development";

export const metadata = { title: "Development" };

export default async function DevelopmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  if (!hasRole(membership.role, "COACH")) notFound();

  const [players, notes, categories] = await Promise.all([
    db.player.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    db.developmentNote.findMany({
      where: { player: { tenantId: tenant.id } },
      orderBy: { createdAt: "desc" },
    }),
    getDevelopmentCategories(),
  ]);

  const authorIds = Array.from(new Set(notes.map((n) => n.authorId)));
  const authors = authorIds.length
    ? await db.user.findMany({ where: { id: { in: authorIds } } })
    : [];
  const authorById = new Map(authors.map((a) => [a.id, a]));

  const notesByPlayer: Record<string, (typeof notes[number] & { author: typeof authors[number] | null })[]> = {};
  for (const n of notes) {
    const withAuthor = { ...n, author: authorById.get(n.authorId) ?? null };
    (notesByPlayer[n.playerId] ??= []).push(withAuthor);
  }

  return (
    <div className="max-w-7xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Development</p>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">Player development</h1>
        </div>
        <p className="text-sm text-ink-500 mt-2">
          Track strengths, growth areas, and 1–5 ratings per category. Build a coaching record that pays off
          at the next level.
        </p>
      </header>

      <DevelopmentBoard
        tenantId={tenant.id}
        players={players}
        notesByPlayer={notesByPlayer}
        currentUserId={membership.userId}
        canEditAny={hasRole(membership.role, "ADMIN")}
        categories={categories}
      />
    </div>
  );
}
