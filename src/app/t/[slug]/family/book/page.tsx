import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { ServiceCatalog } from "@/components/book/ServiceCatalog";

export const metadata = { title: "Book" };

export default async function FamilyBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  const programs = await db.program.findMany({
    where: { tenantId: tenant.id, archived: false },
    orderBy: [{ priceModel: "asc" }, { price: "asc" }],
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Book</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em]">What&apos;s open</h1>
      </header>
      <ServiceCatalog programs={programs} tenantSlug={tenant.slug} variant="full" />
    </div>
  );
}
