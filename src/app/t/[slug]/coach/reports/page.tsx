import { requireTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/chrome/PageHeader";
import { Sparkline, DeltaChip } from "@/components/dashboard/Sparkline";
import { formatCents } from "@/lib/utils";
import { can } from "@/lib/auth/permissions";
import {
  Wallet,
  TrendingUp,
  CheckCircle2,
  Users,
  Calendar,
  ClipboardList,
} from "lucide-react";
import {
  subDays,
  eachDayOfInterval,
  isSameDay,
  isAfter,
  differenceInDays,
} from "date-fns";

export const metadata = { title: "Reports" };

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  if (
    !(await can({ tenantId: tenant.id, role: membership.role }, "payments.view"))
  ) {
    redirect(`/t/${slug}/coach/dashboard`);
  }

  const now = new Date();
  const start30 = subDays(now, 30);
  const start60 = subDays(now, 60);
  const start90 = subDays(now, 90);

  const [
    paymentsRecent,
    enrollmentsRecent,
    attendancesRecent,
    activePlayers,
    programsForRevenue,
  ] = await Promise.all([
    db.payment.findMany({
      where: { invoice: { tenantId: tenant.id }, createdAt: { gte: start90 } },
      select: { amount: true, createdAt: true },
    }),
    db.enrollment.findMany({
      where: {
        player: { tenantId: tenant.id },
        createdAt: { gte: start90 },
      },
      select: { createdAt: true, status: true, playerId: true, programId: true },
    }),
    db.attendance.findMany({
      // Attendance rows don't carry their own date; we use the related
      // event's startsAt to bucket and rate.
      where: {
        event: { tenantId: tenant.id, startsAt: { gte: start60 } },
      },
      select: { status: true, event: { select: { startsAt: true } } },
    }),
    db.player.count({ where: { tenantId: tenant.id } }),
    db.program.findMany({
      where: { tenantId: tenant.id },
      include: {
        enrollments: {
          where: {
            invoice: { paidAt: { gte: start30 } },
            status: { in: ["ACTIVE", "CONFIRMED", "PAID", "ATTENDED"] },
          },
          include: { invoice: true },
        },
      },
    }),
  ]);

  // 30-day revenue, with 30-60 day prior window for the delta.
  const revenueCurrent = paymentsRecent
    .filter((p) => isAfter(p.createdAt, start30))
    .reduce((s, p) => s + p.amount, 0);
  const revenuePrior = paymentsRecent
    .filter((p) => isAfter(p.createdAt, start60) && !isAfter(p.createdAt, start30))
    .reduce((s, p) => s + p.amount, 0);
  const revenueDays = eachDayOfInterval({ start: start30, end: now });
  const revenueSpark = revenueDays.map((d) =>
    paymentsRecent
      .filter((p) => isSameDay(p.createdAt, d))
      .reduce((s, p) => s + p.amount, 0)
  );

  // 30-day attendance rate.
  const recentAttendance = attendancesRecent.filter((a) =>
    isAfter(a.event.startsAt, start30)
  );
  const presentCount = recentAttendance.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE"
  ).length;
  const attendanceRate =
    recentAttendance.length === 0
      ? null
      : Math.round((presentCount / recentAttendance.length) * 100);
  const priorAttendance = attendancesRecent.filter(
    (a) =>
      isAfter(a.event.startsAt, start60) && !isAfter(a.event.startsAt, start30)
  );
  const priorPresent = priorAttendance.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE"
  ).length;
  const priorAttendanceRate =
    priorAttendance.length === 0
      ? null
      : Math.round((priorPresent / priorAttendance.length) * 100);
  const attendanceDelta =
    attendanceRate !== null && priorAttendanceRate !== null
      ? attendanceRate - priorAttendanceRate
      : null;

  // New parents (proxied by distinct enrollment players) per week.
  const newPlayersCurrent = new Set(
    enrollmentsRecent
      .filter((e) => isAfter(e.createdAt, start30))
      .map((e) => e.playerId)
  ).size;
  const newPlayersPrior = new Set(
    enrollmentsRecent
      .filter((e) => isAfter(e.createdAt, start60) && !isAfter(e.createdAt, start30))
      .map((e) => e.playerId)
  ).size;
  const newPlayersSpark = revenueDays.map(
    (d) =>
      new Set(
        enrollmentsRecent
          .filter((e) => isSameDay(e.createdAt, d))
          .map((e) => e.playerId)
      ).size
  );

  // Top services by revenue in the last 30d.
  const programRevenue = programsForRevenue
    .map((p) => ({
      id: p.id,
      name: p.name,
      revenueCents: p.enrollments.reduce(
        (s, e) => s + (e.invoice?.amount ?? 0),
        0
      ),
      count: p.enrollments.length,
    }))
    .filter((p) => p.revenueCents > 0)
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  // Retention curve — what percent of players who joined 90d+ ago are
  // still booking today.
  const cohortCutoff = subDays(now, 60);
  const cohortIds = new Set(
    enrollmentsRecent
      .filter((e) => differenceInDays(now, e.createdAt) >= 60)
      .map((e) => e.playerId)
  );
  const cohortStillActive = new Set(
    enrollmentsRecent
      .filter(
        (e) =>
          cohortIds.has(e.playerId) &&
          isAfter(e.createdAt, cohortCutoff)
      )
      .map((e) => e.playerId)
  );
  const retentionPct =
    cohortIds.size === 0
      ? null
      : Math.round((cohortStillActive.size / cohortIds.size) * 100);

  function deltaPct(curr: number, prior: number): number | null {
    if (prior === 0) return curr === 0 ? 0 : null;
    return ((curr - prior) / prior) * 100;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="How the business is doing"
        description="Last-30-day rollups with a week-over-week delta. Everything here mirrors the queries we'd run in SQL — no third-party analytics required."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          icon={Wallet}
          label="Revenue · 30d"
          value={formatCents(revenueCurrent)}
          deltaPct={deltaPct(revenueCurrent, revenuePrior)}
          spark={revenueSpark}
          sparkColor="var(--color-turf-400)"
        />
        <Kpi
          icon={Users}
          label="New players · 30d"
          value={newPlayersCurrent.toString()}
          deltaPct={deltaPct(newPlayersCurrent, newPlayersPrior)}
          spark={newPlayersSpark}
          sparkColor="var(--color-flood-400)"
        />
        <Kpi
          icon={CheckCircle2}
          label="Attendance rate · 30d"
          value={attendanceRate === null ? "—" : `${attendanceRate}%`}
          deltaPct={attendanceDelta}
          tone={attendanceRate !== null && attendanceRate < 70 ? "warn" : "default"}
        />
        <Kpi
          icon={TrendingUp}
          label="60d retention"
          value={retentionPct === null ? "—" : `${retentionPct}%`}
        />
        <Kpi
          icon={Users}
          label="Roster size"
          value={activePlayers.toString()}
        />
        <Kpi
          icon={Calendar}
          label="Sessions completed · 30d"
          value={recentAttendance.length.toString()}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-[11px] uppercase tracking-wider text-ink-500">
          Top services · 30d revenue
        </h3>
        {programRevenue.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <ClipboardList className="h-7 w-7 text-ink-700 mx-auto mb-2" />
            <p className="text-sm text-ink-300">
              No paid bookings in the last 30 days yet.
            </p>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {programRevenue.map((p, i) => (
                <li
                  key={p.id}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <span className="text-xs font-mono text-ink-500 w-6 tabular-nums">
                    {i + 1}.
                  </span>
                  <span className="font-medium text-ink-50 flex-1 truncate">
                    {p.name}
                  </span>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {p.count} {p.count === 1 ? "booking" : "bookings"}
                  </Badge>
                  <span className="font-mono text-flood-400 font-semibold w-20 text-right">
                    {formatCents(p.revenueCents)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  deltaPct,
  spark,
  sparkColor,
  tone = "default",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  deltaPct?: number | null;
  spark?: number[];
  sparkColor?: string;
  tone?: "default" | "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[11px] uppercase tracking-wider text-ink-500">{label}</p>
          <Icon className="h-4 w-4 text-ink-700" />
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p
            className={`text-2xl font-bold font-mono tracking-tight ${tone === "warn" ? "text-warn" : "text-ink-50"}`}
          >
            {value}
          </p>
          {deltaPct !== undefined && <DeltaChip pct={deltaPct} />}
        </div>
        {spark && spark.length > 0 && (
          <div className="mt-2">
            <Sparkline values={spark} width={120} height={24} stroke={sparkColor ?? "currentColor"} fill={sparkColor} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
