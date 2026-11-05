/** Weather observations are context, never a user preference or proof of availability. */
export const WEATHER_DEFAULTS = Object.freeze({
  language: "de", timeZone: "Europe/Zurich", countryCode: "CH", forecastDays: 7,
  cacheMs: 10 * 60_000, timeoutMs: 6_000, maximumResponseBytes: 2_000_000,
});

export type WeatherObservation = {
  kind: "current" | "forecast";
  time: string;
  temperatureC: number;
  condition: string;
  precipitationChance: number | null;
  windKph: number | null;
};
export type WeatherContext = {
  version: "backyrd.weather@1";
  state: "KNOWN";
  provider: "apple-weather";
  city: string;
  targetTime: string;
  fetchedAt: string;
  validUntil: string;
  sourceUpdatedAt: string;
  observation: WeatherObservation;
  attribution: { name: "Apple Weather"; logoUrl: string; legalUrl: string };
};
export type WeatherResult = WeatherContext | {
  version: "backyrd.weather@1";
  state: "UNKNOWN";
  reason: "NOT_CONFIGURED" | "UNAVAILABLE" | "UNSUPPORTED_CITY" | "OUTSIDE_FORECAST";
};

const labels: Readonly<Record<string, string>> = {
  Clear: "Klar", MostlyClear: "Überwiegend klar", PartlyCloudy: "Teilweise bewölkt",
  MostlyCloudy: "Überwiegend bewölkt", Cloudy: "Bewölkt", Drizzle: "Nieselregen",
  Rain: "Regen", HeavyRain: "Starker Regen", SunShowers: "Sonne und Regenschauer",
  IsolatedThunderstorms: "Vereinzelte Gewitter", ScatteredThunderstorms: "Örtliche Gewitter",
  Thunderstorms: "Gewitter", StrongStorms: "Starke Gewitter", Snow: "Schnee",
  Flurries: "Schneeflocken", HeavySnow: "Starker Schneefall", SunFlurries: "Sonne und Schneeschauer",
  Sleet: "Schneeregen", FreezingDrizzle: "Gefrierender Nieselregen", FreezingRain: "Gefrierender Regen",
  Foggy: "Nebel", Haze: "Dunst", Smoky: "Rauchig", Breezy: "Leicht windig", Windy: "Windig",
  BlowingDust: "Aufgewirbelter Staub", BlowingSnow: "Schneetreiben", Blizzard: "Schneesturm",
  Hot: "Heiss", Frigid: "Sehr kalt", Hail: "Hagel", Hurricane: "Hurrikan", TropicalStorm: "Tropensturm",
};
export const weatherConditionLabel = (code: string) => labels[code] ?? "Wetterlage nicht näher beschrieben";
export const unknownWeather = (reason: Extract<WeatherResult, { state: "UNKNOWN" }>["reason"]): WeatherResult =>
  ({ version: "backyrd.weather@1", state: "UNKNOWN", reason });

export function weatherSummary(context: WeatherContext) {
  return `${Math.round(context.observation.temperatureC)} °C · ${weatherConditionLabel(context.observation.condition)}`;
}
export function weatherUpdatedLabel(context: WeatherContext) {
  return `Stand ${new Intl.DateTimeFormat("de-CH", { timeZone: WEATHER_DEFAULTS.timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(context.sourceUpdatedAt))}`;
}

export function appleWeatherUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port
      && ["weatherkit.apple.com", "weather-data.apple.com"].includes(u.hostname);
  } catch { return false; }
}

/** Validate the server boundary again in clients; never display expired or mismatched weather. */
export function parseWeatherContext(value: unknown, city: string, now = Date.now()): WeatherContext | null {
  if (!value || typeof value !== "object") return null;
  const x = value as Partial<WeatherContext>;
  const o = x.observation;
  const finite = (n: unknown, low: number, high: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= low && n <= high;
  if (x.version !== "backyrd.weather@1" || x.state !== "KNOWN" || x.provider !== "apple-weather" || x.city !== city
    || !o || !["current", "forecast"].includes(o.kind) || typeof o.condition !== "string" || o.condition.length > 60
    || !finite(o.temperatureC, -100, 70) || !(o.precipitationChance === null || finite(o.precipitationChance, 0, 1))
    || !(o.windKph === null || finite(o.windKph, 0, 500))
    || ![x.targetTime, x.fetchedAt, x.validUntil, x.sourceUpdatedAt, o.time].every(t => typeof t === "string" && Number.isFinite(Date.parse(t)))
    || Date.parse(x.fetchedAt!) > now + 120_000 || Date.parse(x.fetchedAt!) < now - WEATHER_DEFAULTS.cacheMs
    || Date.parse(x.sourceUpdatedAt!) > now + 120_000 || Date.parse(x.sourceUpdatedAt!) < now - 60 * 60_000
    || Date.parse(x.validUntil!) <= now || Date.parse(x.validUntil!) > Date.parse(x.fetchedAt!) + WEATHER_DEFAULTS.cacheMs
    || !x.attribution || x.attribution.name !== "Apple Weather" || !appleWeatherUrl(x.attribution.logoUrl) || !appleWeatherUrl(x.attribution.legalUrl)) return null;
  const target = Date.parse(x.targetTime!);
  if (target < now - 60 * 60_000 || target > now + WEATHER_DEFAULTS.forecastDays * 86_400_000
    || (o.kind === "forecast" && (Date.parse(o.time) > target || Date.parse(o.time) + 3_600_000 <= target))
    || (o.kind === "current" && (Math.abs(target - Date.parse(x.fetchedAt!)) > WEATHER_DEFAULTS.cacheMs || Math.abs(Date.parse(o.time) - now) > 90 * 60_000))) return null;
  return x as WeatherContext;
}
