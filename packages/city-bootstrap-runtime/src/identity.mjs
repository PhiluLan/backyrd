import { distanceMeters, normalizePhone, normalizeText, websiteIdentity } from "./normalization.mjs";

function evidence(candidate, spot) {
  const signals = [];
  if (candidate.googlePlaceId && spot.google_place_id && candidate.googlePlaceId === spot.google_place_id) signals.push("GOOGLE_PLACE_ID_EXACT");
  const cWeb = websiteIdentity(candidate.website), sWeb = websiteIdentity(spot.website);
  if (cWeb && sWeb && cWeb === sWeb) signals.push("WEBSITE_EXACT");
  const cPhone = normalizePhone(candidate.phone), sPhone = normalizePhone(spot.phone);
  if (cPhone && sPhone && cPhone === sPhone) signals.push("PHONE_EXACT");
  const sameName = normalizeText(candidate.name) === normalizeText(spot.name), sameAddress = normalizeText(candidate.address) === normalizeText(spot.address);
  const distance = distanceMeters(candidate, { lat: Number(spot.lat), lng: Number(spot.lng) });
  if (sameName) signals.push("NAME_EXACT"); if (sameAddress && candidate.address) signals.push("ADDRESS_EXACT"); if (distance <= 25) signals.push("COORDINATE_NEAR");
  return { spot, signals, distance };
}

export function resolveIdentity(candidate, spots) {
  const compared = (spots ?? []).filter((spot) => Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lng))).map((spot) => evidence(candidate, spot));
  const exact = compared.filter((row) => row.signals.includes("GOOGLE_PLACE_ID_EXACT"));
  if (exact.length === 1) return Object.freeze({ state: "MATCHED_EXISTING", confidence: "EXACT", spotId: exact[0].spot.id, signals: exact[0].signals });
  if (exact.length > 1) return Object.freeze({ state: "AMBIGUOUS", confidence: "AMBIGUOUS", spotId: null, reason: "DUPLICATE_EXTERNAL_IDENTITY", matches: exact.map((row) => row.spot.id) });
  const strong = compared.filter((row) => row.signals.includes("WEBSITE_EXACT") || row.signals.includes("PHONE_EXACT") || (row.signals.includes("NAME_EXACT") && row.signals.includes("ADDRESS_EXACT") && row.distance <= 100));
  if (strong.length === 1) return Object.freeze({ state: "MATCHED_EXISTING", confidence: "STRONG", spotId: strong[0].spot.id, signals: strong[0].signals });
  if (strong.length > 1) return Object.freeze({ state: "AMBIGUOUS", confidence: "AMBIGUOUS", spotId: null, reason: "MULTIPLE_STRONG_MATCHES", matches: strong.map((row) => row.spot.id) });
  const possible = compared.filter((row) => row.distance <= 40 && (row.signals.includes("NAME_EXACT") || row.signals.includes("ADDRESS_EXACT")));
  if (possible.length) return Object.freeze({ state: "AMBIGUOUS", confidence: "AMBIGUOUS", spotId: null, reason: "COLOCATED_OR_RENAMED", matches: possible.map((row) => row.spot.id) });
  return Object.freeze({ state: "NEW_IDENTITY", confidence: candidate.googlePlaceId || (candidate.name && candidate.address && candidate.website) ? "STRONG" : "POSSIBLE", spotId: null, signals: [] });
}
