// backyrd/mobile/app/map.tsx

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { View, Alert, RefreshControl, Platform, Pressable, ScrollView, StyleSheet, Dimensions, Animated, FlatList, PanResponder, Modal, useWindowDimensions, type ViewToken } from "react-native";
import { AppText, ProductText as Text, ProductTextInput as TextInput } from "../../components/foundation/AppText";

import ClusteredMapView from "react-native-map-clustering";
import { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";

import { OpeningStatusBadge } from "../../components/spot/OpeningStatusBadge";
import { spotOpeningStatusNow, type SpotHoursRow } from "../../lib/spot-opening-status";
import { useSpotsStore } from "../../lib/useSpotsStore";
import { useAuth } from "../../hooks/useAuth";
import { useDebounce } from "use-debounce";
import { supabase } from "../../lib/supabase";
import { cityCenterFor, normalizeLocationCity, resolveLocationContext } from "../../lib/locationContext";
import { hasActiveConsent } from "../../lib/consent";
import { useSpotMoodCounts, loadSpotBrowseMoods, useMoodCatalog } from "../../lib/mood-catalog";
import { trackAnalyticsEvent } from "../../lib/analytics";
import { MoodSignature } from "../../components/spot/MoodSignature";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { Button, IconButton } from "../../components/foundation/Button";
import { Chip } from "../../components/foundation/Chip";
import { StateView } from "../../components/foundation/StateView";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { clusterPolicyFor, resolveMapZoomBucket, type MapZoomBucket } from "../../lib/mapDiscoveryPolicy";
import { spotMatchesSearch } from "../../lib/spot-search";

import { loadDiscoveryOpeningSchedules, type OpeningSchedule } from "../../lib/discovery-opening-hours";
import { useMinuteClock } from "../../hooks/useMinuteClock";

const BASEL = { latitude: 47.5596, longitude: 7.5886 };

function displayMoodLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const localized: Record<string, string> = {
    gemutlich: "Gemütlich",
    gemuetlich: "Gemütlich",
    lassig: "Lässig",
    laessig: "Lässig",
    "klassisch franzosisch": "Klassisch französisch",
    "klassisch französisch": "Klassisch französisch",
  };
  return localized[normalized] ?? normalized.replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
const { height: SCREEN_H } = Dimensions.get("window");
const SNAP_COLLAPSED = 400;
const SHEET_HEIGHT = SCREEN_H;
const OFFSET_COLLAPSED = SHEET_HEIGHT - SNAP_COLLAPSED;
const OFFSET_FULL = 0;
const OFFSET_HIDDEN = SHEET_HEIGHT + 40;

type DbCategory = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
};

type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  city?: string | null;
  header_photo_url?: string | null;
  spot_hours?: SpotHoursRow[];
  category_id?: string | null;
  categories?: { name?: string | null; color?: string | null } | null;
};

