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
  programs,
  canEdit,
  tenantLabel,
}: {
  tenantId: string;
  programs: Program[];
  canEdit: boolean;
  tenantLabel: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Program | undefined>();
  const [pendingId, setPendingId] = useState<string | null>(null);
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
              />
            ))}
          </div>
        </details>
      )}

      <ProgramDialog
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

function ProgramCard({
  program,
  canEdit,
  pendingId,
  onEdit,
  onArchive,
  onDelete,
}: {
  program: Program;
  canEdit: boolean;
  pendingId: string | null;
  onEdit: (p: Program) => void;
  onArchive: (p: Program, archive: boolean) => void;
  onDelete: (p: Program) => void;
}) {
  const isPending = pendingId === program.id;
  return (
    <Card className="p-5 group hover:border-turf-400/40 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-ink-50 text-lg">{program.name}</h3>
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
            {program.archived && <Badge variant="warn">archived</Badge>}
          </div>
          {program.description && (
            <p className="text-sm text-ink-300 leading-relaxed">{program.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              {program.priceModel === "FREE" ? (
                <span className="text-turf-300 font-medium">Free</span>
              ) : (
                <>
                  <span className="font-mono text-flood-400 font-medium">{formatCents(program.price)}</span>
                  <span className="text-ink-700">·</span>
                  <span>{PRICE_MODEL_LABEL[program.priceModel]}</span>
                </>
              )}
            </span>
            {program.capacity && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {program.capacity} cap
              </span>
            )}
          </div>
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
