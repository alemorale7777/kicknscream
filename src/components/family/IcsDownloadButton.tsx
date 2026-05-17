"use client";

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function icsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

export function IcsDownloadButton({
  uid,
  title,
  startsAt,
  endsAt,
  location,
  description,
}: {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  description?: string;
}) {
  function download() {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//KickNScream//Family//EN",
      "BEGIN:VEVENT",
      `UID:${uid}@kicknscream`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(new Date(startsAt))}`,
      `DTEND:${icsDate(new Date(endsAt))}`,
      `SUMMARY:${title.replace(/[,;\n]/g, " ")}`,
      location ? `LOCATION:${location.replace(/[,;\n]/g, " ")}` : "",
      description ? `DESCRIPTION:${description.replace(/[,;\n]/g, " ")}` : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Button variant="secondary" size="sm" onClick={download}>
      <Calendar className="h-3.5 w-3.5" />
      Add to calendar
    </Button>
  );
}
