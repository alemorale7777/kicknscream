"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createSessionNoteAction } from "@/actions/sessionNote";
import { Markdown } from "./Markdown";
import { Eye, PencilLine, Mail, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type PlayerLite = { id: string; firstName: string; lastName: string };

const SNIPPETS = [
  "Strong session today —",
  "Worked on **first-touch** and **ball control**.",
  "Areas to keep practicing at home:\n- ",
];

export function SessionNoteComposer({
  tenantId,
  eventId,
  players,
}: {
  tenantId: string;
  eventId: string;
  players: PlayerLite[];
}) {
  const [content, setContent] = useState("");
  const [playerId, setPlayerId] = useState<string>(players[0]?.id ?? "");
  const [visibleToParent, setVisibleToParent] = useState(true);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (content.trim().length < 2) {
      toast.error("Note is too short");
      return;
    }
    startTransition(async () => {
      try {
        await createSessionNoteAction({
          tenantId,
          eventId,
          playerId: playerId || null,
          content,
          visibleToParent,
        });
        toast.success(
          visibleToParent && playerId
            ? "Note saved · parent emailed"
            : "Note saved"
        );
        setContent("");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function appendSnippet(s: string) {
    setContent((c) => (c ? `${c}\n${s}` : s));
  }

  return (
    <Card className="p-5 space-y-4 border-turf-400/30">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-turf-400/15 text-turf-300 flex items-center justify-center">
            <PencilLine className="h-4 w-4" />
          </div>
          <h3 className="font-semibold text-ink-50">Add a session note</h3>
        </div>
        <div className="inline-flex rounded-md border border-line bg-pitch-800 p-0.5">
          <button
            type="button"
            onClick={() => setTab("write")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors duration-[120ms]",
              tab === "write" ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
            )}
          >
            <PencilLine className="h-3 w-3" /> Write
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors duration-[120ms]",
              tab === "preview" ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
            )}
          >
            <Eye className="h-3 w-3" /> Preview
          </button>
        </div>
      </div>

      {tab === "write" ? (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="What did they work on? What's the next step?

Supports **bold**, *italic*, and bullet lists with - dashes."
          className="resize-y"
        />
      ) : (
        <div className="min-h-[120px] rounded-md border border-line bg-pitch-900/40 p-4">
          {content ? (
            <Markdown>{content}</Markdown>
          ) : (
            <p className="text-ink-700 text-sm italic">Preview appears here.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] uppercase tracking-wider text-ink-500 inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Snippets
        </span>
        {SNIPPETS.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => appendSnippet(s)}
            className="px-2 py-1 rounded-md text-[11px] border border-line bg-pitch-800 text-ink-300 hover:border-turf-400/50 hover:text-ink-50 transition-colors duration-[120ms]"
          >
            {s.split("\n")[0].slice(0, 26)}…
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end pt-3 border-t border-line">
        <div className="space-y-1.5">
          <Label htmlFor="note-player">Tag a player (optional)</Label>
          <Select value={playerId} onValueChange={setPlayerId}>
            <SelectTrigger id="note-player">
              <SelectValue placeholder="General note (no player)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">General note (no player)</SelectItem>
              {players.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-ink-500">
            Tagged notes appear on the player&apos;s history. Parents only receive a note when one is tagged.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <label className="flex items-center gap-2 text-xs text-ink-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visibleToParent}
              onChange={(e) => setVisibleToParent(e.target.checked)}
              className="rounded border-line bg-pitch-700 text-turf-400 focus:ring-turf-400/30"
            />
            <Mail className="h-3.5 w-3.5 text-turf-300" />
            Email parent
          </label>
          <Button onClick={submit} disabled={pending || content.trim().length < 2} variant="primary">
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save note"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
