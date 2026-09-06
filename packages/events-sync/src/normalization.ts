import { createHash } from "node:crypto";

import type {
  EventCategory,
  SourceVenue,
  SpotCandidate,
  VenueMatch,
} from "./contracts.js";

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-CH")
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeAddress(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeText(
    value
      .replace(/\b(switzerland|schweiz|suisse|svizzera)\b/gi, "")
      .replace(/\bch[- ]?/gi, ""),
  );
  return normalized || null;
}

export function addressFingerprint(venue: SourceVenue): string | null {
  const parts = [venue.addressLine, venue.postalCode, venue.city]
    .map((value) => normalizeAddress(value))
    .filter((value): value is string => Boolean(value));
  return parts.length >= 2 ? parts.join("|") : null;
}

export function stableHash(...parts: Array<string | null>): string {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "").join("|"))
    .digest("hex");
}

export function mapCategory(label: string | null): EventCategory {
  const value = normalizeText(label ?? "");
  if (/musik|konzert|music|festival/.test(value)) return "MUSIC";
  if (/party|nightlife|club|disco|dj/.test(value)) return "NIGHTLIFE";
  if (/kunst|art|ausstellung|museum/.test(value)) return "ART";
  if (/theater|buhne|performance|zirkus|comedy/.test(value)) return "THEATRE";
  if (/film|kino|cinema/.test(value)) return "FILM";
  if (/essen|trinken|food|drink|wein|degustation/.test(value)) return "FOOD_DRINK";
  if (/famil|kinder|kids/.test(value)) return "FAMILY";
  if (/sport|lauf|fitness|fussball/.test(value)) return "SPORT";
  if (/markt|flohmi|messe/.test(value)) return "MARKET";
  if (/workshop|kurs|seminar/.test(value)) return "WORKSHOP";
  if (/community|verein|treffen|meetup/.test(value)) return "COMMUNITY";
  return "OTHER";
}

function haversineMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function normalizedSpotAddress(spot: SpotCandidate): string | null {
  const address = normalizeAddress(spot.address);
  const city = normalizeAddress(spot.city);
  if (!address) return null;
  if (!city || address.includes(city)) return address;
  return `${address}|${city}`;
}

export function matchVenue(
  venue: SourceVenue,
  spots: SpotCandidate[],
): VenueMatch {
  const venueAddress = addressFingerprint(venue);
  if (venueAddress) {
    const addressMatches = spots.filter((spot) => {
      const candidate = normalizedSpotAddress(spot);
      return candidate !== null && (
        candidate === venueAddress ||
        candidate.replace(/\|/g, " ") === venueAddress.replace(/\|/g, " ") ||
        candidate.includes(venueAddress.replace(/\|/g, " "))
      );
    });
    if (addressMatches.length === 1) {
      return { spotId: addressMatches[0]!.id, method: "ADDRESS", confidence: 1 };
    }
  }

  if (venue.latitude !== null && venue.longitude !== null) {
    const coordinateMatches = spots.filter((spot) => {
      if (spot.lat === null || spot.lng === null) return false;
      return haversineMetres(
        { latitude: venue.latitude!, longitude: venue.longitude! },
        { latitude: spot.lat, longitude: spot.lng },
      ) <= 60;
    });
    if (coordinateMatches.length === 1) {
      return {
        spotId: coordinateMatches[0]!.id,
        method: "COORDINATES",
        confidence: 0.98,
      };
    }
  }

  const normalizedName = normalizeText(venue.name);
  const normalizedCity = normalizeText(venue.city ?? "");
  const nameMatches = spots.filter(
    (spot) =>
      normalizeText(spot.name) === normalizedName &&
      (!normalizedCity || normalizeText(spot.city ?? "") === normalizedCity),
  );
  if (nameMatches.length === 1) {
    return {
      spotId: nameMatches[0]!.id,
      method: "NORMALIZED_NAME",
      confidence: 0.95,
    };
  }

  return { spotId: null, method: "UNMATCHED", confidence: null };
}
