// backyrd/mobile/app/map.tsx

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Alert,
  Pressable,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Dimensions,
  Animated,
  FlatList,
  PanResponder,
  Modal,
} from "react-native";

import ClusteredMapView from "react-native-map-clustering";
import { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";

import { useSpotsStore } from "../../lib/useSpotsStore";
import { useDebounce } from "use-debounce";
import { supabase } from "../../lib/supabase";
import { resolveLocationContext } from "../../lib/locationContext";
import { hasActiveConsent } from "../../lib/consent";
import { MOOD_SUGGESTIONS } from "../../lib/moods";
import { trackAnalyticsEvent } from "../../lib/analytics";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { AppText } from "../../components/foundation/AppText";
import { Button, IconButton } from "../../components/foundation/Button";
import { Chip } from "../../components/foundation/Chip";
import { StateView } from "../../components/foundation/StateView";
import { backyrdTheme as theme } from "../../theme/backyrd";
import { clusterPolicyFor, resolveMapZoomBucket, type MapZoomBucket } from "../../lib/mapDiscoveryPolicy";

const BASEL = { latitude: 47.5596, longitude: 7.5886 };
const { height: SCREEN_H } = Dimensions.get("window");
const SNAP_COLLAPSED = 400;
const SHEET_HEIGHT = SCREEN_H;
const OFFSET_COLLAPSED = SHEET_HEIGHT - SNAP_COLLAPSED;
const OFFSET_FULL = 0;
const OFFSET_HIDDEN = SHEET_HEIGHT + 40;

// Normalisiert Suchbegriffe für Textsuche
const normalizeText = (str?: string | null) =>
  (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .trim();

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
  category_id?: string | null;
  categories?: { name?: string | null; color?: string | null } | null;
};

export default function MapScreen() {
  const { spots: globalSpots, refresh, loading } = useSpotsStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ spotIds?: string; view?: string; lat?: string; lng?: string }>();
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

  // Mapping: spotId → [mood_id1, mood_id2, ...]
  const [spotMoodIds, setSpotMoodIds] = useState<Record<string, number[]>>({});

  // Alle Mood-IDs, die in Daten vorkommen → für Fallback-Logik
  const allMoodIdsInData = useMemo(() => {
    const set = new Set<number>();
    Object.values(spotMoodIds).forEach((arr) =>
      arr.forEach((id) => {
        if (typeof id === "number") set.add(id);
      })
    );
    return set;
  }, [spotMoodIds]);

  // Dynamic Mood-Chips (Top Moods über gesamte App)
  const [topMoodChips, setTopMoodChips] = useState<string[]>([]);

  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const [region, setRegion] = useState(() => ({
    latitude: Number(params.lat) || BASEL.latitude,
    longitude: Number(params.lng) || BASEL.longitude,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  }));
  const [zoomBucket, setZoomBucket] = useState<MapZoomBucket>("city");

  // Auswahl: Mood über Chip
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedMoodId, setSelectedMoodId] = useState<number | null>(null);

  // Mood, der aus der freien Suche kommt
  const [searchMoodId, setSearchMoodId] = useState<number | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 350);

  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list">(explicitMapIntent ? "map" : "list");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const mapRef = useRef<ClusteredMapView | null>(null);
  const listRef = useRef<FlatList<Spot> | null>(null);
  const listScrollOffset = useRef(0);
  const [locationConsentGranted, setLocationConsentGranted] = useState(false);
  const clusterPolicy = useMemo(() => clusterPolicyFor(zoomBucket), [zoomBucket]);

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

      // Mood Daten aus spot_moods_agg (Engine-kompatibel)
      const { data: moodRows } = await supabase
        .from("spot_moods_agg")
        .select(
          `
          spot_id,
          mood_id,
          mood_count,
          rank,
          mood_tokens ( token )
        `
        )
        .lte("rank", 5);

      const moodMap: Record<string, string[]> = {};
      const moodIdMap: Record<string, number[]> = {};

      (moodRows || []).forEach((r: any) => {
        const token = r.mood_tokens?.token;
        if (!token) return;

        if (!moodMap[r.spot_id]) moodMap[r.spot_id] = [];
        if (!moodIdMap[r.spot_id]) moodIdMap[r.spot_id] = [];

        moodMap[r.spot_id].push(token);
        moodIdMap[r.spot_id].push(r.mood_id);
      });

      setSpotMoods(moodMap);
      setSpotMoodIds(moodIdMap);
      setDbCategories(catRows || []);
    })();
  }, [refresh]);

  /* =============================================================
     DYNAMIC TOP MOOD CHIPS
  ============================================================= */
  useEffect(() => {
    (async () => {
      try {
        // Wir holen viele Mood-Aggregate, aggregieren clientseitig
        const { data, error } = await supabase
          .from("spot_moods_agg")
          .select(
            `
            mood_id,
            mood_count,
            mood_tokens ( token )
          `
          )
          .limit(2000);

        if (error || !data) {
          // Fallback auf statische Suggestions
          setTopMoodChips(MOOD_SUGGESTIONS);
          return;
        }

        const freq: Record<string, number> = {};
        (data || []).forEach((row: any) => {
          const token = row.mood_tokens?.token;
          if (!token) return;
          const key = normalizeText(token);
          if (!key || key.length < 2) return;
          freq[key] = (freq[key] || 0) + (row.mood_count || 1);
        });

        const sorted = Object.entries(freq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 24)
          .map(([key]) => key);

        const prettified = sorted.map(
          (k) => k.charAt(0).toUpperCase() + k.slice(1)
        );

        if (prettified.length > 0) {
          setTopMoodChips(prettified);
        } else {
          setTopMoodChips(MOOD_SUGGESTIONS);
        }
      } catch {
        setTopMoodChips(MOOD_SUGGESTIONS);
      }
    })();
  }, []);

  /* =============================================================
     MOOD ENGINE HOOKS
  ============================================================= */

  // Chip → Mood-ID via match_mood
  async function resolveSelectedMoodId(text: string | null) {
    if (!text) {
      setSelectedMoodId(null);
      return;
    }
    try {
      const { data, error } = await supabase.rpc("match_mood", { input: text });
      if (!error && typeof data === "number") {
        setSelectedMoodId(data);
      } else {
        setSelectedMoodId(null);
      }
    } catch {
      setSelectedMoodId(null);
    }
  }

  useEffect(() => {
    resolveSelectedMoodId(selectedMood);
  }, [selectedMood]);

  // Freitext-Suche → auch Mood Engine probieren
  useEffect(() => {
    (async () => {
      const t = debouncedSearch.trim();
      if (!t || t.length < 2) {
        setSearchMoodId(null);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("match_mood", { input: t });
        if (!error && typeof data === "number") {
          setSearchMoodId(data);
        } else {
          setSearchMoodId(null);
        }
      } catch {
        setSearchMoodId(null);
      }
    })();
  }, [debouncedSearch]);

  /* =============================================================
     FILTER LOGIC
  ============================================================= */

  const spotMatchesSearch = React.useCallback((spot: Spot, term: string) => {
    const t = normalizeText(term);
    if (!t) return true;

    // Name / Adresse / Stadt
    if (normalizeText(spot.name).includes(t)) return true;
    if (normalizeText(spot.address || "").includes(t)) return true;
    if (normalizeText(spot.city || "").includes(t)) return true;

    // Mood-Token Text (falls User "cozy", "romantisch" etc. schreibt)
    const moods = (spotMoods[spot.id] || []).map((m) => normalizeText(m));
    if (moods.some((m) => m.includes(t))) return true;

    return false;
  }, [spotMoods]);

  const spotMatchesMood = React.useCallback((spot: Spot) => {
    const ids = spotMoodIds[spot.id] || [];

    // Effektive Mood-IDs aus Chip + Suche
    const combined = [selectedMoodId, searchMoodId].filter(
      (v): v is number => typeof v === "number"
    );

    // Nur IDs verwenden, die überhaupt in den Daten vorkommen → Fallback,
    // damit z.B. "cozy" nicht alles killt, falls kein Spot dieses ID hat.
    const effectiveMoodIds = combined.filter((mid) => allMoodIdsInData.has(mid));

    if (effectiveMoodIds.length === 0) return true;
    return effectiveMoodIds.some((mid) => ids.includes(mid));
  }, [allMoodIdsInData, searchMoodId, selectedMoodId, spotMoodIds]);

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
      if (debouncedSearch.trim() && !spotMatchesSearch(s, debouncedSearch))
        return false;
      return true;
    });
  }, [
    globalSpots,
    selectedCategory,
    debouncedSearch,
    initialSpotIdList,
    spotMatchesMood,
    spotMatchesSearch,
  ]);

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

  const renderedMarkers = filteredSpots.map((spot) => {
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
        <StateView kind="loading" title="Karte wird geladen" />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <AppText role="label" tone="lime">{viewMode === "list" ? "BASEL · ORTE" : "BASEL · KARTE"}</AppText>
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

        {activeFilters.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilters}>
          {activeFilters.map((filter) => <Chip key={filter.id} label={`${filter.label} ×`} kind="selected" onPress={filter.onRemove} />)}
        </ScrollView>}
      </View>

      <Modal transparent animationType="slide" visible={filtersOpen} onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.filterBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Filter schliessen" style={StyleSheet.absoluteFill} onPress={() => setFiltersOpen(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.filterSheetHeader}>
              <View>
                <AppText role="sectionTitle">Filter</AppText>
                <AppText role="meta" tone="secondary">Nur das, was zu deinem Moment passt.</AppText>
              </View>
              <IconButton accessibilityLabel="Filter schliessen" onPress={() => setFiltersOpen(false)}>
                <Ionicons name="close" size={21} color={theme.color.textPrimary} />
              </IconButton>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterSheetContent}>
              <AppText role="label" tone="lime">MOOD</AppText>
              <View style={styles.filterChipGrid}>
                {(topMoodChips.length ? topMoodChips : MOOD_SUGGESTIONS).map((m) => {
                  const selected = selectedMood?.toLowerCase() === m.toLowerCase();
                  return <Chip key={m} label={m} kind="input" selected={selected} onPress={() => {
                    setSelectedMood((current) => current?.toLowerCase() === m.toLowerCase() ? null : m);
                    setSearch((current) => current?.toLowerCase() === m.toLowerCase() ? "" : m);
                  }} />;
                })}
              </View>
              <AppText role="label" tone="lime" style={styles.filterSectionLabel}>KATEGORIE</AppText>
              <View style={styles.filterChipGrid}>
                {dbCategories.map((category) => <Chip key={category.id} label={category.name} kind="input" selected={selectedCategory === category.id} onPress={() => setSelectedCategory((current) => current === category.id ? null : category.id)} />)}
              </View>
            </ScrollView>
            <View style={styles.filterSheetActions}>
              <Button label="Zurücksetzen" variant="tertiary" onPress={clearFilters} style={styles.filterReset} />
              <Button label={viewMode === "map" ? "Karte zeigen" : "Liste zeigen"} onPress={() => setFiltersOpen(false)} style={styles.filterApply} />
            </View>
          </View>
        </View>
      </Modal>

      {/* MAP or LIST */}
      {viewMode === "map" ? (
        <View style={styles.mapStage}>
          <ClusteredMapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
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
          {!filteredSpots.length && <View pointerEvents="box-none" style={styles.emptyOverlay}>
            <StateView kind="empty" title="Hier ist gerade nichts dabei" message="Passe deine Suche oder Filter an und entdecke Basel weiter." actionLabel="Filter zurücksetzen" onAction={clearFilters} />
          </View>}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filteredSpots}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          onScroll={(event) => { listScrollOffset.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <Pressable
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
              />
              <View style={styles.listCardBody}>
                <Text style={styles.listCardTitle}>{item.name}</Text>
                <Text style={styles.listCardContext} numberOfLines={1}>{item.categories?.name || spotMoods[item.id]?.[0] || "Ort in Basel"}</Text>
                <Text style={styles.listCardAddress} numberOfLines={1}>{item.address || "Adresse offen"}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* RECENTER BUTTON */}
      {viewMode === "map" && (
        <Pressable style={styles.recenterBtn} onPress={recenterToMe}>
          <Ionicons name="locate-outline" size={22} color={theme.color.textPrimary} />
        </Pressable>
      )}

      {/* BOTTOM SHEET */}
      <Animated.View
        style={[
          styles.sheetContainer,
          { height: SHEET_HEIGHT, bottom: theme.control.tabBar + insets.bottom, transform: [{ translateY }] },
        ]}
        pointerEvents={selectedSpot ? "box-none" : "none"}
        {...panResponder.panHandlers}
      >
        <BlurView intensity={34} tint="dark" style={styles.sheetBlur}>
          <View style={styles.sheetHandle} />

          {selectedSpot ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 30 }}>
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
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {selectedSpot.name}
                    </Text>

                    {selectedSpot.address && <Text style={styles.resultSubtitle} numberOfLines={1}>{selectedSpot.address}</Text>}

                    <View style={styles.cardChipsRow}>
                      {(spotMoods[selectedSpot.id] || [])
                        .slice(0, 4)
                        .map((m) => (
                          <View key={m} style={styles.badgeGhost}>
                            <Text style={styles.badgeGhostText}>{m}</Text>
                          </View>
                        ))}
                    </View>
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
                <Text style={styles.sheetCtaPrimaryText}>Spot ansehen</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 18 }}>
              <Text style={styles.emptySheetText}>Tippe auf einen Marker</Text>
            </View>
          )}
        </BlurView>
      </Animated.View>
    </SafeAreaView>
  );
}

