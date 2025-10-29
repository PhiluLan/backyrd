// mobile/app/(tabs)/index.tsx
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  ScrollView,
  FlatList,
  StyleSheet,
  TextInput,
  Animated,
} from "react-native";
import { supabase } from "../../lib/supabase";
import type { Spot } from "../../lib/types";
import { useRouter } from "expo-router";
import type { User } from "@supabase/supabase-js";
import { SafeAreaView } from "react-native-safe-area-context";
import { MoodPill } from "../../components/spot";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

/** ===== THEME (modern premium dark) ===== */
const theme = {
  colors: {
    background: "#0A0A0B",
    surface: "#131316",
    surfaceElevated: "#1B1B21",
    border: "#2A2A33",
    text: "#FFFFFF",
    textMuted: "#A6A8AD",
    primary: "#0EA5E9",
    primaryAlt: "#55D6FF",
    accent: "#A78BFA",
    success: "#22C55E",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 28,
    pill: 999,
  },
  spacing: (n: number) => n * 8,
};

/** ===== CONSTANTS ===== */
const MOOD_SUGGESTIONS: string[] = [
  "gemütlich",
  "lebendig",
  "romantisch",
  "chillig",
  "authentisch",
  "versteckt",
  "modern",
  "rustikal",
  "instagrammable",
];

type SpotTopMoods = Record<string, string[]>;
type GroupedResults = { fromName: Spot[]; fromMood: Spot[] };

