"use client";

import { useState, useTransition, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { updateTryoutStatusAction, deleteTryoutAction } from "@/actions/tryout";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Search,
  Mail,
  Phone,
  Video,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Loader2,
  Clock,
  Send,
  CheckCircle2,
  Trophy,
  XCircle,
  UserCheck,
} from "lucide-react";
import type { TryoutSignup, TryoutStatus } from "@prisma/client";

const STAGES: { value: TryoutStatus; label: string; icon: typeof Clock; tone: string; bg: string; border: string }[] = [
  { value: "PENDING", label: "Pending", icon: Clock, tone: "text-ink-300", bg: "bg-pitch-700", border: "border-line" },
  { value: "INVITED", label: "Invited", icon: Send, tone: "text-flood-400", bg: "bg-flood-400/10", border: "border-flood-400/40" },
  { value: "ATTENDED", label: "Attended", icon: UserCheck, tone: "text-sky-300", bg: "bg-sky-500/10", border: "border-sky-500/40" },
  { value: "OFFERED", label: "Offered", icon: Trophy, tone: "text-warn", bg: "bg-warn/10", border: "border-warn/40" },
  { value: "ACCEPTED", label: "Accepted", icon: CheckCircle2, tone: "text-turf-300", bg: "bg-turf-400/10", border: "border-turf-400/40" },
  { value: "DECLINED", label: "Declined", icon: XCircle, tone: "text-ink-700", bg: "bg-pitch-800", border: "border-line" },
];

const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.value, s])) as Record<
  TryoutStatus,
  (typeof STAGES)[number]
>;

export function TryoutPipeline({
  tenantId,
  signups,
}: {
  tenantId: string;
  signups: TryoutSignup[];
}) {
  const [query, setQuery] = useState("");
  // Radix Select forbids empty-string values — sentinel for "all ages".
  const ALL_AGES = "__all";
  const [ageFilter, setAgeFilter] = useState<string>(ALL_AGES);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const ageGroups = useMemo(
    () => Array.from(new Set(signups.map((s) => s.ageGroup))).sort(),
    [signups]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return signups.filter((s) => {
      if (ageFilter !== ALL_AGES && s.ageGroup !== ageFilter) return false;
      if (!q) return true;
      return (
        s.playerName.toLowerCase().includes(q) ||
        s.parentEmail.toLowerCase().includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [signups, query, ageFilter]);

  const byStatus = useMemo(() => {
    const acc: Record<TryoutStatus, TryoutSignup[]> = {
      PENDING: [], INVITED: [], ATTENDED: [], OFFERED: [], ACCEPTED: [], DECLINED: [],
    };
    for (const s of filtered) acc[s.status].push(s);
    return acc;
  }, [filtered]);

  function move(signup: TryoutSignup, next: TryoutStatus) {
    setPendingId(signup.id);
    startTransition(async () => {
      try {
        await updateTryoutStatusAction({ tenantId, tryoutId: signup.id, status: next });
        toast.success(`${signup.playerName} → ${STAGE_BY_KEY[next].label}`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleDelete(signup: TryoutSignup) {
    if (!confirm(`Delete ${signup.playerName}'s application? This cannot be undone.`)) return;
    setPendingId(signup.id);
    startTransition(async () => {
      try {
        await deleteTryoutAction(tenantId, signup.id);
        toast.success("Application deleted");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player, parent, notes"
            className="pl-9"
          />
        </div>
        <Select value={ageFilter} onValueChange={setAgeFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All ages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_AGES}>All ages</SelectItem>
            {ageGroups.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stage tally */}
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const Icon = s.icon;
          return (
            <Badge key={s.value} variant="outline" className={cn(s.border, s.tone, "bg-transparent")}>
              <Icon className="h-3 w-3 mr-1" />
              {s.label} · {byStatus[s.value].length}
            </Badge>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <Trophy className="h-7 w-7 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">No tryout applications match</p>
          <p className="text-xs text-ink-500 mt-1">Share your public tryouts URL to start gathering applications.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {STAGES.map((s) => {
            const items = byStatus[s.value];
            if (items.length === 0) return null;
            return (
              <section key={s.value} className="space-y-2">
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-500">
                  {s.label} <span className="text-ink-700">· {items.length}</span>
                </h3>
                {items.map((sig) => (
                  <SignupRow
                    key={sig.id}
                    signup={sig}
                    isPending={pendingId === sig.id}
                    onMove={move}
                    onDelete={handleDelete}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SignupRow({
  signup,
  isPending,
  onMove,
  onDelete,
}: {
  signup: TryoutSignup;
  isPending: boolean;
  onMove: (s: TryoutSignup, next: TryoutStatus) => void;
  onDelete: (s: TryoutSignup) => void;
}) {
  const stage = STAGE_BY_KEY[signup.status];

  return (
    <Card className="p-4 flex items-start gap-4">
      <div className={cn("h-10 w-10 rounded-md flex items-center justify-center shrink-0", stage.bg, stage.tone)}>
        <stage.icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-ink-50 truncate">{signup.playerName}</p>
          <Badge variant="outline">{signup.ageGroup}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3 w-3" />
            <a href={`mailto:${signup.parentEmail}`} className="hover:text-ink-300 transition-colors">
              {signup.parentEmail}
            </a>
          </span>
          {signup.parentPhone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              <a href={`tel:${signup.parentPhone}`} className="hover:text-ink-300 transition-colors">
                {signup.parentPhone}
              </a>
            </span>
          )}
          {signup.videoUrl && (
            <a
              href={signup.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-turf-300 hover:text-turf-200 underline-offset-2 hover:underline"
            >
              <Video className="h-3 w-3" /> Watch tape
            </a>
          )}
          <span className="font-mono">{format(signup.createdAt, "MMM d")}</span>
        </div>
        {signup.notes && (
          <p className="text-xs text-ink-300 mt-2 pt-2 border-t border-line line-clamp-2">{signup.notes}</p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label="Tryout actions">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4 text-ink-500" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {STAGES.filter((s) => s.value !== signup.status).map((s) => (
            <DropdownMenuItem
              key={s.value}
              onClick={() => onMove(signup, s.value)}
              className="cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
              Mark {s.label.toLowerCase()}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(signup)}
            className="cursor-pointer text-danger focus:text-danger"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}
