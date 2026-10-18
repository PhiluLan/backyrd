import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ProductText as Text } from "../foundation/AppText";
import type { EventDiscoveryDTO } from "../../../packages/shared/src/dto/event";
import { eventImageUrl } from "../../lib/events-v1";
import { backyrdTheme as theme } from "../../theme/backyrd";

function when(startAt: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startAt));
}

export function EventCard({ event, style }: { event: EventDiscoveryDTO; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const image = eventImageUrl(event.image_storage_path);

  return (
    <Pressable
      accessibilityLabel={`${event.title}, ${when(event.start_at)}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/events/[id]",
          params: { id: event.event_id, occurrenceId: event.occurrence_id },
        })
      }
      style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
    >
      <View style={styles.imageWrap}>
        {image ? <Image resizeMode="cover" source={{ uri: image }} style={StyleSheet.absoluteFillObject} /> : null}
        <LinearGradient
          colors={["transparent", "rgba(5,5,6,.88)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.imageCopy}>
          <Text style={styles.kicker}>{when(event.start_at).toUpperCase()}</Text>
          <Text numberOfLines={2} style={styles.title}>{event.title.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <View style={styles.metaLine}>
          <Ionicons color={theme.color.textSecondary} name="location-outline" size={16} />
          <Text numberOfLines={1} style={styles.metaText}>{event.venue_name ?? "Ort noch nicht bestätigt"}</Text>
        </View>
        <View style={styles.freeBadge}>
          <Text style={styles.freeText}>{event.is_free ? "GRATIS" : "EVENT"}</Text>
        </View>
        <Ionicons color={theme.color.textPrimary} name="arrow-forward" size={20} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: theme.spacing.sm,
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface,
  },
  pressed: { opacity: 0.9, transform: [{ scale: theme.motion.pressScale }] },
  imageWrap: { height: 178, justifyContent: "flex-end", backgroundColor: theme.color.surfaceElevated },
  imageCopy: { padding: theme.spacing.md },
  kicker: { color: theme.color.acid, fontFamily: theme.type.bodyMedium, fontSize: 10, letterSpacing: 1.05 },
  title: { marginTop: 6, color: theme.color.textPrimary, fontFamily: theme.type.display, fontSize: 25, lineHeight: 27, letterSpacing: -0.65 },
  meta: { minHeight: 54, paddingHorizontal: theme.spacing.md, flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  metaLine: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { flex: 1, color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 12 },
  freeBadge: { borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "rgba(216,255,62,.12)" },
  freeText: { color: theme.color.acid, fontFamily: theme.type.bodyMedium, fontSize: 10, letterSpacing: 1 },
});
