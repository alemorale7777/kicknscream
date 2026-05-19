"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mergeParentAction } from "@/actions/parent";
import { Loader2, Users } from "lucide-react";

type Candidate = {
  id: string;
  email: string;
  name: string | null;
  playerCount: number;
};

/**
 * Search-and-merge UI. The candidate query is delegated to a server-action
 * passed in from the page (it needs the tenant scope), so this component
 * stays purely presentational + dispatches the final merge call. The
 * tombstone warning is deliberate — `mergeParents` in lib/parents.ts marks
 * the loser MERGED and there's no reverse-merge action.
 */
export function MergeParentSheet({
  tenantId,
  winnerId,
  open,
  onOpenChange,
  searchCandidates,
}: {
  tenantId: string;
  winnerId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Server action that returns matches for a query string. */
  searchCandidates: (q: string) => Promise<Candidate[]>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [selectedLoser, setSelectedLoser] = useState<Candidate | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!q.trim()) return;
    let cancelled = false;
    searchCandidates(q).then((r) => {
      if (!cancelled) setResults(r.filter((c) => c.id !== winnerId));
    });
    return () => {
      cancelled = true;
    };
  }, [q, searchCandidates, winnerId]);

  // Derive empty results when the query is cleared — no setState inside effect.
  const visibleResults = q.trim() ? results : [];

  function runMerge() {
    if (!selectedLoser) return;
    startTransition(async () => {
      try {
        await mergeParentAction({
          tenantId,
          winnerId,
          loserId: selectedLoser.id,
        });
        toast.success("Parents merged");
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Merge duplicate parent</SheetTitle>
          <SheetDescription>
            Pick the duplicate parent record. Their kids, bookings, and
            invoices will move to this one. The duplicate becomes a tombstone —
            this can&apos;t be undone.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            autoFocus
          />
          <ul className="divide-y divide-line">
            {visibleResults.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedLoser(c)}
                  className={`w-full text-left p-3 hover:bg-pitch-700 ${
                    selectedLoser?.id === c.id
                      ? "bg-turf-400/10 border-l-2 border-turf-400"
                      : ""
                  }`}
                >
                  <p className="font-medium text-ink-50">
                    {c.name ?? c.email}
                  </p>
                  <p className="text-xs text-ink-500">{c.email}</p>
                  <p className="text-[10px] text-ink-500 inline-flex items-center gap-1 mt-1">
                    <Users className="h-3 w-3" />
                    {c.playerCount}{" "}
                    {c.playerCount === 1 ? "kid" : "kids"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {selectedLoser && (
            <div className="rounded-md border border-warn/40 bg-warn/5 p-3 text-xs text-warn">
              About to merge{" "}
              <strong>{selectedLoser.name ?? selectedLoser.email}</strong> into
              this parent. {selectedLoser.playerCount} kids + all bookings +
              invoices will be re-pointed.
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={runMerge}
            disabled={!selectedLoser || pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Merge
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
