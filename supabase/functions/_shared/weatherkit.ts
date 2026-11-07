import { cityCenterFor } from "../../../packages/shared/src/city-centers.ts";
import { appleWeatherUrl, parseWeatherContext, unknownWeather, WEATHER_DEFAULTS, type WeatherObservation, type WeatherResult } from "../../../packages/shared/src/weather-context.ts";

export type WeatherKitCredentials = { teamId: string; keyId: string; serviceId: string; privateKey: string };
type Json = Record<string, unknown>;
const object = (x: unknown): Json => x && typeof x === "object" && !Array.isArray(x) ? x as Json : {};
const time = (x: unknown) => typeof x === "string" ? Date.parse(x) : NaN;
const number = (x: unknown, min: number, max: number) => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? x : null;
const base64url = (x: Uint8Array) => btoa(String.fromCharCode(...x)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encode = (x: unknown) => base64url(new TextEncoder().encode(JSON.stringify(x)));

export async function signWeatherKitToken(credentials: WeatherKitCredentials, now = Date.now()) {
  if (!/^[A-Z0-9]{10}$/.test(credentials.teamId) || !/^[A-Z0-9]{10}$/.test(credentials.keyId)
    || !/^[A-Za-z0-9][A-Za-z0-9.-]{2,160}$/.test(credentials.serviceId)) throw new Error("weather_credentials_invalid");
  const pem = credentials.privateKey.replace(/\\n/g, "\n").trim();
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----") || !pem.endsWith("-----END PRIVATE KEY-----")) throw new Error("weather_key_invalid");
  const bytes = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", bytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const issued = Math.floor(now / 1000);
  const body = `${encode({ alg: "ES256", kid: credentials.keyId, id: `${credentials.teamId}.${credentials.serviceId}` })}.${encode({ iss: credentials.teamId, iat: issued, exp: issued + 300, sub: credentials.serviceId })}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

async function readJson(response: Response): Promise<Json> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json") || !response.body) throw new Error("weather_provider_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > WEATHER_DEFAULTS.maximumResponseBytes) throw new Error("weather_response_too_large");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return object(JSON.parse(new TextDecoder().decode(bytes)));
}

type Bundle = { data: Json; attribution: Json; fetched: number; expires: number };
function metadata(value: unknown, now: number) {
  const m = object(value), read = time(m.readTime), expire = time(m.expireTime);
  if (m.temporarilyUnavailable === true || !Number.isFinite(read) || read > now + 120_000 || read < now - 60 * 60_000 || !Number.isFinite(expire) || expire <= now || !appleWeatherUrl(m.attributionURL)) return null;
  return { readTime: new Date(read).toISOString(), expires: expire, legalUrl: m.attributionURL };
}

export class WeatherKitService {
  private cache = new Map<string, Bundle>();
  private pending = new Map<string, Promise<Bundle>>();
  private token: { value: string; expires: number } | null = null;
  private readonly credentials: WeatherKitCredentials | null;
  private readonly fetcher: typeof fetch;
  constructor(credentials: WeatherKitCredentials | null, fetcher: typeof fetch = fetch) {
    this.credentials = credentials; this.fetcher = fetcher;
  }

  private async load(city: string, now: number): Promise<Bundle> {
    const point = cityCenterFor(city);
    if (!point || !this.credentials) throw new Error("weather_not_configured");
    const cached = this.cache.get(city);
    if (cached && cached.expires > now) return cached;
    const inFlight = this.pending.get(city);
    if (inFlight) return inFlight;
    const task = (async () => {
      if (!this.token || this.token.expires <= now) this.token = { value: await signWeatherKitToken(this.credentials!, now), expires: now + 240_000 };
      const url = new URL(`https://weatherkit.apple.com/api/v1/weather/de/${point.latitude}/${point.longitude}`);
      url.searchParams.set("dataSets", "currentWeather,forecastHourly");
      url.searchParams.set("timezone", WEATHER_DEFAULTS.timeZone);
      url.searchParams.set("countryCode", WEATHER_DEFAULTS.countryCode);
      url.searchParams.set("hourlyStart", new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString());
      url.searchParams.set("hourlyEnd", new Date(now + WEATHER_DEFAULTS.forecastDays * 86_400_000).toISOString());
      const request = { headers: { authorization: `Bearer ${this.token.value}`, accept: "application/json" }, signal: AbortSignal.timeout(WEATHER_DEFAULTS.timeoutMs), redirect: "error" as const };
      const [data, attribution] = await Promise.all([
        this.fetcher(url, request).then(readJson),
        this.fetcher("https://weatherkit.apple.com/attribution/de", request).then(readJson),
      ]);
      const currentMeta = metadata(object(data.currentWeather).metadata, now);
      const hourlyMeta = metadata(object(data.forecastHourly).metadata, now);
      if (!currentMeta || !hourlyMeta) throw new Error("weather_metadata_unavailable");
      const bundle = { data, attribution, fetched: now, expires: Math.min(now + WEATHER_DEFAULTS.cacheMs, currentMeta.expires, hourlyMeta.expires) };
      if (this.cache.size >= 32) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(city, bundle);
      return bundle;
    })();
    this.pending.set(city, task);
    try { return await task; } finally { this.pending.delete(city); }
  }

  async get(city: string, at?: string, now = Date.now()): Promise<WeatherResult> {
    if (!cityCenterFor(city)) return unknownWeather("UNSUPPORTED_CITY");
    const target = at === undefined ? now : time(at);
    if (!Number.isFinite(target) || target < now - 60 * 60_000 || target > now + WEATHER_DEFAULTS.forecastDays * 86_400_000) return unknownWeather("OUTSIDE_FORECAST");
    if (!this.credentials) return unknownWeather("NOT_CONFIGURED");
    try {
      const bundle = await this.load(city.trim().toLocaleLowerCase("de-CH"), now);
      const current = object(bundle.data.currentWeather), forecast = object(bundle.data.forecastHourly);
      const hour = Array.isArray(forecast.hours) ? forecast.hours.map(object).find(h => time(h.forecastStart) <= target && time(h.forecastStart) + 3_600_000 > target) : undefined;
      const useCurrent = at === undefined;
      const selected = useCurrent ? current : hour;
      if (!selected) return unknownWeather("OUTSIDE_FORECAST");
      const meta = metadata(useCurrent ? current.metadata : forecast.metadata, now);
      const temp = number(selected.temperature, -100, 70);
      const stamp = time(useCurrent ? selected.asOf : selected.forecastStart);
      if (!meta || temp === null || !Number.isFinite(stamp) || typeof selected.conditionCode !== "string") return unknownWeather("UNAVAILABLE");
      const rawLogo = bundle.attribution["logoDark@2x"] ?? bundle.attribution["logoDark@1x"];
      const logo = typeof rawLogo === "string" ? new URL(rawLogo, "https://weatherkit.apple.com").href : null;
      if (!appleWeatherUrl(logo)) return unknownWeather("UNAVAILABLE");
      const observation: WeatherObservation = { kind: useCurrent ? "current" : "forecast", time: new Date(stamp).toISOString(), temperatureC: temp,
        condition: selected.conditionCode, precipitationChance: number(selected.precipitationChance, 0, 1), windKph: number(selected.windSpeed, 0, 500) };
      const result = { version: "backyrd.weather@1", state: "KNOWN", provider: "apple-weather", city,
        targetTime: new Date(target).toISOString(), fetchedAt: new Date(bundle.fetched).toISOString(), sourceUpdatedAt: meta.readTime,
        validUntil: new Date(Math.min(bundle.expires, meta.expires)).toISOString(), observation,
        attribution: { name: "Apple Weather", logoUrl: logo, legalUrl: meta.legalUrl } };
      return parseWeatherContext(result, city, now) ?? unknownWeather("UNAVAILABLE");
    } catch { return unknownWeather("UNAVAILABLE"); }
  }
}
