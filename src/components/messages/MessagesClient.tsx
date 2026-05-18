"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn, getInitials } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  Search,
  Send,
  Loader2,
  Plus,
  Mail,
  MessageSquare,
  Inbox,
  Phone,
  ArrowLeft,
} from "lucide-react";
import {
  createThreadAction,
  sendMessageAction,
  loadThreadAction,
  markThreadReadAction,
} from "@/actions/messages";

type ThreadSummary = {
  id: string;
  subject: string | null;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastMessageMine: boolean;
  lastMessageChannel: "IN_APP" | "EMAIL" | "SMS" | null;
  unread: boolean;
  others: { id: string; name: string | null; email: string }[];
};

type Parent = { id: string; name: string | null; email: string };

type ThreadDetail = Awaited<ReturnType<typeof loadThreadAction>>;

export function MessagesClient({
  tenantId,
  currentUserId,
  threads: initialThreads,
  parents,
}: {
  tenantId: string;
  currentUserId: string;
  threads: ThreadSummary[];
  parents: Parent[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThreads[0]?.id ?? null
  );
  const [composeOpen, setComposeOpen] = useState(false);
  const [filter, setFilter] = useState("");

  // FAB + ⌘K route here with ?new=broadcast — auto-open the compose sheet.
  // Microtask defer keeps React Compiler happy (no sync setState in effect).
  useEffect(() => {
    if (searchParams.get("new") !== "broadcast") return;
    Promise.resolve().then(() => {
      setComposeOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("new");
      router.replace(url.pathname + (url.search || ""));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const names = t.others.map((o) => o.name?.toLowerCase() ?? "").join(" ");
      const subject = t.subject?.toLowerCase() ?? "";
      const last = t.lastMessageBody?.toLowerCase() ?? "";
      return names.includes(q) || subject.includes(q) || last.includes(q);
    });
  }, [threads, filter]);

  function handleComposed(threadId: string, newSubject: string, recipients: Parent[]) {
    setComposeOpen(false);
    // Optimistically inject the new thread at the top if it wasn't already there.
    setThreads((prev) => {
      if (prev.some((t) => t.id === threadId)) return prev;
      return [
        {
          id: threadId,
          subject: newSubject,
          lastMessageAt: new Date().toISOString(),
          lastMessageBody: null,
          lastMessageMine: true,
          lastMessageChannel: null,
          unread: false,
          others: recipients,
        },
        ...prev,
      ];
    });
    setSelectedId(threadId);
  }

  function handleMessageSent(
    threadId: string,
    body: string,
    channel: ThreadSummary["lastMessageChannel"]
  ) {
    setThreads((prev) =>
      prev
        .map((t) =>
          t.id === threadId
            ? {
                ...t,
                lastMessageAt: new Date().toISOString(),
                lastMessageBody: body,
                lastMessageMine: true,
                lastMessageChannel: channel,
                unread: false,
              }
            : t
        )
        .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))
    );
  }

  const handleThreadRead = useCallback((threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t))
    );
  }, []);

  if (parents.length === 0) {
    return (
      <Card className="p-10 text-center border-dashed">
        <Inbox className="h-8 w-8 text-ink-700 mx-auto mb-3" />
        <p className="text-ink-300 font-medium">No parents on the roster yet</p>
        <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
          Add players (and their parents) under Players, then come back to start a
          conversation.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 border border-line rounded-xl overflow-hidden bg-pitch-800 min-h-[640px]">
        {/* Thread list */}
        <aside
          className={cn(
            "border-r border-line bg-pitch-900/40 flex flex-col",
            selectedId ? "hidden md:flex" : "flex"
          )}
        >
          <div className="px-4 py-3 border-b border-line space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-50">Inbox</h2>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => setComposeOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-500" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search threads"
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex-1 px-4 py-10 text-center">
              <MessageSquare className="h-7 w-7 text-ink-700 mx-auto mb-2" />
              <p className="text-sm text-ink-500">
                {threads.length === 0
                  ? "No conversations yet. Start one to break the ice."
                  : "No threads match your search."}
              </p>
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-line">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors duration-[120ms]",
                      "hover:bg-pitch-700/40",
                      selectedId === t.id && "bg-pitch-700/60"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback>
                          {getInitials(
                            t.others.map((o) => o.name ?? o.email).join(" ") || "?"
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={cn(
                              "text-sm truncate",
                              t.unread ? "font-semibold text-ink-50" : "font-medium text-ink-300"
                            )}
                          >
                            {t.others.length > 0
                              ? t.others
                                  .map((o) => o.name ?? o.email.split("@")[0])
                                  .join(", ")
                              : "Conversation"}
                          </p>
                          <span className="text-[10px] text-ink-500 shrink-0">
                            {formatDistanceToNow(new Date(t.lastMessageAt), { addSuffix: false })}
                          </span>
                        </div>
                        {t.subject && (
                          <p className="text-xs text-ink-500 truncate mt-0.5">{t.subject}</p>
                        )}
                        {t.lastMessageBody && (
                          <p
                            className={cn(
                              "text-xs truncate mt-0.5 inline-flex items-center gap-1",
                              t.unread ? "text-ink-300" : "text-ink-500"
                            )}
                          >
                            {t.lastMessageChannel === "EMAIL" ? (
                              <Mail
                                className="h-3 w-3 text-ink-500 shrink-0"
                                aria-label="Last delivered by email"
                              />
                            ) : t.lastMessageChannel === "SMS" ? (
                              <Phone
                                className="h-3 w-3 text-ink-500 shrink-0"
                                aria-label="Last delivered by SMS"
                              />
                            ) : (
                              <MessageSquare
                                className="h-3 w-3 text-ink-500 shrink-0"
                                aria-label="Last delivered in app"
                              />
                            )}
                            {t.lastMessageMine && (
                              <span className="text-ink-700">You:</span>
                            )}
                            <span className="truncate">{t.lastMessageBody}</span>
                          </p>
                        )}
                      </div>
                      {t.unread && (
                        <span className="h-1.5 w-1.5 rounded-full bg-turf-300 mt-1.5 shrink-0" />
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Conversation pane */}
        <section
          className={cn(
            "flex flex-col bg-pitch-800 min-h-[640px]",
            selectedId ? "flex" : "hidden md:flex"
          )}
        >
          {selectedId ? (
            <ConversationPane
              key={selectedId}
              tenantId={tenantId}
              threadId={selectedId}
              currentUserId={currentUserId}
              onBack={() => setSelectedId(null)}
              onMessageSent={handleMessageSent}
              onMarkedRead={handleThreadRead}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12">
              <MessageSquare className="h-8 w-8 text-ink-700 mb-3" />
              <p className="text-ink-300 font-medium">Pick a conversation</p>
              <p className="text-xs text-ink-500 mt-1 max-w-xs">
                Or start a new one — the parent gets a branded email and an in-app message
                instantly.
              </p>
            </div>
          )}
        </section>
      </div>

      <ComposeNewSheet
        key={composeOpen ? "open" : "closed"}
        open={composeOpen}
        onOpenChange={setComposeOpen}
        tenantId={tenantId}
        parents={parents}
        onComposed={handleComposed}
      />
    </>
  );
}

function ConversationPane({
  tenantId,
  threadId,
  currentUserId,
  onBack,
  onMessageSent,
  onMarkedRead,
}: {
  tenantId: string;
  threadId: string;
  currentUserId: string;
  onBack: () => void;
  onMessageSent: (
    threadId: string,
    body: string,
    channel: "IN_APP" | "EMAIL" | "SMS"
  ) => void;
  onMarkedRead: (threadId: string) => void;
}) {
  type LoadState =
    | { kind: "idle" }
    | { kind: "loaded"; detail: ThreadDetail }
    | { kind: "error"; message: string };
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [body, setBody] = useState("");
  const [emailToo, setEmailToo] = useState(true);
  const [sending, startSendTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadThreadAction(tenantId, threadId)
      .then((detail) => {
        if (cancelled) return;
        setState({ kind: "loaded", detail });
        // Mark read once we successfully load — fire-and-forget the server call,
        // optimistically clear the unread dot in the list immediately.
        onMarkedRead(threadId);
        markThreadReadAction({ tenantId, threadId }).catch(() => {});
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ kind: "error", message: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, threadId, onMarkedRead]);

  const detail = state.kind === "loaded" ? state.detail : null;
  const others = detail?.participants.filter((p) => p.id !== currentUserId) ?? [];
  const participantById = useMemo(
    () => new Map(detail?.participants.map((p) => [p.id, p]) ?? []),
    [detail?.participants]
  );

  function send() {
    if (!body.trim()) return;
    const snapshot = body;
    setBody("");
    startSendTransition(async () => {
      try {
        await sendMessageAction({
          tenantId,
          threadId,
          body: snapshot,
          sendEmail: emailToo,
        });
        onMessageSent(threadId, snapshot, emailToo ? "EMAIL" : "IN_APP");
        if (state.kind === "loaded") {
          const optimistic: ThreadDetail["messages"][number] = {
            id: `tmp-${Date.now()}`,
            body: snapshot,
            senderUserId: currentUserId,
            channel: emailToo ? "EMAIL" : "IN_APP",
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          setState({
            kind: "loaded",
            detail: { ...state.detail, messages: [...state.detail.messages, optimistic] },
          });
        }
      } catch (e) {
        toast.error((e as Error).message);
        setBody(snapshot);
      }
    });
  }

  return (
    <>
      <header className="px-4 sm:px-6 py-3 border-b border-line flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden text-ink-500 hover:text-ink-50 transition-colors"
          aria-label="Back to threads"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar className="h-9 w-9">
          <AvatarFallback>
            {getInitials(others.map((p) => p.name ?? p.email).join(" ") || "?")}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-50 truncate">
            {others.map((p) => p.name ?? p.email.split("@")[0]).join(", ") || "Conversation"}
          </p>
          <p className="text-xs text-ink-500 truncate">
            {detail?.subject ?? others.map((p) => p.email).join(", ")}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 bg-pitch-900/30">
        {state.kind === "idle" && (
          <div className="text-xs text-ink-500 inline-flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading thread…
          </div>
        )}
        {state.kind === "error" && (
          <p className="text-xs text-danger">{state.message}</p>
        )}
        {detail?.messages.map((m) => {
          const mine = m.senderUserId === currentUserId;
          const sender = participantById.get(m.senderUserId);
          return (
            <div
              key={m.id}
              className={cn("flex gap-2", mine ? "justify-end" : "justify-start")}
            >
              {!mine && (
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback>
                    {getInitials(sender?.name ?? sender?.email ?? "?")}
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={cn(
                  "max-w-[78%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                  mine
                    ? "bg-turf-400/15 border border-turf-400/30 text-ink-50"
                    : "bg-pitch-700 border border-line text-ink-50"
                )}
              >
                <p>{m.body}</p>
                <p className="text-[10px] text-ink-500 mt-1 flex items-center gap-1.5">
                  {m.channel === "EMAIL" ? (
                    <Mail className="h-2.5 w-2.5" />
                  ) : null}
                  {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 sm:px-6 py-3 border-t border-line bg-pitch-800 space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Type a message…"
          className="text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-ink-500">
              <input
                type="checkbox"
                checked={emailToo}
                onChange={(e) => setEmailToo(e.target.checked)}
                className="rounded border-line bg-pitch-700 text-turf-400 focus:ring-turf-400/30"
              />
              <Mail className="h-3 w-3" />
              Also email
            </label>
            <SmsWaitlistChip />
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={send}
            disabled={sending || !body.trim()}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>
    </>
  );
}

function ComposeNewSheet({
  open,
  onOpenChange,
  tenantId,
  parents,
  onComposed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  parents: Parent[];
  onComposed: (threadId: string, subject: string, recipients: Parent[]) => void;
}) {
  const [recipientId, setRecipientId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailToo, setEmailToo] = useState(true);
  const [filter, setFilter] = useState("");
  const [sending, startTransition] = useTransition();

  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter(
      (p) =>
        (p.name?.toLowerCase().includes(q) ?? false) ||
        p.email.toLowerCase().includes(q)
    );
  }, [parents, filter]);

  function send() {
    if (!recipientId) {
      toast.error("Pick a recipient first");
      return;
    }
    if (!subject.trim()) {
      toast.error("Add a subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Add a message");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createThreadAction({
          tenantId,
          recipientUserId: recipientId,
          subject,
          body,
          sendEmail: emailToo,
        });
        const recipient = parents.find((p) => p.id === recipientId);
        onComposed(result.threadId, subject, recipient ? [recipient] : []);
        toast.success("Message sent");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New message</SheetTitle>
          <SheetDescription>
            Pick a parent, write your note, and we&apos;ll deliver it in the app and (optionally) by email.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>To</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-500" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search parents"
                  className="pl-8"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border border-line bg-pitch-900/40 divide-y divide-line">
                {matches.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-ink-500 text-center">
                    No parents match.
                  </p>
                ) : (
                  matches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setRecipientId(p.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                        recipientId === p.id
                          ? "bg-turf-400/10 border-l-2 border-turf-400"
                          : "hover:bg-pitch-700/40"
                      )}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback>{getInitials(p.name ?? p.email)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-50 truncate">
                          {p.name ?? p.email.split("@")[0]}
                        </p>
                        <p className="text-xs text-ink-500 truncate">{p.email}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What is this about?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="Write your note…"
              />
            </div>

            <div className="flex items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-ink-500">
                <input
                  type="checkbox"
                  checked={emailToo}
                  onChange={(e) => setEmailToo(e.target.checked)}
                  className="rounded border-line bg-pitch-700 text-turf-400 focus:ring-turf-400/30"
                />
                <Mail className="h-3 w-3" />
                Also email the parent
              </label>
              <SmsWaitlistChip />
            </div>
          </div>
        </SheetBody>
        <SheetFooter>
          <span />
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={send} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const SMS_WAITLIST_KEY = "kns.sms-waitlist-joined";

/**
 * "SMS · coming soon" badge that doubles as a one-tap waitlist signup —
 * persists the user's interest in localStorage and surfaces a toast.
 * Once they've registered interest, the badge collapses to "SMS · noted".
 */
function SmsWaitlistChip() {
  const [joined, setJoined] = useState<boolean | null>(null);

  useEffect(() => {
    // Read localStorage in a microtask so the setState lands outside the
    // synchronous effect body — keeps React Compiler's set-state-in-effect
    // lint quiet and avoids any SSR/CSR mismatch.
    Promise.resolve()
      .then(() => {
        try {
          return !!window.localStorage.getItem(SMS_WAITLIST_KEY);
        } catch {
          return false;
        }
      })
      .then(setJoined);
  }, []);

  function join() {
    try {
      window.localStorage.setItem(SMS_WAITLIST_KEY, new Date().toISOString());
    } catch {
      // private mode — toast still fires below
    }
    setJoined(true);
    toast.success("Got it — we'll email when SMS goes live.");
  }

  if (joined === null || joined) {
    return (
      <Badge
        variant="outline"
        className="border-line text-ink-500 inline-flex items-center gap-1.5"
      >
        <Phone className="h-3 w-3" />
        SMS · {joined ? "noted" : "soon"}
      </Badge>
    );
  }
  return (
    <button
      type="button"
      onClick={join}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-pitch-800 px-2 py-0.5 text-xs text-ink-500 hover:text-ink-50 hover:border-flood-400/40 transition-colors"
      aria-label="Get notified when SMS is available"
    >
      <Phone className="h-3 w-3" />
      <span>SMS · soon</span>
      <span className="text-flood-400 font-medium">Notify me</span>
    </button>
  );
}
