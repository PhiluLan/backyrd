import { parseMomentMentions, type MentionPerson } from "../../packages/shared/src/presentation/social";
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
  mentions?: MentionPerson[];
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
async function hydrateMomentMentions(moments: Moment[]) {
  if (!moments.length) return moments;
  const batches = Array.from({length: Math.ceil(moments.length / 100)}, (_,i) => moments.slice(i*100,(i+1)*100));
  const tags = (await Promise.all(batches.map(async batch => {
    const {data,error}=await supabase.rpc("get_social_post_mentions_v1",{p_post_ids:batch.map(p=>p.post_id)});
    if(error)throw safe();
    return parseMomentMentions(data);
  }))).flat();
  return moments.map(p => ({ ...p, mentions: tags.filter(t => t.post_id === p.post_id) }));
}
export async function getSavedMoments(): Promise<Moment[]> {
  const {data,error}=await supabase.rpc("get_my_saved_moments_v1",{p_limit:200});
  if(error || !Array.isArray(data))throw safe();
  return hydrateMomentMentions(data as Moment[]);
}
export async function getMoment(postId: string): Promise<Moment | null> {
  const { data, error } = await supabase.rpc("get_social_post_v1", { p_post_id: postId });
  if (error) throw safe();
  if (!data) return null;
  if (typeof data !== "object" || data.post_id !== postId || typeof data.user_id !== "string") throw safe();
  return (await hydrateMomentMentions([data as Moment]))[0];
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
  return hydrateMomentMentions((Array.isArray(data) ? data : []) as Moment[]);
}
export async function getUserMoments(userId: string) {
  const { data, error } = await supabase.rpc("get_social_user_posts_v2", {
    p_user_id: userId,
    p_limit: 60,
    p_cursor: null,
  });
  if (error) throw safe();
  return hydrateMomentMentions((Array.isArray(data) ? data : []) as Moment[]);
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
  const { data, error } = await supabase.rpc("react_to_social_post_v1", {
    p_post_id: postId,
    p_reaction_type: kind,
    p_active: active,
  });
  const receipt = Array.isArray(data) ? data[0] : data;
  if (error || receipt?.post_id !== postId || receipt?.reaction_type !== kind || receipt?.active !== active || !Number.isInteger(receipt?.like_count))
    throw new Error("Die Aktion konnte nicht bestätigt werden.");
  return { active: receipt.active as boolean, likeCount: receipt.like_count as number };
}
export async function followUser(userId: string, following: boolean) {
  const { data, error } = await supabase.rpc(
    following ? "follow_user_v2" : "unfollow_user_v2",
    { p_user_id: userId },
  );
  const receipt = Array.isArray(data) ? data[0] : data;
  if (error || receipt?.following_id !== userId || receipt?.is_following !== following) throw new Error("Der Follow-Status konnte nicht bestätigt werden.");
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
export async function createMomentComment(postId: string, body: string, requestId: string) {
  const { data, error } = await supabase.rpc("create_social_comment_v2", {
    p_post_id: postId,
    p_body: body.trim(),
    p_client_request_id: requestId,
  });
  const receipt = Array.isArray(data) ? data[0] : data;
  if (error || !receipt?.comment_id || receipt?.post_id !== postId)
    throw new Error("Dein Kommentar konnte nicht bestätigt werden. Dein Text bleibt erhalten.");
  return receipt;
}
export async function createMoment({
  caption,
  spotId,
  file,
  requestId,
  moods = [],
  mentionedUserIds = [],
}: {
  caption: string;
  spotId: string | null;
  file: File | null;
  requestId: string;
  moods?: string[];
  mentionedUserIds?: string[];
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
    const path = `${userData.user.id}/${requestId}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("social-post-media")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError && String(uploadError.statusCode) !== "409")
      throw new Error("Das Bild konnte nicht hochgeladen werden. Dein Entwurf bleibt erhalten.");
    media.push({
      storage_path: path,
      public_url: null,
      media_type: "image",
      width: null,
      height: null,
      sort_order: 0,
    });
  }
  const { data, error } = await supabase.rpc("create_social_post_v3", {
    p_spot_id: spotId,
    p_caption: caption.trim() || null,
    p_visibility: "public",
    p_mood_tags: moods,
    p_mentioned_user_ids: mentionedUserIds,
    p_expected_actor_id: userData.user.id,
    p_occasion_tags: [],
    p_media: media,
    p_client_request_id: requestId,
  });
  if (error) throw new Error(error.message.includes("mention_not_available")
    ? "Eine markierte Person ist inzwischen privat oder blockiert. Entferne ihre Markierung und versuche es erneut. Dein Entwurf bleibt erhalten."
    : "Dein Moment konnte gerade nicht geteilt werden. Dein Entwurf bleibt erhalten.");
  const created = Array.isArray(data) ? data[0] : data;
  const id = created?.post_id ?? created?.id ?? null;
  if (!id) throw new Error("Moment konnte nicht bestätigt werden. Dein Entwurf bleibt erhalten.");
  const snapshot = created?.safety_snapshot;
  if (snapshot?.analysis_required === true && typeof snapshot?.case_id === "string") {
    void supabase.functions.invoke("safety-evaluate", {body:{caseId:snapshot.case_id}}).catch(() => undefined);
  }

  return id as string | null;
}
