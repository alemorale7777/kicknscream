import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/schedule/Markdown";
import { formatCents, getInitials } from "@/lib/utils";
import { differenceInYears, format, isPast } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileText,
  User as UserIcon,
  Mail,
  Phone,
  Wallet,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview", icon: UserIcon },
  { id: "schedule", label: "Schedule", icon: Calendar },
  { id: "attendance", label: "Attendance", icon: CheckCircle2 },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "notes", label: "Notes", icon: Sparkles },
  { id: "files", label: "Files", icon: FolderOpen },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const metadata = { title: "Player" };

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; playerId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, playerId } = await params;
  const { tab: tabParam } = await searchParams;
  const activeTab: TabId = (TABS.find((t) => t.id === tabParam)?.id ?? "overview") as TabId;
  const { tenant } = await requireTenant(slug);

  const player = await db.player.findUnique({
    where: { id: playerId },
    include: {
      enrollments: { include: { program: true, invoice: true } },
      attendances: { include: { event: true } },
      developmentNotes: true,
      files: true,
    },
  });
  if (!player || player.tenantId !== tenant.id) notFound();

  const parent = player.parentId
    ? await db.user.findUnique({ where: { id: player.parentId } })
    : null;

  const events = player.enrollments.length
    ? await db.event.findMany({
        where: {
          tenantId: tenant.id,
          programId: { in: player.enrollments.map((e) => e.programId) },
          title: { contains: `${player.firstName} ${player.lastName}` },
        },
        include: { location: true, program: true },
        orderBy: { startsAt: "desc" },
      })
    : [];

  const age = differenceInYears(new Date(), player.dob);
  const initials = getInitials(`${player.firstName} ${player.lastName}`);

  // Attendance stats
  const totalSessions = player.attendances.length;
  const presentSessions = player.attendances.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE"
  ).length;
  const attendancePct =
    totalSessions === 0 ? null : Math.round((presentSessions / totalSessions) * 100);

  // Payment status (most recent invoice)
  const invoices = player.enrollments
    .map((e) => e.invoice)
    .filter((i): i is NonNullable<typeof i> => !!i)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const outstanding = invoices
    .filter((i) => i.status === "SENT" || i.status === "PARTIAL" || i.status === "OVERDUE")
    .reduce((acc, i) => acc + i.amount, 0);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link
          href={`/t/${tenant.slug}/roster`}
          className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-300 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to roster
        </Link>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="p-6 flex flex-col sm:flex-row items-start gap-5">
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-pitch-700 text-ink-300 flex items-center justify-center font-mono text-lg sm:text-xl shrink-0 ring-1 ring-line">
            {player.photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={player.photoUrl}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em]">
                {player.firstName} {player.lastName}
              </h1>
              <span className="text-sm text-ink-500 font-mono">age {age}</span>
              {player.jerseyNumber && (
                <Badge variant="outline" className="font-mono">
                  #{player.jerseyNumber}
                </Badge>
              )}
            </div>
            {(player.positions.length > 0 || player.position) && (
              <div className="flex flex-wrap gap-1.5">
                {(player.positions.length > 0 ? player.positions : [player.position]).map(
                  (pos) =>
                    pos && (
                      <Badge key={pos} variant="outline" className="text-[10px]">
                        {pos}
                      </Badge>
                    )
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-ink-500 pt-1">
              {parent?.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {parent.email}
                </span>
              )}
              {parent?.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {parent.phone}
                </span>
              )}
              {parent?.name && (
                <span className="inline-flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  {parent.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-row sm:flex-col gap-3 sm:gap-1 sm:items-end shrink-0">
            <Stat label="Attendance" value={attendancePct === null ? "—" : `${attendancePct}%`} />
            <Stat
              label="Outstanding"
              value={outstanding > 0 ? formatCents(outstanding) : "$0"}
              tone={outstanding > 0 ? "warn" : "default"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tab nav */}
      <nav className="border-b border-line">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.id === activeTab;
            return (
              <Link
                key={t.id}
                href={`/t/${tenant.slug}/roster/${player.id}${t.id === "overview" ? "" : `?tab=${t.id}`}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-[120ms] whitespace-nowrap",
                  active
                    ? "border-turf-400 text-ink-50"
                    : "border-transparent text-ink-500 hover:text-ink-300"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Tab content */}
      <div className="min-h-[200px]">
        {activeTab === "overview" && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <Field label="Date of birth" value={format(player.dob, "MMM d, yyyy")} />
              {player.skillTags.length > 0 && (
                <Field
                  label="Skills"
                  value={
                    <div className="flex flex-wrap gap-1.5">
                      {player.skillTags.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  }
                />
              )}
              {player.notes && <Field label="Notes" value={player.notes} />}
              {player.notesPrivate && (
                <Field label="Private notes (coach-only)" value={player.notesPrivate} />
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "schedule" && (
          <div className="space-y-2">
            {events.length === 0 ? (
              <Card className="p-10 text-center border-dashed">
                <Calendar className="h-8 w-8 text-ink-700 mx-auto mb-3" />
                <p className="text-ink-300 font-medium">No sessions yet</p>
              </Card>
            ) : (
              events.map((ev) => (
                <Link key={ev.id} href={`/t/${tenant.slug}/schedule/${ev.id}`} className="block">
                  <Card className="p-3 flex items-center gap-3 hover:border-turf-400/40 transition-colors">
                    <div className="text-xs font-mono text-ink-300 shrink-0 w-32">
                      {format(ev.startsAt, "MMM d · h:mm a")}
                    </div>
                    <span className="font-medium text-ink-50 truncate flex-1">{ev.title}</span>
                    {isPast(ev.endsAt) ? (
                      <Badge variant="outline" className="text-[10px]">past</Badge>
                    ) : (
                      <Badge variant="turf" className="text-[10px]">upcoming</Badge>
                    )}
                  </Card>
                </Link>
              ))
            )}
          </div>
        )}

        {activeTab === "attendance" && (
          <div className="space-y-2">
            {player.attendances.length === 0 ? (
              <Card className="p-10 text-center border-dashed">
                <CheckCircle2 className="h-8 w-8 text-ink-700 mx-auto mb-3" />
                <p className="text-ink-300 font-medium">No attendance recorded yet</p>
              </Card>
            ) : (
              player.attendances.map((a) => (
                <Card key={a.id} className="p-3 flex items-center gap-3">
                  <div className="text-xs font-mono text-ink-300 shrink-0 w-32">
                    {format(a.event.startsAt, "MMM d · h:mm a")}
                  </div>
                  <span className="font-medium text-ink-50 truncate flex-1">{a.event.title}</span>
                  <Badge
                    variant={
                      a.status === "PRESENT"
                        ? "turf"
                        : a.status === "LATE"
                          ? "outline"
                          : "danger"
                    }
                    className="text-[10px]"
                  >
                    {a.status.toLowerCase()}
                  </Badge>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "payments" && (
          <div className="space-y-2">
            {invoices.length === 0 ? (
              <Card className="p-10 text-center border-dashed">
                <Wallet className="h-8 w-8 text-ink-700 mx-auto mb-3" />
                <p className="text-ink-300 font-medium">No invoices yet</p>
              </Card>
            ) : (
              invoices.map((inv) => (
                <Card key={inv.id} className="p-3 flex items-center gap-3">
                  <div className="text-xs font-mono text-ink-300 shrink-0 w-32">
                    {format(inv.createdAt, "MMM d, yyyy")}
                  </div>
                  <span className="font-medium text-ink-50 truncate flex-1">
                    {inv.description ?? "(invoice)"}
                  </span>
                  <span className="font-mono font-semibold text-flood-400">
                    {formatCents(inv.amount)}
                  </span>
                  <Badge
                    variant={
                      inv.status === "PAID"
                        ? "turf"
                        : inv.status === "OVERDUE"
                          ? "danger"
                          : "outline"
                    }
                    className="text-[10px]"
                  >
                    {inv.status.toLowerCase()}
                  </Badge>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-2">
            {player.developmentNotes.length === 0 ? (
              <Card className="p-10 text-center border-dashed">
                <Sparkles className="h-8 w-8 text-ink-700 mx-auto mb-3" />
                <p className="text-ink-300 font-medium">No development notes yet</p>
                <p className="text-xs text-ink-500 mt-1">
                  Coaches can add notes from the Development page.
                </p>
              </Card>
            ) : (
              player.developmentNotes.map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="text-xs uppercase tracking-wider text-ink-500">
                      {n.category}
                    </span>
                    <span className="text-xs font-mono text-ink-500">
                      {format(n.createdAt, "MMM d, yyyy")}
                    </span>
                  </div>
                  <Markdown>{n.content}</Markdown>
                  {n.rating !== null && n.rating !== undefined && (
                    <p className="mt-2 text-xs text-flood-400 font-mono">★ {n.rating}/5</p>
                  )}
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div className="space-y-2">
            {player.files.length === 0 ? (
              <Card className="p-10 text-center border-dashed">
                <FolderOpen className="h-8 w-8 text-ink-700 mx-auto mb-3" />
                <p className="text-ink-300 font-medium">No files yet</p>
                <p className="text-xs text-ink-500 mt-1">
                  Waivers, medical forms, and photos will appear here.
                </p>
              </Card>
            ) : (
              player.files.map((f) => (
                <Card key={f.id} className="p-3 flex items-center gap-3">
                  <FileText className="h-4 w-4 text-ink-500 shrink-0" />
                  <span className="flex-1 truncate text-ink-50">{f.filename ?? f.url}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {f.kind.toLowerCase()}
                  </Badge>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={f.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </Button>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider text-ink-500">{label}</p>
      <p
        className={cn(
          "font-mono text-lg font-semibold",
          tone === "warn" ? "text-warn" : "text-ink-50"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
      <span className="text-[10px] uppercase tracking-wider text-ink-500 pt-0.5">{label}</span>
      <div className="text-ink-50">{value}</div>
    </div>
  );
}
