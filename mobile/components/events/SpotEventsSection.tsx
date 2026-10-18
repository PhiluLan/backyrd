import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ProductText as Text } from "../foundation/AppText";
import { upcomingSpotEvents } from "../../../packages/shared/src/presentation/event";
import type { EventDiscoveryDTO } from "../../../packages/shared/src/dto/event";
import { loadEvents } from "../../lib/events-v1";
import { backyrdTheme as theme } from "../../theme/backyrd";

export function SpotEventsSection({ spotId }: { spotId: string }) {
  const router = useRouter();
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
  return <View style={styles.section}><Text style={styles.heading}>Was steht an?</Text>{failed ? <View><Text style={styles.meta}>Die Events konnten gerade nicht geladen werden.</Text><Pressable accessibilityRole="button" onPress={() => setRevision(value => value + 1)} style={styles.row}><Text style={styles.title}>Erneut laden</Text></Pressable></View> : rows.map(event => <Pressable key={event.event_id} accessibilityRole="button" accessibilityLabel={`${event.title}, Event ansehen`} style={styles.row} onPress={() => router.push({ pathname: "/events/[id]", params: { id: event.event_id, occurrenceId: event.occurrence_id } })}><Text style={styles.title}>{event.title} →</Text><Text style={styles.meta}>{new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(event.start_at))}{event.is_free === true ? " · Gratis" : event.price_min !== null ? ` · ab CHF ${event.price_min}` : ""}</Text></Pressable>)}</View>;
}
const styles = StyleSheet.create({ section: { marginTop: 28, gap: 16 }, heading: { color: theme.color.textPrimary, fontSize: 24, fontFamily: theme.type.display }, row: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: theme.color.borderStrong, gap: 8, minHeight: 48 }, title: { color: theme.color.textPrimary, fontSize: 18, fontFamily: theme.type.bodyMedium }, meta: { color: theme.color.textSecondary, fontSize: 14, fontFamily: theme.type.body } });
