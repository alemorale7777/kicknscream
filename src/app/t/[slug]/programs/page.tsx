import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { ProgramsList } from "@/components/programs/ProgramsList";

export const metadata = { title: "Programs" };

export default async function ProgramsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const canEdit = canManageTenant(membership.role);

  const programs = await db.program.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });

  const label = tenant.type === "COACH" ? "Services" : "Programs";

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">{label}</p>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-[-0.03em]">
            {tenant.type === "COACH" ? "Your services" : "Programs"}
          </h1>
          <span className="text-ink-500 font-mono text-sm">
            {programs.length} total
          </span>
        </div>
        <p className="text-sm text-ink-500 mt-2">
          {tenant.type === "COACH"
            ? "Services parents can book from your public page. Set up single sessions, multi-packs, and recurring options."
            : "Classes, camps, clinics, and sessions parents register for. Public registration opens once you create a program."}
        </p>
      </header>

      <ProgramsList tenantId={tenant.id} tenantSlug={tenant.slug} programs={programs} canEdit={canEdit} tenantLabel={label} />
    </div>
  );
}
