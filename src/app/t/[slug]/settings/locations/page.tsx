import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { LocationsManager } from "@/components/settings/LocationsManager";

export const metadata = { title: "Locations" };

export default async function LocationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  if (tenant.type === "COACH") notFound();
  const canEdit = canManageTenant(membership.role);

  const locations = await db.location.findMany({
    where: { tenantId: tenant.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Locations</h1>
        <p className="text-ink-500 text-sm">Venues, fields, and facilities for your programs and events.</p>
      </header>

      <LocationsManager tenantId={tenant.id} locations={locations} canEdit={canEdit} />
    </div>
  );
}
