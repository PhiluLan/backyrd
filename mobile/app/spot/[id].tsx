// backyrd/mobile/app/spot/[id].tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
  Dimensions,
  Pressable,
  FlatList,
  Share,
  Animated,
  Easing,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Alert } from "react-native";
import LoginPromptModal from "../../components/LoginPromptModal";
import { typography } from "../../theme/typography";



import { supabase } from "../../lib/supabase";
import { openWebsite, callNumber, openInAppleMaps } from "../../lib/links";

/* ========= THEME ========= */
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
    success: "#22C55E",
    danger: "#EF4444",
    info: "#38BDF8",
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, xxl: 28, pill: 999 },
  spacing: (n: number) => n * 8,
};

const { width } = Dimensions.get("window");
const HEADER_H = Math.round(width * 0.6);
const SLIDE_INTERVAL_MS = 5000;
const CROSSFADE_MS = 550;
const IOS_EASE = Easing.bezier(0.4, 0.0, 0.2, 1);

/* ========= TYPES ========= */
type Spot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "approved" | "pending";
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  category_id?: string | null;
  price_level?: number | null; // 1..5
};

type PhotoRow = { id: number; url: string; created_at: string; review_id: string | null; spot_id: string };
type ReviewRow = {
  id: string;
  spot_id: string;
  user_id?: string | null;
  text?: string | null;
  mood_a?: string | null;
  mood_b?: string | null;
  created_at: string;
  photo_path?: string | null;
};
type ProfileRow = { id: string; first_name: string | null; is_local: boolean | null };

type HoursRow = {
  id: string;
  spot_id: string;
  day_of_week: string; // "Montag" ... "Sonntag"
  open_time: string | null; // "HH:MM:SS"
  close_time: string | null;
};

type NearbyCard = {
  id: string;
  name: string;
  address?: string | null;
  photoUrl?: string | null;
  distanceKm: number;
  lat: number;
  lng: number;
};

/* ========= SMALL UI HELPERS ========= */
const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderTitle}>{title}</Text>
    {right ? <View style={{ marginLeft: "auto" }}>{right}</View> : null}
  </View>
);

const Chip = ({ text }: { text: string }) => (
  <View style={styles.chip}>
    <Text style={styles.chipText}>{text}</Text>
  </View>
);

const Avatar = ({ name }: { name?: string | null }) => {
  const letter = (name || "A").trim().charAt(0).toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={{ color: "#fff", fontWeight: "800" }}>{letter}</Text>
    </View>
  );
};

/* ========= HELPERS ========= */

