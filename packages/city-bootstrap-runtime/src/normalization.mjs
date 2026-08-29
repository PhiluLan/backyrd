import { createHash } from "node:crypto";

export const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function normalizeText(value) {
  return String(value ?? "").trim().toLocaleLowerCase("de-CH").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " und ").replace(/[^a-z0-9]+/g, " ").trim();
}
export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/[^0-9+]/g, "");
  if (!digits) return null;
  return digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
}
export function normalizeWebsite(value) {
  if (!value) return null;
  const url = new URL(value); if (url.protocol !== "https:") throw new Error("website_https_required");
  url.hash = ""; url.search = ""; url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}
export function websiteIdentity(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, ""), path = url.pathname.replace(/\/+$/, "");
    return `${host}${path === "/" ? "" : path}`;
  } catch { return null; }
}
export function distanceMeters(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function candidateIdentityKey(candidate) {
  if (candidate.googlePlaceId) return sha256(`google:${candidate.googlePlaceId}`);
  if (candidate.sourceFamily && candidate.sourceIdentity) return sha256(`${candidate.sourceFamily}:${candidate.sourceIdentity}`);
  return sha256(`composite:${normalizeText(candidate.name)}:${normalizeText(candidate.address)}:${Number(candidate.lat).toFixed(5)}:${Number(candidate.lng).toFixed(5)}`);
}
