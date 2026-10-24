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
import { getPrivacySafeLocation } from "../../lib/locationPrivacy";
import { hasActiveConsent } from "../../lib/consent";
import { useSpotMoodCounts, loadSpotBrowseMoods, useMoodCatalog } from "../../lib/mood-catalog";
import { trackAnalyticsEvent } from "../../lib/analytics";
import { moodCountCopy } from "../../../packages/shared/src/presentation/mood";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { Button, IconButton } from "../../components/foundation/Button";
import { Chip } from "../../components/foundation/Chip";
import { StateView } from "../../components/foundation/StateView";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { groupMapSpotsByCoordinate, mapDistanceMeters, paddedMapPinRegion, retainMapPinRegion, selectMapDiscoverySpots, selectRetainedMapDiscoverySpots, shouldRefreshMapPinRegion, type MapCoordinates } from "../../lib/mapDiscoveryPolicy";
import { spotMatchesSearch } from "../../lib/spot-search";

import { loadDiscoveryOpeningSchedules, type OpeningSchedule } from "../../lib/discovery-opening-hours";
import { useMinuteClock } from "../../hooks/useMinuteClock";

const BASEL = { latitude: 47.5596, longitude: 7.5886 };
const USER_MAP_ZOOM_DELTA = 0.0045;

const MAP_PIN_COLORS = {
  food: "#FF5B9A",
  cafe: "#F5BA73",
  nightlife: "#B59AF7",
  stay: "#8CB9F4",
  activity: "#6BD6BE",
  culture: "#D9D391",
  experience: "#FF9988",
  viewpoint: "#78CEDA",
  fallback: "#F2F2F7",
} as const;

function mapPinColor(categoryName: string | null | undefined) {
  const name = categoryName?.trim().toLocaleLowerCase("de-CH") ?? "";
  if (/café|cafe|coffee|kaffee|bäckerei|bakery|brunch/.test(name)) return MAP_PIN_COLORS.cafe;
  if (/bar|pub|club|nightlife|nachtleben|brauerei|brewery/.test(name)) return MAP_PIN_COLORS.nightlife;
  if (/hotel|hostel|unterkunft|übernacht|stay/.test(name)) return MAP_PIN_COLORS.stay;
  if (/restaurant|bistro|essen|food|imbiss|pizzeria/.test(name)) return MAP_PIN_COLORS.food;
  if (/museum|galerie|kultur/.test(name)) return MAP_PIN_COLORS.culture;
  if (/erlebnis|theater|kino|konzert|event/.test(name)) return MAP_PIN_COLORS.experience;
  if (/aktivität|activity|freizeit|sport|wellness|ausflug/.test(name)) return MAP_PIN_COLORS.activity;
  if (/aussicht|view|natur|park/.test(name)) return MAP_PIN_COLORS.viewpoint;
  return MAP_PIN_COLORS.fallback;
}

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

function mapDistanceLabel(meters: number) {
  if (meters < 50) return "Direkt bei dir";
  if (meters < 1_000) return `${Math.round(meters / 50) * 50} m`;
  return `${new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 }).format(meters / 1_000)} km`;
}

