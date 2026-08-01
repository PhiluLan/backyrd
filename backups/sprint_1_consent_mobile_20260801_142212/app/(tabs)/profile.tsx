// mobile/app/(tabs)/profile.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";

import { supabase } from "@/lib/supabase";
import { ensureProfile } from "@/lib/profile";
import SocialPostCard, { type SocialFeedPost } from "@/components/PostCard";
import CommentsSheet from "@/components/CommentsSheet";
import { trackAnalyticsEvent, reportAnalyticsError } from "@/lib/analytics";
import { buildProfileSafetyText, registerSafetySnapshot } from "@/lib/safety-content";

const { width } = Dimensions.get("window");

type ProfileTab = "posts" | "favorites" | "badges";

type ProfileRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  header_photo_url?: string | null;
  bio?: string | null;
  city?: string | null;
  country?: string | null;
  since_date?: string | null;
  pronouns?: string | null;
  birthdate?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  website?: string | null;
  contact_email?: string | null;
  interests?: string | null;
  personality?: string | null;
  job_title?: string | null;
  languages?: string | string[] | null;
};

type FavoriteRow = {
  spot_id: string;
  spots?: {
    id?: string;
    name?: string | null;
    city?: string | null;
    header_photo_path?: string | null;
    spot_photos?: Array<{ url?: string | null }> | null;
  } | null;
};

type BadgeRow = {
  achievements?: {
    name?: string | null;
    icon_url?: string | null;
    tier?: string | null;
  } | null;
};


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
  return year && year !== "null" ? `Local since ${year}` : null;
}

function profileName(profile: ProfileRow | null) {
  const full = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  return full || profile?.username || "Backyrd User";
}

function profileHandle(profile: ProfileRow | null) {
  return profile?.username ? `@${profile.username}` : "@backyrd";
}

