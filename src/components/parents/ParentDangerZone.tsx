"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { requestParentDeletionAction } from "@/actions/parent-deletion";
import type { Parent } from "@prisma/client";

/**
 * Two-step destructive action: click "Request global deletion", then type
 * the parent's email exactly to enable submit. The actual anonymization
 * doesn't happen here — Task 22 emails the parent a confirmation link, and
 * only after they click does the row get scrubbed. This component just
 * fires the request.
 */
export function ParentDangerZone({
  tenantId,
  parent,
}: {
  tenantId: string;
  parent: Parent;
}) {
  const [confirm, setConfirm] = useState(false);
  const [emailEcho, setEmailEcho] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (emailEcho.trim().toLowerCase() !== parent.email.toLowerCase()) {
      toast.error("Email does not match");
      return;
    }
    startTransition(async () => {
      try {
        await requestParentDeletionAction({ tenantId, parentId: parent.id });
        toast.success("Deletion request sent to the parent");
        setConfirm(false);
        setEmailEcho("");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Card className="px-6 py-5 border-danger/30 bg-danger/5 space-y-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-danger inline-flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3" />
        Danger zone
      </p>
      <p className="text-sm text-ink-300">
        Request global deletion. The parent receives an email asking them to
        confirm. If they confirm, their account is anonymized across every
        tenant — including others where they have active access. Cannot be
        undone.
      </p>
      {!confirm ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirm(true)}
          className="border-danger/40 text-danger hover:bg-danger/10"
        >
          Request global deletion
        </Button>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="echo">
            Type <span className="font-mono">{parent.email}</span> to confirm
          </Label>
          <Input
            id="echo"
            value={emailEcho}
            onChange={(e) => setEmailEcho(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirm(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={
                pending ||
                emailEcho.trim().toLowerCase() !== parent.email.toLowerCase()
              }
              className="bg-danger text-pitch-950 hover:bg-danger/90"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send deletion request
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
