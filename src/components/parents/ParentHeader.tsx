import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone } from "lucide-react";
import type { Parent, TenantParent } from "@prisma/client";

export function ParentHeader({
  tenantParent,
}: {
  tenantParent: TenantParent & { parent: Parent };
  // Forward-compat: list page passes a `tenantSlug` prop we don't currently
  // use. Accepting it (optional) keeps the call site stable for when we wire
  // a "back to list" or "deep link" target into this card.
  tenantSlug?: string;
}) {
  const p = tenantParent.parent;
  return (
    <Card className="px-6 py-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-14 w-14 rounded-full bg-pitch-700 flex items-center justify-center text-sm font-mono text-ink-300 shrink-0">
            {(p.name ?? p.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-ink-500">Parent</p>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-50 truncate">
              {p.name ?? "(no name on file)"}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-ink-300 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-ink-500" />
                {p.email}
              </span>
              {p.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-ink-500" />
                  {p.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {tenantParent.status === "REVOKED" ? (
            <Badge variant="outline" className="border-warn/40 text-warn">Revoked</Badge>
          ) : p.deletedAt ? (
            <Badge variant="outline" className="border-line text-ink-500">Deleted</Badge>
          ) : p.userId ? (
            <Badge variant="outline" className="border-turf-400/40 text-turf-300">Claimed</Badge>
          ) : (
            <Badge variant="outline" className="border-flood-400/40 text-flood-400">Unclaimed</Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
