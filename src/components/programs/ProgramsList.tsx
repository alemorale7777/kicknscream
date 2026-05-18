"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ProgramDialog } from "./ProgramDialog";
import { archiveProgramAction, deleteProgramAction } from "@/actions/program";
import { ShareProgramDialog } from "./ShareProgramDialog";
import { formatCents } from "@/lib/utils";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Loader2,
  GraduationCap,
  Users,
  Share2,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import type { Program, PriceModel } from "@prisma/client";

const PRICE_MODEL_LABEL: Record<PriceModel, string> = {
  PER_SESSION: "per session",
  PACKAGE: "package",
  MONTHLY: "per month",
  SEASON: "per season",
  FREE: "free",
};

export function ProgramsList({
  tenantId,
  tenantSlug,
  programs,
  canEdit,
  tenantLabel,
}: {
  tenantId: string;
  tenantSlug: string;
  programs: Program[];
  canEdit: boolean;
  tenantLabel: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Program | undefined>();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<Program | null>(null);
  const [, startTransition] = useTransition();

  const active = programs.filter((p) => !p.archived);
  const archived = programs.filter((p) => p.archived);

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }
  function openEdit(p: Program) {
    setEditing(p);
    setDialogOpen(true);
  }

  function handleArchive(p: Program, archive: boolean) {
    setPendingId(p.id);
    startTransition(async () => {
      try {
        await archiveProgramAction(tenantId, p.id, archive);
        toast.success(archive ? "Program archived" : "Program restored");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleDelete(p: Program) {
    if (!confirm(`Delete "${p.name}" permanently? This cannot be undone.`)) return;
    setPendingId(p.id);
    startTransition(async () => {
      try {
        await deleteProgramAction(tenantId, p.id);
        toast.success("Program deleted");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  if (programs.length === 0) {
    return (
      <>
        <Card className="p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-turf-400/10 text-turf-300 flex items-center justify-center mb-4">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold text-ink-50">No {tenantLabel.toLowerCase()} yet</h3>
          <p className="text-sm text-ink-500 mt-1 mb-6 max-w-sm mx-auto">
            Create your first one and parents can register from your public page.
          </p>
          {canEdit && (
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New program
            </Button>
          )}
        </Card>
        <ProgramDialog
          key={editing?.id ?? "new"}
          tenantId={tenantId}
          program={editing}
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) setEditing(undefined);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-xs uppercase tracking-wider text-ink-500">
          {active.length} active · {archived.length} archived
        </p>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New program
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {active.map((p) => (
          <ProgramCard
            key={p.id}
            program={p}
            canEdit={canEdit}
            pendingId={pendingId}
            onEdit={openEdit}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onShare={() => setSharing(p)}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <details className="mt-8 group">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-ink-500 hover:text-ink-300 transition-colors select-none">
            Archived ({archived.length})
          </summary>
          <div className="mt-3 space-y-3 opacity-60">
            {archived.map((p) => (
              <ProgramCard
                key={p.id}
                program={p}
                canEdit={canEdit}
                pendingId={pendingId}
                onEdit={openEdit}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onShare={() => setSharing(p)}
              />
            ))}
          </div>
        </details>
      )}

      <ProgramDialog
        key={editing?.id ?? "new"}
        tenantId={tenantId}
        program={editing}
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditing(undefined);
        }}
      />

      {sharing && (
        <ShareProgramDialog
          open={!!sharing}
          onOpenChange={(v) => {
            if (!v) setSharing(null);
          }}
          programName={sharing.name}
          url={shareUrl(tenantSlug, sharing)}
        />
      )}
    </>
  );
}

function shareUrl(tenantSlug: string, program: Program): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://kicknscream.vercel.app";
  return `${origin}/${tenantSlug}/book/${program.id}`;
}

function ProgramCard({
  program,
  canEdit,
  pendingId,
  onEdit,
  onArchive,
  onDelete,
  onShare,
}: {
  program: Program;
  canEdit: boolean;
  pendingId: string | null;
  onEdit: (p: Program) => void;
  onArchive: (p: Program, archive: boolean) => void;
  onDelete: (p: Program) => void;
  onShare: () => void;
}) {
  const isPending = pendingId === program.id;
  const recurring = program.priceModel === "MONTHLY";
  const recurringPriceConnected = recurring && !!program.stripePriceId;
  return (
    <Card className="p-5 group hover:border-turf-400/40 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Title row — name on the left, price column-aligned on the right
              so a stack of cards reads as a price column instead of a wall of
              inline labels. */}
          <div className="flex items-baseline gap-3 justify-between">
            <h3 className="font-semibold text-ink-50 text-lg leading-tight min-w-0 truncate">
              {program.name}
            </h3>
            <div className="shrink-0 text-right">
              {program.priceModel === "FREE" ? (
                <span className="text-turf-300 font-semibold text-sm">Free</span>
              ) : (
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="font-mono text-flood-400 font-semibold text-base">
                    {formatCents(program.price)}
                  </span>
                  <span className="text-xs text-ink-500">
                    {PRICE_MODEL_LABEL[program.priceModel]}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill archived={program.archived} />
            {program.skillLevel && (
              <Badge variant="outline">
                {program.skillLevel.charAt(0) + program.skillLevel.slice(1).toLowerCase()}
              </Badge>
            )}
            {(program.ageMin || program.ageMax) && (
              <Badge variant="outline">
                {program.ageMin ? `${program.ageMin}` : "any"}
                {program.ageMax ? `–${program.ageMax}` : "+"} yrs
              </Badge>
            )}
            {recurring && (
              <Badge
                variant="outline"
                className={
                  recurringPriceConnected
                    ? "border-turf-400/40 text-turf-300 bg-turf-400/5"
                    : "border-warn/40 text-warn bg-warn/5"
                }
              >
                {recurringPriceConnected ? (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                ) : (
                  <CircleDashed className="h-3 w-3 mr-1" />
                )}
                {recurringPriceConnected
                  ? "Recurring price · live"
                  : "Recurring price pending"}
              </Badge>
            )}
          </div>

          {program.description && (
            <p className="text-sm text-ink-300 leading-relaxed">{program.description}</p>
          )}

          {program.capacity && (
            <div className="flex items-center gap-1 text-xs text-ink-500">
              <Users className="h-3 w-3" />
              {program.capacity} cap
            </div>
          )}
        </div>

        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="Program actions">
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4 text-ink-500" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onEdit(program)} className="cursor-pointer">
                <Pencil className="h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShare} className="cursor-pointer">
                <Share2 className="h-4 w-4" />
                Share &amp; QR
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchive(program, !program.archived)} className="cursor-pointer">
                {program.archived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" /> Restore
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" /> Archive
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(program)}
                className="cursor-pointer text-danger focus:text-danger"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}

function StatusPill({ archived }: { archived: boolean }) {
  if (archived) {
    return (
      <Badge variant="outline" className="border-line text-ink-500 bg-pitch-700">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-700 mr-1.5" />
        Archived
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-turf-400/40 text-turf-300 bg-turf-400/5">
      <span className="h-1.5 w-1.5 rounded-full bg-turf-400 mr-1.5" />
      Active
    </Badge>
  );
}
