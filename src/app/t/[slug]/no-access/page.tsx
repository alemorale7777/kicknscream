import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight } from "lucide-react";

export const metadata = { title: "No access" };

/**
 * Landing for signed-in users who hit /t/<slug>/* without a membership on
 * that tenant. KNS-29: returning 404 from requireTenant made admins think
 * the route was broken when the real issue was authz. Anonymous traffic
 * still gets 404 (privacy — don't leak tenant existence to crawlers); only
 * authenticated users land here.
 */
export default async function NoAccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { name: true },
  });

  // Other tenants the user CAN visit — surfaced so they can self-recover.
  const myMemberships = session?.user?.id
    ? await db.membership.findMany({
        where: { userId: session.user.id },
        include: { tenant: { select: { slug: true, name: true } } },
        orderBy: { tenant: { name: "asc" } },
      })
    : [];

  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-6 space-y-4 text-center">
          <div className="h-12 w-12 rounded-full bg-pitch-700 flex items-center justify-center mx-auto">
            <Lock className="h-5 w-5 text-ink-300" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink-50">
              No access to this workspace
            </h1>
            <p className="text-sm text-ink-300 mt-1">
              You&apos;re signed in, but your account isn&apos;t a member of{" "}
              <span className="font-mono">{tenant?.name ?? slug}</span>. Ask
              the owner to invite you, or switch to a workspace you belong to.
            </p>
          </div>
          {myMemberships.length > 0 && (
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-2">
                Your workspaces
              </p>
              <ul className="space-y-1">
                {myMemberships.map((m) => (
                  <li key={m.tenantId}>
                    <Link
                      href={`/t/${m.tenant.slug}`}
                      prefetch={false}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded hover:bg-pitch-800/40 text-sm"
                    >
                      <span className="text-ink-50 font-medium truncate">
                        {m.tenant.name}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-ink-500 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/">Back to KickNScream</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
