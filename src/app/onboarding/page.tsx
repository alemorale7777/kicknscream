import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { Wordmark } from "@/components/brand/Wordmark";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import Link from "next/link";
import { getCurrentUser } from "@/lib/tenant";
import { redirect } from "next/navigation";

export const metadata = { title: "Create your tenant" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  // If the user has memberships and didn't explicitly ask to create another,
  // bounce them to their first tenant's dashboard.
  if (user && user.memberships.length > 0 && sp.force !== "1") {
    redirect(`/t/${user.memberships[0].tenant.slug}/dashboard`);
  }

  return (
    <main className="relative min-h-screen bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />

      <header className="relative z-10 flex items-center justify-between p-5 lg:px-12">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Wordmark size="md" />
        </Link>
        {user && user.memberships.length > 0 && (
          <Link
            href={`/t/${user.memberships[0].tenant.slug}/dashboard`}
            className="text-sm text-ink-500 hover:text-ink-50 transition-colors"
          >
            ← Back to dashboard
          </Link>
        )}
      </header>

      <div className="relative z-10 max-w-3xl mx-auto px-5 lg:px-12 py-8 lg:py-16">
        <OnboardingWizard />
      </div>
    </main>
  );
}
