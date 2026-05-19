import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowRight, Clock, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttentionItem = {
  id: string;
  icon: "warn" | "clock" | "money";
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: "warn" | "danger" | "info";
};

const TONE: Record<AttentionItem["tone"], { bg: string; border: string; text: string }> = {
  warn: { bg: "bg-warn/10", border: "border-warn/30", text: "text-warn" },
  danger: { bg: "bg-danger/10", border: "border-danger/30", text: "text-danger" },
  info: { bg: "bg-flood-400/10", border: "border-flood-400/30", text: "text-flood-400" },
};

const ICONS = {
  warn: AlertTriangle,
  clock: Clock,
  money: Wallet,
};

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-warn inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
          Needs attention
        </h2>
        <span className="text-xs text-ink-500 font-mono">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const tone = TONE[item.tone];
          const Icon = ICONS[item.icon];
          return (
            <Link key={item.id} href={item.href} className="block group">
              <Card
                className={cn(
                  "transition-all duration-[150ms] ease-out hover:border-warn/60",
                  tone.border
                )}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={cn(
                      "h-9 w-9 rounded-md flex items-center justify-center shrink-0",
                      tone.bg,
                      tone.text
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink-50 truncate flex items-center gap-2">
                      <span className="truncate">{item.title}</span>
                      {item.href.includes("/admin/") && (
                        <span className="shrink-0 inline-flex items-center rounded bg-pitch-700 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-ink-300 font-medium">
                          Admin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-500 truncate">{item.detail}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 text-xs font-medium text-ink-300 group-hover:text-warn group-hover:translate-x-0.5 transition-all duration-[150ms] ease-out">
                    {item.cta}
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
