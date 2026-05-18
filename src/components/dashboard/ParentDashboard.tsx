import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/schedule/Markdown";
import { EVENT_TONE, toneChipStyle } from "@/lib/eventTone";
import { formatCents } from "@/lib/utils";
import { format, formatDistanceToNow, differenceInYears, isPast } from "date-fns";
import {
  Calendar,
  Clock,
  MapPin,
  Wallet,
  User as UserIcon,
  ArrowRight,
  Sparkles,
  FileText,
  CheckCircle2,
} from "lucide-react";
import type { Tenant, Player, Event, Location, Invoice, SessionNote, User } from "@prisma/client";

type EventWithLocation = Event & { location?: Location | null };
type NoteWithEvent = SessionNote & {
  event: Event;
  author: User | null;
  player: Player | null;
};

export function ParentDashboard({
  tenant,
  parent,
  players,
  upcomingEvents,
  recentNotes,
  invoices,
}: {
  tenant: Tenant;
  parent: User;
  players: Player[];
  upcomingEvents: EventWithLocation[];
  recentNotes: NoteWithEvent[];
  invoices: Invoice[];
}) {
  const firstName = parent.name?.split(" ")[0] ?? "there";
  const outstandingBalance = invoices
    .filter((i) => i.status === "SENT" || i.status === "PARTIAL" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + i.amount, 0);
  const paidLifetimeCents = invoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="max-w-5xl space-y-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Hi, {firstName}</p>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">{tenant.name}</h1>
          <Badge variant="outline">parent</Badge>
        </div>
      </header>

      {/* Players strip */}
      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-ink-500">Your players</h2>
        {players.length === 0 ? (
          <Card className="p-6 text-center border-dashed">
            <UserIcon className="h-7 w-7 text-ink-700 mx-auto mb-2" />
            <p className="text-sm text-ink-300">No players registered yet.</p>
            <p className="text-xs text-ink-500 mt-1">Book a session to get started.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((p) => {
              const age = differenceInYears(new Date(), p.dob);
              return (
                <Card key={p.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-turf-400/15 text-turf-300 flex items-center justify-center font-bold text-lg shrink-0">
                      {p.firstName[0]}
                      {p.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-50 truncate">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="text-xs text-ink-500">
                        Age {age} · {format(p.dob, "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Stats row */}
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Calendar}
          label="Upcoming"
          value={upcomingEvents.length.toString()}
          sublabel={upcomingEvents.length === 0 ? "Nothing booked yet" : "sessions ahead"}
        />
        <StatCard
          icon={Wallet}
          label="Balance"
          value={outstandingBalance > 0 ? formatCents(outstandingBalance) : "$0"}
          sublabel={outstandingBalance > 0 ? "Pay when you can" : "All caught up"}
          tone={outstandingBalance > 0 ? "warn" : "turf"}
        />
        <StatCard
          icon={CheckCircle2}
          label="Lifetime paid"
          value={formatCents(paidLifetimeCents)}
          sublabel={`${invoices.filter((i) => i.status === "PAID").length} receipts`}
        />
      </section>

      {/* Upcoming sessions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Upcoming</p>
            <h2 className="text-2xl font-bold tracking-[-0.02em] mt-1">Next sessions</h2>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${tenant.slug}`}>
              <ArrowRight className="h-3.5 w-3.5" />
              Book another
            </Link>
          </Button>
        </div>
        {upcomingEvents.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <Sparkles className="h-7 w-7 text-ink-700 mx-auto mb-2" />
            <p className="text-ink-300 font-medium">No sessions scheduled</p>
            <p className="text-xs text-ink-500 mt-1">
              When your coach schedules a session, it shows up here automatically.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((e) => {
              const tone = EVENT_TONE[e.type];
              return (
                <Card key={e.id} className="p-4 flex items-center gap-4 hover:border-turf-400/40 transition-colors">
                  <div className="text-center w-14 shrink-0 border-r border-line pr-3 font-mono">
                    <p className="text-[10px] uppercase tracking-wider text-ink-500">{format(e.startsAt, "MMM")}</p>
                    <p className="text-2xl font-bold leading-none mt-0.5">{format(e.startsAt, "d")}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-50 truncate">{e.title}</p>
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                        style={toneChipStyle(tone.accent, { fillAlpha: 0.14, borderAlpha: 0.45 })}
                      >
                        <span className="h-1 w-1 rounded-full" style={{ backgroundColor: tone.accent }} />
                        {tone.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ink-500 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(e.startsAt, "EEE h:mm a")}
                      </span>
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {e.location.name}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent session notes */}
      {recentNotes.length > 0 && (
        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-500 inline-flex items-center gap-2">
              <FileText className="h-3 w-3" /> From your coach
            </p>
            <h2 className="text-2xl font-bold tracking-[-0.02em] mt-1">Recent session notes</h2>
          </div>
          <div className="space-y-3">
            {recentNotes.map((n) => (
              <Card key={n.id} className="p-5 space-y-3">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-semibold text-ink-50">
                    {n.player?.firstName} {n.player?.lastName}
                  </span>
                  <span className="text-ink-700">·</span>
                  <span className="text-ink-500 text-xs">{n.event.title}</span>
                  <span className="text-ink-700">·</span>
                  <span className="text-ink-500 text-xs">
                    {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <Markdown>{n.content}</Markdown>
                {n.author && (
                  <p className="text-xs text-ink-500 pt-2 border-t border-line">
                    From {n.author.name ?? n.author.email}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Receipts &amp; invoices</p>
            <h2 className="text-2xl font-bold tracking-[-0.02em] mt-1">Payment history</h2>
          </div>
          <Card>
            <div className="divide-y divide-line">
              {invoices.slice(0, 10).map((i) => (
                <div key={i.id} className="p-4 flex items-center gap-4">
                  <Wallet className="h-4 w-4 text-ink-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{i.description ?? "Invoice"}</p>
                    <p className="text-xs text-ink-500">
                      {format(i.createdAt, "MMM d, yyyy")}
                      {i.paidAt && ` · paid ${format(i.paidAt, "MMM d")}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold">{formatCents(i.amount)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-ink-500">
                      <InvoiceStatusBadge status={i.status} dueWhen={i.createdAt} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = "default",
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  sublabel: string;
  tone?: "default" | "warn" | "turf";
}) {
  const colors =
    tone === "warn"
      ? "text-warn"
      : tone === "turf"
        ? "text-turf-300"
        : "";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-ink-500">{label}</p>
          <Icon className="h-4 w-4 text-ink-700" />
        </div>
        <p className={`text-3xl font-bold font-mono tracking-tight ${colors}`}>{value}</p>
        <p className="text-xs text-ink-500 mt-1.5">{sublabel}</p>
      </CardContent>
    </Card>
  );
}

function InvoiceStatusBadge({ status, dueWhen }: { status: string; dueWhen: Date }) {
  if (status === "PAID") return <span className="text-turf-300">paid</span>;
  if (status === "OVERDUE" || (status === "SENT" && isPast(dueWhen))) {
    return <span className="text-danger">overdue</span>;
  }
  if (status === "PARTIAL") return <span className="text-warn">partial</span>;
  return <span>{status.toLowerCase()}</span>;
}
