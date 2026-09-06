import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { EventDiscoveryDTO } from "../../../packages/shared/src/dto/event";
import { eventImageUrl, loadEvents } from "../../lib/events-v1";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { EditorialSectionHeader } from "../brand/Editorial";

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

export function HomeEventsSection() {
  const router = useRouter();
  const [event, setEvent] = useState<EventDiscoveryDTO | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const rows = await loadEvents({ filter: "all" });
      setEvent(
        rows.find(
          (row) =>
            row.event_status !== "CANCELLED" && row.occurrence_status !== "CANCELLED",
        ) ?? null,
      );
      setState("ready");
    } catch {
      setEvent(null);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const image = event ? eventImageUrl(event.image_storage_path) : null;

  return (
    <View style={styles.section}>
      <EditorialSectionHeader
        actionLabel="Alle"
        index="01"
        onAction={() => router.push("/events" as never)}
        title="Was läuft?"
      />
      {state === "loading" ? (
        <View accessibilityLabel="Events werden geladen" style={styles.state}>
          <ActivityIndicator color={theme.color.pink} />
          <Text style={styles.stateText}>Events werden geladen …</Text>
        </View>
      ) : state === "error" ? (
        <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.state}>
          <Ionicons color={theme.color.textSecondary} name="cloud-offline-outline" size={24} />
          <View style={styles.stateCopy}>
            <Text style={styles.stateTitle}>Events gerade nicht erreichbar</Text>
            <Text style={styles.stateText}>Tippe, um es nochmals zu versuchen.</Text>
          </View>
        </Pressable>
      ) : !event ? (
        <View style={styles.state}>
          <Ionicons color={theme.color.textSecondary} name="calendar-outline" size={24} />
          <Text style={styles.stateText}>Aktuell sind noch keine Events bestätigt.</Text>
        </View>
      ) : (
        <Pressable
          accessibilityLabel={`${event.title}, ${when(event.start_at)}`}
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/events/[id]",
              params: { id: event.event_id, occurrenceId: event.occurrence_id },
            })
          }
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: theme.spacing.xxxl },
  state: {
    minHeight: 94,
    marginHorizontal: theme.spacing.xxl,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  stateCopy: { flex: 1 },
  stateTitle: { color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 15 },
  stateText: { color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 13, lineHeight: 19 },
  card: {
    marginHorizontal: theme.spacing.xxl,
    marginTop: theme.spacing.sm,
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    backgroundColor: theme.color.surface,
  },
  pressed: { opacity: 0.9, transform: [{ scale: theme.motion.pressScale }] },
  imageWrap: { height: 250, justifyContent: "flex-end", backgroundColor: theme.color.surfaceElevated },
  imageCopy: { padding: theme.spacing.lg },
  kicker: { color: theme.color.acid, fontFamily: theme.type.bodyMedium, fontSize: 11, letterSpacing: 1.2 },
  title: { marginTop: 8, color: theme.color.textPrimary, fontFamily: theme.type.display, fontSize: 34, lineHeight: 34, letterSpacing: -1 },
  meta: { minHeight: 62, paddingHorizontal: theme.spacing.lg, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  metaLine: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { flex: 1, color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 13 },
  freeBadge: { borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(216,255,62,.12)" },
  freeText: { color: theme.color.acid, fontFamily: theme.type.bodyMedium, fontSize: 10, letterSpacing: 1 },
});
