import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { AppText } from "../foundation/AppText";
import { SpotArtwork } from "./SpotArtwork";
import { MoodSignature, moodCountDescription } from "./MoodSignature";
import { OpeningStatusBadge } from "./OpeningStatusBadge";
import type { SpotOpeningStatus } from "../../lib/spot-opening-status";
import { backyrdTheme as theme, useBackyrdTheme } from "../../theme/backyrd";

/** One readable place preview across Home rails and the discovery list. */
export function SpotPreviewCard({ id, name, imageUrl, category, context, moods, moodCount, status, onPress, onArtworkReady, priority = "normal", style }: {
  id: string; name: string; imageUrl?: string | null; category?: string | null;
  context?: string | null; moods: readonly string[]; moodCount?: number | null;
  status: SpotOpeningStatus; onPress: () => void; onArtworkReady?: () => void;
  priority?: "normal" | "high"; style?: StyleProp<ViewStyle>;
}) {
  const { color } = useBackyrdTheme();
  const count = moodCountDescription(moodCount);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name} öffnen${category ? `. ${category}` : ""}${context ? `. ${context}` : ""}${moods.length ? `. ${moods.slice(0, 3).join(", ")}` : ""}${count ? `. ${count}` : ""}`}
    onPress={onPress} style={({ pressed }) => [styles.card, { backgroundColor: color.surface, borderColor: color.border }, style, pressed && styles.pressed]}>
    <SpotArtwork imageUrl={imageUrl} spotId={id} spotName={name} showFallbackName={false} attributionPosition="top" priority={priority} onArtworkReady={onArtworkReady} style={styles.artwork} />
    <View style={styles.content}>
      <AppText role="cardTitle" style={styles.name}>{name}</AppText>
      {category || context ? <AppText role="meta" tone="secondary">{[category, context].filter(Boolean).join(" · ")}</AppText> : null}
      <View style={styles.moods}><MoodSignature labels={moods} moodCount={moodCount} compact /></View>
      <OpeningStatusBadge status={status} />
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { overflow: "hidden", borderRadius: theme.radius.xl, borderWidth: StyleSheet.hairlineWidth },
  artwork: { width: "100%", aspectRatio: 1.65 },
  content: { padding: 20, gap: 10 },
  name: { fontFamily: theme.type.bodyBold, fontSize: 26, lineHeight: 33, letterSpacing: -0.6 },
  moods: { marginVertical: 4 },
  pressed: { opacity: 0.86 },
});
