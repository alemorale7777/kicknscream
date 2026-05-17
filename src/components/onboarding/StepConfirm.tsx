"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin } from "lucide-react";
import type { WizardData } from "./OnboardingWizard";
import type { TenantType } from "@prisma/client";

const TYPE_VARIANT: Record<TenantType, "turf" | "flood" | "danger"> = {
  COACH: "turf",
  INSTITUTION: "flood",
  CLUB: "danger",
};

export function StepConfirm({
  value,
  pending,
  onBack,
  onFinish,
}: {
  value: WizardData;
  pending: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em] text-balance">
          Ready to kick off
        </h1>
        <p className="text-ink-300 max-w-xl">
          Review your setup. Everything below is editable from Settings once we&apos;re live.
        </p>
      </header>

      <Card className="overflow-hidden">
        {/* Visual header row */}
        <div className="flex items-center gap-4 p-5 border-b border-line bg-pitch-700/40">
          {value.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.logoUrl} alt="" className="h-14 w-14 rounded-md object-cover border border-line shrink-0" />
          ) : (
            <div
              className="h-14 w-14 rounded-md border border-line shrink-0 flex items-center justify-center text-2xl font-bold text-pitch-950"
              style={{ background: value.primaryColor ?? "#1FB663" }}
            >
              {value.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-lg text-ink-50 truncate">{value.name}</p>
              {value.type && <Badge variant={TYPE_VARIANT[value.type]}>{value.type.toLowerCase()}</Badge>}
            </div>
            <p className="font-mono text-xs text-ink-500 mt-1">kicknscream.com/t/{value.slug}</p>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <Row label="Primary color" value={
            <span className="inline-flex items-center gap-2">
              <span
                className="h-4 w-4 rounded-full border border-line"
                style={{ background: value.primaryColor ?? "#1FB663" }}
              />
              <span className="font-mono text-xs uppercase">{value.primaryColor ?? "#1FB663"}</span>
            </span>
          } />
          {value.locationName && (
            <Row
              label="First location"
              value={
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-ink-500" />
                  <span>{value.locationName}</span>
                  {value.locationAddress && (
                    <span className="text-ink-500 text-xs">· {value.locationAddress}</span>
                  )}
                </span>
              }
            />
          )}
        </div>
      </Card>

      <div className="rounded-md border border-flood-400/30 bg-flood-400/5 p-4">
        <p className="text-xs uppercase tracking-wider text-flood-400 mb-1">What happens next</p>
        <p className="text-sm text-ink-300">
          We&apos;ll spin up your tenant, make you the OWNER, and drop you on your dashboard. You can invite
          teammates and start configuring from there.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          ← Back
        </Button>
        <Button variant="accent" onClick={onFinish} disabled={pending} size="lg">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating tenant…
            </>
          ) : (
            <>Create tenant →</>
          )}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-line/50 last:border-0">
      <span className="text-xs uppercase tracking-wider text-ink-500 shrink-0">{label}</span>
      <span className="text-sm text-ink-50 text-right">{value}</span>
    </div>
  );
}
