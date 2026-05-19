"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateTenantBrandingAction } from "@/actions/tenant";
import { Plus, Trash2, Loader2, GripVertical } from "lucide-react";

type Testimonial = { author: string; role?: string; quote: string };

/**
 * Branding editor — drives the bio + testimonials sections on the public
 * tenant page. Bio is plain prose (no markdown rendering yet); testimonials
 * are a simple repeating list. Reorder via the up/down arrows on each row
 * since a full dnd-kit setup would be overkill for <=20 items.
 */
export function BrandingEditor({
  tenantId,
  initialBio,
  initialTestimonials,
}: {
  tenantId: string;
  initialBio: string;
  initialTestimonials: Testimonial[];
}) {
  const [bio, setBio] = useState(initialBio);
  const [testimonials, setTestimonials] = useState<Testimonial[]>(
    initialTestimonials
  );
  const [pending, startTransition] = useTransition();

  function update(i: number, patch: Partial<Testimonial>) {
    setTestimonials((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function remove(i: number) {
    setTestimonials((prev) => prev.filter((_, idx) => idx !== i));
  }
  function add() {
    if (testimonials.length >= 20) {
      toast.error("Twenty testimonials is the cap — trim a few before adding more.");
      return;
    }
    setTestimonials((prev) => [...prev, { author: "", role: "", quote: "" }]);
  }
  function move(i: number, dir: -1 | 1) {
    setTestimonials((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function save() {
    // Drop any empty rows before saving — easier UX than yelling about
    // validation when the user adds a row and then doesn't fill it in.
    const cleaned = testimonials
      .map((t) => ({
        author: t.author.trim(),
        role: t.role?.trim() ?? "",
        quote: t.quote.trim(),
      }))
      .filter((t) => t.author && t.quote);

    startTransition(async () => {
      try {
        await updateTenantBrandingAction({
          tenantId,
          bio: bio.trim() || null,
          testimonials: cleaned,
        });
        setTestimonials(cleaned);
        toast.success("Public page updated");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="bio">About / coach bio</Label>
          <span className="text-[11px] text-ink-500 font-mono tabular-nums">
            {bio.length} / 4000
          </span>
        </div>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={6}
          placeholder="Write a paragraph about your coaching philosophy, background, or what makes your program different."
        />
        <p className="text-xs text-ink-500">
          Shows up under the hero on /{tenantId.slice(0, 6)}…/ as an &ldquo;About&rdquo;
          paragraph. Solo coach pages also publish a Person profile so search
          engines connect your bio to your sessions — no action needed.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-ink-50">Testimonials</p>
          <span className="text-[11px] text-ink-500 font-mono tabular-nums">
            {testimonials.length} / 20
          </span>
        </div>
        <div className="space-y-3">
          {testimonials.length === 0 && (
            <p className="text-sm text-ink-500 italic">
              No testimonials yet. Add a few quotes from happy parents — they
              feed into the Review JSON-LD block too so Google can show stars.
            </p>
          )}
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="rounded-md border border-line bg-pitch-700/30 p-3 space-y-2"
            >
              <div className="flex items-center gap-1">
                <div className="flex flex-col text-ink-700">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="hover:text-ink-300 disabled:opacity-30 leading-none"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === testimonials.length - 1}
                    aria-label="Move down"
                    className="hover:text-ink-300 disabled:opacity-30 leading-none"
                  >
                    ▼
                  </button>
                </div>
                <GripVertical className="h-3 w-3 text-ink-700 mx-1" />
                <Input
                  value={t.author}
                  onChange={(e) => update(i, { author: e.target.value })}
                  placeholder="Author (e.g. Jamie L.)"
                  className="h-9 text-sm"
                />
                <Input
                  value={t.role ?? ""}
                  onChange={(e) => update(i, { role: e.target.value })}
                  placeholder="Role (e.g. Parent · U12 player)"
                  className="h-9 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  onClick={() => remove(i)}
                  aria-label="Remove testimonial"
                  className="text-ink-500 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={t.quote}
                onChange={(e) => update(i, { quote: e.target.value })}
                placeholder="What they said about working with you."
                rows={2}
                className="text-sm"
              />
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
          Add a testimonial
        </Button>
      </section>

      <div className="flex justify-end gap-2 pt-2 border-t border-line">
        <Button type="button" variant="primary" onClick={save} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
