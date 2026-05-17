import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { defaultPortalForRole, portalDefaultPath } from "@/lib/auth/portal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight } from "lucide-react";
import { roleLabel } from "@/lib/roles";

export const metadata = { title: "Not allowed" };

export default async function ForbiddenPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ attempted?: string }>;
}) {
  const { slug } = await params;
  const { attempted } = await searchParams;
  const { tenant, membership } = await requireTenant(slug);
  const myPortal = defaultPortalForRole(membership.role);
  const myHome = portalDefaultPath(tenant.slug, myPortal);

  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 space-y-5 text-center">
          <div className="h-12 w-12 rounded-full bg-warn/10 text-warn flex items-center justify-center mx-auto">
            <Lock className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">No access here</h1>
            <p className="text-sm text-ink-500">
              You&apos;re signed in as{" "}
              <span className="font-mono text-ink-300">{roleLabel(membership.role)}</span> in{" "}
              <span className="font-semibold text-ink-300">{tenant.name}</span>.
              {attempted && <> That URL is for a different workspace.</>}
            </p>
          </div>
          <Button variant="primary" asChild className="w-full">
            <Link href={myHome} className="inline-flex items-center justify-center gap-2">
              Go to my {myPortal} workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
