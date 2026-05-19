"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateParentAction } from "@/actions/parent";
import { Loader2 } from "lucide-react";
import type { Parent } from "@prisma/client";

const schema = z.object({
  name: z.string().max(120).optional(),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
});
type FormData = z.infer<typeof schema>;

/**
 * Side-sheet for editing the global Parent row. Email writes are tenant-wide
 * — surfacing `tenantCount` in the description tells the coach how many
 * other tenants will see the new address before they hit save. The phone /
 * name updates have the same scope but are less surprising so we don't call
 * them out.
 */
export function EditParentSheet({
  tenantId,
  parent,
  tenantCount,
  open,
  onOpenChange,
}: {
  tenantId: string;
  parent: Parent;
  tenantCount: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: parent.name ?? "",
      email: parent.email,
      phone: parent.phone ?? "",
    },
  });

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        await updateParentAction({
          tenantId,
          parentId: parent.id,
          name: data.name || null,
          email: data.email,
          phone: data.phone || null,
        });
        toast.success("Parent updated");
        onOpenChange(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit parent</SheetTitle>
          <SheetDescription>
            Update name, email, or phone. Email changes apply to every tenant
            this parent is registered with ({tenantCount}{" "}
            {tenantCount === 1 ? "tenant" : "tenants"}).
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="edit-parent-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && (
                <p className="text-xs text-danger">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="text-xs text-danger">{errors.email.message}</p>
              )}
              {parent.userId && (
                <p className="text-[11px] text-ink-500">
                  This parent has signed in — changing email will also update
                  their sign-in email.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            form="edit-parent-form"
            type="submit"
            variant="primary"
            disabled={pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
