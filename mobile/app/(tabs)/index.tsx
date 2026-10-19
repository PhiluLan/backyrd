import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { AppText, ProductTextInput as TextInput } from "../../components/foundation/AppText";
import { SafeAreaView } from "react-native-safe-area-context";

import { HomeEventsSection } from "../../components/events/HomeEventsSection";
import { HomeMomentsSection } from "../../components/HomeMomentsSection";
import { atmosphereWish } from "../../lib/discovery-journey";
import Avatar from "../../components/Avatar";
import { Button, IconButton } from "../../components/foundation/Button";
import { StateView } from "../../components/foundation/StateView";
import { MoodSignature, moodCountDescription } from "../../components/spot/MoodSignature";
import { useSpotMoodCounts, loadSpotBrowseMoods } from "../../lib/mood-catalog";
import { OpeningStatusBadge } from "../../components/spot/OpeningStatusBadge";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { useAuth } from "../../hooks/useAuth";
import { loadDiscoverySpots, type DiscoverySpot } from "../../lib/spot-images";
import { resolveLocationContext, type LocationCoordinates } from "../../lib/locationContext";
import { spotOpeningStatusNow } from "../../lib/spot-opening-status";
import { haversineKm } from "../../lib/utils/haversine";
import { supabase } from "../../lib/supabase";
import { HOME_RAIL, homeRailCardWidth } from "../../lib/home-rail";
import { backyrdTheme as theme } from "../../theme/backyrd";

