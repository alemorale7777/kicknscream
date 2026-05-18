import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import {
  defaultPortalForRole,
  portalDefaultPath,
} from "@/lib/auth/portal";

/**
 * /t/[slug] root — redirects to the user's role-appropriate portal
 * landing page. Without this, bookmarks or stripped URLs that drop
 * the trailing portal segment would 404.
 *
 * Auth gating happens upstream in proxy.ts; this page also runs
 * through requireTenant() to resolve the user's role on this tenant.
 */
export default async function TenantRootPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { membership } = await requireTenant(slug);
  const portal = defaultPortalForRole(membership.role);
  redirect(portalDefaultPath(slug, portal));
}
