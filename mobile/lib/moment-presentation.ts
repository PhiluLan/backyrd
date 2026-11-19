const PRESENTED_TAGS: Record<string, string> = {
  cozy: "Gemütlich",
  calm: "Ruhig",
  inspiring: "Inspirierend",
  lively: "Lebhaft",
};

/** Home showcases personal content, never a second rendering of bare Mood tags. */
export function homeMomentPreview(post: {
  caption: string | null;
  mood_tags: string[] | null;
  media: { public_url?: string | null; media_type?: string | null }[] | null;
}, failedPhotos: ReadonlySet<string> = new Set()) {
  const moods = presentMomentTags(post.mood_tags);
  const normalize = (value: string) => value.toLocaleLowerCase("de-CH").replace(/[.,·•|&/–—-]+/g, " ").replace(/\s+/g, " ").trim();
  const rawCaption = post.caption?.trim() || null;
  const moodOnly = rawCaption && moods.length && [moods.join(" "), moods.join(" und ")].some(value => normalize(value) === normalize(rawCaption));
  const caption = moodOnly ? null : rawCaption;
  const imageUrl = post.media?.find(item => item.public_url?.trim() && !failedPhotos.has(item.public_url) && (!item.media_type || item.media_type === "image" || item.media_type === "photo" || item.media_type.startsWith("image/")))?.public_url ?? null;
  return imageUrl || caption ? { caption, imageUrl, moods: moods.slice(0, 2) } : null;
}

export function formatMomentTime(value: string, now = Date.now()) {
  const createdAt = new Date(value).getTime();
  const diff = Number.isFinite(createdAt) ? Math.max(0, now - createdAt) : 0;
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "vor 1 Tag";
  if (days < 7) return `vor ${days} Tagen`;

  return new Date(value).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "short",
  });
}

export function presentMomentTags(...groups: (string[] | null | undefined)[]) {
  const seen = new Set<string>();

  return groups.flatMap((group) => (Array.isArray(group) ? group : []))
    .map((tag) => String(tag ?? "").trim())
    .filter((tag) => tag.length >= 2)
    .map((tag) => PRESENTED_TAGS[tag.toLowerCase()] ?? tag)
    .filter((tag) => {
      const key = tag.toLocaleLowerCase("de-CH");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function momentMediaAspectRatio(width?: number | null, height?: number | null) {
  const ratio = Number(width) / Number(height);
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(1.5, Math.max(0.8, ratio));
}

export function momentHasRenderableImage(
  imageUrl?: string | null,
  mediaFailed = false,
) {
  return Boolean(imageUrl?.trim()) && !mediaFailed;
}

export function momentTagPreview(tags: string[], limit = 3) {
  const visible = tags.slice(0, limit);
  return { visible, hiddenCount: Math.max(0, tags.length - visible.length) };
}
