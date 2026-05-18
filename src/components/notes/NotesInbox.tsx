"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Search,
  X,
} from "lucide-react";

type Row = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  programId: string | null;
  programName: string | null;
  playerId: string | null;
  playerName: string | null;
  authorId: string;
  authorName: string;
  content: string;
  visibleToParent: boolean;
  createdAt: string;
};

const ALL = "__all__";

export function NotesInbox({
  tenantSlug,
  rows,
  players,
  programs,
  selectedPlayerId,
  selectedProgramId,
}: {
  tenantSlug: string;
  rows: Row[];
  players: { id: string; firstName: string; lastName: string }[];
  programs: { id: string; name: string }[];
  selectedPlayerId: string | null;
  selectedProgramId: string | null;
}) {
  const [playerId, setPlayerId] = useState<string>(selectedPlayerId ?? ALL);
  const [programId, setProgramId] = useState<string>(selectedProgramId ?? ALL);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (playerId !== ALL && r.playerId !== playerId) return false;
      if (programId !== ALL && r.programId !== programId) return false;
      if (needle) {
        const haystack = [
          r.content,
          r.eventTitle,
          r.playerName ?? "",
          r.authorName,
          r.programName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, playerId, programId, search]);

  const hasFilters =
    playerId !== ALL || programId !== ALL || search.trim().length > 0;

  function clear() {
    setPlayerId(ALL);
    setProgramId(ALL);
    setSearch("");
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-ink-500 inline-flex items-center gap-1.5">
              <Search className="h-3 w-3" />
              Search
            </label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, event titles, players…"
            />
          </div>
          <div className="space-y-1.5 sm:w-48">
            <label className="text-xs uppercase tracking-wider text-ink-500">
              Player
            </label>
            <Select value={playerId} onValueChange={setPlayerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All players</SelectItem>
                {players.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:w-48">
            <label className="text-xs uppercase tracking-wider text-ink-500">
              Program
            </label>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All programs</SelectItem>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-pitch-700 px-3 text-xs text-ink-300 hover:bg-pitch-700/60"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
          <Filter className="h-3 w-3" />
          {filtered.length} of {rows.length}{" "}
          {rows.length === 1 ? "note" : "notes"}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <ClipboardList className="h-8 w-8 text-ink-500 mx-auto" />
          <p className="text-sm text-ink-300 mt-3">
            {rows.length === 0
              ? "No session notes yet. Notes show up here once a coach writes one on an event detail page."
              : "No notes match these filters."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((n) => (
            <li key={n.id}>
              <Card className="p-4">
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-50 truncate">
                      {n.eventTitle}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {format(new Date(n.eventStartsAt), "MMM d, yyyy · h:mm a")}
                      {n.programName && (
                        <>
                          {" · "}
                          <span className="text-ink-300">{n.programName}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/t/${tenantSlug}/coach/schedule/${n.eventId}`}
                    className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-50 shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open event
                  </Link>
                </header>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {n.playerName ? (
                    <Badge
                      variant="outline"
                      className="border-turf-400/30 text-turf-300 bg-turf-400/5"
                    >
                      {n.playerName}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-line text-ink-500"
                    >
                      Whole session
                    </Badge>
                  )}
                  <span className="text-ink-500">by {n.authorName}</span>
                  <span className="text-ink-500">
                    · {format(new Date(n.createdAt), "MMM d, h:mm a")}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      n.visibleToParent
                        ? "border-turf-400/30 text-turf-300"
                        : "border-warn/30 text-warn"
                    }
                  >
                    {n.visibleToParent ? (
                      <>
                        <Eye className="h-3 w-3 mr-1" />
                        Visible to parent
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3 mr-1" />
                        Coach-only
                      </>
                    )}
                  </Badge>
                </div>

                <p className="mt-3 text-sm text-ink-300 whitespace-pre-wrap leading-relaxed">
                  {n.content}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
