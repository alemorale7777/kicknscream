import type { AttendanceStatus } from "@prisma/client";

/**
 * "Consumed" means this attendance state should count against a PACKAGE
 * enrollment's remaining balance. Present + Late count; Absent, Excused,
 * and Pending don't (the player either didn't show or the session was
 * waived).
 */
export function wasConsumed(status: AttendanceStatus | null): boolean {
  return status === "PRESENT" || status === "LATE";
}

/**
 * The signed adjustment to apply to packBalance when an Attendance row
 * transitions between two states. -1 = decrement (a session was just
 * used), +1 = increment (a previously-counted session was reclassified
 * away), 0 = no balance change.
 *
 * `prev` is null when the row didn't exist before (fresh attendance write).
 */
export function computePackDelta(
  prev: AttendanceStatus | null,
  next: AttendanceStatus | null
): -1 | 0 | 1 {
  const before = wasConsumed(prev);
  const after = wasConsumed(next);
  if (before === after) return 0;
  return after ? -1 : 1;
}
