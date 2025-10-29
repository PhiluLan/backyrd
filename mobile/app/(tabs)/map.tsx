import { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Alert,
  Pressable,
  Text,
  ActivityIndicator,
  ScrollView,
  Platform,
  StyleSheet,
  TextInput,
  Dimensions,
  Animated,
  PanResponder,
} from "react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { useRouter, useLocalSearchParams } from "expo-router";
import { MOOD_SUGGESTIONS, normalizeMood } from "../../lib/moods";
import { MoodPill } from "../../components/spot";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

const BASEL = { latitude: 47.5596, longitude: 7.5886 };

const theme = {
  colors: {
    background: "#0A0A0B",
    surface: "#131316",
    surfaceElevated: "#1B1B21",
    border: "#2A2A33",
    text: "#FFFFFF",
    textMuted: "#A6A8AD",
    primary: "#0EA5E9",
    accent: "#A78BFA",
  },
  radius: { md: 12, lg: 16, xl: 24, pill: 999 },
  spacing: (n: number) => n * 8,
};

type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string | null;
};

const { height: SCREEN_H } = Dimensions.get("window");
const SNAP_COLLAPSED = 300;
const SNAP_MID = SCREEN_H *0.6;
const SHEET_HEIGHT = SCREEN_H;


const OFFSET_FULL = 0;
const OFFSET_MID = SHEET_HEIGHT - SNAP_MID;
const OFFSET_COLLAPSED = SHEET_HEIGHT - SNAP_COLLAPSED;
const OFFSET_HIDDEN = SHEET_HEIGHT + 40;

