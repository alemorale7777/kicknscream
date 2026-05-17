import { requireTenant } from "@/lib/tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChalkGrid } from "@/components/brand/ChalkGrid";
import { NEXT_STEP_BY_TYPE } from "@/lib/nav";
import Link from "next/link";
import { GraduationCap, User, Trophy, ArrowRight, Calendar, Users, Wallet } from "lucide-react";
import type { TenantType } from "@prisma/client";

const ICON_BY_TYPE: Record<TenantType, typeof User> = {
  COACH: User,
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

  const Icon = ICON_BY_TYPE[tenant.type];
  const tone = TONE_BY_TYPE[tenant.type];
  const next = NEXT_STEP_BY_TYPE[tenant.type];

  const firstName = user.name?.split(" ")[0] ?? "Coach";

  return (
    <div className="max-w-6xl space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Hello, {firstName}</p>
          <Badge variant="outline">{membership.role.toLowerCase()}</Badge>
        </div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
          <span className="font-mono text-sm text-ink-500">/t/{tenant.slug}</span>
        </div>
      </header>

      {/* Hero next-step card */}
      <Card className="relative overflow-hidden">
        <ChalkGrid className="opacity-40" />
        <CardContent className="relative p-6 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center gap-6">
          <div
            className={`h-16 w-16 rounded-lg ${tone.bg} ${tone.text} flex items-center justify-center ring-1 ${tone.ring} shrink-0`}
          >
            <Icon className="h-8 w-8" />
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            <h2 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em] text-balance">{next.title}</h2>
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

      {/* Quick stats — placeholder until Sprint 2 wires real numbers */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Users}
          label="Roster"
          value="—"
          sublabel="Add your first player in Sprint 2"
        />
        <StatCard
          icon={Calendar}
          label="This week"
          value="0"
          sublabel="No events scheduled yet"
        />
        <StatCard
          icon={Wallet}
          label="Revenue (MTD)"
          value="$0"
          sublabel="Connect Stripe to start"
        />
      </section>

      {/* Quick links */}
      <section className="space-y-4">
        <h3 className="text-sm uppercase tracking-wider text-ink-500">Quick links</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickLink
            href={`/t/${tenant.slug}/settings`}
            title="Tenant settings"
            desc="Update name, color, logo"
          />
          <QuickLink
            href={`/t/${tenant.slug}/settings/team`}
            title="Invite teammates"
            desc="Add admins, coaches, parents"
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-ink-500">{label}</p>
          <Icon className="h-4 w-4 text-ink-700" />
        </div>
        <p className="text-3xl font-bold font-mono tracking-tight">{value}</p>
        <p className="text-xs text-ink-500 mt-1.5">{sublabel}</p>
      </CardContent>
    </Card>
  );
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
