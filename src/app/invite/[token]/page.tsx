import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth, signIn } from "@/lib/auth";
import { acceptInvitationAction } from "@/actions/membership";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wordmark } from "@/components/brand/Wordmark";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { roleLabel } from "@/lib/roles";
import { AlertTriangle, Mail } from "lucide-react";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.invitation.findUnique({
    where: { token },
    include: { tenant: true },
  });

  if (!invite) return <Shell><Invalid message="This invitation link is invalid." /></Shell>;
  // Slug root redirects to the role-correct portal via /t/[slug]/page.tsx.
  if (invite.acceptedAt) redirect(`/t/${invite.tenant.slug}`);
  if (invite.expiresAt < new Date()) return <Shell><Invalid message="This invitation has expired. Ask the inviter to send a new one." /></Shell>;

  const session = await auth();

  // Not signed in — show pre-filled magic-link form
  if (!session) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <div className="mb-3 h-12 w-12 rounded-full bg-turf-400/15 text-turf-300 flex items-center justify-center">
              <Mail className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Join {invite.tenant.name}</CardTitle>
            <CardDescription>
              Sign in as{" "}
              <span className="font-mono text-ink-50">{invite.email}</span>{" "}
              to accept this invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async () => {
                "use server";
                await signIn("resend", {
                  email: invite.email,
                  redirectTo: `/invite/${token}`,
                });
              }}
            >
              <Button type="submit" variant="primary" className="w-full">
                <Mail className="h-4 w-4" />
                Send magic link to {invite.email}
              </Button>
            </form>
            <p className="text-xs text-ink-500 mt-3">
              We&apos;ll bring you right back here once you confirm.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Signed in but wrong email
  if (session.user?.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Shell>
        <Card className="border-warn/40">
          <CardHeader>
            <div className="mb-3 h-12 w-12 rounded-full bg-warn/15 text-warn flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <CardTitle>Wrong account</CardTitle>
            <CardDescription>
              You&apos;re signed in as <span className="font-mono text-ink-50">{session.user?.email}</span>, but this
              invitation is for <span className="font-mono text-ink-50">{invite.email}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              action={async () => {
                "use server";
                const { signOut } = await import("@/lib/auth");
                await signOut({ redirectTo: `/invite/${token}` });
              }}
            >
              <Button type="submit" variant="secondary" className="w-full">
                Sign out and sign in as {invite.email}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // Signed in as the right email — show accept button
  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Join {invite.tenant.name}</CardTitle>
          <CardDescription>
            You&apos;ve been invited as{" "}
            <Badge variant="turf" className="align-middle">
              {roleLabel(invite.role)}
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              "use server";
              await acceptInvitationAction(token);
            }}
          >
            <Button type="submit" variant="accent" className="w-full">
              Accept invitation →
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen flex items-center justify-center p-6 bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />
      <div className="relative w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Wordmark size="lg" />
        </div>
        {children}
      </div>
    </main>
  );
}

function Invalid({ message }: { message: string }) {
  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle className="text-danger">Invitation unavailable</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}
