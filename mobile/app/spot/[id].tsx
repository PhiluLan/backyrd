import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
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

import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";

import LoginPromptModal from "../../components/LoginPromptModal";
import { supabase } from "../../lib/supabase";
import { openWebsite, callNumber, openInAppleMaps } from "../../lib/links";
import { trackAnalyticsEvent } from "../../lib/analytics";

const theme = {
  colors: {
    background: "#0A0A0B",
    surface: "#111113",
    surfaceElevated: "#151519",
    border: "rgba(255,255,255,0.09)",
    text: "#FFFFFF",
    textMuted: "#A6A8AD",
    textSoft: "rgba(255,255,255,0.72)",
    pink: "#FF7DA7",
    pinkSoft: "#FFD4E0",
    greenSoft: "#C8E3A6",
    success: "#22C55E",
    danger: "#EF4444",
  },
  spacing: (n: number) => n * 8,
  radius: { sm: 8, md: 12, lg: 16, xl: 24, xxl: 28, pill: 999 },
};

const { width } = Dimensions.get("window");
const HEADER_H = Math.round(width * 0.98);
const HEADER_MAX = Math.round(width * 0.98);
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

function priceToSymbols(n?: number | null) {
  if (!n || n < 1) return "—";
  return "$".repeat(Math.min(5, Math.max(1, n)));
}

function parseTimeToMinutes(t?: string | null) {
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm;
}

function isOpenNow(rowsForDay?: any[]) {
  if (!rowsForDay || rowsForDay.length === 0) return { open: false };
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const row of rowsForDay) {
    const open = parseTimeToMinutes(row.open_time);
    const close = parseTimeToMinutes(row.close_time);
    if (open == null || close == null) continue;

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

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text style={styles.sectionTitle}>{children}</Text>
);

