/** Local suggestions only. Publishing still requires an explicit user action. */
export type MomentPlace = {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
};

export function suggestMomentPlaces<T extends MomentPlace>(
  places: readonly T[],
  position: { lat: number; lon: number; accuracy: number | null; complete?: boolean },
): { nearby: T[]; automatic: T | null } {
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lon)
    || Math.abs(position.lat) > 90 || Math.abs(position.lon) > 180) return { nearby: [], automatic: null };
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const ranked = places.flatMap(place => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)
      || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return [];
    const a = Math.sin(radians(place.lat - position.lat) / 2) ** 2
      + Math.cos(radians(position.lat)) * Math.cos(radians(place.lat)) * Math.sin(radians(place.lng - position.lon) / 2) ** 2;
    const distance = 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
    return distance <= 120 ? [{ place, distance }] : [];
  }).sort((a, b) => a.distance - b.distance || a.place.id.localeCompare(b.place.id));
  const first = ranked[0];
  const accuracy = position.accuracy;
  const precise = accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 35;
  const separated = !ranked[1] || ranked[1].distance - (first?.distance ?? 0) > Math.max(25, (accuracy ?? 0) * 2);
  return {
    nearby: ranked.map(row => row.place),
    automatic: position.complete !== false && precise && first && first.distance <= 60 && separated ? first.place : null,
  };
}
