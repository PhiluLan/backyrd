import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { ProductText as Text } from "../foundation/AppText";

import type { EventDiscoveryDTO } from "../../../packages/shared/src/dto/event";
import { loadEvents } from "../../lib/events-v1";
import { HOME_RAIL, homeRailCardWidth } from "../../lib/home-rail";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { EventCard } from "./EventCard";
import { HomeDisplayHeading } from "../HomeDisplayHeading";

export function HomeEventsSection() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [events, setEvents] = useState<EventDiscoveryDTO[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const rows = await loadEvents({ filter: "all" });
      setEvents(
        rows
          .filter(
            (row) =>
              row.event_status !== "CANCELLED" && row.occurrence_status !== "CANCELLED",
          )
          .slice(0, 8),
      );
      setState("ready");
    } catch {
      setEvents([]);
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Events stay recognisable as a rail on every phone width: smaller than the
  // primary Spot cards, but with the same snap physics and intentional peek.
  const carouselCardWidth = homeRailCardWidth(width, { minimum: 220, maximum: 272 });

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <HomeDisplayHeading title="Was läuft" accent="?" />
        <Pressable accessibilityRole="button" onPress={() => router.push("/events" as never)} hitSlop={10} style={styles.allEventsAction}>
          <Text style={styles.allEventsText}>Alle ansehen</Text>
        </Pressable>
      </View>
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
      ) : events.length === 0 ? (
        <View style={styles.state}>
          <Ionicons color={theme.color.textSecondary} name="calendar-outline" size={24} />
          <Text style={styles.stateText}>Aktuell sind noch keine Events bestätigt.</Text>
        </View>
      ) : events.length === 1 ? (
        <EventCard event={events[0]} style={styles.singleCard} />
      ) : (
        <ScrollView
          accessibilityLabel="Kommende Events"
          contentContainerStyle={[styles.carouselContent, { gap: HOME_RAIL.gap }]}
          horizontal
          decelerationRate={HOME_RAIL.decelerationRate}
          disableIntervalMomentum={HOME_RAIL.disableIntervalMomentum}
          showsHorizontalScrollIndicator={false}
          snapToInterval={carouselCardWidth + HOME_RAIL.gap}
        >
          {events.map((event) => (
            <EventCard
              event={event}
              key={event.occurrence_id}
              style={{ width: carouselCardWidth }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: theme.spacing.xxxl },
  heading: { paddingHorizontal: theme.layout.pageGutter, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  allEventsAction: { minHeight: 44, alignSelf: "flex-end", justifyContent: "center" },
  allEventsText: { color: theme.color.pink, fontFamily: theme.type.bodyBold, fontSize: 13 },
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
  singleCard: { marginHorizontal: HOME_RAIL.horizontalInset, marginTop: theme.spacing.lg },
  carouselContent: {
    paddingTop: theme.spacing.lg,
    paddingHorizontal: HOME_RAIL.horizontalInset,
    paddingBottom: 2,
  },
});
