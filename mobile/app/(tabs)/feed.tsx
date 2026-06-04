// mobile/app/(tabs)/feed.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";

import CommentsSheet from "../../components/CommentsSheet";
import SocialPostCard, { SocialFeedPost } from "../../components/PostCard";
import { supabase } from "../../lib/supabase";

type FeedMode = "for_you" | "following";

type PickedMedia = {
  uri: string;
  width?: number;
  height?: number;
  type?: string;
  fileName?: string;
  mimeType?: string;
};

type SpotSuggestion = {
  id: string;
  name: string;
  city: string | null;
  category_name?: string | null;
};

const FEED_LIMIT = 30;

function errorMessage(err: any) {
  return err?.message || err?.details || err?.hint || "Unbekannter Fehler";
}

function normalizePosts(data: unknown): SocialFeedPost[] {
  return Array.isArray(data) ? (data as SocialFeedPost[]) : [];
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

async function uriToBlob(uri: string) {
  const response = await fetch(uri);
  return await response.blob();
}

function makeUploadPath(userId: string, index: number, uri: string) {
  const extFromUri = uri.split("?")[0]?.split(".").pop()?.toLowerCase();
  const safeExt = extFromUri && extFromUri.length <= 5 ? extFromUri : "jpg";
  return `${userId}/${Date.now()}-${index}.${safeExt}`;
}

export default function FeedScreen() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<FeedMode>("for_you");

  const [forYouPosts, setForYouPosts] = useState<SocialFeedPost[]>([]);
  const [followingPosts, setFollowingPosts] = useState<SocialFeedPost[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [commentsPost, setCommentsPost] = useState<SocialFeedPost | null>(null);

  const [composerVisible, setComposerVisible] = useState(false);
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [creating, setCreating] = useState(false);

  const [spotQuery, setSpotQuery] = useState("");
  const [spotSuggestions, setSpotSuggestions] = useState<SpotSuggestion[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<SpotSuggestion | null>(null);
  const [spotSearching, setSpotSearching] = useState(false);

  const posts = mode === "for_you" ? forYouPosts : followingPosts;

  const hasDraft = useMemo(() => {
    return caption.trim().length > 0 || media.length > 0 || Boolean(selectedSpot);
  }, [caption, media.length, selectedSpot]);

  const updatePostsForMode = useCallback((feedMode: FeedMode, updater: (posts: SocialFeedPost[]) => SocialFeedPost[]) => {
    if (feedMode === "for_you") {
      setForYouPosts((current) => updater(current));
    } else {
      setFollowingPosts((current) => updater(current));
    }
  }, []);

  const patchAllVisiblePostsByAuthor = useCallback((authorId: string, following: boolean) => {
    const patch = (items: SocialFeedPost[]) =>
      items.map((post) =>
        post.user_id === authorId
          ? {
              ...post,
              viewer_follows_author: following,
            }
          : post
      );

    setForYouPosts(patch);
    setFollowingPosts((current) =>
      following
        ? patch(current)
        : current.filter((post) => post.user_id !== authorId || post.user_id === currentUserId)
    );
  }, [currentUserId]);

  const loadFeed = useCallback(
    async (feedMode: FeedMode, options?: { refresh?: boolean; silent?: boolean }) => {
      const isRefresh = Boolean(options?.refresh);
      const silent = Boolean(options?.silent);

      try {
        if (!silent && !isRefresh) setLoading(true);
        if (isRefresh) setRefreshing(true);

        const { data: userData } = await supabase.auth.getUser();
        setCurrentUserId(userData.user?.id ?? null);

        const { data, error } = await supabase.rpc("get_social_feed_v1", {
          p_limit: FEED_LIMIT,
          p_cursor: null,
          p_city: null,
          p_feed_mode: feedMode,
        });

        if (error) throw error;

        updatePostsForMode(feedMode, () => uniquePosts(normalizePosts(data)));
      } catch (error: any) {
        console.log("get_social_feed_v1 failed:", error);
        Alert.alert("Moments konnten nicht geladen werden", errorMessage(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [updatePostsForMode]
  );

  useEffect(() => {
    loadFeed(mode);
  }, [loadFeed, mode]);

  useEffect(() => {
    const otherMode: FeedMode = mode === "for_you" ? "following" : "for_you";
    loadFeed(otherMode, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCurrent = useCallback(() => {
    loadFeed(mode, { refresh: true });
  }, [loadFeed, mode]);

  const switchMode = useCallback(
    (nextMode: FeedMode) => {
      if (nextMode === mode) return;
      setMode(nextMode);
    },
    [mode]
  );

  const toggleReaction = useCallback(async (postId: string, reactionType: "like" | "save", active: boolean) => {
    const { error } = await supabase.rpc("react_to_social_post_v1", {
      p_post_id: postId,
      p_reaction_type: reactionType,
      p_active: active,
    });

    if (error) throw error;
  }, []);

  const openSpot = useCallback(
    (post: SocialFeedPost) => {
      if (!post.spot_id) return;
      router.push(`/spot/${post.spot_id}` as any);
    },
    [router]
  );

  const openComments = useCallback((post: SocialFeedPost) => {
    setCommentsPost(post);
  }, []);

  const handleCommentCreated = useCallback((postId: string) => {
    const patch = (items: SocialFeedPost[]) =>
      items.map((post) =>
        post.post_id === postId
          ? {
              ...post,
              comment_count: (post.comment_count ?? 0) + 1,
            }
          : post
      );

    setForYouPosts(patch);
    setFollowingPosts(patch);
  }, []);

  const sharePost = useCallback(async (post: SocialFeedPost) => {
    try {
      await Share.share({
        message: post.spot_name
          ? `${post.display_name ?? "Backyrd"} bei ${post.spot_name}: ${post.caption ?? ""}`
          : `${post.display_name ?? "Backyrd"}: ${post.caption ?? ""}`,
      });
    } catch {
      // ignored
    }
  }, []);

  const searchSpots = useCallback(async (query: string) => {
    const text = query.trim();
    setSpotQuery(query);

    if (text.length < 2) {
      setSpotSuggestions([]);
      return;
    }

    try {
      setSpotSearching(true);

      const { data, error } = await supabase
        .from("spots")
        .select("id,name,city,categories(name)")
        .or(`name.ilike.%${text}%,city.ilike.%${text}%`)
        .limit(8);

      if (error) throw error;

      const mapped = (Array.isArray(data) ? data : []).map((row: any) => ({
        id: row.id,
        name: row.name,
        city: row.city ?? null,
        category_name: row.categories?.name ?? null,
      }));

      setSpotSuggestions(mapped);
    } catch (error) {
      console.log("spot search failed:", error);
      setSpotSuggestions([]);
    } finally {
      setSpotSearching(false);
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Fotos erlauben", "Bitte erlaube den Zugriff auf deine Fotos, um einen Backyrd Moment zu posten.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      selectionLimit: 4,
    });

    if (result.canceled) return;

    const assets = result.assets ?? [];
    setMedia((current) =>
      [...current, ...assets.map((asset) => ({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        type: asset.type,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? "image/jpeg",
      }))].slice(0, 4)
    );
  }, []);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Kamera erlauben", "Bitte erlaube den Kamera-Zugriff, um ein Foto aufzunehmen.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset) return;

    setMedia((current) =>
      [...current, {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        type: asset.type,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? "image/jpeg",
      }].slice(0, 4)
    );
  }, []);

  const resetComposer = useCallback(() => {
    setCaption("");
    setMedia([]);
    setSelectedSpot(null);
    setSpotQuery("");
    setSpotSuggestions([]);
  }, []);

  const closeComposer = useCallback(() => {
    if (creating) return;

    if (!hasDraft) {
      setComposerVisible(false);
      return;
    }

    Alert.alert("Entwurf verwerfen?", "Dein aktueller Moment wird nicht gespeichert.", [
      { text: "Weiter bearbeiten", style: "cancel" },
      {
        text: "Verwerfen",
        style: "destructive",
        onPress: () => {
          resetComposer();
          setComposerVisible(false);
        },
      },
    ]);
  }, [creating, hasDraft, resetComposer]);

  const createPost = useCallback(async () => {
    const trimmedCaption = caption.trim();

    if (!trimmedCaption && media.length === 0) {
      Alert.alert("Noch leer", "Schreib etwas oder füge ein Foto hinzu.");
      return;
    }

    try {
      setCreating(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const userId = userData.user?.id;
      if (!userId) throw new Error("Du bist nicht eingeloggt.");

      const uploadedMedia = [];

      for (let index = 0; index < media.length; index += 1) {
        const item = media[index];
        const path = makeUploadPath(userId, index, item.uri);
        const blob = await uriToBlob(item.uri);

        const { error: uploadError } = await supabase.storage
          .from("social-post-media")
          .upload(path, blob, {
            contentType: item.mimeType ?? "image/jpeg",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("social-post-media")
          .getPublicUrl(path);

        uploadedMedia.push({
          storage_path: path,
          public_url: publicUrlData.publicUrl,
          media_type: "image",
          width: item.width ?? null,
          height: item.height ?? null,
          sort_order: index,
        });
      }

      const { error } = await supabase.rpc("create_social_post_v1", {
        p_spot_id: selectedSpot?.id ?? null,
        p_caption: trimmedCaption || null,
        p_visibility: "public",
        p_mood_tags: [],
        p_occasion_tags: [],
        p_media: uploadedMedia,
      });

      if (error) throw error;

      resetComposer();
      setComposerVisible(false);

      await Promise.all([
        loadFeed("for_you", { silent: true }),
        loadFeed("following", { silent: true }),
      ]);
      setMode("for_you");
    } catch (error: any) {
      console.log("create_social_post_v1 failed:", error);
      Alert.alert("Moment konnte nicht erstellt werden", errorMessage(error));
    } finally {
      setCreating(false);
    }
  }, [caption, loadFeed, media, resetComposer, selectedSpot?.id]);

  const renderHeader = (
    <View style={styles.headerWrap}>
      <View style={styles.topRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>Backyrd Pulse</Text>
          <Text style={styles.title}>Moments</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            Bewertungen, Tipps und Orte aus deinem Backyrd.
          </Text>
        </View>

        <Pressable style={styles.createButton} onPress={() => setComposerVisible(true)}>
          <Ionicons name="add" size={30} color="#050506" />
        </Pressable>
      </View>

      <View style={styles.modeShell}>
        <Pressable
          style={[styles.modeButton, mode === "for_you" && styles.modeButtonActive]}
          onPress={() => switchMode("for_you")}
        >
          <Text style={[styles.modeText, mode === "for_you" && styles.modeTextActive]}>Für dich</Text>
        </Pressable>

        <Pressable
          style={[styles.modeButton, mode === "following" && styles.modeButtonActive]}
          onPress={() => switchMode("following")}
        >
          <Text style={[styles.modeText, mode === "following" && styles.modeTextActive]}>Folge ich</Text>
        </Pressable>
      </View>
    </View>
  );

  const emptyState = (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name={mode === "following" ? "people-outline" : "sparkles-outline"}
          size={34}
          color="#FFFFFF"
        />
      </View>

      <Text style={styles.emptyTitle}>
        {mode === "following" ? "Noch nichts aus deinem Kreis" : "Noch keine Moments"}
      </Text>

      <Text style={styles.emptyText}>
        {mode === "following"
          ? "Folge Leuten mit gutem Geschmack. Danach erscheinen hier ihre Bewertungen und Backyrd-Moments."
          : "Bewerte einen Spot oder teile einen Moment. Daraus entsteht dein persönlicher Stadt-Feed."}
      </Text>

      {mode === "following" ? (
        <Pressable style={styles.emptyButton} onPress={() => setMode("for_you")}>
          <Text style={styles.emptyButtonText}>Leute entdecken</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.emptyButton} onPress={() => setComposerVisible(true)}>
          <Text style={styles.emptyButtonText}>Moment teilen</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      {loading && posts.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.loadingText}>Moments laden…</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.post_id}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={emptyState}
          renderItem={({ item }) => (
            <SocialPostCard
              post={item}
              currentUserId={currentUserId}
              onToggleReaction={toggleReaction}
              onOpenSpot={openSpot}
              onOpenComments={openComments}
              onShare={sharePost}
              onFollowChanged={(authorId, following) => {
                patchAllVisiblePostsByAuthor(authorId, following);

                if (mode === "following") {
                  loadFeed("following", { silent: true });
                }
              }}
            />
          )}
          contentContainerStyle={styles.feedContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              tintColor="#FFFFFF"
              refreshing={refreshing}
              onRefresh={refreshCurrent}
            />
          }
        />
      )}

      <CommentsSheet
        visible={Boolean(commentsPost)}
        postId={commentsPost?.post_id ?? null}
        postTitle={commentsPost?.spot_name ?? commentsPost?.display_name ?? "Backyrd Moment"}
        onClose={() => setCommentsPost(null)}
        onCommentCreated={handleCommentCreated}
      />

      <Modal visible={composerVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeComposer}>
        <SafeAreaView style={styles.composerScreen}>
          <KeyboardAvoidingView
            style={styles.composerKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.composerHeader}>
              <Pressable style={styles.composerClose} onPress={closeComposer}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>

              <Text style={styles.composerTitle}>Moment teilen</Text>

              <Pressable
                style={[styles.composerPostButton, creating && styles.composerPostButtonDisabled]}
                onPress={createPost}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#050506" />
                ) : (
                  <Text style={styles.composerPostText}>Teilen</Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              style={styles.composerScroll}
              contentContainerStyle={styles.composerContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.composerIntro}>
                <Text style={styles.composerIntroKicker}>Backyrd Moment</Text>
                <Text style={styles.composerIntroTitle}>Was soll dein Kreis wissen?</Text>
                <Text style={styles.composerIntroText}>
                  Für echte Bewertungen nutzt du am besten den Review-Flow. Hier kannst du freie Moments teilen.
                </Text>
              </View>

              <View style={styles.composerCard}>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Was ist der Moment?"
                  placeholderTextColor="#77777F"
                  multiline
                  maxLength={500}
                  style={styles.captionInput}
                />

                {media.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
                    {media.map((item, index) => (
                      <View key={`${item.uri}-${index}`} style={styles.mediaPreviewWrap}>
                        <Image source={{ uri: item.uri }} style={styles.mediaPreview} />
                        <Pressable
                          style={styles.removeMedia}
                          onPress={() => setMedia((current) => current.filter((_, i) => i !== index))}
                        >
                          <Ionicons name="close" size={16} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}

                <View style={styles.composerActions}>
                  <Pressable style={styles.composerActionButton} onPress={takePhoto}>
                    <Ionicons name="camera-outline" size={21} color="#FFFFFF" />
                    <Text style={styles.composerActionText}>Foto</Text>
                  </Pressable>

                  <Pressable style={styles.composerActionButton} onPress={pickFromLibrary}>
                    <Ionicons name="images-outline" size={21} color="#FFFFFF" />
                    <Text style={styles.composerActionText}>Galerie</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.spotCard}>
                <View style={styles.spotCardHeader}>
                  <View>
                    <Text style={styles.spotCardKicker}>Spot</Text>
                    <Text style={styles.spotCardTitle}>
                      {selectedSpot ? selectedSpot.name : "Optional verknüpfen"}
                    </Text>
                  </View>

                  {selectedSpot && (
                    <Pressable
                      style={styles.clearSpotButton}
                      onPress={() => {
                        setSelectedSpot(null);
                        setSpotQuery("");
                      }}
                    >
                      <Ionicons name="close" size={18} color="#FFFFFF" />
                    </Pressable>
                  )}
                </View>

                <TextInput
                  value={spotQuery}
                  onChangeText={searchSpots}
                  placeholder="Spot suchen…"
                  placeholderTextColor="#77777F"
                  style={styles.spotSearchInput}
                />

                {spotSearching && <ActivityIndicator color="#FFFFFF" style={{ marginTop: 12 }} />}

                {spotSuggestions.length > 0 && (
                  <View style={styles.spotSuggestions}>
                    {spotSuggestions.map((spot) => (
                      <Pressable
                        key={spot.id}
                        style={styles.spotSuggestion}
                        onPress={() => {
                          setSelectedSpot(spot);
                          setSpotQuery(spot.name);
                          setSpotSuggestions([]);
                        }}
                      >
                        <View style={styles.spotSuggestionIcon}>
                          <Ionicons name="location" size={15} color="#050506" />
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.spotSuggestionName} numberOfLines={1}>
                            {spot.name}
                          </Text>
                          <Text style={styles.spotSuggestionMeta} numberOfLines={1}>
                            {[spot.category_name, spot.city].filter(Boolean).join(" · ")}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050506",
  },
  feedContent: {
    paddingHorizontal: 14,
    paddingBottom: 120,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#8E8E95",
    fontSize: 15,
    fontWeight: "800",
  },
  headerWrap: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  topRow: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  kicker: {
    color: "#8E8E95",
    fontSize: 12,
    fontWeight: "950",
    letterSpacing: 1.25,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 42,
    lineHeight: 46,
    fontWeight: "950",
    letterSpacing: -1.5,
  },
  subtitle: {
    marginTop: 8,
    color: "#85858B",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    maxWidth: 270,
  },
  createButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modeShell: {
    marginTop: 16,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#101014",
    borderWidth: 1,
    borderColor: "#282832",
    padding: 5,
    flexDirection: "row",
  },
  modeButton: {
    flex: 1,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  modeText: {
    color: "#8E8E95",
    fontSize: 15,
    fontWeight: "950",
  },
  modeTextActive: {
    color: "#050506",
  },
  emptyCard: {
    minHeight: 380,
    borderRadius: 34,
    backgroundColor: "#101014",
    borderWidth: 1,
    borderColor: "#24242B",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#17171C",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "950",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  emptyText: {
    marginTop: 10,
    color: "#8E8E95",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "650",
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 22,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyButtonText: {
    color: "#050506",
    fontSize: 15,
    fontWeight: "950",
  },
  composerScreen: {
    flex: 1,
    backgroundColor: "#050506",
  },
  composerKeyboard: {
    flex: 1,
  },
  composerHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#24242B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  composerClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#15151A",
    alignItems: "center",
    justifyContent: "center",
  },
  composerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "950",
  },
  composerPostButton: {
    minWidth: 82,
    height: 44,
    paddingHorizontal: 17,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  composerPostButtonDisabled: {
    opacity: 0.55,
  },
  composerPostText: {
    color: "#050506",
    fontSize: 15,
    fontWeight: "950",
  },
  composerScroll: {
    flex: 1,
  },
  composerContent: {
    padding: 14,
    paddingBottom: 120,
    gap: 14,
  },
  composerIntro: {
    borderRadius: 30,
    backgroundColor: "#101014",
    borderWidth: 1,
    borderColor: "#24242B",
    padding: 16,
  },
  composerIntroKicker: {
    color: "#8E8E95",
    fontSize: 11,
    fontWeight: "950",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  composerIntroTitle: {
    marginTop: 5,
    color: "#FFFFFF",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "950",
    letterSpacing: -0.6,
  },
  composerIntroText: {
    marginTop: 8,
    color: "#8E8E95",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "650",
  },
  composerCard: {
    borderRadius: 30,
    backgroundColor: "#101014",
    borderWidth: 1,
    borderColor: "#24242B",
    padding: 14,
  },
  captionInput: {
    minHeight: 132,
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "650",
    textAlignVertical: "top",
  },
  mediaRow: {
    gap: 10,
    paddingTop: 14,
  },
  mediaPreviewWrap: {
    width: 120,
    height: 160,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#17171C",
  },
  mediaPreview: {
    width: "100%",
    height: "100%",
  },
  removeMedia: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  composerActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  composerActionButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#17171C",
    borderWidth: 1,
    borderColor: "#2B2B31",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  composerActionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  spotCard: {
    borderRadius: 30,
    backgroundColor: "#101014",
    borderWidth: 1,
    borderColor: "#24242B",
    padding: 14,
  },
  spotCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  spotCardKicker: {
    color: "#8E8E95",
    fontSize: 11,
    fontWeight: "950",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  spotCardTitle: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "950",
    letterSpacing: -0.5,
  },
  clearSpotButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#17171C",
    alignItems: "center",
    justifyContent: "center",
  },
  spotSearchInput: {
    marginTop: 14,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#17171C",
    borderWidth: 1,
    borderColor: "#2B2B31",
    color: "#FFFFFF",
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "700",
  },
  spotSuggestions: {
    marginTop: 10,
    gap: 8,
  },
  spotSuggestion: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: "#15151A",
    borderWidth: 1,
    borderColor: "#2B2B31",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  spotSuggestionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  spotSuggestionName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "950",
  },
  spotSuggestionMeta: {
    marginTop: 2,
    color: "#8E8E95",
    fontSize: 12,
    fontWeight: "750",
  },
});
