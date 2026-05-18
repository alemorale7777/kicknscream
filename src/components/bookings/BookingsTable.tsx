"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";
import { format, isPast } from "date-fns";
import {
  ClipboardList,
  ArrowUpDown,
  Search,
  X,
  Calendar as CalendarIcon,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

type StatusKey = "ACTIVE" | "PENDING" | "WAITLIST" | "COMPLETED" | "CANCELED" | "CONFIRMED" | "PAID" | "ATTENDED" | "NO_SHOW" | "REFUNDED";

const STATUS_META: Record<
  string,
  { label: string; tone: string; border: string; bg: string }
> = {
  ACTIVE: { label: "Active", tone: "text-turf-300", border: "border-turf-400/40", bg: "bg-turf-400/10" },
  CONFIRMED: { label: "Confirmed", tone: "text-turf-300", border: "border-turf-400/40", bg: "bg-turf-400/10" },
  PAID: { label: "Paid", tone: "text-turf-300", border: "border-turf-400/40", bg: "bg-turf-400/10" },
  ATTENDED: { label: "Attended", tone: "text-turf-300", border: "border-turf-400/40", bg: "bg-turf-400/10" },
  PENDING: { label: "Pending", tone: "text-warn", border: "border-warn/40", bg: "bg-warn/10" },
  WAITLIST: { label: "Waitlist", tone: "text-ink-300", border: "border-line", bg: "bg-pitch-700" },
  COMPLETED: { label: "Completed", tone: "text-turf-300", border: "border-turf-400/40", bg: "bg-turf-400/10" },
  NO_SHOW: { label: "No-show", tone: "text-danger", border: "border-danger/40", bg: "bg-danger/10" },
  CANCELED: { label: "Canceled", tone: "text-ink-700", border: "border-line", bg: "bg-pitch-800" },
  REFUNDED: { label: "Refunded", tone: "text-ink-500", border: "border-line", bg: "bg-pitch-800" },
};

export type BookingRow = {
  enrollmentId: string;
  status: StatusKey;
  invoiceStatus: string | null;
  amount: number | null;
  playerId: string;
  playerName: string;
  programId: string;
  programName: string;
  parentEmail: string | null;
  eventId: string | null;
  eventStart: string | null; // ISO
};

export function BookingsTable({
  tenantSlug,
  rows,
}: {
  tenantSlug: string;
  rows: BookingRow[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey | "ALL">("ALL");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "eventStart", desc: true },
  ]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.playerName.toLowerCase().includes(q) ||
        r.programName.toLowerCase().includes(q) ||
        (r.parentEmail?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, statusFilter]);

  const columns: ColumnDef<BookingRow>[] = useMemo(
    () => [
      {
        accessorKey: "playerName",
        header: ({ column }) => (
          <SortBtn label="Player" onClick={() => column.toggleSorting()} />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-pitch-700 text-ink-300 flex items-center justify-center shrink-0 font-mono text-[10px]">
              {row.original.playerName
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <span className="truncate font-medium text-ink-50">{row.original.playerName}</span>
          </div>
        ),
      },
      {
        accessorKey: "programName",
        header: ({ column }) => (
          <SortBtn label="Service" onClick={() => column.toggleSorting()} />
        ),
        cell: ({ row }) => (
          <span className="truncate text-ink-300">{row.original.programName}</span>
        ),
      },
      {
        accessorKey: "eventStart",
        header: ({ column }) => (
          <SortBtn label="When" onClick={() => column.toggleSorting()} />
        ),
        cell: ({ row }) => {
          if (!row.original.eventStart) {
            return <span className="text-ink-700 text-xs">—</span>;
          }
          const d = new Date(row.original.eventStart);
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-300">
              <CalendarIcon className="h-3 w-3 text-ink-500" />
              {format(d, "MMM d · h:mm a")}
              {isPast(d) && <span className="text-[10px] uppercase tracking-wider text-ink-700">past</span>}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status] ?? STATUS_META.PENDING;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                meta.bg,
                meta.border,
                meta.tone
              )}
            >
              {meta.label}
            </span>
          );
        },
      },
      {
        accessorKey: "amount",
        header: "Total",
        cell: ({ row }) => {
          if (row.original.amount === null) return <span className="text-ink-700">—</span>;
          const paid = row.original.invoiceStatus === "PAID";
          return (
            <span
              className={cn(
                "font-mono font-semibold tabular-nums",
                paid ? "text-turf-300" : "text-flood-400"
              )}
            >
              {formatCents(row.original.amount)}
            </span>
          );
        },
      },
      {
        id: "parent",
        header: "Parent",
        cell: ({ row }) =>
          row.original.parentEmail ? (
            <span className="inline-flex items-center gap-1 text-xs text-ink-500 truncate">
              <Mail className="h-3 w-3" />
              {row.original.parentEmail}
            </span>
          ) : (
            <span className="text-ink-700 text-xs">—</span>
          ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="All"
          active={statusFilter === "ALL"}
          count={rows.length}
          onClick={() => setStatusFilter("ALL")}
        />
        {(Object.keys(STATUS_META) as StatusKey[])
          .filter((s) => (statusCounts[s] ?? 0) > 0)
          .map((s) => (
            <FilterChip
              key={s}
              label={STATUS_META[s].label}
              active={statusFilter === s}
              count={statusCounts[s]}
              tone={STATUS_META[s].tone}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player, service, email"
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <ClipboardList className="h-8 w-8 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">
            {rows.length === 0 ? "No bookings yet" : "Nothing matches that filter"}
          </p>
          <p className="text-xs text-ink-500 mt-1">
            {rows.length === 0
              ? "Parents will appear here as soon as they register."
              : "Try a different status or clear search."}
          </p>
        </Card>
      ) : (
        <>
          {/* md+ — sortable table view. */}
          <Card className="hidden md:block overflow-x-auto p-0">
            <table className="min-w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-line bg-pitch-900/40">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-ink-500 font-medium"
                      >
                        {h.isPlaceholder
                          ? null
                          : flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => {
                  const r = row.original;
                  const href = r.eventId
                    ? `/t/${tenantSlug}/coach/schedule/${r.eventId}`
                    : `/t/${tenantSlug}/coach/roster`;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-line/40 last:border-0 hover:bg-pitch-800/60 transition-colors duration-[120ms]"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2.5 align-middle">
                          <Link href={href} className="block">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </Link>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* sm — card stack. Each row becomes a tap-target card. */}
          <div className="md:hidden space-y-2">
            {table.getRowModel().rows.map((row) => {
              const r = row.original;
              const href = r.eventId
                ? `/t/${tenantSlug}/coach/schedule/${r.eventId}`
                : `/t/${tenantSlug}/coach/roster`;
              const meta = STATUS_META[r.status];
              return (
                <Link
                  key={row.id}
                  href={href}
                  className="block rounded-lg border border-line bg-pitch-800 p-3 transition-colors hover:border-turf-400/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink-50 truncate">
                        {r.playerName || "—"}
                      </p>
                      <p className="text-xs text-ink-500 truncate">
                        {r.programName}
                      </p>
                    </div>
                    {meta && (
                      <Badge
                        variant="outline"
                        className={cn("shrink-0", meta.border, meta.tone, meta.bg)}
                      >
                        {meta.label}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-ink-500 gap-2 flex-wrap">
                    {r.parentEmail && (
                      <span className="inline-flex items-center gap-1 truncate min-w-0">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{r.parentEmail}</span>
                      </span>
                    )}
                    {r.amount !== null && r.amount > 0 && (
                      <span className="font-mono text-flood-400 shrink-0">
                        {formatCents(r.amount)}
                      </span>
                    )}
                  </div>
                  {r.eventStart && (
                    <div className="mt-1 text-xs text-ink-500 inline-flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {format(new Date(r.eventStart), "MMM d, h:mm a")}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-ink-500">
        <span>
          {filteredRows.length} of {rows.length}{" "}
          {rows.length === 1 ? "booking" : "bookings"}
        </span>
        {statusFilter !== "ALL" || search ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("ALL");
              setSearch("");
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-[120ms]",
        active
          ? "border-turf-400 bg-turf-400/15 text-turf-200"
          : "border-line bg-pitch-800 text-ink-300 hover:border-turf-400/40 hover:text-ink-50"
      )}
    >
      <span className={cn(active ? "" : tone)}>{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0 text-[10px] font-mono",
          active ? "bg-turf-400 text-pitch-950" : "bg-pitch-700 text-ink-500"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function SortBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 hover:text-ink-300 transition-colors duration-[120ms]"
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60" />
    </button>
  );
}

// Re-export to keep tree-shake-friendly import surface
export { Badge as _Badge };
