/**
 * Tiny CSV writer. No Papa Parse dep on the server side — we already pull
 * papaparse in for the client-side roster import, but a 30-line helper
 * here avoids dragging it into every export route.
 */

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) {
    s = v.toISOString();
  } else if (typeof v === "object") {
    s = JSON.stringify(v);
  } else {
    s = String(v);
  }
  // Quote if the cell contains a comma, quote, newline, or starts with a
  // formula-injection character. Doubling embedded quotes is the canonical
  // CSV escape.
  const needsQuote = /[",\r\n]/.test(s) || /^[=+\-@]/.test(s);
  if (!needsQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCSV<T extends Record<string, unknown>>(
  headers: string[],
  rows: T[]
): string {
  const head = headers.map(escapeCell).join(",");
  const body = rows.map((row) =>
    headers.map((h) => escapeCell((row as Record<string, unknown>)[h])).join(",")
  );
  // Prefix with a UTF-8 BOM so Excel opens it as UTF-8 instead of locale-default.
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}

export function csvFilename(prefix: string, tenantSlug: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${tenantSlug}-${prefix}-${stamp}.csv`;
}
