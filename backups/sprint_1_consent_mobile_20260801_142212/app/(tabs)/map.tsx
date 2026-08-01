// backyrd/mobile/app/map.tsx

import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Alert,
  Pressable,
  Text,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  Dimensions,
  Animated,
  FlatList,
  Image,
  PanResponder,
} from "react-native";

import * as Location from "expo-location";
import ClusteredMapView from "react-native-map-clustering";
import { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";

import { useSpotsStore } from "../../lib/useSpotsStore";
import { useDebounce } from "use-debounce";
import { supabase } from "../../lib/supabase";
import { MOOD_SUGGESTIONS } from "../../lib/moods";
import { trackAnalyticsEvent } from "../../lib/analytics";

const BASEL = { latitude: 47.5596, longitude: 7.5886 };
const { height: SCREEN_H } = Dimensions.get("window");

const SNAP_COLLAPSED = 400;
const SHEET_HEIGHT = SCREEN_H;
const OFFSET_COLLAPSED = SHEET_HEIGHT - SNAP_COLLAPSED;
const OFFSET_FULL = 0;
const OFFSET_HIDDEN = SHEET_HEIGHT + 40;

const theme = {
  colors: {
    background: "#050506",
    surface: "#111113",
    surfaceElevated: "#17171A",
    border: "rgba(255,255,255,0.09)",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.58)",
    textSoft: "rgba(255,255,255,0.74)",
    primary: "#FF7DA7",
    pinkSoft: "#FFD4E0",
    greenSoft: "#C8E3A6",
  },
};

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
  const params = useLocalSearchParams<{ spotIds?: string }>();

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
  const [region, setRegion] = useState({
    ...BASEL,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // Auswahl: Mood über Chip
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedMoodId, setSelectedMoodId] = useState<number | null>(null);

  // Mood, der aus der freien Suche kommt
  const [searchMoodId, setSearchMoodId] = useState<number | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 350);

  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const mapRef = useRef<ClusteredMapView | null>(null);

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
  }, []);

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

  const spotMatchesSearch = (spot: Spot, term: string) => {
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
  };

  const spotMatchesMood = (spot: Spot) => {
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
  };

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
    selectedMoodId,
    searchMoodId,
    selectedCategory,
    debouncedSearch,
    spotMoods,
    spotMoodIds,
    allMoodIdsInData,
    initialSpotIdList,
  ]);

  /* =============================================================
     MAP RENDERING
  ============================================================= */

  const renderedMarkers = useMemo(
    () =>
      filteredSpots.map((spot) => (
        <Marker
          key={spot.id}
          coordinate={{ latitude: spot.lat, longitude: spot.lng }}
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
          <Image
            source={require("../../assets/icons/marker.png")}
            style={{
              width: 34,
              height: 34,
              tintColor: spot.categories?.color || theme.colors.primary,
            }}
            resizeMode="contain"
          />
        </Marker>
      )),
    [filteredSpots]
  );

  /* =============================================================
     BOTTOM SHEET
  ============================================================= */

  const translateY = useRef(new Animated.Value(OFFSET_HIDDEN)).current;
  const lastOffset = useRef(OFFSET_HIDDEN);

  const snapTo = (offset: number, velocity = 0) => {
    lastOffset.current = offset;
    Animated.spring(translateY, {
      toValue: offset,
      useNativeDriver: true,
      velocity,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
    }).start();
  };

  const openSheetCollapsed = () => snapTo(OFFSET_COLLAPSED);
  const hideSheet = () => {
    setSelectedSpot(null);
    snapTo(OFFSET_HIDDEN);
  };

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
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const next = {
        ...region,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };

      setRegion(next);
      mapRef.current?.animateToRegion(next, 500);
    } catch {
      Alert.alert("Standort", "Konnte Standort nicht bestimmen.");
    }
  }

  /* =============================================================
     RENDER
  ============================================================= */

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.locationLabel}>Basel</Text>
            <Text style={styles.title}>Orte entdecken</Text>
          </View>
          <Text style={styles.resultCount}>{filteredSpots.length} Spots</Text>
        </View>

        <View style={styles.headerTopRow}>
          {/* SEARCH */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={19} color="rgba(255,255,255,0.54)" style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Suche nach Ort, Mood oder Stadt..."
              placeholderTextColor="rgba(255,255,255,0.36)"
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons name="close" size={17} color="rgba(255,255,255,0.62)" />
              </Pressable>
            )}
            {search.length === 0 && (
              <Ionicons name="options-outline" size={19} color={theme.colors.pinkSoft} />
            )}
          </View>

          <Pressable
            style={styles.toggleBtn}
            onPress={() => setViewMode((v) => (v === "map" ? "list" : "map"))}
          >
            <Ionicons
              name={viewMode === "map" ? "list-outline" : "map-outline"}
              size={20}
              color={theme.colors.text}
            />
          </Pressable>

          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              setSelectedMood(null);
              setSelectedMoodId(null);
              setSearchMoodId(null);
              setSelectedCategory(null);
              setSearch("");
            }}
          >
            <Ionicons name="refresh" size={18} color={theme.colors.text} />
          </Pressable>
        </View>

        {/* MOOD FILTER – dynamic + fallback */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {(topMoodChips.length ? topMoodChips : MOOD_SUGGESTIONS).map((m) => {
            const active = selectedMood?.toLowerCase() === m.toLowerCase();
            return (
              <Pressable
                key={m}
                onPress={() => {
                  setSelectedMood((cur) =>
                    cur?.toLowerCase() === m.toLowerCase() ? null : m
                  );
                  // optional: Suchfeld mit Mood befüllen
                  setSearch((cur) =>
                    cur?.toLowerCase() === m.toLowerCase() ? "" : m
                  );
                }}
                style={[
                  styles.moodChipBtn,
                  {
                    backgroundColor: active
                      ? theme.colors.primary
                      : "rgba(255,255,255,0.055)",
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.moodChipTextBtn,
                    { color: active ? "#171214" : theme.colors.textSoft },
                  ]}
                >
                  {m}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* CATEGORY FILTER */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {dbCategories.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() =>
                  setSelectedCategory((cur) => (cur === cat.id ? null : cat.id))
                }
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active
                      ? cat.color || theme.colors.primary
                      : "rgba(255,255,255,0.055)",
                    borderColor: active
                      ? cat.color || theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text style={styles.catIcon}>{cat.icon}</Text>
                <Text
                  style={[
                    styles.catText,
                    { color: active ? "#171214" : theme.colors.textSoft },
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* MAP or LIST */}
      {viewMode === "map" ? (
        <ClusteredMapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={{ flex: 1 }}
          region={region}
          showsUserLocation
          clusterColor={theme.colors.primary}
          spiralEnabled
          customMapStyle={DARK_MAP_STYLE}
          onPress={hideSheet}
          clusteringEnabled={region.latitudeDelta > 0.05}
        >
          {renderedMarkers}
        </ClusteredMapView>
      ) : (
        <FlatList
          data={filteredSpots}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16 }}
          style={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.listCard}
              onPress={() => {
                void trackAnalyticsEvent({ eventName: "map_spot_opened", screenName: "map", entityType: "spot", entityId: item.id, spotId: item.id, properties: { source: "list" } });
                router.push(`/spot/${item.id}`);
              }}
            >
              <Image
                source={
                  item.header_photo_url
                    ? { uri: item.header_photo_url }
                    : {
                        uri: "https://via.placeholder.com/400x300/1b1b21/777?text=No+Image",
                      }
                }
                style={styles.listCardImage}
              />
              <View style={styles.listCardBody}>
                <Text style={styles.listCardTitle}>{item.name}</Text>
                <Text style={styles.listCardAddress}>{item.address || "Adresse offen"}</Text>

                <View style={styles.moodRow}>
                  {(spotMoods[item.id] || []).slice(0, 5).map((m) => (
                    <View key={m} style={styles.moodChipSmall}>
                      <Text style={styles.moodChipSmallText}>{m}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* RECENTER BUTTON */}
      {viewMode === "map" && (
        <Pressable style={styles.recenterBtn} onPress={recenterToMe}>
          <Ionicons name="locate-outline" size={22} color={theme.colors.text} />
        </Pressable>
      )}

      {/* BOTTOM SHEET */}
      <Animated.View
        style={[
          styles.sheetContainer,
          { height: SHEET_HEIGHT, transform: [{ translateY }] },
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
                  <Image
                    source={{
                      uri:
                        selectedSpot.header_photo_url ||
                        "https://via.placeholder.com/600x400/1b1b21/777?text=No+Image",
                    }}
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
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: theme.colors.background,
  },
  titleRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 14,
  },
  locationLabel: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 1,
  },
  resultCount: {
    color: theme.colors.pinkSoft,
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,125,167,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.2)",
    overflow: "hidden",
    marginTop: 3,
  },
  headerTopRow: { flexDirection: "row", gap: 9, alignItems: "center" },

  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },

  filterScroll: { paddingTop: 10, paddingBottom: 2, gap: 8 },

  moodChipBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    marginRight: 8,
  },
  moodChipTextBtn: { fontSize: 13, fontWeight: "800" },

  catChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  catIcon: { marginRight: 4, fontSize: 16 },
  catText: { fontSize: 13, fontWeight: "800" },

  toggleBtn: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
  },
  clearBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
  },

  // LIST Cards
  list: {
    backgroundColor: theme.colors.background,
  },
  listCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  listCardImage: { width: "100%", height: 170 },
  listCardBody: { padding: 14 },
  listCardTitle: {
    color: theme.colors.text,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "800",
    letterSpacing: -0.45,
  },
  listCardAddress: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 5,
    marginBottom: 10,
    fontWeight: "600",
  },

  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  moodChipSmall: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  moodChipSmallText: { color: theme.colors.textSoft, fontSize: 11, fontWeight: "800" },

  recenterBtn: {
    position: "absolute",
    bottom: 114,
    right: 20,
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5,5,6,0.72)",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
  },

  // Sheet
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
  sheetBlur: {
    flex: 1,
    backgroundColor: "rgba(5,5,6,0.7)",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginTop: 10,
    marginBottom: 10,
  },

  sheetCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  cardMedia: { position: "relative" },
  cardImg: { width: "100%", height: 228 },
  cardOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
  },
  resultTitle: {
    color: theme.colors.text,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: -0.55,
  },
  resultSubtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 10,
    fontWeight: "600",
  },
  cardChipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badgeGhost: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.11)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  badgeGhostText: { color: theme.colors.text, fontSize: 12, fontWeight: "800" },

  sheetCtaPrimary: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 12,
  },
  sheetCtaPrimaryText: { fontWeight: "900", color: "#171214", fontSize: 15 },
  emptySheetText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
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
