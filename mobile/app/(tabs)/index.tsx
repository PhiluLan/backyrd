import { useMinuteClock } from "../../hooks/useMinuteClock";
import type { OpeningSchedule } from "../../lib/discovery-opening-hours";
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
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AppText, ProductTextInput as TextInput } from "../../components/foundation/AppText";
import { SafeAreaView } from "react-native-safe-area-context";

import { HomeEventsSection } from "../../components/events/HomeEventsSection";
import { HomeMomentsSection } from "../../components/HomeMomentsSection";
import Avatar from "../../components/Avatar";
import { IconButton } from "../../components/foundation/Button";
import { StateView } from "../../components/foundation/StateView";
import { loadDiscoveryOpeningSchedules } from "../../lib/discovery-opening-hours";
import { spotOpeningStatusNow, type SpotOpeningStatus } from "../../lib/spot-opening-status";
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
import { homeDaypart } from "../../lib/home-daypart";
import { backyrdTheme as theme, useSFPro } from "../../theme/backyrd";

function cleanName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width, fontScale } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [searchHint, setSearchHint] = useState<string | null>(null);
  const [momentRevision, setMomentRevision] = useState(0);
  const [city, setCity] = useState("Basel");
  const [firstName, setFirstName] = useState<string | null>(null);
  const [measuredGreeting, setMeasuredGreeting] = useState<{ name: string; width: number } | null>(null);
  const [measuredNearbyTitle, setMeasuredNearbyTitle] = useState<{ baseSize: number; width: number } | null>(null);
  const [profileAvatar, setProfileAvatar] = useState<{ userId: string; uri: string | null } | null>(null);
  const [spots, setSpots] = useState<DiscoverySpot[]>([]);
  const [newSpots, setNewSpots] = useState<DiscoverySpot[]>([]);
  const [recentSearch, setRecentSearch] = useState<(RecentDecisionSearch & { actorId: string }) | null>(null);
  const [recentSpots, setRecentSpots] = useState<DiscoverySpot[]>([]);
  const [recentError, setRecentError] = useState(false);
  const [newError, setNewError] = useState(false);
  const [openingSchedules, setOpeningSchedules] = useState<Record<string, OpeningSchedule>>({});
  const now = useMinuteClock();
  const daypart = homeDaypart(now);
  const [measuredDaypartTitle, setMeasuredDaypartTitle] = useState<{ daypart: string; width: number } | null>(null);
  const daypartTitleWidth = width - 2 * theme.layout.pageGutter - 8;
  const daypartTitleSize = measuredDaypartTitle?.daypart === daypart
    ? Math.min(31, Math.floor(31 * daypartTitleWidth / measuredDaypartTitle.width))
    : 31;
  const daypartTextStyle = { fontSize: daypartTitleSize, lineHeight: Math.round(daypartTitleSize * 38 / 31) };
  const headlineName = user ? firstName ?? "du" : null;
  const greetingBaseSize = Math.max(56, Math.min(72, Math.round(width * 0.18)));
  const greetingAvailableWidth = width - 2 * theme.layout.pageGutter - 8;
  const greetingDisplaySize = measuredGreeting?.name === headlineName
    ? Math.max(28, Math.min(greetingBaseSize, Math.floor(greetingBaseSize * greetingAvailableWidth / measuredGreeting.width)))
    : greetingBaseSize;
  const cockpitGreetingMetrics = {
    fontSize: greetingDisplaySize,
    lineHeight: Math.round(greetingDisplaySize * 1.06),
    letterSpacing: greetingDisplaySize * -0.075,
  };
  const nearbyTitleSize = measuredNearbyTitle?.baseSize === greetingBaseSize
    ? Math.max(28, Math.min(greetingDisplaySize, Math.floor(greetingBaseSize * greetingAvailableWidth / measuredNearbyTitle.width)))
    : greetingDisplaySize;
  const nearbyTitleMetrics = {
    fontSize: nearbyTitleSize,
    lineHeight: Math.round(nearbyTitleSize * 1.06),
    letterSpacing: nearbyTitleSize * -0.075,
  };
  const openingStatuses: Record<string, SpotOpeningStatus> = Object.fromEntries(Object.entries(openingSchedules).map(([id, schedule]) => [id, spotOpeningStatusNow(schedule.rows, now, schedule.missingDayIsUnknown)]));
  const [spotMoods, setSpotMoods] = useState<Record<string, string[]>>({});
  const moodCounts = useSpotMoodCounts([...spots, ...newSpots, ...recentSpots].map(spot => spot.id));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);

  const loadRequest = useRef(0);
  const moodRequest = useRef(0);
  const loadMoodContext = useCallback(async (catalog: DiscoverySpot[]) => {
    const requestId = ++moodRequest.current;
    setSpotMoods({});
    try {
      const rows = await loadSpotBrowseMoods(catalog.map(spot => spot.id));
      if (requestId !== moodRequest.current) return;
      const labels: Record<string, string[]> = {};
      for (const row of rows) (labels[row.spot_id] ??= []).push(row.label);
      setSpotMoods(labels);
    } catch { /* Moods enrich discovery without blocking the catalog. */ }
  }, []);

  const load = useCallback(async (refresh = false) => {
    const requestId = ++loadRequest.current;
    ++moodRequest.current;
    setOpeningSchedules({});
    setCurrentLocation(null);
    setSpots([]);
    setNewSpots([]);
    setRecentSearch(null);
    setRecentSpots([]);
    setRecentError(false);
    setNewError(false);
    setSpotMoods({});
    setLoading(true);
    setRefreshing(refresh);
    setError(null);
    try {
      const [profile, location] = await Promise.all([
        user?.id ? withRequestDeadline(async signal => {
          const result = await supabase.from("profiles").select("city,first_name,display_name,username,avatar_url").eq("id", user.id).abortSignal(signal).maybeSingle();
          return result.data;
        }, 5_000).catch(() => null) : Promise.resolve(null),
        withRequestDeadline(() => getPrivacySafeLocation({ purpose: "nearby_discovery", requestPermission: false, forceConsentRefresh: true, allowLastKnown: false, timeoutMs: 5_000 }), 6_500).catch(() => null),
      ]);
      if (requestId !== loadRequest.current) return;
      const productCity = cleanName(profile?.city) ?? "Basel";
      setCity(productCity);
      setProfileAvatar(user?.id ? { userId: user.id, uri: cleanName(profile?.avatar_url) } : null);
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
      void loadDiscoveryOpeningSchedules([...local.nearest.slice(0, 6), ...(local.newest ?? []), ...(recent?.places ?? [])])
        .then(statuses => { if (requestId === loadRequest.current) setOpeningSchedules(statuses); })
        .catch(() => { /* Unavailable hours stay unknown; place discovery remains usable. */ });
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
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.color.pink} onRefresh={() => { void load(true); setMomentRevision(value => value + 1); }} />} showsVerticalScrollIndicator={false}>
          <View style={[styles.header, fontScale > 1.3 && styles.headerLargeType]}>
            <View style={[styles.greetingBlock, fontScale > 1.3 && styles.greetingBlockLargeType]}>
              <View style={styles.locationRow}>
                <Ionicons name="location-sharp" size={21} color={theme.color.textSecondary} />
                <AppText role="bodyStrong" tone="secondary" style={styles.locationText}>{city}</AppText>
              </View>
            </View>
            <View style={[styles.headerActions, fontScale > 1.3 && styles.headerActionsLargeType]}>
              {user ? <>
                <IconButton accessibilityLabel="Benachrichtigungen" onPress={() => router.push("/safety-notifications" as never)}>
                  <Ionicons color={theme.color.textPrimary} name="notifications-outline" size={30} />
                </IconButton>
                <Pressable accessibilityLabel="Profil öffnen" accessibilityRole="button" hitSlop={8} onPress={() => router.push("/(tabs)/profile" as never)}>
                  <Avatar uri={profileAvatar?.userId === user.id ? profileAvatar.uri : null} name={firstName ?? user.email ?? "backyrd"} size={50} fallback="smiley" />
                </Pressable>
              </> : <Pressable accessibilityRole="button" accessibilityLabel="Anmelden" onPress={() => router.push("/auth/login" as never)} style={styles.guestLogin}>
                <AppText role="label" tone="pink">Anmelden</AppText>
              </Pressable>}
            </View>
          </View>

          {useSFPro && headlineName ? <AppText accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} role="displayXL" style={[styles.greetingMeasure, styles.cockpitGreeting, { fontSize: greetingBaseSize, lineHeight: Math.round(greetingBaseSize * 1.06), letterSpacing: greetingBaseSize * -0.075 }]} onTextLayout={event => {
            const measuredWidth = event.nativeEvent.lines[0]?.width ?? 0;
            if (measuredWidth > 0 && (measuredGreeting?.name !== headlineName || Math.abs(measuredGreeting.width - measuredWidth) > 1)) {
              setMeasuredGreeting({ name: headlineName, width: measuredWidth });
            }
          }}>Hey,{"  "}{headlineName}</AppText> : null}
          <AppText accessibilityLabel={headlineName ? `Hey, ${headlineName}` : "Hey"} numberOfLines={1} ellipsizeMode="tail" role="displayXL" style={[styles.pageTitle, useSFPro && styles.cockpitGreeting, useSFPro && cockpitGreetingMetrics]}>{headlineName ? <>Hey,{useSFPro ? "  " : " "}<Text style={styles.pinkAccent}>{headlineName}</Text></> : "Hey"}</AppText>
          <AppText accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} role="displayM" style={styles.daypartMeasure} onLayout={event => {
            const measuredWidth = event.nativeEvent.layout.width;
            if (measuredWidth > 0 && (measuredDaypartTitle?.daypart !== daypart || Math.abs(measuredDaypartTitle.width - measuredWidth) > 1)) {
              setMeasuredDaypartTitle({ daypart, width: measuredWidth });
            }
          }}>Heute {daypart} schon was vor?</AppText>
          <View accessible accessibilityLabel={`Heute ${daypart} schon was vor?`} accessibilityRole="text" style={styles.daypartTitleRow}>
            <AppText numberOfLines={1} role="displayM" style={daypartTextStyle}>Heute </AppText>
            <View style={styles.daypartAccent}>
              <AppText numberOfLines={1} role="displayM" style={daypartTextStyle}>{daypart}{" "}</AppText>
              <View pointerEvents="none" style={styles.daypartUnderline} />
            </View>
            <AppText numberOfLines={1} role="displayM" style={daypartTextStyle}>schon was vor<Text style={styles.pinkAccent}>?</Text></AppText>
          </View>
          <View style={styles.searchShell}>
            <TextInput accessibilityLabel="Was willst du machen?" onChangeText={value => { setQuery(value); setSearchHint(null); }} onSubmitEditing={event => submitDecision(event.nativeEvent.text)} placeholder="was willst du machen?" placeholderTextColor={theme.color.textSecondary} returnKeyType="search" style={styles.searchInput} value={query} />
            {query.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Suche starten" accessibilityHint="Sucht passende Orte für deine Eingabe" onPress={() => submitDecision()} style={styles.searchAction}>
              <Ionicons name="search" size={26} color={theme.color.pink} />
            </Pressable> : null}
          </View>
          {searchHint ? <AppText role="caption" tone="error" style={styles.searchHint}>{searchHint}</AppText> : null}

          <View style={[styles.sectionHeader, currentLocation && styles.nearbySectionHeader, fontScale > 1.3 && { flexDirection: "column", alignItems: "flex-start" }]}>
            <View style={currentLocation ? styles.nearbyTitleBlock : styles.sectionTitleBlock}>
              {currentLocation && useSFPro
                ? <>
                    <AppText accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" numberOfLines={1} role="displayXL" style={[styles.greetingMeasure, styles.cockpitGreeting, { fontSize: greetingBaseSize, lineHeight: Math.round(greetingBaseSize * 1.06), letterSpacing: greetingBaseSize * -0.075 }]} onTextLayout={event => {
                      const measuredWidth = event.nativeEvent.lines[0]?.width ?? 0;
                      if (measuredWidth > 0 && (measuredNearbyTitle?.baseSize !== greetingBaseSize || Math.abs(measuredNearbyTitle.width - measuredWidth) > 1)) {
                        setMeasuredNearbyTitle({ baseSize: greetingBaseSize, width: measuredWidth });
                      }
                    }}>Orte{"  "}in{"  "}deiner{"  "}Nähe</AppText>
                    <AppText accessibilityLabel="Orte in deiner Nähe" numberOfLines={1} ellipsizeMode="tail" role="displayXL" style={[styles.cockpitGreeting, nearbyTitleMetrics]}>Orte{"  "}in{"  "}deiner{"  "}<Text style={styles.pinkAccent}>Nähe</Text></AppText>
                  </>
                : <AppText role="sectionTitle">{currentLocation ? "Orte in deiner Nähe" : `Orte in ${city} entdecken`}</AppText>}
              {!loading && !currentLocation ? <AppText role="meta" tone="secondary">Ohne aktuellen Standort · Auswahl nach Stadt</AppText> : null}
            </View>
          </View>

          {loading ? (
            <View accessibilityLabel="Orte werden geladen" style={[styles.heroSkeleton, { width: heroCardWidth, height: heroCardHeight }]} />
          ) : error ? (
            <View style={styles.stateWrap}><StateView actionLabel="Noch einmal" kind="error" message={error} onAction={() => void load()} title="Kurz den Faden verloren." /></View>
          ) : topSpots.length ? (
            <HomeSpotRail spots={topSpots} moods={spotMoods} moodCounts={moodCounts} openingStatuses={openingStatuses} location={currentLocation} label="Orte entdecken" />
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
                : newSpots.length ? <HomeSpotRail spots={newSpots} moods={spotMoods} moodCounts={moodCounts} openingStatuses={openingStatuses} location={currentLocation} label="Neu auf Backyrd" />
                : <View style={styles.stateWrap}><StateView kind="empty" title="Hier kommt bald Neues dazu" message="Sobald neue Orte in dieser Gegend auf Backyrd sind, findest du sie hier." /></View>}
            </View>
          ) : null}

          {!loading && activeRecent ? <View>
            <View style={styles.sectionHeader}><View style={styles.sectionTitleBlock}>
              <AppText role="label" tone="secondary" style={styles.eyebrow}>DEINE LETZTE SUCHE</AppText>
              <AppText role="sectionTitle">{activeRecent.query}</AppText>
            </View></View>
            {recentError ? <View style={styles.stateWrap}><StateView kind="error" title="Deine Orte konnten nicht geladen werden" actionLabel="Noch einmal" onAction={() => void load()} /></View>
              : recentSpots.length ? <HomeSpotRail spots={recentSpots} moods={spotMoods} moodCounts={moodCounts} openingStatuses={openingStatuses} location={currentLocation} label={`Deine letzte Suche: ${activeRecent.query}`} />
              : <View style={styles.stateWrap}><StateView kind="empty" title="Keine Orte zum Anzeigen" message="Zu dieser Suche sind gerade keine Orte verfügbar." /></View>}
          </View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  daypartMeasure: { position: "absolute", left: 0, top: 0, opacity: 0, fontSize: 31, lineHeight: 38 },
  daypartTitleRow: { marginTop: theme.spacing.xs, marginHorizontal: theme.layout.pageGutter, flexDirection: "row", flexWrap: "nowrap", alignItems: "baseline" },
  daypartAccent: { position: "relative" },
  daypartUnderline: { position: "absolute", left: 1, right: 6, bottom: -2, height: 9, borderBottomWidth: 3, borderBottomColor: theme.color.pink, borderBottomLeftRadius: 28, borderBottomRightRadius: 18, transform: [{ rotate: "-2deg" }] },
  pinkAccent: { color: theme.color.pink },
  headerActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  guestLogin: { minHeight: 44, justifyContent: "center", paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border },
  searchShell: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl, minHeight: 68, paddingHorizontal: theme.spacing.lg, paddingRight: theme.spacing.xs, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, backgroundColor: theme.color.surfaceElevated },
  searchInput: { flex: 1, minWidth: 0, minHeight: 68, color: theme.color.textPrimary, fontFamily: theme.type.body, fontSize: 18, paddingVertical: 12 },
  searchAction: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.pill },
  searchHint: { marginHorizontal: theme.layout.pageGutter, marginTop: theme.spacing.xs },
  eyebrow: { letterSpacing: 1.15, marginBottom: 6 },
  sectionHeader: { marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.xl, minHeight: 52, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: theme.spacing.md },
  nearbySectionHeader: { flexDirection: "column", alignItems: "stretch", gap: 0 },
  heroSkeleton: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl, borderRadius: theme.radius.xl, backgroundColor: theme.color.surfaceElevated },
  stateWrap: { marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.xl },
});
