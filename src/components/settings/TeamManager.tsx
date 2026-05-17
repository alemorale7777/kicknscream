"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { inviteMemberAction, removeMemberAction, revokeInvitationAction } from "@/actions/membership";
import { getInitials } from "@/lib/utils";
import { Mail, UserPlus, Trash2, Clock, Loader2, X } from "lucide-react";
import { roleLabel } from "@/lib/roles";
import type { Role, Invitation, Membership, User } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["ADMIN", "COACH", "PARENT", "PLAYER"]),
});

type InviteForm = z.infer<typeof inviteSchema>;

type MemberWithUser = Membership & { user: User };

const ROLE_VARIANT: Record<Role, "turf" | "flood" | "outline" | "default"> = {
  OWNER: "flood",
  ADMIN: "turf",
  COACH: "turf",
  PARENT: "outline",
  PLAYER: "default",
};

export function TeamManager({
  tenantId,
  members,
  invites,
  canEdit,
  currentUserId,
}: {
  tenantId: string;
  members: MemberWithUser[];
  invites: Invitation[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "COACH" },
  });
  const role = watch("role");

  return (
    <div className="space-y-8">
      {canEdit && (
        <Card>
          <div className="p-5 border-b border-line">
            <h2 className="font-semibold text-ink-50 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-turf-300" />
              Invite a teammate
            </h2>
            <p className="text-xs text-ink-500 mt-1">
              They&apos;ll get a branded email with a one-click accept link. Invites expire in 7 days.
            </p>
          </div>
          <form
            onSubmit={handleSubmit((data) =>
              startTransition(async () => {
                try {
                  await inviteMemberAction({ ...data, tenantId });
                  toast.success(`Invitation sent to ${data.email}`);
                  reset({ role: data.role });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              })
            )}
            className="p-5 grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="teammate@club.com"
                {...register("email")}
                disabled={pending}
              />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setValue("role", v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin · full access</SelectItem>
                  <SelectItem value="COACH">Coach · lead sessions</SelectItem>
                  <SelectItem value="PARENT">Parent · view their kids</SelectItem>
                  <SelectItem value="PLAYER">Player · view their own</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" variant="primary" disabled={pending} className="sm:h-10">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send invite
            </Button>
          </form>
        </Card>
      )}

      <section className="space-y-3">
        <h3 className="text-sm uppercase tracking-wider text-ink-500">
          Members <span className="text-ink-700">· {members.length}</span>
        </h3>
        <div className="space-y-2">
          {members.map((m) => (
            <Card key={m.id} className="p-4 flex items-center gap-4">
              <Avatar className="h-10 w-10">
                {m.user.image && <AvatarImage src={m.user.image} alt={m.user.name ?? ""} />}
                <AvatarFallback>{getInitials(m.user.name ?? m.user.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink-50 truncate">
                  {m.user.name ?? m.user.email}
                  {m.userId === currentUserId && <span className="text-ink-500 font-normal text-xs ml-2">(you)</span>}
                </p>
                <p className="text-xs text-ink-500 truncate">{m.user.email}</p>
              </div>
              <Badge variant={ROLE_VARIANT[m.role]}>{roleLabel(m.role)}</Badge>
              {canEdit && m.role !== "OWNER" && m.userId !== currentUserId && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  disabled={pendingMemberId === m.userId}
                  onClick={() =>
                    startTransition(async () => {
                      if (!confirm(`Remove ${m.user.name ?? m.user.email}? They will lose access immediately.`)) return;
                      setPendingMemberId(m.userId);
                      try {
                        await removeMemberAction(tenantId, m.userId);
                        toast.success("Member removed");
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setPendingMemberId(null);
                      }
                    })
                  }
                  aria-label={`Remove ${m.user.name ?? m.user.email}`}
                >
                  {pendingMemberId === m.userId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-ink-500 hover:text-danger" />
                  )}
                </Button>
              )}
            </Card>
          ))}
        </div>
      </section>

      {invites.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm uppercase tracking-wider text-ink-500">
            Pending invitations <span className="text-ink-700">· {invites.length}</span>
          </h3>
          <div className="space-y-2">
            {invites.map((inv) => {
              const expired = inv.expiresAt < new Date();
              return (
                <Card key={inv.id} className="p-4 flex items-center gap-4 border-flood-400/20">
                  <div className="h-10 w-10 rounded-full bg-flood-400/10 text-flood-400 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-50 truncate">{inv.email}</p>
                    <p className="text-xs text-ink-500">
                      {expired
                        ? "Expired"
                        : `Expires ${formatDistanceToNow(inv.expiresAt, { addSuffix: true })}`}
                    </p>
                  </div>
                  <Badge variant={ROLE_VARIANT[inv.role]}>{roleLabel(inv.role)}</Badge>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await revokeInvitationAction(tenantId, inv.id);
                            toast.success("Invitation revoked");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        })
                      }
                      aria-label="Revoke invitation"
                    >
                      <X className="h-4 w-4 text-ink-500 hover:text-danger" />
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
