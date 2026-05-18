"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import type { PriceModel, SkillLevel } from "@prisma/client";

/**
 * Sync Stripe pricing for a recurring program (priceModel=MONTHLY).
 * - First save: create a Stripe Product + recurring Price on the tenant's
 *   connected account, store both ids on the Program.
 * - Price change: Stripe prices are immutable, so we create a new Price
 *   and update Program.stripePriceId. The old price is archived (deactivated)
 *   to keep the connected account tidy.
 * - Non-MONTHLY models leave the Stripe ids alone — we don't tear down past
 *   prices if a coach toggles their pricing model.
 *
 * Returns the up-to-date ids that should land in the Program write.
 */
async function syncStripeRecurringPrice(opts: {
  stripeAccountId: string | null | undefined;
  programName: string;
  programId: string | null;
  priceCents: number;
  priceModel: PriceModel;
  current: { stripePriceId: string | null; stripeProductId: string | null } | null;
}): Promise<{ stripeProductId: string | null; stripePriceId: string | null }> {
  if (opts.priceModel !== "MONTHLY") {
    return {
      stripeProductId: opts.current?.stripeProductId ?? null,
      stripePriceId: opts.current?.stripePriceId ?? null,
    };
  }
  if (!stripeEnabled() || !opts.stripeAccountId) {
    return {
      stripeProductId: opts.current?.stripeProductId ?? null,
      stripePriceId: opts.current?.stripePriceId ?? null,
    };
  }

  const stripe = getStripe();
  const stripeAccount = opts.stripeAccountId;

  let productId = opts.current?.stripeProductId ?? null;
  if (!productId) {
    const product = await stripe.products.create(
      {
        name: opts.programName,
        metadata: opts.programId ? { programId: opts.programId } : undefined,
      },
      { stripeAccount }
    );
    productId = product.id;
  } else {
    // Keep the product name in sync with the program name.
    await stripe.products.update(
      productId,
      { name: opts.programName },
      { stripeAccount }
    );
  }

  // If the existing price already matches the cents, reuse it.
  if (opts.current?.stripePriceId) {
    try {
      const existingPrice = await stripe.prices.retrieve(
        opts.current.stripePriceId,
        undefined,
        { stripeAccount }
      );
      const matchesAmount = existingPrice.unit_amount === opts.priceCents;
      const matchesRecurring = existingPrice.recurring?.interval === "month";
      const active = existingPrice.active;
      if (matchesAmount && matchesRecurring && active) {
        return { stripeProductId: productId, stripePriceId: existingPrice.id };
      }
    } catch {
      // The stored price id is stale — fall through and create a new one.
    }
  }

  const newPrice = await stripe.prices.create(
    {
      product: productId,
      unit_amount: opts.priceCents,
      currency: "usd",
      recurring: { interval: "month", interval_count: 1 },
    },
    { stripeAccount }
  );

  // Archive the old price (best effort — never block the save on this).
  if (opts.current?.stripePriceId && opts.current.stripePriceId !== newPrice.id) {
    stripe.prices
      .update(opts.current.stripePriceId, { active: false }, { stripeAccount })
      .catch(() => {});
  }

  return { stripeProductId: productId, stripePriceId: newPrice.id };
}

const PRICE_MODEL = z.enum(["PER_SESSION", "PACKAGE", "MONTHLY", "SEASON", "FREE"]);
const SKILL_LEVEL = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ELITE"]);

const baseSchema = z
  .object({
    tenantId: z.string(),
    name: z.string().min(2).max(120),
    description: z.string().max(2000).optional(),
    ageMin: z.union([z.number().int().min(2).max(99), z.literal("")]).optional().nullable(),
    ageMax: z.union([z.number().int().min(2).max(99), z.literal("")]).optional().nullable(),
    skillLevel: SKILL_LEVEL.optional().nullable(),
    priceModel: PRICE_MODEL,
    // Dollars on the wire; we store cents
    priceDollars: z.number().min(0).max(99999),
    capacity: z.union([z.number().int().min(1).max(2000), z.literal("")]).optional().nullable(),
  })
  .refine(
    (d) => !(d.priceModel === "MONTHLY" && d.priceDollars <= 0),
    {
      message:
        "Monthly programs need a price. Use Free if there's no charge, or set a non-zero amount.",
      path: ["priceDollars"],
    }
  );

async function assertCanManage(tenantId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (!membership || !canManageTenant(membership.role)) {
    throw new Error("You don't have permission to manage programs");
  }
  return { user, membership };
}

