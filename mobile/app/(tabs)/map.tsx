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
import { supabase } from "../../lib/supabase";
import { useRouter } from "expo-router";
import { MOOD_SUGGESTIONS, normalizeMood } from "../../lib/moods";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import ClusteredMapView from "react-native-map-clustering";
import { useSpotsStore } from "../../lib/useSpotsStore";
import { useDebounce } from "use-debounce";
import { LinearGradient } from "expo-linear-gradient";
import { typography } from "../../theme/typography";

const BASEL = { latitude: 47.5596, longitude: 7.5886 };
const { height: SCREEN_H } = Dimensions.get("window");

const SNAP_COLLAPSED = 400;
const SHEET_HEIGHT = SCREEN_H;
const OFFSET_COLLAPSED = SHEET_HEIGHT - SNAP_COLLAPSED;
const OFFSET_FULL = 0;
const OFFSET_HIDDEN = SHEET_HEIGHT + 40;

const theme = {
  colors: {
    background: "#0A0A0B",
    surface: "#131316",
    border: "#2A2A33",
    text: "#FFFFFF",
    primary: "#0EA5E9",
  },
};

const MOOD_GROUPS: Record<string, string[]> = {
  gemütlich: ["gemütlich", "gemuetlich", "cozy", "chillig", "chill"],
  chillig: ["chillig", "chill", "gemütlich", "cozy"],
  romantisch: ["romantisch", "romantic"],
  versteckt: ["versteckt", "hidden", "secret", "hidden gem"],
  lebendig: ["lebendig", "vibrant"],
  laut: ["laut", "busy"],
  leise: ["leise", "ruhig", "quiet"],
  modern: ["modern", "contemporary"],
  authentisch: ["authentisch", "local"],
};

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
  header_photo_url?: string | null;
  category_id?: string | null;
  categories?: { name?: string | null; color?: string | null } | null;
};

