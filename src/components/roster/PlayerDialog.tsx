"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createPlayerAction, updatePlayerAction } from "@/actions/player";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit player" : "Add player"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update player details. Parent linking syncs to the team roster."
              : "Roster a new player. We'll link the parent automatically if their email already has an account."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
