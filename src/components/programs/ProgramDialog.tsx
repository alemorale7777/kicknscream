"use client";

import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createProgramAction, updateProgramAction } from "@/actions/program";
import { Loader2 } from "lucide-react";
import type { Program, PriceModel, SkillLevel } from "@prisma/client";

const PRICE_MODELS: { value: PriceModel; label: string; hint: string }[] = [
  { value: "PER_SESSION", label: "Per session", hint: "One-time price each session" },
  { value: "PACKAGE", label: "Package", hint: "Pay once for a bundle (e.g. 5-pack, 10-pack)" },
  { value: "MONTHLY", label: "Monthly", hint: "Subscription billed monthly" },
  { value: "SEASON", label: "Season", hint: "One-time price for a whole season" },
  { value: "FREE", label: "Free", hint: "No charge — open registration" },
];

const SKILL_LEVELS: SkillLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ELITE"];

const schema = z.object({
  name: z.string().min(2, "Required").max(120),
  description: z.string().max(2000).optional(),
  priceModel: z.enum(["PER_SESSION", "PACKAGE", "MONTHLY", "SEASON", "FREE"]),
  priceDollars: z.string().refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Enter a valid amount"),
  skillLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ELITE", ""]).optional(),
  ageMin: z.string().optional(),
  ageMax: z.string().optional(),
  capacity: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function ProgramDialog({
  tenantId,
  program,
  open,
  onOpenChange,
}: {
  tenantId: string;
  program?: Program;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const isEdit = !!program;
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: program?.name ?? "",
      description: program?.description ?? "",
      priceModel: program?.priceModel ?? "PER_SESSION",
      priceDollars: program ? ((program.price ?? 0) / 100).toString() : "",
      skillLevel: program?.skillLevel ?? "",
      ageMin: program?.ageMin?.toString() ?? "",
      ageMax: program?.ageMax?.toString() ?? "",
      capacity: program?.capacity?.toString() ?? "",
    },
  });

  const priceModel = useWatch({ control, name: "priceModel" });
  const skillLevelValue = useWatch({ control, name: "skillLevel" });
  const modelHint = PRICE_MODELS.find((m) => m.value === priceModel)?.hint;

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        const payload = {
          tenantId,
          name: data.name,
          description: data.description,
          priceModel: data.priceModel,
          priceDollars: Number(data.priceDollars),
          skillLevel: (data.skillLevel || undefined) as SkillLevel | undefined,
          ageMin: data.ageMin ? Number(data.ageMin) : null,
          ageMax: data.ageMax ? Number(data.ageMax) : null,
          capacity: data.capacity ? Number(data.capacity) : null,
        };
        if (isEdit) {
          await updateProgramAction({ ...payload, id: program!.id });
          toast.success("Program updated");
        } else {
          await createProgramAction(payload);
          toast.success("Program created");
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
          <DialogTitle>{isEdit ? "Edit program" : "New program"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the program details. Existing enrollments keep the price they paid."
              : "Create a service parents can register for. Set the price model that fits your offering."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} placeholder="1-on-1 Lesson · 60 min" autoFocus />
            {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description")}
              rows={3}
              placeholder="What's included, who it's for, what to bring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price model</Label>
              <Select
                value={priceModel}
                onValueChange={(v) => {
                  const next = v as PriceModel;
                  setValue("priceModel", next);
                  // Keep the visible price in sync with the model — FREE
                  // forces $0, so the form can't claim $60 with FREE
                  // selected.
                  if (next === "FREE") {
                    setValue("priceDollars", "0");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {modelHint && <p className="text-xs text-ink-500">{modelHint}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priceDollars">Price (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-500 font-mono">$</span>
                <Input
                  id="priceDollars"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  {...register("priceDollars")}
                  className="pl-7 font-mono"
                  placeholder="60.00"
                  disabled={priceModel === "FREE"}
                />
              </div>
              {errors.priceDollars && <p className="text-xs text-danger">{errors.priceDollars.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Skill level</Label>
              <Select
                value={skillLevelValue || ""}
                onValueChange={(v) => setValue("skillLevel", v as SkillLevel | "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_LEVELS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capacity">Capacity (optional)</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                max={2000}
                {...register("capacity")}
                className="font-mono"
                placeholder="Max participants"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ageMin">Age min</Label>
              <Input id="ageMin" type="number" min={2} max={99} {...register("ageMin")} className="font-mono" placeholder="6" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ageMax">Age max</Label>
              <Input id="ageMax" type="number" min={2} max={99} {...register("ageMax")} className="font-mono" placeholder="12" />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isEdit ? "Saving…" : "Creating…"}
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create program"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
