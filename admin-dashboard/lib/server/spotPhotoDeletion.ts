const PUBLIC_STORAGE_PREFIX = "/storage/v1/object/public/spot-photos/";

export function spotPhotoStoragePath(rawUrl: string, supabaseUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const expectedOrigin = new URL(supabaseUrl).origin;
    if (url.origin !== expectedOrigin || !url.pathname.startsWith(PUBLIC_STORAGE_PREFIX)) return null;
    const encodedPath = url.pathname.slice(PUBLIC_STORAGE_PREFIX.length);
    const path = decodeURIComponent(encodedPath);
    if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\") || path.length > 1024) return null;
    return path;
  } catch {
    return null;
  }
}

export function photoDeleteErrorMessage(code: string): string {
  if (code.includes("photo_not_found")) return "Dieses Foto ist bereits gelöscht oder nicht mehr verfügbar.";
  if (code.includes("photo_storage_url_invalid")) return "Der Speicherort dieses Fotos ist ungültig und muss geprüft werden.";
  if (code.includes("multiple_references")) return "Dieses Bild wird noch an anderer Stelle verwendet und kann nicht sicher gelöscht werden.";
  if (code.includes("admin_required")) return "Dir fehlt die Berechtigung, dieses Foto zu löschen.";
  return "Das Foto konnte nicht vollständig gelöscht werden. Bitte versuche es erneut.";
}
