/**
 * Display name for greetings. NextAuth populates user.name from the
 * email local-part when there's no Google/profile display name, so a
 * raw "Hello, alemorale7777" reads like a debug log. Skip the handle
 * pattern and fall back to a role-appropriate label.
 *
 * Heuristic: an all-lowercase string with digits and no spaces is
 * almost certainly an email handle. A space anywhere = real name.
 */
export function greetingName(
  rawName: string | null | undefined,
  fallback: string
): string {
  const trimmed = rawName?.trim();
  if (!trimmed) return fallback;
  const looksLikeHandle =
    /^[a-z0-9_.+-]+$/.test(trimmed) && /[0-9]/.test(trimmed);
  if (looksLikeHandle) return fallback;
  // First-name only — last name reads as overly formal in a hero greeting.
  return trimmed.split(" ")[0];
}
