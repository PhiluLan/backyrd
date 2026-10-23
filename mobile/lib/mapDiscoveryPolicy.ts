export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MappableSpot = { id: string; lat: number; lng: number };
export type MapCoordinates = { latitude: number; longitude: number };
export const MAP_SPOT_LIMIT = 10;

export function mapDistanceMeters(a: MapCoordinates, b: MapCoordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const arc = sinLatitude ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * sinLongitude ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function hasMapRegionChanged(current: MapRegion, applied: MapRegion): boolean {
  const latThreshold = Math.max(applied.latitudeDelta * 0.12, 0.001);
  const lngThreshold = Math.max(applied.longitudeDelta * 0.12, 0.001);
  return Math.abs(current.latitude - applied.latitude) > latThreshold
    || Math.abs(current.longitude - applied.longitude) > lngThreshold
    || Math.abs(current.latitudeDelta - applied.latitudeDelta) > latThreshold
    || Math.abs(current.longitudeDelta - applied.longitudeDelta) > lngThreshold;
}

// The preview is ordered by real distance from the user's permitted location (or
// the map centre after a manual area search). The list retains every match.
export function selectMapDiscoverySpots<T extends MappableSpot>(spots: T[], region: MapRegion, origin: MapCoordinates = region, limit = MAP_SPOT_LIMIT): T[] {
  if (limit <= 0 || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return [];
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  const candidates = spots.filter((spot) =>
    Number.isFinite(spot.lat) && Number.isFinite(spot.lng)
    && Math.abs(spot.lat) <= 90 && Math.abs(spot.lng) <= 180
    && Math.abs(spot.lat - region.latitude) <= halfLat
    && Math.abs(spot.lng - region.longitude) <= halfLng,
  ).sort((a, b) => mapDistanceMeters(origin, { latitude: a.lat, longitude: a.lng })
    - mapDistanceMeters(origin, { latitude: b.lat, longitude: b.lng }) || a.id.localeCompare(b.id));
  return candidates.slice(0, limit);
}
