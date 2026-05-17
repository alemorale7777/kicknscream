"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createLocationAction, updateLocationAction, deleteLocationAction } from "@/actions/location";
import { MapPin, Plus, Trash2, Pencil, X, Loader2 } from "lucide-react";
import type { Location } from "@prisma/client";

export function LocationsManager({
  tenantId,
  locations,
  canEdit,
}: {
  tenantId: string;
  locations: Location[];
  canEdit: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {locations.length === 0 && !isAdding && (
          <Card className="p-8 text-center">
            <MapPin className="h-8 w-8 text-ink-700 mx-auto mb-3" />
            <p className="text-ink-50 font-medium mb-1">No locations yet</p>
            <p className="text-sm text-ink-500 mb-4">
              Add the venues, fields, or facilities where you run sessions.
            </p>
            {canEdit && (
              <Button variant="primary" onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4" />
                Add location
              </Button>
            )}
          </Card>
        )}

        {locations.map((loc) =>
          editingId === loc.id ? (
            <EditLocationRow
              key={loc.id}
              tenantId={tenantId}
              location={loc}
              pending={pending}
              onCancel={() => setEditingId(null)}
              onSave={(input) =>
                startTransition(async () => {
                  try {
                    await updateLocationAction({ ...input, id: loc.id, tenantId });
                    toast.success("Location updated");
                    setEditingId(null);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                })
              }
            />
          ) : (
            <Card key={loc.id} className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-turf-400/10 text-turf-300 flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink-50 truncate">{loc.name}</p>
                {loc.address && <p className="text-xs text-ink-500 truncate">{loc.address}</p>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="iconSm" onClick={() => setEditingId(loc.id)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={() =>
                      startTransition(async () => {
                        if (!confirm(`Delete "${loc.name}"? This cannot be undone.`)) return;
                        try {
                          await deleteLocationAction(tenantId, loc.id);
                          toast.success("Location deleted");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      })
                    }
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-ink-500 hover:text-danger" />
                  </Button>
                </div>
              )}
            </Card>
          )
        )}
      </div>

      {isAdding && (
        <EditLocationRow
          tenantId={tenantId}
          pending={pending}
          onCancel={() => setIsAdding(false)}
          onSave={(input) =>
            startTransition(async () => {
              try {
                await createLocationAction({ ...input, tenantId });
                toast.success("Location added");
                setIsAdding(false);
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        />
      )}

      {!isAdding && locations.length > 0 && canEdit && (
        <Button variant="outline" onClick={() => setIsAdding(true)}>
          <Plus className="h-4 w-4" />
          Add another location
        </Button>
      )}
    </div>
  );
}

function EditLocationRow({
  location,
  pending,
  onSave,
  onCancel,
}: {
  tenantId: string;
  location?: Location;
  pending: boolean;
  onSave: (input: { name: string; address?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  return (
    <Card className="p-4 space-y-3 border-turf-400/40">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="loc-name">Name</Label>
          <Input
            id="loc-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Beaverton Indoor Soccer Center"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loc-addr">Address (optional)</Label>
          <Input
            id="loc-addr"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Pitch Way, Beaverton, OR"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={name.length < 2 || pending}
          onClick={() => onSave({ name, address: address || undefined })}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
      </div>
    </Card>
  );
}
