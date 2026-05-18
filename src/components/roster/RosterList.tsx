"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { PlayerDialog } from "./PlayerDialog";
import { RosterImportSheet } from "./RosterImportSheet";
import { deletePlayerAction } from "@/actions/player";
import { getInitials } from "@/lib/utils";
import { differenceInYears, format } from "date-fns";
import {
  Search,
  Plus,
  Users,
  Pencil,
  Trash2,
  MoreHorizontal,
  Mail,
  Loader2,
  CalendarDays,
  Upload,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Player, User } from "@prisma/client";

type PlayerWithParent = Player & { parent?: User | null };

export function RosterList({
  tenantId,
  tenantSlug,
  players,
  canEdit,
  showClubFields,
}: {
  tenantId: string;
  tenantSlug: string;
  players: PlayerWithParent[];
  canEdit: boolean;
  showClubFields: boolean;
}) {
  type SortKey = "name" | "age" | "parent" | "jersey";
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerWithParent | undefined>(undefined);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? players.filter((p) => {
          const full = `${p.firstName} ${p.lastName}`.toLowerCase();
          const parent = (p.parent?.name ?? p.parent?.email ?? "").toLowerCase();
          const pos = (p.position ?? "").toLowerCase();
          return full.includes(q) || parent.includes(q) || pos.includes(q);
        })
      : players;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "name": {
          const av = `${a.lastName} ${a.firstName}`.toLowerCase();
          const bv = `${b.lastName} ${b.firstName}`.toLowerCase();
          return av.localeCompare(bv) * dir;
        }
        case "age":
          return (a.dob.getTime() - b.dob.getTime()) * dir;
        case "parent": {
          const av = (a.parent?.name ?? a.parent?.email ?? "~").toLowerCase();
          const bv = (b.parent?.name ?? b.parent?.email ?? "~").toLowerCase();
          return av.localeCompare(bv) * dir;
        }
        case "jersey": {
          const av = a.jerseyNumber ?? Number.POSITIVE_INFINITY;
          const bv = b.jerseyNumber ?? Number.POSITIVE_INFINITY;
          return (av - bv) * dir;
        }
      }
    });
  }, [players, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function openCreate() {
    setEditingPlayer(undefined);
    setDialogOpen(true);
  }

  function openEdit(p: PlayerWithParent) {
    setEditingPlayer(p);
    setDialogOpen(true);
  }

  function handleDelete(p: PlayerWithParent) {
    if (!confirm(`Remove ${p.firstName} ${p.lastName} from the roster? This cannot be undone.`)) return;
    setPendingId(p.id);
    startTransition(async () => {
      try {
        await deletePlayerAction(tenantId, p.id);
        toast.success("Player removed");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  if (players.length === 0) {
    return (
      <>
        <EmptyRoster
          canEdit={canEdit}
          onAdd={openCreate}
          onImport={() => setImportOpen(true)}
        />
        <PlayerDialog
          key={editingPlayer?.id ?? "new"}
          tenantId={tenantId}
          player={editingPlayer}
          parentEmail={editingPlayer?.parent?.email ?? ""}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          showClubFields={showClubFields}
        />
        <RosterImportSheet
          key={importOpen ? "import-open" : "import-closed"}
          tenantId={tenantId}
          open={importOpen}
          onOpenChange={setImportOpen}
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, parent, or position"
              className="pl-9"
            />
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
              <Button variant="primary" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add player
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs uppercase tracking-wider text-ink-500">
          {filtered.length} {filtered.length === 1 ? "player" : "players"}
          {query && filtered.length !== players.length && (
            <span className="text-ink-700"> · filtered from {players.length}</span>
          )}
        </p>

        {filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Search className="h-8 w-8 text-ink-700 mx-auto mb-3" />
            <p className="text-ink-300 font-medium">No matches for &ldquo;{query}&rdquo;</p>
            <p className="text-xs text-ink-500 mt-1">Try a different search.</p>
          </Card>
        ) : (
          <>
            {/* md+ — dense sortable table with sticky header.
                Sticky offset (top-12) clears the page header stack so the
                column row stays visible as a 60-row roster scrolls. */}
            <div className="hidden md:block rounded-lg border border-line bg-pitch-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-pitch-800/95 backdrop-blur-sm">
                  <tr className="border-b border-line">
                    <SortHeader
                      label="Name"
                      active={sortKey === "name"}
                      dir={sortDir}
                      onClick={() => toggleSort("name")}
                      className="w-full"
                    />
                    <SortHeader
                      label="Age"
                      active={sortKey === "age"}
                      dir={sortDir}
                      onClick={() => toggleSort("age")}
                      align="left"
                    />
                    <SortHeader
                      label="Parent"
                      active={sortKey === "parent"}
                      dir={sortDir}
                      onClick={() => toggleSort("parent")}
                    />
                    {showClubFields && (
                      <SortHeader
                        label="#"
                        active={sortKey === "jersey"}
                        dir={sortDir}
                        onClick={() => toggleSort("jersey")}
                        align="left"
                      />
                    )}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const age = differenceInYears(new Date(), p.dob);
                    const isPending = pendingId === p.id;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-line/60 last:border-0 hover:bg-pitch-700/40 transition-colors group"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/t/${tenantSlug}/coach/roster/${p.id}`}
                            className="flex items-center gap-3 min-w-0"
                          >
                            <Avatar className="h-8 w-8 shrink-0 bg-turf-400/15 text-turf-200">
                              <AvatarFallback className="bg-transparent text-turf-200">
                                {getInitials(`${p.firstName} ${p.lastName}`)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="flex-1 min-w-0">
                              <span className="font-medium text-ink-50 truncate block">
                                {p.firstName} {p.lastName}
                              </span>
                              {showClubFields && p.position && (
                                <span className="text-xs text-ink-500 truncate block">
                                  {p.position}
                                </span>
                              )}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-ink-300 font-mono tabular-nums whitespace-nowrap">
                          {age}
                        </td>
                        <td className="px-4 py-2.5 text-ink-500 max-w-[260px]">
                          {p.parent ? (
                            <span className="inline-flex items-center gap-1.5 truncate">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{p.parent.email}</span>
                            </span>
                          ) : (
                            <span className="text-ink-700">—</span>
                          )}
                        </td>
                        {showClubFields && (
                          <td className="px-4 py-2.5 font-mono text-flood-400 tabular-nums whitespace-nowrap">
                            {p.jerseyNumber !== null && p.jerseyNumber !== undefined
                              ? `#${p.jerseyNumber}`
                              : ""}
                          </td>
                        )}
                        <td className="px-2 py-2.5 text-right">
                          {canEdit && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="iconSm" aria-label="Player actions">
                                  {isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MoreHorizontal className="h-4 w-4 text-ink-500" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  onClick={() => openEdit(p)}
                                  className="cursor-pointer"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(p)}
                                  className="cursor-pointer text-danger focus:text-danger"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* sm — keep the card layout so each row still has tap-friendly
                affordances on small screens. */}
            <div className="md:hidden space-y-2">
              {filtered.map((p) => {
                const age = differenceInYears(new Date(), p.dob);
                const isPending = pendingId === p.id;
                return (
                  <Card
                    key={p.id}
                    className="p-4 flex items-center gap-4 group transition-colors hover:border-turf-400/40"
                  >
                    <Avatar className="h-11 w-11 shrink-0 bg-turf-400/15 text-turf-200">
                      <AvatarFallback className="bg-transparent text-turf-200">
                        {getInitials(`${p.firstName} ${p.lastName}`)}
                      </AvatarFallback>
                    </Avatar>

                    <Link
                      href={`/t/${tenantSlug}/coach/roster/${p.id}`}
                      className="flex-1 min-w-0 block"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-ink-50 truncate">
                          {p.firstName} {p.lastName}
                        </p>
                        {showClubFields &&
                          p.jerseyNumber !== null &&
                          p.jerseyNumber !== undefined && (
                            <span className="font-mono text-xs text-flood-400 bg-flood-400/10 border border-flood-400/30 rounded px-1.5 py-0.5">
                              #{p.jerseyNumber}
                            </span>
                          )}
                        {showClubFields && p.position && (
                          <Badge variant="outline">{p.position}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-ink-500 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          Age {age}
                        </span>
                        <span className="text-ink-700">·</span>
                        <span className="font-mono">{format(p.dob, "MMM d, yyyy")}</span>
                        {p.parent && (
                          <>
                            <span className="text-ink-700">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {p.parent.email}
                            </span>
                          </>
                        )}
                      </div>
                    </Link>

                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="iconSm" aria-label="Player actions">
                            {isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4 text-ink-500" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => openEdit(p)} className="cursor-pointer">
                            <Pencil className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(p)}
                            className="cursor-pointer text-danger focus:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      <PlayerDialog
        key={editingPlayer?.id ?? "new"}
        tenantId={tenantId}
        player={editingPlayer}
        parentEmail={editingPlayer?.parent?.email ?? ""}
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditingPlayer(undefined);
        }}
        showClubFields={showClubFields}
      />

      <RosterImportSheet
        key={importOpen ? "open" : "closed"}
        tenantId={tenantId}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
  align?: "left" | "right";
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-2 text-${align} text-[11px] uppercase tracking-wider font-medium ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 transition-colors ${
          active ? "text-ink-50" : "text-ink-500 hover:text-ink-300"
        }`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </th>
  );
}

function EmptyRoster({
  canEdit,
  onAdd,
  onImport,
}: {
  canEdit: boolean;
  onAdd: () => void;
  onImport: () => void;
}) {
  return (
    <Card className="p-12 text-center">
      <div className="mx-auto h-16 w-16 rounded-full bg-turf-400/10 text-turf-300 flex items-center justify-center mb-4">
        <Users className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold text-ink-50">No players yet</h3>
      <p className="text-sm text-ink-500 mt-1 mb-6 max-w-sm mx-auto">
        Roster your first player and we&apos;ll auto-link their parent for messaging and attendance.
      </p>
      {canEdit && (
        <div className="flex flex-col items-center gap-2">
          <Button variant="primary" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Add your first player
          </Button>
          <button
            type="button"
            onClick={onImport}
            className="text-sm text-ink-500 hover:text-ink-50 transition-colors inline-flex items-center gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            …or import from a CSV
          </button>
        </div>
      )}
    </Card>
  );
}
