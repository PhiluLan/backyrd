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
export function parseDiscoverySpot(value: unknown): DiscoverySpot | null {
  const row = record(value);
  if (!row || typeof row.id !== "string" || typeof row.name !== "string" || row.status !== "approved") return null;
  const category = record(Array.isArray(row.categories) ? row.categories[0] : row.categories);
  const hours: SpotHoursRow[] = Array.isArray(row.spot_hours) ? row.spot_hours.flatMap(value => {
    const item = record(value);
    return item ? [{ day_of_week: text(item.day_of_week), open_time: text(item.open_time), close_time: text(item.close_time) }] : [];
  }) : [];
  return { id: row.id, name: row.name, address: text(row.address), city: text(row.city), category_id: text(row.category_id), category_name: text(category?.name), status: row.status, created_at: text(row.created_at) ?? "", lat: coordinate(row.lat, 90), lng: coordinate(row.lng, 180), header_photo_url: null, distribution_priority: 0, hours };
}

/** Creation time, not Distribution priority or profile edits, defines new on Backyrd. */
export function newestDiscoverySpots(spots: readonly DiscoverySpot[], limit = 6): DiscoverySpot[] {
  return [...new Map(spots.map(spot => [spot.id, spot])).values()]
    .filter(spot => Number.isFinite(Date.parse(spot.created_at)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

async function visibleLocalCatalog(point: LocationCoordinates | null, city: string | null, signal: AbortSignal) {
  const bounds = point ? nearbyDiscoveryBounds(point) : null;
  if (!bounds && !city?.trim()) throw new Error("discovery_city_missing");
  const candidates: DiscoverySpot[] = [];
  let fetched = 0;
  for (const [minLng, maxLng] of bounds?.longitudeRanges ?? [[-180, 180]]) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let request = supabase.from("spots")
        .select("id,name,address,city,lat,lng,category_id,status,created_at,categories(name),spot_hours(day_of_week,open_time,close_time)")
        .eq("status", "approved");
      if (bounds) request = request.gte("lat", bounds.minLat).lte("lat", bounds.maxLat).gte("lng", minLng).lte("lng", maxLng);
      else request = request.ilike("city", city!.trim().replace(/[\\%_]/g, value => `\\${value}`));
      const { data, error } = await request.order("id").range(offset, offset + PAGE_SIZE - 1).abortSignal(signal);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("nearby_catalog_invalid");
      fetched += data.length;
      if (fetched > MAX_CANDIDATES) throw new Error("nearby_catalog_incomplete");
      candidates.push(...data.flatMap(value => { const spot = parseDiscoverySpot(value); return spot ? [spot] : []; }));
      if (fetched >= MAX_CANDIDATES && data.length === PAGE_SIZE) throw new Error("nearby_catalog_incomplete");
      if (data.length < PAGE_SIZE) break;
    }
  }
  const local = point ? nearestDiscoverySpots(candidates, point, candidates.length) : candidates;
  const visible: DiscoverySpot[] = [];
  // RPC responses share the PostgREST row cap. Preserve complete eligibility checks.
  for (let offset = 0; offset < local.length; offset += PAGE_SIZE) {
    visible.push(...await filterDistributedSpots(local.slice(offset, offset + PAGE_SIZE), "discovery", signal));
  }
  return visible;
}

async function withCovers(spots: DiscoverySpot[], signal: AbortSignal) {
  const headers = await loadCanonicalSpotHeaders(spots.map(spot => spot.id), signal);
  return spots.map(spot => ({ ...spot, header_photo_url: headers.get(spot.id) ?? null }));
}

/** One complete local catalog feeds distance and creation-date ordering independently. */
export async function loadHomeNearbySpots(point: LocationCoordinates, limit = 14) {
  nearbyDiscoveryBounds(point);
  return withRequestDeadline(async signal => {
    const visible = await visibleLocalCatalog(point, null, signal);
    const nearest = nearestDiscoverySpots(visible, point, limit);
    const newest = newestDiscoverySpots(visible);
    const covered = await withCovers([...new Map([...nearest, ...newest].map(spot => [spot.id, spot])).values()], signal);
    const byId = new Map(covered.map(spot => [spot.id, spot]));
    return { nearest: nearest.map(spot => byId.get(spot.id)!), newest: newest.map(spot => byId.get(spot.id)!) };
  }, 10_000);
}

/** No profile-city filter or newest-row truncation precedes distance ranking. */
export async function loadNearbyDiscoverySpots(point: LocationCoordinates, limit = 14): Promise<DiscoverySpot[]> {
  return (await loadHomeNearbySpots(point, limit)).nearest;
}

export async function loadNewestCitySpots(city: string): Promise<DiscoverySpot[]> {
  return withRequestDeadline(async signal => withCovers(newestDiscoverySpots(await visibleLocalCatalog(null, city, signal)), signal), 10_000);
}

/** Refresh current public facts/visibility while preserving the original Decision order. */
export async function loadDiscoverySpotsByIds(ids: readonly string[]): Promise<DiscoverySpot[]> {
  const ordered = [...new Set(ids)].slice(0, 50);
  if (!ordered.length) return [];
  return withRequestDeadline(async signal => {
    const { data, error } = await supabase.from("spots")
      .select("id,name,address,city,lat,lng,category_id,status,created_at,categories(name),spot_hours(day_of_week,open_time,close_time)")
      .eq("status", "approved").in("id", ordered).abortSignal(signal);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("recent_decision_catalog_invalid");
    const visible = await filterDistributedSpots(data.flatMap(value => { const spot = parseDiscoverySpot(value); return spot ? [spot] : []; }), "discovery", signal);
    const byId = new Map(visible.map(spot => [spot.id, spot]));
    return withCovers(ordered.flatMap(id => { const spot = byId.get(id); return spot ? [spot] : []; }), signal);
  }, 10_000);
}
