/** Shared client-side input rules; the authenticated backend remains authoritative. */
export function normalizeAccountEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isAccountEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeAccountEmail(value));
}

export function normalizeConfirmationCode(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isConfirmationCode(value: string): boolean {
  return /^\d{6}$/.test(normalizeConfirmationCode(value));
}

export function parseAccountAge(value: string): number | null {
  if (!/^\d{1,3}$/.test(value.trim())) return null;
  const age = Number(value.trim());
  return age >= 13 && age <= 120 ? age : null;
}

export function suggestAccountUsername(value: string): string {
  return value.trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._]/g, "").slice(0, 24);
}

export function isAccountUsername(value: string): boolean {
  return /^[a-z0-9_.]{3,24}$/.test(value.trim().toLowerCase());
}

/** Never let a login/callback next parameter become an external navigation. */
export function safeAccountReturnPath(value: string | null, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const base = "https://backyrd.invalid";
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}

/** Matches the existing Storage ownership policy; never change the policy to fit a client path. */
export function profilePhotoObjectKey(userId: string, nonce: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId) || !/^[a-zA-Z0-9-]+$/.test(nonce)) throw new Error("invalid_profile_photo_key");
  return `avatar_${userId}_${nonce}`;
}
