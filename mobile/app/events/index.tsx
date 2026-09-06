import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type {
  EventCategoryDTO,
  EventDiscoveryDTO,
  EventTimeFilter,
} from "../../../packages/shared/src/dto/event";
import { eventImageUrl, loadEvents } from "../../lib/events-v1";

const timeFilters: { key: EventTimeFilter; label: string }[] = [
  { key: "today", label: "Heute" },
  { key: "tomorrow", label: "Morgen" },
  { key: "weekend", label: "Wochenende" },
  { key: "all", label: "Alle" },
];

const categories: { key: EventCategoryDTO | null; label: string }[] = [
  { key: null, label: "Alles" },
  { key: "MUSIC", label: "Musik" },
  { key: "NIGHTLIFE", label: "Nightlife" },
  { key: "ART", label: "Kunst" },
  { key: "THEATRE", label: "Bühne" },
  { key: "FILM", label: "Film" },
  { key: "FOOD_DRINK", label: "Food & Drinks" },
  { key: "FAMILY", label: "Familie" },
  { key: "SPORT", label: "Sport" },
  { key: "ACTIVITY", label: "Aktivitäten" },
  { key: "LEISURE", label: "Freizeit" },
  { key: "MARKET", label: "Märkte" },
  { key: "WORKSHOP", label: "Workshops" },
  { key: "COMMUNITY", label: "Quartier & Community" },
  { key: "OTHER", label: "Weitere" },
];

const categoryLabels: Record<EventCategoryDTO, string> = {
  MUSIC: "Musik",
  NIGHTLIFE: "Nightlife",
  ART: "Kunst",
  THEATRE: "Bühne",
  FILM: "Film",
  FOOD_DRINK: "Food & Drinks",
  FAMILY: "Familie",
  SPORT: "Sport",
  ACTIVITY: "Aktivitäten",
  LEISURE: "Freizeit",
  MARKET: "Markt",
  WORKSHOP: "Workshop",
  COMMUNITY: "Community",
  OTHER: "Event",
};

function formatWhen(startAt: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startAt));
}

function priceLabel(event: EventDiscoveryDTO): string | null {
  if (event.is_free === true) return "Kostenlos";
  if (event.price_min !== null && event.price_currency) {
    return `ab ${event.price_currency} ${event.price_min.toFixed(2)}`;
  }
  return null;
}

