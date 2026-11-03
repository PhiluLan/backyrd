// mobile/app/(tabs)/profile.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";

import { supabase } from "@/lib/supabase";
import { ensureProfile } from "@/lib/profile";
import SocialPostCard, { type SocialFeedPost } from "@/components/PostCard";
import CommentsSheet from "@/components/CommentsSheet";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { buildProfileSafetyText, registerSafetySnapshot } from "@/lib/safety-content";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { selectSpotImageUrl } from "@/lib/spot-images";
import Avatar from "@/components/Avatar";
import { StateView } from "@/components/foundation/StateView";
import { ProductText as Text, ProductTextInput as TextInput } from "@/components/foundation/AppText";
import { backyrdTheme as theme, useBackyrdTheme } from "@/theme/backyrd";
import type { User } from "@supabase/supabase-js";
import { isMissingAuthSession } from "../../../packages/shared/src/auth-errors";
import { isAccountUsername, profilePhotoObjectKey } from "../../../packages/shared/src/account-entry";
import { signOutWithPushCleanup } from "@/lib/signOut";

const { width } = Dimensions.get("window");

type ProfileTab = "posts" | "favorites" | "badges";

type ProfileRow = {
  id: string;
  display_name?: string | null;
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
  is_private?: boolean;
};

type FavoriteRow = {
  spot_id: string;
  spots?: {
    id?: string;
    name?: string | null;
    city?: string | null;
    header_photo_path?: string | null;
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

  if (visiblePostsResult.error || !Array.isArray(visiblePostsResult.data) ||
      visibleReviewsResult.error || !Array.isArray(visibleReviewsResult.data)) {
    throw new Error("safety_visibility_unavailable");
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

function formatSince(value?: string | null) {
  if (!value) return null;
  const year = String(value).slice(0, 4);
  return year && year !== "null" ? `Local seit ${year}` : null;
}

function profileName(profile: ProfileRow | null) {
  const full = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  return profile?.display_name?.trim() || full || profile?.username || "Backyrd-Mitglied";
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
  return selectSpotImageUrl({ headerPhotoPath: item.spots?.header_photo_path });
}


export default function ProfileScreen() {
  const { color } = useBackyrdTheme();
  const isLight = useColorScheme() === "light";
  const router = useRouter();

  const scrollY = useRef(new Animated.Value(0)).current;

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const profileRequest = useRef(0);
  const authReadVersion = useRef(0);
  const profileOwner = useRef<string | null>(null);
  const authIdentity = useRef<string | null>(null);
  const identityEpoch = useRef(0);
  const profileMounted = useRef(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [posts, setPosts] = useState<SocialFeedPost[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [badges, setBadges] = useState<BadgeRow[]>([]);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const [tab, setTab] = useState<ProfileTab>("posts");
  const profileSavePending = useRef(false);
  const avatarPending = useRef(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [draft, setDraft] = useState<ProfileRow | null>(null);
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
  const sinceLabel = useMemo(() => formatSince(profile?.since_date), [profile?.since_date]);
  const headerImage = profile?.header_photo_url || profile?.avatar_url || null;
  const avatarImage = profile?.avatar_url || null;

  const interestChips = useMemo(() => splitChips(profile?.interests).slice(0, 5), [profile?.interests]);
  const personalityChips = useMemo(() => splitChips(profile?.personality).slice(0, 4), [profile?.personality]);

  const loadForUser = useCallback(
    async (currentUser: User | null) => {
      const request = ++profileRequest.current;
      setProfileLoadFailed(false);
      if (profileOwner.current !== (currentUser?.id ?? null)) {
        profileOwner.current = currentUser?.id ?? null;
        setDraft(null); setShowEdit(false); setProfile(null);
        setPosts([]); setFavorites([]); setBadges([]); setFollowersCount(0); setFollowingCount(0);
      }
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
          supabase.rpc("get_social_feed_v2", {
            p_limit: 80,
            p_feed_mode: "for_you",
            p_city: null,
            p_cursor: null,
          }),

          supabase
            .from("favorites")
            .select("spot_id, spots(id, name, city, header_photo_path)")
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

        if (request !== profileRequest.current) return;
        if (profileRes.error || !profileRes.data) throw profileRes.error ?? new Error("profile_missing");
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
        if (request !== profileRequest.current) return;

        setPosts(visibleOwnPosts);

        setFavorites((favoritesRes.data ?? []) as FavoriteRow[]);
        setBadges((badgesRes.data ?? []) as BadgeRow[]);
        setFollowersCount(followerRes.count ?? 0);
        setFollowingCount(followingRes.count ?? 0);
      } catch {
        if (request === profileRequest.current) setProfileLoadFailed(true);
      } finally {
        if (request === profileRequest.current) setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    let active = true;
    profileMounted.current = true;

    const initialVersion = ++authReadVersion.current;
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (!active || initialVersion !== authReadVersion.current) return;
      if (error && !isMissingAuthSession(error)) throw error;
      authIdentity.current = data.user?.id ?? null;
      await loadForUser(data.user ?? null);
    }).catch(() => { if (active && initialVersion === authReadVersion.current) setProfileLoadFailed(true); })
      .finally(() => { if (active && initialVersion === authReadVersion.current) setCheckedAuth(true); });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextIdentity = session?.user.id ?? null;
      if (authIdentity.current !== nextIdentity) {
        identityEpoch.current += 1; profileRequest.current += 1;
        setCheckedAuth(false); setDraft(null); setShowEdit(false);
        profileSavePending.current = false; avatarPending.current = false;
        setSaving(false); setAvatarSaving(false);
      }
      authIdentity.current = nextIdentity;
      const version = ++authReadVersion.current;
      // Supabase dispatches auth events while holding its client lock. A
      // database request in this callback can deadlock every later request.
      setTimeout(() => {
        if (!active || version !== authReadVersion.current) return;
        void loadForUser(session?.user ?? null).then(() => {
          if (active && version === authReadVersion.current) setCheckedAuth(true);
        });
      }, 0);
    });

    return () => {
      active = false;
      profileMounted.current = false;
      listener?.subscription.unsubscribe();
    };
  }, [loadForUser]);

  async function pickImageAndUploadAvatar() {
    if (!user || avatarPending.current || profileSavePending.current) return;
    const actorId = user.id, epoch = identityEpoch.current;
    const stillCurrent = () => profileMounted.current && identityEpoch.current === epoch && authIdentity.current === actorId;
    avatarPending.current = true; setAvatarSaving(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.9, base64: true,
      });
      if (result.canceled || !stillCurrent()) return;
      const asset = result.assets[0];
      if (!asset?.base64) throw new Error("image_missing");
      const fileName = profilePhotoObjectKey(user.id, String(Date.now()));
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(fileName, decode(asset.base64), { contentType: asset.mimeType ?? "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      if (!stillCurrent()) return;
      const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(fileName);
      const url = urlData.publicUrl;
      const { data, error: updateError } = await supabase.from("profiles").update({ avatar_url: url, header_photo_url: url }).eq("id", user.id).select("id").single();
      if (updateError || data?.id !== user.id) throw updateError ?? new Error("avatar_save_not_confirmed");
      if (!stillCurrent()) return;
      setProfile((current) => ({ ...(current ?? { id: user.id }), avatar_url: url, header_photo_url: url }));
      setDraft((current) => current ? { ...current, avatar_url: url, header_photo_url: url } : current);
      await registerSafetySnapshot({
        entityType: "profile", entityId: user.id, contentType: "profile", actorUserId: user.id,
        textContent: buildProfileSafetyText(profile ?? {}), imageUrls: [url], sourceSurface: "profile_avatar_upload",
        sourceContext: { screen: "profile", media_role: "avatar_and_header" },
      });
      if (!stillCurrent()) return;
      Alert.alert("Profilfoto gespeichert", "Dein neues Profilfoto wurde übernommen.");
    } catch {
      if (!stillCurrent()) return;
      Alert.alert("Profilfoto nicht bestätigt", "Dein neues Profilfoto konnte nicht vollständig gespeichert werden. Bitte prüfe deine Verbindung und versuche es erneut.");
    } finally { if (stillCurrent()) { avatarPending.current = false; setAvatarSaving(false); } }
  }

  function closeProfileEditor() {
    if (profileSavePending.current || avatarPending.current) return;
    const discard = () => { setDraft(null); setShowEdit(false); };
    if (draft && profile && Object.keys(draft).some((key) => draft[key as keyof ProfileRow] !== { ...profile, display_name: profileName(profile) }[key as keyof ProfileRow])) {
      Alert.alert("Änderungen verwerfen?", "Deine Änderungen sind noch nicht gespeichert.", [
        { text: "Weiter bearbeiten", style: "cancel" }, { text: "Verwerfen", style: "destructive", onPress: discard },
      ]);
    } else discard();
  }

  async function saveProfile() {
    if (profileSavePending.current || avatarPending.current || !user || !draft) return;
    if (!draft.display_name?.trim() || draft.display_name.trim().length < 2 || draft.display_name.trim().length > 60) { Alert.alert("Öffentlicher Name fehlt", "Bitte gib einen öffentlichen Namen mit 2 bis 60 Zeichen ein."); return; }
    if (!isAccountUsername(draft.username ?? "")) { Alert.alert("Benutzername prüfen", "Verwende 3 bis 24 Zeichen: Buchstaben ohne Umlaute, Zahlen, Punkt oder Unterstrich."); return; }
    const actorId = user.id, epoch = identityEpoch.current;
    const stillCurrent = () => profileMounted.current && identityEpoch.current === epoch && authIdentity.current === actorId;
    profileSavePending.current = true; setSaving(true);
    void trackAnalyticsEvent({ eventName: "profile_update_started", screenName: "profile" });
    try {
      const { data, error } = await supabase.from("profiles")
      .update({
        display_name: draft.display_name.trim(),
        first_name: draft.first_name,
        last_name: draft.last_name,
        bio: draft.bio,
        city: draft.city,
        since_date: draft.since_date,
        username: draft.username?.trim().toLowerCase(),
        pronouns: draft.pronouns,
        country: draft.country,
        birthdate: draft.birthdate,
        instagram: draft.instagram,
        tiktok: draft.tiktok,
        website: draft.website,
        contact_email: draft.contact_email,
        interests: draft.interests,
        personality: draft.personality,
      })
      .eq("id", user.id).select("*").single();
      if (!stillCurrent()) return;
      if (error || !data || data.id !== user.id) {
        Alert.alert("Nicht gespeichert", error?.code === "23505" ? "Dieser Benutzername ist bereits vergeben." : "Dein Profil konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.");
        return;
      }
      const saved = data as ProfileRow;
      setProfile(saved);
      try {
        await registerSafetySnapshot({
          entityType: "profile", entityId: user.id, contentType: "profile", actorUserId: user.id,
          textContent: buildProfileSafetyText(saved),
          imageUrls: [saved.avatar_url, saved.header_photo_url].filter((value): value is string => Boolean(value)),
          sourceSurface: "profile_edit", sourceContext: { screen: "profile" },
        });
      } catch {
        // The canonical profile write already succeeded. Do not ask for a duplicate save.
        Alert.alert("Profil gespeichert", "Die Inhaltsprüfung konnte noch nicht bestätigt werden. Bitte versuche es später erneut.");
        return;
      }
      if (!stillCurrent()) return;
      setShowEdit(false); setDraft(null);
      Alert.alert("Profil gespeichert", "Deine Änderungen wurden übernommen.");
    } catch {
      if (!stillCurrent()) return;
      Alert.alert("Speichern nicht bestätigt", "Prüfe deine Verbindung. Deine Eingaben bleiben erhalten; du kannst es erneut versuchen.");
    } finally { if (stillCurrent()) { profileSavePending.current = false; setSaving(false); } }
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
        <StateView kind="loading" title="Profil wird geladen" />
      </View>
    );
  }

  if (profileLoadFailed) return <View style={styles.center}><StateView kind="error" title="Profil nicht geladen" message="Deine gespeicherten Angaben sind gerade nicht verfügbar." actionLabel="Erneut versuchen" onAction={() => {
    setCheckedAuth(false); setProfileLoadFailed(false);
    const version = authReadVersion.current;
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (version !== authReadVersion.current) return;
      if (error && !isMissingAuthSession(error)) throw error;
      await loadForUser(data.user ?? null);
    }).catch(() => { if (version === authReadVersion.current) setProfileLoadFailed(true); }).finally(() => { if (version === authReadVersion.current) setCheckedAuth(true); });
  }} /></View>;

  if (!user) {
    return (
      <View style={styles.center}>
        <StateView kind="loading" title="Anmeldung wird geöffnet" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.headerBackdrop, { height: headerHeight }]} pointerEvents="none">
        {headerImage ? <Image source={{ uri: headerImage }} style={styles.headerImage} blurRadius={12} /> : null}
        <LinearGradient
          colors={isLight ? ["rgba(247,247,245,0.74)", "rgba(247,247,245,0.95)", color.background] : headerImage ? ["rgba(5,5,5,0.22)", "rgba(5,5,5,0.72)", color.background] : ["#18131A", "#0D0B0E", color.background]}
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
          <Text style={styles.topActionsTitle}>Mein backyrd</Text>

          <Pressable
            accessibilityLabel="Einstellungen öffnen"
            style={styles.circleButton}
            onPress={() => router.push("/settings")}
          >
            <Ionicons accessibilityElementsHidden name="settings-outline" size={22} color={color.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <Pressable
              onPress={pickImageAndUploadAvatar}
              style={styles.avatarRing}
              accessibilityRole="button"
              accessibilityLabel="Profilbild bearbeiten"
            >
                <Avatar uri={avatarImage} name={displayName} size={90} />
            </Pressable>

            <View style={styles.identityBlock}>
              <Text style={styles.displayName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.handleText} numberOfLines={1}>
                {profile?.username ? `@${profile.username} · ` : ""}{profile?.city || "Basel"}
              </Text>
            </View>
          </View>

          {!!profile?.bio && <Text style={styles.bioText}>{profile.bio}</Text>}

          <Text style={styles.statsLine}>
            {posts.length} Momente · {followersCount} Follower · {followingCount} folgt
          </Text>

          <View style={styles.profileChips}>
            {sinceLabel && (
              <View style={styles.softChip}>
                <Ionicons accessibilityElementsHidden name="location-outline" size={15} color={color.textSecondary} />
                <Text style={styles.softChipText}>{sinceLabel}</Text>
              </View>
            )}

            {profile?.instagram && (
              <View style={styles.softChip}>
                <Ionicons accessibilityElementsHidden name="logo-instagram" size={15} color={color.textSecondary} />
                <Text style={styles.softChipText}>@{profile.instagram}</Text>
              </View>
            )}

            {profile?.website && (
              <View style={styles.softChip}>
                <Ionicons accessibilityElementsHidden name="globe-outline" size={15} color={color.textSecondary} />
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

          <Pressable accessibilityRole="button" accessibilityLabel="Profil bearbeiten" style={styles.editProfileButton} onPress={() => {
            void trackAnalyticsEvent({ eventName: "profile_edit_started", screenName: "profile" });
            setDraft(profile ? { ...profile, display_name: profileName(profile) } : null);
            setShowEdit(true);
          }}>
            <Ionicons accessibilityElementsHidden name="pencil" size={17} color={theme.color.textPrimary} />
            <Text style={styles.editProfileText}>Profil bearbeiten</Text>
          </Pressable>
        </View>

        <View style={styles.tabShell}>
          {[
            ["posts", "Momente"],
            ["favorites", "Gespeichert"],
            ["badges", "Erfolge"],
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
            <StateView kind="loading" title="Profil wird geladen" />
          </View>
        ) : (
          <View style={styles.contentArea}>
            {tab === "posts" && (
              <>
                {posts.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="albums-outline" size={34} color="rgba(255,255,255,0.42)" />
                    <Text style={styles.emptyTitle}>Noch keine Momente</Text>
                    <Text style={styles.emptyText}>Deine Momente erscheinen hier.</Text>
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
                    <Text style={styles.emptyText}>Hier findest du deine gespeicherten Orte.</Text>
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
                      <SpotArtwork imageUrl={getSpotPhoto(item)} spotId={item.spot_id} spotName={item.spots?.name ?? "Ort"} showFallbackName={false} style={styles.favoriteImage} />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.88)"]}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.favoriteContent}>
                        <Text style={styles.favoriteTitle}>{item.spots?.name ?? "Ort"}</Text>
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
                    <Text style={styles.emptyText}>Deine Erfolge erscheinen hier, wenn du backyrd nutzt.</Text>
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
              accessibilityRole="button"
              accessibilityLabel="Aus Backyrd ausloggen"
              onPress={() => {
                Alert.alert(
                  "Ausloggen?",
                  "Du kannst dich jederzeit wieder mit deinem Account anmelden.",
                  [
                    { text: "Abbrechen", style: "cancel" },
                    {
                      text: "Ausloggen",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await signOutWithPushCleanup();
                          router.replace("/gate" as any);
                        } catch {
                          Alert.alert("Ausloggen noch nicht möglich", "Dein Gerät konnte nicht sicher vom Push-Empfang getrennt werden. Prüfe deine Verbindung und versuche es nochmals.");
                        }
                      },
                    },
                  ],
                );
              }}
              style={styles.logoutButton}
            >
              <Ionicons accessibilityElementsHidden name="log-out-outline" size={19} color="#FFFFFF" />
              <Text style={styles.logoutText}>Ausloggen</Text>
            </Pressable>
          </View>
        )}
      </Animated.ScrollView>

      <Modal animationType="slide" presentationStyle="fullScreen" visible={showEdit} onRequestClose={closeProfileEditor}>
        <SafeAreaProvider>
        <SafeAreaView style={styles.editOverlay} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            style={styles.editKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.editSheet}>
              <View style={styles.editHeader}>
                <Text style={styles.editTitle}>Profil bearbeiten</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Profilbearbeitung schliessen" disabled={saving || avatarSaving} onPress={closeProfileEditor} style={styles.editClose}>
                  <Ionicons name="close" size={23} color={theme.color.textPrimary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editContent}>

                <Pressable onPress={pickImageAndUploadAvatar} disabled={saving || avatarSaving} style={styles.editAvatarWrap}>
                  <Avatar uri={avatarImage} name={displayName} size={110} />
                  <View style={styles.editAvatarIcon}>
                    <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                  </View>
                </Pressable>

                <Text accessibilityLiveRegion="polite" style={styles.fieldLabel}>{avatarSaving ? "Profilfoto wird gespeichert …" : "Ein neues Profilfoto wird sofort gespeichert."}</Text>
                <FieldLabel label="Öffentlicher Name" />
                <ProfileInput editable={!saving} accessibilityLabel="Öffentlicher Name" value={draft?.display_name ?? ""} maxLength={60} onChangeText={(text) => setDraft((current) => current ? { ...current, display_name: text } : current)} placeholder="Dein Name auf Backyrd" autoComplete="nickname" />
                <FieldLabel label="Kontodaten" />
                <View style={styles.inputRow}>
                  <ProfileInput
                    editable={!saving}
                    value={draft?.first_name ?? ""}
                    onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), first_name: text }))}
                    placeholder="Vorname"
                    style={{ flex: 1 }}
                  />
                  <ProfileInput
                    editable={!saving}
                    value={draft?.last_name ?? ""}
                    onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), last_name: text }))}
                    placeholder="Nachname"
                    style={{ flex: 1 }}
                  />
                </View>

                <ProfileInput
                  editable={!saving}
                  value={draft?.username ?? ""}
                  onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), username: text }))}
                  placeholder="Benutzername"
                  autoCapitalize="none"
                />

                <FieldLabel label="Ort & Bio" />
                <ProfileInput
                  editable={!saving}
                  value={draft?.city ?? ""}
                  onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), city: text }))}
                  placeholder="Stadt"
                />
                <ProfileInput
                  editable={!saving}
                  value={draft?.since_date ?? ""}
                  onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), since_date: text }))}
                  placeholder="Seit wann kennst du deine Stadt? (JJJJ-MM-TT)"
                />
                <ProfileInput
                  editable={!saving}
                  value={draft?.bio ?? ""}
                  onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), bio: text }))}
                  placeholder="Bio"
                  multiline
                  style={styles.bioInput}
                />

                <FieldLabel label="Vorlieben" />
                <ProfileInput
                  editable={!saving}
                  value={draft?.interests ?? ""}
                  onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), interests: text }))}
                  placeholder="Interessen, kommagetrennt"
                />
                <ProfileInput
                  editable={!saving}
                  value={draft?.personality ?? ""}
                  onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), personality: text }))}
                  placeholder="Stimmungen, kommagetrennt"
                />

                <FieldLabel label="Social" />
                <ProfileInput
                  editable={!saving}
                  value={draft?.instagram ?? ""}
                  onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), instagram: text }))}
                  placeholder="Instagram ohne @"
                  autoCapitalize="none"
                />
                <ProfileInput
                  editable={!saving}
                  value={draft?.website ?? ""}
                  onChangeText={(text) => setDraft((prev) => ({ ...(prev as ProfileRow), website: text }))}
                  placeholder="Website"
                  autoCapitalize="none"
                />

                <Pressable style={styles.saveButton} onPress={saveProfile} disabled={saving || avatarSaving}>
                  <Text style={styles.saveButtonText}>{saving ? "Speichern..." : "Speichern"}</Text>
                </Pressable>

                <Pressable style={styles.cancelButton} disabled={saving || avatarSaving} onPress={closeProfileEditor}>
                  <Text style={styles.cancelText}>Abbrechen</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <CommentsSheet
        visible={Boolean(selectedCommentsPost)}
        postId={selectedCommentsPost?.post_id ?? null}
        postTitle={selectedCommentsPost?.caption ?? null}
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
      placeholderTextColor={theme.color.textSecondary}
      style={[styles.input, style]}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  center: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  mutedText: {
    color: theme.color.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  headerBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    width,
    overflow: "hidden",
    opacity: 0.82,
  },
  headerImage: {
    width,
    height: "100%",
  },
  scrollContent: {
    paddingTop: 72,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 148,
  },
  topActions: {
    marginBottom: theme.spacing.xxl,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topActionsTitle: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
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
    borderColor: "rgba(255,79,145,0.55)",
    padding: 3,
    backgroundColor: theme.color.surface,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 45,
    backgroundColor: theme.color.surfaceElevated,
  },
  identityBlock: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    ...theme.typeScale.screenTitle,
  },
  handleText: {
    marginTop: 5,
    color: theme.color.textSecondary,
    fontFamily: theme.type.bodyMedium,
    fontSize: 16,
    fontWeight: "800",
  },
  bioText: {
    marginTop: 18,
    color: theme.color.textPrimary,
    fontFamily: theme.type.body,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  statsLine: {
    marginTop: 18,
    color: theme.color.textSecondary,
    fontFamily: theme.type.bodyMedium,
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
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  softChipText: {
    color: theme.color.textSecondary,
    fontFamily: theme.type.bodyMedium,
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
    borderColor: "rgba(169,194,255,0.28)",
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  tasteChipText: {
    color: theme.color.blue,
    fontFamily: theme.type.bodyMedium,
    fontSize: 13,
    fontWeight: "700",
  },
  editProfileButton: {
    marginTop: 20,
    alignSelf: "flex-start",
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,79,145,0.48)",
    backgroundColor: theme.color.surface,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  editProfileText: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 15,
    fontWeight: "800",
  },
  historyButton: {
    marginTop: 16,
    minHeight: 64,
    borderRadius: 26,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
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
    color: theme.color.textPrimary,
    fontSize: 19,
    fontWeight: "800",
  },
  safetySection: {
    marginTop: 22,
  },
  safetySectionEyebrow: {
    marginLeft: 4,
    marginBottom: 10,
    color: "#777780",
    fontSize: theme.typeScale.label.fontSize,
    lineHeight: theme.typeScale.label.lineHeight,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  safetyCenterButton: {
    minHeight: 82,
    borderRadius: 26,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
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
    color: theme.color.textPrimary,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  safetyCenterSubtitle: {
    marginTop: 4,
    color: theme.color.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  tabShell: {
    marginTop: theme.spacing.xxl,
    minHeight: 52,
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    flexDirection: "row",
  },
  tabButton: {
    flex: 1,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    borderBottomColor: theme.color.pink,
  },
  tabText: {
    color: theme.color.textSecondary,
    fontFamily: theme.type.bodyMedium,
    fontSize: 15,
    fontWeight: "800",
  },
  tabTextActive: {
    color: theme.color.pink,
  },
  contentArea: {
    paddingTop: 18,
  },
  emptyState: {
    minHeight: 190,
    borderRadius: 28,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  emptyTitle: {
    marginTop: 10,
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 7,
    color: theme.color.textSecondary,
    fontFamily: theme.type.body,
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
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  favoriteImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
    backgroundColor: theme.color.surfaceElevated,
  },
  favoriteContent: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
  },
  favoriteTitle: {
    color: "#FFFFFF",
    fontFamily: theme.type.display,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  favoriteMeta: {
    marginTop: 4,
    color: "#E7E7E9",
    fontFamily: theme.type.bodyMedium,
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
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
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
    backgroundColor: theme.color.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeName: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
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
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoutText: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 15,
    fontWeight: "800",
  },
  editOverlay: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  editKeyboard: {
    flex: 1,
    justifyContent: "flex-end",
  },
  editSheet: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingTop: 8,
  },
  editHeader: { minHeight: 60, paddingHorizontal: theme.layout.pageGutter, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.border },
  editClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  editContent: {
    paddingHorizontal: theme.layout.pageGutter,
    paddingTop: 24,
    paddingBottom: 40,
  },
  editTitle: {
    color: theme.color.textPrimary,
    fontFamily: theme.type.bodyBold,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "left",
  },
  editAvatarWrap: {
    alignSelf: "center",
    marginBottom: 20,
  },
  editAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: theme.color.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
  },
  editAvatarIcon: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    color: theme.color.textSecondary,
    fontFamily: theme.type.bodyBold,
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
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    color: theme.color.textPrimary,
    fontFamily: theme.type.body,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
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
    backgroundColor: theme.color.pink,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: theme.color.onAccent,
    fontFamily: theme.type.bodyBold,
    fontSize: 17,
    fontWeight: "900",
  },
  cancelButton: {
    marginTop: 12,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: theme.color.textSecondary,
    fontFamily: theme.type.bodyMedium,
    fontSize: 16,
    fontWeight: "800",
  },
});
