"use client";

import { useState, useTransition, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { updateTenantParentNotesAction } from "@/actions/parent";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Auto-saving private notes for a parent at a single tenant. The 800ms
 * debounce keeps typing responsive while still flushing soon enough that a
 * coach who switches tabs mid-thought doesn't lose state. `notes` is
 * `TenantParent.notes` so each tenant has its own thread for the same
 * underlying Parent.
 */
export function ParentNotesEditor({
  tenantId,
  parentId,
  initialNotes,
}: {
  tenantId: string;
  parentId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (value === (initialNotes ?? "")) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        try {
          await updateTenantParentNotesAction({
            tenantId,
            parentId,
            notes: value || null,
          });
          setSavedAt(new Date());
        } catch (e) {
          toast.error((e as Error).message);
        }
      });
    }, 800);
    return () => clearTimeout(handle);
  }, [value, initialNotes, tenantId, parentId]);

  return (
    <Card className="px-6 py-5">
      <Label className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
        Tenant-private notes
      </Label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder="Private notes about this parent. Never shown to them."
        className="w-full mt-2 rounded-md border border-line bg-pitch-700 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-700 focus:outline-none focus:border-turf-400/60"
      />
      <p className="text-[10px] text-ink-500 mt-1 inline-flex items-center gap-1">
        {pending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </>
        ) : savedAt ? (
          "Saved"
        ) : (
          "Auto-saves as you type"
        )}
      </p>
    </Card>
  );
}
