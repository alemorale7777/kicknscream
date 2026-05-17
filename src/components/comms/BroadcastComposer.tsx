"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card } from "@/components/ui/card";
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
import { Markdown } from "@/components/schedule/Markdown";
import { toast } from "sonner";
import { sendBroadcastAction } from "@/actions/broadcast";
import { Eye, PencilLine, Loader2, Send, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  audience: z.enum(["ALL_PARENTS", "BY_PROGRAM"]),
  programId: z.string().optional(),
  subject: z.string().min(2, "Required").max(180),
  body: z.string().min(2, "Required").max(20000),
});
type FormData = z.infer<typeof schema>;

type Template = { id: string; label: string; subject: string; body: string };
type ProgramOption = { id: string; name: string };

export function BroadcastComposer({
  tenantId,
  programs,
  templates,
  audienceCounts,
}: {
  tenantId: string;
  programs: ProgramOption[];
  templates: Template[];
  audienceCounts: { allParents: number };
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      audience: "ALL_PARENTS",
      subject: "",
      body: "",
    },
  });

  const audience = useWatch({ control, name: "audience" });
  const subject = useWatch({ control, name: "subject" });
  const body = useWatch({ control, name: "body" });
  const programId = useWatch({ control, name: "programId" });

  function applyTemplate(t: Template) {
    setValue("subject", t.subject, { shouldValidate: true });
    setValue("body", t.body, { shouldValidate: true });
    toast.message(`Loaded template · ${t.label}`);
  }

  function onSubmit(data: FormData) {
    if (data.audience === "BY_PROGRAM" && !data.programId) {
      toast.error("Pick a program for the audience");
      return;
    }
    startTransition(async () => {
      try {
        const result = await sendBroadcastAction({
          tenantId,
          audience: data.audience,
          programId: data.programId,
          subject: data.subject,
          body: data.body,
        });
        toast.success(`Sent to ${result.sent}/${result.totalAudience} recipients`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Select
              value={audience}
              onValueChange={(v) => setValue("audience", v as FormData["audience"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_PARENTS">All parents ({audienceCounts.allParents})</SelectItem>
                <SelectItem value="BY_PROGRAM">Parents of a specific program</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {audience === "BY_PROGRAM" && (
            <div className="space-y-1.5">
              <Label>Program</Label>
              <Select
                value={programId ?? ""}
                onValueChange={(v) => setValue("programId", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" {...register("subject")} placeholder="What's the message about?" />
          {errors.subject && <p className="text-xs text-danger">{errors.subject.message}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="body">Message</Label>
            <div className="inline-flex rounded-md border border-line bg-pitch-800 p-0.5">
              <button
                type="button"
                onClick={() => setTab("write")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors duration-[120ms]",
                  tab === "write" ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
                )}
              >
                <PencilLine className="h-3 w-3" /> Write
              </button>
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors duration-[120ms]",
                  tab === "preview" ? "bg-pitch-700 text-ink-50" : "text-ink-500 hover:text-ink-300"
                )}
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
            </div>
          </div>
          {tab === "write" ? (
            <Textarea
              id="body"
              {...register("body")}
              rows={10}
              placeholder="Hi families,&#10;&#10;Quick note about... Supports **bold**, *italic*, and bullet lists with - dashes."
            />
          ) : (
            <Card className="p-5 bg-pitch-900/40 min-h-[180px]">
              {subject && <h3 className="font-bold text-lg mb-3">{subject}</h3>}
              {body ? <Markdown>{body}</Markdown> : <p className="text-ink-700 italic text-sm">Preview appears here.</p>}
            </Card>
          )}
          {errors.body && <p className="text-xs text-danger">{errors.body.message}</p>}
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <Users className="h-3.5 w-3.5" />
          {audience === "ALL_PARENTS"
            ? `${audienceCounts.allParents} parents will receive this`
            : programId
              ? "Parents in the selected program will receive this"
              : "Pick a program above"}
        </div>
        <Button type="submit" variant="accent" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send broadcast
            </>
          )}
        </Button>
      </div>

      {templates.length > 0 && (
        <Card className="p-5 space-y-3 border-flood-400/30">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-flood-400" />
            <h3 className="text-sm font-semibold text-ink-50">Templates</h3>
            <span className="text-xs text-ink-500">— click to load into the composer</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className="text-left rounded-md border border-line bg-pitch-700/40 p-3 transition-colors duration-[120ms] hover:border-flood-400/40 hover:bg-pitch-700"
              >
                <p className="text-sm font-medium text-ink-50">{t.label}</p>
                <p className="text-xs text-ink-500 mt-0.5 truncate">{t.subject}</p>
              </button>
            ))}
          </div>
        </Card>
      )}
    </form>
  );
}
