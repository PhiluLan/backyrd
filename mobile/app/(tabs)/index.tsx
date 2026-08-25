import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EditorialMeta, EditorialRule, EditorialSectionHeader, MarkerStroke } from "../../components/brand/Editorial";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { AppText } from "../../components/foundation/AppText";
import { useAuth } from "../../hooks/useAuth";
import { loadDiscoverySpots, type DiscoverySpot } from "../../lib/spot-images";
import { supabase } from "../../lib/supabase";
import { backyrdTheme as theme } from "../../theme/backyrd";

const QUICK_MOMENTS = [
  { label: "Heute", icon: "sunny-outline" as const, query: "Was passt heute zu mir?" },
  { label: "Freunde", icon: "people-outline" as const, query: "Etwas mit Freunden" },
  { label: "Date", icon: "heart-outline" as const, query: "Ein schönes Date" },
  { label: "Draussen", icon: "leaf-outline" as const, query: "Etwas draussen" },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("Basel");
  const [spots, setSpots] = useState<DiscoverySpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      let productCity = city;
      if (user?.id) {
        const { data: profile } = await supabase.from("profiles").select("city").eq("id", user.id).maybeSingle();
        if (profile?.city?.trim()) {
          productCity = profile.city.trim();
          setCity(productCity);
        }
      }
      const catalog = await loadDiscoverySpots(productCity, 160);
      const photoFirst = catalog.filter((spot) => Boolean(spot.header_photo_url));
      setSpots((photoFirst.length >= 5 ? photoFirst : catalog).slice(0, 10));
    } catch (loadError) {
      console.warn("Home discovery failed", { message: loadError instanceof Error ? loadError.message : String(loadError) });
      setError("Basels Spots konnten gerade nicht geladen werden.");
      setSpots([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [city, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const cardWidth = useMemo(() => Math.min(430, Math.max(286, width - 42)), [width]);
  const cardHeight = Math.round(cardWidth * 1.28);
  const heroSize = Math.min(62, Math.max(43, width * 0.135));

  function submitDecision(value = query) {
    const normalized = value.trim();
    if (normalized.length < 3) return;
    router.push({ pathname: "/(tabs)/decision", params: { query: normalized, city, auto: "1" } });
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.pink} onRefresh={() => void load(true)} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <Text style={styles.location}>{city.toUpperCase()}</Text>
            <View style={styles.topActions}>
              <Pressable accessibilityLabel="Benachrichtigungen" hitSlop={9} onPress={() => router.push("/safety-notifications" as never)} style={styles.topIcon}>
                <Ionicons color={theme.color.textPrimary} name="notifications-outline" size={23} />
              </Pressable>
              <Pressable accessibilityLabel="Profil öffnen" hitSlop={9} onPress={() => router.push("/(tabs)/profile" as never)} style={styles.profileButton}>
                <Text style={styles.profileInitial}>{user?.email?.slice(0, 1).toUpperCase() || "B"}</Text>
              </Pressable>
            </View>
          </View>

          <AppText role="displayXL" numberOfLines={2} style={[styles.hero, { fontSize: heroSize, lineHeight: Math.ceil(heroSize * 1.06) }]}>WOHIN GEHT’S{`\n`}HEUTE?</AppText>
          <MarkerStroke width={Math.min(194, width * 0.49)} />

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons color={theme.color.textPrimary} name="search-outline" size={24} />
              <TextInput
                accessibilityLabel="Beschreibe deinen heutigen Moment"
                onChangeText={setQuery}
                onSubmitEditing={() => submitDecision()}
                placeholder={width < 350 ? "Spot, Mood oder Plan" : "Spots, Moods oder Decisions"}
                placeholderTextColor={theme.color.textSecondary}
                returnKeyType="search"
                style={styles.input}
                value={query}
              />
            </View>
            <Pressable accessibilityLabel="Decision starten" accessibilityRole="button" disabled={query.trim().length < 3} onPress={() => submitDecision()} style={({ pressed }) => [styles.submit, query.trim().length < 3 && styles.submitDisabled, pressed && styles.pressed]}>
              <Ionicons color={theme.color.background} name="arrow-forward" size={30} />
            </Pressable>
          </View>

          <View style={styles.momentSection}>
            <EditorialSectionHeader actionLabel="Alle" onAction={() => router.push("/(tabs)/feed" as never)} title="Momente" />
            <ScrollView horizontal contentContainerStyle={styles.moments} showsHorizontalScrollIndicator={false}>
              {QUICK_MOMENTS.map((moment, index) => (
                <Pressable
                  accessibilityHint="Übernimmt diesen Kontext in die Decision-Suche"
                  accessibilityLabel={`Moment ${moment.label}`}
                  key={moment.label}
                  onPress={() => {
                    const nextQuery = `${moment.query} in ${city}`;
                    setQuery(nextQuery);
                    submitDecision(nextQuery);
                  }}
                  style={styles.moment}
                >
                  <LinearGradient colors={index % 2 ? ["#252127", "#0D0D0F"] : ["#1B2316", "#0D0D0F"]} style={[styles.momentRing, index === 0 && styles.momentRingActive]}>
                    <Ionicons color={index === 0 ? theme.color.pink : theme.color.textPrimary} name={moment.icon} size={27} />
                  </LinearGradient>
                  <Text style={styles.momentLabel}>{moment.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.discoverySection}>
            <EditorialSectionHeader index="01" actionLabel="Karte" onAction={() => router.push("/(tabs)/map" as never)} title={`${city} entdecken`} />
            {loading ? (
              <View accessibilityLabel="Spots werden geladen" style={[styles.skeletonCard, { width: cardWidth, height: cardHeight }]}>
                <View style={styles.skeletonAccent} /><View style={styles.skeletonTitle} /><View style={styles.skeletonMeta} />
              </View>
            ) : error ? (
              <View style={styles.errorState}>
                <Text style={styles.errorTitle}>Kurz den Faden verloren.</Text>
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Noch einmal</Text></Pressable>
              </View>
            ) : spots.length ? (
              <ScrollView horizontal contentContainerStyle={styles.cards} decelerationRate="fast" showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 14}>
                {spots.map((spot, index) => (
                  <Pressable accessibilityLabel={`${spot.name} öffnen`} key={spot.id} onPress={() => router.push(`/spot/${spot.id}` as never)} style={[styles.card, { width: cardWidth, height: cardHeight }]}>
                    <SpotArtwork imageUrl={spot.header_photo_url} priority={index < 2 ? "high" : "normal"} spotId={spot.id} spotName={spot.name} style={StyleSheet.absoluteFill} />
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.12)", "rgba(0,0,0,0.93)"]} locations={[0.36, 0.58, 1]} style={StyleSheet.absoluteFill} />
                    <View style={styles.cardContent}>
                      <AppText role="displayL" numberOfLines={2} style={styles.cardName}>{spot.name.toUpperCase()}</AppText>
                      <EditorialMeta>{[spot.city || city, spot.category_name].filter(Boolean).join("  /  ")}</EditorialMeta>
                      <EditorialRule />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}><Text style={styles.emptyTitle}>Noch keine Bilder aus {city}.</Text><Text style={styles.emptyText}>Die Karte zeigt dir trotzdem alle verfügbaren Spots.</Text></View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  content: { paddingTop: 9, paddingBottom: 126 },
  topRow: { minHeight: 48, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  location: { color: theme.color.acid, fontFamily: theme.type.bodyMedium, fontSize: 17, letterSpacing: -0.3 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  topIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  profileButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: theme.color.acid, backgroundColor: theme.color.surfaceElevated },
  profileInitial: { color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 21 },
  hero: { marginTop: 31, paddingHorizontal: 22, letterSpacing: -2.2 },
  searchRow: { marginTop: 15, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 12 },
  searchBox: { flex: 1, minHeight: 62, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "rgba(247,243,233,0.46)", borderRadius: 32 },
  input: { flex: 1, minHeight: 60, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 14, paddingVertical: 12 },
  submit: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.pink },
  submitDisabled: { opacity: 0.7 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.97 }] },
  momentSection: { marginTop: 20 },
  moments: { paddingHorizontal: 22, paddingTop: 7, gap: 15 },
  moment: { width: 72, alignItems: "center" },
  momentRing: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.color.acid },
  momentRingActive: { borderColor: theme.color.pink, borderWidth: 2 },
  momentLabel: { marginTop: 7, color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 12 },
  discoverySection: { marginTop: 30 },
  cards: { paddingHorizontal: 22, paddingTop: 9, gap: 14 },
  card: { justifyContent: "flex-end", overflow: "hidden", backgroundColor: theme.color.surface },
  cardContent: { paddingHorizontal: 15, paddingBottom: 13 },
  cardName: { letterSpacing: -1.5 },
  skeletonCard: { marginHorizontal: 22, marginTop: 9, justifyContent: "flex-end", padding: 18, backgroundColor: theme.color.surface },
  skeletonAccent: { position: "absolute", left: 0, right: 0, top: "42%", height: 70, backgroundColor: "rgba(255,79,145,0.06)", transform: [{ rotate: "-4deg" }] },
  skeletonTitle: { width: "74%", height: 52, backgroundColor: theme.color.surfaceElevated },
  skeletonMeta: { marginTop: 12, width: "47%", height: 14, backgroundColor: theme.color.surfaceElevated },
  errorState: { marginHorizontal: 22, marginTop: 9, minHeight: 230, justifyContent: "flex-end", padding: 20, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  errorTitle: { color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 36, lineHeight: 36, textTransform: "uppercase" },
  errorText: { marginTop: 10, color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 21 },
  retry: { marginTop: 18, alignSelf: "flex-start", minHeight: 46, justifyContent: "center", paddingHorizontal: 18, backgroundColor: theme.color.pink },
  retryText: { color: theme.color.background, fontFamily: theme.type.bodyBold, fontSize: 14 },
  emptyState: { marginHorizontal: 22, marginTop: 9, paddingVertical: 35, borderTopWidth: 1, borderColor: theme.color.border },
  emptyTitle: { color: theme.color.textPrimary, fontFamily: theme.type.display, fontWeight: "900", fontSize: 31, textTransform: "uppercase" },
  emptyText: { marginTop: 8, color: theme.color.textSecondary, fontFamily: theme.type.body, fontSize: 15, lineHeight: 22 },
});
