import { cityCenterFor } from "../../../packages/shared/src/city-centers.ts";
import { parseWeatherContext, WEATHER_DEFAULTS, type WeatherObservation, type WeatherResult } from "../../../packages/shared/src/weather-context.ts";
import type { LibrarianConditionEvidence } from "../../../packages/decision-vnext-core/dist/product-librarian-matching.js";

type WeatherInput = {
  readonly meaning: {
    readonly requestHash: string;
    readonly weatherConditions: readonly { readonly id: string; readonly state: string; readonly role?: string | undefined; readonly detail: string | null }[];
  };
  readonly city: string;
  readonly actorId: string;
  readonly signal: AbortSignal;
  readonly visit: { readonly dates: readonly string[]; readonly start: number; readonly end: number; readonly timezone: string | null };
};
const hourMs = 3_600_000;
const rainCodes = new Set(["Drizzle", "Rain", "HeavyRain", "SunShowers"]);
const dryCodes = new Set(["Clear", "MostlyClear", "PartlyCloudy", "MostlyCloudy", "Cloudy", "Breezy", "Windy"]);

function rainExpected(observation: WeatherObservation): boolean | null {
  const chance = observation.precipitationChance;
  if (chance === null) return null;
  if (chance >= 0.6 && rainCodes.has(observation.condition)) return true;
  if (chance <= 0.2 && dryCodes.has(observation.condition)) return false;
  return null;
}

function forecastTargets(visit: WeatherInput["visit"], now: number): string[] {
  const [date] = visit.dates;
  if (!date || visit.timezone !== WEATHER_DEFAULTS.timeZone) return [];
  const startHour = Math.floor(visit.start / 60), endHour = Math.ceil(visit.end / 60);
  if (endHour <= startHour || endHour - startHour > 8) return [];
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: visit.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  });
  const covered = new Set<number>();
  const targets: string[] = [];
  // Search UTC hours around the local date to cover both offsets on DST change days.
  for (let stamp = midnight - 3 * hourMs; stamp < midnight + 24 * hourMs; stamp += hourMs) {
    const parts = formatter.formatToParts(stamp);
    const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === name)?.value;
    const hour = Number(part("hour"));
    if (`${part("year")}-${part("month")}-${part("day")}` !== date || hour < startHour || hour >= endHour) continue;
    const target = Math.max(stamp, now);
    if (target >= stamp + hourMs || target > now + WEATHER_DEFAULTS.forecastDays * 24 * hourMs) continue;
    covered.add(hour);
    targets.push(new Date(target).toISOString());
  }
  return covered.size === endHour - startHour ? targets : [];
}

export function createLibrarianWeatherEvidence(deps: {
  readonly get: (city: string, at: string, now: number) => Promise<WeatherResult>;
  readonly allowed: (actorId: string) => Promise<boolean>;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}) {
  return async (input: WeatherInput): Promise<readonly LibrarianConditionEvidence[]> => {
    const { city, visit, actorId, meaning } = input;
    const [localDate] = visit.dates;
    if (!localDate || input.signal.aborted || !cityCenterFor(city)) return [];
    const conditions = meaning.weatherConditions.filter(c => c.role !== "CONTEXT" && c.detail === null && (c.state === "RAIN" || c.state === "DRY"));
    if (!conditions.length) return [];
    const clock = deps.now ?? Date.now;
    const now = clock();
    const targets = forecastTargets(visit, now);
    if (!targets.length) return [];
    const deadline = AbortSignal.any([input.signal, AbortSignal.timeout(deps.timeoutMs ?? 1_500)]);
    let stop: () => void = () => {};
    const unavailable = new Promise<readonly LibrarianConditionEvidence[]>(resolve => {
      stop = () => resolve([]);
      deadline.addEventListener("abort", stop, { once: true });
    });
    const lookup = async (): Promise<readonly LibrarianConditionEvidence[]> => {
      if (deadline.aborted || !await deps.allowed(actorId) || deadline.aborted) return [];
      const observations = await Promise.all(targets.map(async at => {
        const value = parseWeatherContext(await deps.get(city, at, now), city, clock());
        return value?.targetTime === at && value.observation.kind === "forecast" ? value : null;
      }));
      const fresh = observations.filter(value => value !== null);
      if (deadline.aborted || fresh.length !== targets.length) return [];
      const forecast = rainExpected(fresh[0]!.observation);
      if (forecast === null || !fresh.every(value => rainExpected(value.observation) === forecast)) return [];
      const validUntil = new Date(Math.min(...fresh.map(value => Date.parse(value.validUntil)))).toISOString();
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(fresh)));
      const sourceHash = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      if (deadline.aborted || Date.parse(validUntil) <= clock()) return [];
      return conditions.map(condition => ({
        requestHash: meaning.requestHash, conditionId: condition.id, city, localDate, sourceHash, validUntil,
        state: (condition.state === "RAIN" ? forecast : !forecast) ? "TRUE" : "FALSE",
      }));
    };
    try {
      return await Promise.race([unavailable, lookup()]);
    } catch {
      return [];
    } finally {
      deadline.removeEventListener("abort", stop);
    }
  };
}
