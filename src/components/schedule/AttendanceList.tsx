"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { markAttendanceAction, bulkMarkAttendanceAction } from "@/actions/attendance";
import { getInitials, cn } from "@/lib/utils";
import { Check, X, Clock, AlertCircle, MinusCircle, CheckSquare, Users } from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";

type Entry = {
  player: { id: string; firstName: string; lastName: string };
  status: AttendanceStatus | "PENDING";
  attendanceId?: string;
};

const STATUS_CONFIG: Record<
  AttendanceStatus | "PENDING",
  { label: string; icon: typeof Check; tone: string; bg: string; border: string }
> = {
  PRESENT: { label: "Present", icon: Check, tone: "text-turf-300", bg: "bg-turf-400/15", border: "border-turf-400/50" },
  LATE: { label: "Late", icon: Clock, tone: "text-warn", bg: "bg-warn/15", border: "border-warn/50" },
  ABSENT: { label: "Absent", icon: X, tone: "text-danger", bg: "bg-danger/15", border: "border-danger/50" },
  EXCUSED: { label: "Excused", icon: MinusCircle, tone: "text-ink-300", bg: "bg-pitch-700", border: "border-line" },
  PENDING: { label: "Pending", icon: AlertCircle, tone: "text-ink-500", bg: "bg-pitch-700", border: "border-line" },
};

const CYCLE: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

export function AttendanceList({
  tenantId,
  eventId,
  entries: initialEntries,
  canEdit,
}: {
  tenantId: string;
  eventId: string;
  entries: Entry[];
  canEdit: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  function cycle(playerId: string, current: AttendanceStatus | "PENDING") {
    const idx = current === "PENDING" ? -1 : CYCLE.indexOf(current as AttendanceStatus);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    setStatus(playerId, next);
  }

  function setStatus(playerId: string, status: AttendanceStatus) {
    setEntries((prev) =>
      prev.map((e) => (e.player.id === playerId ? { ...e, status } : e))
    );
    setPendingIds((s) => new Set(s).add(playerId));
    import("@/lib/analytics").then(({ track }) =>
      track("attendance_marked", { eventId, status })
    );
    startTransition(async () => {
      try {
        await markAttendanceAction({ tenantId, eventId, playerId, status });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingIds((s) => {
          const next = new Set(s);
          next.delete(playerId);
          return next;
        });
      }
    });
  }

  function bulkMark(status: AttendanceStatus) {
    const playerIds = entries.map((e) => e.player.id);
    if (playerIds.length === 0) return;
    setEntries((prev) => prev.map((e) => ({ ...e, status })));
    startTransition(async () => {
      try {
        await bulkMarkAttendanceAction({ tenantId, eventId, status, playerIds });
        toast.success(`Marked all ${STATUS_CONFIG[status].label.toLowerCase()}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const counts = entries.reduce(
    (acc, e) => {
      acc[e.status] = (acc[e.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<AttendanceStatus | "PENDING", number>
  );

  if (entries.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <Users className="h-7 w-7 text-ink-700 mx-auto mb-3" />
        <p className="text-ink-300 font-medium">No one enrolled yet</p>
        <p className="text-xs text-ink-500 mt-1">When parents book this program, they show up here for check-in.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary row + bulk actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 flex-wrap">
          {(["PRESENT", "LATE", "ABSENT", "EXCUSED", "PENDING"] as const).map((s) => (
            <Badge
              key={s}
              variant="outline"
              className={cn(STATUS_CONFIG[s].border, STATUS_CONFIG[s].tone, "bg-transparent")}
            >
              {STATUS_CONFIG[s].label} · {counts[s] ?? 0}
            </Badge>
          ))}
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkMark("PRESENT")}
            className="border-turf-400/40 text-turf-300 hover:bg-turf-400/10"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Mark all present
          </Button>
        )}
      </div>

      {/* Roster rows */}
      <div className="space-y-2">
        {entries.map((entry) => {
          const cfg = STATUS_CONFIG[entry.status];
          const Icon = cfg.icon;
          const isPending = pendingIds.has(entry.player.id);
          return (
            <Card
              key={entry.player.id}
              className={cn(
                "p-3 sm:p-4 flex items-center gap-3",
                entry.status === "PRESENT" && "border-turf-400/30",
                entry.status === "LATE" && "border-warn/30",
                entry.status === "ABSENT" && "border-danger/30"
              )}
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback>
                  {getInitials(`${entry.player.firstName} ${entry.player.lastName}`)}
                </AvatarFallback>
              </Avatar>
              <p className="flex-1 min-w-0 font-medium truncate">
                {entry.player.firstName} {entry.player.lastName}
              </p>
              {canEdit ? (
                <>
                  {/* Mobile: tap-to-cycle pill */}
                  <button
                    type="button"
                    onClick={() => cycle(entry.player.id, entry.status)}
                    disabled={isPending}
                    className={cn(
                      "sm:hidden inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-all duration-[120ms] active:scale-[0.97]",
                      cfg.bg,
                      cfg.border,
                      cfg.tone
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                  </button>

                  {/* Desktop: 4-button toggle group */}
                  <div className="hidden sm:inline-flex rounded-md border border-line bg-pitch-800 p-0.5">
                    {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendanceStatus[]).map((s) => {
                      const sCfg = STATUS_CONFIG[s];
                      const SIcon = sCfg.icon;
                      const active = entry.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(entry.player.id, s)}
                          disabled={isPending}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors duration-[120ms]",
                            active
                              ? cn("bg-pitch-700", sCfg.tone)
                              : "text-ink-500 hover:text-ink-300"
                          )}
                          aria-pressed={active}
                          aria-label={sCfg.label}
                        >
                          <SIcon className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">{sCfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <Badge variant="outline" className={cn(cfg.border, cfg.tone)}>
                  <Icon className="h-3 w-3 mr-1" />
                  {cfg.label}
                </Badge>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
