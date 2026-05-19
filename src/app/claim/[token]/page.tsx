import { consumeClaimTokenAction } from "@/actions/claim";

/**
 * Magic-link landing. The server action always redirects (sign-in,
 * family-home on success, or /claim/expired on failure), so this
 * component never actually renders.
 */
export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await consumeClaimTokenAction(token);
  return null;
}
