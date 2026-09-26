import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const normalize = (value) => String(value ?? "").normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");
export const locationBinding = (document, spotId, userId) => createHash("sha256").update(JSON.stringify({ document, spotId, userId })).digest("hex");

export function signLocation(candidate, binding, secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ candidate: { ...candidate, observedAt: new Date(now).toISOString() }, binding, expires: now + 15 * 60_000 })).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function verifyLocation(token, binding, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 12000) throw new Error("Standortbestätigung ungültig. Bitte erneut prüfen.");
  const [body, signature, extra] = token.split(".");
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature ?? "", "base64url");
  if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Standortbestätigung ungültig. Bitte erneut prüfen.");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.binding !== binding || payload.expires <= now) throw new Error("Standortbestätigung abgelaufen oder Datei geändert. Bitte erneut prüfen.");
  return payload.candidate;
}

export function classifyLocations(places, expected, existingPlaceId) {
  const candidates = places.flatMap((place) => {
    const component = (type) => place.addressComponents?.find((part) => part.types?.includes(type));
    const latitude = place.location?.latitude, longitude = place.location?.longitude;
    if (typeof place.id !== "string" || !place.id || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const address = `${component("route")?.longText ?? ""} ${component("street_number")?.longText ?? ""}`.trim();
    const locality = component("locality")?.longText ?? component("postal_town")?.longText ?? "";
    const country = component("country")?.shortText ?? "";
    const exact = !!expected.address && !!expected.locality && !!expected.country
      && normalize(address) === normalize(expected.address) && normalize(locality) === normalize(expected.locality)
      && normalize(country) === normalize(expected.country) && normalize(place.displayName?.text) === normalize(expected.name)
      && (!existingPlaceId || existingPlaceId === place.id) && place.businessStatus === "OPERATIONAL";
    return [{ placeId: place.id, name: place.displayName?.text ?? "Unbenannter Google-Treffer", address: place.formattedAddress ?? address,
      latitude, longitude, exact, sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName?.text ?? address)}&query_place_id=${encodeURIComponent(place.id)}` }];
  });
  const unique = [...new Map(candidates.map((candidate) => [candidate.placeId, candidate])).values()];
  // A first result or high provider score is never proof of identity.
  return { candidates: unique, automatic: unique.length === 1 && unique[0].exact ? unique[0].placeId : null };
}

export async function lookupLocations(expected, existingPlaceId, key, fetcher = fetch) {
  if (!key) throw new Error("Google-Standortabgleich ist serverseitig noch nicht konfiguriert.");
  const fields = "id,displayName,formattedAddress,addressComponents,location,businessStatus";
  const request = async (url, options) => {
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Google-Standortabgleich derzeit nicht verfügbar. Es wurden keine Koordinaten übernommen.");
    return response.json();
  };
  if (existingPlaceId) {
    const place = await request(`https://places.googleapis.com/v1/places/${encodeURIComponent(existingPlaceId)}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields } });
    return classifyLocations([place], expected, existingPlaceId);
  }
  const payload = await request("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields.split(",").map((field) => `places.${field}`).join(",") },
    body: JSON.stringify({ textQuery: [expected.name, expected.address, expected.locality, expected.country].join(", "), pageSize: 5, languageCode: "de" }),
  });
  return classifyLocations(payload.places ?? [], expected, null);
}
