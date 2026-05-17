import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";
import { format, isPast } from "date-fns";
import Link from "next/link";
import {
  ClipboardList,
  Calendar,
  User,
  Wallet,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";

export const metadata = { title: "Bookings" };

const STATUS_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; tone: string; border: string; bg: string }
> = {
  ACTIVE: {
    label: "Confirmed",
    icon: CheckCircle2,
    tone: "text-turf-300",
    border: "border-turf-400/40",
    bg: "bg-turf-400/10",
  },
  PENDING: {
    label: "Pending payment",
    icon: Clock,
    tone: "text-warn",
    border: "border-warn/40",
    bg: "bg-warn/10",
  },
  WAITLIST: {
    label: "Waitlist",
    icon: Clock,
    tone: "text-ink-300",
    border: "border-line",
    bg: "bg-pitch-700",
  },
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle2,
    tone: "text-turf-300",
    border: "border-turf-400/40",
    bg: "bg-turf-400/10",
  },
  CANCELED: {
    label: "Canceled",
    icon: AlertTriangle,
    tone: "text-ink-700",
    border: "border-line",
    bg: "bg-pitch-800",
  },
};

export default async function BookingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  const enrollments = await db.enrollment.findMany({
    where: { player: { tenantId: tenant.id } },
    include: {
      player: true,
      program: true,
      invoice: { include: { payments: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Hydrate parent users
  const parentIds = Array.from(
    new Set(enrollments.map((e) => e.player.parentId).filter((id): id is string => !!id))
  );
  const parents = parentIds.length ? await db.user.findMany({ where: { id: { in: parentIds } } }) : [];
  const parentById = new Map(parents.map((u) => [u.id, u]));

  // Find the matching scheduled event for each enrollment (the booking we
  // created in actions/booking.ts has a title prefixed with the program name
  // and contains the player name).
  const eventCandidates = await db.event.findMany({
    where: {
      tenantId: tenant.id,
      programId: { in: enrollments.map((e) => e.programId) },
    },
    orderBy: { startsAt: "asc" },
  });
  function findEvent(playerName: string, programId: string) {
    return eventCandidates.find(
      (ev) => ev.programId === programId && ev.title.includes(playerName)
    );
  }

  // Split upcoming vs past
  const upcoming: typeof enrollments = [];
  const past: typeof enrollments = [];
  for (const e of enrollments) {
    const ev = findEvent(`${e.player.firstName} ${e.player.lastName}`, e.programId);
    if (ev && isPast(ev.endsAt)) {
      past.push(e);
    } else {
      upcoming.push(e);
    }
  }

  return (
    <div className="max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Bookings</p>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">Incoming registrations</h1>
          <span className="text-ink-500 font-mono text-sm">{enrollments.length} total</span>
        </div>
        <p className="text-sm text-ink-500 mt-2">
          Every parent registration shows up here. Click through to see attendance, take notes, or chase payment.
        </p>
      </header>

      {enrollments.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <ClipboardList className="h-8 w-8 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">No bookings yet</p>
          <p className="text-xs text-ink-500 mt-1">
            Once parents book sessions or register for programs, they&apos;ll appear here.
          </p>
          <Button variant="outline" size="sm" className="mt-5" asChild>
            <Link href={`/${tenant.slug}`}>
              View your public page
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </Card>
      ) : (
        <>
          <Section title="Upcoming" count={upcoming.length}>
            {upcoming.map((e) => {
              const ev = findEvent(`${e.player.firstName} ${e.player.lastName}`, e.programId);
              const parent = e.player.parentId ? parentById.get(e.player.parentId) : null;
              return (
                <BookingRow
                  key={e.id}
                  tenantSlug={tenant.slug}
                  enrollmentStatus={e.status}
                  invoiceStatus={e.invoice?.status ?? null}
                  amount={e.invoice?.amount ?? null}
                  player={e.player}
                  program={e.program}
                  parent={parent}
                  event={ev}
                />
              );
            })}
          </Section>

          {past.length > 0 && (
            <Section title="Past" count={past.length}>
              {past.map((e) => {
                const ev = findEvent(`${e.player.firstName} ${e.player.lastName}`, e.programId);
                const parent = e.player.parentId ? parentById.get(e.player.parentId) : null;
                return (
                  <BookingRow
                    key={e.id}
                    tenantSlug={tenant.slug}
                    enrollmentStatus={e.status}
                    invoiceStatus={e.invoice?.status ?? null}
                    amount={e.invoice?.amount ?? null}
                    player={e.player}
                    program={e.program}
                    parent={parent}
                    event={ev}
                    muted
                  />
                );
              })}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-[0.2em] text-ink-500">
        {title} <span className="text-ink-700">· {count}</span>
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function BookingRow({
  tenantSlug,
  enrollmentStatus,
  invoiceStatus,
  amount,
  player,
  program,
  parent,
  event,
  muted,
}: {
  tenantSlug: string;
  enrollmentStatus: string;
  invoiceStatus: string | null;
  amount: number | null;
  player: { id: string; firstName: string; lastName: string };
  program: { id: string; name: string };
  parent: { name: string | null; email: string | null } | null | undefined;
  event: { id: string; startsAt: Date; endsAt: Date } | undefined;
  muted?: boolean;
}) {
  const meta = STATUS_META[enrollmentStatus] ?? STATUS_META.PENDING;
  const Icon = meta.icon;
  const paidNicely = invoiceStatus === "PAID";

  const inner = (
    <Card
      className={`p-4 flex items-center gap-4 transition-colors duration-[120ms] ${
        muted ? "opacity-75" : "hover:border-turf-400/40"
      }`}
    >
      <div className="h-10 w-10 rounded-full bg-pitch-700 text-ink-300 flex items-center justify-center shrink-0 font-mono text-xs">
        {player.firstName[0]}
        {player.lastName[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-ink-50 truncate">
            {player.firstName} {player.lastName}
          </p>
          <span className="text-ink-700">·</span>
          <p className="text-sm text-ink-300 truncate">{program.name}</p>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${meta.bg} ${meta.border} ${meta.tone}`}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500 mt-1">
          {event && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span className="font-mono">{format(event.startsAt, "MMM d · h:mm a")}</span>
            </span>
          )}
          {parent?.email && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {parent.email}
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        {amount !== null && (
          <p className={`font-mono font-bold tabular-nums ${paidNicely ? "text-turf-300" : "text-flood-400"}`}>
            {formatCents(amount)}
          </p>
        )}
        <p className="text-[10px] uppercase tracking-wider text-ink-500 inline-flex items-center gap-1">
          <Wallet className="h-2.5 w-2.5" />
          {invoiceStatus?.toLowerCase() ?? "no invoice"}
        </p>
      </div>
      {event && (
        <ArrowRight className="h-4 w-4 text-ink-500 shrink-0" />
      )}
    </Card>
  );

  if (event) {
    return (
      <Link href={`/t/${tenantSlug}/schedule/${event.id}`} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
