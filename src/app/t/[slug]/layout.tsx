import type { ReactNode } from "react";
import { requireTenant } from "@/lib/tenant";
import { TopNav } from "@/components/chrome/TopNav";
import { SideNav } from "@/components/chrome/SideNav";

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, membership } = await requireTenant(slug);

  return (
    <div className="min-h-screen bg-pitch-900 text-ink-50">
      <TopNav tenant={tenant} user={user} />
      <div className="flex">
        <SideNav tenant={tenant} role={membership.role} />
        <main className="flex-1 min-h-[calc(100vh-64px)] p-5 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: { template: `%s · ${slug}`, default: slug } };
}
