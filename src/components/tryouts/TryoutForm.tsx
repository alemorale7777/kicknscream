"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { submitTryoutAction } from "@/actions/tryout";
import { Loader2, Send, Trophy, Video } from "lucide-react";

const schema = z.object({
  playerName: z.string().min(2, "Required").max(120),
  parentEmail: z.string().email("Invalid email"),
  parentPhone: z.string().optional(),
  ageGroup: z.string().min(1, "Required"),
  videoUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const AGE_GROUPS = ["U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19+"];

export function TryoutForm({ tenantSlug }: { tenantSlug: string }) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        await submitTryoutAction({
          tenantSlug,
          playerName: data.playerName,
          parentEmail: data.parentEmail,
          parentPhone: data.parentPhone || undefined,
          ageGroup: data.ageGroup,
          videoUrl: data.videoUrl || undefined,
          notes: data.notes || undefined,
        });
      } catch (e) {
        const err = e as Error & { digest?: string };
        if (err.digest?.startsWith("NEXT_REDIRECT")) return;
        toast.error(err.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card className="p-5 space-y-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-md bg-danger/15 text-danger flex items-center justify-center">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-50">Player info</h2>
            <p className="text-xs text-ink-500">Coaches review every submission — we&apos;ll reach out in 3–5 days.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="playerName">Player full name</Label>
            <Input id="playerName" {...register("playerName")} autoFocus />
            {errors.playerName && <p className="text-xs text-danger">{errors.playerName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ageGroup">Age group</Label>
            <select
              id="ageGroup"
              {...register("ageGroup")}
              className="flex h-10 w-full rounded-md border border-line bg-pitch-800 px-3 py-2 text-sm text-ink-50 transition-colors focus-visible:outline-none focus-visible:border-turf-400 focus-visible:ring-2 focus-visible:ring-turf-400/30 font-mono"
            >
              <option value="">Select age group</option>
              {AGE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {errors.ageGroup && <p className="text-xs text-danger">{errors.ageGroup.message}</p>}
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-5">
        <h2 className="text-lg font-bold text-ink-50">Parent contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="parentEmail">Email</Label>
            <Input id="parentEmail" type="email" {...register("parentEmail")} />
            {errors.parentEmail && <p className="text-xs text-danger">{errors.parentEmail.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentPhone">Phone (optional)</Label>
            <Input id="parentPhone" type="tel" {...register("parentPhone")} placeholder="555-1234" />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-flood-400/15 text-flood-400 flex items-center justify-center">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-50">Tape & notes</h2>
            <p className="text-xs text-ink-500">Optional but highly recommended — coaches review tape before tryouts.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="videoUrl">Video / highlight reel URL</Label>
          <Input id="videoUrl" type="url" {...register("videoUrl")} placeholder="https://youtube.com/..." />
          {errors.videoUrl && <p className="text-xs text-danger">{errors.videoUrl.message}</p>}
          <p className="text-xs text-ink-500">YouTube, Vimeo, Hudl, anywhere we can watch it.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Anything else? (optional)</Label>
          <Textarea
            id="notes"
            {...register("notes")}
            rows={4}
            placeholder="Positions, current club, what you're working on, why this team"
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="accent" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit application
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