function EventCard({ event }: { event: EventDiscoveryDTO }) {
  const router = useRouter();
  const image = eventImageUrl(event.image_storage_path);
  const cancelled =
    event.event_status === "CANCELLED" || event.occurrence_status === "CANCELLED";
  const postponed =
    event.event_status === "POSTPONED" || event.occurrence_status === "POSTPONED";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatWhen(event.start_at)}`}
      onPress={() =>
        router.push({
          pathname: "/events/[id]",
          params: { id: event.event_id, occurrenceId: event.occurrence_id },
        })
      }
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={["#2A202C", "#17171B", "#101012"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardVisual}
      >
        {image ? (
          <Image
            source={{ uri: image }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.visualGlow} />
        <Text style={styles.visualDay}>
          {new Intl.DateTimeFormat("de-CH", { day: "2-digit", timeZone: "Europe/Zurich" }).format(
            new Date(event.start_at),
          )}
        </Text>
        <Text style={styles.visualMonth}>
          {new Intl.DateTimeFormat("de-CH", { month: "short", timeZone: "Europe/Zurich" })
            .format(new Date(event.start_at))
            .toUpperCase()}
        </Text>
      </LinearGradient>

      <View style={styles.cardBody}>
        <View style={styles.badgeRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{categoryLabels[event.category]}</Text>
          </View>
          {cancelled ? (
            <View style={styles.cancelledBadge}>
              <Text style={styles.cancelledText}>Abgesagt</Text>
            </View>
          ) : postponed ? (
            <View style={styles.postponedBadge}>
              <Text style={styles.postponedText}>Verschoben</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.when}>{formatWhen(event.start_at)}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={15} color="#A9A5A0" />
          <Text style={styles.metaText} numberOfLines={1}>
            {event.venue_name || "Ort noch nicht bestätigt"}
          </Text>
        </View>
        {priceLabel(event) ? (
          <Text style={styles.price}>{priceLabel(event)}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={21} color="#747177" />
    </Pressable>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const [timeFilter, setTimeFilter] = useState<EventTimeFilter>("today");
  const [category, setCategory] = useState<EventCategoryDTO | null>(null);
  const [events, setEvents] = useState<EventDiscoveryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setEvents(await loadEvents({ filter: timeFilter, category }));
    } catch {
      setEvents([]);
      setError("Die Basler Events konnten gerade nicht geladen werden.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, timeFilter]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  const emptyCopy = useMemo(() => {
    if (timeFilter === "today") return "Für heute sind noch keine Events bestätigt.";
    if (timeFilter === "tomorrow") return "Für morgen sind noch keine Events bestätigt.";
    if (timeFilter === "weekend") return "Für dieses Wochenende ist noch nichts bestätigt.";
    return "Aktuell sind keine Basler Events veröffentlicht.";
  }, [timeFilter]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Zurück">
          <Ionicons name="arrow-back" size={22} color="#F4EFE4" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>BASEL</Text>
          <Text style={styles.title}>Was läuft?</Text>
        </View>
        <View style={styles.liveMark}><View style={styles.liveDot} /><Text style={styles.liveText}>Aktuell</Text></View>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.occurrence_id}
        renderItem={({ item }) => <EventCard event={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void fetchEvents(true)} tintColor="#FF7DA7" />
        }
        ListHeaderComponent={
          <View style={styles.filters}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={timeFilters}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setTimeFilter(item.key)}
                  style={[styles.timeChip, timeFilter === item.key && styles.timeChipActive]}
                >
                  <Text style={[styles.timeChipText, timeFilter === item.key && styles.timeChipTextActive]}>{item.label}</Text>
                </Pressable>
              )}
            />
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={categories}
              keyExtractor={(item) => item.key ?? "all"}
              contentContainerStyle={styles.categoryRow}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setCategory(item.key)}
                  style={[styles.categoryChip, category === item.key && styles.categoryChipActive]}
                >
                  <Text style={[styles.categoryChipText, category === item.key && styles.categoryChipTextActive]}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.state}><ActivityIndicator color="#FF7DA7" /><Text style={styles.stateText}>Events werden geladen …</Text></View>
          ) : error ? (
            <View style={styles.state}>
              <Ionicons name="cloud-offline-outline" size={34} color="#A9A5A0" />
              <Text style={styles.stateTitle}>Gerade nicht erreichbar</Text>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable onPress={() => void fetchEvents()} style={styles.retryButton}><Text style={styles.retryText}>Nochmals versuchen</Text></Pressable>
            </View>
          ) : (
            <View style={styles.state}>
              <Ionicons name="calendar-outline" size={34} color="#A9A5A0" />
              <Text style={styles.stateTitle}>Noch nichts bestätigt</Text>
              <Text style={styles.stateText}>{emptyCopy}</Text>
              <Pressable onPress={() => setTimeFilter("all")}><Text style={styles.allLink}>Alle kommenden Events ansehen</Text></Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080808" },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 14 },
  iconButton: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  headerCopy: { flex: 1 },
  kicker: { color: "#FF9ABA", fontSize: 11, fontWeight: "900", letterSpacing: 2.4 },
  title: { color: "#F4EFE4", fontSize: 32, lineHeight: 37, fontWeight: "900", letterSpacing: -0.8 },
  liveMark: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(187,199,160,0.08)", borderWidth: 1, borderColor: "rgba(187,199,160,0.16)" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#BBC7A0" },
  liveText: { color: "#BBC7A0", fontSize: 12, fontWeight: "800" },
  listContent: { paddingHorizontal: 20, paddingBottom: 48, gap: 13 },
  filters: { gap: 12, marginBottom: 18 },
  chipRow: { gap: 9 },
  categoryRow: { gap: 8 },
  timeChip: { paddingHorizontal: 17, paddingVertical: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  timeChipActive: { backgroundColor: "#F4EFE4", borderColor: "#F4EFE4" },
  timeChipText: { color: "#B8B4B8", fontSize: 14, fontWeight: "800" },
  timeChipTextActive: { color: "#171719" },
  categoryChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  categoryChipActive: { backgroundColor: "rgba(255,125,167,0.12)", borderColor: "rgba(255,125,167,0.32)" },
  categoryChipText: { color: "#8E8D8A", fontSize: 12, fontWeight: "700" },
  categoryChipTextActive: { color: "#FFAAC4" },
  card: { minHeight: 154, padding: 12, paddingRight: 15, flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.052)", borderWidth: 1, borderColor: "rgba(255,255,255,0.075)" },
  pressed: { opacity: 0.84, transform: [{ scale: 0.992 }] },
  cardVisual: { width: 88, height: 128, borderRadius: 17, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  visualGlow: { position: "absolute", width: 100, height: 100, borderRadius: 50, top: -45, left: -38, backgroundColor: "rgba(255,125,167,0.20)" },
  visualDay: { color: "#F4EFE4", fontSize: 33, lineHeight: 37, fontWeight: "900" },
  visualMonth: { color: "#FF9ABA", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  cardBody: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: "row", gap: 7, marginBottom: 8 },
  categoryBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,125,167,0.10)" },
  categoryText: { color: "#FFAAC4", fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  cancelledBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(248,113,113,0.12)" },
  cancelledText: { color: "#FCA5A5", fontSize: 10, fontWeight: "900" },
  postponedBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(201,177,244,0.12)" },
  postponedText: { color: "#C9B1F4", fontSize: 10, fontWeight: "900" },
  cardTitle: { color: "#F4EFE4", fontSize: 18, lineHeight: 22, fontWeight: "900" },
  when: { color: "#D6D0C7", fontSize: 13, fontWeight: "700", marginTop: 7 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  metaText: { color: "#A9A5A0", fontSize: 12, flex: 1 },
  price: { color: "#BBC7A0", fontSize: 12, fontWeight: "800", marginTop: 7 },
  state: { minHeight: 320, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 10 },
  stateTitle: { color: "#F4EFE4", fontSize: 21, fontWeight: "900", marginTop: 4 },
  stateText: { color: "#A9A5A0", fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: "#F4EFE4" },
  retryText: { color: "#171719", fontSize: 13, fontWeight: "900" },
  allLink: { color: "#FF9ABA", fontSize: 13, fontWeight: "800", marginTop: 5 },
});
