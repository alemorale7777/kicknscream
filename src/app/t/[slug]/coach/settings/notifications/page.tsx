import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { headers } from "next/headers";
import { NotificationPreferencesForm } from "@/components/settings/NotificationPreferencesForm";
import { CalendarSubscribeCard } from "@/components/settings/CalendarSubscribeCard";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export const metadata = { title: "Notifications" };

/**
 * Portal-scoped wrapper around the global notifications surface. Renders
 * the same toggle matrix + calendar-subscribe card the /account page does,
 * but lives inside the coach settings shell so a tenant operator doesn't
 * have to leave the portal to manage their own delivery prefs.
 *
 * Backed by the same UserPreferences row — preferences here update in
 * lock-step with the global page, since both write through the same
 * action.
 */
export default async function CoachSettingsNotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await params;
  const { user } = await requireTenant((await params).slug);

  const prefs = await db.userPreferences.findUnique({
    where: { userId: user.id },
  });

  const initial = {
    emailReminders: prefs?.emailReminders ?? true,
    emailPayments: prefs?.emailPayments ?? true,
    emailMessages: prefs?.emailMessages ?? true,
    pushReminders: prefs?.pushReminders ?? true,
    pushPayments: prefs?.pushPayments ?? true,
    pushMessages: prefs?.pushMessages ?? true,
    smsOptIn: prefs?.smsOptIn ?? false,
    smsReminders: prefs?.smsReminders ?? false,
    smsPayments: prefs?.smsPayments ?? false,
  };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "kicknscream.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Notifications</h1>
        <p className="text-ink-500 text-sm max-w-2xl">
          Per-user delivery preferences. Email is on by default. Same as the
          global Account → Notifications surface — both write to the same
          row.
        </p>
        <p className="text-xs text-ink-500 mt-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/account/notifications">
              <ExternalLink className="h-3.5 w-3.5" />
              Open account view
            </Link>
          </Button>
        </p>
      </header>

      <Card className="p-5">
        <NotificationPreferencesForm initial={initial} />
      </Card>

      <Card className="p-5">
        <CalendarSubscribeCard
          initialToken={prefs?.calendarToken ?? null}
          origin={origin}
        />
      </Card>
    </div>
  );
}
