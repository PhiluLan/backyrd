import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { ProductText as Text } from "../foundation/AppText";
import type { EventDiscoveryDTO } from "../../../packages/shared/src/dto/event";
import { eventImageUrl } from "../../lib/events-v1";
import { backyrdTheme as theme, useBackyrdTheme } from "../../theme/backyrd";

import { HOME_SECONDARY_CARD_HEIGHT } from "../../lib/home-rail";
import { eventCategoryLabel } from "../../../packages/shared/src/presentation/event";
import { seasonalDateLabel } from "../../../packages/shared/src/seasonal-events";

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

export function eventCardPrice(event: Pick<EventDiscoveryDTO, "is_free" | "price_min" | "price_currency">): string | null {
  if (event.is_free === true) return "Gratis";
  if (typeof event.price_min !== "number" || !Number.isFinite(event.price_min) || event.price_min < 0) return event.is_free === false ? "Preis offen" : null;
  const amount = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(event.price_min);
  const currency = event.price_currency?.trim();
  return currency ? `ab ${currency} ${amount}` : "Preis offen";
}

export function EventCard({ event, style }: { event: EventDiscoveryDTO; style?: StyleProp<ViewStyle> }) {
  const { color } = useBackyrdTheme();
  const router = useRouter();
  const image = eventImageUrl(event.image_storage_path);
  const price = eventCardPrice(event);

  return (
    <Pressable
      accessibilityLabel={`${event.title}, ${seasonalDateLabel(event) ?? when(event.start_at)}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/events/[id]",
          params: { id: event.event_id, occurrenceId: event.occurrence_id },
        })
      }
      style={({ pressed }) => [styles.card, { borderColor: color.borderStrong, backgroundColor: color.surface }, style, pressed && styles.pressed]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        {image ? <Image resizeMode="cover" source={{ uri: image }} style={StyleSheet.absoluteFillObject} /> : null}
        <LinearGradient
          colors={["rgba(5,5,5,0.03)", "rgba(24,24,26,0.35)", "rgba(55,55,59,0.98)"]}
          locations={[0.1, 0.45, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>
      <View style={styles.categoryBadge}><Text style={styles.category}>{eventCategoryLabel(event.category)}</Text></View>
      <View style={styles.imageWrap}>
        <View style={styles.imageCopy}>
          <Text style={[styles.kicker, { color: "#FFFFFF" }]}>{(seasonalDateLabel(event) ?? when(event.start_at)).toUpperCase()}</Text>
          <Text numberOfLines={2} style={styles.title}>{event.title.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <View style={styles.metaLine}>
          <Ionicons color="#FFFFFF" name="location-outline" size={16} />
          <Text numberOfLines={1} style={[styles.metaText, { color: "#FFFFFF" }]}>{event.series_id ? "Mehrere Schauplätze · Basel" : event.venue_name ?? "Ort noch nicht bestätigt"}</Text>
        </View>
        {price ? <Text style={styles.price}>{price}</Text> : null}
        <Ionicons color="#FFFFFF" name="arrow-forward" size={20} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: theme.spacing.sm,
    minHeight: HOME_SECONDARY_CARD_HEIGHT,
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface,
  },
  pressed: { opacity: 0.9, transform: [{ scale: theme.motion.pressScale }] },
  imageWrap: { minHeight: 178, justifyContent: "flex-end", paddingTop: 48 },
  imageCopy: { padding: theme.spacing.md },
  kicker: { color: theme.color.pink, fontFamily: theme.type.bodyMedium, fontSize: 10, letterSpacing: 1.05 },
  title: { marginTop: 6, color: "#FFFFFF", fontFamily: theme.type.bodyBold, fontSize: 25, lineHeight: 27, letterSpacing: -0.65 },
  meta: { minHeight: 54, paddingHorizontal: theme.spacing.md, flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  metaLine: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { flex: 1, color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 12 },
  categoryBadge: { position: "absolute", top: 12, left: 12, maxWidth: "90%", paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: "rgba(20,20,22,0.72)" },
  category: { color: "#FFFFFF", fontFamily: theme.type.bodyMedium, fontSize: 11, lineHeight: 16 },
  price: { color: "#FFFFFF", fontFamily: theme.type.bodyMedium, fontSize: 11, lineHeight: 16, flexShrink: 1, maxWidth: "44%" },
});
