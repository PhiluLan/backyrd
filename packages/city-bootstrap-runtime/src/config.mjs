export const PIPELINE_VERSION = "backyrd-city-bootstrap-v1";

const BASE_TYPES = Object.freeze([
  "restaurant", "cafe", "bar", "pub", "night_club", "bakery",
  "museum", "art_gallery", "performing_arts_theater", "movie_theater",
  "cultural_center", "historical_place", "library",
  "amusement_center", "bowling_alley", "escape_room", "indoor_playground",
  "sports_activity_location", "climbing_gym", "swimming_pool", "spa",
  "zoo", "aquarium", "botanical_garden", "park", "hiking_area",
  "tourist_attraction", "visitor_center", "observation_deck", "hotel"
]);

function city(key, name, bounds, center, target, osmAdminLevel = "8") {
  return Object.freeze({
    contractVersion: "backyrd-city-config-v1", key, name, country: "Switzerland",
    locale: "de-CH", bounds: Object.freeze(bounds), center: Object.freeze(center),
    geography: Object.freeze({ definition: "OSM_ADMINISTRATIVE_AREA", osmName: name, osmAdminLevel }),
    discovery: Object.freeze({ googleTypes: BASE_TYPES, gridStepMeters: 1450, radiusMeters: 1150, maxResultCount: 20 }),
    target: Object.freeze(target)
  });
}

export const CITY_CONFIGS = Object.freeze({
  basel: city("basel", "Basel", { south: 47.519, west: 7.554, north: 47.599, east: 7.633 }, { lat: 47.5596, lng: 7.5886 }, { minProductSpots: 500, maxProductSpots: 600, pilotSize: 30 }),
  zurich: city("zurich", "Zürich", { south: 47.32, west: 8.45, north: 47.44, east: 8.62 }, { lat: 47.3769, lng: 8.5417 }, { minProductSpots: 500, maxProductSpots: 600, pilotSize: 30 })
});

export function validateCityConfig(config) {
  const failures = [];
  if (config?.contractVersion !== "backyrd-city-config-v1") failures.push("contract_version_invalid");
  if (!/^[a-z0-9_-]+$/.test(config?.key ?? "")) failures.push("city_key_invalid");
  if (config?.geography?.definition !== "OSM_ADMINISTRATIVE_AREA" || !config?.geography?.osmName || !/^\d+$/.test(config?.geography?.osmAdminLevel ?? "")) failures.push("geography_definition_invalid");
  const b = config?.bounds ?? {};
  if (![b.south, b.west, b.north, b.east].every(Number.isFinite) || b.south >= b.north || b.west >= b.east) failures.push("bounds_invalid");
  if (!Array.isArray(config?.discovery?.googleTypes) || !config.discovery.googleTypes.length || new Set(config.discovery.googleTypes).size !== config.discovery.googleTypes.length) failures.push("discovery_types_invalid");
  if (!(config?.target?.pilotSize >= 20 && config.target.pilotSize <= 50)) failures.push("pilot_size_invalid");
  if (!(config?.target?.minProductSpots < config?.target?.maxProductSpots)) failures.push("target_invalid");
  return Object.freeze({ valid: failures.length === 0, failures });
}

const metersPerLat = 111_320;
export function buildDiscoveryGrid(config) {
  const verdict = validateCityConfig(config); if (!verdict.valid) throw new Error(verdict.failures[0]);
  const midLat = (config.bounds.south + config.bounds.north) / 2;
  const latStep = config.discovery.gridStepMeters / metersPerLat;
  const lngStep = config.discovery.gridStepMeters / (metersPerLat * Math.cos(midLat * Math.PI / 180));
  const points = [];
  for (let lat = config.bounds.south + latStep / 2; lat < config.bounds.north; lat += latStep) {
    for (let lng = config.bounds.west + lngStep / 2; lng < config.bounds.east; lng += lngStep) points.push(Object.freeze({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), radiusMeters: config.discovery.radiusMeters }));
  }
  return Object.freeze(points);
}

export function pointInCity(config, lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= config.bounds.south && lat <= config.bounds.north && lng >= config.bounds.west && lng <= config.bounds.east;
}
