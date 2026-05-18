import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { db } from "@/lib/db";
import { ProgramsList } from "@/components/programs/ProgramsList";
import { PageHeader } from "@/components/chrome/PageHeader";

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
      <PageHeader
        eyebrow={label}
        title={tenant.type === "COACH" ? "Your services" : "Programs"}
        count={`${programs.length} total`}
        description={
          tenant.type === "COACH"
            ? "Services parents can book from your public page. Set up single sessions, multi-packs, and recurring options."
            : "Classes, camps, clinics, and sessions parents register for. Public registration opens once you create a program."
        }
      />

      <ProgramsList tenantId={tenant.id} tenantSlug={tenant.slug} programs={programs} canEdit={canEdit} tenantLabel={label} />
    </div>
  );
}
