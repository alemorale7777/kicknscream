import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChalkGrid } from "@/components/brand/ChalkGrid";
import { TodayWidget } from "@/components/dashboard/TodayWidget";
import { ParentDashboard } from "@/components/dashboard/ParentDashboard";
import { NEXT_STEP_BY_TYPE } from "@/lib/nav";
import Link from "next/link";
import {
  GraduationCap,
  User as UserIcon,
  Trophy,
  ArrowRight,
  Users as UsersIcon,
  Wallet,
  FileText,
} from "lucide-react";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { formatCents } from "@/lib/utils";
import type { TenantType, Tenant, User } from "@prisma/client";

const ICON_BY_TYPE: Record<TenantType, typeof UserIcon> = {
  COACH: UserIcon,
  INSTITUTION: GraduationCap,
  CLUB: Trophy,
};

const TONE_BY_TYPE: Record<TenantType, { bg: string; text: string; ring: string }> = {
  COACH: { bg: "bg-turf-400/10", text: "text-turf-300", ring: "ring-turf-400/30" },
  INSTITUTION: { bg: "bg-flood-400/10", text: "text-flood-400", ring: "ring-flood-400/30" },
  CLUB: { bg: "bg-danger/10", text: "text-danger", ring: "ring-danger/30" },
};

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  if (membership.role === "PARENT") {
    return await renderParentPortal(tenant, user);
  }
  return await renderOperatorDashboard(tenant, user, membership.role);
}

