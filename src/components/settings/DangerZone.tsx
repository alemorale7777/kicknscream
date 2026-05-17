"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { deleteTenantAction } from "@/actions/tenant";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";

export function DangerZone({ tenantId, slug, name }: { tenantId: string; slug: string; name: string }) {
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Card className="border-danger/40">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-md bg-danger/10 text-danger flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <CardTitle className="text-danger">Delete {name}</CardTitle>
        </div>
        <CardDescription>
          This permanently removes the tenant, all programs, events, players, memberships, invitations,
          and history. <span className="font-medium text-ink-300">Cannot be undone.</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-ink-300">
            Type{" "}
            <span className="font-mono text-ink-50 bg-pitch-700 px-1.5 py-0.5 rounded">{slug}</span> to
            confirm.
          </p>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="font-mono"
            placeholder={slug}
            autoComplete="off"
          />
        </div>
        <Button
          variant="destructive"
          disabled={confirmation !== slug || pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await deleteTenantAction({ tenantId, confirmation });
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Deleting…
            </>
          ) : (
            "Delete tenant permanently"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
