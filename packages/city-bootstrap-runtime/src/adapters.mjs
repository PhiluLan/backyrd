import { classifyRelevance } from "./relevance.mjs";
import { normalizeText, normalizeWebsite, sha256 } from "./normalization.mjs";
import { pointInCity } from "./config.mjs";
import { safeFetch } from "./security.mjs";

const GOOGLE_TYPE_BATCHES = Object.freeze([
  ["restaurant", "cafe", "bakery"], ["bar", "pub", "night_club"],
  ["museum", "art_gallery", "performing_arts_theater", "movie_theater", "cultural_center", "historical_place"],
  ["amusement_center", "bowling_alley", "escape_room", "indoor_playground", "sports_activity_location", "climbing_gym", "swimming_pool", "spa"],
  ["zoo", "aquarium", "botanical_garden", "park", "hiking_area", "tourist_attraction", "visitor_center", "observation_deck"],
  ["hotel"]
]);

export function buildGoogleDiscoveryPlan(config, grid) {
  return Object.freeze(grid.flatMap((point, gridIndex) => GOOGLE_TYPE_BATCHES.map((types, batchIndex) => Object.freeze({
    queryKey: `google:${gridIndex}:${batchIndex}`, types, point,
    body: { includedTypes: types, maxResultCount: config.discovery.maxResultCount, rankPreference: "DISTANCE", locationRestriction: { circle: { center: { latitude: point.lat, longitude: point.lng }, radius: point.radiusMeters } } }
  }))));
}

export async function executeGoogleDiscovery(query, { apiKey, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  if (!apiKey) throw new Error("google_places_key_missing");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  let response; try {
    response = await fetchImpl("https://places.googleapis.com/v1/places:searchNearby", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", "x-goog-api-key": apiKey, "x-goog-fieldmask": "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types" }, body: JSON.stringify(query.body) });
  } catch (error) { throw new Error(error?.name === "AbortError" ? "google_places_timeout" : "google_places_transport_error"); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`google_places_http_${response.status}`);
  const payload = await response.json(); if (!Array.isArray(payload.places ?? [])) throw new Error("google_places_schema_invalid");
  return Object.freeze((payload.places ?? []).map((place) => Object.freeze({
    sourceFamily: "GOOGLE_PLACES", sourceIdentity: place.id, googlePlaceId: place.id,
    ephemeral: Object.freeze({ name: place.displayName?.text ?? null, address: place.formattedAddress ?? null, lat: place.location?.latitude, lng: place.location?.longitude, types: place.types ?? [], primaryType: place.primaryType ?? null }),
    retention: Object.freeze({ placeId: "PERMITTED", content: "PROHIBITED_AFTER_SESSION" })
  })));
}

const osmType = (tags) => tags.amenity ?? tags.tourism ?? tags.leisure ?? tags.shop ?? tags.sport ?? null;
const osmTypes = (tags) => [...new Set([tags.amenity, tags.tourism, tags.leisure, tags.sport, tags.shop, tags.cuisine].filter(Boolean).flatMap((value) => String(value).split(";")))]
  .map((value) => ({ theatre: "performing_arts_theater", cinema: "movie_theater", nightclub: "night_club", arts_centre: "cultural_center", attraction: "tourist_attraction", viewpoint: "observation_deck", guest_house: "hotel", hostel: "hotel", fitness_centre: "sports_activity_location", climbing: "climbing_gym", playground: "indoor_playground", swimming_pool: "swimming_pool" })[value] ?? value);
export function buildOverpassQuery(config) {
  const name = config.geography.osmName.replace(/["\\]/g, ""), level = config.geography.osmAdminLevel;
  return `[out:json][timeout:60];area["name"="${name}"]["boundary"="administrative"]["admin_level"="${level}"]->.city;(nwr["amenity"~"^(restaurant|cafe|bar|pub|nightclub|theatre|cinema|arts_centre|library|community_centre|events_venue)$"](area.city);nwr["tourism"~"^(museum|gallery|attraction|viewpoint|zoo|aquarium|hotel|hostel|guest_house)$"](area.city);nwr["leisure"~"^(park|garden|sports_centre|fitness_centre|bowling_alley|escape_game|climbing|swimming_pool|playground)$"](area.city););out center tags;`;
}
export async function executeOsmDiscovery(config, { fetchImpl = globalThis.fetch } = {}) {
  const query = buildOverpassQuery(config);
  const response = await fetchImpl("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "BackyrdCityBootstrap/1.0" }, body: new URLSearchParams({ data: query }) });
  if (!response.ok) throw new Error(`overpass_http_${response.status}`);
  const payload = await response.json(); if (!Array.isArray(payload.elements)) throw new Error("overpass_schema_invalid");
  return Object.freeze(payload.elements.flatMap((element) => {
    const tags = element.tags ?? {}, lat = element.lat ?? element.center?.lat, lng = element.lon ?? element.center?.lon;
    if (!tags.name || !pointInCity(config, lat, lng)) return [];
    const address = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") || tags["addr:full"] || null;
    let website = tags.website ?? tags["contact:website"] ?? null; try { website = website ? normalizeWebsite(website) : null; } catch { website = null; }
    const sourceIdentity = `${element.type}/${element.id}`, types = osmTypes(tags), relevance = classifyRelevance(types);
    return [Object.freeze({ sourceFamily: "OPENSTREETMAP", sourceIdentity, sourceLicense: "ODbL-1.0", attribution: "© OpenStreetMap contributors", name: tags.name, address, city: config.name, country: config.country, lat, lng, website, phone: tags.phone ?? tags["contact:phone"] ?? null, externalTypes: types, primaryExternalType: osmType(tags), relevance, sourceFingerprint: sha256({ sourceIdentity, name: normalizeText(tags.name), address: normalizeText(address), lat, lng, website, types }) })];
  }));
}

export async function acquireOfficialSourceFingerprint(url, options = {}) {
  const result = await safeFetch(url, options);
  return Object.freeze({ url: result.url, contentType: result.contentType, byteLength: result.bytes.byteLength, fingerprint: sha256(result.bytes) });
}
