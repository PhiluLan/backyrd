const PRESENTED_TAGS: Record<string, string> = {
  cozy: "Gemütlich",
  calm: "Ruhig",
  inspiring: "Inspirierend",
  lively: "Lebhaft",
};

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

export function presentMomentTags(...groups: Array<string[] | null | undefined>) {
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
