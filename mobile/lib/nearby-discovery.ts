import { supabase } from "./supabase";
import { filterDistributedSpots } from "./distributionTrust";
import { loadCanonicalSpotHeaders, type DiscoverySpot } from "./spot-images";
import { withRequestDeadline } from "./requestDeadline";
import { haversineKm } from "./utils/haversine";
import type { LocationCoordinates } from "./locationContext";
import type { SpotHoursRow } from "./spot-opening-status";

export const HOME_NEARBY_RADIUS_KM = 15;
const PAGE_SIZE = 500;
const MAX_CANDIDATES = 10_000;
const RADIUS_EARTH_KM = 6371;

export function validDiscoveryLocation(point: LocationCoordinates | null): point is LocationCoordinates {
  return Boolean(point && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180);
}

/** Bounding boxes cover the complete circle, including poles and the date line. */
export function nearbyDiscoveryBounds(point: LocationCoordinates) {
  if (!validDiscoveryLocation(point)) throw new Error("nearby_location_invalid");
  const angle = HOME_NEARBY_RADIUS_KM / RADIUS_EARTH_KM;
  const latDelta = angle * 180 / Math.PI;
  const minLat = Math.max(-90, point.latitude - latDelta);
  const maxLat = Math.min(90, point.latitude + latDelta);
  if (minLat === -90 || maxLat === 90) return { minLat, maxLat, longitudeRanges: [[-180, 180]] };
  const lngDelta = Math.asin(Math.sin(angle) / Math.cos(point.latitude * Math.PI / 180)) * 180 / Math.PI;
  const minLng = point.longitude - lngDelta;
  const maxLng = point.longitude + lngDelta;
  const longitudeRanges = minLng < -180 ? [[minLng + 360, 180], [-180, maxLng]] : maxLng > 180 ? [[minLng, 180], [-180, maxLng - 360]] : [[minLng, maxLng]];
  return { minLat, maxLat, longitudeRanges };
}

export function nearestDiscoverySpots<T extends { id: string; lat: number | null; lng: number | null }>(spots: readonly T[], point: LocationCoordinates, limit = 6): T[] {
  if (!validDiscoveryLocation(point)) throw new Error("nearby_location_invalid");
  return [...new Map(spots.map(spot => [spot.id, spot])).values()].flatMap(spot => {
    const location = spot.lat !== null && spot.lng !== null ? { latitude: spot.lat, longitude: spot.lng } : null;
    if (!validDiscoveryLocation(location)) return [];
    const distanceKm = haversineKm(point, location);
    return distanceKm <= HOME_NEARBY_RADIUS_KM ? [{ spot, distanceKm }] : [];
  }).sort((a, b) => a.distanceKm - b.distanceKm || a.spot.id.localeCompare(b.spot.id)).slice(0, limit).map(item => item.spot);
}

function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown) { return typeof value === "string" ? value : null; }
function coordinate(value: unknown, maximum: number) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= maximum ? parsed : null;
}
function parseSpot(value: unknown): DiscoverySpot | null {
  const row = record(value);
  if (!row || typeof row.id !== "string" || typeof row.name !== "string" || row.status !== "approved") return null;
  const category = record(Array.isArray(row.categories) ? row.categories[0] : row.categories);
  const hours: SpotHoursRow[] = Array.isArray(row.spot_hours) ? row.spot_hours.flatMap(value => {
    const item = record(value);
    return item ? [{ day_of_week: text(item.day_of_week), open_time: text(item.open_time), close_time: text(item.close_time) }] : [];
  }) : [];
  return { id: row.id, name: row.name, address: text(row.address), city: text(row.city), category_id: text(row.category_id), category_name: text(category?.name), status: row.status, created_at: text(row.created_at) ?? "", lat: coordinate(row.lat, 90), lng: coordinate(row.lng, 180), header_photo_url: null, distribution_priority: 0, hours };
}

/** No profile-city filter or arbitrary newest-row truncation can precede distance ranking. */
export async function loadNearbyDiscoverySpots(point: LocationCoordinates, limit = 14): Promise<DiscoverySpot[]> {
  const bounds = nearbyDiscoveryBounds(point);
  return withRequestDeadline(async signal => {
    const candidates: DiscoverySpot[] = [];
    let fetched = 0;
    for (const [minLng, maxLng] of bounds.longitudeRanges) {
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase.from("spots")
          .select("id,name,address,city,lat,lng,category_id,status,created_at,categories(name),spot_hours(day_of_week,open_time,close_time)")
          .eq("status", "approved").gte("lat", bounds.minLat).lte("lat", bounds.maxLat)
          .gte("lng", minLng).lte("lng", maxLng).order("id").range(offset, offset + PAGE_SIZE - 1).abortSignal(signal);
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error("nearby_catalog_invalid");
        fetched += data.length;
        if (fetched > MAX_CANDIDATES) throw new Error("nearby_catalog_incomplete");
        candidates.push(...data.flatMap(value => { const spot = parseSpot(value); return spot ? [spot] : []; }));
        // Never label an arbitrary incomplete subset as the nearest places.
        if (fetched >= MAX_CANDIDATES && data.length === PAGE_SIZE) throw new Error("nearby_catalog_incomplete");
        if (data.length < PAGE_SIZE) break;
      }
    }
    const withinRadius = nearestDiscoverySpots(candidates, point, candidates.length);
    const visible = await filterDistributedSpots(withinRadius, "discovery", signal);
    const nearest = nearestDiscoverySpots(visible, point, limit);
    const headers = await loadCanonicalSpotHeaders(nearest.map(spot => spot.id), signal);
    return nearest.map(spot => ({ ...spot, header_photo_url: headers.get(spot.id) ?? null }));
  }, 10_000);
}