/** ===== SCREEN ===== */
export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [grouped, setGrouped] = useState<GroupedResults>({ fromName: [], fromMood: [] });
  const [topMoods, setTopMoods] = useState<SpotTopMoods>({});
  const [user, setUser] = useState<User | null>(null);
  const [recentVisits, setRecentVisits] = useState<Spot[]>([]);
  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Intro animation
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 14, stiffness: 140, mass: 0.7 }),
    ]).start();
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) loadRecentVisits(user.id);
  }, [user]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length === 0) {
      setGrouped({ fromName: [], fromMood: [] });
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q), 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  async function loadRecentVisits(userId: string) {
    try {
      const { data } = await supabase
        .from("reviews")
        .select(
          `
          id,
          created_at,
          spot:spot_id (
            id,
            name,
            address
          )
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3);
      const spots = (data || []).map((r: any) => r.spot).filter(Boolean);
      setRecentVisits(spots);
    } catch (e: any) {
      console.error("Fehler bei recent visits:", e.message);
    }
  }

  async function runSearch(term: string) {
    const searchTerm = term.trim();
    if (!searchTerm) return;
    setLoading(true);
    try {
      const pattern = `%${searchTerm}%`;
      const { data: spotsA } = await supabase
        .from("spots")
        .select("id,name,address,lat,lng,category,status")
        .eq("status", "approved")
        .or(`name.ilike.${pattern},address.ilike.${pattern},category.ilike.${pattern}`)
        .limit(100);

      const { data: reviews } = await supabase
        .from("reviews")
        .select("spot_id")
        .or(`mood_a.ilike.${pattern},mood_b.ilike.${pattern}`)
        .limit(200);

      const moodSpotIds = Array.from(new Set((reviews || []).map((r) => r.spot_id as string)));
      let spotsB: Spot[] = [];
      if (moodSpotIds.length) {
        const { data } = await supabase
          .from("spots")
          .select("id,name,address,lat,lng,category,status")
          .eq("status", "approved")
          .in("id", moodSpotIds);
        spotsB = (data || []) as Spot[];
      }

      setGrouped({ fromName: (spotsA as Spot[]) || [], fromMood: spotsB });

      const merged = [...(spotsA || []), ...spotsB];
      if (merged.length) {
        const ids = merged.map((s) => s.id);
        const { data: moodsData } = await supabase
          .from("spot_moods")
          .select("spot_id,mood,rank")
          .in("spot_id", ids)
          .lte("rank", 3);

        const bySpot: SpotTopMoods = {};
        (moodsData || []).forEach((row: any) => {
          if (!bySpot[row.spot_id]) bySpot[row.spot_id] = [];
          bySpot[row.spot_id].push(row.mood);
        });
        setTopMoods(bySpot);
      } else {
        setTopMoods({});
      }
    } catch (e: any) {
      Alert.alert("Suche fehlgeschlagen", e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const onSelectMood = (mood: string) => setQ(mood);

  const openMapWithResults = () => {
    const all = [...grouped.fromName, ...grouped.fromMood];
    if (all.length === 0) return;
    const ids = all.map((s) => s.id).join(",");
    router.push({ pathname: "/map", params: { spotIds: ids } });
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.ScrollView
            contentContainerStyle={{ paddingBottom: theme.spacing(14) }}
            showsVerticalScrollIndicator={false}
            style={{ opacity: fade, transform: [{ translateY }] }}
          >
            {/* ===== HERO ===== */}
            <LinearGradient
              colors={["#0A0A0B", "#0A0A0B", "#12131A", "#191A22"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <SafeAreaView edges={["top"]}>
                <Text style={styles.heroTitle}>👋 Hi {user?.user_metadata?.first_name || "Gast"}.</Text>
                <Text style={styles.heroSubtitle}>Wonach fühlst du dich?</Text>

                {/* Search */}
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={20} color="#B0B2B8" />
                  <TextInput
                    placeholder="z. B. cozy bar, rooftop…"
                    placeholderTextColor="#8F9299"
                    style={styles.searchInput}
                    value={q}
                    onChangeText={setQ}
                    returnKeyType="search"
                  />
                  {q.length > 0 && (
                    <Pressable onPress={() => setQ("")} hitSlop={10} style={{ paddingLeft: 4 }}>
                      <Ionicons name="close-circle" size={18} color="#7C8087" />
                    </Pressable>
                  )}
                </View>

                {/* Quick filters (optional) */}
                <View style={styles.quickRow}>
                  {["Date Night", "After Work", "Hidden Gem"].map((t) => (
                    <Pressable key={t} style={styles.quickChip} onPress={() => setQ(t.toLowerCase())}>
                      <Ionicons name="sparkles" size={14} color={theme.colors.text} />
                      <Text style={styles.quickChipText}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </SafeAreaView>
            </LinearGradient>

            {/* ===== MOOD SUGGESTIONS ===== */}
            <View style={styles.moodRowWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moodRow}
              >
                {MOOD_SUGGESTIONS.map((m) => (
                  <MoodPill key={m} label={m} variant="outline" onPress={onSelectMood} />
                ))}
              </ScrollView>
              {/* Edge fades */}
              <LinearGradient
                pointerEvents="none"
                colors={["#0A0A0B", "transparent"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.edgeLeft}
              />
              <LinearGradient
                pointerEvents="none"
                colors={["transparent", "#0A0A0B"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.edgeRight}
              />
            </View>

            {/* ===== CTA: Map (GLASS BUTTON) ===== */}
            {(grouped.fromName.length > 0 || grouped.fromMood.length > 0) && (
              <View style={styles.mapBtnWrapper}>
                <BlurView intensity={60} tint="dark" style={styles.mapBtnBlur}>
                  <Pressable onPress={openMapWithResults} style={styles.mapBtn}>
                    <Text style={styles.mapBtnTextGlass}>Ergebnisse auf Karte anzeigen</Text>
                  </Pressable>
                </BlurView>
              </View>
            )}

            {/* ===== RESULTS ===== */}
            <View style={{ paddingHorizontal: theme.spacing(2) }}>
              {loading && (
                <View style={{ paddingVertical: theme.spacing(2) }}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              )}

              {!loading && q.length > 0 && grouped.fromName.length === 0 && grouped.fromMood.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: theme.spacing(4) }}>
                  <Text style={{ fontSize: 42, marginBottom: theme.spacing(1) }}>🤔</Text>
                  <Text style={styles.textMuted}>
                    Nichts gefunden. Versuch’s mit „gemütlich“, „rooftop“ oder „modern“.
                  </Text>
                </View>
              )}

              {grouped.fromName.length > 0 && (
                <>
                  <SectionHeader title="Passend nach Name / Adresse" />
                  <View style={{ gap: 16, marginBottom: 22 }}>
                    {grouped.fromName.map((spot) => (
                      <ResultCard key={spot.id} spot={spot} topMoods={topMoods[spot.id]} />
                    ))}
                  </View>
                </>
              )}

              {grouped.fromMood.length > 0 && (
                <>
                  <SectionHeader title="Passend nach Stimmung" />
                  <View style={{ gap: 16, marginBottom: 22 }}>
                    {grouped.fromMood.map((spot) => (
                      <ResultCard key={spot.id} spot={spot} topMoods={topMoods[spot.id]} />
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* ===== RECENTS ===== */}
            {user && (
              <View style={{ paddingHorizontal: theme.spacing(2) }}>
                <SectionHeader title="Deine letzten Besuche" />
                {recentVisits.length > 0 ? (
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={recentVisits}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <Pressable onPress={() => router.push(`/spot/${item.id}`)} style={{ marginRight: 14, width: 240 }}>
                        <Image
                          source={{ uri: `https://picsum.photos/400/250?random=${item.id}` }}
                          style={styles.recentImg}
                        />
                        <Text style={styles.resultTitle}>{item.name}</Text>
                      </Pressable>
                    )}
                  />
                ) : (
                  <Text style={styles.textMuted}>Du hast noch keine Reviews geschrieben.</Text>
                )}
              </View>
            )}
          </Animated.ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

