// mobile/app/user/[id].tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import Avatar from "../../components/Avatar";
import SocialPostCard, { SocialFeedPost } from "../../components/PostCard";
import CommentsSheet from "../../components/CommentsSheet";
import { supabase } from "../../lib/supabase";
import { getOrCreateChat } from "../../lib/chat";
import ReportProfileAction from "../../components/safety/ReportProfileAction";

const { width } = Dimensions.get("window");

type SocialProfile = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  header_photo_url?: string | null;
  bio?: string | null;
  city: string | null;
  country?: string | null;
  since_date?: string | null;
  instagram?: string | null;
  website?: string | null;
  post_count: number;
  follower_count: number;
  following_count: number;
  viewer_follows_user: boolean;
  is_me: boolean;
  is_private?: boolean;
  can_follow?: boolean;
  can_message?: boolean;
};

function errorMessage(err: any) {
  return err?.message || err?.details || err?.hint || "Unbekannter Fehler";
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

  if (visiblePostsResult.error) {
    console.log(
      "social post safety visibility failed",
      visiblePostsResult.error,
    );
  }

  if (visibleReviewsResult.error) {
    console.log(
      "review safety visibility failed",
      visibleReviewsResult.error,
    );
  }

  if (commentCountsResult.error) {
    console.log(
      "visible comment counts failed",
      commentCountsResult.error,
    );
  }

  const visiblePostIds = new Set(
    Array.isArray(visiblePostsResult.data)
      ? visiblePostsResult.data
      : postIds,
  );

  const visibleReviewIds = new Set(
    Array.isArray(visibleReviewsResult.data)
      ? visibleReviewsResult.data
      : reviewIds,
  );

  const visibleProfileIds = new Set(
    Array.isArray(visibleProfilesResult.data)
      ? visibleProfilesResult.data
      : authorIds,
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
          : "Backyrd User",
        username: authorProfileVisible
          ? post.username
          : null,
        avatar_url: authorProfileVisible
          ? post.avatar_url
          : null,
        comment_count: commentCounts.has(post.post_id)
          ? commentCounts.get(post.post_id) ?? 0
          : post.comment_count,
      };
    });
}

function formatSince(value?: string | null) {
  if (!value) return null;
  const year = String(value).slice(0, 4);
  if (!year || year === "null") return null;
  return `Local since ${year}`;
}

