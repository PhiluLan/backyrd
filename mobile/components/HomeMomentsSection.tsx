import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import type { SocialFeedPost } from "./PostCard";
import { AppText } from "./foundation/AppText";
import { HOME_RAIL, homeRailCardWidth } from "../lib/home-rail";
import { HomeDisplayHeading } from "./HomeDisplayHeading";
import { useAuth } from "../hooks/useAuth";
import { loadVisibleSocialFeed } from "../lib/social-feed";
import { withRequestDeadline } from "../lib/requestDeadline";
import { formatMomentTime, homeMomentPreview } from "../lib/moment-presentation";
import { backyrdTheme as theme, useBackyrdTheme } from "../theme/backyrd";

type Preview = NonNullable<ReturnType<typeof homeMomentPreview>>;

export function HomeMomentsSection({ city, revision, onInitialContentReady }: { city: string; revision: number; onInitialContentReady?: (city: string) => void }) {
  const { user } = useAuth();
  const actorId = user?.id;
  const { width, fontScale } = useWindowDimensions();
  const cardWidth = homeRailCardWidth(width, { minimum: 248, maximum: 328 });
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<ReadonlySet<string>>(() => new Set());
  const [state, setState] = useState<{ actor: string; city: string; revision: number; retry: number; posts: SocialFeedPost[]; failed: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!actorId) { setState(null); return; }
    setState(null);
    setFailedPhotos(new Set());
    void withRequestDeadline(() => loadVisibleSocialFeed({ mode: "for_you", city, limit: 18 }), 8_000).then(posts => {
      if (active) setState({ actor: actorId, city, revision, retry, posts: posts.filter(post => post.spot_id && post.spot_name), failed: false });
    }).catch(() => { if (active) setState({ actor: actorId, city, revision, retry, posts: [], failed: true }); });
    return () => { active = false; };
  }, [city, revision, actorId, retry]));
  const current = state && state.actor === actorId && state.city === city && state.revision === revision && state.retry === retry ? state : null;
  useEffect(() => {
    if (current) onInitialContentReady?.(city);
  }, [city, current, onInitialContentReady]);
  const previews = (current?.posts ?? []).flatMap(post => {
    const preview = homeMomentPreview(post, failedPhotos);
    return preview ? [{ post, preview }] : [];
  }).slice(0, 4);
  if (!actorId || (current && !current.failed && !previews.length)) return null;
  return <View style={styles.section}>
    <View style={styles.heading}>
      <HomeDisplayHeading title="Hier erlebt" accent="" />
      <AppText role="meta" tone="secondary" style={styles.subtitle}>Persönliche Momente aus {city}</AppText>
    </View>
    {!current ? <AppText role="meta" tone="secondary" style={styles.state}>Momente werden geladen …</AppText> : current.failed ? <Pressable accessibilityRole="button" accessibilityLabel="Momente erneut laden" onPress={() => setRetry(value => value + 1)} style={styles.state}><AppText role="meta" tone="secondary">Momente gerade nicht verfügbar.</AppText><AppText role="meta" tone="pink">Erneut versuchen</AppText></Pressable> : <ScrollView horizontal contentContainerStyle={styles.rail} showsHorizontalScrollIndicator={false} decelerationRate={HOME_RAIL.decelerationRate} disableIntervalMomentum={HOME_RAIL.disableIntervalMomentum} snapToInterval={cardWidth + HOME_RAIL.gap}>
      {previews.map(({ post, preview }) => <MomentPreview key={post.post_id} post={post} preview={preview} width={cardWidth} largeType={fontScale > 1.3}
        onImageError={() => { if (preview.imageUrl) setFailedPhotos(previous => new Set(previous).add(preview.imageUrl!)); }}
        onOpen={() => router.push(`/moment/${post.post_id}` as never)} />)}
    </ScrollView>}
  </View>;
}
function MomentPreview({ post, preview, onOpen, onImageError, width, largeType }: { post: SocialFeedPost; preview: Preview; onOpen: () => void; onImageError: () => void; width: number; largeType: boolean }) {
  const { color } = useBackyrdTheme();
  const { imageUrl, caption, moods } = preview;
  const author = post.display_name?.trim() || post.username?.trim() || "Mitglied";
  const date = Number.isFinite(Date.parse(post.created_at)) ? formatMomentTime(post.created_at) : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Moment von ${author} bei ${post.spot_name}${date ? `. ${date}` : ""}. ${caption ?? moods.join(", ")}. Moment öffnen`} onPress={onOpen} style={[styles.card, { width, backgroundColor: color.surface }]}>
    {imageUrl ? <View style={styles.photoWrap}>
      <Image source={{ uri: imageUrl }} onError={onImageError} style={styles.photo} accessibilityLabel={`Persönliches Foto bei ${post.spot_name}`} />
      <LinearGradient pointerEvents="none" colors={["transparent", "rgba(0,0,0,0.72)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.placeOverlay}><Ionicons name="location-outline" size={15} color="#FFFFFF" /><AppText role="meta" numberOfLines={largeType ? undefined : 2} style={styles.placeName}>{post.spot_name}</AppText></View>
    </View> : <View style={styles.textMoment}>
      <AppText accessible={false} role="screenTitle" tone="pink" style={styles.quoteMark}>„</AppText>
      <AppText role="body" numberOfLines={largeType ? undefined : 5} style={styles.quote}>{caption}</AppText>
      <AppText role="meta" tone="secondary">Bei {post.spot_name}</AppText>
    </View>}
    <View style={styles.copy}>
      {imageUrl && caption ? <AppText role="body" numberOfLines={largeType ? undefined : 3} style={styles.caption}>{caption}</AppText> : null}
      {moods.length ? <AppText role="meta" tone="pink" style={styles.moods}>{moods.join(" · ")}</AppText> : null}
      <View style={styles.footer}><View style={styles.attribution}><AppText role="caption" tone="secondary">{author}</AppText>{date ? <AppText role="caption" tone="secondary">{date}</AppText> : null}</View><Ionicons name="arrow-forward" size={18} color={color.textSecondary} /></View>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  section: { marginTop: theme.spacing.xxl },
  heading: { paddingHorizontal: theme.layout.pageGutter },
  subtitle: { marginTop: 8 },
  rail: { paddingTop: 20, paddingHorizontal: HOME_RAIL.horizontalInset, gap: HOME_RAIL.gap, alignItems: "flex-start" },
  card: { borderRadius: theme.radius.lg, overflow: "hidden" },
  photoWrap: { position: "relative" },
  photo: { width: "100%", aspectRatio: 4 / 3 },
  placeOverlay: { position: "absolute", bottom: 16, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 6 },
  placeName: { flex: 1, color: "#FFFFFF" },
  textMoment: { padding: 20, gap: 12 },
  quoteMark: { fontSize: 44, lineHeight: 40 },
  quote: { fontSize: 21, lineHeight: 31 },
  copy: { padding: 18, gap: 14 },
  caption: { fontSize: 16, lineHeight: 25 },
  moods: { fontSize: 13, lineHeight: 20 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  attribution: { flex: 1, gap: 3 },
  state: { marginHorizontal: theme.layout.pageGutter, marginTop: theme.spacing.md, paddingVertical: 8, gap: 8 },
});
