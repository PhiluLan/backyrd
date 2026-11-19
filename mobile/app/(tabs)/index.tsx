import { useMinuteClock } from "../../hooks/useMinuteClock";
import type { OpeningSchedule } from "../../lib/discovery-opening-hours";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AppText, HomeTypographyProvider, ProductTextInput as TextInput } from "../../components/foundation/AppText";
import { SafeAreaView } from "react-native-safe-area-context";

import { HomeEventsSection } from "../../components/events/HomeEventsSection";
import { HomeMomentsSection } from "../../components/HomeMomentsSection";
import { HomeDisplayHeading } from "../../components/HomeDisplayHeading";
import { IconButton } from "../../components/foundation/Button";
import { NuknukAvatar } from "../../components/NuknukAvatar";
import { StateView } from "../../components/foundation/StateView";
import { loadDiscoveryOpeningSchedules } from "../../lib/discovery-opening-hours";
import { spotOpeningStatusNow, type SpotOpeningStatus } from "../../lib/spot-opening-status";
import { HomeSpotRail } from "../../components/HomeSpotRail";
import { readRecentDecisionSearch, type RecentDecisionSearch } from "../../lib/decision/recentDecisionSearch";
import { useSpotMoodCounts, loadSpotBrowseMoods } from "../../lib/mood-catalog";
import { useAuth } from "../../hooks/useAuth";
import { loadDiscoverySpots, type DiscoverySpot } from "../../lib/spot-images";
import { cityFromGeocode, type LocationCoordinates } from "../../lib/locationContext";
import { getPrivacySafeLocation, reverseGeocodePrivacySafe } from "../../lib/locationPrivacy";
import { loadHomeNearbySpots, loadNewestCitySpots, loadDiscoverySpotsByIds, validDiscoveryLocation, HOME_NEARBY_RADIUS_KM } from "../../lib/nearby-discovery";
import { withRequestDeadline } from "../../lib/requestDeadline";
import { supabase } from "../../lib/supabase";
import { homeRailCardWidth } from "../../lib/home-rail";
import { homeDaypart } from "../../lib/home-daypart";
import { useStartupContent } from "../../providers/StartupContentProvider";
import { backyrdTheme as theme, useBackyrdTheme, useSFPro } from "../../theme/backyrd";

function cleanName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default function HomeScreen() {
  const { user } = useAuth();
  return <HomeContent key={user?.id ?? "guest"} />;
}