export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const userId = typeof params.id === "string" ? params.id : null;

  const scrollY = useRef(new Animated.Value(0)).current;

  const [meId, setMeId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [profileVisible, setProfileVisible] = useState(true);
  const [posts, setPosts] = useState<SocialFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [selectedCommentPost, setSelectedCommentPost] = useState<SocialFeedPost | null>(null);

  const displayName = useMemo(() => {
    return profile?.display_name?.trim() || profile?.username?.trim() || "Backyrd User";
  }, [profile]);

  const handle = useMemo(() => {
    return profile?.username?.trim() ? `@${profile.username.trim()}` : "@backyrd";
  }, [profile]);

  const headerImage = useMemo(() => {
    return (
      profile?.header_photo_url ||
      profile?.avatar_url ||
      "https://placehold.co/1000x800/111116/FFFFFF?text=Backyrd"
    );
  }, [profile?.avatar_url, profile?.header_photo_url]);

  const sinceLabel = useMemo(() => formatSince(profile?.since_date), [profile?.since_date]);

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 220],
    outputRange: [310, 128],
    extrapolate: "clamp",
  });

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!userId) return;

      try {
        if (mode === "initial") setLoading(true);
        if (mode === "refresh") setRefreshing(true);

        const session = await supabase.auth.getUser();
        const currentUserId = session.data.user?.id ?? null;
        setMeId(currentUserId);

        // Important: when the user taps their own avatar/name in the feed,
        // we do not show a second, different profile screen.
        // We route them back to the real main profile.
        if (currentUserId && currentUserId === userId) {
          router.replace("/(tabs)/profile" as any);
          return;
        }

        const [{ data: profileData, error: profileError }, { data: postData, error: postError }] =
          await Promise.all([
            supabase.rpc("get_social_profile_v2", {
              p_user_id: userId,
            }),
            supabase.rpc("get_social_user_posts_v2", {
              p_user_id: userId,
              p_limit: 40,
            }),
          ]);

        if (profileError) throw profileError;
        if (postError) throw postError;

        const profileRow = Array.isArray(profileData)
          ? profileData[0]
          : profileData;

        const { data: visibleProfileIds, error: profileVisibilityError } =
          await supabase.rpc("safety_visible_entity_ids_v1", {
            p_entity_type: "profile",
            p_entity_ids: [userId],
          });

        if (profileVisibilityError) {
          console.log(
            "profile safety visibility failed",
            profileVisibilityError,
          );
        }

        const isProfileVisible = profileVisibilityError
          ? true
          : Array.isArray(visibleProfileIds) &&
            visibleProfileIds.includes(userId);

        setProfileVisible(isProfileVisible);

        setProfile(
          profileRow
            ? {
                ...profileRow,
                display_name: isProfileVisible
                  ? profileRow.display_name
                  : "Backyrd User",
                username: isProfileVisible
                  ? profileRow.username
                  : null,
                avatar_url: isProfileVisible
                  ? profileRow.avatar_url
                  : null,
                header_photo_url: isProfileVisible
                  ? profileRow.header_photo_url
                  : null,
                bio: isProfileVisible
                  ? profileRow.bio
                  : null,
                instagram: isProfileVisible
                  ? profileRow.instagram
                  : null,
                website: isProfileVisible
                  ? profileRow.website
                  : null,
              }
            : null,
        );

        const rawPosts = Array.isArray(postData)
          ? (postData as SocialFeedPost[])
          : [];
        const visiblePosts =
          await filterSafetyVisiblePosts(rawPosts);

        setPosts(visiblePosts);
      } catch (error: any) {
        console.log("user profile load failed", error);
        Alert.alert("Profil konnte nicht geladen werden", errorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router, userId]
  );

  useFocusEffect(
    useCallback(() => {
      void load("initial");
    }, [load]),
  );

  const toggleFollow = useCallback(async () => {
    if (!profile || profile.is_me || followBusy) return;

    const next = !profile.viewer_follows_user;

    setFollowBusy(true);
    setProfile((current) =>
      current
        ? {
            ...current,
            viewer_follows_user: next,
            follower_count: Math.max(0, current.follower_count + (next ? 1 : -1)),
          }
        : current
    );

    try {
      const { error } = await supabase.rpc(next ? "follow_user_v2" : "unfollow_user_v2", {
        p_user_id: profile.user_id,
      });

      if (error) throw error;
    } catch (error: any) {
      setProfile((current) =>
        current
          ? {
              ...current,
              viewer_follows_user: !next,
              follower_count: Math.max(0, current.follower_count + (next ? -1 : 1)),
            }
          : current
      );

      Alert.alert("Folgen fehlgeschlagen", errorMessage(error));
    } finally {
      setFollowBusy(false);
    }
  }, [followBusy, profile]);

  const startMessage = useCallback(async () => {
    if (
      !profile ||
      profile.is_me ||
      messageBusy ||
      profile.can_message === false
    ) {
      return;
    }

    setMessageBusy(true);

    try {
      const currentUserId = meId ?? (
        await supabase.auth.getUser()
      ).data.user?.id ?? null;

      if (!currentUserId) {
        throw new Error(
          "Du musst angemeldet sein, um eine Nachricht zu senden.",
        );
      }

      const chatId = await getOrCreateChat(
        currentUserId,
        profile.user_id,
      );

      router.push(`/messages/${chatId}` as any);
    } catch (error: any) {
      const message = errorMessage(error);

      if (
        message.includes("private_profile_not_messageable")
      ) {
        Alert.alert(
          "Nachricht nicht möglich",
          "Dieses Konto ist privat und kann keine neuen Nachrichten erhalten.",
        );
      } else if (message.includes("interaction_blocked")) {
        Alert.alert(
          "Nachricht nicht möglich",
          "Zwischen diesen Konten sind keine Nachrichten möglich.",
        );
      } else {
        Alert.alert(
          "Chat konnte nicht geöffnet werden",
          message,
        );
      }
    } finally {
      setMessageBusy(false);
    }
  }, [meId, messageBusy, profile, router]);

  const blockUser = useCallback(() => {
    if (!profile || profile.is_me || blockBusy) return;

    Alert.alert(
      "Nutzer blockieren?",
      "Ihr seht euch danach nicht mehr in Suche, Profil oder Moments. Neue Nachrichten werden ebenfalls verhindert.",
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Blockieren",
          style: "destructive",
          onPress: async () => {
            setBlockBusy(true);
            try {
              const { error } = await supabase.rpc("block_user_v1", {
                p_user_id: profile.user_id,
              });
              if (error) throw error;
              Alert.alert("Blockiert", "Der Nutzer wurde blockiert.");
              router.back();
            } catch (error: any) {
              Alert.alert("Blockieren fehlgeschlagen", errorMessage(error));
            } finally {
              setBlockBusy(false);
            }
          },
        },
      ],
    );
  }, [blockBusy, profile, router]);

  const toggleReaction = useCallback(async (postId: string, reactionType: "like" | "save", active: boolean) => {
    const { error } = await supabase.rpc("react_to_social_post_v1", {
      p_post_id: postId,
      p_reaction_type: reactionType,
      p_active: active,
    });

    if (error) throw error;

    setPosts((current) =>
      current.map((post) => {
        if (post.post_id !== postId) return post;

        if (reactionType === "like") {
          const wasActive = Boolean(post.viewer_has_liked);
          return {
            ...post,
            viewer_has_liked: active,
            like_count: Math.max(
              0,
              (post.like_count ?? 0) + (active && !wasActive ? 1 : !active && wasActive ? -1 : 0)
            ),
          };
        }

        const wasActive = Boolean(post.viewer_has_saved);
        return {
          ...post,
          viewer_has_saved: active,
          save_count: Math.max(
            0,
            (post.save_count ?? 0) + (active && !wasActive ? 1 : !active && wasActive ? -1 : 0)
          ),
        };
      })
    );
  }, []);

  const openSpot = useCallback(
    (post: SocialFeedPost) => {
      if (!post.spot_id) return;
      router.push(`/spot/${post.spot_id}` as any);
    },
    [router]
  );

  const sharePost = useCallback(async (_post: SocialFeedPost) => {
    // PostCard has a built-in fallback share. Keeping this callback optional-ready.
  }, []);

  const handleCommentCreated = useCallback((postId: string) => {
    setPosts((current) =>
      current.map((post) =>
        post.post_id === postId
          ? {
              ...post,
              comment_count: Math.max(0, (post.comment_count ?? 0) + 1),
            }
          : post
      )
    );
  }, []);

  const renderHeader = () => {
    if (!profile) return null;

    return (
      <View style={styles.headerWrap}>
        <View style={styles.topBar}>
          <Pressable style={styles.circleButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={25} color="#FFFFFF" />
          </Pressable>

          <View style={styles.topBarActions}>
            {profileVisible && profile ? (
              <ReportProfileAction
                profileUserId={profile.user_id}
                textContent={[
                  profile.display_name,
                  profile.username,
                  profile.bio,
                  profile.city,
                  profile.country,
                  profile.instagram,
                  profile.website,
                ].filter(Boolean).join("\n")}
                avatarUrl={profile.avatar_url}
                headerPhotoUrl={profile.header_photo_url}
              />
            ) : null}

            {profileVisible && profile && !profile.is_me ? (
              <Pressable
                style={styles.circleButton}
                onPress={blockUser}
                disabled={blockBusy}
                accessibilityLabel="Nutzer blockieren"
              >
                <Ionicons name="ban-outline" size={21} color="#FF8A8A" />
              </Pressable>
            ) : null}

            <Pressable
              style={styles.circleButton}
              onPress={() => load("refresh")}
            >
              <Ionicons
                name="refresh"
                size={21}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <Avatar uri={profile.avatar_url ?? undefined} name={displayName} size={104} />

            <View style={styles.identityBlock}>
              <Text style={styles.displayName} numberOfLines={1}>
                {displayName}
              </Text>

              <Text style={styles.handleText} numberOfLines={1}>
                {handle}
                {profile.city ? ` · ${profile.city}` : ""}
              </Text>
            </View>
          </View>

          {!!profile.bio && (
            <Text style={styles.bioText} numberOfLines={4}>
              {profile.bio}
            </Text>
          )}

          {!profileVisible ? (
            <View style={styles.profileSafetyNotice}>
              <Ionicons
                name="shield-outline"
                size={18}
                color="#FFBA62"
              />
              <Text style={styles.profileSafetyNoticeText}>
                Dieses Profil ist aufgrund einer Moderationsentscheidung eingeschränkt.
              </Text>
            </View>
          ) : null}

          <Text style={styles.statsLine}>
            {profile.post_count ?? posts.length} Momente · {profile.follower_count ?? 0} Follower · {profile.following_count ?? 0} folgt
          </Text>

          <View style={styles.profileChips}>
            {sinceLabel && (
              <View style={styles.softChip}>
                <Ionicons name="location-outline" size={15} color="#DADAE0" />
                <Text style={styles.softChipText}>{sinceLabel}</Text>
              </View>
            )}

            {!!profile.instagram && (
              <View style={styles.softChip}>
                <Ionicons name="logo-instagram" size={15} color="#DADAE0" />
                <Text style={styles.softChipText}>@{profile.instagram}</Text>
              </View>
            )}

            {!!profile.website && (
              <View style={styles.softChip}>
                <Ionicons name="globe-outline" size={15} color="#DADAE0" />
                <Text style={styles.softChipText}>{profile.website}</Text>
              </View>
            )}
          </View>

          <View style={styles.profileActionRow}>
            <Pressable
              style={[
                styles.followButton,
                profile.viewer_follows_user &&
                  styles.followButtonActive,
              ]}
              onPress={toggleFollow}
              disabled={
                followBusy ||
                profile.can_follow === false
              }
            >
              <Text
                style={[
                  styles.followButtonText,
                  profile.viewer_follows_user &&
                    styles.followButtonTextActive,
                ]}
              >
                {profile.viewer_follows_user
                  ? "Gefolgt"
                  : "Folgen"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.messageButton,
                profile.can_message === false &&
                  styles.messageButtonDisabled,
              ]}
              onPress={startMessage}
              disabled={
                messageBusy ||
                profile.can_message === false
              }
              accessibilityRole="button"
              accessibilityLabel={`${displayName} eine Nachricht senden`}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={20}
                color={
                  profile.can_message === false
                    ? "#66666E"
                    : "#FFFFFF"
                }
              />
              <Text
                style={[
                  styles.messageButtonText,
                  profile.can_message === false &&
                    styles.messageButtonTextDisabled,
                ]}
              >
                {messageBusy
                  ? "Öffnet …"
                  : "Nachricht"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionKicker}>MOMENTE</Text>
          <Text style={styles.sectionTitle}>Von {displayName}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.loadingText}>Profil laden…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingWrap}>
          <Text style={styles.emptyTitle}>Profil nicht gefunden</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View style={[styles.headerBackdrop, { height: headerHeight }]} pointerEvents="none">
        <Image source={{ uri: headerImage }} style={styles.headerImage} blurRadius={8} />
        <LinearGradient
          colors={["rgba(0,0,0,0.08)", "rgba(10,10,11,0.72)", "#050506"]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.FlatList
        data={posts}
        keyExtractor={(item) => item.post_id}
        renderItem={({ item }) => (
          <SocialPostCard
            post={item}
            currentUserId={meId}
            onToggleReaction={toggleReaction}
            onOpenSpot={openSpot}
            onOpenComments={setSelectedCommentPost}
            onShare={sharePost}
            showFollowAction={false}
            onFollowChanged={(authorId, following) => {
              if (authorId !== profile.user_id) return;

              setProfile((current) =>
                current
                  ? {
                      ...current,
                      viewer_follows_user: following,
                      follower_count: Math.max(0, current.follower_count + (following ? 1 : -1)),
                    }
                  : current
              );
            }}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="images-outline" size={34} color="#77777F" />
            <Text style={styles.emptyTitle}>Noch keine Momente</Text>
            <Text style={styles.emptyText}>Sobald hier Momente geteilt werden, erscheinen sie in diesem Profil.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            tintColor="#FFFFFF"
            refreshing={refreshing}
            onRefresh={() => load("refresh")}
          />
        }
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
      />

      <CommentsSheet
        visible={Boolean(selectedCommentPost)}
        postId={selectedCommentPost?.post_id ?? null}
        postTitle={selectedCommentPost?.spot_name ?? selectedCommentPost?.display_name ?? "Backyrd Moment"}
        onClose={() => setSelectedCommentPost(null)}
        onCommentCreated={handleCommentCreated}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050506",
  },
  headerBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    width,
    overflow: "hidden",
  },
  headerImage: {
    width,
    height: "100%",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  loadingText: {
    color: "#8E8E95",
    fontSize: 15,
    fontWeight: "800",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 76,
    paddingBottom: 120,
  },
  headerWrap: {
    paddingBottom: 16,
  },
  topBar: {
    marginBottom: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(18,18,24,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileCard: {
    paddingHorizontal: 6,
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
  },
  identityBlock: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1.2,
  },
  handleText: {
    marginTop: 5,
    color: "#8F8F98",
    fontSize: 18,
    fontWeight: "800",
  },
  profileSafetyNotice: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 17,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,186,98,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,186,98,0.18)",
  },
  profileSafetyNoticeText: {
    flex: 1,
    color: "#D9C29F",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  bioText: {
    marginTop: 18,
    color: "#EDEDF2",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  statsLine: {
    marginTop: 18,
    color: "#C9C9CF",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  profileChips: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  softChip: {
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: "#19191F",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  softChipText: {
    color: "#DADAE0",
    fontSize: 14,
    fontWeight: "700",
  },
  profileActionRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  messageButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#202026",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  messageButtonDisabled: {
    opacity: 0.5,
  },
  messageButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  messageButtonTextDisabled: {
    color: "#77777F",
  },
  followButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#FF4F91",
    alignItems: "center",
    justifyContent: "center",
  },
  followButtonActive: {
    backgroundColor: "#202026",
    borderWidth: 1,
    borderColor: "#303039",
  },
  followButtonText: {
    color: "#050506",
    fontSize: 16,
    fontWeight: "900",
  },
  followButtonTextActive: {
    color: "#FFFFFF",
  },
  secondaryButton: {
    marginTop: 16,
    height: 52,
    borderRadius: 999,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "#303039",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  sectionHeader: {
    paddingTop: 22,
    paddingHorizontal: 2,
  },
  sectionKicker: {
    color: "#8E8E95",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  sectionTitle: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  emptyCard: {
    marginTop: 4,
    borderRadius: 30,
    backgroundColor: "#111113",
    borderWidth: 1,
    borderColor: "#222229",
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
  },
  emptyTitle: {
    marginTop: 12,
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 8,
    color: "#8E8E95",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
});
