import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import type { SocialFeedPost } from "./PostCard";
import { AppText } from "./foundation/AppText";
import { HOME_RAIL, homeSecondaryCardWidth, HOME_SECONDARY_CARD_HEIGHT } from "../lib/home-rail";
import { HomeDisplayHeading } from "./HomeDisplayHeading";
import { useAuth } from "../hooks/useAuth";
import { loadVisibleSocialFeed } from "../lib/social-feed";
import { withRequestDeadline } from "../lib/requestDeadline";
import { presentMomentTags } from "../lib/moment-presentation";
import { backyrdTheme as theme, useBackyrdTheme } from "../theme/backyrd";

export function HomeMomentsSection({ city, revision, onInitialContentReady }: { city: string; revision: number; onInitialContentReady?: (city: string) => void }) {
  const { user } = useAuth();
  const actorId = user?.id;
  const { width, fontScale } = useWindowDimensions();
  const cardWidth = homeSecondaryCardWidth(width);
  const router = useRouter();
  const [state, setState] = useState<{ actor: string; city: string; revision: number; posts: SocialFeedPost[]; failed: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!actorId) { setState(null); return; }
    void withRequestDeadline(() => loadVisibleSocialFeed({ mode: "for_you", city, limit: 6 }), 8_000).then(posts => {
      if (active) setState({ actor: actorId, city, revision, posts: posts.filter(post => post.spot_id && post.spot_name), failed: false });
    }).catch(() => { if (active) setState({ actor: actorId, city, revision, posts: [], failed: true }); });
    return () => { active = false; };
  }, [city, revision, actorId]));
  const current = state && state.actor === actorId && state.city === city && state.revision === revision ? state : null;
  useEffect(() => {
    if (current) onInitialContentReady?.(city);
  }, [city, current, onInitialContentReady]);
  if (!actorId) return null;
  return <View style={styles.section}>
    <View style={styles.heading}>
      <HomeDisplayHeading title="Momente" accent="" />
    </View>
    {!current ? <AppText role="meta" tone="secondary" style={styles.state}>Momente werden geladen …</AppText> : current.posts.length ? <ScrollView horizontal contentContainerStyle={styles.rail} showsHorizontalScrollIndicator={false} decelerationRate={HOME_RAIL.decelerationRate} disableIntervalMomentum={HOME_RAIL.disableIntervalMomentum} snapToInterval={cardWidth + HOME_RAIL.gap}>
      {current.posts.map(post => <MomentPreview key={post.post_id} post={post} width={cardWidth} largeType={fontScale > 1.3} onOpen={() => router.push(`/spot/${post.spot_id}` as never)} />)}
    </ScrollView> : <AppText role="meta" tone="secondary" style={styles.state}>{current.failed ? "Die Momente laden gerade nicht. Im Moment-Bereich kannst du es erneut versuchen." : `Noch keine Momente aus ${city}. Dein nächstes Erlebnis könnte der Anfang sein.`}</AppText>}
  </View>;
}
function MomentPreview({ post, onOpen, width, largeType }: { post: SocialFeedPost; onOpen: () => void; width: number; largeType: boolean }) {
  const { color } = useBackyrdTheme();
  const [failed, setFailed] = useState(false);
  const photo = post.media?.[0]?.public_url;
  const moods = presentMomentTags(post.mood_tags).slice(0, 2);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Moment bei ${post.spot_name}. ${moods.join(", ")}. Ort entdecken`} onPress={onOpen} style={[styles.card, { width, minHeight: HOME_SECONDARY_CARD_HEIGHT, backgroundColor: color.surface }, !largeType && { height: HOME_SECONDARY_CARD_HEIGHT }]}>
    {photo && !failed ? <Image source={{ uri: photo }} onError={() => setFailed(true)} style={styles.photo} accessibilityLabel={`Moment bei ${post.spot_name}`} /> : <View style={[styles.textPreview, { borderLeftColor: color.pink }]}><AppText numberOfLines={largeType ? undefined : 3} role="body">{post.caption || moods.join(" · ") || "Ein Moment an diesem Ort"}</AppText></View>}
    <View style={styles.copy}><AppText numberOfLines={largeType ? undefined : 1} role="bodyStrong">{post.spot_name}</AppText>{moods.length ? <AppText numberOfLines={largeType ? undefined : 1} role="meta" tone="pink">{moods.join(" · ")}</AppText> : null}<AppText role="caption" tone="secondary">{post.spot_city} · Ort entdecken →</AppText></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  section: { marginTop: theme.spacing.xxl },
  heading: { paddingHorizontal: theme.layout.pageGutter },
  rail: { paddingTop: theme.spacing.lg, paddingHorizontal: theme.layout.pageGutter, gap: theme.spacing.md },
  card: { borderRadius: theme.radius.lg, backgroundColor: theme.color.surface, overflow: "hidden" },
  photo: { width: "100%", height: 142 },
  textPreview: { height: 142, padding: theme.spacing.lg, justifyContent: "center", borderLeftWidth: 3, borderLeftColor: theme.color.pink },
  copy: { flex: 1, padding: 12, gap: 4, justifyContent: "center" },
  state: { marginHorizontal: theme.layout.pageGutter, marginTop: theme.spacing.md },
});
