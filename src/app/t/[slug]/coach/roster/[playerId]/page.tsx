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

  // Pull guardian links (Parent rows) so the profile surfaces co-parents / grandparents
  // alongside the primary parent that lives on Player.parentRefId.
  const playerParents = await db.parentPlayer.findMany({
    where: { playerId: player.id, parentRefId: { not: null } },
    include: { parentRef: true },
  });

  const primaryParent = player.parentRefId
    ? await db.parent.findUnique({ where: { id: player.parentRefId } })
    : null;

  // Pull session notes tagged to this player so the Notes tab merges
  // event-scoped notes (visible to parent + AI-assisted) with the
  // coach-only DevelopmentNote stream.
  const sessionNotes = await db.sessionNote.findMany({
    where: { playerId: player.id },
    include: { event: { select: { id: true, title: true, startsAt: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Signed waivers for this player — surface them in the Files tab without
  // requiring a coach to upload anything manually.
  const waiverSignatures = await db.waiverSignature.findMany({
    where: { playerId: player.id },
    include: { waiver: true },
    orderBy: { signedAt: "desc" },
  });

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
          href={`/t/${tenant.slug}/coach/roster`}
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
                href={`/t/${tenant.slug}/coach/roster/${player.id}${t.id === "overview" ? "" : `?tab=${t.id}`}`}
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
          <div className="space-y-4">
            {(() => {
              const activePacks = player.enrollments.filter(
                (e) =>
                  e.program?.priceModel === "PACKAGE" &&
                  e.program?.packSize &&
                  e.packBalance !== null &&
                  e.status !== "COMPLETED" &&
                  e.status !== "REFUNDED" &&
                  e.status !== "CANCELED"
              );
              if (activePacks.length === 0) return null;
              return (
                <section className="space-y-2">
                  <h2 className="text-xs uppercase tracking-[0.2em] text-ink-500">
                    Active packs
                  </h2>
                  <div className="space-y-2">
                    {activePacks.map((e) => {
                      const balance = e.packBalance ?? 0;
                      const size = e.program!.packSize!;
                      const pct = (balance / size) * 100;
                      return (
                        <Card key={e.id} className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-ink-50">{e.program!.name}</p>
                            <span className="font-mono text-sm text-turf-300">
                              {balance}/{size} left
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-pitch-700 overflow-hidden">
                            <div
                              className="h-full bg-turf-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

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

          {(playerParents.length > 0 || primaryParent) && (
            <Card className="px-6 py-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">
                Parents
              </p>
              <ul className="divide-y divide-line">
                {primaryParent && (
                  <li className="py-2.5">
                    <Link
                      href={`/t/${tenant.slug}/coach/parents/${primaryParent.id}`}
                      prefetch={false}
                      className="flex items-center gap-2 hover:bg-pitch-800/40 -mx-2 px-2 rounded"
                    >
                      <span className="font-medium text-ink-50">
                        {primaryParent.name ?? primaryParent.email}
                      </span>
                      <span className="text-xs text-ink-500">(primary)</span>
                    </Link>
                  </li>
                )}
                {playerParents.map(
                  (pp) =>
                    pp.parentRef &&
                    pp.parentRef.id !== primaryParent?.id && (
                      <li key={pp.parentRef.id} className="py-2.5">
                        <Link
                          href={`/t/${tenant.slug}/coach/parents/${pp.parentRef.id}`}
                          prefetch={false}
                          className="flex items-center gap-2 hover:bg-pitch-800/40 -mx-2 px-2 rounded"
                        >
                          <span className="font-medium text-ink-50">
                            {pp.parentRef.name ?? pp.parentRef.email}
                          </span>
                          <span className="text-xs text-ink-500">({pp.relationship})</span>
                        </Link>
                      </li>
                    )
                )}
              </ul>
            </Card>
          )}
          </div>
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
                <Link key={ev.id} href={`/t/${tenant.slug}/coach/schedule/${ev.id}`} className="block">
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
          <NotesTab
            tenantSlug={tenant.slug}
            sessionNotes={sessionNotes}
            developmentNotes={player.developmentNotes}
          />
        )}

        {activeTab === "files" && (
          <FilesTab files={player.files} waiverSignatures={waiverSignatures} />
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

type SessionNoteRow = {
  id: string;
  content: string;
  visibleToParent: boolean;
  createdAt: Date;
  event: { id: string; title: string; startsAt: Date } | null;
};

type DevelopmentNoteRow = {
  id: string;
  category: string | null;
  content: string;
  rating: number | null;
  createdAt: Date;
};

function NotesTab({
  tenantSlug,
  sessionNotes,
  developmentNotes,
}: {
  tenantSlug: string;
  sessionNotes: SessionNoteRow[];
  developmentNotes: DevelopmentNoteRow[];
}) {
  if (sessionNotes.length === 0 && developmentNotes.length === 0) {
    return (
      <Card className="p-10 text-center border-dashed">
        <Sparkles className="h-8 w-8 text-ink-700 mx-auto mb-3" />
        <p className="text-ink-300 font-medium">No notes yet</p>
        <p className="text-xs text-ink-500 mt-1">
          Session notes appear here as coaches write them on the event page.
          Development notes from the Development board show up too.
        </p>
      </Card>
    );
  }

  // Build a unified, descending-by-date timeline.
  type Item =
    | { kind: "session"; at: Date; data: SessionNoteRow }
    | { kind: "dev"; at: Date; data: DevelopmentNoteRow };
  const items: Item[] = [
    ...sessionNotes.map(
      (n): Item => ({ kind: "session", at: n.createdAt, data: n })
    ),
    ...developmentNotes.map(
      (n): Item => ({ kind: "dev", at: n.createdAt, data: n })
    ),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-2">
      {items.map((it) =>
        it.kind === "session" ? (
          <Card key={`s-${it.data.id}`} className="p-4">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-ink-500">
                <Sparkles className="h-3 w-3 text-flood-400" />
                Session note
                {it.data.event && (
                  <Link
                    href={`/t/${tenantSlug}/coach/schedule/${it.data.event.id}`}
                    className="text-ink-300 hover:text-ink-50 normal-case tracking-normal"
                  >
                    · {it.data.event.title}
                  </Link>
                )}
              </span>
              <span className="text-xs font-mono text-ink-500">
                {format(it.data.createdAt, "MMM d, yyyy")}
              </span>
            </div>
            <Markdown>{it.data.content}</Markdown>
            {!it.data.visibleToParent && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-warn">
                Coach-only · not shared with parent
              </p>
            )}
          </Card>
        ) : (
          <Card key={`d-${it.data.id}`} className="p-4">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-xs uppercase tracking-wider text-ink-500">
                {it.data.category ?? "Development"}
              </span>
              <span className="text-xs font-mono text-ink-500">
                {format(it.data.createdAt, "MMM d, yyyy")}
              </span>
            </div>
            <Markdown>{it.data.content}</Markdown>
            {it.data.rating !== null && it.data.rating !== undefined && (
              <p className="mt-2 text-xs text-flood-400 font-mono">
                ★ {it.data.rating}/5
              </p>
            )}
          </Card>
        )
      )}
    </div>
  );
}

type WaiverSigRow = {
  id: string;
  signerName: string;
  signedAt: Date;
  waiver: { title: string };
};

type FileRow = {
  id: string;
  kind: string;
  url: string;
  filename: string | null;
};

function FilesTab({
  files,
  waiverSignatures,
}: {
  files: FileRow[];
  waiverSignatures: WaiverSigRow[];
}) {
  if (files.length === 0 && waiverSignatures.length === 0) {
    return (
      <Card className="p-10 text-center border-dashed">
        <FolderOpen className="h-8 w-8 text-ink-700 mx-auto mb-3" />
        <p className="text-ink-300 font-medium">No files yet</p>
        <p className="text-xs text-ink-500 mt-1">
          Signed waivers, medical forms, and photos will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {waiverSignatures.map((s) => (
        <Card key={`w-${s.id}`} className="p-3 flex items-center gap-3">
          <FileText className="h-4 w-4 text-turf-300 shrink-0" />
          <span className="flex-1 truncate text-ink-50">
            {s.waiver.title}
          </span>
          <span className="text-xs text-ink-500">
            Signed by {s.signerName} · {format(s.signedAt, "MMM d, yyyy")}
          </span>
          <Badge variant="outline" className="text-[10px] border-turf-400/30 text-turf-300">
            Waiver
          </Badge>
        </Card>
      ))}
      {files.map((f) => (
        <Card key={`f-${f.id}`} className="p-3 flex items-center gap-3">
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
      ))}
    </div>
  );
}
