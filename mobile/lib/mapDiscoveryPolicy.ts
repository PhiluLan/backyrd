export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MappableSpot = { id: string; lat: number; lng: number };
export type MapCoordinates = { latitude: number; longitude: number };

const PIN_REGION_PADDING = 2;

export function paddedMapPinRegion(region: MapRegion): MapRegion {
  return {
    ...region,
    latitudeDelta: region.latitudeDelta * PIN_REGION_PADDING,
    longitudeDelta: region.longitudeDelta * PIN_REGION_PADDING,
  };
}

// Keep the same native annotations during short pans. Refresh before any part
// of the visible viewport leaves the cached pin region, or after a large zoom.
export function shouldRefreshMapPinRegion(pinRegion: MapRegion, visibleRegion: MapRegion): boolean {
  if (visibleRegion.latitudeDelta <= 0 || visibleRegion.longitudeDelta <= 0) return false;
  if (pinRegion.latitudeDelta <= 0 || pinRegion.longitudeDelta <= 0) return true;
  const visibleLatEdge = Math.abs(visibleRegion.latitude - pinRegion.latitude) + visibleRegion.latitudeDelta / 2;
  const visibleLngEdge = Math.abs(visibleRegion.longitude - pinRegion.longitude) + visibleRegion.longitudeDelta / 2;
  return visibleLatEdge >= pinRegion.latitudeDelta / 2
    || visibleLngEdge >= pinRegion.longitudeDelta / 2
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
