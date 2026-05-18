import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { NotificationPreferencesForm } from "@/components/settings/NotificationPreferencesForm";
import { Wordmark } from "@/components/brand/Wordmark";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Notification preferences" };

/**
 * Tenant-agnostic notification preferences. Lives outside the /t/[slug]
 * tree so a single user with memberships in multiple tenants only manages
 * one row, matching the global UserPreferences model.
 */
export default async function AccountNotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/account/notifications");
  }
  const userId = session.user.id;

  const prefs = await db.userPreferences.findUnique({ where: { userId } });
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

  return (
    <main className="min-h-screen bg-pitch-900 text-ink-50">
      <header className="border-b border-line">
        <div className="max-w-3xl mx-auto px-5 lg:px-8 py-4 flex items-center justify-between">
          <Wordmark size="sm" />
          <Link
            href="/"
            className="text-sm text-ink-500 hover:text-ink-50 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Home
          </Link>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-5 lg:px-8 py-10 space-y-6">
        <header className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
            Account · Notifications
          </p>
          <h1 className="text-3xl font-bold tracking-[-0.02em]">
            How we contact you
          </h1>
          <p className="text-sm text-ink-500 max-w-2xl mt-2">
            One set of preferences across every tenant you belong to. Email
            is on by default for the things that matter — confirmations and
            reminders. SMS goes live in a future release.
          </p>
        </header>
        <Card className="p-5">
          <NotificationPreferencesForm initial={initial} />
        </Card>
      </div>
    </main>
  );
}
