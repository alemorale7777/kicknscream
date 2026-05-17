"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { updateTenantAction } from "@/actions/tenant";
import { Upload, Loader2 } from "lucide-react";
import type { Tenant } from "@prisma/client";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Use a 6-digit hex color like #1FB663")
    .or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

export function TenantSettingsForm({ tenant, canEdit }: { tenant: Tenant; canEdit: boolean }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(tenant.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: tenant.name,
      primaryColor: tenant.primaryColor ?? "#1FB663",
    },
  });

  async function handleLogo(file: File) {
    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/logo",
      });
      setLogoUrl(blob.url);
      toast.success("Logo uploaded — click Save to persist");
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit((data) =>
        startTransition(async () => {
          try {
            await updateTenantAction({
              tenantId: tenant.id,
              name: data.name,
              primaryColor: data.primaryColor || undefined,
              logoUrl,
            });
            toast.success("Settings saved");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      )}
      className="space-y-6"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} disabled={!canEdit || pending} />
        {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>URL slug</Label>
        <Input value={tenant.slug} disabled className="font-mono opacity-60" />
        <p className="text-xs text-ink-500">
          Slug changes aren't supported yet. Contact support if you need to change yours.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="color">Primary color</Label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={tenant.primaryColor ?? "#1FB663"}
            onChange={(e) => {
              const el = document.getElementById("color-input") as HTMLInputElement | null;
              if (el) el.value = e.target.value;
            }}
            disabled={!canEdit || pending}
            className="h-10 w-14 rounded-md border border-line bg-pitch-700 cursor-pointer overflow-hidden disabled:opacity-50"
          />
          <Input
            id="color-input"
            {...register("primaryColor")}
            disabled={!canEdit || pending}
            className="font-mono uppercase"
            maxLength={7}
          />
        </div>
        {errors.primaryColor && <p className="text-xs text-danger">{errors.primaryColor.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-16 w-16 rounded-md object-cover border border-line" />
          ) : (
            <div className="h-16 w-16 rounded-md border border-dashed border-line flex items-center justify-center text-ink-700">
              <Upload className="h-5 w-5" />
            </div>
          )}
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={!canEdit || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleLogo(file);
              }}
            />
            <span className="inline-flex items-center gap-2 rounded-md border border-line bg-pitch-700 px-3 py-2 text-sm text-ink-50 transition-colors hover:bg-pitch-600">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
            </span>
          </label>
          {logoUrl && canEdit && (
            <Button variant="ghost" size="sm" type="button" onClick={() => setLogoUrl(null)}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-ink-500">PNG, JPG, SVG. Max 2 MB.</p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        <Button type="submit" variant="primary" disabled={!canEdit || pending || (!isDirty && logoUrl === tenant.logoUrl)}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
