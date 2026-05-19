import { requireTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/chrome/PageHeader";
import { BrandingEditor } from "@/components/admin/BrandingEditor";
import { CustomDomainCard } from "@/components/admin/CustomDomainCard";
import { Card } from "@/components/ui/card";
import { canManageTenant } from "@/lib/roles";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export const metadata = { title: "Branding" };

type Testimonial = { author: string; role?: string; quote: string };

function parseTestimonials(raw: unknown): Testimonial[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t): Testimonial[] => {
    if (!t || typeof t !== "object") return [];
    const obj = t as Record<string, unknown>;
    if (typeof obj.author !== "string" || typeof obj.quote !== "string") {
      return [];
    }
    return [
      {
        author: obj.author,
        role: typeof obj.role === "string" ? obj.role : undefined,
        quote: obj.quote,
      },
    ];
  });
}

export default async function AdminBrandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);

  if (!canManageTenant(membership.role)) {
    redirect(`/t/${slug}/admin/billing`);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Branding"
        title="Your public page"
        description="What players, parents, and search engines see when they land on /:slug. Logo and color live on Settings — bio and testimonials live here."
        actions={
          <Link
            href={`/${tenant.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View public page
          </Link>
        }
      />

      <Card className="p-5">
        <BrandingEditor
          tenantId={tenant.id}
          initialBio={tenant.bio ?? ""}
          initialTestimonials={parseTestimonials(tenant.testimonials)}
        />
      </Card>

      <CustomDomainCard
        tenantId={tenant.id}
        initialDomain={tenant.customDomain ?? null}
        initialStatus={tenant.customDomainStatus ?? null}
      />
    </div>
  );
}