/** Knallige, aber wiedererkennbare Farbe pro Mood */
function moodColor(mood: string) {
  const palette: Record<string, string> = {
    "Gemütlich": "rgba(251,191,36,0.35)",     // warmes Gold
    "Lebhaft": "rgba(248,113,113,0.35)",      // sanftes Rot
    "Chillig": "rgba(52,211,153,0.35)",       // mintgrün
    "Stylish": "rgba(167,139,250,0.35)",      // lavendel
    "Romantisch": "rgba(244,114,182,0.35)",   // rosa
    "Hip": "rgba(56,189,248,0.35)",           // hellblau
    "Ruhig": "rgba(96,165,250,0.35)",         // soft blau
    "Alternativ": "rgba(163,230,53,0.35)",    // limegrün
    "Classy": "rgba(192,132,252,0.35)",       // violett
    "Rustikal": "rgba(251,113,133,0.35)",     // altrosa
  };

  if (palette[mood]) return palette[mood];

  // Fallback: harmonisches Pastell aus Hash
  let hash = 0;
  for (let i = 0; i < mood.length; i++) hash = (hash * 31 + mood.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 60% 65%)`; // weicher, pastelliger Ton
}


const WEEK_ORDER = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function priceToSymbols(n?: number | null) {
  if (!n || n < 1) return "—";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}

function parseTimeToMinutes(t?: string | null) {
  if (!t) return null;
  const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
  return (hh || 0) * 60 + (mm || 0);
}

function isOpenNow(todayRow?: HoursRow | null, nowDate = new Date()) {
  if (!todayRow) return { open: false, nextChange: null };
  const openMin = parseTimeToMinutes(todayRow.open_time);
  const closeMin = parseTimeToMinutes(todayRow.close_time);
  if (openMin == null || closeMin == null) return { open: false, nextChange: null };

  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();

  // handle overnight (e.g., 18:00 – 02:00)
  if (closeMin <= openMin) {
    const openNow = nowMin >= openMin || nowMin < closeMin;
    return { open: openNow, nextChange: null };
  }
  const openNow = nowMin >= openMin && nowMin < closeMin;
  return { open: openNow, nextChange: null };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ========= SCREEN ========= */
export default function SpotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [spot, setSpot] = useState<Spot | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [reviews, setReviews] = useState<(ReviewRow & { profile?: ProfileRow | null })[]>([]);
  const [moodSummary, setMoodSummary] = useState<{ mood: string; count: number }[]>([]);
  const [showAllMoods, setShowAllMoods] = useState(false);


  const [hours, setHours] = useState<HoursRow[]>([]);
  const [nearby, setNearby] = useState<NearbyCard[]>([]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const fabAnim = useRef(new Animated.Value(0)).current;
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);


  const [loading, setLoading] = useState(true);
  const [loadingNearby, setLoadingNearby] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [isFav, setIsFav] = useState<boolean>(false);

  // Slideshow
  const [index, setIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const SLIDE_INTERVAL_MS = 5000;
  const SLIDE_DURATION_MS = 600;    

  const currentUrl = photos.length ? photos[index % photos.length]?.url : undefined;
  const nextUrl = photos.length > 1 ? photos[(index + 1) % photos.length]?.url : undefined;


  // FAB Animation – Start + Scroll-Reaktion
  useEffect(() => {
    // 1️⃣ Direkt sichtbar machen (ohne Flicker)
    fabAnim.setValue(1);

    // 2️⃣ Einmal sanft einblenden beim Laden
    Animated.timing(fabAnim, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // 3️⃣ Listener für Scroll → FAB ausblenden/einblenden
    const listener = scrollY.addListener(({ value }) => {
      Animated.timing(fabAnim, {
        toValue: value > 50 ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    return () => scrollY.removeListener(listener);
  }, [scrollY]);


  /* === Auth === */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* === Load Spot + related data === */
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        setErr(null);
        if (!id) throw new Error("Keine Spot-ID übergeben");

        const [
          { data: spotData, error: spotErr },
          { data: photoRows },
          { data: reviewRows },
          { data: hoursRows },
        ] = await Promise.all([
          supabase
            .from("spots")
            .select("id,name,lat,lng,status,address,phone,website,email,category_id,price_level")
            .eq("id", id)
            .single(),
          supabase
            .from("spot_photos")
            .select("id,spot_id,url,created_at,review_id")
            .eq("spot_id", id)
            .order("created_at", { ascending: false }),
          supabase
            .from("reviews")
            .select("id,spot_id,user_id,text,mood_a,mood_b,created_at,photo_path")
            .eq("spot_id", id)
            .order("created_at", { ascending: false }),
          supabase
            .from("spot_hours")
            .select("id,spot_id,day_of_week,open_time,close_time")
            .eq("spot_id", id),
        ]);

        if (spotErr) throw spotErr;
        if (!isMounted) return;

        // === Spot, Fotos & Öffnungszeiten ===
        setSpot(spotData as Spot);
        setPhotos(photoRows || []);
        setHours(
          (hoursRows || []).sort(
            (a, b) => WEEK_ORDER.indexOf(a.day_of_week) - WEEK_ORDER.indexOf(b.day_of_week)
          )
        );

        // === Reviews + Profile laden ===
        const userIds = Array.from(
          new Set((reviewRows || []).map((r) => r.user_id).filter(Boolean))
        ) as string[];

        let profiles: ProfileRow[] = [];
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,first_name,is_local")
            .in("id", userIds);
          profiles = profs || [];
        }

        const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
        const reviewsWithProfiles = (reviewRows || []).map((r) => ({
          ...r,
          profile: r.user_id ? profileMap[r.user_id] : null,
        }));

        setReviews(reviewsWithProfiles);

        // === Mood-Auswertung (Top 10) ===
        if (reviewRows?.length) {
          const counts: Record<string, number> = {};
          for (const r of reviewRows) {
            if (r.mood_a) counts[r.mood_a] = (counts[r.mood_a] || 0) + 1;
            if (r.mood_b) counts[r.mood_b] = (counts[r.mood_b] || 0) + 1;
          }

          const sorted = Object.entries(counts)
            .map(([mood, count]) => ({ mood, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

          setMoodSummary(sorted);
        } else {
          setMoodSummary([]);
        }
      } catch (e: any) {
        if (isMounted) setErr(e.message ?? "Unbekannter Fehler");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [id]);

  /* === Favorite === */
  useEffect(() => {
    if (!userId || !id) {
      setIsFav(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", userId)
        .eq("spot_id", id)
        .maybeSingle();
      setIsFav(!!data);
    })();
  }, [userId, id]);

  /* === Nearby === */
  useEffect(() => {
    let alive = true;
    async function loadNearby() {
      if (!spot) return;
      setLoadingNearby(true);
      try {
        // 1) hol' ein paar Spots (selbe Stadt-Info fehlt -> nimm alles, filtere per Distanz)
        const { data: allSpots } = await supabase
          .from("spots")
          .select("id,name,address,lat,lng")
          .neq("id", spot.id)
          .eq("status", "approved")
          .limit(100);

        const candidates = (allSpots || [])
          .map((s) => ({
            ...s,
            distanceKm: haversineKm(spot.lat, spot.lng, s.lat, s.lng),
          }))
          .filter((s) => isFinite(s.distanceKm))
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, 15);

        // 2) für diese Spots das jüngste Foto holen
        const ids = candidates.map((c) => c.id);
        let photoMap: Record<string, string | null> = {};
        if (ids.length) {
          const { data: ph } = await supabase
            .from("spot_photos")
            .select("spot_id,url,created_at")
            .in("spot_id", ids)
            .order("created_at", { ascending: false });
          // take first per spot_id
          for (const row of ph || []) {
            if (!photoMap[row.spot_id]) photoMap[row.spot_id] = row.url;
          }
        }

        const cards: NearbyCard[] = candidates.map((c) => ({
          id: c.id,
          name: c.name,
          address: c.address,
          photoUrl: photoMap[c.id] ?? null,
          distanceKm: Math.round(c.distanceKm * 10) / 10,
          lat: c.lat,
          lng: c.lng,
        }));

        if (alive) setNearby(cards);
      } finally {
        if (alive) setLoadingNearby(false);
      }
    }
    loadNearby();
    return () => {
      alive = false;
    };
  }, [spot]);

  /* === Slideshow === */
  const startSlideshow = useCallback(() => {
    if (timerRef.current || photos.length < 2) return;

    timerRef.current = setInterval(() => {
      Animated.timing(translateX, {
        toValue: -width, // Slide nach links
        duration: SLIDE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          // Nächstes Bild laden und Position zurücksetzen
          setIndex((i) => (i + 1) % photos.length);
          translateX.setValue(0);
        }
      });
    }, SLIDE_INTERVAL_MS);
  }, [photos.length, translateX]);

  const stopSlideshow = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    stopSlideshow();
    if (photos.length > 1) startSlideshow();
    return stopSlideshow;
  }, [photos.length, startSlideshow, stopSlideshow]);

  /* === Header open/closed === */
  const todaysHours = useMemo(() => {
    if (!hours?.length) return null;
    // hole heutigen Wochentag auf Deutsch
    const formatter = new Intl.DateTimeFormat("de-DE", { weekday: "long" });
    const todayName = formatter.format(new Date());
    // "Montag" vs "montag" -> normalisieren
    const normalized = todayName.charAt(0).toUpperCase() + todayName.slice(1).toLowerCase();
    return hours.find((h) => h.day_of_week === normalized) || null;
  }, [hours]);

  const { open: isOpen } = isOpenNow(todaysHours || undefined);

  /* === Actions === */
  async function onToggleFavorite() {
    if (!userId || !id) return;
    try {
      if (isFav) {
        await supabase.from("favorites").delete().eq("user_id", userId).eq("spot_id", id);
        setIsFav(false);
      } else {
        await supabase.from("favorites").insert({ user_id: userId, spot_id: id });
        setIsFav(true);
      }
      Haptics.selectionAsync();
    } catch (e) {
      console.log("Favorit toggeln fehlgeschlagen:", e);
    }
  }

  async function onShare() {
    try {
      const url =
        spot?.website ||
        `https://maps.apple.com/?ll=${spot?.lat},${spot?.lng}&q=${encodeURIComponent(spot?.name || "Spot")}`;
      const message = `${spot?.name}\n${spot?.address ?? ""}\n${url}`;
      await Share.share({ message });
    } catch (e) {
      console.log("Share failed", e);
    }
  }

  /* === UI === */
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.text} />
        <Text style={{ marginTop: 8, color: theme.colors.text }}>Lade Spot…</Text>
      </View>
    );
  }

  if (err || !spot) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: "#fff" }}>Fehler beim Laden: {err ?? "Spot nicht gefunden."}</Text>
      </View>
    );
  }

  const HEADER_BAR_TOTAL_MARGIN = insets.top + 72;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ===== HEADER BAR ===== */}
      <View style={styles.headerBarWrap}>
        <SafeAreaView edges={["top", "left", "right"]} style={styles.headerBarSafeArea}>
          <BlurView intensity={45} tint="dark" style={styles.headerBar}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerIconBtn}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable onPress={onShare} hitSlop={10} style={styles.headerIconBtn}>
                <Feather name="share" size={18} color="#fff" />
              </Pressable>
              <Pressable onPress={onToggleFavorite} hitSlop={10} style={styles.headerIconBtn}>
                <Ionicons
                  name={isFav ? "heart" : "heart-outline"}
                  size={20}
                  color={isFav ? "#E11D48" : "#fff"}
                />
              </Pressable>
            </View>
          </BlurView>
        </SafeAreaView>
      </View>

      {/* ===== CONTENT ===== */}
      <View style={{ flex: 1 }}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
        >
          {/* ===== HEADER IMAGE ===== */}
          <View style={[styles.headerWrap, { marginTop: HEADER_BAR_TOTAL_MARGIN }]}>
            <View style={styles.slideContainer}>
              {photos.length > 0 ? (
                <Animated.View
                  style={{
                    flexDirection: "row",
                    width: width * 2,
                    transform: [{ translateX }],
                  }}
                >
                  <Image
                    source={{ uri: photos[index % photos.length]?.url }}
                    style={{ width, height: HEADER_H }}
                    resizeMode="cover"
                  />
                  <Image
                    source={{ uri: photos[(index + 1) % photos.length]?.url }}
                    style={{ width, height: HEADER_H }}
                    resizeMode="cover"
                  />
                </Animated.View>
              ) : (
                <View style={[styles.headerFallback, { width, height: HEADER_H }]}>
                  <Text style={styles.headerFallbackText}>{spot.name[0]}</Text>
                </View>
              )}
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.45)"]}
                style={styles.headerGradient}
              />
            </View>
          </View>

          {/* ===== TITLE ===== */}
          <View style={{ paddingHorizontal: theme.spacing(2), paddingTop: theme.spacing(2) }}>
            <Text style={styles.title}>{spot.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              <View
                style={[
                  styles.badgeSoft,
                  { borderColor: isOpen ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)" },
                ]}
              >
                <Text
                  style={{ ...typography.body,
                    color: isOpen ? theme.colors.success : theme.colors.danger,
                    fontWeight: "800",
                  }}
                >
                  {isOpen ? "Jetzt geöffnet" : "Geschlossen"}
                </Text>
              </View>
              <View style={styles.badgeSoft}>
                <Text style={{ ...typography.body, color: theme.colors.textMuted, fontWeight: "800" }}>
                  {priceToSymbols(spot.price_level)}
                </Text>
              </View>
            </View>
          </View>

          {/* ===== MOOD SUMMARY ===== */}
          {moodSummary.length > 0 && (
            <View style={styles.sectionBox}>
              <SectionHeader title="Top Moods" />

              {/* Pills */}
              <View style={styles.moodPillsWrap}>
                {moodSummary.slice(0, showAllMoods ? 15 : 8).map((m) => {
                  const color = moodColor(m.mood);
                  return (
                    <View
                      key={m.mood}
                      style={[
                        styles.moodPill,
                        {
                          borderColor: color,
                        },
                      ]}
                    >
                      <Text style={styles.moodPillText} numberOfLines={1}>
                        {m.mood}
                      </Text>

                      <View
                        style={[
                          styles.moodPillCount,
                          { borderColor: moodColor(m.mood) },
                        ]}
                      >
                        <Text style={styles.moodPillCountText}>{m.count}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {moodSummary.length > 8 && (
                <Pressable onPress={() => setShowAllMoods(!showAllMoods)} style={styles.moodToggleBtn}>
                  <Text style={styles.moodToggleText}>
                    {showAllMoods ? "Weniger anzeigen" : "Mehr anzeigen"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          {/* ===== INFOS ===== */}
          <View style={styles.sectionBox}>
            <SectionHeader title="Info" />
            {spot.address && <Text style={styles.text}>📍 {spot.address}</Text>}
            {spot.phone && (
              <Text style={styles.link} onPress={() => callNumber(spot.phone!)}>
                📞 {spot.phone}
              </Text>
            )}
            {spot.website && (
              <Text style={styles.link} onPress={() => openWebsite(spot.website!)}>
                🌐 {spot.website}
              </Text>
            )}
            <Pressable
              onPress={() => openInAppleMaps(spot.lat, spot.lng, spot.name)}
              style={styles.ghostChip}
            >
              <Text style={styles.ghostChipText}>🗺️ In Karten öffnen</Text>
            </Pressable>
          </View>

          {/* ===== ÖFFNUNGSZEITEN ===== */}
          {hours.length > 0 && (
            <View style={styles.sectionBox}>
              <SectionHeader title="Öffnungszeiten" />
              {WEEK_ORDER.map((day) => {
                const row = hours.find((h) => h.day_of_week === day);
                const open = row?.open_time ? row.open_time.slice(0, 5) : null;
                const close = row?.close_time ? row.close_time.slice(0, 5) : null;
                const isToday = todaysHours?.day_of_week === day;
                return (
                  <View key={day} style={styles.hoursRow}>
                    <Text
                      style={[styles.textMuted, isToday && { color: "#fff", fontWeight: "700" }]}
                    >
                      {day}
                    </Text>
                    <Text style={[styles.text, { marginBottom: 0 }]}>
                      {open && close ? `${open} – ${close}` : "—"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* ===== REVIEWS ===== */}
          {reviews.length > 0 && (
            <View style={styles.sectionBox}>
              <SectionHeader title={`Reviews (${reviews.length})`} />
              {reviews.slice(0, 6).map((rev) => {
                const moods = [rev.mood_a, rev.mood_b].filter(Boolean) as string[];
                const hasPhoto = !!rev.photo_path;
                const name = rev.profile?.first_name ?? "Anonym";
                const isLocal = rev.profile?.is_local === true;
                return (
                  <View key={rev.id} style={styles.reviewCard}>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Avatar name={name} />
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Text style={styles.reviewName}>
                            {name}
                            {isLocal ? " 🌆" : ""}
                          </Text>
                          <Text style={styles.reviewDate}>
                            {new Date(rev.created_at).toLocaleDateString("de-DE", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </Text>
                        </View>
                        {rev.text ? <Text style={styles.reviewText}>{rev.text}</Text> : null}
                        {moods.length > 0 && (
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 6,
                              marginTop: 6,
                            }}
                          >
                            {moods.map((m) => (
                              <Chip key={m} text={m} />
                            ))}
                          </View>
                        )}
                        {hasPhoto && (
                          <View style={{ marginTop: 10 }}>
                            <Image
                              source={{
                                uri: `https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/${rev.photo_path}`,
                              }}
                              style={styles.reviewImage}
                              resizeMode="cover"
                            />
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
              {reviews.length > 6 && (
                <Pressable
                  onPress={() => router.push(`/spot/${spot.id}/reviews`)}
                  style={styles.moreReviewsBtn}
                >
                  <Text style={styles.moreReviewsText}>Alle Reviews anzeigen</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ===== NEARBY SPOTS ===== */}
          <View style={{ ...typography.body, paddingHorizontal: theme.spacing(2), marginTop: theme.spacing(2) }}>
            <SectionHeader
              title="In der Nähe"
              right={
                loadingNearby ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : null
              }
            />
            {loadingNearby && nearby.length === 0 ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : nearby.length > 0 ? (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={nearby}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingRight: theme.spacing(2) }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => router.push(`/spot/${item.id}`)}
                    style={{ marginRight: 14, width: 240 }}
                  >
                    <View style={styles.nearbyImageWrap}>
                      {item.photoUrl ? (
                        <Image source={{ uri: item.photoUrl }} style={styles.nearbyImg} />
                      ) : (
                        <View style={[styles.nearbyImg, styles.headerFallback]}>
                          <Text style={styles.headerFallbackText}>{item.name[0]}</Text>
                        </View>
                      )}
                      <LinearGradient
                        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.3)", "rgba(0,0,0,0.6)"]}
                        style={styles.nearbyGradient}
                      />
                      <View style={styles.nearbyDistance}>
                        <Text style={styles.nearbyDistanceText}>{item.distanceKm} km</Text>
                      </View>
                    </View>
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
              <Text style={styles.textMuted}>Keine Spots in der Nähe gefunden.</Text>
            )}
          </View>

          <View style={{ height: theme.spacing(4) }} />
        </Animated.ScrollView>
      </View>

      {/* ===== ADD REVIEW BUTTON (Animated FAB) ===== */}
      {spot && (
        <>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                justifyContent: "flex-end",
                alignItems: "flex-end",
                paddingRight: 24,
                paddingBottom: 24 + insets.bottom,
                opacity: fabAnim,
                transform: [
                  {
                    translateY: fabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [80, 0],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={() => {
                if (!userId) {
                  setShowLoginPrompt(true);
                  return;
                }
                router.push(`/review/quick?spotId=${spot.id}`);
              }}
              style={styles.fab}
            >
              <Ionicons name="add" size={30} color="#000" />
            </Pressable>
          </Animated.View>

          {/* Login-Popup */}
          <LoginPromptModal
            visible={showLoginPrompt}
            onClose={() => setShowLoginPrompt(false)}
          />
        </>
      )}
    </SafeAreaView>
  );
}

/* ========= STYLES ========= */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerBarWrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 },
  headerBarSafeArea: { paddingHorizontal: theme.spacing(2) },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: theme.radius.xl,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerIconBtn: {
    ...typography.body,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: theme.radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },

  headerWrap: { position: "relative" },
  headerImgContainer: {
    height: HEADER_H, // BUGFIX: Containerhöhe, verhindert "Bilder untereinander"
    borderBottomLeftRadius: theme.radius.xxl,
    borderBottomRightRadius: theme.radius.xxl,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  headerImgAbsolute: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  headerFallback: { alignItems: "center", justifyContent: "center" },
  headerFallbackText: { fontSize: 40, fontWeight: "800", color: theme.colors.text },
  headerGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },

  title: { ...typography.h1, color: theme.colors.text, fontSize: 34, fontWeight: "800" },

  badgeSoft: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  slideContainer: {
    width: "100%",
    height: HEADER_H,
    overflow: "hidden",
    borderBottomLeftRadius: theme.radius.xxl,
    borderBottomRightRadius: theme.radius.xxl,
    backgroundColor: "#111",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionHeaderTitle: { ...typography.body, color: "#fff", fontSize: 18, fontWeight: "800" },

  sectionBox: {
    ...typography.body,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing(2),
    marginHorizontal: theme.spacing(2),
    marginTop: theme.spacing(2),
  },

  text: {...typography.body, color: theme.colors.text, fontSize: 15, marginBottom: 4 },
  textMuted: { ...typography.body, color: theme.colors.textMuted, fontSize: 14 },

  link: { color: "#93C5FD", fontSize: 15, marginBottom: 4 },
  ghostChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  ghostChipText: { ...typography.body, color: theme.colors.text, fontSize: 14, fontWeight: "700" },

  chip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  chipText: { ...typography.body, color: "#fff", fontWeight: "700", fontSize: 12 },

  // === Moods Summary ===
  moodRow: {
    marginBottom: 8,
  },
  moodLabel: {
    ...typography.body,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  moodLabelText: {
    ...typography.body,
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  moodCount: {
    color: theme.colors.textMuted,
    fontWeight: "700",
    fontSize: 13,
  },
  moodBarBg: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: theme.radius.pill,
    overflow: "hidden",
  },
  moodBarFill: {
    height: "100%",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
  },
  moodToggleBtn: {
  marginTop: theme.spacing(1.5),
  alignSelf: "center",
  borderColor: "rgba(255,255,255,0.2)",
  borderWidth: 1,
  borderRadius: theme.radius.pill,
  paddingHorizontal: 16,
  paddingVertical: 8,
  },
  moodToggleText: {
    ...typography.body,
    color: theme.colors.textMuted,
    fontWeight: "700",
    fontSize: 14,
  },


  // Reviews (überarbeitet)
  reviewCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(1.5),
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewName: { ...typography.body, color: theme.colors.text, fontWeight: "800", fontSize: 15 },
  reviewDate: { ...typography.body, color: theme.colors.textMuted, fontSize: 12 },
  reviewText: { ...typography.body, color: theme.colors.text, fontSize: 14, lineHeight: 19, marginTop: 4 },
  reviewImage: {
    width: "100%",
    height: 140,
    borderRadius: theme.radius.md,
    backgroundColor: "#111",
  },
  moreReviewsBtn: {
    ...typography.body,
    alignSelf: "center",
    marginTop: theme.spacing(1),
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  moreReviewsText: { ...typography.body, color: "#93C5FD", fontWeight: "700" },

  fab: {
  ...typography.body,
  position: "absolute",
  bottom: 30,
  right: 24,
  width: 64,
  height: 64,
  borderRadius: 32,
  backgroundColor: theme.colors.primary,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.3,
  shadowRadius: 6,
  elevation: 6, // für Android
  zIndex: 100,
  },
  addReviewBtnWrap: {
  marginTop: theme.spacing(2),
  borderRadius: theme.radius.pill,
  overflow: "hidden",
  },
  addReviewBtn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 14,
    borderRadius: theme.radius.pill,
    gap: 8,
  },
  addReviewBtnText: {
    ...typography.body,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // Nearby
  nearbyImageWrap: {
    width: 240,
    height: 140,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  nearbyImg: { width: "100%", height: "100%" },
  nearbyGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 80 },
  nearbyDistance: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  nearbyDistanceText: { ...typography.body, color: "#fff", fontSize: 12, fontWeight: "800" },
  resultTitle: { ...typography.body, color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 8 },

  moodPillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  moodPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    borderWidth: 2,                      // 👈 2px Rand
    borderColor: "transparent",          // Farbe kommt inline (oben)
    backgroundColor: "transparent",      // 👈 kein Hintergrund
    gap: 10,
    maxWidth: "100%",
  },

  moodPillText: {
    ...typography.body,
    color: "#fff",                       // 👈 weiße Schrift
    fontWeight: "800",
    fontSize: 14,
  },

  moodPillCount: {
    ...typography.body,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 2,                      // 👈 2px Rand
    borderColor: "transparent",          // Farbe kommt inline
    backgroundColor: "transparent",      // 👈 kein Hintergrund
  },

  moodPillCountText: {
    ...typography.body,
    color: "#fff",                       // 👈 weiße Schrift
    fontWeight: "900",
    fontSize: 12,
  },


});
