// mobile/components/PostCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import Avatar from "./Avatar";
import { supabase } from "../lib/supabase";

export type SocialFeedPost = {
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
  visibility: string | null;
  mood_tags: string[] | null;
  occasion_tags: string[] | null;

  source_type?: "manual" | "review" | "decision_review" | "owner_post" | string | null;
  review_id?: string | null;
  source_context?: Record<string, any> | null;

  media: Array<{
    id?: string;
    storage_path?: string | null;
    public_url?: string | null;
    media_type?: string | null;
    width?: number | null;
    height?: number | null;
    sort_order?: number | null;
  }> | null;

  like_count: number;
  comment_count: number;
  save_count: number;

  viewer_has_liked: boolean;
  viewer_has_saved: boolean;
  viewer_follows_author: boolean;

  created_at: string;
};

type Props = {
  post: SocialFeedPost;
  currentUserId?: string | null;
  onToggleReaction: (postId: string, reactionType: "like" | "save", active: boolean) => Promise<void>;
  onOpenSpot: (post: SocialFeedPost) => void;
  onOpenComments: (post: SocialFeedPost) => void;
  onShare?: (post: SocialFeedPost) => void;
  onFollowChanged?: (userId: string, following: boolean) => void;
};

function timeAgo(value: string) {
  const then = new Date(value).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "gerade";
  if (minutes < 60) return `${minutes} Min.`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std.`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} Tg.`;

  return new Date(value).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
  });
}