export default function MapScreen() {
  const { spots: globalSpots, refresh, loading } = useSpotsStore();

  const [spotMoods, setSpotMoods] = useState<Record<string, string[]>>({});
  const [dbCategories, setDbCategories] = useState<DbCategory[]>([]);
  const [region, setRegion] = useState({
    ...BASEL,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const router = useRouter();
  const mapRef = useRef<ClusteredMapView | null>(null);

  // ==== Daten laden ====
  useEffect(() => {
    refresh();
    (async () => {
      const { data: catRows } = await supabase
        .from("categories")
        .select("id,name,icon,color")
        .limit(200);

      const { data: moodRows } = await supabase
        .from("spot_moods")
        .select("spot_id,mood,rank")
        .lte("rank", 5);

      const moodMap: Record<string, string[]> = {};
      (moodRows || []).forEach((r: any) => {
        const m = normalizeText(normalizeMood(r.mood));
        if (!m) return;
        if (!moodMap[r.spot_id]) moodMap[r.spot_id] = [];
        moodMap[r.spot_id].push(m);
      });

      setSpotMoods(moodMap);
      setDbCategories(catRows || []);
    })();
  }, []);

  // ==== Bottom Sheet ====
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
      onPanResponderGrant: () => translateY.stopAnimation(),
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
        const velocity = gesture.vy;
        let target = OFFSET_COLLAPSED;
        if (clamped > mid) target = OFFSET_HIDDEN;
        if (velocity > 1.2) target = OFFSET_HIDDEN;
        if (velocity < -1.2) target = OFFSET_FULL;
        snapTo(target, Math.abs(velocity));
        if (target === OFFSET_HIDDEN) setSelectedSpot(null);
      },
    })
  ).current;

  // ==== Filter ====
  const spotHasMood = (spotId: string, mood: string) => {
    const wanted = normalizeText(normalizeMood(mood));
    const group = MOOD_GROUPS[wanted] ?? [];
    const wantedGroup = [wanted, ...group.map(normalizeText)];
    const spotMoodList = (spotMoods[spotId] || []).map((m) =>
      normalizeText(normalizeMood(m))
    );
    return spotMoodList.some((m) => wantedGroup.includes(m));
  };

  const spotMatchesSearch = (spot: Spot, term: string) => {
    const t = normalizeText(term);
    if (!t) return true;
    if (normalizeText(spot.name).includes(t)) return true;
    const moods = (spotMoods[spot.id] || []).map((m) =>
      normalizeText(normalizeMood(m))
    );
    if (moods.some((m) => m.includes(t))) return true;
    const group = MOOD_GROUPS[t];
    if (group && moods.some((m) => group.map(normalizeText).includes(m))) return true;
    return false;
  };

  const filteredSpots = useMemo(() => {
    return globalSpots.filter((s) => {
      if (selectedMood && !spotHasMood(s.id, selectedMood)) return false;
      if (selectedCategory && s.category_id !== selectedCategory) return false;
      if (debouncedSearch.trim() && !spotMatchesSearch(s, debouncedSearch))
        return false;
      return true;
    });
  }, [globalSpots, selectedMood, selectedCategory, debouncedSearch, spotMoods]);

  const renderedMarkers = useMemo(
    () =>
      filteredSpots.map((spot) => (
        <Marker
          key={spot.id}
          coordinate={{ latitude: spot.lat, longitude: spot.lng }}
          onPress={(e) => {
            e.stopPropagation();
            setSelectedSpot(spot);
            openSheetCollapsed();
          }}
        >
          <Image
            source={require("../../assets/icons/marker.png")}
            style={{
              width: 34,
              height: 34,
              tintColor: spot.categories?.color || "#A78BFA",
            }}
            resizeMode="contain"
          />
        </Marker>
      )),
    [filteredSpots]
  );

  async function recenterToMe() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextRegion = {
        ...region,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 500);
    } catch {
      Alert.alert("Standort", "Konnte Standort nicht bestimmen.");
    }
  }

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        {/* Suche + Filter */}
        <View style={styles.headerTopRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#aaa" style={{ marginRight: 6 }} />
            <TextInput
              placeholder="Suche nach Name oder Mood..."
              placeholderTextColor="#777"
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons name="close" size={16} color="#aaa" />
              </Pressable>
            )}
          </View>

          <Pressable
            style={styles.toggleBtn}
            onPress={() => setViewMode((v) => (v === "map" ? "list" : "map"))}
          >
            <Ionicons
              name={viewMode === "map" ? "list-outline" : "map-outline"}
              size={20}
              color="#fff"
            />
          </Pressable>

          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              setSelectedCategory(null);
              setSelectedMood(null);
              setSearch("");
            }}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Mood Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {MOOD_SUGGESTIONS.map((m) => {
            const active = selectedMood === m;
            return (
              <Pressable
                key={m}
                onPress={() => setSelectedMood((cur) => (cur === m ? null : m))}
                style={[
                  styles.moodChipBtn,
                  {
                    backgroundColor: active ? theme.colors.primary : "rgba(255,255,255,0.08)",
                    borderColor: active ? theme.colors.primary : "rgba(255,255,255,0.2)",
                  },
                ]}
              >
                <Text style={[styles.moodChipTextBtn, { color: active ? "#fff" : "#ccc" }]}>{m}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Kategorien */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {dbCategories.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategory((cur) => (cur === cat.id ? null : cat.id))}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active ? cat.color : "rgba(255,255,255,0.08)",
                    borderColor: active ? cat.color : "rgba(255,255,255,0.2)",
                  },
                ]}
              >
                <Text style={styles.catIcon}>{cat.icon}</Text>
                <Text style={[styles.catText, { color: active ? "#fff" : "#ccc" }]}>
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Karte oder Liste */}
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
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/spot/${item.id}`)}>
              <Image
                source={
                  item.header_photo_url
                    ? { uri: item.header_photo_url }
                    : { uri: "https://via.placeholder.com/400x300/1b1b21/777?text=No+Image" }
                }
                style={styles.cardImage}
              />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardAddress}>{item.address || "–"}</Text>
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

      {viewMode === "map" && (
        <Pressable style={styles.recenterBtn} onPress={recenterToMe}>
          <Ionicons name="locate-outline" size={22} color="#fff" />
        </Pressable>
      )}

      {/* Bottom Sheet */}
      <Animated.View
        style={[styles.sheetContainer, { height: SHEET_HEIGHT, transform: [{ translateY }] }]}
        pointerEvents={selectedSpot ? "box-none" : "none"}
        {...panResponder.panHandlers}
      >
        <BlurView intensity={30} tint="dark" style={styles.sheetBlur}>
          <View style={styles.sheetHandle} />
          {selectedSpot ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 30 }}>
              <Pressable
                onPress={() => router.push(`/spot/${selectedSpot.id}`)}
                style={styles.card}
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
                    colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.cardOverlay}
                  >
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {selectedSpot.name}
                    </Text>
                    {!!selectedSpot.address && (
                      <Text style={styles.resultSubtitle} numberOfLines={1}>
                        {selectedSpot.address}
                      </Text>
                    )}

                    <View style={styles.cardChipsRow}>
                      {(spotMoods[selectedSpot.id] || []).slice(0, 4).map((m) => (
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
                onPress={() => router.push(`/spot/${selectedSpot.id}`)}
              >
                <Text style={styles.sheetCtaPrimaryText}>Spot ansehen</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 18 }}>
              <Text style={{ color: "#aaa" }}>Tippe auf einen Marker…</Text>
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
  header: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: "#0A0A0B" },
  headerTopRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1B1B21",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 15 },
  filterScroll: { paddingVertical: 6, gap: 8 },
  moodChipBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  moodChipTextBtn: { ...typography.body, fontSize: 13, fontWeight: "600" },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  catIcon: { marginRight: 4, fontSize: 16 },
  catText: { ...typography.body, fontSize: 13, fontWeight: "600" },
  toggleBtn: { backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, padding: 8 },
  clearBtn: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 999, padding: 6 },
  card: {
    backgroundColor: "#1B1B21",
    borderRadius: 12,
    marginBottom: 14,
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: 140 },
  cardBody: { padding: 10 },
  cardTitle: { ...typography.body, color: "#fff", fontSize: 16, fontWeight: "700" },
  cardAddress: { color: "#aaa", fontSize: 13, marginBottom: 6 },
  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  moodChipSmall: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  moodChipSmallText: { ...typography.body, color: "#fff", fontSize: 11 },
  recenterBtn: {
    position: "absolute",
    bottom: 30,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 10,
    borderRadius: 999,
  },
  sheetContainer: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40 },
  sheetBlur: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginTop: 8,
    marginBottom: 6,
  },
  sheetTitle: { ...typography.body, color: "#fff", fontSize: 18, fontWeight: "700" },
  sheetSubtitle: { ...typography.body, color: "#aaa", fontSize: 13, marginBottom: 8 },
  moodChip: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },

  card: {
    backgroundColor: "#1B1B21",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  cardMedia: { position: "relative" },
  cardImg: { width: "100%", height: 220 },
  cardOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
  },
  resultTitle: {
    ...typography.body,
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  resultSubtitle: { ...typography.body, color: "#ccc", fontSize: 13, marginBottom: 8 },
  cardChipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badgeGhost: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  badgeGhostText: { ...typography.body, color: "#fff", fontSize: 12, fontWeight: "700" },
  moodChipText: { ...typography.body, color: "#fff", fontSize: 12 },
  sheetCtaPrimary: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 12,
  },
  sheetCtaPrimaryText: { ...typography.body, fontWeight: "800", color: "#111" },
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