export default function MapScreen() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [spotMoods, setSpotMoods] = useState<Record<string, string[]>>({});
  const [region, setRegion] = useState({
    ...BASEL,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams<{ spotIds?: string }>();

  const [MapViewComp, setMapViewComp] = useState<any>(null);
  const [MarkerComp, setMarkerComp] = useState<any>(null);

  // ==== Bottom Sheet Animation ====
  const translateY = useRef(new Animated.Value(OFFSET_HIDDEN)).current;
  const lastOffset = useRef(OFFSET_HIDDEN);

  function snapTo(offset: number, velocity = 0) {
    lastOffset.current = offset;
    Animated.spring(translateY, {
      toValue: offset,
      useNativeDriver: true,
      velocity,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
    }).start();
  }
  const openSheetCollapsed = () => snapTo(OFFSET_COLLAPSED);
  const openSheetMid = () => snapTo(OFFSET_MID);
  const openSheetFull = () => snapTo(OFFSET_FULL);
  const hideSheet = () => {
    setSelectedSpot(null);
    snapTo(OFFSET_HIDDEN);
  };

  // PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.min(Math.max(lastOffset.current + gesture.dy, OFFSET_FULL), OFFSET_HIDDEN);
        translateY.setValue(next);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const end = lastOffset.current + gesture.dy;
        const clamped = Math.min(Math.max(end, OFFSET_FULL), OFFSET_HIDDEN);
        const mid1 = (OFFSET_FULL + OFFSET_MID) / 2;
        const mid2 = (OFFSET_MID + OFFSET_COLLAPSED) / 2;
        const velocity = gesture.vy;

        let target = OFFSET_MID;
        if (clamped <= mid1) target = OFFSET_FULL;
        else if (clamped <= mid2) target = OFFSET_MID;
        else if (clamped <= (OFFSET_COLLAPSED + OFFSET_HIDDEN) / 2) target = OFFSET_COLLAPSED;
        else target = OFFSET_HIDDEN;

        if (velocity > 1.2) target = Math.min(OFFSET_HIDDEN, Math.max(target, OFFSET_COLLAPSED));
        if (velocity < -1.2) target = Math.max(OFFSET_FULL, Math.min(target, OFFSET_MID));

        snapTo(target, Math.abs(velocity));
        if (target === OFFSET_HIDDEN) setSelectedSpot(null);
      },
    })
  ).current;

  // react-native-maps dynamisch laden
  useEffect(() => {
    if (Platform.OS !== "web") {
      (async () => {
        const maps = await import("react-native-maps");
        setMapViewComp(() => maps.default);
        setMarkerComp(() => maps.Marker);
      })();
    }
  }, []);

  // Standort laden
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setRegion((prev) => ({
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }));
      } catch {}
    })();
  }, []);

  // Spots laden
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("spots")
        .select("id,name,lat,lng,category,status")
        .eq("status", "approved")
        .limit(2000);

    if (!error) {
        let all = (data || []) as Spot[];
        if (params.spotIds) {
          const ids = params.spotIds.split(",");
          setFilteredIds(ids);
          all = all.filter((s) => ids.includes(s.id));
        } else {
          setFilteredIds(null);
        }
        setSpots(all);
      }
    })();
  }, [params.spotIds]);

  // Top Moods laden
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("spot_moods")
        .select("spot_id,mood,rank")
        .lte("rank", 3)
        .limit(8000);

      const map: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        const m = normalizeMood(row.mood);
        if (!map[row.spot_id]) map[row.spot_id] = [];
        if (!map[row.spot_id].includes(m)) map[row.spot_id].push(m);
      });
      setSpotMoods(map);
    })();
  }, []);

  // Debounce Textsuche
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (search.trim().length > 0) setFilteredIds(null);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Spots filtern
  const filteredSpots = useMemo(() => {
    let list = [...spots];
    if (filteredIds && filteredIds.length > 0) list = list.filter((s) => filteredIds.includes(s.id));
    if (selectedMood) {
      const sel = normalizeMood(selectedMood);
      list = list.filter((s) => (spotMoods[s.id] || []).includes(sel));
    }
    const text = search.trim().toLowerCase();
    if (text.length > 0) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(text) ||
          (spotMoods[s.id] || []).some((m) => m.toLowerCase().includes(text))
      );
    }
    return list;
  }, [spots, spotMoods, selectedMood, search, filteredIds]);

  async function recenterToMe() {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setRegion((prev) => ({
        ...prev,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }));
    } catch {
      Alert.alert("Standort", "Konnte Standort nicht bestimmen.");
    }
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#fff", textAlign: "center" }}>
          Die Kartenansicht ist im Web derzeit nicht verfügbar. Bitte verwende die mobile App.
        </Text>
      </View>
    );
  }

  if (!MapViewComp) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.text} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top"]}>
      {/* ===== Overlay Header Bereich mit Safe Area & pointerEvents ===== */}
      <View style={styles.headerOverlay} pointerEvents="box-none">
        <SafeAreaView edges={["top", "left", "right"]} style={styles.headerSafeArea} pointerEvents="box-none">
          {/* 🔍 Search Box */}
          <View style={styles.searchWrap} pointerEvents="box-none">
            <BlurView intensity={50} tint="dark" style={styles.searchBlur}>
              <TextInput
                placeholder="Suche nach Name oder Mood..."
                placeholderTextColor={theme.colors.textMuted}
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
              />
            </BlurView>
          </View>

          {/* 🎛 Filter */}
          <View style={styles.filterWrap} pointerEvents="box-none">
            <BlurView intensity={40} tint="dark" style={styles.filterBlur}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {MOOD_SUGGESTIONS.map((m) => (
                  <MoodPill
                    key={m}
                    label={m}
                    variant="outline"
                    selected={selectedMood === m}
                    onPress={(label) => setSelectedMood((cur) => (cur === label ? null : label))}
                  />
                ))}
              </ScrollView>
            </BlurView>
          </View>

          {/* 📍 Recenter */}
          <View style={styles.recenterWrap} pointerEvents="box-none">
            <BlurView intensity={40} tint="dark" style={styles.recenterBlur}>
              <Pressable onPress={recenterToMe} style={styles.recenterBtn}>
                <Ionicons name="locate-outline" size={22} color="#fff" />
              </Pressable>
            </BlurView>
          </View>
        </SafeAreaView>
      </View>

      {/* 🗺️ Map */}
      <MapViewComp
        provider="google"
        style={{ flex: 1 }}
        region={region}
        initialRegion={region}
        showsUserLocation
        customMapStyle={DARK_MAP_STYLE}
        onPress={(e) => {
          // Wenn man auf die Karte tippt (nicht auf einen Marker), dann schließen
          if (!e.nativeEvent.action) {
            hideSheet();
          }
        }}
      >
        {filteredSpots.map((spot) => (
          <MarkerComp
            key={spot.id}
            coordinate={{ latitude: spot.lat, longitude: spot.lng }}
            pinColor={
              spot.category === "Bar"
                ? "#FF6F61"
                : spot.category === "Restaurant"
                ? "#18A76D"
                : spot.category === "Cafe"
                ? "#3A86FF"
                : "#A78BFA"
            }
            onPress={() => {
              setSelectedSpot(spot);
              openSheetCollapsed();
            }}
          />
        ))}
      </MapViewComp>

      {/* ===== Bottom Sheet (Glass, draggable) ===== */}
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            height: SHEET_HEIGHT,
            transform: [{ translateY }],
          },
        ]}
        pointerEvents={selectedSpot ? "box-none" : "none"}
        {...panResponder.panHandlers}
      >
        <BlurView intensity={30} tint="dark" style={styles.sheetBlur}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          {/* Content */}
          {selectedSpot ? (
            <View style={{ paddingHorizontal: theme.spacing(2), paddingBottom: theme.spacing(2) }}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {selectedSpot.name}
              </Text>
              {!!selectedSpot.category && (
                <Text style={styles.sheetSubtitle}>{selectedSpot.category}</Text>
              )}

              {/* Moods */}
              <View style={{ marginTop: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {(spotMoods[selectedSpot.id] || []).slice(0, 5).map((m) => (
                    <View key={m} style={styles.moodChip}>
                      <Text style={styles.moodChipText}>{m}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              {/* CTA Row */}
              <View style={styles.sheetCtaRow}>
                <Pressable
                  style={styles.sheetCtaPrimary}
                  onPress={() => router.push(`/spot/${selectedSpot.id}`)}
                >
                  <Text style={styles.sheetCtaPrimaryText}>Spot ansehen</Text>
                </Pressable>
                <Pressable style={styles.sheetCtaSecondary} onPress={openSheetFull}>
                  <Text style={styles.sheetCtaSecondaryText}>Mehr</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 18 }}>
              <Text style={{ color: theme.colors.textMuted }}>Tippe auf einen Marker…</Text>
            </View>
          )}
        </BlurView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background },

  /* Overlay-Header */
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerSafeArea: {
    paddingHorizontal: theme.spacing(2),
  },

  searchWrap: {
    marginTop: theme.spacing(1.5),
  },
  searchBlur: {
    borderRadius: theme.radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  searchInput: {
    color: theme.colors.text,
    fontSize: 16,
  },

  filterWrap: {
    marginTop: theme.spacing(1),
  },
  filterBlur: {
    borderRadius: theme.radius.xl,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  recenterWrap: {
    position: "absolute",
    top: theme.spacing(1.5),
    right: theme.spacing(0),
  },
  recenterBlur: {
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  recenterBtn: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  moodChipOuter: {},

  /* Bottom Sheet */
  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
  sheetBlur: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
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
  sheetTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  sheetSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  moodChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  moodChipText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },

  sheetCtaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  sheetCtaPrimary: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
    alignItems: "center",
  },
  sheetCtaPrimaryText: {
    color: "#111",
    fontWeight: "800",
    fontSize: 15,
  },
  sheetCtaSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  sheetCtaSecondaryText: {
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
});

/* 🗺 Dark Map Style */
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1C1C1E" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8E8E93" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1C1C1E" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2C2C2E" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
];
