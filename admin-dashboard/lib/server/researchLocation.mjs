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

/** Validate an Admin proposal, not a cryptographic assertion by Google. Never auto-select. */
export function validateBrowserLocations(proposals, existingPlaceId) {
  if (!Array.isArray(proposals) || proposals.length > 5) throw new Error("Ungültige Google-Trefferauswahl.");
  const candidates = proposals.map((result) => {
    if (!result || typeof result !== "object" || Array.isArray(result)
      || typeof result.placeId !== "string" || !/^[a-zA-Z0-9_-]{1,255}$/.test(result.placeId)
      || typeof result.name !== "string" || !result.name.trim() || result.name.length > 240
      || typeof result.address !== "string" || !result.address.trim() || result.address.length > 500) throw new Error("Ungültiger Standortvorschlag.");
    const { latitude, longitude } = result;
    if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("Ungültige Koordinaten.");
    return { placeId: result.placeId, name: result.name, address: result.address, latitude, longitude, exact: false,
      sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.name)}&query_place_id=${encodeURIComponent(result.placeId)}` };
  });
  return { candidates: [...new Map(candidates.filter((candidate) => !existingPlaceId || candidate.placeId === existingPlaceId).map((candidate) => [candidate.placeId, candidate])).values()], automatic: null };
}
