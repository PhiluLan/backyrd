import type { SocialFeedPost } from "../components/PostCard";
import { supabase } from "./supabase";
import { hydrateSocialMediaSignedUrls } from "./socialMedia";

function normalizeMedia(value: unknown): SocialFeedPost["media"] {
  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? [parsed]
      : [];

  const normalized = items
    .map((value: unknown) => {
      const raw = asRecord(value);
      if (!raw || typeof raw !== "object") return null;

      const storagePath =
        typeof raw.storage_path === "string"
          ? raw.storage_path.trim()
          : null;

      let publicUrl =
        typeof raw.public_url === "string"
          ? raw.public_url.trim()
          : null;

      if (!publicUrl && storagePath) {
        if (/^https?:\/\//i.test(storagePath)) {
          publicUrl = storagePath;
        } else {
          const { data } = supabase.storage
            .from("social-post-media")
            .getPublicUrl(storagePath);

          publicUrl = data.publicUrl || null;
        }
      }

      if (!publicUrl && !storagePath) return null;

      return {
        id: typeof raw.id === "string" ? raw.id : undefined,
        storage_path: storagePath,
        public_url: publicUrl,
        media_type:
          typeof raw.media_type === "string"
            ? raw.media_type
            : "image",
        width:
          typeof raw.width === "number"
            ? raw.width
            : raw.width != null && Number.isFinite(Number(raw.width))
              ? Number(raw.width)
              : null,
        height:
          typeof raw.height === "number"
            ? raw.height
            : raw.height != null && Number.isFinite(Number(raw.height))
              ? Number(raw.height)
              : null,
        sort_order:
          typeof raw.sort_order === "number"
            ? raw.sort_order
            : raw.sort_order != null &&
                Number.isFinite(Number(raw.sort_order))
              ? Number(raw.sort_order)
              : 0,
      };
    })
    .filter(Boolean) as NonNullable<SocialFeedPost["media"]>;

  return normalized.sort(
      (a, b) =>
        Number(a.sort_order ?? 0) -
        Number(b.sort_order ?? 0),
    );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function nullableText(value: unknown) { return typeof value === "string" ? value : null; }
function stringTags(value: unknown) { return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : null; }
function safeCount(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0; }

function normalizePosts(data: unknown): SocialFeedPost[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap(value => {
    const row = asRecord(value);
    if (!row || typeof row.post_id !== "string" || typeof row.user_id !== "string" || typeof row.created_at !== "string") return [];
    return [{
      post_id: row.post_id, user_id: row.user_id, created_at: row.created_at,
      display_name: nullableText(row.display_name), username: nullableText(row.username), avatar_url: nullableText(row.avatar_url),
      spot_id: nullableText(row.spot_id), spot_name: nullableText(row.spot_name), spot_city: nullableText(row.spot_city), category_name: nullableText(row.category_name),
      caption: nullableText(row.caption), visibility: nullableText(row.visibility), mood_tags: stringTags(row.mood_tags), occasion_tags: stringTags(row.occasion_tags),
      source_type: nullableText(row.source_type), review_id: nullableText(row.review_id), source_context: asRecord(row.source_context),
      media: normalizeMedia(row.media), like_count: safeCount(row.like_count), comment_count: safeCount(row.comment_count), save_count: safeCount(row.save_count),
      viewer_has_liked: row.viewer_has_liked === true, viewer_has_saved: row.viewer_has_saved === true, viewer_follows_author: row.viewer_follows_author === true,
    }];
  });
}

async function filterSafetyVisiblePosts(
  posts: SocialFeedPost[],
): Promise<SocialFeedPost[]> {
  if (posts.length === 0) return posts;

  const postIds = posts
    .map((post) => post.post_id)
    .filter(Boolean);

  const reviewIds = posts
    .map((post) => post.review_id)
    .filter((value): value is string => Boolean(value));

  const authorIds = Array.from(
    new Set(
      posts
        .map((post) => post.user_id)
        .filter(Boolean),
    ),
  );

  const [
    visiblePostsResult,
    visibleReviewsResult,
    visibleProfilesResult,
    commentCountsResult,
  ] = await Promise.all([
    supabase.rpc("safety_visible_social_post_ids_v1", {
      p_post_ids: postIds,
    }),
    reviewIds.length > 0
      ? supabase.rpc("safety_visible_entity_ids_v1", {
          p_entity_type: "review",
          p_entity_ids: reviewIds,
        })
      : Promise.resolve({
          data: [],
          error: null,
        }),
    supabase.rpc("safety_visible_entity_ids_v1", {
      p_entity_type: "profile",
      p_entity_ids: authorIds,
    }),
    supabase.rpc("safety_visible_comment_counts_v1", {
      p_post_ids: postIds,
    }),
  ]);

  if (visiblePostsResult.error || !Array.isArray(visiblePostsResult.data) ||
      visibleReviewsResult.error || !Array.isArray(visibleReviewsResult.data)) {
    throw new Error("safety_visibility_unavailable");
  }

  if (commentCountsResult.error) {
    console.log(
      "visible comment counts failed",
      commentCountsResult.error,
    );
  }

  const visiblePostIds = new Set(
    visiblePostsResult.data,
  );

  const visibleReviewIds = new Set(
    visibleReviewsResult.data,
  );

  const visibleProfileIds = new Set(
    !visibleProfilesResult.error && Array.isArray(visibleProfilesResult.data)
      ? visibleProfilesResult.data
      : [],
  );

  const commentCounts = new Map<string, number>();

  if (Array.isArray(commentCountsResult.data)) {
    for (const row of commentCountsResult.data) {
      if (row?.post_id) {
        commentCounts.set(
          row.post_id,
          Number(row.visible_count ?? 0),
        );
      }
    }
  }

  return posts
    .filter((post) => {
      if (!visiblePostIds.has(post.post_id)) return false;

      if (
        post.review_id &&
        !visibleReviewIds.has(post.review_id)
      ) {
        return false;
      }

      return true;
    })
    .map((post) => {
      const authorProfileVisible =
        visibleProfileIds.has(post.user_id);

      return {
        ...post,
        display_name: authorProfileVisible
          ? post.display_name
          : "Mitglied",
        username: authorProfileVisible
          ? post.username
          : null,
        avatar_url: authorProfileVisible
          ? post.avatar_url
          : null,
        comment_count: commentCounts.get(post.post_id) ?? 0,
      };
    });
}

function uniquePosts(posts: SocialFeedPost[]) {
  const seen = new Set<string>();
  const result: SocialFeedPost[] = [];

  for (const post of posts) {
    if (!post?.post_id || seen.has(post.post_id)) continue;
    seen.add(post.post_id);
    result.push(post);
  }

  return result;
}

export async function loadVisibleSocialFeed(options: { mode: "for_you" | "following"; city?: string | null; limit?: number }) {
  const { data, error } = await supabase.rpc("get_social_feed_v2", {
    p_limit: Math.min(30, Math.max(1, options.limit ?? 30)), p_cursor: null,
    p_city: options.city ?? null, p_feed_mode: options.mode,
  });
  if (error) throw error;
  const visiblePosts = await filterSafetyVisiblePosts(uniquePosts(normalizePosts(data)));
  return hydrateSocialMediaSignedUrls(visiblePosts);
}
