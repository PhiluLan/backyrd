import { supabase } from "./supabase";
import type { SpotHoursRow } from "./spot-opening-status";

export type CanonicalSpotImageInput = {
  /** `header_photo_path` is the existing Owner/Admin-selected product image. */
  headerPhotoUrl?: string | null;
  headerPhotoPath?: string | null;
  /** Legacy gallery data is deliberately not authoritative for a Spot cover. */
  photoUrl?: string | null;
};

export type CanonicalSpotImageProvenance = "OWNER_ADMIN" | "GOOGLE_PLACES" | "BACKYRD_FALLBACK";

export type CanonicalSpotImage = {
  imageUrl: string | null;
  provenance: CanonicalSpotImageProvenance;
  /** Stable within the source system; useful for consistency assertions, never user-facing. */
  identity: string;
};

export type DiscoverySpot = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  category_id: string | null;
  category_name: string | null;
  status: string;
  created_at: string;
  header_photo_url: string | null;
  distribution_priority: number;
  lat: number | null;
  lng: number | null;
  hours: SpotHoursRow[];
};

/** Hide duplicate catalog rows for the same physical venue without merging branches. */
export function deduplicatePhysicalDiscoverySpots(spots: readonly DiscoverySpot[]): DiscoverySpot[] {
  const output: DiscoverySpot[] = [];
  const positions = new Map<string, number>();
  const quality = (spot: DiscoverySpot) => Number(Boolean(spot.address?.trim()))
    + Number(Boolean(spot.header_photo_url)) + Number(Boolean(spot.category_name)) + Number(spot.hours.length > 0);
  for (const spot of spots) {
    const name = spot.name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-CH");
    const coordinates = Number.isFinite(spot.lat) && Number.isFinite(spot.lng)
      ? `${Number(spot.lat).toFixed(6)}:${Number(spot.lng).toFixed(6)}`
      : null;
    const address = spot.address?.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de-CH") || null;
    const identity = coordinates ? `${name}|geo:${coordinates}` : address ? `${name}|address:${address}` : `id:${spot.id}`;
    const existing = positions.get(identity);
    if (existing === undefined) {
      positions.set(identity, output.length);
      output.push(spot);
    } else if (quality(spot) > quality(output[existing])) {
      output[existing] = spot;
    }
  }
  return output;
}

function normalizedUrl(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return null;

  const encodeOnce = (url: string) => {
    try {
      // Canonical image URLs pass through the loader and SpotArtwork. Decode
      // existing escapes before encoding so `%20` never becomes `%2520`.
      return encodeURI(decodeURI(url));
    } catch {
      return encodeURI(url);
    }
  };

  if (/^https?:\/\//i.test(clean)) return encodeOnce(clean);
  const publicUrl = supabase.storage.from("spot-photos").getPublicUrl(clean.replace(/^\/+/, "")).data.publicUrl;
  return encodeOnce(publicUrl);
}

/**
 * Product-level source contract. `header_photo_path` is the existing, explicitly
 * selected Owner/Admin header image. Generic gallery rows have no verification
 * provenance in the schema and therefore must not silently become the cover.
 */
export function resolveCanonicalSpotImage(input: CanonicalSpotImageInput): CanonicalSpotImage {
  const ownerAdminUrl = normalizedUrl(input.headerPhotoUrl) ?? normalizedUrl(input.headerPhotoPath);
  if (ownerAdminUrl) {
    return {
      imageUrl: ownerAdminUrl,
      provenance: "OWNER_ADMIN",
      identity: `owner-admin:${ownerAdminUrl}`,
    };
  }

  return {
    imageUrl: null,
    provenance: "BACKYRD_FALLBACK",
    identity: "backyrd:fallback",
  };
}

/** Compatibility helper for existing consumers. It intentionally omits generic gallery rows. */
export function selectSpotImageUrl(input: CanonicalSpotImageInput) {
  return resolveCanonicalSpotImage(input).imageUrl;
}

/** Reuse the public, visibility-checked Owner/Admin cover source across surfaces. */
export async function loadCanonicalSpotHeaders(spotIds: readonly string[], signal?: AbortSignal): Promise<Map<string, string | null>> {
  const ids = [...new Set(spotIds)].slice(0, 200);
  if (!ids.length) return new Map();
  const request = supabase.rpc("backyrd_web_canonical_spot_image_headers_v1", { p_spot_ids: ids });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  const headers = new Map<string, string | null>();
  for (const row of (Array.isArray(data) ? data : []) as unknown[]) {
    if (!row || typeof row !== "object" || !("spot_id" in row) || !("header_photo_path" in row)) continue;
    if (typeof row.spot_id !== "string" || !ids.includes(row.spot_id)) continue;
    if (row.header_photo_path !== null && typeof row.header_photo_path !== "string") continue;
    headers.set(row.spot_id, selectSpotImageUrl({ headerPhotoPath: row.header_photo_path }));
  }
  return headers;
}

export async function loadDiscoverySpots(city: string, limit = 120, query?: string) {
  const { data, error } = await supabase.rpc("distribution_trust_spot_catalog_v1", {
    p_query: query?.trim() || null,
    p_city: city.trim() || null,
    p_limit: Math.min(Math.max(limit, 1), 200),
    p_surface: "discovery",
  });
  if (error) throw error;
  const spots = (data ?? []) as DiscoverySpot[];
  if (!spots.length) return [];
  if (query) return spots.map(spot => ({ ...spot, city: spot.city ?? (city || null), header_photo_url: null, hours: [] }));
  const ids = spots.map((spot) => spot.id).filter(Boolean);
  const [headerBySpotId, { data: locationRows }, { data: hoursRows }] = await Promise.all([
    loadCanonicalSpotHeaders(ids),
    supabase.from("spots").select("id,lat,lng").in("id", ids),
    supabase.from("spot_hours").select("spot_id,day_of_week,open_time,close_time").in("spot_id", ids),
  ]);
  const locationBySpotId = new Map<string, { lat: number | null; lng: number | null }>(
    (locationRows ?? []).map((row: { id: string; lat: number | null; lng: number | null }) => [row.id, { lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null, lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null }]),
  );
  const hoursBySpotId = new Map<string, SpotHoursRow[]>();
  for (const row of hoursRows ?? []) {
    const current = hoursBySpotId.get(row.spot_id) ?? [];
    current.push({ day_of_week: row.day_of_week ?? null, open_time: row.open_time ?? null, close_time: row.close_time ?? null });
    hoursBySpotId.set(row.spot_id, current);
  }
  return spots.map((spot) => ({
    ...spot,
    header_photo_url: headerBySpotId.get(spot.id) ?? null,
    lat: locationBySpotId.get(spot.id)?.lat ?? null,
    lng: locationBySpotId.get(spot.id)?.lng ?? null,
    hours: hoursBySpotId.get(spot.id) ?? [],
  }));
}

export function imageDiagnosticContext(url: string | null | undefined) {
  if (!url) return { host: null, object: null };
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return { host: parsed.host, object: segments.at(-1) ?? null };
  } catch {
    return { host: "invalid", object: null };
  }
}
