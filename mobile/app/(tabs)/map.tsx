// backyrd/mobile/app/map.tsx

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { View, Alert, RefreshControl, Platform, Pressable, ScrollView, StyleSheet, FlatList, Modal, useWindowDimensions, type ViewToken } from "react-native";
import { AppText, HomeTypographyProvider, ProductText as Text, ProductTextInput as TextInput } from "../../components/foundation/AppText";
import { HomeDisplayHeading } from "../../components/HomeDisplayHeading";

import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
import { moodCountCopy } from "../../../packages/shared/src/presentation/mood";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { Button, IconButton } from "../../components/foundation/Button";
import { Chip } from "../../components/foundation/Chip";
import { StateView } from "../../components/foundation/StateView";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { hasMapRegionChanged, selectMapDiscoverySpots } from "../../lib/mapDiscoveryPolicy";
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
  const { fontScale, width: screenWidth } = useWindowDimensions();
  const railCardWidth = Math.min(screenWidth - 56, 350);
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
  const [appliedRegion, setAppliedRegion] = useState(region);

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

  const mapRef = useRef<MapView | null>(null);
  const railRef = useRef<FlatList<Spot> | null>(null);
  const centeredProfileCity = useRef<string | null>(null);
  const listRef = useRef<FlatList<Spot> | null>(null);
  const [refreshingPlaces, setRefreshingPlaces] = useState(false);
  const listScrollOffset = useRef(0);
  const [locationConsentGranted, setLocationConsentGranted] = useState(false);

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
    setAppliedRegion(next);
    mapRef.current?.animateToRegion(next, 400);
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

  const mapSpots = useMemo(() => selectMapDiscoverySpots(filteredSpots, appliedRegion), [filteredSpots, appliedRegion]);
  const mapNeedsSearch = hasMapRegionChanged(region, appliedRegion);

  useEffect(() => {
    if (selectedSpot && mapSpots.some((spot) => spot.id === selectedSpot.id)) return;
    setSelectedSpot(mapSpots[0] ?? null);
    railRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [mapSpots, selectedSpot]);

  const openingCandidates = useMemo(() => viewMode === "map" ? mapSpots : filteredSpots.filter((spot, index) => visibleIds.length ? visibleIds.includes(spot.id) : index < 8), [viewMode, mapSpots, filteredSpots, visibleIds]);
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
  }, []);

  const selectMapSpot = useCallback((spot: Spot, scrollRail = true) => {
    setSelectedSpot(spot);
    if (scrollRail) {
      const index = mapSpots.findIndex((item) => item.id === spot.id);
      if (index >= 0) railRef.current?.scrollToOffset({ offset: index * (railCardWidth + 10), animated: true });
    }
  }, [mapSpots, railCardWidth]);

  const searchThisArea = useCallback(() => {
    setAppliedRegion(region);
    setSelectedSpot(null);
    railRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [region]);

  const changeViewMode = useCallback((nextView: "map" | "list") => {
    if (nextView === viewMode) return;
    setViewMode(nextView);
  }, [viewMode]);

  /* =============================================================
     MAP RENDERING
  ============================================================= */

  const renderedMarkers = mapSpots.map((spot) => {
    const isSelected = selectedSpot?.id === spot.id;
    return (
        <Marker
          key={spot.id}
          coordinate={{ latitude: spot.lat, longitude: spot.lng }}
          tracksViewChanges={isSelected}
          accessibilityLabel={`${spot.name} auf der Karte`}
          accessibilityState={{ selected: isSelected }}
          onPress={(e) => {
            e.stopPropagation();
            selectMapSpot(spot);
            void trackAnalyticsEvent({
              eventName: "map_marker_opened",
              screenName: "map",
              entityType: "spot",
              entityId: spot.id,
              spotId: spot.id,
              properties: { view_mode: viewMode },
            });
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
    setAppliedRegion(next);
    mapRef.current?.animateToRegion(next, 500);
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
        <View style={styles.headerControls}>
          {viewMode === "map" ? <AppText role="label" tone="pink" numberOfLines={1} style={styles.headerEyebrow}>{mapCity ? `${mapCity.toLocaleUpperCase("de-CH")} · KARTE` : "KARTE"}</AppText> : null}
          <View style={styles.headerActions}>
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
        </View>
        <View style={styles.placesTitle}><HomeTypographyProvider><HomeDisplayHeading title="Orte entdecken" accent="," /></HomeTypographyProvider></View>

        <View style={styles.headerTopRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={19} color={theme.color.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              accessibilityLabel="Orte suchen"
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
              </View>
              <IconButton accessibilityLabel="Filter schließen" onPress={() => setFiltersOpen(false)}>
                <Ionicons name="close" size={21} color={theme.color.textPrimary} />
              </IconButton>
            </View>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterSheetContent}>
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
          <MapView
          ref={mapRef}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          userInterfaceStyle="dark"
          style={{ flex: 1 }}
          initialRegion={region}
          showsUserLocation={locationConsentGranted}
          customMapStyle={DARK_MAP_STYLE}
          onRegionChangeComplete={handleRegionChangeComplete}
          >
            {renderedMarkers}
          </MapView>
          {mapNeedsSearch ? <Pressable accessibilityRole="button" accessibilityLabel="Orte in diesem Kartenausschnitt suchen" style={styles.searchAreaButton} onPress={searchThisArea}>
            <Ionicons name="search" size={17} color={theme.color.background} />
            <Text style={styles.searchAreaText}>Hier suchen</Text>
          </Pressable> : null}
          {mapSpots.length > 0 ? <View style={styles.railWrap}>
            <View style={styles.railHeading}>
              <AppText role="label" tone="pink" numberOfLines={1}>IN DEINEM AUSSCHNITT</AppText>
              <AppText role="meta" tone="secondary" numberOfLines={1}>Alle Orte in der Liste</AppText>
            </View>
            <FlatList
              ref={railRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              data={mapSpots}
              keyExtractor={(spot) => spot.id}
              contentContainerStyle={styles.railContent}
              snapToInterval={railCardWidth + 10}
              decelerationRate="fast"
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / (railCardWidth + 10));
                const spot = mapSpots[Math.min(Math.max(index, 0), mapSpots.length - 1)];
                if (spot) selectMapSpot(spot, false);
              }}
              renderItem={({ item }) => <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name} ansehen`}
                accessibilityState={{ selected: selectedSpot?.id === item.id }}
                style={[styles.railCard, { width: railCardWidth }, selectedSpot?.id === item.id && styles.railCardSelected]}
                onPress={() => {
                  void trackAnalyticsEvent({ eventName: "map_spot_opened", screenName: "map", entityType: "spot", entityId: item.id, spotId: item.id, properties: { source: "map_rail" } });
                  router.push(`/spot/${item.id}`);
                }}>
                <SpotArtwork imageUrl={item.header_photo_url} spotId={item.id} spotName={item.name} showFallbackName={false} style={styles.railImage} />
                <View style={styles.railCardCopy}>
                  <AppText role="cardTitle" numberOfLines={1}>{item.name}</AppText>
                  <AppText role="meta" tone="secondary" numberOfLines={1}>{item.categories?.name || item.city || "Ort"}{item.address ? ` · ${item.address}` : ""}</AppText>
                  <AppText role="meta" tone="pink" numberOfLines={1}>{(spotMoods[item.id] ?? []).slice(0, 2).map(displayMoodLabel).join(" · ") || "Ort ansehen"}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.color.textSecondary} />
              </Pressable>}
            />
          </View> : null}
          {!filteredSpots.length && !(selectedMood && (moodProfilesLoading || moodProfilesFailed || moodResolverFailed)) && <View pointerEvents="box-none" style={styles.emptyOverlay}>
            <StateView kind="empty" title={selectedMood ? "Noch kein passender Mood-Eindruck" : "Hier ist gerade nichts dabei"} message={selectedMood ? "Für diese Suche ist dieser Mood noch nicht hinterlegt. Entferne den Mood-Filter, um auch Orte ohne Eindrücke zu sehen." : "Passe deine Suche oder Filter an und entdecke weitere Orte."} actionLabel="Filter zurücksetzen" onAction={clearFilters} />
          </View>}
          {filteredSpots.length > 0 && mapSpots.length === 0 && !mapNeedsSearch ? <View style={styles.areaEmpty}>
            <Text style={styles.areaEmptyTitle}>Hier noch keine Orte</Text>
            <Text style={styles.areaEmptyBody}>Verschiebe die Karte oder entdecke alle Treffer in der Liste.</Text>
            <Button label="Liste ansehen" variant="tertiary" onPress={() => changeViewMode("list")} />
          </View> : null}
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
              <View style={styles.listCardMedia}>
                <SpotArtwork
                  imageUrl={item.header_photo_url}
                  spotId={item.id}
                  spotName={item.name}
                  style={styles.listCardImage}
                  showFallbackName={false}
                  attributionPosition="top"
                />
                <LinearGradient pointerEvents="none" colors={["transparent", "rgba(5,5,5,0.78)"]} style={styles.listCardImageShade} />
              </View>
              <View style={styles.listCardBody}>
                <HomeTypographyProvider><AppText role="displayXL" style={styles.listCardTitle}>{item.name}</AppText></HomeTypographyProvider>
                <Text style={styles.listCardAddress}>{item.address || "Adresse noch nicht hinterlegt"}</Text>
                {moodCountCopy(moodCounts[item.id]) ? <AppText role="meta" tone="secondary" style={styles.listCardMoodCount}>{moodCountCopy(moodCounts[item.id])}</AppText> : null}
                {(spotMoods[item.id] ?? []).length > 0 ? <HomeTypographyProvider><View style={styles.listCardMoods}>
                  {[...new Set(spotMoods[item.id])].slice(0, 3).map(label => <AppText key={label} role="displayXL" tone="pink" style={styles.listCardMood}>{label}</AppText>)}
                </View></HomeTypographyProvider> : null}
                <Text style={styles.listCardContext}>{item.categories?.name || item.city || "Ort"}</Text>
                <OpeningStatusBadge status={openingStatus(item.id)} style={{ marginTop: theme.spacing.sm }} />
              </View>
            </Pressable>
          )}
        />
      )}

      {/* RECENTER BUTTON */}
      {viewMode === "map" && (
        <Pressable accessibilityRole="button" accessibilityLabel="Karte auf meinen Standort zentrieren" style={[styles.recenterBtn, mapSpots.length > 0 && styles.recenterAboveRail]} onPress={recenterToMe}>
          <Ionicons name="locate-outline" size={22} color={theme.color.textPrimary} />
        </Pressable>
      )}

    </SafeAreaView>
  );
}

/* === Styles === */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.color.background },
  header: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, backgroundColor: theme.color.background },
  headerControls: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  headerEyebrow: { flexShrink: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  placesTitle: { width: "100%", minHeight: 60 },
  headerTopRow: { marginTop: theme.spacing.md },
  searchBox: { width: "100%", flexDirection: "row", alignItems: "center", minHeight: theme.control.standard, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, paddingLeft: theme.spacing.md, paddingRight: theme.spacing.xs },
  searchInput: { flex: 1, color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 15, minHeight: theme.control.standard },
  searchClear: { minWidth: theme.control.compact, minHeight: theme.control.compact },
  headerButton: { width: theme.control.standard, height: theme.control.standard, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill },
  headerButtonActive: { backgroundColor: theme.color.pink, borderColor: theme.color.pink },
  perspectiveSwitch: { flexDirection: "row", minHeight: theme.control.standard, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, padding: 3 },
  perspectiveOption: { minWidth: 58, minHeight: theme.control.compact, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.xs, borderRadius: theme.radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  perspectiveOptionActive: { backgroundColor: theme.color.pink },
  pressed: { opacity: 0.8, transform: [{ scale: theme.motion.pressScale }] },
  activeFilters: { gap: theme.spacing.xs, paddingTop: theme.spacing.sm, paddingRight: theme.spacing.xs },
  mapStage: { flex: 1 },
  emptyOverlay: { position: "absolute", left: theme.spacing.xl, right: theme.spacing.xl, top: theme.spacing.xl },
  searchAreaButton: { position: "absolute", alignSelf: "center", top: theme.spacing.md, zIndex: 3, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: theme.color.pink, borderRadius: theme.radius.pill, minHeight: 44, paddingHorizontal: theme.spacing.md, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  searchAreaText: { color: theme.color.background, fontFamily: theme.type.bodyBold, fontSize: 14 },
  railWrap: { position: "absolute", left: 0, right: 0, bottom: theme.control.tabBar + theme.spacing.sm, zIndex: 2 },
  railHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xs, gap: theme.spacing.xs },
  railContent: { paddingHorizontal: theme.spacing.xl, gap: 10, paddingBottom: 5 },
  railCard: { height: 92, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, padding: 8, paddingRight: theme.spacing.sm, backgroundColor: "rgba(15,15,17,0.96)", borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.borderStrong, shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 10, elevation: 5 },
  railCardSelected: { borderColor: theme.color.pink },
  railImage: { width: 76, height: 76, borderRadius: theme.radius.md },
  railCardCopy: { flex: 1, justifyContent: "center", gap: 2 },
  areaEmpty: { position: "absolute", left: theme.spacing.xl, right: theme.spacing.xl, top: theme.spacing.xl, backgroundColor: "rgba(15,15,17,0.94)", borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, padding: theme.spacing.md, gap: theme.spacing.xs },
  areaEmptyTitle: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 17 },
  areaEmptyBody: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 14 },
  marker: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,5,6,0.9)", borderWidth: 1.5, borderColor: "rgba(247,243,233,0.72)" },
  markerCore: { width: 7, height: 7, borderRadius: 999, backgroundColor: theme.color.lime },
  markerSelected: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.pink, borderColor: theme.color.textPrimary, borderWidth: 2.5, shadowColor: theme.color.pink, shadowOpacity: 0.7, shadowRadius: 10, elevation: 8 },
  markerCoreSelected: { width: 10, height: 10, backgroundColor: theme.color.background },
  list: { backgroundColor: theme.color.background },
  listContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl + theme.control.tabBar },
  listCard: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, marginBottom: theme.spacing.md, overflow: "hidden", borderWidth: 1, borderColor: theme.color.border },
  listCardMedia: { position: "relative" },
  listCardImage: { width: "100%", height: 164 },
  listCardImageShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 100 },
  listCardBody: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md },
  listCardTitle: { color: theme.color.textPrimary, fontSize: 42, lineHeight: 45, letterSpacing: -3.15, marginTop: -13 },
  listCardAddress: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 14, lineHeight: 19, marginTop: 4 },
  listCardMoodCount: { marginTop: theme.spacing.md },
  listCardMoods: { flexDirection: "row", flexWrap: "wrap", columnGap: theme.spacing.sm, rowGap: 1, marginTop: theme.spacing.xxs },
  listCardMood: { fontSize: 18, lineHeight: 23, letterSpacing: -0.65 },
  listCardContext: { color: theme.color.pink, fontFamily: theme.type.bodyBold, fontSize: 12, lineHeight: 16, textTransform: "uppercase", letterSpacing: 0.4, marginTop: theme.spacing.sm },
  recenterBtn: { position: "absolute", bottom: theme.control.tabBar + theme.spacing.md, right: theme.spacing.xl, width: theme.control.standard, height: theme.control.standard, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,5,6,0.9)", borderWidth: 1, borderColor: theme.color.borderStrong, borderRadius: theme.radius.pill },
  recenterAboveRail: { bottom: theme.control.tabBar + 146 },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 3, backgroundColor: "rgba(247,243,233,0.3)", marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  filterBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.54)" },
  filterSheet: { height: "82%", backgroundColor: theme.color.surfaceElevated, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: theme.spacing.xl },
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
