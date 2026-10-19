import React, { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import type { SocialFeedPost } from "./PostCard";
import { AppText } from "./foundation/AppText";
import { useAuth } from "../hooks/useAuth";
import { loadVisibleSocialFeed } from "../lib/social-feed";
import { withRequestDeadline } from "../lib/requestDeadline";
import { presentMomentTags } from "../lib/moment-presentation";
import { backyrdTheme as theme } from "../theme/backyrd";

export function HomeMomentsSection({ city, revision }: { city: string; revision: number }) {
  const { user } = useAuth();
  const actorId = user?.id;
  const router = useRouter();
  const [state, setState] = useState<{ actor: string; city: string; revision: number; posts: SocialFeedPost[]; failed: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!actorId) { setState(null); return; }
    setState(null);
    void withRequestDeadline(() => loadVisibleSocialFeed({ mode: "for_you", city, limit: 6 }), 8_000).then(posts => {
      if (active) setState({ actor: actorId, city, revision, posts: posts.filter(post => post.spot_id && post.spot_name), failed: false });
    }).catch(() => { if (active) setState({ actor: actorId, city, revision, posts: [], failed: true }); });
    return () => { active = false; };
  }, [city, revision, actorId]));
  if (!actorId) return null;
  const current = state?.actor === actorId && state.city === city && state.revision === revision ? state : null;
  return <View style={styles.section}>
    <View style={styles.heading}>
      <View style={{ flex: 1 }}><AppText role="sectionTitle">Hier entstehen Momente</AppText><AppText role="meta" tone="secondary">Erlebt, festgehalten, weiterentdeckt.</AppText></View>
      <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/feed")} style={styles.link}><AppText role="label" tone="pink">Alle ansehen</AppText></Pressable>
    </View>
    {!current ? <AppText role="meta" tone="secondary" style={styles.state}>Momente werden geladen …</AppText> : current.posts.length ? <ScrollView horizontal contentContainerStyle={styles.rail} showsHorizontalScrollIndicator={false}>
      {current.posts.map(post => <MomentPreview key={post.post_id} post={post} onOpen={() => router.push(`/spot/${post.spot_id}` as never)} />)}
    </ScrollView> : <AppText role="meta" tone="secondary" style={styles.state}>{current.failed ? "Die Momente laden gerade nicht. Im Moment-Bereich kannst du es erneut versuchen." : `Noch keine Momente aus ${city}. Dein nächstes Erlebnis könnte der Anfang sein.`}</AppText>}
  </View>;
}
function MomentPreview({ post, onOpen }: { post: SocialFeedPost; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const photo = post.media?.[0]?.public_url;
  const moods = presentMomentTags(post.mood_tags).slice(0, 2);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Moment bei ${post.spot_name}. ${moods.join(", ")}. Ort entdecken`} onPress={onOpen} style={styles.card}>
    {photo && !failed ? <Image source={{ uri: photo }} onError={() => setFailed(true)} style={styles.photo} accessibilityLabel={`Moment bei ${post.spot_name}`} /> : <View style={styles.textPreview}><AppText role="body">{post.caption || moods.join(" · ") || "Ein Moment an diesem Ort"}</AppText></View>}
    <View style={styles.copy}><AppText role="bodyStrong">{post.spot_name}</AppText>{moods.length ? <AppText role="meta" tone="pink">{moods.join(" · ")}</AppText> : null}<AppText role="caption" tone="secondary">{post.spot_city} · Ort entdecken →</AppText></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  section: { marginTop: theme.spacing.xxl },
  heading: { paddingHorizontal: theme.layout.pageGutter, gap: theme.spacing.sm },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  rail: { paddingHorizontal: theme.layout.pageGutter, gap: theme.spacing.md },
  card: { width: 240, borderRadius: theme.radius.lg, backgroundColor: theme.color.surface, overflow: "hidden" },
  photo: { width: "100%", height: 184 },
  textPreview: { minHeight: 150, padding: theme.spacing.lg, justifyContent: "center", borderLeftWidth: 3, borderLeftColor: theme.color.pink },
  copy: { padding: theme.spacing.md, gap: theme.spacing.xs },
  state: { marginHorizontal: theme.layout.pageGutter, marginTop: theme.spacing.md },
});