/** ===== SUB-COMPONENTS ===== */
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionUnderline} />
    </View>
  );
}

function ResultCard({ spot, topMoods }: { spot: Spot; topMoods?: string[] }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/spot/${spot.id}`)} style={styles.card}>
      <View style={styles.cardMedia}>
        <Image source={{ uri: `https://picsum.photos/800/500?random=${spot.id}` }} style={styles.cardImg} />
        {/* top-left badge */}
        <View style={styles.cardBadge}>
          <Ionicons name="star" size={12} color="#111" />
          <Text style={styles.cardBadgeText}>Top Spot</Text>
        </View>
        {/* gradient overlay with title */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardOverlay}
        >
          <Text style={styles.resultTitle} numberOfLines={1}>{spot.name}</Text>
          <Text style={styles.resultSubtitle} numberOfLines={1}>{spot.address}</Text>
          <View style={styles.cardChipsRow}>
            {(topMoods || []).slice(0, 3).map((mood) => (
              <View key={mood} style={styles.badgeGhost}>
                <Text style={styles.badgeGhostText}>{mood}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

/** ===== STYLES ===== */
export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  /* ---------- HERO ---------- */
  heroGradient: {
    paddingHorizontal: theme.spacing(2),
    paddingTop: theme.spacing(6),
    paddingBottom: theme.spacing(4),
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  heroSubtitle: { color: theme.colors.textMuted, fontSize: 18, marginTop: 2 },

  searchBox: {
    marginTop: theme.spacing(2),
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  searchInput: { flex: 1, color: theme.colors.text, fontSize: 16 },

  quickRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: theme.spacing(1.5),
  },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: theme.radius.pill,
  },
  quickChipText: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },

  /* ---------- MOODS ---------- */
  moodRowWrapper: {
    position: "relative",
    paddingVertical: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
  },
  moodRow: {
    paddingHorizontal: theme.spacing(2),
    gap: 8,
  },
  edgeLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: 24 },
  edgeRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: 24 },

  /* ---------- CTA MAP BUTTON (GLASS) ---------- */
  mapBtnWrapper: {
    marginHorizontal: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderRadius: theme.radius.xl,
    overflow: "hidden", // wichtig für Blur-Ränder
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  mapBtnBlur: {
    borderRadius: theme.radius.xl,
    backgroundColor: "rgba(255,255,255,0.08)", // subtil transparent für Glas
  },
  mapBtn: {
    paddingVertical: theme.spacing(1.75),
    alignItems: "center",
    justifyContent: "center",
  },
  mapBtnTextGlass: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  /* ---------- SECTIONS ---------- */
  sectionHeader: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  sectionUnderline: {
    height: 2,
    width: 42,
    backgroundColor: theme.colors.accent,
    borderRadius: 2,
  },
  textMuted: { color: theme.colors.textMuted, fontSize: 15, textAlign: "center", maxWidth: 320 },

  /* ---------- CARD ---------- */
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xxl,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
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
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  resultSubtitle: { color: theme.colors.textMuted, fontSize: 13, marginBottom: 8 },
  cardChipsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  badgeGhost: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  badgeGhostText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
  cardBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "#FDE68A",
  },
  cardBadgeText: { color: "#111827", fontSize: 12, fontWeight: "800" },

  /* ---------- RECENTS ---------- */
  recentImg: {
    width: "100%",
    height: 140,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing(1),
  },
});
