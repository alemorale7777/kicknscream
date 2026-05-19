"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createPlayerAction, updatePlayerAction } from "@/actions/player";
import { track } from "@/lib/analytics";
import { Loader2, UserPlus } from "lucide-react";
import type { Player } from "@prisma/client";

const schema = z.object({
  firstName: z.string().min(1, "Required").max(60),
  lastName: z.string().min(1, "Required").max(60),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  position: z.string().max(40).optional(),
  jerseyNumber: z.string().optional(),
  notes: z.string().max(2000).optional(),
  parentEmail: z.string().email("Invalid email").optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

export function PlayerDialog({
  tenantId,
  player,
  parentEmail,
  open,
  onOpenChange,
  showClubFields,
}: {
  tenantId: string;
  player?: Player;
  parentEmail?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  showClubFields: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [inviteIfNew, setInviteIfNew] = useState(true);

  const isEdit = !!player;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: player?.firstName ?? "",
      lastName: player?.lastName ?? "",
      dob: player?.dob ? new Date(player.dob).toISOString().slice(0, 10) : "",
      position: player?.position ?? "",
      jerseyNumber: player?.jerseyNumber?.toString() ?? "",
      notes: player?.notes ?? "",
      parentEmail: parentEmail ?? "",
    },
  });

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        if (isEdit) {
          await updatePlayerAction({
            id: player!.id,
            tenantId,
            ...data,
            jerseyNumber: data.jerseyNumber ? Number(data.jerseyNumber) : null,
            inviteParentIfNew: false,
          });
          toast.success("Player updated");
        } else {
          const result = await createPlayerAction({
            tenantId,
            ...data,
            jerseyNumber: data.jerseyNumber ? Number(data.jerseyNumber) : null,
            inviteParentIfNew: inviteIfNew,
          });
          if (result?.parentInvited) {
            toast.success("Player added — parent invitation sent");
          } else {
            toast.success("Player added");
          }
          reset();
        }
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit player" : "Add player"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update player details. Parent linking syncs to the team roster."
              : "Roster a new player. We'll link the parent automatically if their email already has an account."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
        <form
          id="player-form"
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          {isEdit && player && (
            <div className="space-y-1.5">
              <Label>Photo</Label>
              <PlayerPhotoField
                playerId={player.id}
                initialUrl={player.photoUrl ?? null}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...register("firstName")} autoFocus />
              {errors.firstName && <p className="text-xs text-danger">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" {...register("lastName")} />
              {errors.lastName && <p className="text-xs text-danger">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <Input id="dob" type="date" {...register("dob")} className="font-mono" />
              {errors.dob && <p className="text-xs text-danger">{errors.dob.message}</p>}
            </div>
            {showClubFields && (
              <div className="space-y-1.5">
                <Label htmlFor="jerseyNumber">Jersey #</Label>
                <Input
                  id="jerseyNumber"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  {...register("jerseyNumber")}
                  className="font-mono"
                />
              </div>
            )}
          </div>

          {showClubFields && (
            <div className="space-y-1.5">
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                {...register("position")}
                placeholder="Forward / Midfield / Defender / Keeper"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="parentEmail">Parent email (optional)</Label>
            <Input
              id="parentEmail"
              type="email"
              {...register("parentEmail")}
              placeholder="parent@example.com"
            />
            {errors.parentEmail && <p className="text-xs text-danger">{errors.parentEmail.message}</p>}
            {!isEdit && (
              <label className="flex items-center gap-2 text-xs text-ink-300 select-none cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={inviteIfNew}
                  onChange={(e) => setInviteIfNew(e.target.checked)}
                  className="rounded border-line bg-pitch-700 text-turf-400 focus:ring-turf-400/30"
                />
                <UserPlus className="h-3.5 w-3.5 text-turf-300" />
                Send parent an invitation if they don&apos;t have an account yet
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              rows={3}
              placeholder="Allergies, medical conditions, preferred foot, anything to remember"
            />
          </div>

        </form>
        </SheetBody>

        <SheetFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button form="player-form" type="submit" variant="primary" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEdit ? "Saving…" : "Adding…"}
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Add player"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PlayerPhotoField({
  playerId,
  initialUrl,
}: {
  playerId: string;
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("playerId", playerId);
      const res = await fetch("/api/uploads/player-photo", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error ?? "Upload failed");
      }
      const { url: newUrl } = await res.json();
      setUrl(newUrl);
      track("player_photo_uploaded", { playerId });
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    try {
      const { clearPlayerPhotoAction } = await import("@/actions/player");
      await clearPlayerPhotoAction({ playerId });
      setUrl(null);
      toast.success("Photo removed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 rounded-full bg-pitch-700 flex items-center justify-center overflow-hidden">
        {url ? (
          <Image
            src={url}
            alt=""
            width={64}
            height={64}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <UserPlus className="h-6 w-6 text-ink-500" />
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {url ? "Replace" : "Upload"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClear}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
