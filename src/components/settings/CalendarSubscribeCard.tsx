"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Copy, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import {
  ensureCalendarTokenAction,
  rotateCalendarTokenAction,
} from "@/actions/userPreferences";

/**
 * Surfaces the per-family iCalendar subscription URL. Tokens are lazy —
 * we don't issue one until the user expands this card and clicks
 * "Generate URL". Rotation invalidates the previous URL, so coaches who
 * leave a tenant or change emails can break old subscriptions cleanly.
 */
export function CalendarSubscribeCard({
  initialToken,
  origin,
}: {
  initialToken: string | null;
  origin: string;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [pending, startTransition] = useTransition();

  const httpsUrl = token ? `${origin}/api/calendar/${token}.ics` : null;
  const webcalUrl = httpsUrl
    ? httpsUrl.replace(/^https?:\/\//, "webcal://")
    : null;

  function generate() {
    startTransition(async () => {
      try {
        const t = await ensureCalendarTokenAction();
        setToken(t);
        toast.success("Subscription URL ready");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function rotate() {
    if (
      !window.confirm(
        "Rotating breaks any existing calendar subscriptions. Continue?"
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const t = await rotateCalendarTokenAction();
        setToken(t);
        toast.success("URL rotated — paste the new one into your calendar app");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Couldn't copy — long-press to select and copy.")
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-pitch-700 text-ink-300 flex items-center justify-center shrink-0">
          <Calendar className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink-50">Subscribe in your calendar</p>
          <p className="text-xs text-ink-500 mt-0.5">
            Subscribe and every event on your KickNScream schedule lands in
            Apple Calendar, Google Calendar, or Outlook within an hour of any
            change. The URL is a private secret — anyone who has it can read
            your schedule.
          </p>
        </div>
      </div>

      {token && webcalUrl && httpsUrl ? (
        <div className="ml-11 border-l border-line/60 pl-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="webcal">Apple Calendar · iOS / macOS</Label>
            <div className="flex gap-2">
              <Input id="webcal" readOnly value={webcalUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(webcalUrl, "Apple Calendar URL")}
                aria-label="Copy webcal URL"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={webcalUrl}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </a>
              </Button>
            </div>
            <p className="text-[11px] text-ink-500">
              On iOS, tapping &ldquo;Open&rdquo; jumps straight to Calendar&apos;s subscribe
              dialog.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="https">Google Calendar · Outlook</Label>
            <div className="flex gap-2">
              <Input id="https" readOnly value={httpsUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(httpsUrl, "URL")}
                aria-label="Copy HTTPS URL"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[11px] text-ink-500">
              In Google Calendar, choose &ldquo;Other calendars&rdquo; → &ldquo;From URL&rdquo;
              and paste this.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={rotate}
            disabled={pending}
            className="text-ink-500 hover:text-warn"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Rotate URL
          </Button>
        </div>
      ) : (
        <div className="ml-11 border-l border-line/60 pl-4">
          <Button type="button" variant="primary" size="sm" onClick={generate} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate URL
          </Button>
        </div>
      )}
    </section>
  );
}