function cleanName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width, fontScale } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [momentRevision, setMomentRevision] = useState(0);
  const [city, setCity] = useState("Basel");
  const [firstName, setFirstName] = useState<string | null>(null);
  const [spots, setSpots] = useState<DiscoverySpot[]>([]);
  const [spotMoods, setSpotMoods] = useState<Record<string, string[]>>({});
  const moodCounts = useSpotMoodCounts(spots.map(spot => spot.id));
  const [popularMoods, setPopularMoods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);

  const moodRequest = useRef(0);
  const loadMoodContext = useCallback(async (catalog: DiscoverySpot[]) => {
    const requestId = ++moodRequest.current;
    setSpotMoods({});
    setPopularMoods([]);
    try {
      const rows = await loadSpotBrowseMoods(catalog.map(spot => spot.id));
      if (requestId !== moodRequest.current) return;
      const labels: Record<string, string[]> = {};
      for (const row of rows) (labels[row.spot_id] ??= []).push(row.label);
      setSpotMoods(labels);
      const availability = new Map<string, number>();
      for (const row of rows) availability.set(row.label, (availability.get(row.label) ?? 0) + 1);
      setPopularMoods([...availability].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de")).slice(0, 5).map(([label]) => label));
    } catch { /* Moods enrich discovery without blocking the catalog. */ }
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
      setError("Die Orte konnten gerade nicht geladen werden.");
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
      return `${spot.category_name ?? "Ort"} · ${distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}`;
    }
    return [spot.category_name, spot.address ?? spot.city].filter(Boolean).join(" · ");
  }

  function submitDecision(value = query) {
    const normalized = value.trim();
    if (normalized.length < (user ? 3 : 2)) return;
    if (!user) {
      router.push({ pathname: "/(tabs)/map", params: { view: "list", search: normalized } } as never);
      return;
    }
    router.push({ pathname: "/(tabs)/wohin", params: { query: normalized, auto: "1" } });
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.pink} onRefresh={() => { void load(true); setMomentRevision(value => value + 1); }} />} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.greetingBlock}>
              <AppText role="bodyStrong" maxFontSizeMultiplier={1.6} style={styles.greeting}>{user ? `Hey${firstName ? `, ${firstName}` : ""}` : "Willkommen bei Backyrd"}</AppText>
              <AppText role="meta" tone="secondary">{city}</AppText>
            </View>
            <View style={styles.headerActions}>
              {user ? <>
                <IconButton accessibilityLabel="Benachrichtigungen" onPress={() => router.push("/safety-notifications" as never)} style={styles.headerIcon}>
                  <Ionicons color={theme.color.textPrimary} name="notifications-outline" size={21} />
                </IconButton>
                <Pressable accessibilityLabel="Profil öffnen" accessibilityRole="button" hitSlop={8} onPress={() => router.push("/(tabs)/profile" as never)}>
                  <Avatar uri={user.user_metadata?.avatar_url} name={firstName ?? user.email ?? "backyrd"} size={42} />
                </Pressable>
              </> : <Pressable accessibilityRole="button" accessibilityLabel="Anmelden" onPress={() => router.push("/auth/login" as never)} style={styles.guestLogin}>
                <AppText role="label" tone="pink">Anmelden</AppText>
              </Pressable>}
            </View>
          </View>

          <AppText role="displayM" style={styles.pageTitle}>Dein nächster Moment</AppText>
          <AppText role="body" tone="secondary" style={styles.intro}>Worauf hast du Lust?</AppText>
          <View style={styles.searchShell}>
            <Ionicons color={theme.color.textSecondary} name="search-outline" size={20} />
            <TextInput accessibilityLabel={user ? "Was hast du heute vor?" : "Orte suchen"} onChangeText={setQuery} onSubmitEditing={() => submitDecision()} placeholder={user ? "Dein Wunsch" : "Orte suchen"} placeholderTextColor={theme.color.textSecondary} returnKeyType="go" style={styles.searchInput} value={query} />

          </View>

          <Button label="Passenden Ort finden" onPress={() => {
            if (query.trim().length >= (user ? 3 : 2)) submitDecision();
            else router.push(user ? "/(tabs)/wohin" : { pathname: "/(tabs)/map", params: { view: "list" } });
          }} style={styles.findButton} />

          {popularMoods.length ? (
            <View style={styles.moodSection}>
              <AppText role="label" tone="secondary" style={[styles.eyebrow, styles.moodSectionTitle]}>WIE SOLL ES SICH ANFÜHLEN?</AppText>
              <ScrollView horizontal contentContainerStyle={styles.moodRow} showsHorizontalScrollIndicator={false}>
                {popularMoods.map((mood) => (
                  <Pressable accessibilityRole="button" accessibilityHint={user ? "Sucht Orte mit dieser Atmosphäre" : "Zeigt Orte mit diesem Eindruck"} accessibilityLabel={`Atmosphäre ${mood}`} key={mood} onPress={() => user ? submitDecision(atmosphereWish([mood], city)) : router.push({ pathname: "/(tabs)/map", params: { view: "list", mood } } as never)} style={({ pressed }) => [styles.moodLink, pressed && styles.pressed]}>
                    <View style={styles.moodDot} />
                    <AppText role="meta" numberOfLines={1}>{mood}</AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={[styles.sectionHeader, fontScale > 1.3 && { flexDirection: "column", alignItems: "flex-start" }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText role="sectionTitle">{currentLocation ? "Orte in deiner Nähe" : `Orte in ${city} entdecken`}</AppText>
            </View>
            <Pressable accessibilityRole="button" style={[styles.sectionLink, fontScale > 1.3 && { maxWidth: "100%" }]} onPress={() => router.push({ pathname: "/(tabs)/map", params: { view: "list" } } as never)}>
              <AppText role="label" tone="pink">Alle ansehen</AppText>
            </Pressable>
          </View>

          {loading ? (
            <View accessibilityLabel="Orte werden geladen" style={[styles.heroSkeleton, { width: heroCardWidth, height: heroCardHeight }]} />
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
                <Pressable accessibilityLabel={`${spot.name} öffnen${spotMoods[spot.id]?.length ? `. Moods: ${spotMoods[spot.id].slice(0, 3).join(", ")}` : ""}${moodCountDescription(moodCounts[spot.id]) ? `. ${moodCountDescription(moodCounts[spot.id])}` : ""}`} key={spot.id} onPress={() => router.push(`/spot/${spot.id}` as never)} style={({ pressed }) => [styles.heroCard, { width: heroCardWidth, minHeight: heroCardHeight, paddingTop: theme.spacing.display * 2 }, pressed && styles.cardPressed]}>
                  <SpotArtwork imageUrl={spot.header_photo_url} priority={index < 2 ? "high" : "normal"} spotId={spot.id} spotName={spot.name} showFallbackName={false} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={["rgba(5,5,5,0.02)", "rgba(5,5,5,0.18)", "rgba(5,5,5,0.92)"]} locations={[0.2, 0.54, 1]} style={StyleSheet.absoluteFill} />
                  <OpeningStatusBadge status={spotOpeningStatusNow(spot.hours)} style={styles.statusPill} />
                  <View style={styles.heroCardContent}>
                    <AppText role="displayM" style={styles.spotName}>{spot.name}</AppText>
                    <MoodSignature labels={spotMoods[spot.id] ?? []} moodCount={moodCounts[spot.id]} compact />
                    <AppText role="meta" style={styles.spotMeta}>{spotMeta(spot)}</AppText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.stateWrap}><StateView kind="empty" title="Noch keine Orte hier" message={`Sobald es in ${city} Neues zu entdecken gibt, findest du es hier.`} /></View>
          )}

          <HomeMomentsSection city={city} revision={momentRevision} />

          <HomeEventsSection />

          {!loading && !error && newSpots.length ? (
            <View style={styles.newSection}>
              <View style={styles.sectionHeader}><View><AppText role="label" tone="secondary" style={styles.eyebrow}>GERADE DAZUGEKOMMEN</AppText><AppText role="sectionTitle">Neu auf Backyrd</AppText></View></View>
              <ScrollView horizontal contentContainerStyle={styles.compactCards} showsHorizontalScrollIndicator={false}>
                {newSpots.map((spot) => (
                  <Pressable accessibilityRole="button" accessibilityLabel={`${spot.name} öffnen${spotMoods[spot.id]?.length ? `. Moods: ${spotMoods[spot.id].slice(0, 3).join(", ")}` : ""}${moodCountDescription(moodCounts[spot.id]) ? `. ${moodCountDescription(moodCounts[spot.id])}` : ""}`} key={spot.id} onPress={() => router.push(`/spot/${spot.id}` as never)} style={({ pressed }) => [styles.compactCard, { width: compactCardWidth }, pressed && styles.cardPressed]}>
                    <View style={styles.compactImage}><SpotArtwork imageUrl={spot.header_photo_url} spotId={spot.id} spotName={spot.name} showFallbackName={false} style={StyleSheet.absoluteFill} /></View>
                    <AppText role="bodyStrong" style={styles.compactTitle}>{spot.name}</AppText>
                    <MoodSignature labels={spotMoods[spot.id] ?? []} moodCount={moodCounts[spot.id]} compact />
                    <AppText role="caption" tone="secondary">{spot.category_name || spot.city || city}</AppText>
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
  header: { minHeight: 60, paddingHorizontal: theme.spacing.xl, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.md },
  greetingBlock: { flex: 1, minWidth: 0 },
  greeting: { color: theme.color.textPrimary },
  pageTitle: { marginTop: theme.spacing.lg, marginHorizontal: theme.layout.pageGutter },
  intro: { marginTop: theme.spacing.sm, marginHorizontal: theme.layout.pageGutter },
  findButton: { marginHorizontal: theme.layout.pageGutter, marginTop: theme.spacing.sm },
  headerActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  headerIcon: { backgroundColor: "rgba(246,240,232,0.06)", borderWidth: 1, borderColor: theme.color.border },
  guestLogin: { minHeight: 44, justifyContent: "center", paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border },
  searchShell: { marginTop: theme.spacing.md, marginHorizontal: theme.spacing.xl, minHeight: theme.control.standard, paddingHorizontal: theme.spacing.md, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill, backgroundColor: "rgba(246,240,232,0.055)" },
  searchInput: { flex: 1, minWidth: 0, minHeight: theme.control.standard, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 15, paddingVertical: 10 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  moodSection: { marginTop: theme.spacing.xxl },
  eyebrow: { letterSpacing: 1.15, marginBottom: 6 },
  moodSectionTitle: { paddingHorizontal: theme.spacing.xl },
  moodRow: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.lg },
  moodLink: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  moodDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.pink },
  sectionHeader: { marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.xl, minHeight: 52, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: theme.spacing.md },
  sectionLink: { minHeight: theme.control.compact, maxWidth: "42%", minWidth: theme.control.compact, justifyContent: "center" },
  heroCards: { paddingTop: theme.spacing.lg },
  heroCard: { overflow: "hidden", borderRadius: theme.radius.xl, justifyContent: "flex-end", backgroundColor: theme.color.surface },
  heroCardContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
  statusPill: { position: "absolute", top: theme.spacing.md, left: theme.spacing.md, maxWidth: "88%", zIndex: 1 },
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
