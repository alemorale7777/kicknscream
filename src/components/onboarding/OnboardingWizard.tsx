"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StepType } from "./StepType";
import { StepDetails } from "./StepDetails";
import { StepLocation } from "./StepLocation";
import { StepConfirm } from "./StepConfirm";
import { createTenantAction } from "@/actions/tenant";
import { cn } from "@/lib/utils";
import type { TenantType } from "@prisma/client";

export type WizardData = {
  type?: TenantType;
  name?: string;
  slug?: string;
  primaryColor?: string;
  logoUrl?: string | null;
  locationName?: string;
  locationAddress?: string;
};

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>({});
  const [isPending, startTransition] = useTransition();

  const needsLocation = data.type === "INSTITUTION" || data.type === "CLUB";
  const steps = needsLocation
    ? (["type", "details", "location", "confirm"] as const)
    : (["type", "details", "confirm"] as const);
  type StepKey = (typeof steps)[number];

  async function handleFinish() {
    startTransition(async () => {
      try {
        await createTenantAction({
          type: data.type!,
          name: data.name!,
          slug: data.slug,
          primaryColor: data.primaryColor,
          logoUrl: data.logoUrl,
          locationName: data.locationName,
          locationAddress: data.locationAddress,
        });
        // redirect happens inside the server action
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  const currentStep: StepKey = steps[step];

  return (
    <div className="space-y-8">
      <StepIndicator steps={[...steps]} current={step} />

      {currentStep === "type" && (
        <StepType
          value={data.type}
          onNext={(type) => {
            setData({ ...data, type });
            setStep(step + 1);
          }}
        />
      )}

      {currentStep === "details" && (
        <StepDetails
          value={data}
          onBack={() => setStep(step - 1)}
          onNext={(v) => {
            setData({ ...data, ...v });
            setStep(step + 1);
          }}
        />
      )}

      {currentStep === "location" && (
        <StepLocation
          value={data}
          onBack={() => setStep(step - 1)}
          onNext={(v) => {
            setData({ ...data, ...v });
            setStep(step + 1);
          }}
        />
      )}

      {currentStep === "confirm" && (
        <StepConfirm
          value={data}
          pending={isPending}
          onBack={() => setStep(step - 1)}
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}

function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-[260ms] ease-[cubic-bezier(0.2,0,0,1)]",
              i < current
                ? "bg-turf-400"
                : i === current
                  ? "bg-flood-400 shadow-[0_0_18px_-2px_var(--color-flood-400)]"
                  : "bg-line"
            )}
          />
        ))}
      </div>
      <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">
        Step {current + 1} of {steps.length} · {steps[current]}
      </p>
    </div>
  );
}
