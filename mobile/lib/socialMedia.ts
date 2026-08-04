// mobile/lib/socialMedia.ts

import { supabase } from "./supabase";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const CACHE_SAFETY_MS = 5 * 60 * 1000;

type MediaRow = {
  storage_path?: string | null;
  public_url?: string | null;
  [key: string]: any;
};

type FeedPost = {
  media?: MediaRow[] | null;
  [key: string]: any;
};

type CacheEntry = {
  url: string;
  expiresAt: number;
};

const signedUrlCache = new Map<string, CacheEntry>();

function cachedUrl(path: string) {
  const entry = signedUrlCache.get(path);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now() + CACHE_SAFETY_MS) {
    signedUrlCache.delete(path);
    return null;
  }

  return entry.url;
}

export async function hydrateSocialMediaSignedUrls<T extends FeedPost>(
  posts: T[],
): Promise<T[]> {
  const paths = Array.from(
    new Set(
      posts.flatMap((post) =>
        (post.media ?? [])
          .map((item) => item.storage_path?.trim() || null)
          .filter((value): value is string => Boolean(value)),
      ),
    ),
  );

  if (paths.length === 0) return posts;

  const missingPaths = paths.filter((path) => !cachedUrl(path));

  if (missingPaths.length > 0) {
    const { data, error } = await supabase.storage
      .from("social-post-media")
      .createSignedUrls(missingPaths, SIGNED_URL_TTL_SECONDS);

    if (error) throw error;

    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl) continue;

      signedUrlCache.set(item.path, {
        url: item.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      });
    }
  }

  return posts.map((post) => ({
    ...post,
    media: (post.media ?? []).map((item) => {
      const path = item.storage_path?.trim() || null;
      if (!path) return item;

      return {
        ...item,
        public_url: cachedUrl(path),
      };
    }),
  }));
}