export default function MapScreen() {
  const { fontScale } = useWindowDimensions();
  const { spots: globalSpots, refresh, loading, error: spotsError } = useSpotsStore();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ spotIds?: string; view?: string; lat?: string; lng?: string; search?: string; mood?: string }>();
  const explicitMapIntent = params.view === "map" || Boolean(params.lat && params.lng);

  // Wenn von der Startseite Spot-IDs übergeben wurden → nur diese anzeigen
  const initialSpotIdList = useMemo(
    () =>
      params.spotIds
        ? params.spotIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
    [params.spotIds]
  );

  // Mood-Daten: spotId → [token1, token2, ...]
  const [spotMoods, setSpotMoods] = useState<Record<string, string[]>>({});
  const moodCounts = useSpotMoodCounts(globalSpots.map(spot => spot.id));

  // Mapping: spotId → [mood_id1, mood_id2, ...]
  const [spotMoodIds, setSpotMoodIds] = useState<Record<string, string[]>>({});

  const { options: moodOptions, state: moodCatalogState, retry: retryMoodCatalog } = useMoodCatalog();
  const [moodProfilesFailed, setMoodProfilesFailed] = useState(false);
  const [moodProfilesLoading, setMoodProfilesLoading] = useState(true);
  const [moodRevision, setMoodRevision] = useState(0);

  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const [profileCity, setProfileCity] = useState<string | null>(null);
  const [mapCity, setMapCity] = useState<string | null>(null);
  const [region, setRegion] = useState(() => ({
    latitude: Number(params.lat) || BASEL.latitude,
    longitude: Number(params.lng) || BASEL.longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  }));
  const [zoomBucket, setZoomBucket] = useState<MapZoomBucket>("city");

  // Auswahl: Mood über Chip
  const [selectedMood, setSelectedMood] = useState<string | null>(params.mood ?? null);
  const [selectedMoodId, setSelectedMoodId] = useState<string | null>(null);
  const [moodResolverFailed, setMoodResolverFailed] = useState(false);

  // Mood, der aus der freien Suche kommt
  const [searchMoodId, setSearchMoodId] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState(params.search ?? "");
  const [debouncedSearch] = useDebounce(search, 350);

  useEffect(() => { if (params.search !== undefined) setSearch(params.search); }, [params.search]);
  useEffect(() => { if (params.mood !== undefined) setSelectedMood(params.mood); }, [params.mood]);

  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const now = useMinuteClock();
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [openingSchedules, setOpeningSchedules] = useState<Record<string, OpeningSchedule>>({});
  const onVisibleChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<Spot>[] }) => {
    setVisibleIds(viewableItems.filter(row => row.isViewable).map(row => row.item.id));
  }).current;

  const [viewMode, setViewMode] = useState<"map" | "list">(explicitMapIntent ? "map" : "list");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const mapRef = useRef<ClusteredMapView | null>(null);
  const centeredProfileCity = useRef<string | null>(null);
  const listRef = useRef<FlatList<Spot> | null>(null);
  const [refreshingPlaces, setRefreshingPlaces] = useState(false);
  const listScrollOffset = useRef(0);
  const [locationConsentGranted, setLocationConsentGranted] = useState(false);
  const clusterPolicy = useMemo(() => clusterPolicyFor(zoomBucket), [zoomBucket]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!user?.id) {
      setProfileCity(null);
      return () => { active = false; };
    }
    void supabase.from("profiles").select("city").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (active) setProfileCity(normalizeLocationCity(data?.city));
    });
    return () => { active = false; };
  }, [user?.id]));

  useEffect(() => {
    if (params.lat && params.lng) {
      centeredProfileCity.current = null;
      setMapCity(null);
      return;
    }
    if (!profileCity) {
      centeredProfileCity.current = null;
      setMapCity(null);
      return;
    }
    if (centeredProfileCity.current === profileCity) return;
    const cityCenter = cityCenterFor(profileCity);
    const citySpot = profileCity
      ? globalSpots.find((spot) => normalizeLocationCity(spot.city) === profileCity)
      : null;
    const center = cityCenter ?? (citySpot ? { latitude: citySpot.lat, longitude: citySpot.lng } : null);
    if (!center) {
      setMapCity(null);
      return;
    }
    centeredProfileCity.current = profileCity;
    setMapCity(profileCity);
    const next = { ...center, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    setRegion(next);
    (mapRef.current as unknown as { animateToRegion?: (value: typeof next, duration: number) => void })
      ?.animateToRegion?.(next, 400);
  }, [profileCity, globalSpots, params.lat, params.lng]);

  const refreshLocationConsent = React.useCallback(async () => {
    const granted = await hasActiveConsent("precise_location", {
      forceRefresh: true,
    });
    setLocationConsentGranted(granted);
    return granted;
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void refreshLocationConsent();
    }, [refreshLocationConsent]),
  );

  /* =============================================================
     LOAD DATA
  ============================================================= */
  useEffect(() => {
    refresh();

    (async () => {
      // Kategorien laden
      const { data: catRows } = await supabase
        .from("categories")
        .select("id,name,icon,color")
        .limit(200);

      setDbCategories(catRows || []);
    })();
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setMoodProfilesLoading(true);
    setMoodProfilesFailed(false);
    void loadSpotBrowseMoods(globalSpots.map(spot => spot.id)).then(rows => {
      if (!active) return;
      const labels: Record<string, string[]> = {}, concepts: Record<string, string[]> = {};
      for (const row of rows) {
        (labels[row.spot_id] ??= []).push(row.label);
        (concepts[row.spot_id] ??= []).push(row.concept_key);
      }
      setSpotMoods(labels); setSpotMoodIds(concepts);
    }).catch(() => { if (active) setMoodProfilesFailed(true); })
      .finally(() => { if (active) setMoodProfilesLoading(false); });
    return () => { active = false; };
  // The retry revision intentionally reruns this read without changing its query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSpots, moodRevision]));

  useEffect(() => {
    let active = true;
    setSelectedMoodId(null);
    setMoodResolverFailed(false);
    if (!selectedMood) return () => { active = false; };
    const known = moodOptions.find(option => option.label.toLowerCase() === selectedMood.toLowerCase());
    if (known) { setSelectedMoodId(known.concept_key); return () => { active = false; }; }
    void supabase.rpc("backyrd_resolve_mood_input_v2", { p_input: selectedMood }).then(({ data, error }) => {
      if (!active) return;
      if (!error && data?.status === "RESOLVED") setSelectedMoodId(data.conceptKey);
      else if (error) setMoodResolverFailed(true);
    });
    return () => { active = false; };
  }, [selectedMood, moodOptions]);

  // Resolve a complete Mood expression; ordinary place/name search stays independent.
  useEffect(() => {
    let active = true;
    setSearchMoodId(null);
    if (debouncedSearch.trim().length < 2) return () => { active = false; };
    void supabase.rpc("backyrd_resolve_mood_input_v2", { p_input: debouncedSearch.trim() }).then(({ data, error }) => {
      if (active && !error && data?.status === "RESOLVED") setSearchMoodId(data.conceptKey);
    });
    return () => { active = false; };
  }, [debouncedSearch]);

  /* =============================================================
     FILTER LOGIC
  ============================================================= */

  const spotMatchesMood = React.useCallback((spot: Spot) => {
    if ((moodProfilesFailed || moodResolverFailed) && (selectedMood || searchMoodId)) return false;
    const ids = spotMoodIds[spot.id] || [];

    // Effektive Mood-IDs aus Chip + Suche
    const combined = [selectedMoodId, searchMoodId].filter(
      (v): v is string => typeof v === "string"
    );

    if (combined.length === 0) return !selectedMood;
    return combined.every(mid => ids.includes(mid));
  }, [searchMoodId, selectedMoodId, selectedMood, spotMoodIds, moodProfilesFailed, moodResolverFailed]);

  const filteredSpots = useMemo(() => {
    let base = globalSpots;

    // Wenn von der Startseite Spot-IDs übergeben wurden
    if (initialSpotIdList && initialSpotIdList.length > 0) {
      const idSet = new Set(initialSpotIdList);
      base = base.filter((s) => idSet.has(s.id));
    }

    return base.filter((s) => {
      if (!spotMatchesMood(s)) return false;
      if (selectedCategory && s.category_id !== selectedCategory) return false;
      if (debouncedSearch.trim() && !searchMoodId && !spotMatchesSearch(s, debouncedSearch, spotMoods[s.id] ?? []))
        return false;
      return true;
    });
  }, [
    globalSpots,
    selectedCategory,
    debouncedSearch,
    initialSpotIdList,
    spotMatchesMood,
    spotMoods,
    searchMoodId,
  ]);

  const openingCandidates = useMemo(() => viewMode === "map" ? (selectedSpot ? [selectedSpot] : []) : filteredSpots.filter((spot, index) => visibleIds.length ? visibleIds.includes(spot.id) : index < 8), [viewMode, selectedSpot, filteredSpots, visibleIds]);
  useEffect(() => {
    let active = true;
    void loadDiscoveryOpeningSchedules(openingCandidates.map(spot => ({ id: spot.id, hours: spot.spot_hours ?? [] }))).then(schedules => { if (active) setOpeningSchedules(schedules); });
    return () => { active = false; };
  }, [openingCandidates]);
  const openingStatus = (id: string) => {
    const schedule = openingSchedules[id];
    return schedule ? spotOpeningStatusNow(schedule.rows, now, schedule.missingDayIsUnknown) : "unknown";
  };

  useEffect(() => {
    if (viewMode === "list") {
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: listScrollOffset.current, animated: false }));
    }
  }, [viewMode]);

  const handleRegionChangeComplete = useCallback((nextRegion: typeof region) => {
    setRegion(nextRegion);
    setZoomBucket((current) => resolveMapZoomBucket(nextRegion.latitudeDelta, current));
  }, []);

  const changeViewMode = useCallback((nextView: "map" | "list") => {
    if (nextView === viewMode) return;
    setViewMode(nextView);
  }, [viewMode]);

  /* =============================================================
     MAP RENDERING
  ============================================================= */

  const renderedMarkers = filteredSpots.filter(spot => Number.isFinite(spot.lat) && Number.isFinite(spot.lng) && Math.abs(spot.lat) <= 90 && Math.abs(spot.lng) <= 180).map((spot) => {
    const isSelected = selectedSpot?.id === spot.id;
    return (
        <Marker
          key={spot.id}
          coordinate={{ latitude: spot.lat, longitude: spot.lng }}
          tracksViewChanges={isSelected}
          accessibilityLabel={`${spot.name} auf der Karte`}
          onPress={(e) => {
            e.stopPropagation();
            setSelectedSpot(spot);
            void trackAnalyticsEvent({
              eventName: "map_marker_opened",
              screenName: "map",
              entityType: "spot",
              entityId: spot.id,
              spotId: spot.id,
              properties: { view_mode: viewMode },
            });
            openSheetCollapsed();
          }}
        >
          <View style={[styles.marker, isSelected && styles.markerSelected]}>
            <View style={[styles.markerCore, isSelected && styles.markerCoreSelected]} />
          </View>
        </Marker>
      );
  });

  const clearFilters = () => {
    setSelectedMood(null);
    setSelectedMoodId(null);
    setSearchMoodId(null);
    setSelectedCategory(null);
    setSearch("");
  };

  const clearSelectedMood = () => {
    const activeMood = selectedMood;
    setSelectedMood(null);
    setSelectedMoodId(null);
    if (activeMood && search.toLowerCase() === activeMood.toLowerCase()) setSearch("");
  };

  const activeFilters = [
    selectedMood
      ? { id: "mood", label: selectedMood, onRemove: clearSelectedMood }
      : null,
    selectedCategory
      ? {
          id: "category",
          label: dbCategories.find((category) => category.id === selectedCategory)?.name ?? "Kategorie",
          onRemove: () => setSelectedCategory(null),
        }
      : null,
  ].filter((filter): filter is { id: string; label: string; onRemove: () => void } => Boolean(filter));

  /* =============================================================
     BOTTOM SHEET
  ============================================================= */

  const translateY = useRef(new Animated.Value(OFFSET_HIDDEN)).current;
  const lastOffset = useRef(OFFSET_HIDDEN);

  const snapTo = useCallback((offset: number, velocity = 0) => {
    lastOffset.current = offset;
    Animated.spring(translateY, {
      toValue: offset,
      useNativeDriver: true,
      velocity,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
    }).start();
  }, [translateY]);

  const openSheetCollapsed = () => snapTo(OFFSET_COLLAPSED);
  const hideSheet = useCallback(() => {
    setSelectedSpot(null);
    snapTo(OFFSET_HIDDEN);
  }, [snapTo]);

  useEffect(() => {
    if (selectedSpot && !filteredSpots.some((spot) => spot.id === selectedSpot.id)) {
      hideSheet();
    }
  }, [filteredSpots, selectedSpot, hideSheet]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.min(
          Math.max(lastOffset.current + gesture.dy, OFFSET_FULL),
          OFFSET_HIDDEN
        );
        translateY.setValue(next);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const end = lastOffset.current + gesture.dy;
        const clamped = Math.min(Math.max(end, OFFSET_FULL), OFFSET_HIDDEN);

        const mid = (OFFSET_COLLAPSED + OFFSET_HIDDEN) / 2;
        let target = clamped > mid ? OFFSET_HIDDEN : OFFSET_COLLAPSED;

        if (gesture.vy > 1.2) target = OFFSET_HIDDEN;
        if (gesture.vy < -1.2) target = OFFSET_FULL;

        snapTo(target, Math.abs(gesture.vy));
        if (target === OFFSET_HIDDEN) setSelectedSpot(null);
      },
    })
  ).current;

  /* =============================================================
     RECENTER
  ============================================================= */

  async function recenterToMe() {
    const consentGranted = await refreshLocationConsent();

    if (!consentGranted) {
      Alert.alert(
        "Standort ist ausgeschaltet",
        "Backyrd verwendet deinen präzisen Standort nur, wenn du ihn im Privacy Center aktivierst.",
        [
          { text: "Später", style: "cancel" },
          {
            text: "Privacy Center öffnen",
            onPress: () => router.push("/privacy-consents" as any),
          },
        ],
      );
      return;
    }

    const context = await resolveLocationContext({
      purpose: "map_recenter",
      requestPermission: true,
      forceConsentRefresh: true,
      allowCityFallback: false,
      timeoutMs: 8_000,
    });

    if (!context.coordinates) {
      const message =
        context.failureReason === "services_disabled"
          ? "Die Ortungsdienste sind auf deinem iPhone ausgeschaltet. Aktiviere sie in den iOS-Einstellungen, um die Karte auf dich zu zentrieren."
          : context.failureReason === "permission_denied"
            ? "Backyrd hat aktuell keine iOS-Berechtigung für deinen Standort. Du kannst sie in den iOS-Einstellungen erlauben."
            : "Dein Standort ist gerade nicht verfügbar. Du kannst die Karte trotzdem frei erkunden.";

      Alert.alert("Standort nicht verfügbar", message);
      return;
    }

    setLocationConsentGranted(true);

    const next = {
      ...region,
      latitude: context.coordinates.latitude,
      longitude: context.coordinates.longitude,
    };

    setRegion(next);
    (mapRef.current as unknown as { animateToRegion?: (value: typeof next, duration: number) => void })
      ?.animateToRegion?.(next, 500);
  }

  /* =============================================================
     RENDER
  ============================================================= */

  if (loading)
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <StateView kind="loading" title={viewMode === "map" ? "Karte wird geladen" : "Orte werden geladen"} />
      </SafeAreaView>
    );

  if (spotsError)
    return (
      <SafeAreaView style={styles.center} edges={["top"]}>
        <StateView kind="error" title="Orte gerade nicht verfügbar" message="Die Orte konnten nicht geladen werden. Bitte versuche es erneut." actionLabel="Erneut laden" onAction={() => void refresh()} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.titleCopy, fontScale > 1.3 && { flexBasis: "100%" }]}>
            <AppText role="label" tone="pink">{viewMode === "list" ? "ORTE" : mapCity ? `${mapCity.toLocaleUpperCase("de-CH")} · KARTE` : "KARTE"}</AppText>
            <AppText role="screenTitle">Orte entdecken</AppText>
          </View>
          <AppText role="caption" tone="secondary" style={styles.resultCount}>{filteredSpots.length} Orte</AppText>
        </View>

        <View style={styles.headerTopRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={19} color={theme.color.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Suchen"
              placeholderTextColor={theme.color.textMuted}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <IconButton accessibilityLabel="Suche löschen" onPress={() => setSearch("")} style={styles.searchClear}>
                <Ionicons name="close" size={17} color={theme.color.textSecondary} />
              </IconButton>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter öffnen"
            style={({ pressed }) => [styles.headerButton, activeFilters.length > 0 && styles.headerButtonActive, pressed && styles.pressed]}
            onPress={() => setFiltersOpen(true)}
          >
            <Ionicons name="options-outline" size={20} color={activeFilters.length ? theme.color.background : theme.color.textPrimary} />
          </Pressable>

          <View accessibilityRole="tablist" style={styles.perspectiveSwitch}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: viewMode === "list" }} accessibilityLabel="Listenansicht" style={({ pressed }) => [styles.perspectiveOption, viewMode === "list" && styles.perspectiveOptionActive, pressed && styles.pressed]} onPress={() => changeViewMode("list")}>
              <Ionicons name="list-outline" size={18} color={viewMode === "list" ? theme.color.background : theme.color.textPrimary} />
              <AppText role="caption" style={{ color: viewMode === "list" ? theme.color.background : theme.color.textPrimary }}>Liste</AppText>
            </Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: viewMode === "map" }} accessibilityLabel="Kartenansicht" style={({ pressed }) => [styles.perspectiveOption, viewMode === "map" && styles.perspectiveOptionActive, pressed && styles.pressed]} onPress={() => changeViewMode("map")}>
              <Ionicons name="map-outline" size={18} color={viewMode === "map" ? theme.color.background : theme.color.textPrimary} />
              <AppText role="caption" style={{ color: viewMode === "map" ? theme.color.background : theme.color.textPrimary }}>Karte</AppText>
            </Pressable>
          </View>
        </View>

        {moodProfilesFailed || moodResolverFailed ? <View style={{ padding: 12 }}><AppText role="meta">Die Mood-Eindrücke konnten gerade nicht geladen werden.</AppText><Button label="Erneut laden" variant="tertiary" onPress={() => { setMoodRevision(v => v + 1); retryMoodCatalog(); }} /></View> : null}
        {selectedMood && moodProfilesLoading ? <AppText role="meta" tone="secondary">Mood-Eindrücke werden geladen …</AppText> : null}
        {activeFilters.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilters}>
          {activeFilters.map((filter) => <Chip key={filter.id} label={`${filter.label} ×`} kind="selected" onPress={filter.onRemove} />)}
        </ScrollView>}
      </View>

      <Modal transparent animationType="slide" visible={filtersOpen} onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.filterBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Filter schließen" style={StyleSheet.absoluteFill} onPress={() => setFiltersOpen(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.filterSheetHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText role="sectionTitle">Filter</AppText>
                <AppText role="meta" tone="secondary">Nur das, was zu deinem Moment passt.</AppText>
              </View>
              <IconButton accessibilityLabel="Filter schließen" onPress={() => setFiltersOpen(false)}>
                <Ionicons name="close" size={21} color={theme.color.textPrimary} />
              </IconButton>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterSheetContent}>
              <AppText role="cardTitle">Welche Atmosphäre suchst du?</AppText>
              <AppText role="meta" tone="secondary">Die Moods stammen von Gästen. Ein Filter zeigt Orte mit diesem Eindruck; Orte ohne Mood-Angaben erscheinen dann nicht.</AppText>
              {moodCatalogState === "error" ? <Button label="Moods erneut laden" variant="tertiary" onPress={retryMoodCatalog} /> : null}
              <View style={styles.filterChipGrid}>
                {moodOptions.map(({ label: m }) => {
                  const selected = selectedMood?.toLowerCase() === m.toLowerCase();
                  return <Chip key={m} label={displayMoodLabel(m)} kind="input" selected={selected} onPress={() => {
                    setSelectedMood((current) => current?.toLowerCase() === m.toLowerCase() ? null : m);
                  }} />;
                })}
              </View>
              <AppText role="label" tone="pink" style={styles.filterSectionLabel}>KATEGORIE</AppText>
              <View style={styles.filterChipGrid}>
                {dbCategories.map((category) => <Chip key={category.id} label={category.name} kind="input" selected={selectedCategory === category.id} onPress={() => setSelectedCategory((current) => current === category.id ? null : category.id)} />)}
              </View>
            </ScrollView>
            <View style={styles.filterSheetActions}>
              <Button label="Zurücksetzen" variant="tertiary" onPress={clearFilters} style={[styles.filterReset, fontScale > 1.3 && { flexBasis: "100%" }]} />
              <Button label={viewMode === "map" ? "Karte zeigen" : "Liste zeigen"} onPress={() => setFiltersOpen(false)} style={[styles.filterApply, fontScale > 1.3 && { flexBasis: "100%" }]} />
            </View>
          </View>
        </View>
      </Modal>

      {/* MAP or LIST */}
      {viewMode === "map" ? (
        <View style={styles.mapStage}>
          <ClusteredMapView
          ref={mapRef}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          userInterfaceStyle="dark"
          style={{ flex: 1 }}
          initialRegion={region}
          showsUserLocation={locationConsentGranted}
          clusterColor={theme.color.surfaceElevated}
          clusterTextColor={theme.color.textPrimary}
          spiralEnabled={false}
          animationEnabled={false}
          radius={clusterPolicy.radius}
          minPoints={clusterPolicy.minPoints}
          customMapStyle={DARK_MAP_STYLE}
          onRegionChangeComplete={handleRegionChangeComplete}
          onPress={hideSheet}
          clusteringEnabled={clusterPolicy.enabled}
          >
            {renderedMarkers}
          </ClusteredMapView>
          {!filteredSpots.length && !(selectedMood && (moodProfilesLoading || moodProfilesFailed || moodResolverFailed)) && <View pointerEvents="box-none" style={styles.emptyOverlay}>
            <StateView kind="empty" title={selectedMood ? "Noch kein passender Mood-Eindruck" : "Hier ist gerade nichts dabei"} message={selectedMood ? "Für diese Suche ist dieser Mood noch nicht hinterlegt. Entferne den Mood-Filter, um auch Orte ohne Eindrücke zu sehen." : "Passe deine Suche oder Filter an und entdecke weitere Orte."} actionLabel="Filter zurücksetzen" onAction={clearFilters} />
          </View>}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          refreshControl={<RefreshControl refreshing={refreshingPlaces} tintColor={theme.color.pink} onRefresh={() => { setRefreshingPlaces(true); void refresh().finally(() => setRefreshingPlaces(false)); }} />}
          keyboardShouldPersistTaps="handled"
          data={filteredSpots}
          onViewableItemsChanged={onVisibleChanged}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={selectedMood && (moodProfilesLoading || moodProfilesFailed || moodResolverFailed) ? null : <StateView kind="empty" title={selectedMood ? "Noch kein passender Mood-Eindruck" : "Hier ist gerade nichts dabei"} message={selectedMood ? "Für diese Suche ist dieser Mood noch nicht hinterlegt. Entferne den Mood-Filter, um auch Orte ohne Eindrücke zu sehen." : "Passe deine Suche oder Filter an und entdecke weitere Orte."} actionLabel="Filter zurücksetzen" onAction={clearFilters} />}
          style={styles.list}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          onScroll={(event) => { listScrollOffset.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button" accessibilityLabel={`${item.name} öffnen`}
              style={styles.listCard}
              onPress={() => {
                void trackAnalyticsEvent({ eventName: "map_spot_opened", screenName: "map", entityType: "spot", entityId: item.id, spotId: item.id, properties: { source: "list" } });
                router.push(`/spot/${item.id}`);
              }}
            >
              <SpotArtwork
                imageUrl={item.header_photo_url}
                spotId={item.id}
                spotName={item.name}
                style={styles.listCardImage}
                showFallbackName={false}
              />
              <View style={styles.listCardBody}>
                <Text style={styles.listCardTitle}>{item.name}</Text>
                <MoodSignature labels={spotMoods[item.id] ?? []} moodCount={moodCounts[item.id]} compact />
                <Text style={styles.listCardContext}>{item.categories?.name || item.city || "Ort"}</Text>
                <Text style={styles.listCardAddress}>{item.address || "Adresse noch nicht hinterlegt"}</Text>
                <OpeningStatusBadge status={openingStatus(item.id)} style={{ marginTop: theme.spacing.sm }} />
              </View>
            </Pressable>
          )}
        />
      )}

      {/* RECENTER BUTTON */}
      {viewMode === "map" && (
        <Pressable accessibilityRole="button" accessibilityLabel="Karte auf meinen Standort zentrieren" style={styles.recenterBtn} onPress={recenterToMe}>
          <Ionicons name="locate-outline" size={22} color={theme.color.textPrimary} />
        </Pressable>
      )}

      {/* BOTTOM SHEET */}
      {viewMode === "map" && selectedSpot ? <Animated.View
        style={[
          styles.sheetContainer,
          { height: SHEET_HEIGHT, bottom: theme.control.tabBar + insets.bottom, transform: [{ translateY }] },
        ]}
        pointerEvents="box-none"
      >
        <BlurView intensity={34} tint="dark" style={styles.sheetBlur}>
          <View accessibilityLabel="Ortsvorschau verschieben" style={{ minHeight: 44, justifyContent: "center" }} {...panResponder.panHandlers}><View style={styles.sheetHandle} /></View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.lg }}>
              <Pressable
                onPress={() => {
                  void trackAnalyticsEvent({ eventName: "map_spot_opened", screenName: "map", entityType: "spot", entityId: selectedSpot.id, spotId: selectedSpot.id, properties: { source: "preview" } });
                  router.push(`/spot/${selectedSpot.id}`);
                }}
                style={styles.sheetCard}
              >
                <View style={styles.cardMedia}>
                  <SpotArtwork
                    imageUrl={selectedSpot.header_photo_url}
                    priority="high"
                    spotId={selectedSpot.id}
                    spotName={selectedSpot.name}
                    showFallbackName={false}
                    style={styles.cardImg}
                  />

                  <LinearGradient
                    colors={[
                      "transparent",
                      "rgba(0,0,0,0.45)",
                      "rgba(0,0,0,0.85)",
                    ]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.cardOverlay}
                  >
                    <Text style={styles.resultTitle}>
                      {selectedSpot.name}
                    </Text>

                    <MoodSignature labels={spotMoods[selectedSpot.id] ?? []} moodCount={moodCounts[selectedSpot.id]} compact />
                    {selectedSpot.address && <Text style={styles.resultSubtitle}>{selectedSpot.address}</Text>}
                    <OpeningStatusBadge status={openingStatus(selectedSpot.id)} />
                  </LinearGradient>
                </View>
              </Pressable>

              <Pressable
                style={[styles.sheetCtaPrimary, { marginTop: 18 }]}
                onPress={() => {
                  void trackAnalyticsEvent({ eventName: "map_spot_opened", screenName: "map", entityType: "spot", entityId: selectedSpot.id, spotId: selectedSpot.id, properties: { source: "preview" } });
                  router.push(`/spot/${selectedSpot.id}`);
                }}
              >
                <Text style={styles.sheetCtaPrimaryText}>Ort ansehen</Text>
              </Pressable>
            </ScrollView>
        </BlurView>
      </Animated.View> : null}
    </SafeAreaView>
  );
}

