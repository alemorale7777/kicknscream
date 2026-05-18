"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ensureUniqueSlug, generateSlug, isReservedSlug } from "@/lib/slug";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";

const tenantTypeEnum = z.enum(["COACH", "INSTITUTION", "CLUB"]);

const createTenantSchema = z.object({
  type: tenantTypeEnum,
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and dashes")
    .optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  logoUrl: z.string().url().optional().nullable(),
  locationName: z.string().min(2).max(80).optional(),
  locationAddress: z.string().max(200).optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export async function createTenantAction(input: CreateTenantInput) {
  const data = createTenantSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to create a tenant");

  // If the user supplied a slug, validate availability first; otherwise auto-generate.
  let slug: string;
  if (data.slug) {
    if (isReservedSlug(data.slug)) {
      throw new Error(`"${data.slug}" is reserved. Pick a different slug.`);
    }
    const existing = await db.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) {
      throw new Error(`"${data.slug}" is already taken. Pick a different slug.`);
    }
    slug = data.slug;
  } else {
    slug = await ensureUniqueSlug(data.name);
  }

  const tenant = await db.tenant.create({
    data: {
      slug,
      name: data.name,
      type: data.type,
      logoUrl: data.logoUrl ?? null,
      primaryColor: data.primaryColor,
      memberships: {
        create: {
          userId: user.id,
          role: "OWNER",
        },
      },
      locations: data.locationName
        ? {
            create: {
              name: data.locationName,
              address: data.locationAddress || null,
            },
          }
        : undefined,
    },
  });

  revalidatePath("/");
  redirect(`/t/${tenant.slug}/coach/dashboard`);
}

const updateTenantSchema = z.object({
  tenantId: z.string(),
  name: z.string().min(2).max(80),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .or(z.literal("")),
  logoUrl: z.string().url().optional().nullable(),
});

export async function updateTenantAction(input: z.infer<typeof updateTenantSchema>) {
  const data = updateTenantSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const membership = user.memberships.find((m) => m.tenantId === data.tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to update this tenant");
  }

  await db.tenant.update({
    where: { id: data.tenantId },
    data: {
      name: data.name,
      primaryColor: data.primaryColor || null,
      logoUrl: data.logoUrl ?? null,
    },
  });

  if (membership.tenant) {
    revalidatePath(`/t/${membership.tenant.slug}/coach/settings`);
    revalidatePath(`/t/${membership.tenant.slug}/coach/dashboard`);
  }
}

const brandingSchema = z.object({
  tenantId: z.string(),
  bio: z.string().max(4000).optional().nullable(),
  testimonials: z
    .array(
      z.object({
        author: z.string().min(1).max(80),
        role: z.string().max(120).optional(),
        quote: z.string().min(1).max(1000),
      })
    )
    .max(20)
    .optional(),
});

/**
 * Updates the public-page enrichment fields (bio + testimonials). Separate
 * from updateTenantAction because the editor lives on /admin/branding and
 * the schema/permissions story is meaningfully different (testimonials is
 * a Json array, not a scalar).
 */
export async function updateTenantBrandingAction(
  input: z.infer<typeof brandingSchema>
) {
  const data = brandingSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const membership = user.memberships.find((m) => m.tenantId === data.tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to edit branding");
  }

  await db.tenant.update({
    where: { id: data.tenantId },
    data: {
      bio: data.bio ?? null,
      testimonials: data.testimonials ?? [],
    },
  });

  if (membership.tenant) {
    await db.auditLog.create({
      data: {
        tenantId: data.tenantId,
        actorUserId: user.id,
        action: "tenant.branding_update",
        targetType: "Tenant",
        diff: {
          bioLength: data.bio?.length ?? 0,
          testimonialCount: data.testimonials?.length ?? 0,
        },
      },
    });
    revalidatePath(`/${membership.tenant.slug}`);
    revalidatePath(`/t/${membership.tenant.slug}/admin/branding`);
    revalidatePath(`/t/${membership.tenant.slug}/admin/audit`);
  }
}

const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

const domainSchema = z.object({
  tenantId: z.string(),
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(domainRegex, "Enter a valid domain like coach.example.com")
    .optional()
    .or(z.literal("")),
});

/**
 * Set / clear the tenant's custom domain. Uniqueness is enforced here at
 * the application layer (we don't ship a unique index in the same migration
 * because production rows would block it).
 *
 * This action only updates the database row — DNS verification + cert
 * issuance happens out-of-band by adding the domain to the Vercel project.
 * The settings page surfaces the manual steps until we wire the Vercel
 * Domains API.
 */
export async function updateTenantDomainAction(
  input: z.infer<typeof domainSchema>
) {
  const data = domainSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const membership = user.memberships.find((m) => m.tenantId === data.tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to edit the custom domain");
  }

  const next = data.customDomain ? data.customDomain : null;

  if (next) {
    const taken = await db.tenant.findFirst({
      where: { customDomain: next, id: { not: data.tenantId } },
      select: { id: true },
    });
    if (taken) {
      throw new Error(
        `"${next}" is already in use by another tenant. Pick a different domain.`
      );
    }
  }

  await db.tenant.update({
    where: { id: data.tenantId },
    data: { customDomain: next },
  });

  if (membership.tenant) {
    await db.auditLog.create({
      data: {
        tenantId: data.tenantId,
        actorUserId: user.id,
        action: next ? "tenant.domain_set" : "tenant.domain_clear",
        targetType: "Tenant",
        diff: { customDomain: next },
      },
    });
    revalidatePath(`/t/${membership.tenant.slug}/admin/branding`);
    revalidatePath(`/t/${membership.tenant.slug}/admin/audit`);
  }
  return { customDomain: next };
}

const deleteTenantSchema = z.object({
  tenantId: z.string(),
  confirmation: z.string(),
});

export async function deleteTenantAction(input: z.infer<typeof deleteTenantSchema>) {
  const data = deleteTenantSchema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const tenant = await db.tenant.findUnique({ where: { id: data.tenantId } });
  if (!tenant) throw new Error("Tenant not found");

  if (data.confirmation !== tenant.slug) {
    throw new Error("Confirmation does not match tenant slug");
  }

  const membership = user.memberships.find((m) => m.tenantId === data.tenantId);
  if (!membership || membership.role !== "OWNER") {
    throw new Error("Only the OWNER can delete a tenant");
  }

  await db.tenant.delete({ where: { id: data.tenantId } });
  redirect("/onboarding");
}

/**
 * Lightweight slug availability check used by the onboarding wizard
 * to live-validate while the user types.
 */
export async function checkSlugAvailability(rawSlug: string): Promise<{
  available: boolean;
  reason?: string;
  suggested?: string;
}> {
  const slug = generateSlug(rawSlug);
  if (slug !== rawSlug.toLowerCase()) {
    return { available: false, reason: "Slug normalized differently", suggested: slug };
  }
  if (isReservedSlug(slug)) {
    return { available: false, reason: "Reserved", suggested: `${slug}-team` };
  }
  if (slug.length < 2) {
    return { available: false, reason: "Too short" };
  }
  const existing = await db.tenant.findUnique({ where: { slug } });
  if (existing) {
    return { available: false, reason: "Taken", suggested: await ensureUniqueSlug(slug) };
  }
  return { available: true };
}
