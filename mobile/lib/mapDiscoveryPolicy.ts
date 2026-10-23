export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MappableSpot = { id: string; lat: number; lng: number };
export const MAP_SPOT_LIMIT = 10;

export function hasMapRegionChanged(current: MapRegion, applied: MapRegion): boolean {
  const latThreshold = Math.max(applied.latitudeDelta * 0.12, 0.001);
  const lngThreshold = Math.max(applied.longitudeDelta * 0.12, 0.001);
  return Math.abs(current.latitude - applied.latitude) > latThreshold
    || Math.abs(current.longitude - applied.longitude) > lngThreshold
    || Math.abs(current.latitudeDelta - applied.latitudeDelta) > latThreshold
    || Math.abs(current.longitudeDelta - applied.longitudeDelta) > lngThreshold;
}

// Spread a small preview over the viewport; the list retains every matching place.
export function selectMapDiscoverySpots<T extends MappableSpot>(spots: T[], region: MapRegion, limit = MAP_SPOT_LIMIT): T[] {
  if (limit <= 0 || region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return [];
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  const candidates = spots.filter((spot) =>
    Number.isFinite(spot.lat) && Number.isFinite(spot.lng)
    && Math.abs(spot.lat) <= 90 && Math.abs(spot.lng) <= 180
    && Math.abs(spot.lat - region.latitude) <= halfLat
    && Math.abs(spot.lng - region.longitude) <= halfLng,
  ).sort((a, b) => {
    const distance = (spot: T) => ((spot.lat - region.latitude) / halfLat) ** 2
      + ((spot.lng - region.longitude) / halfLng) ** 2;
    return distance(a) - distance(b) || a.id.localeCompare(b.id);
  });

  const selected: T[] = [];
  const usedCells = new Set<string>();
  for (const spot of candidates) {
    const column = Math.min(3, Math.floor((spot.lng - region.longitude + halfLng) / region.longitudeDelta * 4));
    const row = Math.min(2, Math.floor((spot.lat - region.latitude + halfLat) / region.latitudeDelta * 3));
    const cell = `${row}:${column}`;
    if (usedCells.has(cell)) continue;
    selected.push(spot);
    usedCells.add(cell);
    if (selected.length === limit) return selected;
  }
  const selectedIds = new Set(selected.map((spot) => spot.id));
  for (const spot of candidates) {
    if (selectedIds.has(spot.id)) continue;
    selected.push(spot);
    if (selected.length === limit) break;
  }
  return selected;
}
