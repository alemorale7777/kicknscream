import { requireTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { DangerZone } from "@/components/settings/DangerZone";

export const metadata = { title: "Danger zone" };

export default async function DangerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  if (membership.role !== "OWNER") notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Danger zone</h1>
        <p className="text-ink-500 text-sm">Irreversible actions. Triple-check before proceeding.</p>
      </header>

      <DangerZone tenantId={tenant.id} slug={tenant.slug} name={tenant.name} />
    </div>
  );
}
