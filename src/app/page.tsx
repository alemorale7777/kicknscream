import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/Wordmark";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/tenant";
import {
  defaultPortalForRole,
  portalDefaultPath,
} from "@/lib/auth/portal";

export default async function HomePage() {
  // Show a "Go to your dashboard" link for signed-in visitors instead of
  // the sign-in/get-started pair. Routes to the right portal per role.
  const user = await getCurrentUser();
  const firstMembership = user?.memberships?.[0];
  const dashboardHref = firstMembership
    ? portalDefaultPath(
        firstMembership.tenant.slug,
        defaultPortalForRole(firstMembership.role)
      )
    : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-pitch-900">
      <ChalkGrid />
      <Floodlight />

      <header className="relative z-10 flex items-center justify-between p-6 lg:px-12">
        <Wordmark size="md" />
        <div className="flex items-center gap-2">
          {dashboardHref ? (
            <Button variant="primary" asChild>
              <Link href={dashboardHref} className="inline-flex items-center gap-1.5">
                Open dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/auth/signin">Sign in</Link>
              </Button>
              <Button variant="primary" asChild>
                <Link href="/auth/signin">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <section className="relative z-10 px-6 lg:px-12 pt-12 lg:pt-24 max-w-5xl">
        <p className="text-xs uppercase tracking-[0.24em] text-turf-300 mb-6">Soccer-specific operations</p>
        <h1 className="text-5xl lg:text-7xl font-bold tracking-[-0.04em] leading-[0.95] text-balance">
          Built by a coach.<br />
          Priced for clubs.<br />
          <span className="text-turf-400">Designed for parents.</span>
        </h1>
        <p className="mt-8 text-xl text-ink-300 max-w-2xl leading-relaxed text-pretty">
          KickNScream collapses the patchwork of generic team apps coaches resort to into one
          modern platform built for coaches, academies, and clubs. Half the price, mobile-first,
          no fluff.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button variant="accent" size="lg" asChild>
            <Link href="/auth/signin" className="inline-flex items-center gap-2">
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="#pricing">See pricing</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3 max-w-3xl">
          {[
            { label: "Coaches", desc: "Bookings, packages, session notes" },
            { label: "Academies", desc: "Programs, attendance, payments" },
            { label: "Clubs", desc: "Teams, tryouts, development" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-line bg-pitch-800/60 backdrop-blur-sm p-5"
            >
              <p className="text-xs uppercase tracking-wider text-turf-300 mb-2">For {item.label}</p>
              <p className="text-sm text-ink-300">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mt-32 border-t border-line py-8 px-6 lg:px-12 flex justify-between items-center text-xs text-ink-500">
        <Wordmark size="sm" />
        <span>© 2026 KickNScream</span>
      </footer>
    </main>
  );
}
