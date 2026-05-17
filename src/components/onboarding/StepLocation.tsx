"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import type { WizardData } from "./OnboardingWizard";

export function StepLocation({
  value,
  onBack,
  onNext,
}: {
  value: WizardData;
  onBack: () => void;
  onNext: (v: Partial<WizardData>) => void;
}) {
  const [name, setName] = useState(value.locationName ?? "");
  const [address, setAddress] = useState(value.locationAddress ?? "");

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em] text-balance">First location</h1>
        <p className="text-ink-300 max-w-xl">
          Where does most of your activity happen? You can add more locations later from Settings.
        </p>
      </header>

      <Card className="p-6 space-y-6">
        <div className="flex gap-4 items-start p-4 rounded-md bg-turf-400/5 border border-turf-400/20">
          <MapPin className="h-5 w-5 text-turf-300 shrink-0 mt-0.5" />
          <div className="text-sm text-ink-300 space-y-1">
            <p className="font-medium text-ink-50">Why we ask</p>
            <p className="text-ink-500">
              Locations attach to programs and events. Parents see the venue when registering, and your
              roster filters by location.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location-name">Location name</Label>
          <Input
            id="location-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Beaverton Indoor Soccer Center"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location-address">Address (optional)</Label>
          <Input
            id="location-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Pitch Way, Beaverton, OR 97005"
          />
          <p className="text-xs text-ink-500">Shown on public registration pages so parents can find you.</p>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="primary"
          disabled={name.length < 2}
          onClick={() => onNext({ locationName: name, locationAddress: address || undefined })}
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
