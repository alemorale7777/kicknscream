/**
 * Open-Meteo forecast lookup for an event's location. Free + no API key
 * needed. Two calls: geocode the address once, then pull the daily forecast
 * for the event's date. Both use Next.js fetch caching (1 hour) so the same
 * location across many events on a dashboard hits the network at most once
 * per hour per address.
 */

const GEOCODE_TTL_SECONDS = 60 * 60 * 24; // 1 day — addresses don't move
const FORECAST_TTL_SECONDS = 60 * 60; // 1 hour

type GeocodeResult = { latitude: number; longitude: number } | null;

const WEATHER_CODE: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear", icon: "sun" },
  1: { label: "Mostly clear", icon: "sun" },
  2: { label: "Partly cloudy", icon: "cloud-sun" },
  3: { label: "Overcast", icon: "cloud" },
  45: { label: "Fog", icon: "cloud-fog" },
  48: { label: "Freezing fog", icon: "cloud-fog" },
  51: { label: "Light drizzle", icon: "cloud-drizzle" },
  53: { label: "Drizzle", icon: "cloud-drizzle" },
  55: { label: "Heavy drizzle", icon: "cloud-drizzle" },
  61: { label: "Light rain", icon: "cloud-rain" },
  63: { label: "Rain", icon: "cloud-rain" },
  65: { label: "Heavy rain", icon: "cloud-rain" },
  71: { label: "Light snow", icon: "snowflake" },
  73: { label: "Snow", icon: "snowflake" },
  75: { label: "Heavy snow", icon: "snowflake" },
  77: { label: "Snow grains", icon: "snowflake" },
  80: { label: "Rain showers", icon: "cloud-rain" },
  81: { label: "Heavy showers", icon: "cloud-rain" },
  82: { label: "Violent showers", icon: "cloud-rain" },
  85: { label: "Snow showers", icon: "snowflake" },
  86: { label: "Heavy snow showers", icon: "snowflake" },
  95: { label: "Thunderstorm", icon: "cloud-lightning" },
  96: { label: "Thunderstorm + hail", icon: "cloud-lightning" },
  99: { label: "Severe thunderstorm", icon: "cloud-lightning" },
};

async function geocode(address: string): Promise<GeocodeResult> {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", address);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const res = await fetch(url, { next: { revalidate: GEOCODE_TTL_SECONDS } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ latitude: number; longitude: number }>;
    };
    const first = data.results?.[0];
    if (!first) return null;
    return { latitude: first.latitude, longitude: first.longitude };
  } catch {
    return null;
  }
}

export type WeatherSummary = {
  label: string;
  icon: string;
  high: number; // °F
  low: number; // °F
  precipPct: number;
  date: string; // YYYY-MM-DD
};

/**
 * Returns the daily forecast for `date` at the given address, or null if
 * the address can't be geocoded, the date is more than 7 days out, or the
 * network call fails. Falls back silently — weather is a nice-to-have.
 */
export async function getEventWeather(
  address: string | null | undefined,
  eventDate: Date
): Promise<WeatherSummary | null> {
  if (!address) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDay = new Date(eventDate.getTime());
  targetDay.setHours(0, 0, 0, 0);
  const daysOut = Math.round(
    (targetDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysOut < 0 || daysOut > 7) return null;

  const coords = await geocode(address);
  if (!coords) return null;

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", coords.latitude.toString());
    url.searchParams.set("longitude", coords.longitude.toString());
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    );
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("forecast_days", "8");
    url.searchParams.set("timezone", "auto");
    const res = await fetch(url, { next: { revalidate: FORECAST_TTL_SECONDS } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: (number | null)[];
      };
    };
    const daily = data.daily;
    if (!daily) return null;
    const dateStr = targetDay.toISOString().slice(0, 10);
    const idx = daily.time.indexOf(dateStr);
    if (idx === -1) return null;
    const code = daily.weather_code[idx] ?? 0;
    const meta = WEATHER_CODE[code] ?? { label: "—", icon: "cloud" };
    return {
      label: meta.label,
      icon: meta.icon,
      high: Math.round(daily.temperature_2m_max[idx]),
      low: Math.round(daily.temperature_2m_min[idx]),
      precipPct: Math.round(daily.precipitation_probability_max[idx] ?? 0),
      date: dateStr,
    };
  } catch {
    return null;
  }
}