function userDistanceLabel(meters: number) {
  return meters < 50 ? "Direkt bei dir" : `ca. ${mapDistanceLabel(meters)} von dir`;
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
  const [pinRegions, setPinRegions] = useState(() => [paddedMapPinRegion({
    latitude: Number(params.lat) || BASEL.latitude,
    longitude: Number(params.lng) || BASEL.longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  })]);
  const [userLocation, setUserLocation] = useState<{ coordinates: MapCoordinates; source: "current" | "last_known" } | null>(null);
  const [mapOriginMode, setMapOriginMode] = useState<"user" | "viewport">("viewport");

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
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const now = useMinuteClock();
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [openingSchedules, setOpeningSchedules] = useState<Record<string, OpeningSchedule>>({});
  const onVisibleChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<Spot>[] }) => {
    setVisibleIds(viewableItems.filter(row => row.isViewable).map(row => row.item.id));
  }).current;

  const [viewMode, setViewMode] = useState<"map" | "list">(explicitMapIntent ? "map" : "list");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const centeredProfileCity = useRef<string | null>(null);
  const centeredOnUser = useRef(false);
  const manuallyExploredMap = useRef(false);
  const programmaticCenter = useRef<MapCoordinates | null>(null);
  const pinRegionRef = useRef(pinRegions[0]);
  const updatePinRegion = useCallback((visibleRegion: typeof region, force = false) => {
    if (!force && !shouldRefreshMapPinRegion(pinRegionRef.current, visibleRegion)) return;
    const next = paddedMapPinRegion(visibleRegion);
    pinRegionRef.current = next;
    setPinRegions((current) => force ? [next] : retainMapPinRegion(current, next));
  }, []);
  const listRef = useRef<FlatList<Spot> | null>(null);
  const [refreshingPlaces, setRefreshingPlaces] = useState(false);
  const listScrollOffset = useRef(0);
  const [locationConsentGranted, setLocationConsentGranted] = useState(false);
  const [locationResolution, setLocationResolution] = useState<"pending" | "settled">("pending");

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
    if (centeredOnUser.current || manuallyExploredMap.current) return;
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
    programmaticCenter.current = center;
    setRegion(next);
    updatePinRegion(next, true);
    mapRef.current?.animateToRegion(next, 400);
  }, [profileCity, globalSpots, params.lat, params.lng, updatePinRegion]);

  const refreshLocationConsent = React.useCallback(async () => {
    return hasActiveConsent("precise_location", {
      forceRefresh: true,
    });
  }, []);

  useFocusEffect(React.useCallback(() => {
    let active = true;
    setLocationResolution("pending");
    void (async () => {
      try {
        const result = await getPrivacySafeLocation({
          purpose: "nearby_discovery",
          requestPermission: false,
          forceConsentRefresh: true,
          timeoutMs: 4_000,
          allowLastKnown: true,
        });
        if (!active) return;
        if (!result.ok) {
          setLocationConsentGranted(false);
          setUserLocation(null);
          setMapOriginMode("viewport");
          return;
        }
        const coordinates = {
          latitude: result.location.coords.latitude,
          longitude: result.location.coords.longitude,
        };
        setLocationConsentGranted(true);
        setUserLocation({ coordinates, source: result.source });
        if ((params.lat && params.lng) || manuallyExploredMap.current) return;
        centeredOnUser.current = true;
        setMapOriginMode("user");
        setSelectedSpot(null);
        const next = { ...coordinates, latitudeDelta: USER_MAP_ZOOM_DELTA, longitudeDelta: USER_MAP_ZOOM_DELTA };
        programmaticCenter.current = coordinates;
        setRegion(next);
        updatePinRegion(next, true);
        mapRef.current?.animateToRegion(next, 450);
      } catch {
        if (!active) return;
        setLocationConsentGranted(false);
        setUserLocation(null);
        setMapOriginMode("viewport");
      } finally {
        if (active) setLocationResolution("settled");
      }
    })();
    return () => { active = false; };
  }, [params.lat, params.lng, updatePinRegion]));

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

  const mapSpots = useMemo(() => locationResolution === "pending" ? [] : selectRetainedMapDiscoverySpots(filteredSpots, pinRegions), [filteredSpots, pinRegions, locationResolution]);
  const markerGroups = useMemo(() => groupMapSpotsByCoordinate(mapSpots), [mapSpots]);
  const selectedGroup = useMemo(() => markerGroups.find((group) => group.key === selectedGroupKey && group.spots.length > 1) ?? null, [markerGroups, selectedGroupKey]);
  const visibleMapSpots = useMemo(() => selectMapDiscoverySpots(filteredSpots, region), [filteredSpots, region]);
  useEffect(() => {
    if (selectedSpot && !mapSpots.some((spot) => spot.id === selectedSpot.id)) setSelectedSpot(null);
  }, [mapSpots, selectedSpot]);
  useEffect(() => {
    if (selectedGroupKey && !selectedGroup) setSelectedGroupKey(null);
  }, [selectedGroupKey, selectedGroup]);

  const openingCandidates = useMemo(() => viewMode === "map" ? [] : filteredSpots.filter((spot, index) => visibleIds.length ? visibleIds.includes(spot.id) : index < 8), [viewMode, filteredSpots, visibleIds]);
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

  const handleRegionChange = useCallback((nextRegion: typeof region) => {
    updatePinRegion(nextRegion);
  }, [updatePinRegion]);

  const handleRegionChangeComplete = useCallback((nextRegion: typeof region) => {
    setRegion(nextRegion);
    updatePinRegion(nextRegion);
    if (programmaticCenter.current && mapDistanceMeters(programmaticCenter.current, nextRegion) < 100) {
      programmaticCenter.current = null;
    }
  }, [updatePinRegion]);

  const changeViewMode = useCallback((nextView: "map" | "list") => {
    if (nextView === viewMode) return;
    setSelectedSpot(null);
    setSelectedGroupKey(null);
    setViewMode(nextView);
  }, [viewMode]);

  /* =============================================================
     MAP RENDERING
  ============================================================= */

  const renderedMarkers = markerGroups.map((group) => {
    const spot = group.spots[0];
    const isShared = group.spots.length > 1;
    const isSelected = selectedGroupKey === group.key || group.spots.some((item) => item.id === selectedSpot?.id);
    const pinColor = isShared ? theme.color.pink : mapPinColor(spot.categories?.name);
    return (
        <Marker
          key={group.key}
          coordinate={{ latitude: group.lat, longitude: group.lng }}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={isSelected}
          accessibilityLabel={isShared ? `${group.spots.length} Orte an diesem Standort auf der Karte` : `${spot.name}, ${spot.categories?.name || "Ort"} auf der Karte`}
          accessibilityState={{ selected: isSelected }}
          onPress={(e) => {
            e.stopPropagation();
            if (isShared) {
              setSelectedSpot(null);
              setSelectedGroupKey(group.key);
              return;
            }
            setSelectedGroupKey(null);
            setSelectedSpot(spot);
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
          <View style={[styles.marker, isSelected && styles.markerSelected, isSelected && { shadowColor: pinColor }]}>
            <Ionicons
              name="location-sharp"
              size={isSelected ? 34 : 28}
              color={pinColor}
            />
            {isShared ? <View style={styles.markerCount}><Text style={styles.markerCountText}>{group.spots.length}</Text></View> : null}
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
      setLocationConsentGranted(false);
      setUserLocation(null);
      setMapOriginMode("viewport");
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
      setLocationConsentGranted(false);
      setUserLocation(null);
      setMapOriginMode("viewport");
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
    setUserLocation({
      coordinates: context.coordinates,
      source: context.source === "current" ? "current" : "last_known",
    });
    centeredOnUser.current = true;
    manuallyExploredMap.current = false;
    setMapOriginMode("user");
    setSelectedSpot(null);

    const next = {
      latitude: context.coordinates.latitude,
      longitude: context.coordinates.longitude,
      latitudeDelta: USER_MAP_ZOOM_DELTA,
      longitudeDelta: USER_MAP_ZOOM_DELTA,
    };

    programmaticCenter.current = context.coordinates;
    setRegion(next);
    updatePinRegion(next, true);
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
      <View style={[styles.header, viewMode === "map" && styles.mapHeader]}>
        <View style={styles.headerControls}>
          {viewMode === "map" ? <AppText role="label" tone="pink" numberOfLines={1} style={styles.headerEyebrow}>{mapOriginMode === "user" && userLocation ? (userLocation.source === "current" ? "DEIN STANDORT" : "LETZTER STANDORT") : mapCity ? `${mapCity.toLocaleUpperCase("de-CH")} · KARTE` : "KARTE"}</AppText> : null}
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
        {viewMode === "list" ? <View style={styles.placesTitle}><HomeTypographyProvider><HomeDisplayHeading title="Orte entdecken" accent="," /></HomeTypographyProvider></View> : null}

        <View style={[styles.headerTopRow, viewMode === "map" && styles.mapSearchRow]}>
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

        {(moodProfilesFailed || moodResolverFailed) && (viewMode === "list" || selectedMood || searchMoodId) ? <View style={{ padding: 12 }}><AppText role="meta">Die Mood-Eindrücke konnten gerade nicht geladen werden.</AppText><Button label="Erneut laden" variant="tertiary" onPress={() => { setMoodRevision(v => v + 1); retryMoodCatalog(); }} /></View> : null}
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
          mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
          userInterfaceStyle="dark"
          style={{ flex: 1 }}
          initialRegion={region}
          showsUserLocation={locationConsentGranted}
          showsPointsOfInterest={false}
          customMapStyle={DARK_MAP_STYLE}
          onPress={() => { setSelectedSpot(null); setSelectedGroupKey(null); }}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          onPanDrag={() => { manuallyExploredMap.current = true; programmaticCenter.current = null; setMapOriginMode("viewport"); setMapCity(null); setSelectedSpot(null); setSelectedGroupKey(null); }}
          >
            {renderedMarkers}
          </MapView>
          {locationResolution === "pending" ? <View style={styles.locationLoading}><StateView kind="loading" title="Orte in deiner Nähe werden geladen" /></View> : null}
          {selectedGroup ? <View style={styles.railWrap}>
            <View style={styles.groupCard}>
              <Text style={styles.groupTitle}>{selectedGroup.spots.length} Orte an diesem Standort</Text>
              <ScrollView style={styles.groupSpotList}>{selectedGroup.spots.map((spot) => <Pressable
                key={spot.id}
                accessibilityRole="button"
                accessibilityLabel={`${spot.name} auswählen`}
                style={styles.groupSpotRow}
                onPress={() => {
                  setSelectedGroupKey(null);
                  setSelectedSpot(spot);
                  void trackAnalyticsEvent({ eventName: "map_marker_opened", screenName: "map", entityType: "spot", entityId: spot.id, spotId: spot.id, properties: { view_mode: viewMode, shared_location: true } });
                }}>
                <View style={[styles.groupSpotDot, { backgroundColor: mapPinColor(spot.categories?.name) }]} />
                <View style={styles.groupSpotCopy}>
                  <Text style={styles.groupSpotName} numberOfLines={1}>{spot.name}</Text>
                  <Text style={styles.groupSpotCategory} numberOfLines={1}>{spot.categories?.name || "Ort"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color={theme.color.textSecondary} />
              </Pressable>)}</ScrollView>
            </View>
          </View> : null}
          {selectedSpot && mapSpots.some((spot) => spot.id === selectedSpot.id) ? <View style={styles.railWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${selectedSpot.name} ansehen`}
                style={[styles.railCard, styles.railCardSelected]}
                onPress={() => {
                  void trackAnalyticsEvent({ eventName: "map_spot_opened", screenName: "map", entityType: "spot", entityId: selectedSpot.id, spotId: selectedSpot.id, properties: { source: "map_card" } });
                  router.push(`/spot/${selectedSpot.id}`);
                }}>
                <View style={styles.railMedia}>
                  <SpotArtwork imageUrl={selectedSpot.header_photo_url} spotId={selectedSpot.id} spotName={selectedSpot.name} showFallbackName={false} attributionPosition="top" style={styles.railImage} />
                  <LinearGradient pointerEvents="none" colors={["transparent", "rgba(0,0,0,0.88)"]} style={styles.railImageShade}>
                    <HomeTypographyProvider><AppText role="displayXL" numberOfLines={2} style={styles.railCardTitle}>{selectedSpot.name}</AppText></HomeTypographyProvider>
                  </LinearGradient>
                </View>
                <View style={styles.railCardBody}>
                  <View style={styles.railMetaRow}>
                    <Text style={styles.railCategory} numberOfLines={1}>{selectedSpot.categories?.name || selectedSpot.city || "Ort"}</Text>
                    {userLocation?.source === "current" ? <Text style={styles.railDistance}>{userDistanceLabel(mapDistanceMeters(userLocation.coordinates, { latitude: selectedSpot.lat, longitude: selectedSpot.lng }))}</Text> : null}
                  </View>
                  {selectedSpot.address ? <Text style={styles.railAddress} numberOfLines={1}>{selectedSpot.address}</Text> : null}
                  <Text style={styles.railMoods} numberOfLines={1}>{(spotMoods[selectedSpot.id] ?? []).slice(0, 2).map(displayMoodLabel).join(" · ") || "Noch keine Mood-Eindrücke"}</Text>
                </View>
              </Pressable>
          </View> : null}
          {locationResolution === "settled" && !filteredSpots.length && !(selectedMood && (moodProfilesLoading || moodProfilesFailed || moodResolverFailed)) && <View pointerEvents="box-none" style={styles.emptyOverlay}>
            <StateView kind="empty" title={selectedMood ? "Noch kein passender Mood-Eindruck" : "Hier ist gerade nichts dabei"} message={selectedMood ? "Für diese Suche ist dieser Mood noch nicht hinterlegt. Entferne den Mood-Filter, um auch Orte ohne Eindrücke zu sehen." : "Passe deine Suche oder Filter an und entdecke weitere Orte."} actionLabel="Filter zurücksetzen" onAction={clearFilters} />
          </View>}
          {locationResolution === "settled" && filteredSpots.length > 0 && visibleMapSpots.length === 0 ? <View style={styles.areaEmpty}>
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
        <Pressable accessibilityRole="button" accessibilityLabel="Karte auf meinen Standort zentrieren" style={[styles.recenterBtn, selectedSpot && styles.recenterAboveRail, selectedGroup && styles.recenterAboveGroup]} onPress={recenterToMe}>
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
  mapHeader: { paddingTop: 0, paddingBottom: theme.spacing.xs },
  headerControls: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  headerEyebrow: { flexShrink: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  placesTitle: { width: "100%", minHeight: 60 },
  headerTopRow: { marginTop: theme.spacing.md },
  mapSearchRow: { marginTop: theme.spacing.xs },
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
  locationLoading: { position: "absolute", left: theme.spacing.xl, right: theme.spacing.xl, top: theme.spacing.xl, backgroundColor: "rgba(15,15,17,0.94)", borderRadius: theme.radius.lg },
  emptyOverlay: { position: "absolute", left: theme.spacing.xl, right: theme.spacing.xl, top: theme.spacing.xl },
  railWrap: { position: "absolute", left: theme.spacing.xl, right: theme.spacing.xl, bottom: theme.control.tabBar + theme.spacing.sm, zIndex: 2, alignItems: "center" },
  groupCard: { width: "100%", maxWidth: 350, backgroundColor: "rgba(15,15,17,0.98)", borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.pink, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 10, elevation: 5 },
  groupTitle: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 17, marginBottom: theme.spacing.xs },
  groupSpotList: { maxHeight: 250 },
  groupSpotRow: { flexDirection: "row", alignItems: "center", minHeight: 58, gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.color.border },
  groupSpotDot: { width: 9, height: 9, borderRadius: 5 },
  groupSpotCopy: { flex: 1 },
  groupSpotName: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 15 },
  groupSpotCategory: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 12 },
  railCard: { width: "100%", maxWidth: 350, minHeight: 225, backgroundColor: "rgba(15,15,17,0.98)", borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.borderStrong, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 10, elevation: 5 },
  railCardSelected: { borderColor: theme.color.pink },
  railMedia: { position: "relative", height: 132 },
  railImage: { width: "100%", height: 132 },
  railImageShade: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 100, justifyContent: "flex-end", paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xs },
  railCardTitle: { color: theme.color.textPrimary, fontSize: 29, lineHeight: 31, letterSpacing: -1.5 },
  railCardBody: { minHeight: 91, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: 3 },
  railMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
  railCategory: { flexShrink: 1, color: theme.color.pink, fontFamily: theme.type.bodyBold, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  railDistance: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 12 },
  railAddress: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 14, lineHeight: 19 },
  railMoods: { color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 13, lineHeight: 18 },
  areaEmpty: { position: "absolute", left: theme.spacing.xl, right: theme.spacing.xl, top: theme.spacing.xl, backgroundColor: "rgba(15,15,17,0.94)", borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, padding: theme.spacing.md, gap: theme.spacing.xs },
  areaEmptyTitle: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 17 },
  areaEmptyBody: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 14 },
  marker: { width: 44, height: 44, alignItems: "center", justifyContent: "flex-end", paddingBottom: 2, shadowColor: "#000", shadowOpacity: 0.8, shadowRadius: 4, elevation: 5 },
  markerSelected: { shadowOpacity: 0.65, shadowRadius: 8, elevation: 8 },
  markerCount: { position: "absolute", top: 0, right: 0, minWidth: 19, height: 19, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 3, backgroundColor: theme.color.background, borderWidth: 1, borderColor: theme.color.pink },
  markerCountText: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 11, lineHeight: 14 },
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
  recenterAboveRail: { bottom: theme.control.tabBar + 310 },
  recenterAboveGroup: { bottom: theme.control.tabBar + 250 },
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
