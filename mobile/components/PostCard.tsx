// mobile/components/PostCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import Avatar from "./Avatar";
import { supabase } from "../lib/supabase";
import ReportContentButton from "./safety/ReportContentButton";
import { userFacingError } from "../lib/userFacingError";

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
  source_type?: string | null;
  review_id?: string | null;
  source_context?: Record<string, any> | null;
  media: {
    id?: string;
    storage_path?: string | null;
    public_url?: string | null;
    media_type?: string | null;
    width?: number | null;
    height?: number | null;
    sort_order?: number | null;
  }[] | null;
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
  onToggleReaction: (
    postId: string,
    reactionType: "like" | "save",
    active: boolean,
  ) => Promise<void>;
  onOpenSpot: (post: SocialFeedPost) => void;
  onOpenComments: (post: SocialFeedPost) => void;
  onShare?: (post: SocialFeedPost) => void;
  onFollowChanged?: (userId: string, following: boolean) => void;
  /** Profile headers already own the relationship action. */
  showFollowAction?: boolean;
};

function timeAgo(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "gerade eben";
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

const PRESENTED_TAGS: Record<string, string> = {
  cozy: "Gemütlich",
  calm: "Ruhig",
  inspiring: "Inspirierend",
  lively: "Lebhaft",
};

function cleanTags(value?: string[] | null) {
  return Array.isArray(value)
    ? value
        .map((tag) => String(tag ?? "").trim())
        .filter((tag) => tag.length >= 2)
        .map((tag) => PRESENTED_TAGS[tag.toLowerCase()] ?? tag)
        .slice(0, 4)
    : [];
}

function mediaUrls(post: SocialFeedPost) {
  return Array.isArray(post.media)
    ? post.media
        .map((item) => item.public_url || item.storage_path || null)
        .filter((value): value is string => Boolean(value))
    : [];
}

function isReviewMoment(post: SocialFeedPost) {
  return (
    post.source_type === "review" ||
    post.source_type === "decision_review" ||
    Boolean(post.review_id)
  );
}

export default function SocialPostCard({
  post,
  currentUserId = null,
  onToggleReaction,
  onOpenSpot,
  onOpenComments,
  onShare,
  onFollowChanged,
  showFollowAction = true,
}: Props) {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const [liked, setLiked] = useState(Boolean(post.viewer_has_liked));
  const [saved, setSaved] = useState(Boolean(post.viewer_has_saved));
  const [following, setFollowing] = useState(
    Boolean(post.viewer_follows_author),
  );
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0);
  const [commentCount, setCommentCount] = useState(post.comment_count ?? 0);
  const [busyReaction, setBusyReaction] = useState<"like" | "save" | null>(
    null,
  );
  const [busyFollow, setBusyFollow] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    setLiked(Boolean(post.viewer_has_liked));
    setSaved(Boolean(post.viewer_has_saved));
    setFollowing(Boolean(post.viewer_follows_author));
    setLikeCount(post.like_count ?? 0);
    setCommentCount(post.comment_count ?? 0);
  }, [
    post.post_id,
    post.viewer_has_liked,
    post.viewer_has_saved,
    post.viewer_follows_author,
    post.like_count,
    post.comment_count,
  ]);

  const displayName =
    post.display_name?.trim() || post.username?.trim() || "Backyrd User";
  const handle = post.username?.trim() ? `@${post.username.trim()}` : null;
  const images = useMemo(() => mediaUrls(post), [post]);
  const imageUrl = images[0] ?? null;
  useEffect(() => setMediaFailed(false), [post.post_id, imageUrl]);
  const tags = useMemo(
    () =>
      [...cleanTags(post.mood_tags), ...cleanTags(post.occasion_tags)].slice(
        0,
        4,
      ),
    [post.mood_tags, post.occasion_tags],
  );
  const ownPost = Boolean(currentUserId && post.user_id === currentUserId);
  const reviewMoment = isReviewMoment(post);

  const openUser = () => {
    if (post.user_id) router.push(`/user/${post.user_id}` as any);
  };

  const toggleLike = async () => {
    if (busyReaction) return;
    const next = !liked;
    setBusyReaction("like");
    setLiked(next);
    setLikeCount((value) => Math.max(0, value + (next ? 1 : -1)));

    try {
      await onToggleReaction(post.post_id, "like", next);
    } catch (error: any) {
      setLiked(!next);
      setLikeCount((value) => Math.max(0, value + (next ? -1 : 1)));
      Alert.alert("Reaktion fehlgeschlagen", userFacingError(error));
    } finally {
      setBusyReaction(null);
    }
  };

  const toggleSave = async () => {
    if (busyReaction) return;
    const next = !saved;
    setBusyReaction("save");
    setSaved(next);

    try {
      await onToggleReaction(post.post_id, "save", next);
    } catch (error: any) {
      setSaved(!next);
      Alert.alert("Speichern fehlgeschlagen", userFacingError(error));
    } finally {
      setBusyReaction(null);
    }
  };

  const toggleFollow = async () => {
    if (busyFollow || ownPost || !post.user_id) return;
    const next = !following;
    setBusyFollow(true);
    setFollowing(next);

    try {
      const { error } = await supabase.rpc(
        next ? "follow_user_v2" : "unfollow_user_v2",
        { p_user_id: post.user_id },
      );
      if (error) throw error;
      onFollowChanged?.(post.user_id, next);
    } catch (error: any) {
      setFollowing(!next);
      Alert.alert("Folgen fehlgeschlagen", userFacingError(error));
    } finally {
      setBusyFollow(false);
    }
  };

  const sharePost = async () => {
    if (onShare) {
      onShare(post);
      return;
    }

    await Share.share({
      message: post.spot_name
        ? `${displayName} bei ${post.spot_name}: ${post.caption ?? ""}`
        : `${displayName}: ${post.caption ?? ""}`,
    });
  };

  const openOwnPostMenu = () => {
    const options: any[] = [
      {
        text: "Moment teilen",
        onPress: () => void sharePost(),
      },
      {
        text: "Kommentare öffnen",
        onPress: () => onOpenComments(post),
      },
    ];

    if (post.spot_id) {
      options.push({
        text: "Spot ansehen",
        onPress: () => onOpenSpot(post),
      });
    }

    options.push({
      text: "Abbrechen",
      style: "cancel",
    });

    Alert.alert("Moment", "Was möchtest du tun?", options);
  };

  return (
    <View style={styles.post}>
      <View style={styles.header}>
        <Pressable style={styles.author} onPress={openUser}>
          <View style={styles.avatarRing}>
            <Avatar
              uri={post.avatar_url ?? undefined}
              name={displayName}
              size={43}
            />
          </View>

          <View style={styles.authorCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {displayName}
              </Text>
              {reviewMoment ? (
                <Ionicons
                  name="checkmark-circle"
                  size={15}
                  color="#FF4F91"
                />
              ) : null}
            </View>

            <Text style={styles.authorMeta} numberOfLines={1}>
              {[handle, post.spot_city, timeAgo(post.created_at)]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </Pressable>

        <View style={styles.headerActions}>
          {!ownPost && showFollowAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={following ? `${displayName} nicht mehr folgen` : `${displayName} folgen`}
              accessibilityState={{ selected: following, busy: busyFollow }}
              style={[
                styles.followButton,
                following && styles.followButtonActive,
              ]}
              onPress={toggleFollow}
              disabled={busyFollow}
            >
              <Text
                style={[
                  styles.followText,
                  following && styles.followTextActive,
                ]}
              >
                {following ? "Gefolgt" : "Folgen"}
              </Text>
            </Pressable>
          ) : null}

          {!ownPost ? (
            <ReportContentButton
              entityType="social_post"
              entityId={post.post_id}
              contentType="moment"
              actorUserId={post.user_id}
              spotId={post.spot_id}
              textContent={post.caption}
              imageUrls={images}
              locale="de-CH"
              sourceSurface="social_post_card"
              sourceContext={{
                screen: "social_feed",
                post_id: post.post_id,
                review_id: post.review_id ?? null,
                source_type: post.source_type ?? null,
              }}
            />
          ) : (
            <Pressable
              style={styles.moreButton}
              onPress={openOwnPostMenu}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Moment Optionen öffnen"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color="#D9D9DE"
              />
            </Pressable>
          )}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={post.spot_name ? `${post.spot_name} öffnen` : `${displayName} Profil öffnen`}
        style={
          imageUrl && !mediaFailed
            ? styles.media
            : [styles.mediaWithoutImage, { width: viewportWidth }]
        }
        onPress={() => (post.spot_id ? onOpenSpot(post) : openUser())}
        onLongPress={toggleLike}
      >
        {imageUrl && !mediaFailed ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.mediaImage}
            resizeMode="cover"
            onError={() => setMediaFailed(true)}
            accessibilityLabel={`Moment von ${displayName}`}
          />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons
              accessibilityElementsHidden
              name="images-outline"
              size={28}
              color="rgba(255,255,255,0.26)"
            />
            <Text style={styles.placeholderText}>Moment ohne Bild</Text>
          </View>
        )}

        {images.length > 1 ? (
          <View style={styles.mediaCount}>
            <Ionicons name="copy-outline" size={14} color="#FFFFFF" />
            <Text style={styles.mediaCountText}>{images.length}</Text>
          </View>
        ) : null}

        {post.spot_name ? (
          <View style={styles.spotOverlay}>
            <Ionicons name="location" size={14} color="#FFFFFF" />
            <Text style={styles.spotOverlayText} numberOfLines={1}>
              {post.spot_name}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {images.length > 1 ? (
        <View style={styles.dots}>
          {images.map((_, index) => (
            <View
              key={`${post.post_id}-dot-${index}`}
              style={[styles.dot, index === 0 && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.actionBar}>
        <View style={styles.leftActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={liked ? "Gefällt mir entfernen" : "Gefällt mir"} accessibilityState={{ selected: liked, busy: busyReaction === "like" }} style={styles.action} onPress={toggleLike}>
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={29}
              color={liked ? "#FF4F91" : "#FFFFFF"}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kommentare öffnen"
            style={styles.action}
            onPress={() => onOpenComments(post)}
          >
            <Ionicons
              name="chatbubble-outline"
              size={27}
              color="#FFFFFF"
            />
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel="Moment teilen" style={styles.action} onPress={sharePost}>
            <Ionicons
              name="paper-plane-outline"
              size={27}
              color="#FFFFFF"
            />
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Aus Gespeichert entfernen" : "Moment speichern"} accessibilityState={{ selected: saved, busy: busyReaction === "save" }} style={styles.action} onPress={toggleSave}>
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={28}
            color="#FFFFFF"
          />
        </Pressable>
      </View>

      <View style={styles.content}>
        {likeCount > 0 ? (
          <Text style={styles.engagement}>
            {likeCount} {likeCount === 1 ? "Gefällt mir" : "Gefällt mir"}
          </Text>
        ) : null}

        {post.caption ? (
          <Text style={styles.caption}>
            <Text style={styles.captionAuthor}>{displayName} </Text>
            {post.caption}
          </Text>
        ) : null}

        {post.spot_name ? (
          <Pressable
            style={styles.spotRow}
            onPress={() => onOpenSpot(post)}
          >
            <View style={styles.spotIcon}>
              <Ionicons name="location" size={14} color="#050506" />
            </View>
            <View style={styles.spotCopy}>
              <Text style={styles.spotName} numberOfLines={1}>
                {post.spot_name}
              </Text>
              <Text style={styles.spotMeta} numberOfLines={1}>
                {[post.category_name, post.spot_city]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <Text style={styles.spotLink}>Ansehen</Text>
          </Pressable>
        ) : null}

        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((tag, index) => (
              <View
                key={`${post.post_id}-${tag}-${index}`}
                style={styles.tag}
              >
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {commentCount > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Alle ${commentCount} Kommentare öffnen`} onPress={() => onOpenComments(post)}>
            <Text style={styles.commentsLink}>
              Alle {commentCount} Kommentare ansehen
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.timestamp}>{timeAgo(post.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    marginBottom: 28,
    backgroundColor: "#050506",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  header: {
    minHeight: 70,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  author: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  avatarRing: {
    width: 49,
    height: 49,
    borderRadius: 25,
    padding: 2,
    backgroundColor: "#FF4F91",
    alignItems: "center",
    justifyContent: "center",
  },
  authorCopy: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  authorName: {
    maxWidth: "88%",
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  authorMeta: {
    marginTop: 3,
    color: "#9A9AA2",
    fontSize: 13,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moreButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  followButton: {
    minWidth: 74,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: "#FF4F91",
    alignItems: "center",
    justifyContent: "center",
  },
  followButtonActive: {
    backgroundColor: "#24242A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  followText: {
    color: "#050506",
    fontSize: 13,
    fontWeight: "900",
  },
  followTextActive: { color: "#FFFFFF" },
  media: {
    width: "100%",
    aspectRatio: 0.86,
    backgroundColor: "#111113",
    overflow: "hidden",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
  },
  mediaWithoutImage: {
    alignSelf: "stretch",
    height: 148,
    backgroundColor: "#111113",
    overflow: "hidden",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#111115",
  },
  placeholderText: {
    color: "#6F6F77",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  mediaCount: {
    position: "absolute",
    top: 14,
    right: 14,
    minWidth: 42,
    height: 31,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.62)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  mediaCountText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  spotOverlay: {
    position: "absolute",
    left: 14,
    bottom: 14,
    maxWidth: "72%",
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(8,8,10,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  spotOverlayText: {
    flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  dots: {
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#55555D",
  },
  dotActive: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#FF4F91",
  },
  actionBar: {
    minHeight: 55,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  action: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
  },
  engagement: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 6,
  },
  caption: {
    color: "#E8E8EC",
    fontSize: 15,
    lineHeight: 21,
  },
  captionAuthor: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  spotRow: {
    marginTop: 12,
    minHeight: 58,
    paddingHorizontal: 11,
    borderRadius: 16,
    backgroundColor: "#111115",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  spotIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF4F91",
    alignItems: "center",
    justifyContent: "center",
  },
  spotCopy: { flex: 1, minWidth: 0 },
  spotName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  spotMeta: {
    marginTop: 2,
    color: "#85858D",
    fontSize: 12,
    fontWeight: "600",
  },
  spotLink: {
    color: "#FF4F91",
    fontSize: 12,
    fontWeight: "900",
  },
  tags: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  tag: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(255,125,167,0.10)",
  },
  tagText: {
    color: "#FF4F91",
    fontSize: 12,
    fontWeight: "800",
  },
  commentsLink: {
    marginTop: 10,
    color: "#8F8F98",
    fontSize: 14,
    fontWeight: "600",
  },
  timestamp: {
    marginTop: 8,
    marginBottom: 3,
    color: "#62626A",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
