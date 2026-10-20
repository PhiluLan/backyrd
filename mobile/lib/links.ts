import { Alert, Linking, Platform, Share } from "react-native";

export function websiteUrl(value?: string | null): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) && !/^https?:\/\//i.test(clean)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

export async function openExternalUrl(url: string | null | undefined, failure = "Der Link konnte nicht geöffnet werden. Versuche es bitte erneut.") {
  if (!url) { Alert.alert("Nicht verfügbar", "Diese Angabe ist noch nicht hinterlegt."); return false; }
  try { await Linking.openURL(url); return true; }
  catch { Alert.alert("Öffnen nicht möglich", failure); return false; }
}

export function openWebsite(url?: string) {
  return openExternalUrl(websiteUrl(url), "Die Webseite konnte nicht geöffnet werden.");
}
export function callNumber(phone?: string) {
  const number = phone?.replace(/[^\d+]/g, "");
  return openExternalUrl(number && /\d/.test(number) ? `tel:${number}` : null, "Auf diesem Gerät konnte kein Anruf gestartet werden.");
}
export function openInAppleMaps(lat: number | null, lng: number | null, label?: string, address?: string) {
  const point = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const destination = point ? `${lat},${lng}` : address?.trim();
  if (!destination) return openExternalUrl(null);
  const q = encodeURIComponent(label ?? address ?? "Ziel");
  const url = Platform.OS === "ios" ? `https://maps.apple.com/?${point ? `ll=${destination}&q=${q}` : `q=${encodeURIComponent(destination)}`}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
  return openExternalUrl(url, "Die Karten-App konnte nicht geöffnet werden.");
}
export async function sharePlace(id: string, name: string, address?: string | null) {
  const url = `https://www.backyrd.ch/spots/${encodeURIComponent(id)}`;
  try { await Share.share({ message: [name, address, url].filter(Boolean).join("\n"), url }); }
  catch { Alert.alert("Teilen nicht möglich", "Der Ort konnte gerade nicht geteilt werden. Versuche es erneut."); }
}
