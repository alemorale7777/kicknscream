import { Card } from "@/components/ui/card";
import { formatInTimeZone } from "date-fns-tz";
import type { Enrollment } from "@prisma/client";

type EnrollmentWithMeta = Enrollment & {
  program: { name: string };
  player: { firstName: string; lastName: string };
};

export function ParentBookingsCard({
  enrollments,
  // Forward-compat; not currently used (we render the program/player tuple
  // and a tz-formatted date but no per-row deep link yet).
  tenantSlug: _tenantSlug,
  tenantTimeZone,
}: {
  enrollments: EnrollmentWithMeta[];
  tenantSlug?: string;
  tenantTimeZone: string;
}) {
  return (
    <Card className="px-6 py-5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-ink-500 mb-3">
        Recent bookings ({enrollments.length})
      </p>
      {enrollments.length === 0 ? (
        <p className="text-sm text-ink-500">No bookings yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {enrollments.map((e) => (
            <li key={e.id} className="py-2.5 flex items-center gap-3 text-sm">
              <span className="font-medium text-ink-50 flex-1 min-w-0 truncate">
                {e.player.firstName} · {e.program.name}
              </span>
              <span className="text-xs text-ink-500 font-mono shrink-0">
                {formatInTimeZone(e.createdAt, tenantTimeZone, "MMM d, yyyy")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