function HomeContent() {
  const { color } = useBackyrdTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { reportHomeReady } = useStartupContent();
  const { width, fontScale } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [searchHint, setSearchHint] = useState<string | null>(null);
  const [momentRevision, setMomentRevision] = useState(0);
  const [city, setCity] = useState("Basel");
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [measuredGreeting, setMeasuredGreeting] = useState<{ name: string; width: number } | null>(null);
  const [spots, setSpots] = useState<DiscoverySpot[]>([]);
  const [newSpots, setNewSpots] = useState<DiscoverySpot[]>([]);
  const [recentSearch, setRecentSearch] = useState<(RecentDecisionSearch & { actorId: string }) | null>(null);
  const [recentSpots, setRecentSpots] = useState<DiscoverySpot[]>([]);
  const [recentError, setRecentError] = useState(false);
  const [newError, setNewError] = useState(false);
  const [openingSchedules, setOpeningSchedules] = useState<Record<string, OpeningSchedule>>({});
  const now = useMinuteClock();
  const daypart = homeDaypart(now);
  const headlineName = user ? firstName ?? "du" : null;
  const greetingBaseSize = Math.max(36, Math.min(48, Math.round(width * 0.12)));
  const greetingAvailableWidth = width - 2 * theme.layout.pageGutter - 8;
  const greetingDisplaySize = measuredGreeting?.name === headlineName
    ? Math.max(28, Math.min(greetingBaseSize, Math.floor(greetingBaseSize * greetingAvailableWidth / measuredGreeting.width)))
    : greetingBaseSize;
  const cockpitGreetingMetrics = {
    fontSize: greetingDisplaySize,
    lineHeight: Math.round(greetingDisplaySize * 1.06),
    letterSpacing: greetingDisplaySize * -0.075,
  };
  const openingStatuses: Record<string, SpotOpeningStatus> = Object.fromEntries(Object.entries(openingSchedules).map(([id, schedule]) => [id, spotOpeningStatusNow(schedule.rows, now, schedule.missingDayIsUnknown)]));
  const [spotMoods, setSpotMoods] = useState<Record<string, string[]>>({});
  const moodCounts = useSpotMoodCounts([...spots, ...newSpots, ...recentSpots].map(spot => spot.id));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);
  const [detailsReady, setDetailsReady] = useState(false);
  const [eventsReady, setEventsReady] = useState(false);
  const [momentsReadyCity, setMomentsReadyCity] = useState<string>();
  const [readyArtworkIds, setReadyArtworkIds] = useState<ReadonlySet<string>>(() => new Set());
  const onEventsReady = useCallback(() => setEventsReady(true), []);
  const onVisibleArtworkReady = useCallback((id: string) => {
    setReadyArtworkIds(ids => ids.has(id) ? ids : new Set([...ids, id]));
  }, []);

  const loadRequest = useRef(0);
  const moodRequest = useRef(0);
  const displayedCatalog = useRef<{ city: string; location: LocationCoordinates | null } | null>(null);
  const loadMoodContext = useCallback(async (catalog: DiscoverySpot[]) => {
    const requestId = ++moodRequest.current;
    try {
      const rows = await loadSpotBrowseMoods(catalog.map(spot => spot.id));
      if (requestId !== moodRequest.current) return;
      const labels: Record<string, string[]> = {};
      for (const row of rows) (labels[row.spot_id] ??= []).push(row.label);
      setSpotMoods(labels);
    } catch {
      if (requestId === moodRequest.current) setSpotMoods({});
    }
  }, []);

  const load = useCallback(async (refresh = false) => {
    const requestId = ++loadRequest.current;
    ++moodRequest.current;
    // Keep the mounted rails and their artwork visible during same-account refreshes.
    if (!displayedCatalog.current) setLoading(true);
    setDetailsReady(false);
    setRefreshing(refresh);
    setError(null);
    setLocationLabel(null);
    try {
      const [profile, location] = await Promise.all([
        user?.id ? withRequestDeadline(async signal => {
          const result = await supabase.from("profiles").select("city,first_name,display_name,username").eq("id", user.id).abortSignal(signal).maybeSingle();
          if (result.error) throw result.error;
          return result.data;
        }, 5_000).catch(() => undefined) : Promise.resolve(null),
        withRequestDeadline(() => getPrivacySafeLocation({ purpose: "nearby_discovery", requestPermission: false, forceConsentRefresh: true, allowLastKnown: false, timeoutMs: 5_000 }), 6_500).catch(() => null),
      ]);
      if (requestId !== loadRequest.current) return;
      const productCity = profile === undefined ? displayedCatalog.current?.city ?? "Basel" : cleanName(profile?.city) ?? "Basel";
      if (!displayedCatalog.current) setCity(productCity);
      if (profile !== undefined) {
        const profileName = cleanName(profile?.first_name) ?? cleanName(profile?.display_name) ?? cleanName(profile?.username);
        setFirstName(profileName ? profileName.split(/\s+/)[0] : null);
      }
      const point = location?.ok && location.source === "current" ? { latitude: location.location.coords.latitude, longitude: location.location.coords.longitude } : null;
      const current = validDiscoveryLocation(point) ? point : null;
      if (current && location?.ok && location.source === "current") {
        void withRequestDeadline(() => reverseGeocodePrivacySafe(location.location), 3_000).then(address => {
          if (requestId !== loadRequest.current || !address) return;
          const locatedCity = cityFromGeocode(address) ?? productCity;
          const district = cleanName(address.district);
          setLocationLabel(district && district.toLocaleLowerCase("de-CH") !== locatedCity.toLocaleLowerCase("de-CH") ? `${locatedCity}, ${district}` : locatedCity);
        }).catch(() => undefined);
      }
      if (!current && displayedCatalog.current?.location) {
        // A nearby catalog is no longer valid after losing the current location.
        displayedCatalog.current = null;
        setCurrentLocation(null);
        setSpots([]);
        setNewSpots([]);
        setLoading(true);
      }
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
      displayedCatalog.current = { city: productCity, location: current };
      setCity(productCity);
      setCurrentLocation(current);
      setSpots(local.nearest.slice(0, 14));
      setNewSpots(local.newest ?? []);
      setNewError(local.newest === null);
      setRecentSearch(recent && user?.id ? { ...recent.search, actorId: user.id } : null);
      setRecentSpots(recent?.places ?? []);
      setRecentError(recent?.failed ?? false);
      const openingHours = loadDiscoveryOpeningSchedules([...local.nearest.slice(0, 6), ...(local.newest ?? []), ...(recent?.places ?? [])])
        .then(statuses => { if (requestId === loadRequest.current) setOpeningSchedules(statuses); })
        .catch(() => { if (requestId === loadRequest.current) setOpeningSchedules({}); });
      void Promise.all([openingHours, loadMoodContext([...local.nearest.slice(0, 14), ...(local.newest ?? []), ...(recent?.places ?? [])])])
        .then(() => { if (requestId === loadRequest.current) setDetailsReady(true); });
    } catch {
      if (requestId === loadRequest.current) {
        displayedCatalog.current = null;
        setError("Die Orte konnten gerade nicht geladen werden.");
        setSpots([]);
        setNewSpots([]);
        setRecentSearch(null);
        setRecentSpots([]);
        setOpeningSchedules({});
        setSpotMoods({});
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
  const initialArtworkReady = topSpots.slice(0, 2).every(spot => readyArtworkIds.has(spot.id));
  const greetingReady = !useSFPro || !headlineName || measuredGreeting?.name === headlineName;
  const initialSectionsReady = eventsReady && (!user || (momentsReadyCity === city));
  useEffect(() => {
    if (!loading && (error || (detailsReady && initialArtworkReady && greetingReady && initialSectionsReady))) reportHomeReady?.();
  }, [detailsReady, error, greetingReady, initialArtworkReady, initialSectionsReady, loading, reportHomeReady]);
  const heroCardWidth = homeRailCardWidth(width, { minimum: 248, maximum: 356 });
  const heroCardHeight = Math.round(heroCardWidth * 1.08);
  const activeRecent = recentSearch?.actorId === user?.id ? recentSearch : null;

  function submitDecision(value = query) {
    const normalized = value.trim();
    const minimumLength = user ? 3 : 2;
    if (normalized.length < minimumLength) {
      setSearchHint(`Bitte gib mindestens ${minimumLength} Zeichen ein.`);
      return;
    }
    setSearchHint(null);
    if (!user) {
      router.push({ pathname: "/(tabs)/map", params: { view: "list", search: normalized } } as never);
      return;
    }
    router.push({ pathname: "/(tabs)/wohin", params: { query: normalized, auto: "1" } });
  }

  return (
    <HomeTypographyProvider>
    <SafeAreaView style={[styles.root, { backgroundColor: color.background }]} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={[styles.root, { backgroundColor: color.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} tintColor={color.pink} onRefresh={() => { void load(true); setMomentRevision(value => value + 1); }} />} showsVerticalScrollIndicator={false}>
          <View style={[styles.header, fontScale > 1.3 && styles.headerLargeType]}>
            <View style={[styles.greetingBlock, fontScale > 1.3 && styles.greetingBlockLargeType]}>
              <View style={styles.locationRow}>
                <Ionicons name="location-sharp" size={21} color={color.textSecondary} />
                <AppText role="bodyStrong" tone="secondary" style={styles.locationText}>{locationLabel ?? city}</AppText>
              </View>
            </View>
            <View style={[styles.headerActions, fontScale > 1.3 && styles.headerActionsLargeType]}>
              {user ? <>
                <IconButton accessibilityLabel="Benachrichtigungen" onPress={() => router.push("/safety-notifications" as never)}>
                  <Ionicons color={color.textPrimary} name="notifications-outline" size={30} />
                </IconButton>
                <IconButton accessibilityLabel="Mein Backyrd – Profil öffnen" style={styles.profileButton} onPress={() => router.push("/(tabs)/profile" as never)}>
                  <NuknukAvatar height={29} appearance="outline" />
                </IconButton>
              </> : <Pressable accessibilityRole="button" accessibilityLabel="Anmelden" onPress={() => router.push("/auth/login" as never)} style={[styles.guestLogin, { borderColor: color.border }]}>
                <AppText role="label" tone="pink">Anmelden</AppText>
              </Pressable>}
            </View>
          </View>

          {useSFPro && headlineName ? <AppText accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} role="displayXL" style={[styles.greetingMeasure, styles.cockpitGreeting, { color: color.textPrimary, fontSize: greetingBaseSize, lineHeight: Math.round(greetingBaseSize * 1.06), letterSpacing: greetingBaseSize * -0.075 }]} onTextLayout={event => {
            const measuredWidth = event.nativeEvent.lines[0]?.width ?? 0;
            if (measuredWidth > 0 && (measuredGreeting?.name !== headlineName || Math.abs(measuredGreeting.width - measuredWidth) > 1)) {
              setMeasuredGreeting({ name: headlineName, width: measuredWidth });
            }
          }}>Hey{"  "}{headlineName},</AppText> : null}
          <AppText accessibilityLabel={headlineName ? `Hey ${headlineName},` : "Hey"} numberOfLines={1} ellipsizeMode="tail" role="displayXL" style={[styles.pageTitle, useSFPro && styles.cockpitGreeting, useSFPro && cockpitGreetingMetrics, { color: color.textPrimary }]}>{headlineName ? <>Hey{useSFPro ? "  " : " "}<Text style={{ color: color.pink }}>{headlineName},</Text></> : "Hey"}</AppText>
          <AppText testID="home-daypart-title" accessibilityRole="header" role="displayM" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.daypartTitle}>
            Heute <Text style={styles.daypartAccent}>{daypart}</Text> schon was{"\u00a0"}vor<Text style={{ color: "#FFFFFF" }}>?</Text>
          </AppText>
          <View style={[styles.searchShell, { borderColor: color.border, backgroundColor: color.surfaceElevated }]}>
            <TextInput accessibilityLabel="Was willst du machen?" onChangeText={value => { setQuery(value); setSearchHint(null); }} onSubmitEditing={event => submitDecision(event.nativeEvent.text)} placeholder="was willst du machen?" placeholderTextColor={color.textSecondary} returnKeyType="search" style={[styles.searchInput, { color: color.textPrimary }]} value={query} />
            {query.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Suche starten" accessibilityHint="Sucht passende Orte für deine Eingabe" onPress={() => submitDecision()} style={styles.searchAction}>
              <Ionicons name="search" size={26} color={color.pink} />
            </Pressable> : null}
          </View>
          {searchHint ? <AppText role="caption" tone="error" style={styles.searchHint}>{searchHint}</AppText> : null}

          <View style={[styles.sectionHeader, currentLocation && styles.nearbySectionHeader, fontScale > 1.3 && { flexDirection: "column", alignItems: "flex-start" }]}>
            <View style={currentLocation ? styles.nearbyTitleBlock : styles.sectionTitleBlock}>
              {currentLocation
                ? <HomeDisplayHeading title="Orte in deiner Nähe" displayTitle="Orte  in  deiner  Nähe" accent="" />
                : <AppText role="sectionTitle">{currentLocation ? "Orte in deiner Nähe" : `Orte in ${city} entdecken`}</AppText>}
              {!loading && !currentLocation ? <AppText role="meta" tone="secondary">Ohne aktuellen Standort · Auswahl nach Stadt</AppText> : null}
            </View>
          </View>

          {loading ? (
            <View accessibilityLabel="Orte werden geladen" style={[styles.heroSkeleton, { width: heroCardWidth, height: heroCardHeight, backgroundColor: color.surfaceElevated }]} />
          ) : error ? (
            <View style={styles.stateWrap}><StateView actionLabel="Noch einmal" kind="error" message={error} onAction={() => void load()} title="Kurz den Faden verloren." /></View>
          ) : topSpots.length ? (
            <HomeSpotRail spots={topSpots} moods={spotMoods} moodCounts={moodCounts} openingStatuses={openingStatuses} location={currentLocation} label="Orte entdecken" onVisibleArtworkReady={reportHomeReady ? onVisibleArtworkReady : undefined} />
          ) : (
            <View style={styles.stateWrap}><StateView kind="empty" title={currentLocation ? "Noch keine Orte in deiner Nähe" : "Noch keine Orte hier"} message={currentLocation ? `Im Umkreis von ${HOME_NEARBY_RADIUS_KM} km gibt es gerade keine freigegebenen Orte auf Backyrd.` : `Sobald es in ${city} Neues zu entdecken gibt, findest du es hier.`} /></View>
          )}

          <HomeMomentsSection city={city} revision={momentRevision} onInitialContentReady={reportHomeReady ? setMomentsReadyCity : undefined} />

          <HomeEventsSection onInitialContentReady={reportHomeReady ? onEventsReady : undefined} />

          {!loading && !error ? (
            <View>
              <View style={styles.newSpotsHeading}><HomeDisplayHeading title="Neu auf backyrd" accent="" /></View>
              {newError ? <View style={styles.stateWrap}><StateView kind="error" title="Neue Orte konnten nicht geladen werden" actionLabel="Noch einmal" onAction={() => void load()} /></View>
                : newSpots.length ? <HomeSpotRail spots={newSpots} moods={spotMoods} moodCounts={moodCounts} openingStatuses={openingStatuses} location={currentLocation} label="Neu auf Backyrd" />
                : <View style={styles.stateWrap}><StateView kind="empty" title="Hier kommt bald Neues dazu" message="Sobald neue Orte in dieser Gegend auf Backyrd sind, findest du sie hier." /></View>}
            </View>
          ) : null}

          {!loading && activeRecent ? <View>
            <View style={styles.newSpotsHeading}>
              <HomeDisplayHeading title="Deine letzte Suche" accent="" />
              <AppText role="body" style={styles.recentQuery}>{activeRecent.query}</AppText>
            </View>
            {recentError ? <View style={styles.stateWrap}><StateView kind="error" title="Deine Orte konnten nicht geladen werden" actionLabel="Noch einmal" onAction={() => void load()} /></View>
              : recentSpots.length ? <HomeSpotRail spots={recentSpots} moods={spotMoods} moodCounts={moodCounts} openingStatuses={openingStatuses} location={currentLocation} label={`Deine letzte Suche: ${activeRecent.query}`} presentation="depth" />
              : <View style={styles.stateWrap}><StateView kind="empty" title="Keine Orte zum Anzeigen" message="Zu dieser Suche sind gerade keine Orte verfügbar." /></View>}
          </View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </HomeTypographyProvider>
  );
}

const styles = StyleSheet.create({
  sectionTitleBlock: { flex: 1, minWidth: 0 },
  nearbyTitleBlock: { alignSelf: "stretch", minWidth: 0 },
  root: { flex: 1, backgroundColor: theme.color.background },
  content: { paddingTop: theme.spacing.lg, paddingBottom: theme.control.tabBar + theme.spacing.display },
  header: { minHeight: 60, paddingHorizontal: theme.spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md },
  headerLargeType: { flexDirection: "column", alignItems: "stretch", gap: theme.spacing.sm },
  greetingBlock: { flex: 1, minWidth: 0 },
  greetingBlockLargeType: { flex: 0 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { fontSize: 18, lineHeight: 24 },
  headerActionsLargeType: { alignSelf: "flex-end" },
  pageTitle: { marginTop: theme.spacing.lg, marginHorizontal: theme.layout.pageGutter, textAlign: "left" },
  greetingMeasure: { position: "absolute", left: 0, top: 0, width: 10000, opacity: 0 },
  cockpitGreeting: { color: "#F8F8F8", fontWeight: "700" },
  daypartTitle: { marginTop: theme.spacing.xs, marginHorizontal: theme.layout.pageGutter, alignSelf: "stretch", fontSize: 22, lineHeight: 30 },
  daypartAccent: { textDecorationLine: "underline", textDecorationStyle: "solid", textDecorationColor: theme.color.pink },
  headerActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  profileButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#141416", borderWidth: 1, borderColor: "rgba(255,67,142,0.28)" },
  guestLogin: { minHeight: 44, justifyContent: "center", paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border },
  searchShell: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl, minHeight: 68, paddingHorizontal: theme.spacing.lg, paddingRight: theme.spacing.xs, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, backgroundColor: theme.color.surfaceElevated },
  searchInput: { flex: 1, minWidth: 0, minHeight: 68, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 18, paddingVertical: 12 },
  searchAction: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.pill },
  searchHint: { marginHorizontal: theme.layout.pageGutter, marginTop: theme.spacing.xs },
  eyebrow: { letterSpacing: 1.15, marginBottom: 6 },
  sectionHeader: { marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.xl, minHeight: 52, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: theme.spacing.md },
  nearbySectionHeader: { flexDirection: "column", alignItems: "stretch", gap: 0 },
  newSpotsHeading: { marginTop: theme.spacing.xxl, paddingHorizontal: theme.layout.pageGutter },
  recentQuery: { marginTop: theme.spacing.sm, fontSize: 16, lineHeight: 24, fontStyle: "italic" },
  heroSkeleton: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl, borderRadius: theme.radius.xl, backgroundColor: theme.color.surfaceElevated },
  stateWrap: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl },
});
