"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { saveBookingDraftAction } from "@/actions/bookingDraft";
import { track } from "@/lib/analytics";
import { Loader2, Mail, Check } from "lucide-react";

export function SaveForLaterLink({
  tenantSlug,
  programId,
  getDraftPayload,
}: {
  tenantSlug: string;
  programId: string;
  getDraftPayload: () => {
    email: string | null;
    startsAt: string | null;
    endsAt: string | null;
    payload: Record<string, unknown>;
  };
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function submit() {
    const draft = getDraftPayload();
    const targetEmail = email.trim() || draft.email?.trim() || "";
    if (!targetEmail) {
      toast.error("Enter your email so we can send the link");
      return;
    }
    startTransition(async () => {
      try {
        await saveBookingDraftAction({
          tenantSlug,
          programId,
          email: targetEmail,
          startsAt: draft.startsAt ?? undefined,
          endsAt: draft.endsAt ?? undefined,
          payload: draft.payload,
        });
        track("booking_draft_saved", { tenantSlug, programId });
        setSent(true);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (sent) {
    return (
      <div className="inline-flex items-center gap-1.5 text-sm text-turf-300">
        <Check className="h-3.5 w-3.5" />
        Sent — check your inbox.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          const draft = getDraftPayload();
          if (draft.email) setEmail(draft.email);
        }}
        className="text-sm text-ink-500 hover:text-ink-300 underline-offset-4 hover:underline inline-flex items-center gap-1"
      >
        <Mail className="h-3.5 w-3.5" />
        Save for later
      </button>
    );
  }

  return (
    <div className="inline-flex items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="save-email" className="text-xs text-ink-500">
          Email a resume link to
        </Label>
        <Input
          id="save-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-9 w-64"
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={submit} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        Send
      </Button>
    </div>
  );
}
