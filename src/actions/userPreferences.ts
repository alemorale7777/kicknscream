"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/tenant";

const schema = z.object({
  emailReminders: z.boolean().optional(),
  emailPayments: z.boolean().optional(),
  emailMessages: z.boolean().optional(),
  pushReminders: z.boolean().optional(),
  pushPayments: z.boolean().optional(),
  pushMessages: z.boolean().optional(),
  smsOptIn: z.boolean().optional(),
  smsReminders: z.boolean().optional(),
  smsPayments: z.boolean().optional(),
  // Theme is "dark" | "light" | "system" or null.
  theme: z
    .union([z.literal("dark"), z.literal("light"), z.literal("system")])
    .nullable()
    .optional(),
});

/**
 * Upserts the current user's notification preferences. Each call patches
 * only the fields the form actually changed — undefined values are dropped
 * so partial updates don't clobber unrelated toggles.
 */
export async function updateUserPreferencesAction(
  input: z.infer<typeof schema>
) {
  const data = schema.parse(input);
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) patch[k] = v;
  }

  await db.userPreferences.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...patch },
    update: patch,
  });

  // Revalidate every settings surface that surfaces these toggles.
  revalidatePath("/", "layout");
}
