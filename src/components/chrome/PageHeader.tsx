import type { ReactNode } from "react";

/**
 * Compact page-header lockup used on every coach-portal page. Eyebrow and
 * title share a baseline ("Schedule · Smoke Coach Demo") so the lockup
 * fits on one line on desktop and stacks gracefully on narrow viewports,
 * reclaiming the ~120px of vertical space the previous two-row pattern
 * cost on 13" laptops.
 */
export function PageHeader({
  eyebrow,
  title,
  count,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 justify-between">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-500">
            {eyebrow}
          </p>
          <span className="text-ink-700" aria-hidden>·</span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-ink-50 min-w-0">
            {title}
          </h1>
          {count !== undefined && (
            <span className="text-ink-500 font-mono text-sm">{count}</span>
          )}
        </div>
        {actions}
      </div>
      {description && (
        <p className="text-sm text-ink-500 max-w-2xl">{description}</p>
      )}
    </header>
  );
}
