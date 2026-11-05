/** Existing product city centres, shared by location fallback and regional weather. */
export const CITY_CENTERS: Readonly<Record<string, { latitude: number; longitude: number }>> = {
  basel: { latitude: 47.5596, longitude: 7.5886 },
  "basel-stadt": { latitude: 47.5596, longitude: 7.5886 },
  zürich: { latitude: 47.3769, longitude: 8.5417 },
  zurich: { latitude: 47.3769, longitude: 8.5417 },
  bern: { latitude: 46.9480, longitude: 7.4474 },
  luzern: { latitude: 47.0502, longitude: 8.3093 },
  genf: { latitude: 46.2044, longitude: 6.1432 },
  geneva: { latitude: 46.2044, longitude: 6.1432 },
  lausanne: { latitude: 46.5197, longitude: 6.6323 },
  winterthur: { latitude: 47.4988, longitude: 8.7241 },
  stgallen: { latitude: 47.4245, longitude: 9.3767 },
  "st. gallen": { latitude: 47.4245, longitude: 9.3767 },
};

export function cityCenterFor(city?: string | null) {
  const key = (city ?? "").trim().toLocaleLowerCase("de-CH").replace(/\s+/g, " ");
  return Object.hasOwn(CITY_CENTERS, key) ? CITY_CENTERS[key] : null;
}
