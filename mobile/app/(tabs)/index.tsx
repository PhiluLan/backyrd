import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HomeEventsSection } from "../../components/events/HomeEventsSection";
import Avatar from "../../components/Avatar";
import { AppText } from "../../components/foundation/AppText";
import { IconButton } from "../../components/foundation/Button";
import { StateView } from "../../components/foundation/StateView";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { useAuth } from "../../hooks/useAuth";
import { loadDiscoverySpots, type DiscoverySpot } from "../../lib/spot-images";
import { resolveLocationContext, type LocationCoordinates } from "../../lib/locationContext";
import { SPOT_OPENING_STATUS_COPY, spotOpeningStatusNow, type SpotOpeningStatus } from "../../lib/spot-opening-status";
import { haversineKm } from "../../lib/utils/haversine";
import { supabase } from "../../lib/supabase";
import { HOME_RAIL, homeRailCardWidth } from "../../lib/home-rail";
import { backyrdTheme as theme } from "../../theme/backyrd";

type MoodRow = {
  spot_id: string;
  label: string;
  rank: number | null;
  concept_contributors: number | null;
};

function cleanName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("Basel");
  const [firstName, setFirstName] = useState<string | null>(null);
  const [spots, setSpots] = useState<DiscoverySpot[]>([]);
  const [popularMoods, setPopularMoods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);

  const loadMoodContext = useCallback(async (catalog: DiscoverySpot[]) => {
    const spotIds = catalog.map((spot) => spot.id);
    if (!spotIds.length) return;
    const { data, error: moodError } = await supabase
      .from("backyrd_spot_mood_profile_public_v1")
      .select("spot_id,label,rank,concept_contributors")
      .in("spot_id", spotIds);

    // Mood context enriches the cards but may never fail the Discovery surface.
    if (moodError || !Array.isArray(data)) return;
    const rows = data as MoodRow[];
    const strength = new Map<string, number>();
    for (const row of rows) {
      if (!row.spot_id || !row.label) continue;
      strength.set(row.label, (strength.get(row.label) ?? 0) + Math.max(1, Number(row.concept_contributors ?? 0)));
    }
    setPopularMoods([...strength.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label]) => label));
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      let productCity = city;
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("city,first_name,display_name,username")
          .eq("id", user.id)
          .maybeSingle();
        const profileName = cleanName(profile?.first_name) ?? cleanName(profile?.display_name) ?? cleanName(profile?.username);
        if (profileName) setFirstName(profileName.split(/\s+/)[0]);
        if (profile?.city?.trim()) {
          productCity = profile.city.trim();
          setCity(productCity);
        }
      }
      const catalog = await loadDiscoverySpots(productCity, 160);
      setSpots(catalog.slice(0, 14));
      void loadMoodContext(catalog.slice(0, 40));
    } catch (loadError) {
      console.warn("Home discovery failed", { message: loadError instanceof Error ? loadError.message : String(loadError) });
      setError("Basels Spots konnten gerade nicht geladen werden.");
      setSpots([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [city, loadMoodContext, user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    void resolveLocationContext({ purpose: "nearby_discovery", requestPermission: false, allowCityFallback: false, timeoutMs: 2_500 })
      .then((context) => {
        if (active && context.source === "current") setCurrentLocation(context.coordinates);
      });
    return () => { active = false; };
  }, []);

  const topSpots = useMemo(() => spots.slice(0, 6), [spots]);
  const newSpots = useMemo(() => [...spots].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 6), [spots]);
  const heroCardGap = HOME_RAIL.gap;
  const heroCardWidth = homeRailCardWidth(width, { minimum: 248, maximum: 356 });
  const heroCardHeight = Math.round(heroCardWidth * 1.08);
  const heroCarouselOffsets = useMemo(
    () => topSpots.map((_, index) => index * (heroCardWidth + heroCardGap)),
    [heroCardGap, heroCardWidth, topSpots],
  );
  const compactCardWidth = Math.min(190, Math.max(154, width * 0.44));

  function spotMeta(spot: DiscoverySpot) {
    if (currentLocation && spot.lat !== null && spot.lng !== null) {
      const distance = haversineKm(currentLocation, { latitude: spot.lat, longitude: spot.lng });
      return `${spot.category_name ?? "Spot"} · ${distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}`;
    }
    return [spot.category_name, spot.address ?? spot.city].filter(Boolean).join(" · ");
  }

  function openingStatusStyle(status: SpotOpeningStatus) {
    if (status === "open") return [styles.statusPillOpen, styles.statusDotOpen] as const;
    if (status === "closed") return [styles.statusPillClosed, styles.statusDotClosed] as const;
    if (status === "openingSoon") return [styles.statusPillOpeningSoon, styles.statusDotOpeningSoon] as const;
    if (status === "closingSoon") return [styles.statusPillClosingSoon, styles.statusDotClosingSoon] as const;
    return [styles.statusPillUnknown, styles.statusDotUnknown] as const;
  }

  function submitDecision(value = query) {
    const normalized = value.trim();
    if (normalized.length < 3) return;
    router.push({ pathname: "/(tabs)/decision", params: { query: normalized, city, auto: "1" } });
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.pink} onRefresh={() => void load(true)} />} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.greetingBlock}>
              <AppText role="displayL" style={styles.greeting}>Hey,</AppText>
              <AppText role="displayL" ellipsizeMode="tail" numberOfLines={1} style={styles.greetingName}>{firstName ?? ""}</AppText>
              <AppText role="meta" tone="secondary">{city}</AppText>
            </View>
            <View style={styles.headerActions}>
              <IconButton accessibilityLabel="Benachrichtigungen" onPress={() => router.push("/safety-notifications" as never)} style={styles.headerIcon}>
                <Ionicons color={theme.color.textPrimary} name="notifications-outline" size={21} />
              </IconButton>
              <Pressable accessibilityLabel="Profil öffnen" accessibilityRole="button" hitSlop={8} onPress={() => router.push("/(tabs)/profile" as never)}>
                <Avatar uri={user?.user_metadata?.avatar_url} name={firstName ?? user?.email ?? "Backyrd"} size={42} />
              </Pressable>
            </View>
          </View>

          <View style={styles.searchShell}>
            <Ionicons color={theme.color.textSecondary} name="search-outline" size={20} />
            <TextInput accessibilityLabel="Was hast du heute vor?" onChangeText={setQuery} onSubmitEditing={() => submitDecision()} placeholder="Was hast du heute vor?" placeholderTextColor={theme.color.textSecondary} returnKeyType="go" style={styles.searchInput} value={query} />
            <Pressable accessibilityLabel="Decision starten" accessibilityRole="button" disabled={query.trim().length < 3} onPress={() => submitDecision()} style={({ pressed }) => [styles.searchSubmit, query.trim().length < 3 && styles.searchSubmitDisabled, pressed && styles.pressed]}>
              <Ionicons color={theme.color.background} name="arrow-forward" size={21} />
            </Pressable>
          </View>

          {popularMoods.length ? (
            <View style={styles.moodSection}>
              <AppText role="label" tone="secondary" style={[styles.eyebrow, styles.moodSectionTitle]}>BELIEBTE MOODS</AppText>
              <ScrollView horizontal contentContainerStyle={styles.moodRow} showsHorizontalScrollIndicator={false}>
                {popularMoods.map((mood, index) => (
                  <Pressable accessibilityHint="Startet Für jetzt mit diesem Mood" accessibilityLabel={`Mood ${mood}`} key={mood} onPress={() => submitDecision(`${mood} in ${city}`)} style={({ pressed }) => [styles.moodLink, pressed && styles.pressed]}>
                    <View style={[styles.moodDot, index === 0 && styles.moodDotPrimary]} />
                    <AppText role="meta" numberOfLines={1}>{mood}</AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <AppText role="sectionTitle">Top Spots in deiner Nähe</AppText>
            </View>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.push({ pathname: "/(tabs)/map", params: { view: "list" } } as never)}>
              <AppText role="label" tone="pink">Alle ansehen</AppText>
            </Pressable>
          </View>

          {loading ? (
            <View accessibilityLabel="Spots werden geladen" style={[styles.heroSkeleton, { width: heroCardWidth, height: heroCardHeight }]} />
          ) : error ? (
            <View style={styles.stateWrap}><StateView actionLabel="Noch einmal" kind="error" message={error} onAction={() => void load()} title="Kurz den Faden verloren." /></View>
          ) : topSpots.length ? (
            <ScrollView
              horizontal
              contentContainerStyle={[styles.heroCards, { paddingHorizontal: HOME_RAIL.horizontalInset, gap: heroCardGap }]}
              decelerationRate={HOME_RAIL.decelerationRate}
              disableIntervalMomentum={HOME_RAIL.disableIntervalMomentum}
              showsHorizontalScrollIndicator={false}
              snapToInterval={heroCardWidth + heroCardGap}
              snapToOffsets={heroCarouselOffsets}
            >
              {topSpots.map((spot, index) => (
                <Pressable accessibilityLabel={`${spot.name} öffnen`} key={spot.id} onPress={() => router.push(`/spot/${spot.id}` as never)} style={({ pressed }) => [styles.heroCard, { width: heroCardWidth, height: heroCardHeight }, pressed && styles.cardPressed]}>
                  <SpotArtwork imageUrl={spot.header_photo_url} priority={index < 2 ? "high" : "normal"} spotId={spot.id} spotName={spot.name} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={["rgba(5,5,5,0.02)", "rgba(5,5,5,0.18)", "rgba(5,5,5,0.92)"]} locations={[0.2, 0.54, 1]} style={StyleSheet.absoluteFill} />
                  {(() => {
                    const status = spotOpeningStatusNow(spot.hours);
                    const [pillStyle, dotStyle] = openingStatusStyle(status);
                    return <View style={[styles.statusPill, pillStyle]}><View style={[styles.statusDot, dotStyle]} /><AppText role="caption" style={styles.statusText}>{SPOT_OPENING_STATUS_COPY[status]}</AppText></View>;
                  })()}
                  <View style={styles.heroCardContent}>
                    <AppText role="displayL" adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={styles.spotName}>{spot.name}</AppText>
                    <AppText role="meta" numberOfLines={1} style={styles.spotMeta}>{spotMeta(spot)}</AppText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.stateWrap}><StateView kind="empty" title="Noch keine Spots hier" message={`Sobald es in ${city} Neues zu entdecken gibt, findest du es hier.`} /></View>
          )}

          <HomeEventsSection />

          {!loading && !error && newSpots.length ? (
            <View style={styles.newSection}>
              <View style={styles.sectionHeader}><View><AppText role="label" tone="secondary" style={styles.eyebrow}>GERADE DAZUGEKOMMEN</AppText><AppText role="sectionTitle">Neu auf Backyrd</AppText></View></View>
              <ScrollView horizontal contentContainerStyle={styles.compactCards} showsHorizontalScrollIndicator={false}>
                {newSpots.map((spot) => (
                  <Pressable key={spot.id} onPress={() => router.push(`/spot/${spot.id}` as never)} style={({ pressed }) => [styles.compactCard, { width: compactCardWidth }, pressed && styles.cardPressed]}>
                    <View style={styles.compactImage}><SpotArtwork imageUrl={spot.header_photo_url} spotId={spot.id} spotName={spot.name} style={StyleSheet.absoluteFill} /></View>
                    <AppText role="bodyStrong" numberOfLines={2} style={styles.compactTitle}>{spot.name}</AppText>
                    <AppText role="caption" tone="secondary" numberOfLines={1}>{spot.category_name || spot.city || city}</AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.background },
  content: { paddingTop: theme.spacing.lg, paddingBottom: theme.control.tabBar + theme.spacing.display },
  header: { minHeight: 104, paddingHorizontal: theme.spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md },
  greetingBlock: { flex: 1, minWidth: 0 },
  greeting: { color: theme.color.textPrimary },
  greetingName: { color: theme.color.textPrimary },
  headerActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  headerIcon: { backgroundColor: "rgba(246,240,232,0.06)", borderWidth: 1, borderColor: theme.color.border },
  searchShell: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl, minHeight: 54, paddingLeft: theme.spacing.md, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill, backgroundColor: "rgba(246,240,232,0.055)" },
  searchInput: { flex: 1, minHeight: 52, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 15, paddingVertical: 10 },
  searchSubmit: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.pink },
  searchSubmitDisabled: { opacity: 0.38 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  moodSection: { marginTop: theme.spacing.xxl },
  eyebrow: { letterSpacing: 1.15, marginBottom: 6 },
  moodSectionTitle: { paddingHorizontal: theme.spacing.xl },
  moodRow: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.lg },
  moodLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  moodDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.blue },
  moodDotPrimary: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.color.pink },
  sectionHeader: { marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.xl, minHeight: 52, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: theme.spacing.md },
  heroCards: { paddingTop: theme.spacing.lg },
  heroCard: { overflow: "hidden", borderRadius: theme.radius.xl, justifyContent: "flex-end", backgroundColor: theme.color.surface },
  heroCardContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
  statusPill: { position: "absolute", top: theme.spacing.md, left: theme.spacing.md, zIndex: 1, minHeight: 28, paddingHorizontal: 10, borderRadius: theme.radius.pill, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(5,5,5,0.72)", borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillOpen: { borderColor: "rgba(154,230,122,0.48)" },
  statusPillClosed: { borderColor: "rgba(255,104,104,0.5)" },
  statusPillOpeningSoon: { borderColor: "rgba(247,198,92,0.52)" },
  statusPillClosingSoon: { borderColor: "rgba(255,155,94,0.52)" },
  statusPillUnknown: { borderColor: theme.color.borderStrong },
  statusDotOpen: { backgroundColor: theme.color.openGreen },
  statusDotClosed: { backgroundColor: theme.color.danger },
  statusDotOpeningSoon: { backgroundColor: theme.color.warning },
  statusDotClosingSoon: { backgroundColor: theme.color.closingSoon },
  statusDotUnknown: { backgroundColor: theme.color.textSecondary },
  statusText: { color: theme.color.textPrimary },
  spotName: { color: theme.color.textPrimary },
  spotMeta: { marginTop: 8, color: "rgba(246,240,232,0.78)" },
  cardPressed: { opacity: 0.9, transform: [{ scale: theme.motion.pressScale }] },
  heroSkeleton: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl, borderRadius: theme.radius.xl, backgroundColor: theme.color.surfaceElevated },
  stateWrap: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl },
  newSection: { marginTop: theme.spacing.sm },
  compactCards: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, gap: theme.spacing.md },
  compactCard: { minHeight: 224 },
  compactImage: { height: 170, borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: theme.color.surface },
  compactTitle: { marginTop: theme.spacing.sm },
});
