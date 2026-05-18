"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { setPermissionOverrideAction } from "@/actions/permissions";
import { Lock } from "lucide-react";
import type { Role, PermissionLevel } from "@prisma/client";
import { cn } from "@/lib/utils";

type Cell = { role: Role; level: PermissionLevel; overridden: boolean };
type Row = { group: string; feature: string; label: string; cells: Cell[] };

const LEVEL_CYCLE: PermissionLevel[] = ["NONE", "VIEW", "EDIT"];

const LEVEL_STYLES: Record<PermissionLevel, { dot: string; text: string; bg: string }> = {
  NONE: { dot: "bg-ink-700", text: "text-ink-700", bg: "bg-pitch-800" },
  VIEW: { dot: "bg-warn", text: "text-warn", bg: "bg-warn/10" },
  EDIT: { dot: "bg-turf-400", text: "text-turf-300", bg: "bg-turf-400/10" },
};

/**
 * Tenant-level permission matrix. Rows are features grouped by domain;
 * columns are the five roles. OWNER's column is read-only to keep the
 * tenant from being bricked. Every other cell cycles NONE → VIEW → EDIT
 * on click.
 *
 * The optimistic update lands the new state in local state immediately;
 * a server action persists the override row and surfaces a toast on
 * success or failure. Failures roll the cell back.
 */
export function PermissionMatrix({
  tenantId,
  roles,
  rows: initialRows,
}: {
  tenantId: string;
  roles: Role[];
  rows: Row[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function nextLevel(level: PermissionLevel): PermissionLevel {
    const i = LEVEL_CYCLE.indexOf(level);
    return LEVEL_CYCLE[(i + 1) % LEVEL_CYCLE.length];
  }

  function setCell(rowIdx: number, cellIdx: number, level: PermissionLevel) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === rowIdx
          ? {
              ...r,
              cells: r.cells.map((c, j) =>
                j === cellIdx ? { ...c, level } : c
              ),
            }
          : r
      )
    );
  }

  function cycle(rowIdx: number, cellIdx: number) {
    const row = rows[rowIdx];
    const cell = row.cells[cellIdx];
    if (cell.role === "OWNER") return;
    const next = nextLevel(cell.level);
    const prev = cell.level;
    setCell(rowIdx, cellIdx, next);
    const key = `${cell.role}:${row.feature}`;
    setPendingKey(key);
    startTransition(async () => {
      try {
        await setPermissionOverrideAction({
          tenantId,
          role: cell.role,
          feature: row.feature,
          level: next,
        });
      } catch (e) {
        setCell(rowIdx, cellIdx, prev);
        toast.error((e as Error).message);
      } finally {
        setPendingKey(null);
      }
    });
  }

  // Group rows by their group label for visual sectioning.
  const grouped: Record<string, Row[]> = {};
  for (const row of rows) {
    if (!grouped[row.group]) grouped[row.group] = [];
    grouped[row.group].push(row);
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pitch-900/40">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-ink-500 font-medium">
                Feature
              </th>
              {roles.map((role) => (
                <th
                  key={role}
                  className="px-3 py-2.5 text-center text-[11px] uppercase tracking-wider text-ink-500 font-medium"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {role}
                    {role === "OWNER" && <Lock className="h-3 w-3 text-ink-700" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([groupLabel, groupRows]) => (
              <>
                <tr key={`g-${groupLabel}`} className="bg-pitch-900/30">
                  <td
                    colSpan={roles.length + 1}
                    className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-ink-500 font-medium"
                  >
                    {groupLabel}
                  </td>
                </tr>
                {groupRows.map((row) => {
                  const rowIdx = rows.indexOf(row);
                  return (
                    <tr
                      key={row.feature}
                      className="border-b border-line/40 last:border-0"
                    >
                      <td className="px-4 py-2 text-ink-300">{row.label}</td>
                      {row.cells.map((cell, cellIdx) => {
                        const style = LEVEL_STYLES[cell.level];
                        const isOwner = cell.role === "OWNER";
                        const key = `${cell.role}:${row.feature}`;
                        const isPending = pending && pendingKey === key;
                        return (
                          <td
                            key={cell.role}
                            className="px-2 py-1.5 text-center"
                          >
                            <button
                              type="button"
                              onClick={() => cycle(rowIdx, cellIdx)}
                              disabled={isOwner || isPending}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors min-w-[72px] justify-center",
                                style.bg,
                                cell.overridden
                                  ? "border-flood-400/40"
                                  : "border-line",
                                style.text,
                                isOwner
                                  ? "cursor-not-allowed opacity-60"
                                  : "hover:border-ink-300 cursor-pointer",
                                isPending && "opacity-60"
                              )}
                              aria-label={`${cell.role} can ${cell.level.toLowerCase()} ${row.label}`}
                            >
                              <span
                                className={cn("h-1.5 w-1.5 rounded-full", style.dot)}
                              />
                              {cell.level.toLowerCase()}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line bg-pitch-900/30 px-4 py-2.5 text-[11px] text-ink-500 flex flex-wrap gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-turf-400" /> edit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" /> view-only
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-700" /> blocked
        </span>
        <span className="ml-auto text-ink-700">
          A floodlight border marks a cell overridden from its default.
        </span>
      </div>
    </Card>
  );
}