/* === Styles === */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.color.background },
  header: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, backgroundColor: theme.color.background },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.md, marginBottom: theme.spacing.sm },
  titleCopy: { flex: 1, minWidth: 0, gap: 1 },
  resultCount: { marginTop: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  headerTopRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, alignItems: "center" },
  searchBox: { flex: 1, minWidth: 120, flexDirection: "row", alignItems: "center", minHeight: theme.control.standard, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, paddingLeft: theme.spacing.md, paddingRight: theme.spacing.xs },
  searchInput: { flex: 1, color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 15, minHeight: theme.control.standard },
  searchClear: { minWidth: theme.control.compact, minHeight: theme.control.compact },
  headerButton: { width: theme.control.standard, height: theme.control.standard, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill },
  headerButtonActive: { backgroundColor: theme.color.pink, borderColor: theme.color.pink },
  perspectiveSwitch: { flexDirection: "row", flexShrink: 1, minHeight: theme.control.standard, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, padding: 3 },
  perspectiveOption: { minWidth: 58, minHeight: theme.control.compact, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.xs, borderRadius: theme.radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  perspectiveOptionActive: { backgroundColor: theme.color.pink },
  pressed: { opacity: 0.8, transform: [{ scale: theme.motion.pressScale }] },
  activeFilters: { gap: theme.spacing.xs, paddingTop: theme.spacing.sm, paddingRight: theme.spacing.xs },
  mapStage: { flex: 1 },
  emptyOverlay: { position: "absolute", left: theme.spacing.xl, right: theme.spacing.xl, top: theme.spacing.xl },
  marker: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,5,6,0.9)", borderWidth: 1.5, borderColor: "rgba(247,243,233,0.72)" },
  markerCore: { width: 7, height: 7, borderRadius: 999, backgroundColor: theme.color.lime },
  markerSelected: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.pink, borderColor: theme.color.textPrimary, borderWidth: 2.5, shadowColor: theme.color.pink, shadowOpacity: 0.7, shadowRadius: 10, elevation: 8 },
  markerCoreSelected: { width: 10, height: 10, backgroundColor: theme.color.background },
  list: { backgroundColor: theme.color.background },
  listContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl + theme.control.tabBar },
  listCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, marginBottom: theme.spacing.md, overflow: "hidden", borderWidth: 1, borderColor: theme.color.border },
  listCardImage: { width: "100%", height: 164 },
  listCardBody: { padding: theme.spacing.md },
  listCardTitle: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  listCardContext: { color: theme.color.lime, fontFamily: theme.type.bodyBold, fontSize: 12, lineHeight: 16, textTransform: "uppercase", letterSpacing: 0.4, marginTop: theme.spacing.xs },
  listCardAddress: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 14, lineHeight: 19, marginTop: 3 },
  recenterBtn: { position: "absolute", bottom: 114, right: theme.spacing.xl, width: theme.control.standard, height: theme.control.standard, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,5,6,0.9)", borderWidth: 1, borderColor: theme.color.borderStrong, borderRadius: theme.radius.pill },
  sheetContainer: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40 },
  sheetBlur: { flex: 1, backgroundColor: "rgba(5,5,6,0.82)", borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: "hidden", borderWidth: 1, borderColor: theme.color.border },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 3, backgroundColor: "rgba(247,243,233,0.3)", marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  sheetCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.color.border, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, elevation: 8 },
  cardMedia: { position: "relative" }, cardImg: { width: "100%", height: 214 },
  cardOverlay: { padding: theme.spacing.md },
  resultTitle: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, ...theme.typeScale.sectionTitle, marginBottom: theme.spacing.xxs },
  resultSubtitle: { color: "rgba(247,243,233,0.76)", fontFamily: theme.type.bodyMedium, fontSize: 14, lineHeight: 19, marginBottom: theme.spacing.sm },
  cardChipsRow: { flexDirection: "row", gap: theme.spacing.xs, flexWrap: "wrap" },
  badgeGhost: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: "rgba(5,5,6,0.35)", borderWidth: 1, borderColor: "rgba(247,243,233,0.2)" },
  badgeGhostText: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 12 },
  sheetCtaPrimary: { backgroundColor: theme.color.pink, paddingVertical: 15, borderRadius: theme.radius.pill, alignItems: "center", marginTop: theme.spacing.sm },
  sheetCtaPrimaryText: { fontFamily: theme.type.bodyBold, color: theme.color.background, fontSize: 15 },
  filterBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.54)" },
  filterSheet: { maxHeight: "82%", backgroundColor: theme.color.surfaceElevated, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: theme.spacing.xl },
  filterSheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.md, marginBottom: theme.spacing.md },
  filterSheetContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  filterChipGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  filterSectionLabel: { marginTop: theme.spacing.lg },
  filterSheetActions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, paddingTop: theme.spacing.sm },
  filterReset: { flex: 1 }, filterApply: { flex: 1 },
});

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1C1C1E" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8E8E93" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1C1C1E" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2C2C2E" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000" }] },
];