/* === Styles === */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.color.background },
  header: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, backgroundColor: theme.color.background },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.md, marginBottom: theme.spacing.sm },
  titleCopy: { gap: 1 },
  resultCount: { marginTop: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: "rgba(216,255,62,0.08)", borderWidth: 1, borderColor: "rgba(216,255,62,0.22)" },
  headerTopRow: { flexDirection: "row", gap: theme.spacing.xs, alignItems: "center" },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", minHeight: theme.control.standard, backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, paddingLeft: theme.spacing.md, paddingRight: theme.spacing.xs },
  searchInput: { flex: 1, color: theme.color.textPrimary, fontFamily: theme.type.bodyMedium, fontSize: 15, minHeight: theme.control.standard },
  searchClear: { minWidth: 34, minHeight: 34 },
  headerButton: { width: theme.control.standard, height: theme.control.standard, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.pill },
  headerButtonActive: { backgroundColor: theme.color.pink, borderColor: theme.color.pink },
  perspectiveSwitch: { flexDirection: "row", minHeight: theme.control.standard, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, padding: 3 },
  perspectiveOption: { minWidth: 58, minHeight: 38, paddingHorizontal: theme.spacing.xs, borderRadius: theme.radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
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
  cardOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: theme.spacing.md },
  resultTitle: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 25, lineHeight: 30, marginBottom: theme.spacing.xxs, letterSpacing: -0.5 },
  resultSubtitle: { color: "rgba(247,243,233,0.76)", fontFamily: theme.type.bodyMedium, fontSize: 14, lineHeight: 19, marginBottom: theme.spacing.sm },
  cardChipsRow: { flexDirection: "row", gap: theme.spacing.xs, flexWrap: "wrap" },
  badgeGhost: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.pill, backgroundColor: "rgba(5,5,6,0.35)", borderWidth: 1, borderColor: "rgba(247,243,233,0.2)" },
  badgeGhostText: { color: theme.color.textPrimary, fontFamily: theme.type.bodyBold, fontSize: 12 },
  sheetCtaPrimary: { backgroundColor: theme.color.pink, paddingVertical: 15, borderRadius: theme.radius.pill, alignItems: "center", marginTop: theme.spacing.sm },
  sheetCtaPrimaryText: { fontFamily: theme.type.bodyBold, color: theme.color.background, fontSize: 15 },
  emptySheetText: { color: theme.color.textSecondary, fontFamily: theme.type.bodyMedium, fontSize: 14 },
  filterBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.54)" },
  filterSheet: { maxHeight: "82%", backgroundColor: theme.color.surfaceElevated, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: theme.spacing.xl },
  filterSheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.md, marginBottom: theme.spacing.md },
  filterSheetContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  filterChipGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  filterSectionLabel: { marginTop: theme.spacing.lg },
  filterSheetActions: { flexDirection: "row", gap: theme.spacing.sm, paddingTop: theme.spacing.sm },
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