const InfoRow = ({
  icon,
  text,
  onPress,
  color,
}: {
  icon: keyof typeof Feather.glyphMap;
  text: string;
  onPress?: () => void;
  color?: string;
}) => (
  <Pressable disabled={!onPress} onPress={onPress} style={styles.infoRow}>
    <View style={styles.infoIcon}>
      <Feather name={icon} size={17} color={color ?? theme.colors.textSoft} />
    </View>
    <Text numberOfLines={2} style={[styles.infoText, color ? { color } : null]}>
      {text}
    </Text>
  </Pressable>
);

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
  const [hours, setHours] = useState<Record<string, any[]>>({});
  const [moodSummary, setMoodSummary] = useState<any[]>([]);
  const [nearby, setNearby] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showAllMoods, setShowAllMoods] = useState(false);

  const [ownerCtx, setOwnerCtx] = useState<any>(null);
  const [claimLoading, setClaimLoading] = useState(false);

  const index = useRef(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const loadOwnerCtx = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase.rpc("get_spot_owner_context_v1", {
        p_spot_id: id,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setOwnerCtx(row ?? null);
    } catch (e) {
      console.log("get_spot_owner_context_v1 error", e);
    }
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) =>
      setUserId(sess?.user?.id ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOwnerCtx();
    }, [loadOwnerCtx])
  );

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);

      const [
        { data: spotRow },
        { data: photoRows },
        { data: revRows },
        { data: hourRows },
      ] = await Promise.all([
        supabase
          .from("spots")
          .select("id,name,address,lat,lng,phone,website,email,price_level")
          .eq("id", id)
          .single(),

        supabase
          .from("spot_photos")
          .select("id,url,created_at")
          .eq("spot_id", id)
          .order("created_at", { ascending: false }),

        supabase
          .from("reviews")
          .select(`
            id,
            text,
            photo_path,
            created_at,
            mood_a,
            mood_b,
            mood_a_id,
            mood_b_id,
            moodA:mood_a_id ( token ),
            moodB:mood_b_id ( token ),
            profiles:user_id (
              id,
              first_name,
              is_local
            ),
            review_photos (
              id,
              url,
              created_at
            )
          `)
          .eq("spot_id", id)
          .order("created_at", { ascending: false }),

        supabase.from("spot_hours").select("*").eq("spot_id", id),
      ]);

      setSpot(spotRow);
      setPhotos(photoRows || []);
      setReviews(revRows || []);

      await loadOwnerCtx();

      const grouped: Record<string, any[]> = {};
      (hourRows || []).forEach((h: any) => {
        if (!grouped[h.day_of_week]) grouped[h.day_of_week] = [];
        grouped[h.day_of_week].push(h);
      });
      Object.keys(grouped).forEach((d) => {
        grouped[d].sort((a, b) => (a.open_time || "").localeCompare(b.open_time || ""));
      });
      setHours(grouped);

      if (revRows?.length) {
        const counts: Record<string, number> = {};
        for (const r of revRows) {
          const mA = r.moodA?.token ?? r.mood_a;
          const mB = r.moodB?.token ?? r.mood_b;
          if (mA) counts[mA] = (counts[mA] || 0) + 1;
          if (mB) counts[mB] = (counts[mB] || 0) + 1;
        }
        setMoodSummary(
          Object.entries(counts)
            .map(([mood, count]) => ({ mood, count }))
            .sort((a, b) => b.count - a.count)
        );
      }

      setLoading(false);
    })();
  }, [id, loadOwnerCtx]);

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
  }, [photos, translateX]);

  useEffect(() => {
    if (photos.length > 1) startSlideshow();
    return () => timerRef.current && clearInterval(timerRef.current);
  }, [photos, startSlideshow]);

  async function onShare() {
    if (!spot) return;
    const url =
      spot.website ||
      `https://maps.apple.com/?ll=${spot.lat},${spot.lng}&q=${encodeURIComponent(spot.name)}`;
    void trackAnalyticsEvent({ eventName: "spot_shared", screenName: "spot_detail", entityType: "spot", entityId: id, spotId: id });
    Share.share({ message: `${spot.name}\n${spot.address ?? ""}\n${url}` });
  }

  async function requestClaim() {
    if (!userId) return setShowLoginPrompt(true);
    router.push(`/spot/${id}/claim`);
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

  const effectiveDesc: string | null = ownerCtx?.effective_description ?? null;
  const descSource: string | null = ownerCtx?.description_source ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

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
          <Pressable onPress={() => router.back()} style={styles.topBarBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>

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

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: false,
        })}
      >
        <Animated.View
          style={{
            width: "100%",
            height: HEADER_H,
            overflow: "hidden",
            transform: [{ translateY: headerTranslateY }],
          }}
        >
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
                <Image source={{ uri: photos[index.current]?.url }} style={{ width, height: HEADER_MAX }} />
                <Image source={{ uri: photos[(index.current + 1) % photos.length]?.url }} style={{ width, height: HEADER_MAX }} />
              </Animated.View>
            ) : (
              <View style={styles.photoFallback}>
                <Text style={styles.photoFallbackText}>{spot.name?.[0] ?? "B"}</Text>
              </View>
            )}

            <LinearGradient
              colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.12)", "rgba(0,0,0,0.62)", theme.colors.background]}
              locations={[0, 0.45, 0.78, 1]}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroContent}>
              <View style={styles.heroPills}>
                <View style={[styles.statusPill, isOpen ? styles.statusOpen : styles.statusClosed]}>
                  <View style={[styles.statusDot, { backgroundColor: isOpen ? theme.colors.greenSoft : theme.colors.danger }]} />
                  <Text style={[styles.statusText, { color: isOpen ? theme.colors.greenSoft : "#FFB4B4" }]}>
                    {isOpen ? "Geöffnet" : "Geschlossen"}
                  </Text>
                </View>
                {spot.price_level ? <Chip text={priceToSymbols(spot.price_level)} /> : null}
              </View>

              <Text numberOfLines={3} style={styles.heroTitle}>{spot.name}</Text>
              {spot.address ? (
                <Text numberOfLines={1} style={styles.heroAddress}>{spot.address}</Text>
              ) : null}
            </View>
          </Animated.View>
        </Animated.View>

        <View style={styles.content}>
          <View style={styles.quickActions}>
            <Pressable onPress={() => {
              void trackAnalyticsEvent({ eventName: "spot_route_clicked", screenName: "spot_detail", entityType: "spot", entityId: spot.id, spotId: spot.id });
              openInAppleMaps(spot.lat, spot.lng, spot.name);
            }} style={styles.primaryAction}>
              <Feather name="navigation" size={17} color="#171214" />
              <Text style={styles.primaryActionText}>Route</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!userId) return setShowLoginPrompt(true);
                void trackAnalyticsEvent({ eventName: "spot_review_started", screenName: "spot_detail", entityType: "spot", entityId: spot.id, spotId: spot.id });
                router.push(`/review/new?spotId=${spot.id}`);
              }}
              style={styles.secondaryAction}
            >
              <Feather name="plus" size={18} color={theme.colors.text} />
              <Text style={styles.secondaryActionText}>Moment</Text>
            </Pressable>
          </View>

          {moodSummary.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <SectionTitle>Taste DNA</SectionTitle>
                {moodSummary.length > 5 ? (
                  <Pressable onPress={() => setShowAllMoods((s) => !s)}>
                    <Text style={styles.showMoreText}>{showAllMoods ? "Weniger" : "Mehr anzeigen"}</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.moodWrap}>
                {(showAllMoods ? moodSummary : moodSummary.slice(0, 5)).map((m) => (
                  <View key={m.mood} style={[styles.moodPill, { borderColor: moodColor(m.mood) }]}>
                    <Text style={styles.moodText}>{m.mood}</Text>
                    <Text style={styles.moodCount}>{m.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionTitle>Beschreibung</SectionTitle>
              {!!descSource ? (
                <View style={styles.sourcePill}>
                  <Text style={styles.sourceText}>{descSource === "owner" ? "Betreiber" : descSource}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.bodyText}>
              {effectiveDesc || "Noch keine Beschreibung vorhanden."}
            </Text>
          </View>

          <View style={styles.section}>
            <SectionTitle>Info</SectionTitle>
            <View style={styles.infoCard}>
              {spot.address ? <InfoRow icon="map-pin" text={spot.address} /> : null}
              {spot.phone ? <InfoRow icon="phone" text={spot.phone} color={theme.colors.pinkSoft} onPress={() => {
                void trackAnalyticsEvent({ eventName: "spot_phone_clicked", screenName: "spot_detail", entityType: "spot", entityId: spot.id, spotId: spot.id });
                callNumber(spot.phone);
              }} /> : null}
              {spot.website ? <InfoRow icon="globe" text={spot.website} color={theme.colors.pinkSoft} onPress={() => {
                void trackAnalyticsEvent({ eventName: "spot_website_clicked", screenName: "spot_detail", entityType: "spot", entityId: spot.id, spotId: spot.id });
                openWebsite(spot.website);
              }} /> : null}
            </View>
          </View>

          <View style={styles.ownerBlock}>
            {ownerCtx?.is_verified_owner ? (
              <Pressable onPress={() => router.push(`/spot/${spot.id}/manage`)} style={styles.ownerButton}>
                <Feather name="settings" size={17} color={theme.colors.text} />
                <Text style={styles.ownerButtonText}>Spot verwalten</Text>
              </Pressable>
            ) : ownerCtx?.claim_status === "pending" ? (
              <View style={styles.ownerButton}>
                <Feather name="clock" size={17} color={theme.colors.textSoft} />
                <Text style={styles.ownerButtonText}>Claim wird geprüft</Text>
              </View>
            ) : (
              <Pressable onPress={requestClaim} disabled={claimLoading} style={[styles.ownerButton, claimLoading ? { opacity: 0.6 } : null]}>
                <Feather name="check-circle" size={17} color={theme.colors.text} />
                <Text style={styles.ownerButtonText}>{claimLoading ? "Sende..." : "Betreiberzugang anfragen"}</Text>
              </Pressable>
            )}
          </View>

          {Object.keys(hours).length > 0 && (
            <View style={styles.section}>
              <SectionTitle>Öffnungszeiten</SectionTitle>
              <View style={styles.hoursCard}>
                {WEEK_ORDER.map((day) => {
                  const slots = hours[day] || [];
                  const isToday = day === todayNameNormalized;

                  return (
                    <View key={day} style={styles.hoursRow}>
                      <Text style={[styles.hoursDay, isToday ? styles.hoursToday : null]}>{day}</Text>
                      <View style={{ alignItems: "flex-end", flex: 1 }}>
                        {slots.length > 0 ? (
                          slots.map((s, idx) => (
                            <Text key={idx} style={[styles.hoursTime, isToday ? styles.hoursToday : null]}>
                              {s.open_time && s.close_time
                                ? `${s.open_time.slice(0, 5)} - ${s.close_time.slice(0, 5)}`
                                : "-"}
                            </Text>
                          ))
                        ) : (
                          <Text style={styles.hoursTime}>-</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {reviews.length > 0 && (
            <View style={styles.section}>
              <SectionTitle>Moments</SectionTitle>
              {reviews.slice(0, 6).map((rev) => {
                const moods = [rev.moodA?.token ?? rev.mood_a, rev.moodB?.token ?? rev.mood_b].filter(Boolean);
                const name = rev.profiles?.first_name || "User";
                const isLocal = rev.profiles?.is_local;
                const reviewPhotoUrl =
                  rev.review_photos?.[0]?.url ||
                  (rev.photo_path?.startsWith("http")
                    ? rev.photo_path
                    : rev.photo_path
                    ? `https://hjgcrrzfjchzqoegcywn.supabase.co/storage/v1/object/public/spot-photos/${rev.photo_path}`
                    : null);

                return (
                  <View key={rev.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Avatar name={name} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewName}>{name}{isLocal ? " · Local" : ""}</Text>
                        <Text style={styles.reviewDate}>
                          {new Date(rev.created_at).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </Text>
                      </View>
                    </View>
                    {rev.text ? <Text style={styles.reviewText}>{rev.text}</Text> : null}
                    {moods.length > 0 && (
                      <View style={styles.reviewMoods}>
                        {moods.map((m: string) => <Chip key={m} text={m} />)}
                      </View>
                    )}
                    {reviewPhotoUrl ? <Image source={{ uri: reviewPhotoUrl }} style={styles.reviewPhoto} /> : null}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.section}>
            <SectionTitle>In der Nähe</SectionTitle>
            {nearby.length > 0 ? (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={nearby}
                keyExtractor={(i) => i.id}
                contentContainerStyle={{ paddingRight: 20 }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => {
                    void trackAnalyticsEvent({ eventName: "nearby_spot_opened", screenName: "spot_detail", entityType: "spot", entityId: item.id, spotId: item.id, properties: { parent_spot_id: spot.id } });
                    router.push(`/spot/${item.id}`);
                  }} style={styles.nearbyCard}>
                    <View style={styles.nearbyPhotoWrap}>
                      {item.photoUrl ? (
                        <Image source={{ uri: item.photoUrl }} style={styles.nearbyPhoto} />
                      ) : (
                        <View style={styles.nearbyFallback}>
                          <Text style={styles.nearbyFallbackText}>{item.name?.[0] || "?"}</Text>
                        </View>
                      )}
                      <LinearGradient colors={["transparent", "rgba(0,0,0,0.62)"]} style={styles.nearbyGradient} />
                      <View style={styles.distancePill}>
                        <Text style={styles.distanceText}>{item.distanceKm.toFixed(1)} km</Text>
                      </View>
                    </View>
                    <Text style={styles.nearbyName} numberOfLines={1}>{item.name}</Text>
                    {!!item.address && <Text style={styles.nearbyAddress} numberOfLines={1}>{item.address}</Text>}
                  </Pressable>
                )}
              />
            ) : (
              <Text style={styles.mutedText}>Keine Spots gefunden.</Text>
            )}
          </View>
        </View>

        <View style={{ height: 44 + insets.bottom }} />
      </Animated.ScrollView>

      <LoginPromptModal visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 48,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowColor: "transparent",
    elevation: 0,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  topBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(5,5,6,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarActions: {
    flexDirection: "row",
    columnGap: 10,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.pink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  photoFallback: {
    width: "100%",
    height: HEADER_MAX,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  photoFallbackText: {
    color: theme.colors.text,
    fontSize: 52,
    fontWeight: "800",
  },
  heroContent: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 30,
  },
  heroPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  statusPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusOpen: {
    backgroundColor: "rgba(200,227,166,0.13)",
    borderColor: "rgba(200,227,166,0.28)",
  },
  statusClosed: {
    backgroundColor: "rgba(239,68,68,0.13)",
    borderColor: "rgba(239,68,68,0.28)",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "800",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 42,
    lineHeight: 43,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  heroAddress: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    marginTop: 8,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  quickActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  primaryAction: {
    flex: 1.15,
    height: 54,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.pink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryActionText: {
    color: "#171214",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryAction: {
    flex: 1,
    height: 54,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryActionText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  section: {
    marginBottom: 26,
  },
  sectionHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.45,
  },
  showMoreText: {
    color: theme.colors.pinkSoft,
    fontSize: 13,
    fontWeight: "800",
  },
  moodWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moodPill: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moodText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  moodCount: {
    color: theme.colors.pinkSoft,
    fontSize: 13,
    fontWeight: "800",
  },
  sourcePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,125,167,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,125,167,0.24)",
  },
  sourceText: {
    color: theme.colors.pinkSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  bodyText: {
    color: theme.colors.textSoft,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
  },
  infoCard: {
    marginTop: 12,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  infoRow: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  ownerBlock: {
    marginBottom: 26,
  },
  ownerButton: {
    minHeight: 52,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ownerButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  hoursCard: {
    marginTop: 12,
    borderRadius: 24,
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
    paddingVertical: 7,
  },
  hoursDay: {
    width: 104,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  hoursTime: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  hoursToday: {
    color: theme.colors.text,
    fontWeight: "800",
  },
  reviewCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reviewName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  reviewDate: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
  reviewText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    fontWeight: "500",
  },
  reviewMoods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  reviewPhoto: {
    width: "100%",
    height: 160,
    borderRadius: 18,
    backgroundColor: "#111",
    marginTop: 12,
  },
  nearbyCard: {
    marginRight: 14,
    width: 220,
  },
  nearbyPhotoWrap: {
    width: 220,
    height: 132,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  nearbyPhoto: {
    width: "100%",
    height: "100%",
  },
  nearbyFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nearbyFallbackText: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "800",
  },
  nearbyGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },
  distancePill: {
    position: "absolute",
    left: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(0,0,0,0.56)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  distanceText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  nearbyName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 9,
  },
  nearbyAddress: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  mutedText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
});
