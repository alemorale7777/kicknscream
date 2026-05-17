import { requireTenant } from "@/lib/tenant";
import { canManageTenant } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TenantSettingsForm } from "@/components/settings/TenantSettingsForm";

export const metadata = { title: "Tenant info" };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, membership } = await requireTenant(slug);
  const canEdit = canManageTenant(membership.role);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Tenant info</h1>
        <p className="text-ink-500 text-sm">How parents, players, and prospects see you.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Updating these fields takes effect immediately on your public pages.</CardDescription>
        </CardHeader>
        <CardContent>
          <TenantSettingsForm tenant={tenant} canEdit={canEdit} />
        </CardContent>
      </Card>

      {!canEdit && (
        <p className="text-xs text-ink-500">
          You have <span className="font-medium text-ink-300">{membership.role.toLowerCase()}</span> access — ask
          an OWNER or ADMIN to edit these settings.
        </p>
      )}
    </div>
  );
}
