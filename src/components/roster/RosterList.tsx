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
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerWithParent | undefined>(undefined);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      const full = `${p.firstName} ${p.lastName}`.toLowerCase();
      const parent = (p.parent?.name ?? p.parent?.email ?? "").toLowerCase();
      const pos = (p.position ?? "").toLowerCase();
      return full.includes(q) || parent.includes(q) || pos.includes(q);
    });
  }, [players, query]);

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
        <EmptyRoster canEdit={canEdit} onAdd={openCreate} />
        <PlayerDialog
          tenantId={tenantId}
          player={editingPlayer}
          parentEmail={editingPlayer?.parent?.email ?? ""}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          showClubFields={showClubFields}
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
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add player
            </Button>
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
          <div className="space-y-2">
            {filtered.map((p) => {
              const age = differenceInYears(new Date(), p.dob);
              const isPending = pendingId === p.id;
              return (
                <Card key={p.id} className="p-4 flex items-center gap-4 group transition-colors hover:border-turf-400/40">
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarFallback>{getInitials(`${p.firstName} ${p.lastName}`)}</AvatarFallback>
                  </Avatar>

                  <Link href={`/t/${tenantSlug}/roster/${p.id}`} className="flex-1 min-w-0 block group/link">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-ink-50 truncate">
                        {p.firstName} {p.lastName}
                      </p>
                      {showClubFields && p.jerseyNumber !== null && p.jerseyNumber !== undefined && (
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
        )}
      </div>

      <PlayerDialog
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
    </>
  );
}

function EmptyRoster({ canEdit, onAdd }: { canEdit: boolean; onAdd: () => void }) {
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
        <Button variant="primary" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add your first player
        </Button>
      )}
    </Card>
  );
}
