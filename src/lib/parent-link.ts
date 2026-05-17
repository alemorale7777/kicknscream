export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Strip a leading US country code "1" if length is 11
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

type ParentLike = { id: string; email: string | null; phone: string | null };

/**
 * Find the existing parent that matches the new booking's email or phone.
 * Email match wins over phone match. Returns null when no candidate matches.
 */
export function matchParent<T extends ParentLike>(
  candidates: T[],
  incoming: { email: string | null; phone: string | null }
): T | null {
  const targetEmail = normalizeEmail(incoming.email);
  const targetPhone = normalizePhone(incoming.phone);
  if (targetEmail) {
    const byEmail = candidates.find((c) => normalizeEmail(c.email) === targetEmail);
    if (byEmail) return byEmail;
  }
  if (targetPhone) {
    const byPhone = candidates.find((c) => normalizePhone(c.phone) === targetPhone);
    if (byPhone) return byPhone;
  }
  return null;
}
