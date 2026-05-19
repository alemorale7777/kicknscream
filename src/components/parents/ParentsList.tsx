"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCents, cn } from "@/lib/utils";
import { formatInTimeZone } from "date-fns-tz";
import { Search, UsersRound } from "lucide-react";

export type ParentsListRow = {
  parentId: string;
  status: "ACTIVE" | "REVOKED";
  parent: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    userId: string | null;
    claimedAt: Date | null;
    deletedAt: Date | null;
  };
  playerCount: number;
  lastBookingAt: Date | null;
  lifetimeCents: number;
  outstandingCents: number;
};

const FILTERS = ["all", "claimed", "unclaimed", "outstanding", "revoked"] as const;
type Filter = (typeof FILTERS)[number];

function parseFilter(value: string | null): Filter {
  return (FILTERS as readonly string[]).includes(value ?? "")
    ? (value as Filter)
    : "all";
}

export function ParentsList({
  tenantSlug,
  tenantTimeZone,
  rows,
}: {
  tenantSlug: string;
  tenantTimeZone: string;
  rows: ParentsListRow[];
}) {
  const searchParams = useSearchParams();
  // Initial state seeded from the URL so refresh / share / back-button preserve
  // the view. Subsequent changes write back via history.replaceState so we
  // don't trigger a full Next.js server roundtrip on every keystroke.
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [filter, setFilter] = useState<Filter>(() =>
    parseFilter(searchParams.get("status"))
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    if (filter !== "all") url.searchParams.set("status", filter);
    else url.searchParams.delete("status");
    window.history.replaceState(null, "", url.toString());
  }, [q, filter]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "claimed" && !r.parent.claimedAt) return false;
      if (filter === "unclaimed" && r.parent.claimedAt) return false;
      if (filter === "outstanding" && r.outstandingCents === 0) return false;
      if (filter === "revoked" && r.status !== "REVOKED") return false;
      if (!needle) return true;
      return (
        r.parent.email.toLowerCase().includes(needle) ||
        (r.parent.name?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [rows, q, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by parent name or email"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs uppercase tracking-wider transition-colors",
                filter === f
                  ? "border-turf-400/60 bg-turf-400/10 text-turf-300"
                  : "border-line bg-pitch-800 text-ink-500 hover:text-ink-300"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <UsersRound className="h-7 w-7 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">No parents match</p>
          <p className="text-xs text-ink-500 mt-1">
            Adjust the filter or search to see more — when someone books, they
            show up here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link
              key={r.parentId}
              href={`/t/${tenantSlug}/coach/parents/${r.parentId}`}
              prefetch={false}
              className="block"
            >
              <Card
                className={cn(
                  "p-4 flex items-center gap-4 transition-colors hover:bg-pitch-800/40",
                  r.status === "REVOKED" && "opacity-60"
                )}
              >
                <div className="hidden sm:flex h-10 w-10 rounded-full bg-pitch-700 items-center justify-center text-xs font-mono text-ink-300 shrink-0">
                  {(r.parent.name ?? r.parent.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-ink-50 truncate">
                      {r.parent.name ?? r.parent.email}
                    </p>
                    {r.parent.deletedAt && (
                      <Badge variant="outline" className="border-line text-ink-500">
                        Deleted
                      </Badge>
                    )}
                    {r.status === "REVOKED" && (
                      <Badge variant="outline" className="border-warn/40 text-warn">
                        Revoked
                      </Badge>
                    )}
                    {!r.parent.claimedAt && r.status === "ACTIVE" && (
                      <Badge variant="outline" className="border-flood-400/40 text-flood-400">
                        Unclaimed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-500 truncate">{r.parent.email}</p>
                </div>
                <div className="hidden md:flex flex-col text-right shrink-0 min-w-[80px]">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">Kids</span>
                  <span className="font-mono text-sm">{r.playerCount}</span>
                </div>
                <div className="hidden md:flex flex-col text-right shrink-0 min-w-[120px]">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">Last booking</span>
                  <span className="font-mono text-xs text-ink-300">
                    {r.lastBookingAt
                      ? formatInTimeZone(r.lastBookingAt, tenantTimeZone, "MMM d")
                      : "—"}
                  </span>
                </div>
                <div className="hidden md:flex flex-col text-right shrink-0 min-w-[100px]">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">Lifetime</span>
                  <span className="font-mono text-sm">{formatCents(r.lifetimeCents)}</span>
                </div>
                <div className="flex flex-col text-right shrink-0 min-w-[100px]">
                  <span className="text-[10px] uppercase tracking-wider text-ink-500">Outstanding</span>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      r.outstandingCents > 0 ? "text-danger" : "text-ink-500"
                    )}
                  >
                    {r.outstandingCents > 0 ? formatCents(r.outstandingCents) : "—"}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
