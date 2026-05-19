"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateUserPreferencesAction } from "@/actions/userPreferences";
import { Mail, Bell, Phone, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Prefs = {
  emailReminders: boolean;
  emailPayments: boolean;
  emailMessages: boolean;
  pushReminders: boolean;
  pushPayments: boolean;
  pushMessages: boolean;
  smsOptIn: boolean;
  smsReminders: boolean;
  smsPayments: boolean;
};

/**
 * 3×3 matrix of notification toggles: channel (Email / Push / SMS) × topic
 * (Reminders / Payments / Messages). Each cell is a tap-target switch.
 * SMS channels are disabled at the row level until the user opts in via a
 * dedicated check — keeps the carrier-compliance story honest (we should
 * have explicit consent before sending text messages).
 *
 * Saves are optimistic: the new state lands locally, the server action
 * persists, and we toast on failure with a rollback.
 */
export function NotificationPreferencesForm({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<keyof Prefs | null>(null);

  function toggle(key: keyof Prefs) {
    const prev = prefs[key];
    const next = !prev;
    setPrefs((p) => ({ ...p, [key]: next }));
    setPendingKey(key);
    startTransition(async () => {
      try {
        await updateUserPreferencesAction({ [key]: next });
      } catch (e) {
        // Roll back on failure.
        setPrefs((p) => ({ ...p, [key]: prev }));
        toast.error((e as Error).message);
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <ChannelGroup
        icon={Mail}
        label="Email"
        description="Notifications go to the email on your account."
      >
        <PrefRow
          label="Booking reminders"
          hint="24 hours and 2 hours before each session."
          enabled={prefs.emailReminders}
          onToggle={() => toggle("emailReminders")}
          pending={pending && pendingKey === "emailReminders"}
        />
        <PrefRow
          label="Payment receipts"
          hint="Receipt sent after each successful charge or refund."
          enabled={prefs.emailPayments}
          onToggle={() => toggle("emailPayments")}
          pending={pending && pendingKey === "emailPayments"}
        />
        <PrefRow
          label="Messages from your coach"
          hint="Email a copy when a coach sends you a new message."
          enabled={prefs.emailMessages}
          onToggle={() => toggle("emailMessages")}
          pending={pending && pendingKey === "emailMessages"}
        />
      </ChannelGroup>

      <ChannelGroup
        icon={Bell}
        label="Push notifications"
        description="Web push from the installed app. Requires the PWA to be installed and notifications allowed in your browser."
      >
        <PrefRow
          label="Booking reminders"
          enabled={prefs.pushReminders}
          onToggle={() => toggle("pushReminders")}
          pending={pending && pendingKey === "pushReminders"}
        />
        <PrefRow
          label="Payment events"
          enabled={prefs.pushPayments}
          onToggle={() => toggle("pushPayments")}
          pending={pending && pendingKey === "pushPayments"}
        />
        <PrefRow
          label="Messages"
          enabled={prefs.pushMessages}
          onToggle={() => toggle("pushMessages")}
          pending={pending && pendingKey === "pushMessages"}
        />
      </ChannelGroup>

      <ChannelGroup
        icon={Phone}
        label="SMS"
        description="Text-message notifications are in private beta. Opt in now to be queued for access — email reminders cover the same events today."
        muted
      >
        <PrefRow
          label="Opt in to text messages"
          hint="We'll email you once SMS is available for your account."
          enabled={prefs.smsOptIn}
          onToggle={() => toggle("smsOptIn")}
          pending={pending && pendingKey === "smsOptIn"}
        />
        <PrefRow
          label="Booking reminders"
          enabled={false}
          onToggle={() => {}}
          disabled
          pending={false}
        />
        <PrefRow
          label="Payment events"
          enabled={false}
          onToggle={() => {}}
          disabled
          pending={false}
        />
      </ChannelGroup>
    </div>
  );
}

function ChannelGroup({
  icon: Icon,
  label,
  description,
  children,
  muted,
}: {
  icon: typeof Mail;
  label: string;
  description: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className={muted ? "opacity-70" : ""}>
      <div className="flex items-start gap-3 mb-3">
        <div className="h-8 w-8 rounded-md bg-pitch-700 text-ink-300 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-50">{label}</p>
          <p className="text-xs text-ink-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="space-y-1 ml-11 border-l border-line/60 pl-4">
        {children}
      </div>
    </section>
  );
}

function PrefRow({
  label,
  hint,
  enabled,
  onToggle,
  disabled,
  pending,
}: {
  label: string;
  hint?: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-1.5",
        disabled && "opacity-60"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm text-ink-50">{label}</p>
        {hint && <p className="text-xs text-ink-500 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled || pending}
        role="switch"
        aria-checked={enabled}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-[150ms] ease-out",
          enabled ? "bg-turf-400" : "bg-pitch-700 border border-line",
          (disabled || pending) && "cursor-not-allowed"
        )}
      >
        <span className="sr-only">{label}</span>
        <span
          className={cn(
            "absolute top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-pitch-950 transition-transform duration-[150ms] ease-out",
            enabled ? "translate-x-5" : "translate-x-0.5"
          )}
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin text-ink-300" />}
        </span>
      </button>
    </div>
  );
}
