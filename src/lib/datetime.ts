import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export function formatEventTime(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "h:mm a");
}

export function formatEventDate(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "EEEE, MMMM d");
}

export function formatEventDateTime(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "EEE MMM d · h:mm a");
}

export function formatEventShort(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "EEE h:mm a");
}

export function toTenantLocalIsoMinute(instant: Date, timeZone: string): string {
  const zoned = toZonedTime(instant, timeZone);
  return format(zoned, "yyyy-MM-dd'T'HH:mm");
}

export function fromTenantLocalIsoMinute(local: string, timeZone: string): Date {
  return fromZonedTime(local, timeZone);
}