export async function createProgramAction(input: z.infer<typeof baseSchema>) {
  const data = baseSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  // FREE always saves as $0 regardless of what the client form posted.
  // The dialog disables but doesn't clear the price input, so a coach
  // switching PER_SESSION→FREE with a lingering "60" in the box used
  // to save a $60 FREE program. Force zero here as the source of truth.
  const priceCents = data.priceModel === "FREE" ? 0 : Math.round(data.priceDollars * 100);

  const created = await db.program.create({
    data: {
      tenantId: data.tenantId,
      name: data.name,
      description: data.description || null,
      ageMin: typeof data.ageMin === "number" ? data.ageMin : null,
      ageMax: typeof data.ageMax === "number" ? data.ageMax : null,
      skillLevel: (data.skillLevel as SkillLevel) || null,
      priceModel: data.priceModel as PriceModel,
      price: priceCents,
      capacity: typeof data.capacity === "number" ? data.capacity : null,
    },
  });

  // Stripe-side sync runs after the row exists so we can stash the program id
  // as Product metadata for cross-reference.
  const stripeIds = await syncStripeRecurringPrice({
    stripeAccountId: membership.tenant.stripeAccountId,
    programName: data.name,
    programId: created.id,
    priceCents,
    priceModel: data.priceModel as PriceModel,
    current: null,
  }).catch(() => null);
  if (stripeIds && (stripeIds.stripePriceId || stripeIds.stripeProductId)) {
    await db.program.update({
      where: { id: created.id },
      data: {
        stripeProductId: stripeIds.stripeProductId,
        stripePriceId: stripeIds.stripePriceId,
      },
    });
  }

  revalidatePath(`/t/${membership.tenant.slug}/coach/programs`);
  revalidatePath(`/${membership.tenant.slug}`);
  revalidatePath(`/${membership.tenant.slug}/book`);
}

const updateSchema = baseSchema.extend({ id: z.string(), archived: z.boolean().optional() });

export async function updateProgramAction(input: z.infer<typeof updateSchema>) {
  const data = updateSchema.parse(input);
  const { membership } = await assertCanManage(data.tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");

  const existing = await db.program.findUnique({
    where: { id: data.id },
    select: { stripePriceId: true, stripeProductId: true },
  });
  // FREE always saves as $0 — mirror of createProgramAction.
  const priceCents = data.priceModel === "FREE" ? 0 : Math.round(data.priceDollars * 100);

  const stripeIds = await syncStripeRecurringPrice({
    stripeAccountId: membership.tenant.stripeAccountId,
    programName: data.name,
    programId: data.id,
    priceCents,
    priceModel: data.priceModel as PriceModel,
    current: existing,
  }).catch(() => existing);

  await db.program.update({
    where: { id: data.id },
    data: {
      name: data.name,
      description: data.description || null,
      ageMin: typeof data.ageMin === "number" ? data.ageMin : null,
      ageMax: typeof data.ageMax === "number" ? data.ageMax : null,
      skillLevel: (data.skillLevel as SkillLevel) || null,
      priceModel: data.priceModel as PriceModel,
      price: priceCents,
      capacity: typeof data.capacity === "number" ? data.capacity : null,
      archived: data.archived ?? false,
      stripeProductId: stripeIds?.stripeProductId ?? existing?.stripeProductId ?? null,
      stripePriceId: stripeIds?.stripePriceId ?? existing?.stripePriceId ?? null,
    },
  });

  revalidatePath(`/t/${membership.tenant.slug}/coach/programs`);
  revalidatePath(`/${membership.tenant.slug}`);
  revalidatePath(`/${membership.tenant.slug}/book`);
}

export async function archiveProgramAction(tenantId: string, programId: string, archived: boolean) {
  const { membership } = await assertCanManage(tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");
  await db.program.update({ where: { id: programId }, data: { archived } });
  revalidatePath(`/t/${membership.tenant.slug}/coach/programs`);
  revalidatePath(`/${membership.tenant.slug}`);
}

export async function deleteProgramAction(tenantId: string, programId: string) {
  const { membership } = await assertCanManage(tenantId);
  if (!membership.tenant) throw new Error("Tenant not found");
  // Soft-protect: refuse if there are enrollments
  const enrollmentCount = await db.enrollment.count({ where: { programId } });
  if (enrollmentCount > 0) {
    throw new Error(
      `This program has ${enrollmentCount} enrollment${enrollmentCount === 1 ? "" : "s"}. Archive it instead so historical data is preserved.`
    );
  }
  await db.program.delete({ where: { id: programId } });
  revalidatePath(`/t/${membership.tenant.slug}/coach/programs`);
  revalidatePath(`/${membership.tenant.slug}`);
}
