"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Markdown } from "./Markdown";
import { deleteSessionNoteAction } from "@/actions/sessionNote";
import { formatDistanceToNow } from "date-fns";
import { getInitials } from "@/lib/utils";
import { MoreHorizontal, Trash2, EyeOff, FileText, Loader2 } from "lucide-react";
import type { SessionNote, User } from "@prisma/client";

type NoteWithMeta = SessionNote & {
  author: User | null;
  player?: { id: string; firstName: string; lastName: string } | null;
};

export function SessionNoteList({
  tenantId,
  notes,
  currentUserId,
  canEditAny,
}: {
  tenantId: string;
  notes: NoteWithMeta[];
  currentUserId: string;
  canEditAny: boolean;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (notes.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <FileText className="h-7 w-7 text-ink-700 mx-auto mb-3" />
        <p className="text-ink-300 font-medium">No notes yet</p>
        <p className="text-xs text-ink-500 mt-1">Drop in the first note above — parents will get an email automatically when you tag their kid.</p>
      </Card>
    );
  }

  function handleDelete(n: NoteWithMeta) {
    if (!confirm("Delete this note? This can't be undone — and any email already sent stays in the parent's inbox.")) return;
    setPendingId(n.id);
    startTransition(async () => {
      try {
        await deleteSessionNoteAction(tenantId, n.id);
        toast.success("Note deleted");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {notes.map((n) => {
        const isAuthor = n.authorId === currentUserId;
        const canManage = isAuthor || canEditAny;
        const authorName = n.author?.name ?? n.author?.email ?? "Coach";
        return (
          <Card key={n.id} className="p-5">
            <div className="flex items-start gap-3">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback>{getInitials(authorName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-semibold text-ink-50">{authorName}</span>
                  <span className="text-ink-700">·</span>
                  <span className="text-ink-500 text-xs" suppressHydrationWarning>
                    {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                  </span>
                  {n.player && (
                    <>
                      <span className="text-ink-700">·</span>
                      <Badge variant="turf">
                        {n.player.firstName} {n.player.lastName}
                      </Badge>
                    </>
                  )}
                  {!n.visibleToParent && (
                    <Badge variant="outline" className="border-warn/40 text-warn">
                      <EyeOff className="h-3 w-3 mr-1" /> Internal
                    </Badge>
                  )}
                </div>
                <Markdown>{n.content}</Markdown>
              </div>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="iconSm">
                      {pendingId === n.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4 text-ink-500" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem
                      onClick={() => handleDelete(n)}
                      className="cursor-pointer text-danger focus:text-danger"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
