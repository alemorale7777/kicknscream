import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { getCurrentUser } from "@/lib/tenant";
import { Separator } from "@/components/ui/separator";
import type { Tenant, User } from "@prisma/client";

export async function TopNav({ tenant, user }: { tenant: Tenant; user: User }) {
  const fullUser = await getCurrentUser();
  const available =
    fullUser?.memberships.map((m) => ({
      id: m.tenant.id,
      slug: m.tenant.slug,
      name: m.tenant.name,
      type: m.tenant.type,
    })) ?? [];

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-line bg-pitch-900/85 backdrop-blur-md">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={`/t/${tenant.slug}/dashboard`}
            className="shrink-0 transition-opacity hover:opacity-80"
            aria-label="KickNScream home"
          >
            <Wordmark size="sm" />
          </Link>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <TenantSwitcher
            current={{ id: tenant.id, slug: tenant.slug, name: tenant.name, type: tenant.type }}
            available={available}
          />
        </div>

        <div className="flex items-center gap-3">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
