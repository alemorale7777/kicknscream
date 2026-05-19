import { env } from "@/lib/env";

const API = "https://api.vercel.com";

/**
 * Vercel Domains API client. All operations are no-ops when
 * VERCEL_TOKEN + VERCEL_PROJECT_ID aren't set — the custom-domain
 * flow falls back to surfacing manual CLI instructions in that case.
 *
 * VERCEL_TEAM_ID is optional; required only for team-owned projects.
 */

function isEnabled(): boolean {
  return !!env.VERCEL_TOKEN && !!env.VERCEL_PROJECT_ID;
}

function teamQuery(): string {
  return env.VERCEL_TEAM_ID ? `?teamId=${env.VERCEL_TEAM_ID}` : "";
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${env.VERCEL_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export type VercelDomainStatus =
  | "pending_dns"
  | "verified"
  | "misconfigured"
  | "unknown";

/**
 * Attach a domain to the Vercel project. Returns ok=true on success
 * (including the 409 "already attached" case — treated as idempotent).
 */
export async function attachDomain(
  name: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isEnabled()) return { ok: false, error: "Vercel API not configured" };
  const res = await fetch(
    `${API}/v10/projects/${env.VERCEL_PROJECT_ID}/domains${teamQuery()}`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    }
  );
  if (res.ok) return { ok: true };
  if (res.status === 409) return { ok: true }; // already attached
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return {
    ok: false,
    error: body.error?.message ?? `Vercel API returned ${res.status}`,
  };
}

/**
 * Detach a domain from the Vercel project. 404 (already gone) is treated
 * as success.
 */
export async function detachDomain(
  name: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isEnabled()) return { ok: false, error: "Vercel API not configured" };
  const res = await fetch(
    `${API}/v9/projects/${env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(name)}${teamQuery()}`,
    { method: "DELETE", headers: authHeaders() }
  );
  if (res.ok || res.status === 404) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return {
    ok: false,
    error: body.error?.message ?? `Vercel API returned ${res.status}`,
  };
}

/**
 * Poll Vercel for the DNS-config state of a domain. Used by the
 * /admin/branding card to show pending/verified/misconfigured.
 */
export async function getDomainStatus(name: string): Promise<VercelDomainStatus> {
  if (!isEnabled()) return "unknown";
  const res = await fetch(
    `${API}/v6/domains/${encodeURIComponent(name)}/config${teamQuery()}`,
    { headers: authHeaders() }
  );
  if (!res.ok) return "unknown";
  const body = (await res.json()) as {
    misconfigured?: boolean;
    configuredBy?: string | null;
  };
  if (body.misconfigured) return "misconfigured";
  if (body.configuredBy) return "verified";
  return "pending_dns";
}

export function vercelDomainsEnabled(): boolean {
  return isEnabled();
}
