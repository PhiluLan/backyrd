export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MappableSpot = { id: string; lat: number; lng: number };
export type MapCoordinates = { latitude: number; longitude: number };
export type MapSpotGroup<T extends MappableSpot> = { key: string; lat: number; lng: number; spots: T[] };

const PIN_REGION_PADDING = 2;
const PIN_REFRESH_THRESHOLD = 0.8;

export function paddedMapPinRegion(region: MapRegion): MapRegion {
  return {
    ...region,
    latitudeDelta: region.latitudeDelta * PIN_REGION_PADDING,
    longitudeDelta: region.longitudeDelta * PIN_REGION_PADDING,
  };
}

function mapRegionContains(outer: MapRegion, inner: MapRegion): boolean {
  return Math.abs(inner.latitude - outer.latitude) + inner.latitudeDelta / 2 <= outer.latitudeDelta / 2
    && Math.abs(inner.longitude - outer.longitude) + inner.longitudeDelta / 2 <= outer.longitudeDelta / 2;
}

// Keep previously visited pins mounted while moving the map. Remove only
// redundant regions, so panning back and forth does not grow this cache.
export function retainMapPinRegion(regions: MapRegion[], next: MapRegion): MapRegion[] {
  if (regions.some((region) => mapRegionContains(region, next))) return regions;
  return [...regions.filter((region) => !mapRegionContains(next, region)), next];
}

// Keep native annotations stable during short pans. Refresh while there is
// still a margin, so newly visible pins are ready before the drag ends.
export function shouldRefreshMapPinRegion(pinRegion: MapRegion, visibleRegion: MapRegion): boolean {
  if (visibleRegion.latitudeDelta <= 0 || visibleRegion.longitudeDelta <= 0) return false;
  if (pinRegion.latitudeDelta <= 0 || pinRegion.longitudeDelta <= 0) return true;
  const visibleLatEdge = Math.abs(visibleRegion.latitude - pinRegion.latitude) + visibleRegion.latitudeDelta / 2;
  const visibleLngEdge = Math.abs(visibleRegion.longitude - pinRegion.longitude) + visibleRegion.longitudeDelta / 2;
  return visibleLatEdge >= pinRegion.latitudeDelta / 2 * PIN_REFRESH_THRESHOLD
    || visibleLngEdge >= pinRegion.longitudeDelta / 2 * PIN_REFRESH_THRESHOLD
    || visibleRegion.latitudeDelta < pinRegion.latitudeDelta / 4
    || visibleRegion.longitudeDelta < pinRegion.longitudeDelta / 4;
}

export function mapDistanceMeters(a: MapCoordinates, b: MapCoordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const arc = sinLatitude ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * sinLongitude ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

// Every eligible spot in the cached region receives a pin. Stable key order
// prevents React Native Maps from re-inserting all annotations on each pan.
export function selectMapDiscoverySpots<T extends MappableSpot>(spots: T[], region: MapRegion): T[] {
  if (region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return [];
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  const candidates = spots.filter((spot) =>
    Number.isFinite(spot.lat) && Number.isFinite(spot.lng)
    && Math.abs(spot.lat) <= 90 && Math.abs(spot.lng) <= 180
    && Math.abs(spot.lat - region.latitude) <= halfLat
    && Math.abs(spot.lng - region.longitude) <= halfLng,
  ).sort((a, b) => a.id.localeCompare(b.id));
  return candidates;
}

export function selectRetainedMapDiscoverySpots<T extends MappableSpot>(spots: T[], regions: MapRegion[]): T[] {
  const retained = new Map<string, T>();
  for (const region of regions) {
    for (const spot of selectMapDiscoverySpots(spots, region)) retained.set(spot.id, spot);
  }
  return [...retained.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// One geographic point gets one marker. Its spots remain distinct and can be
// chosen from the map instead of hiding behind overlapping native markers.
export function groupMapSpotsByCoordinate<T extends MappableSpot>(spots: T[]): MapSpotGroup<T>[] {
  const groups = new Map<string, MapSpotGroup<T>>();
  for (const spot of spots) {
    const key = `${spot.lat}:${spot.lng}`;
    const group = groups.get(key);
    if (group) group.spots.push(spot);
    else groups.set(key, { key, lat: spot.lat, lng: spot.lng, spots: [spot] });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    spots: group.spots.sort((a, b) => a.id.localeCompare(b.id)),
  })).sort((a, b) => a.key.localeCompare(b.key));
}
