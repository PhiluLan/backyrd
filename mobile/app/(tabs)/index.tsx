import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  AppState,
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
import { HomeSpotRail } from "../../components/HomeSpotRail";
import { readRecentDecisionSearch, type RecentDecisionSearch } from "../../lib/decision/recentDecisionSearch";
import { useSpotMoodCounts, loadSpotBrowseMoods } from "../../lib/mood-catalog";
import { useAuth } from "../../hooks/useAuth";
import { loadDiscoverySpots, type DiscoverySpot } from "../../lib/spot-images";
import type { LocationCoordinates } from "../../lib/locationContext";
import { getPrivacySafeLocation } from "../../lib/locationPrivacy";
import { loadHomeNearbySpots, loadNewestCitySpots, loadDiscoverySpotsByIds, validDiscoveryLocation, HOME_NEARBY_RADIUS_KM } from "../../lib/nearby-discovery";
import { withRequestDeadline } from "../../lib/requestDeadline";
import { supabase } from "../../lib/supabase";
import { homeRailCardWidth } from "../../lib/home-rail";
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
  const [newSpots, setNewSpots] = useState<DiscoverySpot[]>([]);
  const [recentSearch, setRecentSearch] = useState<(RecentDecisionSearch & { actorId: string }) | null>(null);
  const [recentSpots, setRecentSpots] = useState<DiscoverySpot[]>([]);
  const [recentError, setRecentError] = useState(false);
  const [newError, setNewError] = useState(false);
  const [spotMoods, setSpotMoods] = useState<Record<string, string[]>>({});
  const moodCounts = useSpotMoodCounts([...spots, ...newSpots, ...recentSpots].map(spot => spot.id));
  const [popularMoods, setPopularMoods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);

  const loadRequest = useRef(0);
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
    const requestId = ++loadRequest.current;
    ++moodRequest.current;
    setCurrentLocation(null);
    setSpots([]);
    setNewSpots([]);
    setRecentSearch(null);
    setRecentSpots([]);
    setRecentError(false);
    setNewError(false);
    setSpotMoods({});
    setPopularMoods([]);
    setLoading(true);
    setRefreshing(refresh);
    setError(null);
    try {
      const [profile, location] = await Promise.all([
        user?.id ? withRequestDeadline(async signal => {
          const result = await supabase.from("profiles").select("city,first_name,display_name,username").eq("id", user.id).abortSignal(signal).maybeSingle();
          return result.data;
        }, 5_000).catch(() => null) : Promise.resolve(null),
        withRequestDeadline(() => getPrivacySafeLocation({ purpose: "nearby_discovery", requestPermission: false, forceConsentRefresh: true, allowLastKnown: false, timeoutMs: 5_000 }), 6_500).catch(() => null),
      ]);
      if (requestId !== loadRequest.current) return;
      const productCity = cleanName(profile?.city) ?? "Basel";
      setCity(productCity);
      const profileName = cleanName(profile?.first_name) ?? cleanName(profile?.display_name) ?? cleanName(profile?.username);
      setFirstName(profileName ? profileName.split(/\s+/)[0] : null);
      const point = location?.ok && location.source === "current" ? { latitude: location.location.coords.latitude, longitude: location.location.coords.longitude } : null;
      const current = validDiscoveryLocation(point) ? point : null;
      // Publish the location only together with its matching catalog, never label city rows as nearby.
      const recentTask = user?.id ? readRecentDecisionSearch(user.id).then(async search => {
        if (!search) return null;
        try { return { search, places: await loadDiscoverySpotsByIds(search.spotIds), failed: false }; }
        catch { return { search, places: [], failed: true }; }
      }) : Promise.resolve(null);
      const [local, recent] = await Promise.all([
        current ? loadHomeNearbySpots(current) : Promise.all([
          withRequestDeadline(() => loadDiscoverySpots(productCity, 160), 10_000),
          loadNewestCitySpots(productCity).catch(() => null),
        ]).then(([nearest, newest]) => ({ nearest, newest })),
        recentTask,
      ]);
      if (requestId !== loadRequest.current) return;
      setCurrentLocation(current);
      setSpots(local.nearest.slice(0, 14));
      setNewSpots(local.newest ?? []);
      setNewError(local.newest === null);
      setRecentSearch(recent && user?.id ? { ...recent.search, actorId: user.id } : null);
      setRecentSpots(recent?.places ?? []);
      setRecentError(recent?.failed ?? false);
      void loadMoodContext([...local.nearest.slice(0, 14), ...(local.newest ?? []), ...(recent?.places ?? [])]);
    } catch {
      if (requestId === loadRequest.current) {
        setError("Die Orte konnten gerade nicht geladen werden.");
        setSpots([]);
        setCurrentLocation(null);
      }
    } finally {
      if (requestId === loadRequest.current) { setLoading(false); setRefreshing(false); }
    }
  }, [loadMoodContext, user?.id]);

  useFocusEffect(useCallback(() => {
    void load();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void load(); });
    return () => { subscription.remove(); ++loadRequest.current; ++moodRequest.current; };
  }, [load]));

  const topSpots = spots.slice(0, 6);
  const heroCardWidth = homeRailCardWidth(width, { minimum: 248, maximum: 356 });
  const heroCardHeight = Math.round(heroCardWidth * 1.08);
  const activeRecent = recentSearch?.actorId === user?.id ? recentSearch : null;

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
              {!loading ? <AppText role="meta" tone="secondary">{currentLocation ? `Nächste zuerst · bis ${HOME_NEARBY_RADIUS_KM} km Luftlinie` : "Ohne aktuellen Standort · Auswahl nach Stadt"}</AppText> : null}
            </View>
            <Pressable accessibilityRole="button" style={[styles.sectionLink, fontScale > 1.3 && { maxWidth: "100%" }]} onPress={() => router.push({ pathname: "/(tabs)/map", params: currentLocation ? { view: "map", lat: String(currentLocation.latitude), lng: String(currentLocation.longitude) } : { view: "list" } } as never)}>
              <AppText role="label" tone="pink">Alle ansehen</AppText>
            </Pressable>
          </View>

          {loading ? (
            <View accessibilityLabel="Orte werden geladen" style={[styles.heroSkeleton, { width: heroCardWidth, height: heroCardHeight }]} />
          ) : error ? (
            <View style={styles.stateWrap}><StateView actionLabel="Noch einmal" kind="error" message={error} onAction={() => void load()} title="Kurz den Faden verloren." /></View>
          ) : topSpots.length ? (
            <HomeSpotRail spots={topSpots} moods={spotMoods} moodCounts={moodCounts} location={currentLocation} label="Orte entdecken" />
          ) : (
            <View style={styles.stateWrap}><StateView kind="empty" title={currentLocation ? "Noch keine Orte in deiner Nähe" : "Noch keine Orte hier"} message={currentLocation ? `Im Umkreis von ${HOME_NEARBY_RADIUS_KM} km gibt es gerade keine freigegebenen Orte auf Backyrd.` : `Sobald es in ${city} Neues zu entdecken gibt, findest du es hier.`} /></View>
          )}

          <HomeMomentsSection city={city} revision={momentRevision} />

          <HomeEventsSection />

          {!loading && !error ? (
            <View>
              <View style={styles.sectionHeader}><View style={styles.sectionTitleBlock}>
                <AppText role="label" tone="secondary" style={styles.eyebrow}>GERADE DAZUGEKOMMEN</AppText>
                <AppText role="sectionTitle">Neu auf Backyrd</AppText>
                <AppText role="meta" tone="secondary">{currentLocation ? `In deinem Umkreis · bis ${HOME_NEARBY_RADIUS_KM} km` : `In ${city}`}</AppText>
              </View></View>
              {newError ? <View style={styles.stateWrap}><StateView kind="error" title="Neue Orte konnten nicht geladen werden" actionLabel="Noch einmal" onAction={() => void load()} /></View>
                : newSpots.length ? <HomeSpotRail spots={newSpots} moods={spotMoods} moodCounts={moodCounts} location={currentLocation} label="Neu auf Backyrd" />
                : <View style={styles.stateWrap}><StateView kind="empty" title="Hier kommt bald Neues dazu" message="Sobald neue Orte in dieser Gegend auf Backyrd sind, findest du sie hier." /></View>}
            </View>
          ) : null}

          {!loading && activeRecent ? <View>
            <View style={styles.sectionHeader}><View style={styles.sectionTitleBlock}>
              <AppText role="label" tone="secondary" style={styles.eyebrow}>DEINE LETZTE SUCHE</AppText>
              <AppText role="sectionTitle">{activeRecent.query}</AppText>
            </View></View>
            {recentError ? <View style={styles.stateWrap}><StateView kind="error" title="Deine Orte konnten nicht geladen werden" actionLabel="Noch einmal" onAction={() => void load()} /></View>
              : recentSpots.length ? <HomeSpotRail spots={recentSpots} moods={spotMoods} moodCounts={moodCounts} location={currentLocation} label={`Deine letzte Suche: ${activeRecent.query}`} />
              : <View style={styles.stateWrap}><StateView kind="empty" title="Keine Orte zum Anzeigen" message="Zu dieser Suche sind gerade keine Orte verfügbar." /></View>}
          </View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionTitleBlock: { flex: 1, minWidth: 0 },
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
  heroSkeleton: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl, borderRadius: theme.radius.xl, backgroundColor: theme.color.surfaceElevated },
  stateWrap: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl },
});
