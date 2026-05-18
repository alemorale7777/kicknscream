"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/schedule/Markdown";
import { toast } from "sonner";
import { createDevelopmentNoteAction, deleteDevelopmentNoteAction } from "@/actions/development";
import { format, formatDistanceToNow, differenceInYears } from "date-fns";
import { getInitials, cn } from "@/lib/utils";
import {
  Search,
  Sparkles,
  Star,
  Trash2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import type { Player, DevelopmentNote, User } from "@prisma/client";

type NoteWithAuthor = DevelopmentNote & { author: User | null };
type PlayerLite = Player;

export function DevelopmentBoard({
  tenantId,
  players,
  notesByPlayer,
  currentUserId,
  canEditAny,
  categories,
}: {
  tenantId: string;
  players: PlayerLite[];
  notesByPlayer: Record<string, NoteWithAuthor[]>;
  currentUserId: string;
  canEditAny: boolean;
  categories: string[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(players[0]?.id ?? null);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)
    );
  }, [players, query]);

  const selected = players.find((p) => p.id === selectedId);
  const notes = selected ? notesByPlayer[selected.id] ?? [] : [];

  if (players.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Sparkles className="h-8 w-8 text-ink-700 mx-auto mb-3" />
        <p className="text-ink-50 font-medium">No players yet</p>
        <p className="text-xs text-ink-500 mt-1">Add players to your roster and you can start tracking their development.</p>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4 lg:gap-6">
      {/* Player list */}
      <aside className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a player"
            className="pl-9"
          />
        </div>
        <div className="space-y-1 max-h-[60vh] lg:max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
          {filteredPlayers.map((p) => {
            const playerNotes = notesByPlayer[p.id] ?? [];
            const lastNoteAt = playerNotes[0]?.createdAt;
            const ratings = playerNotes.filter((n) => n.rating).map((n) => n.rating!);
            const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
            const active = p.id === selectedId;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-md border p-2.5 text-left transition-all duration-[120ms]",
                  active
                    ? "border-turf-400/60 bg-turf-400/10"
                    : "border-line bg-pitch-800 hover:bg-pitch-700"
                )}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback>{getInitials(`${p.firstName} ${p.lastName}`)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium truncate", active && "text-turf-300")}>
                    {p.firstName} {p.lastName}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-ink-500">
                    <span className="font-mono">{playerNotes.length}</span> notes
                    {avgRating !== null && (
                      <>
                        <span className="text-ink-700">·</span>
                        <span className="inline-flex items-center gap-0.5 text-flood-400">
                          <Star className="h-3 w-3 fill-current" />
                          {avgRating.toFixed(1)}
                        </span>
                      </>
                    )}
                    {lastNoteAt && (
                      <>
                        <span className="text-ink-700">·</span>
                        <span suppressHydrationWarning>
                          {formatDistanceToNow(lastNoteAt, { addSuffix: true })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {active && <ChevronRight className="h-4 w-4 text-turf-300 shrink-0" />}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Player detail */}
      <main className="min-w-0 space-y-5">
        {selected ? (
          <>
            <Card className="p-5 flex items-center gap-4">
              <Avatar className="h-14 w-14 shrink-0">
                <AvatarFallback className="text-base">
                  {getInitials(`${selected.firstName} ${selected.lastName}`)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold tracking-[-0.02em]">
                  {selected.firstName} {selected.lastName}
                </h2>
                <div className="flex items-center gap-3 text-xs text-ink-500 mt-1 flex-wrap">
                  <span>Age {differenceInYears(new Date(), selected.dob)}</span>
                  <span className="text-ink-700">·</span>
                  <span className="font-mono">{format(selected.dob, "MMM d, yyyy")}</span>
                  {selected.position && (
                    <>
                      <span className="text-ink-700">·</span>
                      <Badge variant="outline">{selected.position}</Badge>
                    </>
                  )}
                  {selected.jerseyNumber !== null && selected.jerseyNumber !== undefined && (
                    <span className="font-mono text-flood-400 bg-flood-400/10 border border-flood-400/30 rounded px-1.5 py-0.5">
                      #{selected.jerseyNumber}
                    </span>
                  )}
                </div>
              </div>
            </Card>

            <NoteComposer tenantId={tenantId} playerId={selected.id} categories={categories} />

            <div className="space-y-3">
              {notes.length === 0 ? (
                <Card className="p-8 text-center border-dashed">
                  <Sparkles className="h-7 w-7 text-ink-700 mx-auto mb-3" />
                  <p className="text-ink-300 font-medium">No development notes yet</p>
                  <p className="text-xs text-ink-500 mt-1">
                    Drop the first note above — track strengths, focus areas, and progress over time.
                  </p>
                </Card>
              ) : (
                notes.map((n) => (
                  <NoteRow
                    key={n.id}
                    tenantId={tenantId}
                    note={n}
                    currentUserId={currentUserId}
                    canEditAny={canEditAny}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <Card className="p-10 text-center border-dashed">
            <p className="text-sm text-ink-500">Select a player to view their development notes.</p>
          </Card>
        )}
      </main>
    </div>
  );
}

function NoteComposer({
  tenantId,
  playerId,
  categories,
}: {
  tenantId: string;
  playerId: string;
  categories: string[];
}) {
  // Radix Select forbids empty-string values — sentinel for "no category".
  const NO_CATEGORY = "__none";
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>(NO_CATEGORY);
  const [rating, setRating] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (content.trim().length < 2) {
      toast.error("Note is too short");
      return;
    }
    startTransition(async () => {
      try {
        await createDevelopmentNoteAction({
          tenantId,
          playerId,
          category: category === NO_CATEGORY ? undefined : category,
          rating,
          content,
        });
        toast.success("Note saved");
        setContent("");
        setRating(null);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Card className="p-5 space-y-4 border-turf-400/30">
      <h3 className="text-sm font-semibold text-ink-50 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-turf-300" />
        Add development note
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dev-category">Category (optional)</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="dev-category">
              <SelectValue placeholder="Pick a focus area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>No category</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Rating (optional)</Label>
          <div className="inline-flex rounded-md border border-line bg-pitch-800 p-0.5 h-10">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? null : n)}
                className={cn(
                  "w-8 inline-flex items-center justify-center transition-colors duration-[120ms]",
                  rating !== null && n <= rating
                    ? "text-flood-400"
                    : "text-ink-700 hover:text-ink-500"
                )}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
              >
                <Star className={cn("h-4 w-4", rating !== null && n <= rating && "fill-current")} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        placeholder="What's their growth area? What did they nail this week? Supports **bold**, *italic*, and bullet lists."
      />

      <div className="flex justify-end">
        <Button variant="primary" disabled={pending || content.trim().length < 2} onClick={submit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save note"}
        </Button>
      </div>
    </Card>
  );
}

function NoteRow({
  tenantId,
  note,
  currentUserId,
  canEditAny,
}: {
  tenantId: string;
  note: NoteWithAuthor;
  currentUserId: string;
  canEditAny: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const canManage = note.authorId === currentUserId || canEditAny;
  const authorName = note.author?.name ?? note.author?.email ?? "Coach";

  function handleDelete() {
    if (!confirm("Delete this development note?")) return;
    startTransition(async () => {
      try {
        await deleteDevelopmentNoteAction(tenantId, note.id);
        toast.success("Note deleted");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10px]">{getInitials(authorName)}</AvatarFallback>
          </Avatar>
          <span className="font-medium text-ink-50">{authorName}</span>
          <span className="text-ink-500 text-xs" suppressHydrationWarning>
            {formatDistanceToNow(note.createdAt, { addSuffix: true })}
          </span>
          {note.category && <Badge variant="outline">{note.category}</Badge>}
          {note.rating !== null && note.rating !== undefined && (
            <span className="inline-flex items-center gap-0.5 text-flood-400">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={cn("h-3.5 w-3.5", i < note.rating! ? "fill-current" : "text-ink-700")}
                />
              ))}
            </span>
          )}
        </div>
        {canManage && (
          <Button variant="ghost" size="iconSm" onClick={handleDelete} disabled={pending} aria-label="Delete">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-ink-500 hover:text-danger" />}
          </Button>
        )}
      </div>
      <Markdown>{note.content}</Markdown>
    </Card>
  );
}
