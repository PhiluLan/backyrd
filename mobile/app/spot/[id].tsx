// backyrd/mobile/app/spot/[id].tsx
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Image,
  Dimensions,
  Pressable,
  FlatList,
  Share,
  Animated,
  Easing,
  StyleSheet,
} from "react-native";

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";

import LoginPromptModal from "../../components/LoginPromptModal";
import { typography } from "../../theme/typography";
import { supabase } from "../../lib/supabase";
import { openWebsite, callNumber, openInAppleMaps } from "../../lib/links";

/* ========================================= */
/*                 THEME + CONST             */
/* ========================================= */

const theme = {
  colors: {
    background: "#0A0A0B",
    surfaceElevated: "#1B1B21",
    text: "#FFFFFF",
    textMuted: "#A6A8AD",
    success: "#22C55E",
    danger: "#EF4444",
  },
  spacing: (n: number) => n * 8,
  radius: { sm: 8, md: 12, lg: 16, xl: 24, xxl: 28, pill: 999 },
};

const { width } = Dimensions.get("window");
const HEADER_H = Math.round(width * 0.98);
const HEADER_MAX = Math.round(width * 0.98);
const HEADER_MIN = 160;
const SLIDE_INTERVAL = 6000;
const SLIDE_DURATION = 650;
const IOS_EASE = Easing.bezier(0.4, 0.0, 0.2, 1);

const WEEK_ORDER = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];

/* ========================================= */
/*                 HELPERS                   */
/* ========================================= */

function priceToSymbols(n?: number | null) {
  if (!n || n < 1) return "—";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}
function parseTimeToMinutes(t?: string | null) {
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

// ✅ NEU: unterstützt mehrere Slots (Mittag + Abend etc.)
function isOpenNow(rowsForDay?: any[]) {
  if (!rowsForDay || rowsForDay.length === 0) return { open: false };
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const row of rowsForDay) {
    const open = parseTimeToMinutes(row.open_time);
    const close = parseTimeToMinutes(row.close_time);
    if (open == null || close == null) continue;

    // über Mitternacht (z. B. 17:00 – 01:00)
    if (close <= open) {
      if (nowMin >= open || nowMin < close) return { open: true };
    } else {
      if (nowMin >= open && nowMin < close) return { open: true };
    }
  }
  return { open: false };
}

function moodColor(mood: string) {
  const preset: any = {
    Gemütlich: "rgba(251,191,36,0.35)",
    Lebhaft: "rgba(248,113,113,0.35)",
    Chillig: "rgba(52,211,153,0.35)",
    Stylish: "rgba(167,139,250,0.35)",
    Romantisch: "rgba(244,114,182,0.35)",
  };
  return preset[mood] || "rgba(255,255,255,0.2)";
}
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ========================================= */
/*                COMPONENTS                 */
/* ========================================= */

