import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { EventDiscoveryDTO } from "../../../packages/shared/src/dto/event";
import {
  eventCategoryLabel,
  eventImageCredit,
  eventPropertyLabels,
  eventSourceDisclaimer,
  eventSourceLabel,
  formatCompactOccurrenceDate,
  formatEventAddress,
  formatEventDateTime,
  humanizeRecurrence,
} from "../../../packages/shared/src/presentation/event";
import {
  eventImageUrl,
  loadEventOccurrence,
  loadUpcomingEvents,
  type UpcomingEventGroups,
} from "../../lib/events-v1";

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; occurrenceId?: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const occurrenceId = Array.isArray(params.occurrenceId)
    ? params.occurrenceId[0]
    : params.occurrenceId;
  const [event, setEvent] = useState<EventDiscoveryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingEventGroups>({
    sameEvent: [],
    sameVenue: [],
  });
  const [showAllOccurrences, setShowAllOccurrences] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const loaded = await loadEventOccurrence(eventId, occurrenceId);
      setEvent(loaded);
      setUpcoming(
        loaded
          ? await loadUpcomingEvents(loaded)
          : { sameEvent: [], sameVenue: [] },
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId, occurrenceId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#FF7DA7" /><Text style={styles.stateText}>Event wird geladen …</Text></View>;
  }
  if (error || !event) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="calendar-outline" size={38} color="#A9A5A0" />
        <Text style={styles.stateTitle}>Event nicht verfügbar</Text>
        <Text style={styles.stateText}>Der Termin wurde möglicherweise entfernt oder ist gerade nicht erreichbar.</Text>
        <Pressable onPress={() => void load()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Nochmals versuchen</Text></Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.backLink}>Zurück</Text></Pressable>
      </SafeAreaView>
    );
  }

  const ticketUrl = safeExternalUrl(event.ticket_url);
  const sourceUrl = ticketUrl ?? safeExternalUrl(event.source_url);
  const cancelled = event.event_status === "CANCELLED" || event.occurrence_status === "CANCELLED";
  const postponed = event.event_status === "POSTPONED" || event.occurrence_status === "POSTPONED";
  const address = formatEventAddress({
    addressLine: event.address_line,
    postalCode: event.postal_code,
    city: event.city,
    countryCode: event.country_code,
  });
  const image = eventImageUrl(event.image_storage_path);
  const imageCredit = eventImageCredit(event.source, event.image_credit);
  const recurrence = humanizeRecurrence(event.recurrence_summary);
  const properties = eventPropertyLabels(event.minimum_age, event.family_friendly);
  const visibleOccurrences = showAllOccurrences
    ? upcoming.sameEvent
    : upcoming.sameEvent.slice(0, 3);
  const spotAddress = formatEventAddress({
    addressLine: event.matched_spot_address,
    city: event.city,
    countryCode: event.country_code,
  });
  const routeDestination =
    event.latitude !== null && event.longitude !== null
      ? `${event.latitude},${event.longitude}`
      : event.matched_spot_address || address || event.venue_name || event.title;
  const routeUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(routeDestination)}`;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={["#352635", "#19171D", "#080808"]} style={styles.hero}>
          {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : null}
          <SafeAreaView edges={["top"]} style={styles.heroSafe}>
            <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Zurück">
              <Ionicons name="arrow-back" size={22} color="#F4EFE4" />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroGlow} />
          {image && imageCredit ? <Text style={styles.imagePolicy}>{imageCredit}</Text> : null}
          {!image ? <View style={styles.calendarGlyph}>
            <Text style={styles.day}>{new Intl.DateTimeFormat("de-CH", { day: "2-digit", timeZone: "Europe/Zurich" }).format(new Date(event.start_at))}</Text>
            <Text style={styles.month}>{new Intl.DateTimeFormat("de-CH", { month: "long", timeZone: "Europe/Zurich" }).format(new Date(event.start_at))}</Text>
          </View> : null}
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.kickerRow}>
            <Text style={styles.kicker}>{eventSourceLabel(event.source)}</Text>
            {cancelled ? <View style={styles.cancelled}><Text style={styles.cancelledText}>ABGESAGT</Text></View> : null}
            {!cancelled && postponed ? <View style={styles.postponed}><Text style={styles.postponedText}>VERSCHOBEN</Text></View> : null}
          </View>
          <Text style={styles.title}>{event.title}</Text>
          <View style={styles.badges}>{event.categories.map(category => <Text key={category} style={styles.category}>{eventCategoryLabel(category)}</Text>)}</View>
          <View style={styles.factCard}>
            <View style={styles.factRow}>
              <Ionicons name="calendar-outline" size={21} color="#FF9ABA" />
              <View style={styles.factCopy}><Text style={styles.factLabel}>Wann</Text><Text style={styles.factValue}>{formatEventDateTime(event.start_at, event.end_at)}</Text></View>
            </View>
            <View style={styles.divider} />
            <View style={styles.factRow}>
              <Ionicons name="location-outline" size={21} color="#BBC7A0" />
              <View style={styles.factCopy}><Text style={styles.factLabel}>Wo</Text><Text style={styles.factValue}>{event.venue_name || "Ort noch nicht bestätigt"}</Text>{address ? <Text style={styles.factSecondary}>{address}</Text> : null}</View>
            </View>
            {event.is_free === true || event.price_min !== null ? <><View style={styles.divider} /><View style={styles.factRow}><Ionicons name="ticket-outline" size={21} color="#C9B1F4" /><View style={styles.factCopy}><Text style={styles.factLabel}>Eintritt</Text><Text style={styles.factValue}>{event.is_free === true ? "Kostenlos" : `ab ${event.price_currency} ${event.price_min?.toFixed(2)}`}</Text></View></View></> : null}
          </View>

          {recurrence ? <View style={styles.recurrence}><Ionicons name="repeat-outline" size={18} color="#FF9ABA" /><Text style={styles.recurrenceText}>{recurrence}</Text></View> : null}
          {properties.length ? <View style={styles.properties}>{properties.map(property => <View key={property} style={styles.property}><Text style={styles.propertyText}>{property}</Text></View>)}</View> : null}

          {event.short_description ? <View style={styles.section}><Text style={styles.sectionTitle}>Darum geht’s</Text><Text style={styles.description}>{event.short_description}</Text></View> : null}
          {event.organizer ? <Text style={styles.description}>Veranstalter: {event.organizer}</Text> : null}

          {event.matched_spot_id ? (
            <View style={styles.venueActions}>
              <Pressable onPress={() => router.push(`/spot/${event.matched_spot_id}`)} style={styles.spotButton}>
                {event.matched_spot_photo ? <Image source={{uri:event.matched_spot_photo}} style={styles.spotImage}/> : null}<View style={{flex:1}}><Text style={styles.spotKicker}>AUF BACKYRD</Text><Text style={styles.spotButtonText}>{event.matched_spot_name || "Spot ansehen"}</Text>{spotAddress ? <Text style={styles.factSecondary}>{spotAddress}</Text> : null}</View>
                <Ionicons name="arrow-forward" size={21} color="#F4EFE4" />
              </Pressable>
              <Pressable onPress={() => void Linking.openURL(routeUrl)} style={styles.routeButton}>
                <Ionicons name="navigate-outline" size={18} color="#F4EFE4" />
                <Text style={styles.routeButtonText}>Route</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.unmatchedNote}><Ionicons name="information-circle-outline" size={18} color="#8E8D8A" /><Text style={styles.unmatchedText}>Dieser Veranstaltungsort ist noch keinem Backyrd Spot zugeordnet.</Text></View>
          )}

          {sourceUrl ? (
            <Pressable onPress={() => void Linking.openURL(sourceUrl)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{ticketUrl ? "Tickets bei der Originalquelle" : "Mehr erfahren"}</Text>
              <Ionicons name="open-outline" size={18} color="#171719" />
            </Pressable>
          ) : null}
          <Text style={styles.sourceNote}>{eventSourceDisclaimer(event.source)}</Text>

          {upcoming.sameEvent.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nächste Termine</Text>
              <View style={styles.occurrences}>
                {visibleOccurrences.map((item) => (
                  <Pressable
                    key={item.occurrence_id}
                    onPress={() => router.push({ pathname: "/events/[id]", params: { id: item.event_id, occurrenceId: item.occurrence_id } })}
                    style={styles.occurrence}
                  >
                    <Text style={styles.occurrenceText}>{formatCompactOccurrenceDate(item.start_at)}</Text>
                  </Pressable>
                ))}
              </View>
              {upcoming.sameEvent.length > 3 ? (
                <Pressable onPress={() => setShowAllOccurrences(value => !value)} accessibilityRole="button">
                  <Text style={styles.allOccurrences}>{showAllOccurrences ? "Weniger Termine" : "Alle Termine"}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {upcoming.sameVenue.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Weitere Events im {event.matched_spot_name || event.venue_name || "Veranstaltungsort"}</Text>
              {upcoming.sameVenue.map((item) => (
                <Pressable
                  key={item.occurrence_id}
                  onPress={() => router.push({ pathname: "/events/[id]", params: { id: item.event_id, occurrenceId: item.occurrence_id } })}
                  style={styles.venueEvent}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.factValue}>{item.title}</Text>
                    <Text style={styles.factSecondary}>{formatEventDateTime(item.start_at, item.end_at)}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={19} color="#F4EFE4" />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080808" },
  content: { paddingBottom: 46 },
  center: { flex: 1, backgroundColor: "#080808", alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  stateTitle: { color: "#F4EFE4", fontSize: 23, fontWeight: "900" },
  stateText: { color: "#A9A5A0", fontSize: 14, lineHeight: 21, textAlign: "center" },
  backLink: { color: "#FF9ABA", fontSize: 14, fontWeight: "800", marginTop: 5 },
  hero: { height: 332, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  heroSafe: { position: "absolute", top: 0, left: 20, right: 20, alignItems: "flex-start", zIndex: 3 },
  iconButton: { width: 44, height: 44, marginTop: 10, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,8,8,0.48)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  heroGlow: { position: "absolute", width: 260, height: 260, top: -120, right: -80, borderRadius: 130, backgroundColor: "rgba(255,125,167,0.16)" },
  calendarGlyph: { width: 142, height: 142, borderRadius: 42, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.11)" },
  day: { color: "#F4EFE4", fontSize: 55, lineHeight: 59, fontWeight: "900" },
  month: { color: "#FF9ABA", fontSize: 15, fontWeight: "800", textTransform: "uppercase" },
  imagePolicy: { position: "absolute", bottom: 18, color: "rgba(244,239,228,0.42)", fontSize: 10, fontWeight: "700" },
  body: { paddingHorizontal: 20, paddingTop: 25, gap: 22 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  kicker: { color: "#FF9ABA", fontSize: 11, fontWeight: "900", letterSpacing: 1.8 },
  badges:{flexDirection:"row",flexWrap:"wrap",gap:7},category:{color:"#FFAAC4",backgroundColor:"rgba(255,125,167,.1)",paddingHorizontal:9,paddingVertical:6,borderRadius:99,fontSize:10,fontWeight:"900"},
  spotImage:{width:58,height:58,borderRadius:14},
  cancelled: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(248,113,113,0.13)" },
  cancelledText: { color: "#FCA5A5", fontSize: 10, fontWeight: "900" },
  postponed: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(201,177,244,0.13)" },
  postponedText: { color: "#C9B1F4", fontSize: 10, fontWeight: "900" },
  title: { color: "#F4EFE4", fontSize: 36, lineHeight: 41, fontWeight: "900", letterSpacing: -1 },
  factCard: { padding: 18, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.052)", borderWidth: 1, borderColor: "rgba(255,255,255,0.075)" },
  factRow: { flexDirection: "row", gap: 13, alignItems: "flex-start" },
  factCopy: { flex: 1 },
  factLabel: { color: "#8E8D8A", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.9 },
  factValue: { color: "#F4EFE4", fontSize: 16, lineHeight: 22, fontWeight: "800", marginTop: 3 },
  factSecondary: { color: "#A9A5A0", fontSize: 13, lineHeight: 19, marginTop: 3 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 16 },
  section: { gap: 9 },
  sectionTitle: { color: "#F4EFE4", fontSize: 20, fontWeight: "900" },
  description: { color: "#B8B4B8", fontSize: 15, lineHeight: 23 },
  recurrence: { flexDirection: "row", alignItems: "center", gap: 9 },
  recurrenceText: { color: "#D6D0C7", fontSize: 14, lineHeight: 20, fontWeight: "800" },
  properties: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  property: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  propertyText: { color: "#D6D0C7", fontSize: 12, fontWeight: "800" },
  occurrences: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  occurrence: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(255,125,167,0.10)", borderWidth: 1, borderColor: "rgba(255,125,167,0.22)" },
  occurrenceText: { color: "#FFAAC4", fontSize: 13, fontWeight: "900" },
  allOccurrences: { color: "#FF9ABA", fontSize: 13, fontWeight: "800", paddingVertical: 5 },
  venueEvent: { padding: 15, borderRadius: 18, flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.035)" },
  spotButton: { minHeight: 76, paddingHorizontal: 18, paddingVertical: 15, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(187,199,160,0.09)", borderWidth: 1, borderColor: "rgba(187,199,160,0.18)" },
  venueActions: { gap: 9 },
  routeButton: { minHeight: 46, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  routeButtonText: { color: "#F4EFE4", fontSize: 14, fontWeight: "800" },
  spotKicker: { color: "#BBC7A0", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  spotButtonText: { color: "#F4EFE4", fontSize: 17, fontWeight: "900", marginTop: 3 },
  unmatchedNote: { padding: 15, borderRadius: 18, flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.035)" },
  unmatchedText: { color: "#8E8D8A", fontSize: 13, lineHeight: 19, flex: 1 },
  primaryButton: { minHeight: 56, borderRadius: 18, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: "#F4EFE4" },
  primaryButtonText: { color: "#171719", fontSize: 15, fontWeight: "900" },
  sourceNote: { color: "#6F6C70", fontSize: 11, lineHeight: 17, textAlign: "center", paddingHorizontal: 10 },
});
