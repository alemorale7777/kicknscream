"use client";

import { useState, useEffect, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { generateSlug } from "@/lib/slug";
import { checkSlugAvailability } from "@/actions/tenant";
import { Check, X, Upload, Loader2 } from "lucide-react";
import type { WizardData } from "./OnboardingWizard";

type SlugState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "unavailable"; reason?: string; suggested?: string };

export function StepDetails({
  value,
  onBack,
  onNext,
}: {
  value: WizardData;
  onBack: () => void;
  onNext: (v: Partial<WizardData>) => void;
}) {
  const [name, setName] = useState(value.name ?? "");
  const [slug, setSlug] = useState(value.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!value.slug);
  const [color, setColor] = useState(value.primaryColor ?? "#1FB663");
  const [logoUrl, setLogoUrl] = useState<string | null>(value.logoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ state: "idle" });
  const [checking, startChecking] = useTransition();

  // Auto-sync slug from name until the user manually edits it
  useEffect(() => {
    if (!slugTouched) {
      setSlug(generateSlug(name));
    }
  }, [name, slugTouched]);

  // Debounced live slug check
  useEffect(() => {
    if (slug.length < 2) {
      setSlugState({ state: "idle" });
      return;
    }
    setSlugState({ state: "checking" });
    const handle = setTimeout(() => {
      startChecking(async () => {
        try {
          const result = await checkSlugAvailability(slug);
          if (result.available) {
            setSlugState({ state: "available" });
          } else {
            setSlugState({
              state: "unavailable",
              reason: result.reason,
              suggested: result.suggested,
            });
          }
        } catch {
          setSlugState({ state: "idle" });
        }
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [slug]);

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/logo",
      });
      setLogoUrl(blob.url);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  const canContinue =
    name.length >= 2 &&
    slug.length >= 2 &&
    slugState.state === "available" &&
    !uploading &&
    !checking;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em] text-balance">
          Tell us about your tenant
        </h1>
        <p className="text-ink-300 max-w-xl">This is what parents, players, and prospects will see.</p>
      </header>

      <Card className="p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Coach Alej / PDX Skills / Cascadia FC"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">URL slug</Label>
          <div className="flex items-center gap-2 rounded-md border border-line bg-pitch-700/40 px-3 py-2 transition-colors focus-within:border-turf-400">
            <span className="font-mono text-xs text-ink-500 shrink-0">kicknscream.com/t/</span>
            <input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(generateSlug(e.target.value));
                setSlugTouched(true);
              }}
              className="flex-1 bg-transparent text-sm text-ink-50 placeholder:text-ink-700 outline-none font-mono"
              placeholder="your-slug"
            />
            <SlugStatusBadge state={slugState} />
          </div>
          {slugState.state === "unavailable" && slugState.suggested && (
            <button
              type="button"
              onClick={() => {
                setSlug(slugState.suggested!);
                setSlugTouched(true);
              }}
              className="text-xs text-turf-300 hover:text-turf-200 underline-offset-4 hover:underline"
            >
              Use "{slugState.suggested}" instead →
            </button>
          )}
          {slugState.state === "idle" && (
            <p className="text-xs text-ink-500">Lowercase letters, numbers, and dashes only.</p>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="color">Primary color</Label>
            <div className="flex items-center gap-3">
              <label
                htmlFor="color"
                className="relative h-10 w-14 rounded-md border border-line bg-pitch-700 cursor-pointer overflow-hidden hover:border-ink-700 transition-colors"
                style={{ background: color }}
              >
                <input
                  id="color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="font-mono uppercase"
                maxLength={7}
              />
            </div>
            <p className="text-xs text-ink-500">Accent color for emails, public pages, branded badges.</p>
          </div>

          <div className="space-y-2">
            <Label>Logo (optional)</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-12 w-12 rounded-md object-cover border border-line"
                />
              ) : (
                <div className="h-12 w-12 rounded-md border border-dashed border-line flex items-center justify-center text-ink-700">
                  <Upload className="h-4 w-4" />
                </div>
              )}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleLogoUpload(file);
                  }}
                />
                <span
                  className={
                    "inline-flex items-center gap-2 rounded-md border border-line bg-pitch-700 px-3 py-2 text-sm text-ink-50 transition-colors hover:bg-pitch-600 " +
                    (uploading ? "opacity-50 cursor-not-allowed" : "")
                  }
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
                </span>
              </label>
              {logoUrl && !uploading && (
                <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-500">PNG, JPG, SVG. Max 2 MB.</p>
          </div>
        </div>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="primary"
          disabled={!canContinue}
          onClick={() =>
            onNext({
              name,
              slug,
              primaryColor: color,
              logoUrl,
            })
          }
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}

function SlugStatusBadge({ state }: { state: SlugState }) {
  if (state.state === "idle") return null;
  if (state.state === "checking") return <Loader2 className="h-4 w-4 text-ink-500 animate-spin shrink-0" aria-label="Checking" />;
  if (state.state === "available")
    return (
      <span className="flex items-center gap-1 text-xs text-turf-300 shrink-0" aria-label="Available">
        <Check className="h-3.5 w-3.5" />
        available
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-danger shrink-0" aria-label="Unavailable">
      <X className="h-3.5 w-3.5" />
      {state.reason?.toLowerCase() ?? "unavailable"}
    </span>
  );
}
