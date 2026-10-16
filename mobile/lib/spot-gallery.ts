export type SpotGalleryPhoto = { id: number; url: string };
/** Additional public gallery images never replace the explicitly selected cover. */
export function normalizeSpotGallery(input: unknown, publicBucketUrl: string): SpotGalleryPhoto[] {
  if (!Array.isArray(input)) return [];
  const base = new URL(publicBucketUrl.endsWith("/") ? publicBucketUrl : `${publicBucketUrl}/`);
  const seen = new Set<string>();
  return input.slice(0,30).flatMap((row: unknown) => {
    if (!row || typeof row !== "object" || !("id" in row) || !("url" in row) || typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id <= 0 || typeof row.url !== "string") return [];
    try {
      const url = new URL(row.url,base);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.username || url.password || seen.has(url.href)) return [];
      seen.add(url.href);return [{id:row.id,url:url.href}];
    } catch {return [];}
  });
}
