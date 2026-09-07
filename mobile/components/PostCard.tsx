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
import ReportContentButton from "./safety/ReportContentButton";
import { userFacingError } from "../lib/userFacingError";
import {
  formatMomentTime,
  momentHasRenderableImage,
  momentMediaAspectRatio,
  momentTagPreview,
  presentMomentTags,
} from "../lib/moment-presentation";
import { backyrdTheme as theme } from "../theme/backyrd";

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
  const primaryMedia = post.media?.find(
    (item) => item.public_url || item.storage_path,
  );
  useEffect(() => setMediaFailed(false), [post.post_id, imageUrl]);
  const tags = useMemo(
    () => presentMomentTags(post.mood_tags, post.occasion_tags),
    [post.mood_tags, post.occasion_tags],
  );
  const tagPreview = useMemo(() => momentTagPreview(tags), [tags]);
  const mediaAspectRatio = momentMediaAspectRatio(
    primaryMedia?.width,
    primaryMedia?.height,
  );
  const hasImage = momentHasRenderableImage(imageUrl, mediaFailed);
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

            {handle ? (
              <Text style={styles.authorMeta} numberOfLines={1}>
                {handle}
              </Text>
            ) : null}
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
              hitSlop={6}
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

      {hasImage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Moment von ${displayName}`}
          style={[styles.media, { aspectRatio: mediaAspectRatio }]}
          onPress={() => (post.spot_id ? onOpenSpot(post) : openUser())}
          onLongPress={toggleLike}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.mediaImage}
            resizeMode="cover"
            onError={() => setMediaFailed(true)}
            accessibilityLabel={`Moment von ${displayName}`}
          />
          {images.length > 1 ? (
            <View style={styles.mediaCount}>
              <Ionicons name="copy-outline" size={14} color={theme.color.textPrimary} />
              <Text style={styles.mediaCountText}>{images.length}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {hasImage && images.length > 1 ? (
        <View style={styles.dots}>
          {images.map((_, index) => (
            <View
              key={`${post.post_id}-dot-${index}`}
              style={[styles.dot, index === 0 && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}

      {!hasImage && (Boolean(post.caption) || tagPreview.visible.length > 0) ? (
        <View style={styles.textMoment}>
          <View style={styles.textMomentAccent} />
          <Ionicons
            name="sparkles-outline"
            size={18}
            color={theme.color.pink}
          />
          {post.caption ? (
            <Text style={styles.captionWithoutImage}>{post.caption}</Text>
          ) : null}

          {tagPreview.visible.length > 0 ? (
            <View style={styles.tags}>
              {tagPreview.visible.map((tag, index) => (
                <View key={`${post.post_id}-${tag}-${index}`} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
              {tagPreview.hiddenCount > 0 ? (
                <View style={styles.tagMore}>
                  <Text style={styles.tagMoreText}>+{tagPreview.hiddenCount}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionBar}>
        <View style={styles.leftActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={liked ? "Gefällt mir entfernen" : "Gefällt mir"} accessibilityState={{ selected: liked, busy: busyReaction === "like" }} style={styles.action} onPress={toggleLike}>
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={23}
              color={liked ? theme.color.pink : theme.color.textPrimary}
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
              size={22}
              color={theme.color.textPrimary}
            />
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel="Moment teilen" style={styles.action} onPress={sharePost}>
            <Ionicons
              name="paper-plane-outline"
              size={22}
              color={theme.color.textPrimary}
            />
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Aus Gespeichert entfernen" : "Moment speichern"} accessibilityState={{ selected: saved, busy: busyReaction === "save" }} style={styles.action} onPress={toggleSave}>
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={22}
            color={theme.color.textPrimary}
          />
        </Pressable>
      </View>

      <View style={styles.metaBlock}>
        {likeCount > 0 ? (
          <Text style={styles.engagement}>
            {likeCount} {likeCount === 1 ? "Gefällt mir" : "Gefällt mir"}
          </Text>
        ) : null}

        {hasImage && post.caption ? (
          <Text style={styles.caption}>
            <Text style={styles.captionAuthor}>{displayName} </Text>
            {post.caption}
          </Text>
        ) : null}

        {hasImage && tagPreview.visible.length > 0 ? (
          <View style={styles.tags}>
            {tagPreview.visible.map((tag, index) => (
              <View key={`${post.post_id}-${tag}-${index}`} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {tagPreview.hiddenCount > 0 ? (
              <View style={styles.tagMore}>
                <Text style={styles.tagMoreText}>+{tagPreview.hiddenCount}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {post.spot_name ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${post.spot_name} ansehen`}
            style={styles.spotRow}
            onPress={() => onOpenSpot(post)}
          >
            <Ionicons name="location-outline" size={16} color={theme.color.pink} />
            <View style={styles.spotCopy}>
              <Text style={styles.spotName} numberOfLines={1}>
                {post.spot_name}
              </Text>
              {[post.category_name, post.spot_city].filter(Boolean).length > 0 ? (
                <Text style={styles.spotMeta} numberOfLines={1}>
                  {[post.category_name, post.spot_city].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
            </View>
            <Text style={styles.spotLink}>Ansehen</Text>
          </Pressable>
        ) : null}

        {commentCount > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Alle ${commentCount} Kommentare öffnen`} onPress={() => onOpenComments(post)}>
            <Text style={styles.commentsLink}>
              Alle {commentCount} Kommentare ansehen
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.timestamp}>{formatMomentTime(post.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: {
    marginBottom: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.color.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  header: {
    minHeight: 68,
    paddingHorizontal: theme.spacing.md,
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
    width: 45,
    height: 45,
    borderRadius: 23,
    padding: 1,
    backgroundColor: "rgba(255,79,145,0.48)",
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
    flexShrink: 1,
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 16,
  },
  authorMeta: {
    marginTop: 3,
    color: theme.color.textSecondary,
    fontFamily: theme.type.body,
    fontSize: 13,
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
    minWidth: 66,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,79,145,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,79,145,0.56)",
    alignItems: "center",
    justifyContent: "center",
  },
  followButtonActive: {
    backgroundColor: "rgba(246,240,232,0.06)",
    borderColor: theme.color.border,
  },
  followText: {
    color: theme.color.pink,
    fontFamily: theme.type.bodyBold,
    fontSize: 13,
  },
  followTextActive: { color: theme.color.textSecondary },
  media: {
    width: "100%",
    backgroundColor: theme.color.surfaceElevated,
    overflow: "hidden",
  },
  mediaImage: {
    width: "100%",
    height: "100%",
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
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 12,
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
    minHeight: 50,
    paddingHorizontal: theme.spacing.sm,
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  metaBlock: {
    paddingHorizontal: theme.spacing.md,
  },
  engagement: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 13,
    marginBottom: 4,
  },
  caption: {
    marginTop: 5,
    color: theme.color.textPrimary,
    fontFamily: theme.type.body,
    fontSize: 15,
    lineHeight: 22,
  },
  captionAuthor: {
    fontFamily: theme.type.bodyBold,
  },
  textMoment: {
    position: "relative",
    marginHorizontal: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: "hidden",
    gap: theme.spacing.sm,
  },
  textMomentAccent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    backgroundColor: theme.color.pink,
  },
  captionWithoutImage: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyMedium,
    fontSize: 18,
    lineHeight: 26,
  },
  spotRow: {
    marginTop: theme.spacing.sm,
    minHeight: 42,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  spotCopy: { flex: 1, minWidth: 0 },
  spotName: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 14,
  },
  spotMeta: {
    marginTop: 2,
    color: theme.color.textSecondary,
    fontFamily: theme.type.body,
    fontSize: 12,
  },
  spotLink: {
    color: theme.color.pink,
    fontFamily: theme.type.bodyBold,
    fontSize: 12,
  },
  tags: {
    marginTop: theme.spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,79,145,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,79,145,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: {
    color: theme.color.pink,
    fontFamily: theme.type.bodyMedium,
    fontSize: 12,
  },
  tagMore: {
    minWidth: 28,
    minHeight: 28,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(246,240,232,0.06)",
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  tagMoreText: {
    color: theme.color.textSecondary,
    fontFamily: theme.type.bodyMedium,
    fontSize: 12,
  },
  commentsLink: {
    marginTop: 5,
    color: theme.color.textSecondary,
    fontFamily: theme.type.body,
    fontSize: 13,
  },
  timestamp: {
    marginTop: 5,
    color: theme.color.textMuted,
    fontFamily: theme.type.body,
    fontSize: 12,
  },
});
