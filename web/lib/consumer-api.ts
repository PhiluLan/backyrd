import { supabase } from "@/lib/supabase/client";

export type CatalogSpot = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  category_name: string | null;
  header_photo_url: string | null;
  city?: string | null;
};
export type MomentMedia = {
  id?: string;
  public_url?: string | null;
  storage_path?: string | null;
  media_type?: string | null;
};
export type Moment = {
  post_id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  spot_id: string | null;
  spot_name: string | null;
  spot_city: string | null;
  category_name: string | null;
  caption: string | null;
  mood_tags: string[];
  occasion_tags: string[];
  media: MomentMedia[];
  like_count: number;
  comment_count: number;
  save_count: number;
  viewer_has_liked: boolean;
  viewer_has_saved: boolean;
  viewer_follows_author: boolean;
  created_at: string;
};
export type SocialProfile = {
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  header_photo_url: string | null;
  bio: string | null;
  city: string | null;
  is_local: boolean;
  is_private: boolean;
  post_count: number;
  follower_count: number;
  following_count: number;
  viewer_follows_user: boolean;
  is_me: boolean;
  can_follow: boolean;
  can_message: boolean;
};
const safe = () =>
  new Error("Backyrd konnte diese Inhalte gerade nicht laden.");
export async function getCatalog({
  query = "",
  city = "Basel",
  limit = 200,
}: { query?: string; city?: string | null; limit?: number } = {}) {
  const { data, error } = await supabase.rpc(
    "distribution_trust_spot_catalog_v1",
    {
      p_query: query || null,
      p_city: city || null,
      p_limit: limit,
      p_surface: query ? "search" : "discovery",
    },
  );
  if (error) throw safe();
  const spots = (Array.isArray(data) ? data : []) as CatalogSpot[];
  const ids = spots.map((spot) => spot.id);
  if (!ids.length) return spots;
  const { data: headers } = await supabase.rpc(
    "backyrd_web_canonical_spot_image_headers_v1",
    { p_spot_ids: ids },
  );
  const map = new Map(
    (Array.isArray(headers) ? headers : []).map(
      (row: Record<string, unknown>) => [
        String(row.spot_id),
        typeof row.header_photo_path === "string"
          ? row.header_photo_path
          : null,
      ],
    ),
  );
  return spots.map((spot) => ({
    ...spot,
    header_photo_url: map.get(spot.id) ?? null,
  }));
}
export async function getMoments(mode: "for_you" | "following" = "for_you") {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];
  const { data, error } = await supabase.rpc("get_social_feed_v2", {
    p_limit: 40,
    p_cursor: null,
    p_city: null,
    p_feed_mode: mode,
  });
  if (error) throw safe();
  return (Array.isArray(data) ? data : []) as Moment[];
}
export async function getUserMoments(userId: string) {
  const { data, error } = await supabase.rpc("get_social_user_posts_v2", {
    p_user_id: userId,
    p_limit: 60,
    p_cursor: null,
  });
  if (error) throw safe();
  return (Array.isArray(data) ? data : []) as Moment[];
}
export async function getSocialProfile(userId: string) {
  const { data, error } = await supabase.rpc("get_social_profile_v2", {
    p_user_id: userId,
  });
  if (error) throw safe();
  return ((Array.isArray(data) ? data[0] : data) ??
    null) as SocialProfile | null;
}
export async function reactToMoment(
  postId: string,
  kind: "like" | "save",
  active: boolean,
) {
  const { error } = await supabase.rpc("react_to_social_post_v1", {
    p_post_id: postId,
    p_reaction_type: kind,
    p_active: active,
  });
  if (error) throw new Error("Die Aktion konnte nicht gespeichert werden.");
}
export async function followUser(userId: string, following: boolean) {
  const { error } = await supabase.rpc(
    following ? "follow_user_v2" : "unfollow_user_v2",
    { p_user_id: userId },
  );
  if (error) throw new Error("Der Follow-Status konnte nicht geändert werden.");
}
export async function resolveMomentMedia(media: MomentMedia[]) {
  return Promise.all(
    media.map(async (item) => {
      if (item.public_url) return item.public_url;
      if (!item.storage_path) return null;
      const { data } = await supabase.storage
        .from("social-post-media")
        .createSignedUrl(item.storage_path, 3600);
      return data?.signedUrl ?? null;
    }),
  );
}
export async function getMomentComments(postId: string) {
  const { data, error } = await supabase.rpc("get_social_comments_v1", {
    p_post_id: postId,
    p_limit: 80,
  });
  if (error) throw safe();
  return (Array.isArray(data) ? data : []) as Array<{
    comment_id: string;
    user_id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    body: string;
    created_at: string;
  }>;
}
export async function createMomentComment(postId: string, body: string) {
  const { data, error } = await supabase.rpc("create_social_comment_v1", {
    p_post_id: postId,
    p_body: body.trim(),
  });
  if (error)
    throw new Error("Dein Kommentar konnte gerade nicht geteilt werden.");
  return Array.isArray(data) ? data[0] : data;
}
export async function createMoment({
  caption,
  spotId,
  file,
}: {
  caption: string;
  spotId: string | null;
  file: File | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user)
    throw new Error("Bitte melde dich an, um einen Moment zu teilen.");
  const media: Array<Record<string, unknown>> = [];
  if (file) {
    if (!file.type.startsWith("image/"))
      throw new Error("Bitte wähle ein Bild aus.");
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Das Bild darf höchstens 10 MB gross sein.");
    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userData.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("social-post-media")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError)
      throw new Error("Das Bild konnte nicht hochgeladen werden.");
    media.push({
      storage_path: path,
      public_url: null,
      media_type: "image",
      width: null,
      height: null,
      sort_order: 0,
    });
  }
  const { data, error } = await supabase.rpc("create_social_post_v1", {
    p_spot_id: spotId,
    p_caption: caption.trim() || null,
    p_visibility: "public",
    p_mood_tags: [],
    p_occasion_tags: [],
    p_media: media,
  });
  if (error) throw new Error("Dein Moment konnte gerade nicht geteilt werden.");
  const created = Array.isArray(data) ? data[0] : data;
  const id = created?.post_id ?? created?.id ?? null;
  if (id) {
    const { data: snapshot } = await supabase.rpc(
      "safety_register_content_snapshot_v1",
      {
        p_entity_type: "social_post",
        p_entity_id: id,
        p_content_type: "moment",
        p_actor_user_id: userData.user.id,
        p_spot_id: spotId,
        p_text_content: caption.trim() || null,
        p_image_urls: [],
        p_source_surface: "web_moments",
        p_source_context: { client: "consumer_web" },
      },
    );
    if (snapshot?.analysis_required === true && snapshot?.case_id)
      void supabase.functions.invoke("safety-evaluate", {
        body: { caseId: snapshot.case_id },
      });
  }
  return id as string | null;
}
