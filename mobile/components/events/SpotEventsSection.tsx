import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ProductText as Text } from "../foundation/AppText";
import { upcomingSpotEvents } from "../../../packages/shared/src/presentation/event";
import type { EventDiscoveryDTO } from "../../../packages/shared/src/dto/event";
import { loadEvents } from "../../lib/events-v1";
import { EventCard } from "./EventCard";
import { HOME_RAIL, homeRailCardWidth } from "../../lib/home-rail";
import { backyrdTheme as theme } from "../../theme/backyrd";

export function SpotEventsSection({ spotId }: { spotId: string }) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - theme.layout.pageGutter * 2, homeRailCardWidth(width, { minimum: 220, maximum: 272 }));
  const [rows, setRows] = useState<EventDiscoveryDTO[]>([]);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setRows([]); setFailed(false);
    void loadEvents({ filter: "all", spotId }).then(events => { if (active) setRows(upcomingSpotEvents(events)); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [spotId, revision]));
  if (!failed && rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Was steht an?</Text>
      {failed ? (
        <View>
          <Text style={styles.meta}>Die Events konnten gerade nicht geladen werden.</Text>
          <Pressable accessibilityRole="button" onPress={() => setRevision(value => value + 1)} style={styles.row}>
            <Text style={styles.title}>Erneut laden</Text>
          </Pressable>
        </View>
      ) : rows.length === 1 ? (
        <EventCard event={rows[0]} />
      ) : (
        <ScrollView
          horizontal
          accessibilityLabel="Kommende Events bei diesem Spot"
          showsHorizontalScrollIndicator={false}
          decelerationRate={HOME_RAIL.decelerationRate}
          disableIntervalMomentum={HOME_RAIL.disableIntervalMomentum}
          snapToInterval={cardWidth + HOME_RAIL.gap}
          contentContainerStyle={{ gap: HOME_RAIL.gap, paddingBottom: 2 }}
        >
          {rows.map(event => (
            <EventCard key={event.event_id} event={event} style={{ width: cardWidth }} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({ section: { marginBottom: 38, gap: 12 }, heading: { color: theme.color.textPrimary, fontSize: 24, fontFamily: theme.type.display }, row: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: theme.color.borderStrong, gap: 8, minHeight: 48 }, title: { color: theme.color.textPrimary, fontSize: 18, fontFamily: theme.type.bodyMedium }, meta: { color: theme.color.textSecondary, fontSize: 14, fontFamily: theme.type.body } });
