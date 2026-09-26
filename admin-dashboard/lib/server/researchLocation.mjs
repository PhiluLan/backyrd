import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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

/** Browser proposals are IDs only. Coordinates always come from the authenticated server provider. */
export function verifiedBrowserLocations(browserIds, provider, existingPlaceId) {
  if (!Array.isArray(browserIds) || browserIds.length > 5 || browserIds.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,255}$/.test(id))) throw new Error("Ungültige Google-Trefferauswahl.");
  if (!provider?.ok || !Array.isArray(provider.results)) throw new Error("Der bestehende Standortdienst konnte die Google-Treffer nicht bestätigen.");
  const candidates = provider.results.slice(0, 5).flatMap((result) => {
    if (!browserIds.includes(result.id) || (existingPlaceId && result.id !== existingPlaceId)) return [];
    const [longitude, latitude] = Array.isArray(result.coords) ? result.coords : [];
    if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || typeof result.place_name !== "string") return [];
    return [{ placeId: result.id, name: "Google-Standort", address: result.place_name, latitude, longitude, exact: false,
      sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.place_name)}&query_place_id=${encodeURIComponent(result.id)}` }];
  });
  // The existing geocoder supplies identity + position, not enough metadata to assert an exact business match.
  return { candidates: [...new Map(candidates.map((candidate) => [candidate.placeId, candidate])).values()], automatic: null };
}
