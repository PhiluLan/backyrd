// mobile/lib/locationContext.ts

import * as Location from "expo-location";

import {
  getPrivacySafeLocation,
  reverseGeocodePrivacySafe,
  type LocationPurpose,
  type PrivacyLocationFailureReason,
} from "./locationPrivacy";

export type LocationContextSource =
  | "current"
  | "last_known"
  | "city_fallback"
  | "unavailable";

export type LocationDistanceMode =
  | "precise"
  | "approximate"
  | "unavailable";

export type LocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type BackyrdLocationContext = {
  source: LocationContextSource;
  distanceMode: LocationDistanceMode;
  coordinates: LocationCoordinates | null;
  city: string | null;
  region: string | null;
  country: string | null;
  label: string;
  failureReason: PrivacyLocationFailureReason | null;
};

export { CITY_CENTERS, cityCenterFor } from "../../packages/shared/src/city-centers";
import { cityCenterFor } from "../../packages/shared/src/city-centers";

function clean(value?: string | null) {
  return (value || "").trim();
}

export function normalizeLocationCity(value?: string | null) {
  const city = clean(value);
  if (!city) return null;

  const lower = city.toLocaleLowerCase("de-CH");

  if (lower.includes("basel")) return "Basel";
  if (lower.includes("zürich") || lower.includes("zurich")) return "Zürich";
  if (lower.includes("bern")) return "Bern";
  if (lower.includes("luzern") || lower.includes("lucerne")) return "Luzern";
  if (lower.includes("genf") || lower.includes("geneva")) return "Genf";
  if (lower.includes("lausanne")) return "Lausanne";
  if (lower.includes("winterthur")) return "Winterthur";
  if (lower.includes("st. gallen") || lower.includes("st gallen")) {
    return "St. Gallen";
  }

  return city;
}


export function cityFromGeocode(
  address?: Location.LocationGeocodedAddress | null,
) {
  if (!address) return null;

  return normalizeLocationCity(
    address.city ||
      address.subregion ||
      address.region ||
      address.district ||
      null,
  );
}

export function regionFromGeocode(
  address?: Location.LocationGeocodedAddress | null,
) {
  if (!address) return null;

  return clean(address.region || address.subregion || null) || null;
}

export function createCityFallbackLocationContext(
  city?: string | null,
): BackyrdLocationContext {
  const normalizedCity = normalizeLocationCity(city);
  const coordinates = cityCenterFor(normalizedCity);

  if (!normalizedCity || !coordinates) {
    return {
      source: "unavailable",
      distanceMode: "unavailable",
      coordinates: null,
      city: normalizedCity,
      region: null,
      country: null,
      label: normalizedCity || "Ohne Standort",
      failureReason: null,
    };
  }

  return {
    source: "city_fallback",
    distanceMode: "approximate",
    coordinates,
    city: normalizedCity,
    region: null,
    country: null,
    label: `${normalizedCity} · ungefähr`,
    failureReason: null,
  };
}

type ResolveLocationContextOptions = {
  purpose: LocationPurpose;
  requestPermission?: boolean;
  forceConsentRefresh?: boolean;
  fallbackCity?: string | null;
  allowCityFallback?: boolean;
  timeoutMs?: number;
};

export async function resolveLocationContext(
  options: ResolveLocationContextOptions,
): Promise<BackyrdLocationContext> {
  const result = await getPrivacySafeLocation({
    purpose: options.purpose,
    requestPermission: options.requestPermission ?? false,
    forceConsentRefresh: options.forceConsentRefresh ?? false,
    timeoutMs: options.timeoutMs ?? 6_000,
    allowLastKnown: true,
  });

  if (!result.ok) {
    if (options.allowCityFallback && options.fallbackCity) {
      const fallback = createCityFallbackLocationContext(
        options.fallbackCity,
      );

      return {
        ...fallback,
        failureReason: result.reason,
      };
    }

    return {
      source: "unavailable",
      distanceMode: "unavailable",
      coordinates: null,
      city: normalizeLocationCity(options.fallbackCity),
      region: null,
      country: null,
      label:
        normalizeLocationCity(options.fallbackCity) ||
        "Ohne Standort",
      failureReason: result.reason,
    };
  }

  const geocoded = await reverseGeocodePrivacySafe(result.location);
  const city = cityFromGeocode(geocoded);
  const region = regionFromGeocode(geocoded);
  const country = clean(geocoded?.country) || null;

  return {
    source: result.source,
    distanceMode:
      result.source === "current" ? "precise" : "approximate",
    coordinates: {
      latitude: result.location.coords.latitude,
      longitude: result.location.coords.longitude,
    },
    city,
    region,
    country,
    label:
      result.source === "current"
        ? city || "Aktueller Standort"
        : `${city || "Letzter Standort"} · zuletzt bekannt`,
    failureReason: null,
  };
}

export function locationContextRadiusLabel(
  context?: BackyrdLocationContext | null,
) {
  if (!context || context.source === "unavailable") {
    return "ohne Standortfilter";
  }

  if (context.source === "city_fallback") {
    return `ungefähr rund um ${context.city || "deine Stadt"}`;
  }

  if (context.source === "last_known") {
    return "rund um deinen zuletzt bekannten Standort";
  }

  return "im Radius ~15 km";
}
