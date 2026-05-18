import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand/Wordmark";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Mail } from "lucide-react";
import { getCurrentUser } from "@/lib/tenant";
import {
  defaultPortalForRole,
  portalDefaultPath,
} from "@/lib/auth/portal";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/onboarding";

  // If the user is already signed in, send them straight to their
  // workspace instead of re-rendering the sign-in form. Honors the
  // callbackUrl when present so post-magic-link flows still land
  // where they intended.
  const user = await getCurrentUser();
  if (user) {
    if (sp.callbackUrl) {
      redirect(sp.callbackUrl);
    }
    const first = user.memberships[0];
    if (first) {
      redirect(
        portalDefaultPath(first.tenant.slug, defaultPortalForRole(first.role))
      );
    }
    redirect("/onboarding");
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6 bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />

      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3">
          <Wordmark size="lg" />
          <p className="text-xs uppercase tracking-[0.24em] text-turf-300">Soccer-specific operations</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in with a magic link or your Google account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {sp.error && (
              <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                {decodeURIComponent(sp.error)}
              </div>
            )}

            <form
              action={async (formData) => {
                "use server";
                const email = formData.get("email") as string;
                await signIn("resend", { email, redirectTo: callbackUrl });
              }}
              className="space-y-3"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@club.com"
                />
              </div>
              <Button type="submit" variant="primary" className="w-full">
                <Mail className="h-4 w-4" />
                Send magic link
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-pitch-800 px-3 text-ink-500">or</span>
              </div>
            </div>

            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: callbackUrl });
              }}
            >
              <Button type="submit" variant="secondary" className="w-full">
                <GoogleIcon className="h-4 w-4" />
                Continue with Google
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-ink-500">
          By signing in you agree to our terms and privacy policy.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