function splitChips(value?: string | string[] | null) {
  if (Array.isArray(value)) return value.map((v) => `${v}`.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function getSpotPhoto(item: FavoriteRow) {
  return (
    item.spots?.header_photo_path ||
    item.spots?.spot_photos?.find((p) => p?.url)?.url ||
    "https://placehold.co/800x1000/17171D/FFFFFF?text=Backyrd"
  );
}

function errorText(error: any) {
  return error?.message || error?.details || error?.hint || "Bitte nochmals versuchen.";
}

export default function ProfileScreen() {
  const router = useRouter();

  const scrollY = useRef(new Animated.Value(0)).current;

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [posts, setPosts] = useState<SocialFeedPost[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [badges, setBadges] = useState<BadgeRow[]>([]);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const [tab, setTab] = useState<ProfileTab>("posts");
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedCommentsPost, setSelectedCommentsPost] = useState<SocialFeedPost | null>(null);

  const HEADER_MAX = 310;
  const HEADER_MIN = 128;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 220],
    outputRange: [HEADER_MAX, HEADER_MIN],
    extrapolate: "clamp",
  });

  const displayName = useMemo(() => profileName(profile), [profile]);
  const handle = useMemo(() => profileHandle(profile), [profile]);
  const sinceLabel = useMemo(() => formatSince(profile?.since_date), [profile?.since_date]);
  const profileMeta = useMemo(() => {
    const parts = [profile?.city || "Basel", sinceLabel].filter(Boolean);
    return parts.join(" · ");
  }, [profile?.city, sinceLabel]);

  const headerImage =
    profile?.header_photo_url ||
    profile?.avatar_url ||
    "https://placehold.co/1000x800/111116/FFFFFF?text=Backyrd";

  const avatarImage =
    profile?.avatar_url || "https://placehold.co/240x240/22222A/FFFFFF?text=BU";

  const interestChips = useMemo(() => splitChips(profile?.interests).slice(0, 5), [profile?.interests]);
  const personalityChips = useMemo(() => splitChips(profile?.personality).slice(0, 4), [profile?.personality]);

  const loadForUser = useCallback(
    async (currentUser: any) => {
      setUser(currentUser);

      if (!currentUser) {
        setProfile(null);
        setPosts([]);
        setFavorites([]);
        setBadges([]);
        setFollowersCount(0);
        setFollowingCount(0);
        router.replace("/gate" as any);
        return;
      }

      setLoading(true);

      try {
        await ensureProfile();

        const [
          profileRes,
          feedRes,
          favoritesRes,
          badgesRes,
          followerRes,
          followingRes,
        ] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),

          // Uses the same social feed source as public profiles/feed.
          // The client filters to the current user so the own profile and public profile feel identical.
          supabase.rpc("get_social_feed_v1", {
            p_limit: 80,
            p_feed_mode: "for_you",
            p_city: null,
            p_cursor: null,
          }),

          supabase
            .from("favorites")
            .select("spot_id, spots(id, name, city, header_photo_path, spot_photos(url))")
            .eq("user_id", currentUser.id),

          supabase
            .from("user_achievements")
            .select("achievements(name, icon_url, tier)")
            .eq("user_id", currentUser.id),

          supabase
            .from("follows")
            .select("follower", { count: "exact", head: true })
            .eq("following", currentUser.id),

          supabase
            .from("follows")
            .select("following", { count: "exact", head: true })
            .eq("follower", currentUser.id),
        ]);

        if (profileRes.error) console.log("profile load failed", profileRes.error);
        if (feedRes.error) console.log("profile posts load failed", feedRes.error);
        if (favoritesRes.error) console.log("favorites load failed", favoritesRes.error);
        if (badgesRes.error) console.log("badges load failed", badgesRes.error);
        if (followerRes.error) console.log("followers count failed", followerRes.error);
        if (followingRes.error) console.log("following count failed", followingRes.error);

        setProfile((profileRes.data ?? {}) as ProfileRow);

        const allFeedPosts = Array.isArray(feedRes.data)
          ? (feedRes.data as SocialFeedPost[])
          : [];
        const ownPosts = allFeedPosts.filter(
          (post) => post.user_id === currentUser.id,
        );
        const visibleOwnPosts =
          await filterSafetyVisiblePosts(ownPosts);

        setPosts(visibleOwnPosts);

        setFavorites((favoritesRes.data ?? []) as FavoriteRow[]);
        setBadges((badgesRes.data ?? []) as BadgeRow[]);
        setFollowersCount(followerRes.count ?? 0);
        setFollowingCount(followingRes.count ?? 0);
      } catch (error: any) {
        console.log("profile bootstrap failed", error?.message ?? error);
        Alert.alert("Profil konnte nicht geladen werden", errorText(error));
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    let active = true;

    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active) return;
        await loadForUser(data.user ?? null);
      })
      .finally(() => {
        if (active) setCheckedAuth(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      await loadForUser(session?.user ?? null);
      if (active) setCheckedAuth(true);
    });

    return () => {
      active = false;
      listener?.subscription.unsubscribe();
    };
  }, [loadForUser, refreshKey]);

  async function pickImageAndUploadAvatar() {
    if (!user) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset.base64) return;

    const ext = asset.fileName?.split(".").pop() || "jpg";
    const fileName = `avatar_${user.id}_${Date.now()}.${ext}`;
    const arrayBuffer = decode(asset.base64);

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, arrayBuffer, {
        contentType: asset.mimeType ?? "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      Alert.alert("Upload-Fehler", uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("profile-photos").getPublicUrl(fileName);
    const url = data.publicUrl;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        avatar_url: url,
        header_photo_url: url,
      })
      .eq("id", user.id);

    if (updateError) {
      Alert.alert("Fehler beim Speichern", updateError.message);
      return;
    }

    const nextProfile = {
      ...(profile ?? { id: user.id }),
      avatar_url: url,
      header_photo_url: url,
    } as ProfileRow;

    setProfile(nextProfile);

    await registerSafetySnapshot({
      entityType: "profile",
      entityId: user.id,
      contentType: "profile",
      actorUserId: user.id,
      textContent: buildProfileSafetyText(nextProfile),
      imageUrls: [url],
      sourceSurface: "profile_avatar_upload",
      sourceContext: {
        screen: "profile",
        media_role: "avatar_and_header",
      },
    });
  }

  async function saveProfile() {
    void trackAnalyticsEvent({ eventName: "profile_update_started", screenName: "profile" });
    if (!user || !profile) return;

    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profile.first_name,
        last_name: profile.last_name,
        bio: profile.bio,
        city: profile.city,
        since_date: profile.since_date,
        username: profile.username,
        pronouns: profile.pronouns,
        country: profile.country,
        birthdate: profile.birthdate,
        instagram: profile.instagram,
        tiktok: profile.tiktok,
        website: profile.website,
        contact_email: profile.contact_email,
        interests: profile.interests,
        personality: profile.personality,
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      Alert.alert("Fehler", error.message);
      return;
    }

    await registerSafetySnapshot({
      entityType: "profile",
      entityId: user.id,
      contentType: "profile",
      actorUserId: user.id,
      textContent: buildProfileSafetyText(profile),
      imageUrls: [
        profile.avatar_url,
        profile.header_photo_url,
      ].filter((value): value is string => Boolean(value)),
      sourceSurface: "profile_edit",
      sourceContext: {
        screen: "profile",
      },
    });

    setShowEdit(false);
  }

  async function toggleReaction(postId: string, reactionType: "like" | "save", active: boolean) {
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
            like_count: Math.max(0, (post.like_count ?? 0) + (active && !wasActive ? 1 : !active && wasActive ? -1 : 0)),
          };
        }

        const wasActive = Boolean(post.viewer_has_saved);
        return {
          ...post,
          viewer_has_saved: active,
          save_count: Math.max(0, (post.save_count ?? 0) + (active && !wasActive ? 1 : !active && wasActive ? -1 : 0)),
        };
      })
    );
  }

  function openSpot(post: SocialFeedPost) {
    if (!post.spot_id) return;
    void trackAnalyticsEvent({ eventName: "profile_spot_opened", screenName: "profile", entityType: "spot", entityId: post.spot_id, spotId: post.spot_id });
    router.push(`/spot/${post.spot_id}` as any);
  }

  function openComments(post: SocialFeedPost) {
    setSelectedCommentsPost(post);
  }

  function onCommentCreated(postId: string) {
    setPosts((current) =>
      current.map((post) =>
        post.post_id === postId
          ? { ...post, comment_count: Math.max(0, (post.comment_count ?? 0) + 1) }
          : post
      )
    );
  }

  if (!checkedAuth) {
    return (
      <View style={styles.center}>
        <Text style={styles.mutedText}>Profil wird geladen...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.mutedText}>Weiter zum Login...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.headerBackdrop, { height: headerHeight }]} pointerEvents="none">
        <Image source={{ uri: headerImage }} style={styles.headerImage} blurRadius={8} />
        <LinearGradient
          colors={["rgba(0,0,0,0.08)", "rgba(10,10,11,0.72)", "#0A0A0B"]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.topActions}>
          <Text style={styles.topActionsTitle}>Mein Backyrd</Text>

          <Pressable
            accessibilityLabel="Einstellungen öffnen"
            style={styles.circleButton}
            onPress={() => router.push("/settings")}
          >
            <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <Pressable onPress={pickImageAndUploadAvatar} style={styles.avatarRing}>
              <Image source={{ uri: avatarImage }} style={styles.avatar} />
            </Pressable>

            <View style={styles.identityBlock}>
              <Text style={styles.displayName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.handleText} numberOfLines={1}>
                {profileMeta}
              </Text>
            </View>
          </View>

          {!!profile?.bio && <Text style={styles.bioText}>{profile.bio}</Text>}

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{posts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{followersCount}</Text>
              <Text style={styles.statLabel}>Follower</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{followingCount}</Text>
              <Text style={styles.statLabel}>Folgt</Text>
            </View>
          </View>

          <View style={styles.profileChips}>
            {sinceLabel && (
              <View style={styles.softChip}>
                <Ionicons name="location-outline" size={15} color="#DADAE0" />
                <Text style={styles.softChipText}>{sinceLabel}</Text>
              </View>
            )}

            {profile?.instagram && (
              <View style={styles.softChip}>
                <Ionicons name="logo-instagram" size={15} color="#DADAE0" />
                <Text style={styles.softChipText}>@{profile.instagram}</Text>
              </View>
            )}

            {profile?.website && (
              <View style={styles.softChip}>
                <Ionicons name="globe-outline" size={15} color="#DADAE0" />
                <Text style={styles.softChipText}>{profile.website}</Text>
              </View>
            )}
          </View>

          {(interestChips.length > 0 || personalityChips.length > 0) && (
            <View style={styles.tasteChips}>
              {[...interestChips, ...personalityChips].slice(0, 6).map((chip) => (
                <View key={chip} style={styles.tasteChip}>
                  <Text style={styles.tasteChipText}>{chip}</Text>
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.editProfileButton} onPress={() => {
            void trackAnalyticsEvent({ eventName: "profile_edit_started", screenName: "profile" });
            setShowEdit(true);
          }}>
            <Ionicons name="pencil" size={18} color="#0A0A0B" />
            <Text style={styles.editProfileText}>Profil bearbeiten</Text>
          </Pressable>
        </View>

        <Pressable style={styles.historyButton} onPress={() => router.push("/profile/history" as any)}>
          <View style={styles.historyLeft}>
            <Ionicons name="time-outline" size={22} color="#FFFFFF" />
            <Text style={styles.historyText}>Decision History</Text>
          </View>
          <Ionicons name="chevron-forward" size={21} color="rgba(255,255,255,0.76)" />
        </Pressable>

        <View style={styles.safetySection}>
          <Text style={styles.safetySectionEyebrow}>SAFETY & SUPPORT</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Moderationsentscheidungen öffnen"
            onPress={() => router.push("/safety-center" as any)}
            style={({ pressed }) => [
              styles.safetyCenterButton,
              pressed ? styles.safetyCenterButtonPressed : null,
            ]}
          >
            <View style={styles.safetyCenterIcon}>
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color="#FF7DA7"
              />
            </View>

            <View style={styles.safetyCenterCopy}>
              <Text style={styles.safetyCenterTitle}>
                Moderationsentscheidungen
              </Text>
              <Text style={styles.safetyCenterSubtitle}>
                Maßnahmen prüfen und Entscheidungen anfechten
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={21}
              color="rgba(255,255,255,0.58)"
            />
          </Pressable>
        </View>

        <View style={styles.tabShell}>
          {[
            ["posts", "Beiträge"],
            ["favorites", "Favoriten"],
            ["badges", "Badges"],
          ].map(([key, label]) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setTab(key as ProfileTab)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Lade Profil...</Text>
          </View>
        ) : (
          <View style={styles.contentArea}>
            {tab === "posts" && (
              <>
                {posts.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="albums-outline" size={34} color="rgba(255,255,255,0.42)" />
                    <Text style={styles.emptyTitle}>Noch keine Moments</Text>
                    <Text style={styles.emptyText}>Deine Bewertungen und Posts erscheinen hier.</Text>
                  </View>
                ) : (
                  posts.map((post) => (
                    <SocialPostCard
                      key={post.post_id}
                      post={post}
                      currentUserId={user.id}
                      onToggleReaction={toggleReaction}
                      onOpenSpot={openSpot}
                      onOpenComments={openComments}
                    />
                  ))
                )}
              </>
            )}

            {tab === "favorites" && (
              <>
                {favorites.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="bookmark-outline" size={34} color="rgba(255,255,255,0.42)" />
                    <Text style={styles.emptyTitle}>Noch keine Favoriten</Text>
                    <Text style={styles.emptyText}>Gemerkte Spots landen hier.</Text>
                  </View>
                ) : (
                  favorites.map((item) => (
                    <Pressable
                      key={item.spot_id}
                      style={styles.favoriteCard}
                      onPress={() => {
                        void trackAnalyticsEvent({ eventName: "profile_favorite_spot_opened", screenName: "profile", entityType: "spot", entityId: item.spot_id, spotId: item.spot_id });
                        router.push(`/spot/${item.spot_id}` as any);
                      }}
                    >
                      <Image source={{ uri: getSpotPhoto(item) }} style={styles.favoriteImage} />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.88)"]}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.favoriteContent}>
                        <Text style={styles.favoriteTitle}>{item.spots?.name ?? "Spot"}</Text>
                        {!!item.spots?.city && <Text style={styles.favoriteMeta}>{item.spots.city}</Text>}
                      </View>
                    </Pressable>
                  ))
                )}
              </>
            )}

            {tab === "badges" && (
              <>
                {badges.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="trophy-outline" size={34} color="rgba(255,255,255,0.42)" />
                    <Text style={styles.emptyTitle}>Noch keine Badges</Text>
                    <Text style={styles.emptyText}>Badges erscheinen, wenn du Backyrd nutzt.</Text>
                  </View>
                ) : (
                  <View style={styles.badgeGrid}>
                    {badges.map((badge, index) => (
                      <View key={`${badge.achievements?.name ?? "badge"}-${index}`} style={styles.badgeCard}>
                        {!!badge.achievements?.icon_url ? (
                          <Image source={{ uri: badge.achievements.icon_url }} style={styles.badgeIcon} />
                        ) : (
                          <View style={styles.badgeFallback}>
                            <Ionicons name="trophy-outline" size={24} color="#FFFFFF" />
                          </View>
                        )}
                        <Text style={styles.badgeName}>{badge.achievements?.name ?? "Badge"}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            <Pressable
              onPress={async () => {
                await supabase.auth.signOut();
                router.replace("/gate" as any);
              }}
              style={styles.logoutButton}
            >
              <Ionicons name="log-out-outline" size={19} color="#FFFFFF" />
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </View>
        )}
      </Animated.ScrollView>

      {showEdit && (
        <BlurView intensity={85} tint="dark" style={styles.editOverlay}>
          <KeyboardAvoidingView
            style={styles.editKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.editSheet}>
              <View style={styles.sheetHandle} />

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editContent}>
                <Text style={styles.editTitle}>Profil bearbeiten</Text>

                <Pressable onPress={pickImageAndUploadAvatar} style={styles.editAvatarWrap}>
                  <Image source={{ uri: avatarImage }} style={styles.editAvatar} />
                  <View style={styles.editAvatarIcon}>
                    <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                  </View>
                </Pressable>

                <FieldLabel label="Basis" />
                <View style={styles.inputRow}>
                  <ProfileInput
                    value={profile?.first_name ?? ""}
                    onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), first_name: text }))}
                    placeholder="Vorname"
                    style={{ flex: 1 }}
                  />
                  <ProfileInput
                    value={profile?.last_name ?? ""}
                    onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), last_name: text }))}
                    placeholder="Nachname"
                    style={{ flex: 1 }}
                  />
                </View>

                <ProfileInput
                  value={profile?.username ?? ""}
                  onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), username: text }))}
                  placeholder="Username"
                  autoCapitalize="none"
                />

                <FieldLabel label="Ort & Bio" />
                <ProfileInput
                  value={profile?.city ?? ""}
                  onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), city: text }))}
                  placeholder="Stadt"
                />
                <ProfileInput
                  value={profile?.since_date ?? ""}
                  onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), since_date: text }))}
                  placeholder="Local since, z.B. 2012-07-01"
                />
                <ProfileInput
                  value={profile?.bio ?? ""}
                  onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), bio: text }))}
                  placeholder="Bio"
                  multiline
                  style={styles.bioInput}
                />

                <FieldLabel label="Taste" />
                <ProfileInput
                  value={profile?.interests ?? ""}
                  onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), interests: text }))}
                  placeholder="Interessen, kommagetrennt"
                />
                <ProfileInput
                  value={profile?.personality ?? ""}
                  onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), personality: text }))}
                  placeholder="Vibes, kommagetrennt"
                />

                <FieldLabel label="Social" />
                <ProfileInput
                  value={profile?.instagram ?? ""}
                  onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), instagram: text }))}
                  placeholder="Instagram ohne @"
                  autoCapitalize="none"
                />
                <ProfileInput
                  value={profile?.website ?? ""}
                  onChangeText={(text) => setProfile((prev) => ({ ...(prev as ProfileRow), website: text }))}
                  placeholder="Website"
                  autoCapitalize="none"
                />

                <Pressable style={styles.saveButton} onPress={saveProfile} disabled={saving}>
                  <Text style={styles.saveButtonText}>{saving ? "Speichern..." : "Speichern"}</Text>
                </Pressable>

                <Pressable style={styles.cancelButton} onPress={() => setShowEdit(false)}>
                  <Text style={styles.cancelText}>Abbrechen</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </BlurView>
      )}

      <CommentsSheet
        visible={Boolean(selectedCommentsPost)}
        post={selectedCommentsPost}
        onClose={() => setSelectedCommentsPost(null)}
        onCommentCreated={onCommentCreated}
      />
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function ProfileInput({
  style,
  ...props
}: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="#85858B"
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050507",
  },
  center: {
    flex: 1,
    backgroundColor: "#0A0A0B",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  mutedText: {
    color: "#8F8F98",
    fontSize: 15,
    fontWeight: "650",
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
  scrollContent: {
    paddingTop: 76,
    paddingHorizontal: 20,
    paddingBottom: 148,
  },
  topActions: {
    marginBottom: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topActionsTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
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
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    overflow: "hidden",
  },
  profileTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    padding: 3,
    backgroundColor: "#101016",
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 45,
    backgroundColor: "#181820",
  },
  identityBlock: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "850",
    letterSpacing: 0,
  },
  handleText: {
    marginTop: 5,
    color: "#8F8F98",
    fontSize: 16,
    fontWeight: "850",
  },
  bioText: {
    marginTop: 18,
    color: "#EDEDF2",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  statsRow: {
    marginTop: 22,
    flexDirection: "row",
    gap: 10,
  },
  statBox: {
    flex: 1,
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: "#14141B",
    borderWidth: 1,
    borderColor: "#292933",
    alignItems: "center",
    justifyContent: "center",
  },
  statNumber: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "780",
  },
  statLabel: {
    marginTop: 5,
    color: "#8F8F98",
    fontSize: 14,
    fontWeight: "650",
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
  tasteChips: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tasteChip: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.18)",
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  tasteChipText: {
    color: "#EAEAEE",
    fontSize: 13,
    fontWeight: "750",
  },
  editProfileButton: {
    marginTop: 20,
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: "#FF7DA7",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  editProfileText: {
    color: "#08080A",
    fontSize: 16,
    fontWeight: "950",
  },
  historyButton: {
    marginTop: 16,
    minHeight: 64,
    borderRadius: 26,
    backgroundColor: "#101016",
    borderWidth: 1,
    borderColor: "#292933",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  historyText: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "850",
  },
  safetySection: {
    marginTop: 22,
  },
  safetySectionEyebrow: {
    marginLeft: 4,
    marginBottom: 10,
    color: "#777780",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  safetyCenterButton: {
    minHeight: 82,
    borderRadius: 26,
    backgroundColor: "#101016",
    borderWidth: 1,
    borderColor: "#292933",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  safetyCenterButtonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.992 }],
  },
  safetyCenterIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,125,167,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.20)",
  },
  safetyCenterCopy: {
    flex: 1,
    minWidth: 0,
  },
  safetyCenterTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "850",
  },
  safetyCenterSubtitle: {
    marginTop: 4,
    color: "#8F8F98",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "650",
  },
  tabShell: {
    marginTop: 20,
    minHeight: 58,
    borderRadius: 29,
    backgroundColor: "#101016",
    borderWidth: 1,
    borderColor: "#292933",
    flexDirection: "row",
    padding: 5,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    color: "#8F8F98",
    fontSize: 15,
    fontWeight: "800",
  },
  tabTextActive: {
    color: "#0A0A0B",
  },
  contentArea: {
    paddingTop: 18,
  },
  emptyState: {
    minHeight: 190,
    borderRadius: 28,
    backgroundColor: "#101016",
    borderWidth: 1,
    borderColor: "#24242D",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  emptyTitle: {
    marginTop: 10,
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "850",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 7,
    color: "#8F8F98",
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    fontWeight: "600",
  },
  favoriteCard: {
    height: 230,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: "#101016",
    borderWidth: 1,
    borderColor: "#24242D",
  },
  favoriteImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    backgroundColor: "#181820",
  },
  favoriteContent: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
  },
  favoriteTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  favoriteMeta: {
    marginTop: 4,
    color: "#C4C4CA",
    fontSize: 15,
    fontWeight: "700",
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  badgeCard: {
    width: (width - 52) / 2,
    minHeight: 150,
    borderRadius: 26,
    backgroundColor: "#101016",
    borderWidth: 1,
    borderColor: "#24242D",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  badgeIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginBottom: 10,
  },
  badgeFallback: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginBottom: 10,
    backgroundColor: "#191920",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  logoutButton: {
    marginTop: 28,
    alignSelf: "center",
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: 18,
    backgroundColor: "#15151A",
    borderWidth: 1,
    borderColor: "#30303A",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  editOverlay: {
    position: "absolute",
    inset: 0,
  },
  editKeyboard: {
    flex: 1,
    justifyContent: "flex-end",
  },
  editSheet: {
    height: "91%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "rgba(14,14,18,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    marginBottom: 14,
  },
  editContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  editTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 18,
  },
  editAvatarWrap: {
    alignSelf: "center",
    marginBottom: 20,
  },
  editAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#191920",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  editAvatarIcon: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#202028",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    color: "#8F8F98",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#15151B",
    borderWidth: 1,
    borderColor: "#2B2B35",
    color: "#FFFFFF",
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "650",
    marginBottom: 10,
  },
  bioInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  saveButton: {
    marginTop: 12,
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#0A0A0B",
    fontSize: 17,
    fontWeight: "950",
  },
  cancelButton: {
    marginTop: 12,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: "#A0A0A8",
    fontSize: 16,
    fontWeight: "800",
  },
});
