import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChalkGrid } from "@/components/brand/ChalkGrid";
import { TodayWidget } from "@/components/dashboard/TodayWidget";
import { ParentDashboard } from "@/components/dashboard/ParentDashboard";
import { Sparkline, DeltaChip } from "@/components/dashboard/Sparkline";
import { NeedsAttention, type AttentionItem } from "@/components/dashboard/NeedsAttention";
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
  Send,
  UserPlus,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { startOfDay, endOfDay, addDays, subDays, eachDayOfInterval, isSameDay } from "date-fns";
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

  const fourteenDaysAgo = subDays(now, 14);

  const [
    todayEvents,
    weekEventsCount,
    playerCount,
    programCount,
    openInvoicesAgg,
    playersForSpark,
    eventsForSpark,
    invoicesForSpark,
    pendingEnrollments,
    overdueInvoices,
  ] = await Promise.all([
    db.event.findMany({
      where: { tenantId: tenant.id, startsAt: { gte: dayStart, lte: dayEnd } },
      include: {
        location: true,
        attendances: { select: { id: true } },
        program: {
          select: {
            enrollments: {
              where: { status: { in: ["ACTIVE", "CONFIRMED", "PAID"] } },
              select: { playerId: true },
            },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.event.count({
      where: { tenantId: tenant.id, startsAt: { gte: now, lte: weekEnd } },
    }),
    db.player.count({ where: { tenantId: tenant.id } }),
    db.program.count({ where: { tenantId: tenant.id, archived: false } }),
    db.invoice.aggregate({
      _sum: { amount: true },
      _count: true,
      where: {
        tenantId: tenant.id,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
    }),
    // 14-day windows for sparklines + WoW deltas — using enrollments as a
    // proxy for "new players" growth since Player doesn't track createdAt.
    db.enrollment.findMany({
      where: { player: { tenantId: tenant.id }, createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    }),
    db.event.findMany({
      where: { tenantId: tenant.id, startsAt: { gte: fourteenDaysAgo } },
      select: { startsAt: true },
    }),
    db.invoice.findMany({
      where: { tenantId: tenant.id, createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true, amount: true, status: true },
    }),
    // Needs-attention queries
    db.enrollment.findMany({
      where: { player: { tenantId: tenant.id }, status: "PENDING" },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { player: true, program: true },
    }),
    db.invoice.findMany({
      where: { tenantId: tenant.id, status: "OVERDUE" },
      take: 5,
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Avoid yelling the user's email handle. If we don't have a proper name
  // (no space, or all-digit suffix like the email localpart), fall back to
  // "Coach" — a cleaner greeting than "Hello, alemorale7777".
  const rawName = user.name?.trim();
  const looksLikeHandle =
    !!rawName && /^[a-z0-9_.+-]+$/.test(rawName) && /[0-9]/.test(rawName);
  const firstName = rawName && !looksLikeHandle ? rawName.split(" ")[0] : "Coach";
  const outstandingCents = openInvoicesAgg._sum.amount ?? 0;
  const outstandingCount = openInvoicesAgg._count;

  // Build 7-day spark arrays + WoW deltas
  const days7 = eachDayOfInterval({ start: subDays(now, 6), end: now });
  const days14Prior = eachDayOfInterval({ start: subDays(now, 13), end: subDays(now, 7) });

  function countsByDay(items: { createdAt: Date }[], days: Date[]) {
    return days.map((d) => items.filter((it) => isSameDay(it.createdAt, d)).length);
  }
  function countsByStartsAt(items: { startsAt: Date }[], days: Date[]) {
    return days.map((d) => items.filter((it) => isSameDay(it.startsAt, d)).length);
  }
  function sumByDay(
    items: { createdAt: Date; amount: number; status: string }[],
    days: Date[],
    statuses: string[]
  ) {
    return days.map((d) =>
      items
        .filter((it) => isSameDay(it.createdAt, d) && statuses.includes(it.status))
        .reduce((acc, it) => acc + it.amount, 0)
    );
  }

  const rosterSpark = countsByDay(playersForSpark, days7);
  const rosterPrior = countsByDay(playersForSpark, days14Prior).reduce((a, b) => a + b, 0);
  const rosterCurrent = rosterSpark.reduce((a, b) => a + b, 0);

  const eventsSpark = countsByStartsAt(eventsForSpark, days7);
  const eventsPrior = countsByStartsAt(eventsForSpark, days14Prior).reduce((a, b) => a + b, 0);
  const eventsCurrent = eventsSpark.reduce((a, b) => a + b, 0);

  const outstandingSpark = sumByDay(invoicesForSpark, days7, ["SENT", "PARTIAL", "OVERDUE"]);
  const outstandingPrior = sumByDay(invoicesForSpark, days14Prior, [
    "SENT",
    "PARTIAL",
    "OVERDUE",
  ]).reduce((a, b) => a + b, 0);
  const outstandingCurrent = outstandingSpark.reduce((a, b) => a + b, 0);

  function deltaPct(curr: number, prior: number): number | null {
    if (prior === 0) return curr === 0 ? 0 : null;
    return ((curr - prior) / prior) * 100;
  }

  // Build needs-attention list
  const attentionItems: AttentionItem[] = [];

  // Stripe Connect — only surface if the tenant has at least one non-free
  // program (otherwise there's nothing to charge for and the prompt is noise).
  const hasPaidProgram = await db.program.count({
    where: { tenantId: tenant.id, archived: false, priceModel: { not: "FREE" } },
  });
  if (hasPaidProgram > 0 && !tenant.stripeAccountId) {
    attentionItems.push({
      id: "stripe:disconnected",
      icon: "money",
      tone: "info",
      title: "Connect Stripe to get paid",
      detail: "You have paid programs but no payout account connected",
      href: `/t/${tenant.slug}/admin/billing`,
      cta: "Connect",
    });
  } else if (
    tenant.stripeAccountId &&
    tenant.stripeRequirementsDueAt &&
    !tenant.stripePayoutsEnabled
  ) {
    attentionItems.push({
      id: "stripe:requirements",
      icon: "warn",
      tone: "warn",
      title: "Stripe needs documents",
      detail: "Payouts are paused until you finish onboarding",
      href: `/t/${tenant.slug}/admin/billing`,
      cta: "Finish",
    });
  }

  for (const e of pendingEnrollments) {
    attentionItems.push({
      id: `enrollment:${e.id}`,
      icon: "clock",
      tone: "warn",
      title: `Confirm ${e.player.firstName} ${e.player.lastName}`,
      detail: `Pending in ${e.program.name}`,
      href: `/t/${tenant.slug}/coach/bookings`,
      cta: "Review",
    });
  }
  for (const inv of overdueInvoices) {
    attentionItems.push({
      id: `invoice:${inv.id}`,
      icon: "money",
      tone: "danger",
      title: `Overdue · ${formatCents(inv.amount)}`,
      detail: inv.payerEmail,
      href: `/t/${tenant.slug}/coach/payments`,
      cta: "Chase",
    });
  }

  return (
    <div className="max-w-6xl space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink-500">Hello, {firstName}</p>
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

      <NeedsAttention items={attentionItems} />

      <SetupCard
        tenant={tenant}
        Icon={Icon}
        tone={tone}
        next={next}
        programCount={programCount}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={UsersIcon}
          label="Roster"
          value={playerCount.toString()}
          sublabel={
            playerCount === 0
              ? "No players yet"
              : `${playerCount === 1 ? "player" : "players"} registered`
          }
          href={`/t/${tenant.slug}/coach/roster`}
          spark={rosterSpark}
          deltaPct={deltaPct(rosterCurrent, rosterPrior)}
        />
        <StatCard
          icon={FileText}
          label="This week"
          value={weekEventsCount.toString()}
          sublabel={weekEventsCount === 0 ? "No events scheduled" : "events upcoming"}
          href={`/t/${tenant.slug}/coach/schedule`}
          spark={eventsSpark}
          deltaPct={deltaPct(eventsCurrent, eventsPrior)}
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
          href={`/t/${tenant.slug}/coach/payments`}
          tone={outstandingCents > 0 ? "warn" : "default"}
          spark={outstandingSpark.map((c) => c / 100)}
          deltaPct={deltaPct(outstandingCurrent, outstandingPrior)}
        />
      </section>

      <section className="space-y-4">
        <h3 className="text-sm uppercase tracking-wider text-ink-500">Quick links</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickLink
            href={`/t/${tenant.slug}/coach/programs`}
            icon={GraduationCap}
            title={tenant.type === "COACH" ? "Manage services" : "Manage programs"}
            desc={tenant.type === "COACH" ? "Pricing, packages, descriptions" : "Sessions, classes, camps"}
          />
          <QuickLink
            href={`/t/${tenant.slug}/coach/settings/team`}
            icon={UserPlus}
            title="Invite teammates"
            desc="Add admins, coaches, parents"
          />
          <QuickLink
            href={`/t/${tenant.slug}/coach/comms`}
            icon={Send}
            title="Send a broadcast"
            desc="Email all parents at once"
          />
          <QuickLink
            href={`/t/${tenant.slug}/coach/settings/billing`}
            icon={CreditCard}
            title="Billing"
            desc="Connect Stripe to accept payments"
          />
        </div>
      </section>
    </div>
  );
}

/**
 * Onboarding hero. While the tenant is missing programs or Stripe, this
 * renders as the floodlit hero card. Once both are in place it returns
 * null so the dashboard isn't dominated by an obsolete CTA.
 */
function SetupCard({
  tenant,
  Icon,
  tone,
  next,
  programCount,
}: {
  tenant: Tenant;
  Icon: typeof UserIcon;
  tone: { bg: string; text: string; ring: string };
  next: { title: string; copy: string; cta: string; href: (slug: string) => string };
  programCount: number;
}) {
  const hasProgram = programCount > 0;
  // Only surface the big setup CTA for the "no services yet" state.
  // Stripe-not-connected is now handled by the NeedsAttention queue
  // above, so two-tier redundancy ("connect Stripe" → "Connect Stripe")
  // is suppressed when a program exists.
  if (hasProgram) return null;

  const step = next;

  return (
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
            {step.title}
          </h2>
          <p className="text-ink-300 max-w-2xl text-pretty">{step.copy}</p>
        </div>
        <Button variant="accent" size="lg" asChild className="shrink-0">
          <Link href={step.href(tenant.slug)} className="inline-flex items-center gap-2">
            {step.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
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
  spark,
  deltaPct,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string;
  sublabel: string;
  href?: string;
  tone?: "default" | "warn";
  spark?: number[];
  deltaPct?: number | null;
}) {
  const valueColor = tone === "warn" ? "text-warn" : "";
  const sparkStroke = tone === "warn" ? "var(--color-warn)" : "var(--color-turf-400)";
  const inner = (
    <CardContent className="p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-ink-500">{label}</p>
        <Icon className="h-4 w-4 text-ink-700" />
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className={`text-3xl font-bold font-mono tracking-tight ${valueColor}`}>{value}</p>
        {deltaPct !== undefined && <DeltaChip pct={deltaPct ?? null} />}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <p className="text-xs text-ink-500 truncate">{sublabel}</p>
        {spark && spark.length > 0 && (
          <div className="shrink-0">
            <Sparkline values={spark} width={64} height={20} stroke={sparkStroke} fill={sparkStroke} />
          </div>
        )}
      </div>
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

function QuickLink({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md border border-line bg-pitch-800 p-4 transition-all duration-[120ms] hover:border-turf-400/60 hover:bg-pitch-700"
    >
      <div className="h-9 w-9 rounded-md bg-pitch-700 text-ink-300 flex items-center justify-center shrink-0 group-hover:bg-turf-400/10 group-hover:text-turf-300 transition-colors duration-[120ms]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-ink-50 truncate">{title}</p>
        <p className="text-xs text-ink-500 truncate">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-ink-500 group-hover:text-turf-300 group-hover:translate-x-0.5 transition-all duration-[120ms] shrink-0" />
    </Link>
  );
}
