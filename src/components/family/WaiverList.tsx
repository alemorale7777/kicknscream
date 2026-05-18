"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/schedule/Markdown";
import { toast } from "sonner";
import { signWaiverAction } from "@/actions/waiver";
import { format } from "date-fns";
import { CheckCircle2, Loader2, AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  waiverId: string;
  waiverTitle: string;
  waiverBody: string;
  required: boolean;
  playerId: string;
  playerName: string;
  signed: boolean;
  signedAt: string | null;
  signerName: string | null;
};

/**
 * Renders one row per (waiver × kid). Unsigned rows expand to show the
 * waiver body + a typed-signature flow. Signed rows collapse to a
 * "Signed by Jane Doe on …" line and stay open for re-read but the form
 * is replaced with a green confirmation.
 *
 * Server-side action enforces parent-ownership; the typed name on the form
 * is captured separately from the session email so the audit trail records
 * what the user actually typed.
 */
export function WaiverList({
  signerEmailHint,
  defaultSignerName,
  rows,
}: {
  signerEmailHint: string;
  defaultSignerName: string;
  rows: Row[];
}) {
  // Group by waiver so each waiver has a top-level card; each kid is a
  // sub-row inside it.
  const byWaiver = new Map<string, { title: string; body: string; required: boolean; players: Row[] }>();
  for (const r of rows) {
    if (!byWaiver.has(r.waiverId)) {
      byWaiver.set(r.waiverId, {
        title: r.waiverTitle,
        body: r.waiverBody,
        required: r.required,
        players: [],
      });
    }
    byWaiver.get(r.waiverId)!.players.push(r);
  }

  return (
    <div className="space-y-3">
      {Array.from(byWaiver.entries()).map(([waiverId, w]) => {
        const pendingCount = w.players.filter((p) => !p.signed).length;
        return (
          <Card key={waiverId} className="overflow-hidden">
            <details className="group" open={pendingCount > 0}>
              <summary className="cursor-pointer list-none px-5 py-4 flex items-center gap-3 hover:bg-pitch-700/30">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink-50">{w.title}</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {pendingCount > 0
                      ? `Needs signature for ${pendingCount} ${pendingCount === 1 ? "kid" : "kids"}`
                      : "All signed"}
                  </p>
                </div>
                {w.required && pendingCount > 0 && (
                  <Badge variant="outline" className="border-warn/40 text-warn bg-warn/10">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Required
                  </Badge>
                )}
                {pendingCount === 0 && (
                  <Badge variant="outline" className="border-turf-400/40 text-turf-300 bg-turf-400/10">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Done
                  </Badge>
                )}
                <ChevronDown className="h-4 w-4 text-ink-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line">
                <div className="px-5 py-4 text-sm text-ink-300 leading-relaxed bg-pitch-900/40">
                  <Markdown>{w.body}</Markdown>
                </div>
                <ul className="divide-y divide-line">
                  {w.players.map((p) => (
                    <li key={p.playerId} className="px-5 py-4">
                      <SignRow
                        row={p}
                        signerEmailHint={signerEmailHint}
                        defaultSignerName={defaultSignerName}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </Card>
        );
      })}
    </div>
  );
}

function SignRow({
  row,
  signerEmailHint,
  defaultSignerName,
}: {
  row: Row;
  signerEmailHint: string;
  defaultSignerName: string;
}) {
  const [name, setName] = useState(defaultSignerName);
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [signed, setSigned] = useState(row.signed);
  const [signedMeta, setSignedMeta] = useState<{
    name: string | null;
    at: string | null;
  }>({ name: row.signerName, at: row.signedAt });

  function sign() {
    if (!confirm) {
      toast.error("Tick the confirm box first — we need to record that you agreed.");
      return;
    }
    if (!name.trim()) {
      toast.error("Type your full name to sign.");
      return;
    }
    startTransition(async () => {
      try {
        await signWaiverAction({
          waiverId: row.waiverId,
          playerId: row.playerId,
          signerName: name.trim(),
        });
        setSigned(true);
        setSignedMeta({ name: name.trim(), at: new Date().toISOString() });
        toast.success(`Signed for ${row.playerName}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (signed) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink-50">{row.playerName}</p>
          <p className="text-xs text-ink-500 mt-0.5">
            Signed by{" "}
            <span className="text-ink-300">{signedMeta.name ?? "—"}</span>
            {signedMeta.at && (
              <>
                {" "}· {format(new Date(signedMeta.at), "MMM d, yyyy · h:mm a")}
              </>
            )}
          </p>
        </div>
        <Badge variant="outline" className="border-turf-400/40 text-turf-300 bg-turf-400/10">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Signed
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-medium text-ink-50">{row.playerName}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`name-${row.playerId}`}>Your full legal name</Label>
          <Input
            id={`name-${row.playerId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As it appears on official documents"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Signing as</Label>
          <Input value={signerEmailHint} disabled className="bg-pitch-900 text-ink-500" />
        </div>
      </div>
      <label
        className={cn(
          "flex items-start gap-2 cursor-pointer select-none text-xs text-ink-300 rounded-md border border-line bg-pitch-700/30 p-3"
        )}
      >
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-0.5 rounded border-line bg-pitch-700 text-turf-400 focus:ring-turf-400/30"
        />
        <span>
          I confirm that typing my name above and checking this box constitutes my
          legal signature for this waiver on behalf of <strong>{row.playerName}</strong>.
        </span>
      </label>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="primary"
          onClick={sign}
          disabled={pending || !confirm || !name.trim()}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign waiver
        </Button>
      </div>
    </div>
  );
}