function cleanTags(value?: string[] | null) {
  return Array.isArray(value)
    ? value
        .map((tag) => String(tag ?? "").trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
}

function firstMediaUrl(post: SocialFeedPost) {
  const first = Array.isArray(post.media) ? post.media[0] : null;
  if (!first) return null;
  return first.public_url || first.storage_path || null;
}

function errorMessage(err: any) {
  return err?.message || err?.details || err?.hint || "Bitte nochmal versuchen.";
}

function isReviewMoment(post: SocialFeedPost) {
  return post.source_type === "review" || post.source_type === "decision_review" || Boolean(post.review_id);
}

function momentLabel(post: SocialFeedPost) {
  if (post.source_type === "decision_review") return "Decision bewertet";
  if (isReviewMoment(post)) return "Bewertung";
  if (post.source_type === "owner_post") return "Spot Update";
  return "Moment";
}

function momentIcon(post: SocialFeedPost): keyof typeof Ionicons.glyphMap {
  if (post.source_type === "decision_review") return "sparkles-outline";
  if (isReviewMoment(post)) return "checkmark-circle-outline";
  if (post.source_type === "owner_post") return "megaphone-outline";
  return "albums-outline";
}

export default function SocialPostCard({
  post,
  currentUserId = null,
  onToggleReaction,
  onOpenSpot,
  onOpenComments,
  onShare,
  onFollowChanged,
}: Props) {
  const router = useRouter();

  const [liked, setLiked] = useState(Boolean(post.viewer_has_liked));
  const [saved, setSaved] = useState(Boolean(post.viewer_has_saved));
  const [following, setFollowing] = useState(Boolean(post.viewer_follows_author));

  const [likeCount, setLikeCount] = useState(post.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(post.comment_count ?? 0);
  const [saveCount, setSaveCount] = useState(post.save_count ?? 0);

  const [busyReaction, setBusyReaction] = useState<"like" | "save" | null>(null);
  const [busyFollow, setBusyFollow] = useState(false);

  useEffect(() => {
    setLiked(Boolean(post.viewer_has_liked));
    setSaved(Boolean(post.viewer_has_saved));
    setFollowing(Boolean(post.viewer_follows_author));
    setLikeCount(post.like_count ?? 0);
    setCommentCount(post.comment_count ?? 0);
    setSaveCount(post.save_count ?? 0);
  }, [
    post.post_id,
    post.viewer_has_liked,
    post.viewer_has_saved,
    post.viewer_follows_author,
    post.like_count,
    post.comment_count,
    post.save_count,
  ]);

  const displayName = post.display_name?.trim() || post.username?.trim() || "Backyrd User";
  const handle = post.username?.trim() ? `@${post.username.trim()}` : "Backyrd";
  const imageUrl = useMemo(() => firstMediaUrl(post), [post]);
  const moodTags = useMemo(() => cleanTags(post.mood_tags), [post.mood_tags]);
  const occasionTags = useMemo(() => cleanTags(post.occasion_tags), [post.occasion_tags]);
  const allTags = useMemo(() => [...moodTags, ...occasionTags].slice(0, 6), [moodTags, occasionTags]);

  const reviewMoment = isReviewMoment(post);
  const isOwnPost = Boolean(currentUserId && post.user_id === currentUserId);

  const openUser = () => {
    if (!post.user_id) return;
    router.push(`/user/${post.user_id}` as any);
  };

  const toggleLike = async () => {
    if (busyReaction) return;
    const next = !liked;

    setBusyReaction("like");
    setLiked(next);
    setLikeCount((current) => Math.max(0, current + (next ? 1 : -1)));

    try {
      await onToggleReaction(post.post_id, "like", next);
    } catch (error: any) {
      setLiked(!next);
      setLikeCount((current) => Math.max(0, current + (next ? -1 : 1)));
      Alert.alert("Reaktion fehlgeschlagen", errorMessage(error));
    } finally {
      setBusyReaction(null);
    }
  };

  const toggleSave = async () => {
    if (busyReaction) return;
    const next = !saved;

    setBusyReaction("save");
    setSaved(next);
    setSaveCount((current) => Math.max(0, current + (next ? 1 : -1)));

    try {
      await onToggleReaction(post.post_id, "save", next);
    } catch (error: any) {
      setSaved(!next);
      setSaveCount((current) => Math.max(0, current + (next ? -1 : 1)));
      Alert.alert("Merken fehlgeschlagen", errorMessage(error));
    } finally {
      setBusyReaction(null);
    }
  };

  const toggleFollow = async () => {
    if (busyFollow || isOwnPost || !post.user_id) return;

    const next = !following;
    setBusyFollow(true);
    setFollowing(next);

    try {
      const { error } = await supabase.rpc(next ? "follow_user_v1" : "unfollow_user_v1", {
        p_user_id: post.user_id,
      });

      if (error) throw error;
      onFollowChanged?.(post.user_id, next);
    } catch (error: any) {
      setFollowing(!next);
      Alert.alert("Folgen fehlgeschlagen", errorMessage(error));
    } finally {
      setBusyFollow(false);
    }
  };

  const sharePost = async () => {
    if (onShare) {
      onShare(post);
      return;
    }

    try {
      await Share.share({
        message: post.spot_name
          ? `${displayName} bei ${post.spot_name}: ${post.caption ?? ""}`
          : `${displayName}: ${post.caption ?? ""}`,
      });
    } catch {
      // ignored
    }
  };

  return (
    <View style={[styles.card, reviewMoment && styles.reviewCard]}>
      <View style={styles.header}>
        <Pressable style={styles.authorRow} onPress={openUser}>
          <Avatar uri={post.avatar_url ?? undefined} name={displayName} size={40} />
          <View style={styles.authorTextWrap}>
            <Text style={styles.authorName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.metaLine} numberOfLines={1}>
              {handle} · {timeAgo(post.created_at)}
            </Text>
          </View>
        </Pressable>

        <View style={styles.headerRight}>
          <View style={[styles.momentBadge, reviewMoment && styles.reviewBadge]}>
            <Ionicons
              name={momentIcon(post)}
              size={13}
              color={reviewMoment ? "#0A0A0B" : "#EDEDF2"}
            />
            <Text style={[styles.momentBadgeText, reviewMoment && styles.reviewBadgeText]}>
              {momentLabel(post)}
            </Text>
          </View>

          {!isOwnPost ? (
            <Pressable
              style={[styles.followButton, following && styles.followButtonActive]}
              onPress={toggleFollow}
              disabled={busyFollow}
            >
              <Text style={[styles.followText, following && styles.followTextActive]}>
                {following ? "Gefolgt" : "Folgen"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {allTags.length > 0 && (
        <View style={styles.contextRail}>
          {allTags.map((tag, index) => (
            <View key={`${tag}-${index}`} style={[styles.contextPill, index === 0 && styles.contextPillStrong]}>
              <Text style={[styles.contextPillText, index === 0 && styles.contextPillTextStrong]}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable style={styles.hero} onPress={() => (post.spot_id ? onOpenSpot(post) : openUser())}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.heroImage} />
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.placeholderGlow} />
            <View style={styles.placeholderGlowSmall} />

            <View style={styles.placeholderCenter}>
              <Ionicons name="albums-outline" size={38} color="rgba(255,255,255,0.34)" />
              <Text style={styles.placeholderCenterText}>Backyrd Moment</Text>
            </View>
          </View>
        )}

        {!!post.spot_name && (
          <View style={styles.spotOverlay}>
            <View style={styles.spotIcon}>
              <Ionicons name="location" size={15} color="#0A0A0B" />
            </View>
            <View style={styles.spotText}>
              <Text style={styles.spotName} numberOfLines={1}>
                {post.spot_name}
              </Text>
              <Text style={styles.spotMeta} numberOfLines={1}>
                {[post.category_name, post.spot_city].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#FFFFFF" />
          </View>
        )}
      </Pressable>

      <View style={styles.body}>
        {!!post.caption && (
          reviewMoment ? (
            <View style={styles.quoteWrap}>
              <Text style={styles.quoteMark}>“</Text>
              <Text style={styles.reviewCaption}>{post.caption}</Text>
            </View>
          ) : (
            <Text style={styles.caption}>
              <Text style={styles.captionAuthor}>{displayName} </Text>
              {post.caption}
            </Text>
          )
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.intentButton, liked && styles.intentButtonActive]}
            onPress={toggleLike}
            disabled={busyReaction === "like"}
          >
            <Ionicons
              name={liked ? "sparkles" : "sparkles-outline"}
              size={18}
              color={liked ? "#0A0A0B" : "#FFFFFF"}
            />
            <Text style={[styles.intentButtonText, liked && styles.intentButtonTextActive]}>
              Guter Tipp{likeCount > 0 ? ` · ${likeCount}` : ""}
            </Text>
          </Pressable>

          <Pressable style={styles.roundAction} onPress={() => onOpenComments(post)}>
            <Ionicons name="chatbubble-outline" size={21} color="#FFFFFF" />
            {commentCount > 0 && <Text style={styles.actionCount}>{commentCount}</Text>}
          </Pressable>

          <Pressable style={styles.roundAction} onPress={toggleSave} disabled={busyReaction === "save"}>
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={21} color="#FFFFFF" />
            {saveCount > 0 && <Text style={styles.actionCount}>{saveCount}</Text>}
          </Pressable>

          <Pressable style={styles.roundAction} onPress={sharePost}>
            <Ionicons name="paper-plane-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {!!post.spot_id && (
          <Pressable style={styles.openSpotButton} onPress={() => onOpenSpot(post)}>
            <Text style={styles.openSpotText}>Zum Spot</Text>
            <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 18,
    borderRadius: 34,
    backgroundColor: "#0C0C10",
    borderWidth: 1,
    borderColor: "#202029",
    overflow: "hidden",
  },
  reviewCard: {
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#0D0D12",
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  authorRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  metaLine: {
    marginTop: 2,
    color: "#85858B",
    fontSize: 13,
    fontWeight: "800",
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 7,
  },
  momentBadge: {
    height: 30,
    borderRadius: 15,
    backgroundColor: "#17171D",
    borderWidth: 1,
    borderColor: "#2B2B34",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  reviewBadge: {
    backgroundColor: "#F2E7D8",
    borderColor: "#F2E7D8",
  },
  momentBadgeText: {
    color: "#EDEDF2",
    fontSize: 11,
    fontWeight: "950",
    letterSpacing: 0.2,
  },
  reviewBadgeText: {
    color: "#0A0A0B",
  },
  followButton: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  followButtonActive: {
    backgroundColor: "#17171B",
    borderWidth: 1,
    borderColor: "#2C2C33",
  },
  followText: {
    color: "#050506",
    fontSize: 12,
    fontWeight: "950",
  },
  followTextActive: {
    color: "#FFFFFF",
  },
  contextRail: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  contextPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2A33",
    backgroundColor: "#15151B",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  contextPillStrong: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  contextPillText: {
    color: "#DADAE0",
    fontSize: 13,
    fontWeight: "850",
  },
  contextPillTextStrong: {
    color: "#080809",
  },
  hero: {
    marginHorizontal: 10,
    height: 410,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#17171B",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#17171B",
  },
  placeholder: {
    flex: 1,
    backgroundColor: "#15151A",
    overflow: "hidden",
  },
  placeholderGlow: {
    position: "absolute",
    right: -88,
    top: -76,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  placeholderGlowSmall: {
    position: "absolute",
    left: -54,
    bottom: 84,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  placeholderCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 72,
  },
  placeholderCenterText: {
    marginTop: 10,
    color: "rgba(255,255,255,0.36)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  spotOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    minHeight: 66,
    borderRadius: 24,
    backgroundColor: "rgba(8,8,10,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  spotIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  spotText: {
    flex: 1,
    minWidth: 0,
  },
  spotName: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  spotMeta: {
    marginTop: 3,
    color: "#B8B8BE",
    fontSize: 13,
    fontWeight: "750",
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  caption: {
    color: "#EAEAEE",
    fontSize: 17,
    lineHeight: 24,
  },
  captionAuthor: {
    color: "#FFFFFF",
    fontWeight: "950",
  },
  quoteWrap: {
    borderRadius: 24,
    backgroundColor: "#141419",
    borderWidth: 1,
    borderColor: "#262630",
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  quoteMark: {
    position: "absolute",
    top: 4,
    left: 12,
    color: "rgba(255,255,255,0.18)",
    fontSize: 42,
    lineHeight: 46,
    fontWeight: "900",
  },
  reviewCaption: {
    color: "#F2F2F5",
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "650",
    paddingLeft: 18,
  },
  actions: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  intentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: "#17171D",
    borderWidth: 1,
    borderColor: "#2B2B34",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  intentButtonActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  intentButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "950",
  },
  intentButtonTextActive: {
    color: "#0A0A0B",
  },
  roundAction: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 21,
    backgroundColor: "#17171D",
    borderWidth: 1,
    borderColor: "#2B2B34",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionCount: {
    color: "#D9D9DE",
    fontSize: 13,
    fontWeight: "950",
  },
  openSpotButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    height: 34,
    borderRadius: 17,
    backgroundColor: "#15151B",
    borderWidth: 1,
    borderColor: "#2A2A33",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  openSpotText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