const Avatar = ({ name }: { name?: string }) => (
  <View
    style={{
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Text style={{ color: "#fff", fontWeight: "800" }}>
      {(name || "A")[0].toUpperCase()}
    </Text>
  </View>
);

const Chip = ({ text }: { text: string }) => (
  <View
    style={{
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
    }}
  >
    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{text}</Text>
  </View>
);

/* ========================================= */
/*             MAIN SCREEN START             */
/* ========================================= */

export default function SpotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, HEADER_H],
    outputRange: [0, -80],
    extrapolate: "clamp",
  });
  const headerParallax = scrollY.interpolate({
    inputRange: [0, 220],
    outputRange: [0, -40],
    extrapolate: "clamp",
  });

  const [spot, setSpot] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  // ✅ NEU: Objekt nach Tag gruppiert
  const [hours, setHours] = useState<Record<string, any[]>>({});
  const [moodSummary, setMoodSummary] = useState<any[]>([]);
  const [nearby, setNearby] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showAllMoods, setShowAllMoods] = useState(false);

  const index = useRef(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) =>
      setUserId(sess?.user?.id ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);

      const [{ data: spotRow }, { data: photoRows }, { data: revRows }, { data: hourRows }] =
        await Promise.all([
          supabase
            .from("spots")
            .select("id,name,address,lat,lng,phone,website,price_level")
            .eq("id", id)
            .single(),
          supabase
            .from("spot_photos")
            .select("id,url,created_at")
            .eq("spot_id", id)
            .order("created_at", { ascending: false }),
          supabase
            .from("reviews")
            .select("*, profiles!reviews_user_id_fkey(id,first_name,is_local)")
            .eq("spot_id", id)
            .order("created_at", { ascending: false }),
          supabase.from("spot_hours").select("*").eq("spot_id", id),
        ]);

      setSpot(spotRow);
      setPhotos(photoRows || []);
      setReviews(revRows || []);

      // ✅ Öffnungszeiten nach Tag gruppieren (unterstützt mehrere Slots pro Tag)
      const grouped: Record<string, any[]> = {};
      (hourRows || []).forEach((h: any) => {
        if (!grouped[h.day_of_week]) grouped[h.day_of_week] = [];
        grouped[h.day_of_week].push(h);
      });
      // optional sortieren innerhalb des Tages nach open_time
      Object.keys(grouped).forEach((d) => {
        grouped[d].sort((a, b) => (a.open_time || "").localeCompare(b.open_time || ""));
      });
      setHours(grouped);

      if (revRows?.length) {
        const counts: Record<string, number> = {};
        for (const r of revRows) {
          if (r.mood_a) counts[r.mood_a] = (counts[r.mood_a] || 0) + 1;
          if (r.mood_b) counts[r.mood_b] = (counts[r.mood_b] || 0) + 1;
        }
        setMoodSummary(
          Object.entries(counts)
            .map(([mood, count]) => ({ mood, count }))
            .sort((a, b) => (b as any).count - (a as any).count)
        );
      }

      setLoading(false);
    })();
  }, [id]);

  // ✅ Heute ermitteln + heutige Slots holen
  const todayNameNormalized = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("de-DE", { weekday: "long" });
    const todayName = formatter.format(new Date());
    return todayName.charAt(0).toUpperCase() + todayName.slice(1);
  }, []);

  const todaysHours = useMemo(() => {
    return hours[todayNameNormalized] || [];
  }, [hours, todayNameNormalized]);

  const { open: isOpen } = isOpenNow(todaysHours);

  useEffect(() => {
    if (!userId || !id) return;
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

  const startSlideshow = useCallback(() => {
    if (timerRef.current || photos.length < 2) return;
    timerRef.current = setInterval(() => {
      Animated.timing(translateX, {
        toValue: -width,
        duration: SLIDE_DURATION,
        easing: IOS_EASE,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          index.current = (index.current + 1) % photos.length;
          translateX.setValue(0);
        }
      });
    }, SLIDE_INTERVAL);
  }, [photos]);

  useEffect(() => {
    if (photos.length > 1) startSlideshow();
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [photos]);

  async function onShare() {
    if (!spot) return;
    const url =
      spot.website ||
      `https://maps.apple.com/?ll=${spot.lat},${spot.lng}&q=${encodeURIComponent(
        spot.name
      )}`;
    Share.share({ message: `${spot.name}\n${spot.address ?? ""}\n${url}` });
  }

  useEffect(() => {
    let active = true;
    async function loadNearby() {
      if (!spot) return;
      const { data: list } = await supabase
        .from("spots")
        .select("id,name,address,lat,lng")
        .neq("id", spot.id)
        .limit(200);

      const withDist =
        list
          ?.map((s) => ({
            ...s,
            distanceKm: haversineKm(spot.lat, spot.lng, s.lat, s.lng),
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, 15) || [];

      const ids = withDist.map((s) => s.id);
      let firstPhotos: Record<string, string> = {};
      if (ids.length) {
        const { data: photoRows } = await supabase
          .from("spot_photos")
          .select("spot_id,url,id")
          .in("spot_id", ids)
          .order("id", { ascending: true });
        (photoRows || []).forEach((p: any) => {
          if (!firstPhotos[p.spot_id]) firstPhotos[p.spot_id] = p.url;
        });
      }

      const withPhoto = withDist.map((s) => ({
        ...s,
        photoUrl: firstPhotos[s.id] || undefined,
      }));

      if (active) setNearby(withPhoto);
    }
    loadNearby();
    return () => {
      active = false;
    };
  }, [spot]);

  if (loading || !spot) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ✅ Floating Glass Header Bar — Clean & Pro */}
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top + 10,
          left: 0,
          right: 0,
          zIndex: 9999,
          elevation: 9999,
          paddingHorizontal: 16,
          opacity: scrollY.interpolate({
            inputRange: [0, HEADER_H * 0.4],
            outputRange: [1, 0.9],
            extrapolate: "clamp",
          }),
          transform: [
            {
              translateY: scrollY.interpolate({
                inputRange: [0, 120],
                outputRange: [0, -6],
                extrapolate: "clamp",
              }),
            },
          ],
        }}
      >
        <BlurView intensity={0} tint="dark" style={styles.topBar}>
          {/* Back */}
          <Pressable onPress={() => router.back()} style={styles.topBarBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>

          {/* Actions */}
          <View style={styles.topBarActions}>
            <Pressable onPress={onShare} style={styles.topBarBtn} hitSlop={8}>
              <Feather name="share" size={18} color="#fff" />
            </Pressable>

            <Pressable
              onPress={async () => {
                if (!userId) return setShowLoginPrompt(true);
                try {
                  if (isFav) {
                    await supabase.from("favorites").delete().eq("user_id", userId).eq("spot_id", id);
                    setIsFav(false);
                  } else {
                    await supabase.from("favorites").insert({ user_id: userId, spot_id: id });
                    setIsFav(true);
                  }
                  Haptics.selectionAsync();
                } catch {}
              }}
              style={styles.topBarBtn}
              hitSlop={8}
            >
              <Ionicons
                name={isFav ? "heart" : "heart-outline"}
                size={20}
                color={isFav ? "#E11D48" : "#fff"}
              />
            </Pressable>
          </View>
        </BlurView>
      </Animated.View>

      {/* MAIN SCROLL */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >
        {/* ULTRA HEADER */}
        <Animated.View
          style={{
            width: "100%",
            height: HEADER_H,
            overflow: "hidden",
            transform: [{ translateY: headerTranslateY }],
          }}
        >
          {/* Parallax Image Layer */}
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: HEADER_MAX,
              transform: [{ translateY: headerParallax }],
            }}
          >
            {photos.length > 0 ? (
              <Animated.View
                style={{
                  flexDirection: "row",
                  width: width * 2,
                  height: HEADER_MAX,
                  transform: [{ translateX }],
                }}
              >
                <Image
                  source={{ uri: photos[index.current]?.url }}
                  style={{ width, height: HEADER_MAX }}
                />
                <Image
                  source={{ uri: photos[(index.current + 1) % photos.length]?.url }}
                  style={{ width, height: HEADER_MAX }}
                />
              </Animated.View>
            ) : (
              <View
                style={{
                  width: "100%",
                  height: HEADER_MAX,
                  backgroundColor: "#222",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 48 }}>{spot.name[0]}</Text>
              </View>
            )}

            {/* Darken bottom for smooth transition */}
            <LinearGradient
              colors={[
                "transparent",
                "rgba(0,0,0,0.1)",
                "rgba(0,0,0,0.35)",
                "rgba(0,0,0,0.65)",
              ]}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 180,
              }}
            />
          </Animated.View>
        </Animated.View>

        {/* Title + badges on image */}
        <View
          style={{
            paddingHorizontal: theme.spacing(2),
            paddingTop: 10,
            paddingBottom: 10,
          }}
        >
          <Text
            style={{
              fontSize: 32,
              fontWeight: "900",
              color: "#fff",
            }}
          >
            {spot.name}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: isOpen
                  ? "rgba(34,197,94,0.35)"
                  : "rgba(239,68,68,0.35)",
              }}
            >
              <Text
                style={{
                  color: isOpen ? theme.colors.success : theme.colors.danger,
                  fontWeight: "700",
                }}
              >
                {isOpen ? "Jetzt geöffnet" : "Geschlossen"}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.25)",
              }}
            >
              <Text style={{ color: "#ddd" }}>{priceToSymbols(spot.price_level)}</Text>
            </View>
          </View>
        </View>

        {/* ✅ MOODS — Top 5 oder alle */}
        {moodSummary.length > 0 && (
          <View style={{ paddingHorizontal: theme.spacing(2), marginTop: 20 }}>
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>
              Top Moods
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 12,
              }}
            >
              {(showAllMoods ? moodSummary : moodSummary.slice(0, 5)).map((m) => (
                <View
                  key={m.mood}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    borderColor: moodColor(m.mood),
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text style={{ color: "#fff" }}>{m.mood}</Text>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      borderColor: moodColor(m.mood),
                    }}
                  >
                    <Text style={{ color: "#fff" }}>{m.count}</Text>
                  </View>
                </View>
              ))}
            </View>

            {moodSummary.length > 5 && (
              <Pressable
                onPress={() => setShowAllMoods((s) => !s)}
                style={{
                  marginTop: 12,
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.25)",
                }}
              >
                <Text style={{ color: "#93C5FD", fontWeight: "700" }}>
                  {showAllMoods ? "Weniger anzeigen" : "Mehr anzeigen"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* INFO */}
        <View style={{ paddingHorizontal: theme.spacing(2), marginTop: 26 }}>
          <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>
            Info
          </Text>

          {spot.address && (
            <Text style={{ color: "#fff", marginTop: 10 }}>📍 {spot.address}</Text>
          )}

          {spot.phone && (
            <Text
              onPress={() => callNumber(spot.phone)}
              style={{ color: "#38BDF8", marginTop: 8 }}
            >
              📞 {spot.phone}
            </Text>
          )}

          {spot.website && (
            <Text
              onPress={() => openWebsite(spot.website)}
              style={{ color: "#38BDF8", marginTop: 8 }}
            >
              🌐 {spot.website}
            </Text>
          )}

          <Pressable
            onPress={() => openInAppleMaps(spot.lat, spot.lng, spot.name)}
            style={{
              marginTop: 14,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.25)",
            }}
          >
            <Text style={{ color: "#fff" }}>🗺️ In Karten öffnen</Text>
          </Pressable>
        </View>

        {/* ÖFFNUNGSZEITEN */}
        {Object.keys(hours).length > 0 && (
          <View
            style={{
              backgroundColor: theme.colors.surfaceElevated,
              borderRadius: theme.radius.xl,
              padding: theme.spacing(2),
              marginHorizontal: theme.spacing(2),
              marginTop: theme.spacing(2),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
                Öffnungszeiten
              </Text>
            </View>

            {WEEK_ORDER.map((day) => {
              const slots = hours[day] || [];
              const isToday = day === todayNameNormalized;

              return (
                <View
                  key={day}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{
                      color: isToday ? theme.colors.text : theme.colors.textMuted,
                      fontWeight: isToday ? "700" : "400",
                    }}
                  >
                    {day}
                  </Text>
                  <View style={{ alignItems: "flex-end" }}>
                    {slots.length > 0 ? (
                      slots.map((s, idx) => (
                        <Text key={idx} style={{ color: theme.colors.text }}>
                          {s.open_time && s.close_time
                            ? `${s.open_time.slice(0, 5)} – ${s.close_time.slice(0, 5)}`
                            : "—"}
                        </Text>
                      ))
                    ) : (
                      <Text style={{ color: theme.colors.text }}>—</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* REVIEWS */}
        {reviews.length > 0 && (
          <View
            style={{
              backgroundColor: theme.colors.surfaceElevated,
              borderRadius: theme.radius.xl,
              padding: theme.spacing(2),
              marginHorizontal: theme.spacing(2),
              marginTop: theme.spacing(2),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
                Reviews
              </Text>
            </View>

            {reviews.slice(0, 6).map((rev) => {
              const moods = [rev.mood_a, rev.mood_b].filter(Boolean) as string[];
              const name = rev.profiles?.first_name || "User";
              const isLocal = rev.profiles?.is_local;
              return (
                <View
                  key={rev.id}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderColor: "rgba(255,255,255,0.1)",
                    borderWidth: 1,
                    borderRadius: theme.radius.lg,
                    padding: theme.spacing(1.5),
                    marginBottom: theme.spacing(1.5),
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Avatar name={name} />
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                          {name}
                          {isLocal ? " 🌆" : ""}
                        </Text>
                        <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                          {new Date(rev.created_at).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </Text>
                      </View>

                      {rev.text ? (
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontSize: 14,
                            lineHeight: 19,
                            marginTop: 6,
                          }}
                        >
                          {rev.text}
                        </Text>
                      ) : null}

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

                      {rev.photo_path ? (
                        <Image
                          source={{
                            uri: `https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/${rev.photo_path}`,
                          }}
                          style={{
                            width: "100%",
                            height: 150,
                            borderRadius: theme.radius.lg,
                            backgroundColor: "#111",
                            marginTop: 10,
                          }}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}

            {reviews.length > 6 && (
              <Pressable
                onPress={() => router.push(`/spot/${spot.id}/reviews`)}
                style={{
                  alignSelf: "center",
                  marginTop: theme.spacing(1),
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.2)",
                }}
              >
                <Text style={{ color: "#93C5FD", fontWeight: "700" }}>
                  Alle Reviews anzeigen
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* NEARBY */}
        <View style={{ paddingHorizontal: theme.spacing(2), marginTop: theme.spacing(2) }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
              In der Nähe
            </Text>
          </View>

          {nearby.length > 0 ? (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={nearby}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push(`/spot/${item.id}`)}
                  style={{ marginRight: 14, width: 240 }}
                >
                  <View
                    style={{
                      width: 240,
                      height: 140,
                      borderRadius: theme.radius.lg,
                      overflow: "hidden",
                      backgroundColor: "#111",
                    }}
                  >
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#222",
                        }}
                      >
                        <Text style={{ color: "#fff" }}>{item.name?.[0] || "?"}</Text>
                      </View>
                    )}
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.5)"]}
                      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 80 }}
                    />
                    <View
                      style={{
                        position: "absolute",
                        right: 8,
                        bottom: 8,
                        backgroundColor: "rgba(0,0,0,0.45)",
                        borderRadius: theme.radius.pill,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.12)",
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>
                        {item.distanceKm.toFixed(1)} km
                      </Text>
                    </View>
                  </View>

                  <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 8 }} numberOfLines={1}>
                    {item.name}
                  </Text>

                  {!!item.address && (
                    <Text style={{ color: theme.colors.textMuted }} numberOfLines={1}>
                      {item.address}
                    </Text>
                  )}
                </Pressable>
              )}
            />
          ) : (
            <Text style={{ color: theme.colors.textMuted }}>Keine Spots gefunden.</Text>
          )}
        </View>

        <View style={{ height: 80 }} />
      </Animated.ScrollView>

      {/* FAB */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: 24 + insets.bottom,
          right: 24,
          transform: [{ translateY: 0 }],
          opacity: 1,
        }}
      >
        <Pressable
          onPress={() => {
            if (!userId) return setShowLoginPrompt(true);
            router.push(`/review/new?spotId=${spot.id}`);
          }}
          style={styles.fab}
        >
          <Ionicons name="add" size={28} color="#000" />
        </Pressable>
      </Animated.View>

      <LoginPromptModal
        visible={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
      />
    </View>
  );
}


/* ========= STYLES ========= */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerBarSafeArea: { paddingHorizontal: theme.spacing(2) },
  headerIconBtn: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: theme.radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  /* ===== Header (Top Bar) ===== */
  topBar: {
    height: 52,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,

    // Glass look + feiner Rand
    backgroundColor: "transparent", // 👈 kein Hintergrund
    borderWidth: 0,                 // 👈 kein Rahmen
    shadowColor: "transparent",     // 👈 kein Schatten
    elevation: 0,  

    // Soft ambient shadow

    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },

  },
  topBarBtn: {
    width: 48,
    height: 48,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarActions: {
    flexDirection: "row",
    columnGap: 10, // RN 0.73+; falls älter: nutze marginLeft am 2. Button
  },


  headerWrap: { position: "relative" },
  slideContainer: {
    width: "100%",
    height: HEADER_MAX,
    overflow: "hidden",
    borderBottomLeftRadius: theme.radius.xxl,
    borderBottomRightRadius: theme.radius.xxl,
    backgroundColor: "#111",
  },

  headerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerFallbackText: {
    fontSize: 48,
    fontWeight: "900",
    color: theme.colors.text,
  },

  headerGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
  },

  title: {
    ...typography.h1,
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: "900",
  },

  badgeSoft: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  sectionBox: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing(2),
    marginHorizontal: theme.spacing(2),
    marginTop: theme.spacing(2),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.06)",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionHeaderTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },

  text: {
    ...typography.body,
    color: theme.colors.text,
    fontSize: 15,
    marginBottom: 6,
  },
  textMuted: {
    ...typography.body,
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  link: {
    color: "#93C5FD",
    fontSize: 15,
    marginBottom: 4,
  },

  ghostChip: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
  },
  ghostChipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },

  chip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  chipText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },

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
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "transparent",
    gap: 10,
    maxWidth: "100%",
  },
  moodPillText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  moodPillCount: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    borderColor: "transparent",
  },
  moodPillCountText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
  },

  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },

  reviewCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(1.5),
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewName: {
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  reviewDate: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  reviewText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 6,
  },
  reviewImage: {
    width: "100%",
    height: 150,
    borderRadius: theme.radius.lg,
    backgroundColor: "#111",
    marginTop: 10,
  },
  moreReviewsBtn: {
    alignSelf: "center",
    marginTop: theme.spacing(1),
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  moreReviewsText: {
    color: "#93C5FD",
    fontWeight: "700",
  },

  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#0EA5E9",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },

  nearbyImageWrap: {
    width: 240,
    height: 140,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  nearbyImg: { width: "100%", height: "100%" },
  nearbyGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },
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
  nearbyDistanceText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  resultTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 8,
  },
});
