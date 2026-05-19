import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChalkGrid } from "@/components/brand/ChalkGrid";
import { formatDistanceToNowStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Calendar, MapPin, Clock, ArrowRight, ExternalLink } from "lucide-react";
import { IcsDownloadButton } from "./IcsDownloadButton";
import { WeatherChip } from "./WeatherChip";
import Link from "next/link";
import type { Event, Location, Player } from "@prisma/client";
import type { WeatherSummary } from "@/lib/weather";

export function NextSessionHero({
  tenantSlug,
  tenantTimeZone,
  event,
  player,
  weather,
}: {
  tenantSlug: string;
  tenantTimeZone: string;
  event: (Event & { location: Location | null }) | null;
  player: Player;
  weather?: WeatherSummary | null;
}) {
  if (!event) {
    return (
      <Card className="relative overflow-hidden border-dashed">
        <ChalkGrid className="opacity-30" />
        <CardContent className="relative p-8 text-center space-y-3">
          <Calendar className="h-8 w-8 text-ink-700 mx-auto" />
          <p className="text-ink-300 font-medium">
            No upcoming session for {player.firstName}
          </p>
          <p className="text-xs text-ink-500">Book a session when you&apos;re ready.</p>
          <Link
            href={`/t/${tenantSlug}/family/book`}
            className="inline-flex items-center gap-1 text-sm text-turf-300 hover:text-turf-200"
          >
            See what&apos;s open
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  const countdown = formatDistanceToNowStrict(event.startsAt, { addSuffix: true });
  const mapsUrl = event.location?.address
    ? `https://maps.google.com/?q=${encodeURIComponent(event.location.address)}`
    : null;

  return (
    <Card className="relative overflow-hidden">
      <ChalkGrid className="opacity-30" />
      <CardContent className="relative p-6 lg:p-8 space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <Badge variant="outline" className="bg-turf-400/10 border-turf-400/40 text-turf-300">
            {player.firstName}&apos;s next session
          </Badge>
          <span className="text-xs font-mono text-flood-400">{countdown}</span>
        </div>
        <h2 className="text-2xl lg:text-3xl font-bold tracking-[-0.02em]">{event.title}</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="inline-flex items-center gap-2 text-ink-300">
            <Clock className="h-4 w-4 text-ink-500" />
            <span className="font-mono">{formatInTimeZone(event.startsAt, tenantTimeZone, "EEE, MMM d · h:mm a")}</span>
          </div>
          {event.location && (
            <div className="inline-flex items-center gap-2 text-ink-300">
              <MapPin className="h-4 w-4 text-ink-500" />
              <span className="truncate">{event.location.name}</span>
            </div>
          )}
        </div>
        {weather && (
          <div className="pt-1">
            <WeatherChip weather={weather} />
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <IcsDownloadButton
            uid={event.id}
            title={event.title}
            startsAt={event.startsAt.toISOString()}
            endsAt={event.endsAt.toISOString()}
            location={event.location?.name}
          />
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-line bg-pitch-700 text-xs font-medium text-ink-300 hover:bg-pitch-600 hover:text-ink-50 transition-colors duration-[120ms]"
            >
              <ExternalLink className="h-3 w-3" />
              Directions
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
