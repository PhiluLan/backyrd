// mobile/app/(tabs)/index.tsx
import { useState, useEffect, useRef, useMemo } from "react";
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
  FlatList,
  StyleSheet,
  TextInput,
  Animated,
  ScrollView,
} from "react-native";
import { supabase } from "../../lib/supabase";
import type { Spot } from "../../lib/types";
import { useRouter } from "expo-router";
import type { User } from "@supabase/supabase-js";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import ReAnimated, { SlideInUp, SlideOutDown } from "react-native-reanimated";
import LoginBottomSheet from "../../components/LoginBottomSheet";




/** ===== THEME ===== */
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

/** ===== HELPERS ===== */
const PLACEHOLDER_FUN = (seed: string | number) =>
  // leichter „witziger“ Platzhalter (Kätzchen), deterministisch per seed
  `https://placekitten.com/seed/${encodeURIComponent(String(seed))}/800/500`;

type SpotTopMoods = Record<string, string[]>;
type GroupedResults = { fromName: Spot[]; fromMood: Spot[] };

type SpotWithPhoto = Spot & { photoUrl?: string | null };
type JourneyMiniItem = SpotWithPhoto;

/** ===== SCREEN ===== */
export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [grouped, setGrouped] = useState<GroupedResults>({ fromName: [], fromMood: [] });
  const [topMoods, setTopMoods] = useState<SpotTopMoods>({});
  const [user, setUser] = useState<User | null>(null);

  // NEU
  const [recentVisits, setRecentVisits] = useState<SpotWithPhoto[]>([]);
  const [discoverSpots, setDiscoverSpots] = useState<SpotWithPhoto[]>([]);
  const [journeyTitle, setJourneyTitle] = useState<string>("Wie wär’s mal mit Ausgehen 2.0?");
  const [journeyMini, setJourneyMini] = useState<JourneyMiniItem[]>([]);
  const [loadingSecondary, setLoadingSecondary] = useState(false);

  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Intro animation
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const [showLoginSheet, setShowLoginSheet] = useState(false);


  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 14, stiffness: 140, mass: 0.7 }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!user) {
      const timer = setTimeout(() => {
        setShowLoginSheet(true);
      }, 4000);

      return () => clearTimeout(timer);
    } else {
      setShowLoginSheet(false);
    }
  }, [user]);


  // Session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Sektionen laden, wenn eingeloggt
  useEffect(() => {
    if (user) {
      loadRecentVisits(user.id);
      loadDiscover(user.id);
      loadLastJourney(user.id);
    } else {
      setRecentVisits([]);
      setDiscoverSpots([]);
      setJourneyMini([]);
      setJourneyTitle("Wie wär’s mal mit Ausgehen 2.0?");
    }
  }, [user]);

  // Suche (bestehend)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length === 0) {
      setGrouped({ fromName: [], fromMood: [] });
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q), 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  /** ===== Fotos zu Spots laden und mappen ===== */
  async function mapSpotPhotos(spots: Spot[]): Promise<SpotWithPhoto[]> {
    const ids = spots.map((s) => s.id);
    if (ids.length === 0) return [];

    // Fotos ziehen
    const { data: photos, error } = await supabase
      .from("spot_photos")
      .select("spot_id,url")
      .in("spot_id", ids)
      .order("id", { ascending: true });
    if (error) {
      // Kein harter Fehler – wir rendern einfach mit Platzhaltern
      console.warn("spot_photos fetch:", error.message);
    }
    const firstBySpot: Record<string, string> = {};
    (photos || []).forEach((p: any) => {
      if (!firstBySpot[p.spot_id]) firstBySpot[p.spot_id] = p.url;
    });

    return spots.map((s) => ({
      ...s,
      photoUrl: firstBySpot[s.id] || PLACEHOLDER_FUN(s.id),
    }));
  }

  /** ===== Deine letzten Besuche ===== */
  async function loadRecentVisits(userId: string) {
  try {
    setLoadingSecondary(true);

    const { data, error } = await supabase
      .from("reviews")
      .select(`
        id,
        created_at,
        spot:spot_id (
          id,
          name,
          address,
          lat,
          lng,
          category_id,
          categories ( id, name, icon, color ),
          status
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    // Alle Spots extrahieren und leere filtern
    const spots = (data || [])
      .map((r: any) => r.spot)
      .filter(Boolean) as Spot[];

    // ✅ doppelte Spots entfernen
    const uniqueSpots = Array.from(new Map(spots.map((s) => [s.id, s])).values());

    // ✅ garantierte eindeutige Keys anhängen
    const keyed = uniqueSpots.map((s, i) => ({ ...s, _key: `${s.id}-${i}` }));

    // ✅ Fotos laden
    const withPhotos = await mapSpotPhotos(keyed);

    setRecentVisits(withPhotos);
  } catch (e: any) {
    console.error("Fehler bei recent visits:", e.message);
    setRecentVisits([]);
  } finally {
    setLoadingSecondary(false);
  }
}

  /** ===== Neu entdeckt: eigene + Freunde ===== */
  async function loadDiscover(userId: string) {
    try {
      setLoadingSecondary(true);

      // 1) Freunde ermitteln
      const { data: following, error: followErr } = await supabase
        .from("follows")
        // ⛳ ggf. Spaltennamen anpassen, falls dein Schema anders ist:
        // z.B. follower_id = der, der folgt; followee_id = dem ich folge
        .select("follower")
        .eq("follower", userId);
      if (followErr) console.warn("follows:", followErr.message);

      const followeeIds = Array.from(new Set((following || []).map((x: any) => x.followee_id))).filter(Boolean);

      // 2) Spots von mir + Freunden (neueste zuerst)
      const creators = [userId, ...followeeIds];
      if (creators.length === 0) {
        setDiscoverSpots([]);
        return;
      }

      const { data: spots, error } = await supabase
        .from("spots")
        .select("id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status,created_by,created_at")
        .in("created_by", creators)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;

      const withPhotos = await mapSpotPhotos((spots || []) as Spot[]);
      setDiscoverSpots(withPhotos);
    } catch (e: any) {
      console.error("Neu entdeckt:", e.message);
      setDiscoverSpots([]);
    } finally {
      setLoadingSecondary(false);
    }
  }

  /** ===== Letzte Journey-Suche (Mini) ===== */
  async function loadLastJourney(userId: string) {
    try {
      setLoadingSecondary(true);

      // 1) Letzte user_searches holen
      const { data: last, error } = await supabase
        .from("user_searches")
        .select("query, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) console.warn("user_searches:", error.message);

      const phrase = last?.query?.trim();
      if (phrase) {
        setJourneyTitle(`Neuauflage von: „${phrase}“`);
      } else {
        setJourneyTitle("Wie wär’s mal mit Ausgehen 2.0?");
      }

      // 2) Kandidaten basierend auf Phrase (oder Defaults)
      const targetMoods = phrase
        ? extractMoodsFromPhrase(phrase)
        : ["romantisch", "gemütlich"]; // Defaults

      // Spots mit passenden Moods (Top 3 per spot_moods.rank)
      const { data: moodRows, error: moodErr } = await supabase
        .from("spot_moods")
        .select("spot_id,mood,rank")
        .in("mood", targetMoods)
        .lte("rank", 3)
        .limit(300);
      if (moodErr) console.warn("spot_moods:", moodErr.message);

      const spotIds = Array.from(new Set((moodRows || []).map((m: any) => m.spot_id)));
      let baseSpots: Spot[] = [];
      if (spotIds.length) {
        const { data: spots, error: spotsErr } = await supabase
          .from("spots")
          .select("id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status")
          .eq("status", "approved")
          .in("id", spotIds)
          .limit(40);
        if (!spotsErr) baseSpots = (spots || []) as Spot[];
      }

      // Falls keine Treffer: nimm allgemeine Top-Spots (approved, neueste)
      if (baseSpots.length === 0) {
        const { data: fallbackSpots } = await supabase
          .from("spots")
          .select("id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status,created_at")
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(12);
        baseSpots = (fallbackSpots || []) as Spot[];
      }

      const withPhotos = await mapSpotPhotos(baseSpots);

      // 3) Leicht „persönlich“ ranken: Favorisiere Restaurants/Bars + gematchte Moods
      const moodSet = new Set(targetMoods.map((m) => m.toLowerCase()));
      const ranked = withPhotos
        .map((s) => ({
          s,
          score:
            (/(restaurant|bar|weinbar)/i.test(s.category || "") ? 1.0 : 0) +
            (topMoodsScore(s.id, moodSet)) +
            0.1, // kleine Grundpunkte
        }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.s)
        .slice(0, 4);

      setJourneyMini(ranked);
    } catch (e: any) {
      console.error("Journey Mini:", e.message);
      setJourneyMini([]);
    } finally {
      setLoadingSecondary(false);
    }
  }

  function extractMoodsFromPhrase(t: string): string[] {
    const n = t.toLowerCase();
    const out = new Set<string>();
    if (/\bromant/i.test(n)) out.add("romantisch");
    if (/\bgemüt/i.test(n) || /cozy|chillig/.test(n)) out.add("gemütlich");
    if (/\bzu zweit|date|paar/i.test(n)) out.add("zu zweit"); // falls du so einen Mood pflegst
    if (/\blebendig|party|nachtleben/i.test(n)) out.add("lebendig");
    return Array.from(out);
  }

  function topMoodsScore(spotId: string, moodSet: Set<string>): number {
    const moods = (topMoods[spotId] || []).map((m) => m.toLowerCase());
    let score = 0;
    moods.forEach((m) => {
      if (moodSet.has(m)) score += 0.6;
      if (/romant/.test(m) && moodSet.has("romantisch")) score += 0.3;
      if (/gemüt|chill/.test(m) && moodSet.has("gemütlich")) score += 0.3;
    });
    return score;
  }

  /** ===== Suche (bestehend) ===== */
  async function runSearch(term: string) {
    const searchTerm = term.trim();
    if (!searchTerm) return;
    setLoading(true);
    try {
      const pattern = `%${searchTerm}%`;
      const { data: spotsA } = await supabase
        .from("spots")
        .select("id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status")
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
          .select("id,name,address,lat,lng,category_id,categories ( id, name, icon, color ),status")
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

  const onSelectQuick = (t: string) => setQ(t.toLowerCase());
  const onSelectMood = (mood: string) => setQ(mood); // bleibt für evtl. Mood-Pills

  const openMapWithResults = () => {
    const all = [...grouped.fromName, ...grouped.fromMood];
    if (all.length === 0) return;
    const ids = all.map((s) => s.id).join(",");
    router.push({ pathname: "/map", params: { spotIds: ids } });
  };

  /** ===== RENDER ===== */
  return (
    <View style={styles.container}>
      {/* Hauptinhalt */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
                <Text style={styles.heroTitle}>
                  👋 Hi {user?.user_metadata?.first_name || "Gast"}.
                </Text>
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
                    <Pressable
                      onPress={() => setQ("")}
                      hitSlop={10}
                      style={{ paddingLeft: 4 }}
                    >
                      <Ionicons name="close-circle" size={18} color="#7C8087" />
                    </Pressable>
                  )}
                </View>

                {/* Quick filters */}
                <View style={styles.quickRow}>
                  {["Date Night", "After Work", "Hidden Gem"].map((t) => (
                    <Pressable
                      key={t}
                      style={styles.quickChip}
                      onPress={() => onSelectQuick(t)}
                    >
                      <Ionicons
                        name="sparkles"
                        size={14}
                        color={theme.colors.text}
                      />
                      <Text style={styles.quickChipText}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </SafeAreaView>
            </LinearGradient>

            {/* ===== CTA: Map (GLASS) ===== */}
            {(grouped.fromName.length > 0 || grouped.fromMood.length > 0) && (
              <View style={styles.mapBtnWrapper}>
                <BlurView intensity={60} tint="dark" style={styles.mapBtnBlur}>
                  <Pressable onPress={openMapWithResults} style={styles.mapBtn}>
                    <Text style={styles.mapBtnTextGlass}>
                      Ergebnisse auf Karte anzeigen
                    </Text>
                  </Pressable>
                </BlurView>
              </View>
            )}

            {/* ===== RESULTS ===== */}
            <View style={{ paddingHorizontal: theme.spacing(2) }}>
              {loading && (
                <View style={{ paddingVertical: theme.spacing(2) }}>
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                </View>
              )}

              {!loading &&
                q.length > 0 &&
                grouped.fromName.length === 0 &&
                grouped.fromMood.length === 0 && (
                  <View
                    style={{
                      alignItems: "center",
                      paddingVertical: theme.spacing(4),
                    }}
                  >
                    <Text
                      style={{ fontSize: 42, marginBottom: theme.spacing(1) }}
                    >
                      🤔
                    </Text>
                    <Text style={styles.textMuted}>
                      Nichts gefunden. Versuch’s mit „gemütlich“, „rooftop“ oder
                      „modern“.
                    </Text>
                  </View>
                )}

              {grouped.fromName.length > 0 && (
                <>
                  <SectionHeader title="Passend nach Name / Adresse" />
                  <View style={{ gap: 16, marginBottom: 22 }}>
                    {grouped.fromName.map((spot) => (
                      <ResultCard key={spot.id} spot={spot} />
                    ))}
                  </View>
                </>
              )}

              {grouped.fromMood.length > 0 && (
                <>
                  <SectionHeader title="Passend nach Stimmung" />
                  <View style={{ gap: 16, marginBottom: 22 }}>
                    {grouped.fromMood.map((spot) => (
                      <ResultCard key={spot.id} spot={spot} />
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* ===== DEINE LETZTEN BESUCHE ===== */}
            <View style={{ paddingHorizontal: theme.spacing(2) }}>
              <SectionHeader title="Deine letzten Besuche" />
              {loadingSecondary && recentVisits.length === 0 ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : recentVisits.length > 0 ? (
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={recentVisits}
                  keyExtractor={(item) => item._key}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push(`/spot/${item.id}`)}
                      style={{ marginRight: 14, width: 240 }}
                    >
                      <Image
                        source={{
                          uri: item.photoUrl || PLACEHOLDER_FUN(item.id),
                        }}
                        style={styles.recentImg}
                      />
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.address && (
                        <Text style={styles.textMuted} numberOfLines={1}>
                          {item.address}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />
              ) : (
                <Text style={styles.textMuted}>
                  Du hast noch keine Reviews geschrieben.
                </Text>
              )}
            </View>

            {/* ===== NEU ENTDECKT ===== */}
            <View style={{ paddingHorizontal: theme.spacing(2) }}>
              <SectionHeader title="Neu entdeckt" />
              {loadingSecondary && discoverSpots.length === 0 ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : discoverSpots.length > 0 ? (
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={discoverSpots}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => router.push(`/spot/${item.id}`)}
                      style={{ marginRight: 14, width: 240 }}
                    >
                      <Image
                        source={{
                          uri: item.photoUrl || PLACEHOLDER_FUN(item.id),
                        }}
                        style={styles.recentImg}
                      />
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {!!item.address && (
                        <Text style={styles.textMuted} numberOfLines={1}>
                          {item.address}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />
              ) : (
                <Text style={styles.textMuted}>
                  Noch nichts Neues – folge ein paar Freunden! 🚀
                </Text>
              )}
            </View>

            {/* ===== NEUAUFLAGE JOURNEY / MINI-KI ===== */}
            <View
              style={{
                paddingHorizontal: theme.spacing(2),
                marginTop: theme.spacing(2),
              }}
            >
              <SectionHeader title={journeyTitle} />
              {loadingSecondary && journeyMini.length === 0 ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : journeyMini.length > 0 ? (
                <View style={{ gap: 16, marginBottom: 22 }}>
                  {journeyMini.map((spot) => (
                    <Pressable
                      key={spot.id}
                      onPress={() => router.push(`/spot/${spot.id}`)}
                      style={styles.card}
                    >
                      <View style={styles.cardMedia}>
                        <Image
                          source={{
                            uri: spot.photoUrl || PLACEHOLDER_FUN(spot.id),
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
                            {spot.name}
                          </Text>
                          {!!spot.address && (
                            <Text style={styles.resultSubtitle} numberOfLines={1}>
                              {spot.address}
                            </Text>
                          )}
                          <MiniMoods spotId={spot.id} />
                        </LinearGradient>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.textMuted}>
                  Keine Historie – probier die Journey auf dem „Mood Journey“ Tab
                  aus!
                </Text>
              )}
            </View>
          </Animated.ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* ===== GUEST LOGIN SHEET ===== */}
      <LoginBottomSheet
        visible={showLoginSheet}
        onClose={() => setShowLoginSheet(false)}
        onApple={() => router.push("/auth/login")}
        onGoogle={() => router.push("/auth/login")}
      />
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

function ResultCard({ spot }: { spot: Spot }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/spot/${spot.id}`)} style={styles.card}>
      <View style={styles.cardMedia}>
        <Image source={{ uri: PLACEHOLDER_FUN(spot.id) }} style={styles.cardImg} />
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
          <Text style={styles.resultTitle} numberOfLines={1}>
            {spot.name}
          </Text>
          {!!spot.address && (
            <Text style={styles.resultSubtitle} numberOfLines={1}>
              {spot.address}
            </Text>
          )}
        </LinearGradient>
      </View>
    </Pressable>
  );
}

/** MiniMoods: liest globale `spot_moods` für Chips (Top 3) */
function MiniMoods({ spotId }: { spotId: string }) {
  const [moods, setMoods] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("spot_moods")
        .select("mood,rank")
        .eq("spot_id", spotId)
        .lte("rank", 3)
        .order("rank", { ascending: true })
        .limit(3);
      setMoods((data || []).map((x: any) => x.mood));
    })();
  }, [spotId]);

  if (moods.length === 0) return null;

  return (
    <View style={styles.cardChipsRow}>
      {moods.map((mood) => (
        <View key={mood} style={styles.badgeGhost}>
          <Text style={styles.badgeGhostText}>{mood}</Text>
        </View>
      ))}
    </View>
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

  /* ---------- CTA MAP BUTTON (GLASS) ---------- */
  mapBtnWrapper: {
    marginHorizontal: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderRadius: theme.radius.xl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  mapBtnBlur: {
    borderRadius: theme.radius.xl,
    backgroundColor: "rgba(255,255,255,0.08)",
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
  textMuted: { color: theme.colors.textMuted, fontSize: 15, textAlign: "left", maxWidth: 320 },

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
    backgroundColor: "#222",
  },
});