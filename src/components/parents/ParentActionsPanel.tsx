"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, Edit, Users, Ban, RotateCcw, Loader2 } from "lucide-react";
import {
  sendParentClaimEmailAction,
  revokeParentAccessAction,
  restoreParentAccessAction,
} from "@/actions/parent";
import { EditParentSheet } from "./EditParentSheet";
import { MergeParentSheet } from "./MergeParentSheet";
import type { Parent, TenantParent } from "@prisma/client";

/**
 * Buttons row at the bottom of the parent detail page — Edit / Merge /
 * Revoke-or-Restore / Send-Claim. The send-claim button is suppressed when
 * the parent already has a `userId` (account is already attached). The
 * revoke <-> restore toggle keys off the current TenantParent.status; the
 * destructive coloring flips so the affordance always advertises the next
 * action, not the current state.
 */
export function ParentActionsPanel({
  tenantId,
  parent,
  tenantParent,
  tenantCount,
  searchMergeCandidates,
}: {
  tenantId: string;
  parent: Parent;
  tenantParent: TenantParent;
  tenantCount: number;
  searchMergeCandidates: (q: string) => Promise<
    {
      id: string;
      email: string;
      name: string | null;
      playerCount: number;
    }[]
  >;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function sendClaim() {
    startTransition(async () => {
      try {
        await sendParentClaimEmailAction({ tenantId, parentId: parent.id });
        toast.success(`Claim link sent to ${parent.email}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function toggleRevoke() {
    startTransition(async () => {
      try {
        if (tenantParent.status === "ACTIVE") {
          await revokeParentAccessAction({ tenantId, parentId: parent.id });
          toast.success("Family-portal access revoked");
        } else {
          await restoreParentAccessAction({ tenantId, parentId: parent.id });
          toast.success("Family-portal access restored");
        }
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Card className="px-6 py-5 space-y-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
        Actions
      </p>
      <div className="flex flex-wrap gap-2">
        {!parent.userId && (
          <Button
            variant="outline"
            size="sm"
            onClick={sendClaim}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            Send claim link
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Edit className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
          <Users className="h-3.5 w-3.5" />
          Merge duplicate
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleRevoke}
          disabled={pending}
          className={
            tenantParent.status === "REVOKED" ? "text-turf-300" : "text-warn"
          }
        >
          {tenantParent.status === "REVOKED" ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" /> Restore access
            </>
          ) : (
            <>
              <Ban className="h-3.5 w-3.5" /> Revoke access
            </>
          )}
        </Button>
      </div>

      <EditParentSheet
        tenantId={tenantId}
        parent={parent}
        tenantCount={tenantCount}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <MergeParentSheet
        tenantId={tenantId}
        winnerId={parent.id}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        searchCandidates={searchMergeCandidates}
      />
    </Card>
  );
}
