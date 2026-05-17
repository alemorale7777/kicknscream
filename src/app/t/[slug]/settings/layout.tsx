import type { ReactNode } from "react";
import { requireTenant } from "@/lib/tenant";
import { SettingsNav } from "@/components/chrome/SettingsNav";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);

  return (
    <div className="max-w-6xl flex flex-col lg:flex-row gap-8 lg:gap-12">
      <aside className="lg:w-56 shrink-0">
        <div className="lg:sticky lg:top-24">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500 mb-3 px-3">Settings</p>
          <SettingsNav tenant={tenant} isOwner={membership.role === "OWNER"} />
        </div>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