async function renderOperatorDashboard(
  tenant: Tenant,
  user: User,
  role: string
) {
  const Icon = ICON_BY_TYPE[tenant.type];
  const tone = TONE_BY_TYPE[tenant.type];
  const next = NEXT_STEP_BY_TYPE[tenant.type];

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const weekEnd = addDays(now, 7);

  const [todayEvents, weekEventsCount, playerCount, openInvoicesAgg] = await Promise.all([
    db.event.findMany({
      where: { tenantId: tenant.id, startsAt: { gte: dayStart, lte: dayEnd } },
      include: { location: true },
      orderBy: { startsAt: "asc" },
    }),
    db.event.count({
      where: { tenantId: tenant.id, startsAt: { gte: now, lte: weekEnd } },
    }),
    db.player.count({ where: { tenantId: tenant.id } }),
    db.invoice.aggregate({
      _sum: { amount: true },
      _count: true,
      where: {
        tenantId: tenant.id,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
    }),
  ]);

  const firstName = user.name?.split(" ")[0] ?? "Coach";
  const outstandingCents = openInvoicesAgg._sum.amount ?? 0;
  const outstandingCount = openInvoicesAgg._count;

  return (
    <div className="max-w-6xl space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Hello, {firstName}</p>
          <Badge variant="outline">{role.toLowerCase()}</Badge>
        </div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
          <Link
            href={`/${tenant.slug}`}
            className="font-mono text-sm text-ink-500 hover:text-turf-300 transition-colors"
            target="_blank"
          >
            /{tenant.slug} ↗
          </Link>
        </div>
      </header>

      <TodayWidget tenantSlug={tenant.slug} events={todayEvents} />

      {playerCount === 0 && (
        <Card className="relative overflow-hidden">
          <ChalkGrid className="opacity-40" />
          <CardContent className="relative p-6 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center gap-6">
            <div
              className={`h-16 w-16 rounded-lg ${tone.bg} ${tone.text} flex items-center justify-center ring-1 ${tone.ring} shrink-0`}
            >
              <Icon className="h-8 w-8" />
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              <h2 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em] text-balance">
                {next.title}
              </h2>
              <p className="text-ink-300 max-w-2xl text-pretty">{next.copy}</p>
            </div>
            <Button variant="accent" size="lg" asChild className="shrink-0">
              <Link href={next.href(tenant.slug)} className="inline-flex items-center gap-2">
                {next.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={UsersIcon}
          label="Roster"
          value={playerCount.toString()}
          sublabel={playerCount === 0 ? "No players yet" : `${playerCount === 1 ? "player" : "players"} registered`}
          href={`/t/${tenant.slug}/roster`}
        />
        <StatCard
          icon={FileText}
          label="This week"
          value={weekEventsCount.toString()}
          sublabel={weekEventsCount === 0 ? "No events scheduled" : "events upcoming"}
          href={`/t/${tenant.slug}/schedule`}
        />
        <StatCard
          icon={Wallet}
          label="Outstanding"
          value={outstandingCents > 0 ? formatCents(outstandingCents) : "$0"}
          sublabel={
            outstandingCount === 0
              ? "All caught up"
              : `${outstandingCount} ${outstandingCount === 1 ? "invoice" : "invoices"} open`
          }
          href={`/t/${tenant.slug}/payments`}
          tone={outstandingCents > 0 ? "warn" : "default"}
        />
      </section>

      <section className="space-y-4">
        <h3 className="text-sm uppercase tracking-wider text-ink-500">Quick links</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickLink
            href={`/t/${tenant.slug}/programs`}
            title={tenant.type === "COACH" ? "Manage services" : "Manage programs"}
            desc={tenant.type === "COACH" ? "Pricing, packages, descriptions" : "Sessions, classes, camps"}
          />
          <QuickLink
            href={`/t/${tenant.slug}/settings/team`}
            title="Invite teammates"
            desc="Add admins, coaches, parents"
          />
          <QuickLink
            href={`/t/${tenant.slug}/comms`}
            title="Send a broadcast"
            desc="Email all parents at once"
          />
          <QuickLink
            href={`/t/${tenant.slug}/settings/billing`}
            title="Billing"
            desc="Connect Stripe to accept payments"
          />
        </div>
      </section>
    </div>
  );
}

async function renderParentPortal(tenant: Tenant, sessionUser: User) {
  const parent = await db.user.findUnique({ where: { id: sessionUser.id } });
  if (!parent) return null;

  const players = await db.player.findMany({
    where: { tenantId: tenant.id, parentId: parent.id },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const playerIds = players.map((p) => p.id);

  const enrollments = await db.enrollment.findMany({
    where: { playerId: { in: playerIds } },
    include: { program: true },
  });
  const programIds = Array.from(new Set(enrollments.map((e) => e.programId)));

  const playerNames = players.map((p) => `${p.firstName} ${p.lastName}`);

  const [upcomingEvents, recentNotes, invoices, authors] = await Promise.all([
    db.event.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: new Date() },
        OR: [
          ...(programIds.length > 0 ? [{ programId: { in: programIds } }] : []),
          { title: { in: playerNames } },
        ],
      },
      include: { location: true },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
    db.sessionNote.findMany({
      where: { playerId: { in: playerIds }, visibleToParent: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { event: true },
    }),
    db.invoice.findMany({
      where: { tenantId: tenant.id, payerEmail: parent.email ?? "@@no-match@@" },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({
      where: { id: { in: [] } }, // refilled below
    }),
  ]);

  const noteAuthorIds = Array.from(new Set(recentNotes.map((n) => n.authorId)));
  const noteAuthors =
    noteAuthorIds.length > 0
      ? await db.user.findMany({ where: { id: { in: noteAuthorIds } } })
      : authors;
  const authorById = new Map(noteAuthors.map((u) => [u.id, u]));
  const playerById = new Map(players.map((p) => [p.id, p]));

  const notesForUi = recentNotes.map((n) => ({
    ...n,
    author: authorById.get(n.authorId) ?? null,
    player: n.playerId ? playerById.get(n.playerId) ?? null : null,
  }));

  return (
    <ParentDashboard
      tenant={tenant}
      parent={parent}
      players={players}
      upcomingEvents={upcomingEvents}
      recentNotes={notesForUi}
      invoices={invoices}
    />
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  href,
  tone = "default",
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string;
  sublabel: string;
  href?: string;
  tone?: "default" | "warn";
}) {
  const valueColor = tone === "warn" ? "text-warn" : "";
  const inner = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-ink-500">{label}</p>
        <Icon className="h-4 w-4 text-ink-700" />
      </div>
      <p className={`text-3xl font-bold font-mono tracking-tight ${valueColor}`}>{value}</p>
      <p className="text-xs text-ink-500 mt-1.5">{sublabel}</p>
    </CardContent>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="hover:border-turf-400/40 transition-colors duration-[120ms]">{inner}</Card>
      </Link>
    );
  }
  return <Card>{inner}</Card>;
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-md border border-line bg-pitch-800 p-4 transition-all duration-[120ms] hover:border-turf-400/60 hover:bg-pitch-700"
    >
      <div>
        <p className="font-medium text-ink-50">{title}</p>
        <p className="text-xs text-ink-500">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-ink-500 group-hover:text-turf-300 group-hover:translate-x-0.5 transition-all duration-[120ms]" />
    </Link>
  );
}
