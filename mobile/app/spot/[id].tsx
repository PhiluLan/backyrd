import React, { useEffect, useRef, useState, useCallback } from "react";
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
  Platform,
  Modal,
  Share,
  Animated,
  Easing,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons, Feather } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase";
import { openWebsite, callNumber, openInAppleMaps } from "../../lib/links";
import { MoodPill, PillGroup } from "../../components/spot";

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
type Category = {
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
  status: "approved" | "pending";
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  description?: string | null;
  category_id?: string | null;
  category?: Category | null;
};

type MoodRow = { spot_id: string; mood: string; mood_count: number; rank: number };
type PhotoRow = { url: string; created_at: string };
type ReviewRow = {
  id: string;
  spot_id: string;
  user_id?: string | null;
  text?: string | null;
  mood_a?: string | null;
  mood_b?: string | null;
  created_at: string;
  spot_photos?: { url: string }[];
};
type UserMeta = { name: string | null; is_local: boolean | null };
type UserMetaMap = Record<string, UserMeta>;
type MixStats = { locals: number; tourists: number; unknown: number; pctLocals: number; pctTourists: number; base: number };

export default function SpotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [spot, setSpot] = useState<Spot | null>(null);
  const [moods, setMoods] = useState<MoodRow[]>([]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [userMeta, setUserMeta] = useState<UserMetaMap>({});
  const [mix, setMix] = useState<MixStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [isFav, setIsFav] = useState<boolean>(false);
  const [authSheetVisible, setAuthSheetVisible] = useState(false);

  // Slideshow
  const [index, setIndex] = useState(0);
  const crossfade = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pausedRef = useRef<boolean>(false);

  const currentUrl = photos.length ? photos[index % photos.length]?.url : undefined;
  const nextUrl = photos.length > 1 ? photos[(index + 1) % photos.length]?.url : undefined;

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
          { data: moodData },
          { data: photoRows },
          { data: reviewRows },
        ] = await Promise.all([
          supabase
            .from("spots")
            .select(
              `
              id, name, lat, lng, status, address, phone, website, city, description, category_id,
              categories ( id, name, icon, color )
              `
            )
            .eq("id", id)
            .single(),
          supabase.from("spot_moods").select("*").eq("spot_id", id).order("rank"),
          supabase
            .from("spot_photos")
            .select("url,created_at")
            .eq("spot_id", id)
            .order("created_at", { ascending: false }),
          supabase
            .from("reviews")
            .select(`
              id, spot_id, user_id, text, mood_a, mood_b, created_at,
              spot_photos ( url )
            `)
            .eq("spot_id", id)
            .order("created_at", { ascending: false }),
        ]);

        if (spotErr) throw spotErr;
        if (!isMounted) return;

        setSpot(spotData as Spot);
        setPhotos(photoRows || []);
        setMoods(moodData || []);
        setReviews(reviewRows || []);

        // Reviewer Info
        const userIds = Array.from(new Set((reviewRows || []).map((r) => r.user_id).filter(Boolean))) as string[];
        let metaMap: UserMetaMap = {};
        if (userIds.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, first_name, is_local")
            .in("id", userIds);
          (profs || []).forEach((pr: any) => {
            metaMap[pr.id] = { name: pr.first_name ?? null, is_local: pr.is_local };
          });
        }
        setUserMeta(metaMap);
        setMix(computeMix(reviewRows || [], metaMap));
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

  /* === Slideshow === */
  const startSlideshow = useCallback(() => {
    if (timerRef.current || photos.length < 2) return;
    timerRef.current = setInterval(() => {
      crossfade.setValue(0);
      Animated.timing(crossfade, {
        toValue: 1,
        duration: CROSSFADE_MS,
        easing: IOS_EASE,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIndex((i) => (i + 1) % photos.length);
          crossfade.setValue(0);
        }
      });
    }, SLIDE_INTERVAL_MS);
  }, [photos.length, crossfade]);

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

  function computeMix(reviewsList: ReviewRow[], metaMap: UserMetaMap): MixStats {
    let locals = 0,
      tourists = 0,
      unknown = 0;
    for (const r of reviewsList) {
      const meta = r.user_id ? metaMap[r.user_id] : undefined;
      if (meta?.is_local === true) locals++;
      else if (meta?.is_local === false) tourists++;
      else unknown++;
    }
    const base = locals + tourists;
    const pctLocals = base ? Math.round((locals / base) * 100) : 0;
    const pctTourists = base ? 100 - pctLocals : 0;
    return { locals, tourists, unknown, pctLocals, pctTourists, base };
  }

  /* === Toggle Favorite === */
  async function onToggleFavorite() {
    if (!userId) return setAuthSheetVisible(true);
    if (!id) return;
    try {
      if (isFav) {
        await supabase.from("favorites").delete().eq("user_id", userId).eq("spot_id", id);
        setIsFav(false);
      } else {
        await supabase.from("favorites").insert({ user_id: userId, spot_id: id });
        setIsFav(true);
      }
    } catch (e) {
      console.log("Favorit toggeln fehlgeschlagen:", e);
    }
  }

  /* === Share === */
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
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ===== HEADER ===== */}
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
                <Ionicons name={isFav ? "heart" : "heart-outline"} size={20} color={isFav ? "#E11D48" : "#fff"} />
              </Pressable>
            </View>
          </BlurView>
        </SafeAreaView>
      </View>

      {/* ===== CONTENT ===== */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Image */}
        <View style={[styles.headerWrap, { marginTop: HEADER_BAR_TOTAL_MARGIN }]}>
          {currentUrl ? (
            <Animated.Image
              source={{ uri: currentUrl }}
              style={[
                styles.headerImgAbsolute,
                { opacity: crossfade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
              ]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.headerImgAbsolute, styles.headerFallback]}>
              <Text style={styles.headerFallbackText}>{spot.name[0]}</Text>
            </View>
          )}
          {nextUrl && (
            <Animated.Image
              source={{ uri: nextUrl }}
              style={[
                styles.headerImgAbsolute,
                { opacity: crossfade.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
              ]}
              resizeMode="cover"
            />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.45)"]}
            style={styles.headerGradient}
          />
        </View>

        {/* Title + Category */}
        <View style={{ paddingHorizontal: theme.spacing(2), paddingTop: theme.spacing(2) }}>
          <Text style={styles.title}>{spot.name}</Text>

          {spot.category && (
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: spot.category.color ?? "rgba(255,255,255,0.08)" },
              ]}
            >
              <Text style={styles.categoryText}>
                {spot.category.icon ? `${spot.category.icon} ` : ""}
                {spot.category.name}
              </Text>
            </View>
          )}
        </View>

        {/* Infos */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Infos</Text>
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
          <Pressable onPress={() => openInAppleMaps(spot.lat, spot.lng, spot.name)} style={styles.ghostChip}>
            <Text style={styles.ghostChipText}>🗺️ In Karten öffnen</Text>
          </Pressable>
          {spot.description && <Text style={[styles.text, { marginTop: 8 }]}>{spot.description}</Text>}
        </View>
      </ScrollView>
    </View>
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
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: theme.radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  headerWrap: { position: "relative" },
  headerImgAbsolute: { width: "100%", height: HEADER_H, backgroundColor: "#111" },
  headerFallback: { alignItems: "center", justifyContent: "center" },
  headerFallbackText: { fontSize: 40, fontWeight: "800", color: theme.colors.text },
  headerGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  title: { color: theme.colors.text, fontSize: 34, fontWeight: "800" },
  categoryBadge: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  categoryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  sectionBox: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing(2),
    marginHorizontal: theme.spacing(2),
    marginTop: theme.spacing(2),
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, marginBottom: 8 },
  text: { color: theme.colors.text, fontSize: 15, marginBottom: 4 },
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
  ghostChipText: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
});
