import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
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
import ReportContentButton from "../../components/safety/ReportContentButton";
import { supabase } from "../../lib/supabase";
import { openWebsite, callNumber, openInAppleMaps } from "../../lib/links";
import { trackAnalyticsEvent } from "../../lib/analytics";
import { recordMemoryProductAction } from "../../lib/memory-bridge";
import {
  SpotTaxonomyChips,
  SpotTaxonomyDetails,
} from "../../components/spot/SpotTaxonomyHighlights";
import { getMobileSpotTaxonomy, type MobileSpotTaxonomyItem } from "../../lib/taxonomy";
import { selectSpotImageUrl } from "../../lib/spot-images";
import { SpotArtwork } from "../../components/spot/SpotArtwork";
import { AppText } from "../../components/foundation/AppText";
import { StateView } from "../../components/foundation/StateView";
import { backyrdTheme as foundationTheme } from "../../theme/backyrd";

import { openMomentComposerSafely } from "../../lib/safety-moment-entry";
const theme = {
  colors: {
    background: foundationTheme.color.background,
    surface: foundationTheme.color.surface,
    surfaceElevated: foundationTheme.color.surfaceElevated,
    border: foundationTheme.color.border,
    text: foundationTheme.color.textPrimary,
    textMuted: foundationTheme.color.textSecondary,
    textSoft: foundationTheme.color.textSecondary,
    pink: foundationTheme.color.pink,
    pinkSoft: foundationTheme.color.pink,
    greenSoft: foundationTheme.color.lime,
    success: foundationTheme.color.success,
    danger: foundationTheme.color.danger,
  },
  spacing: (n: number) => n * 8,
  radius: {
    sm: foundationTheme.radius.sm,
    md: foundationTheme.radius.md,
    lg: foundationTheme.radius.lg,
    xl: foundationTheme.radius.lg,
    xxl: foundationTheme.radius.lg,
    pill: foundationTheme.radius.pill,
  },
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

function openingStateNow(rowsForDay?: any[]) {
  if (!rowsForDay || rowsForDay.length === 0) return { state: "unknown" as const };
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const row of rowsForDay) {
    const open = parseTimeToMinutes(row.open_time);
    const close = parseTimeToMinutes(row.close_time);
    if (open == null || close == null) continue;
    if (close <= open) {
      if (nowMin >= open || nowMin < close) return { state: "open" as const };
    } else {
      if (nowMin >= open && nowMin < close) return { state: "open" as const };
    }
  }
  // A stored row without a time interval is the canonical closed-day marker.
  return { state: "closed" as const };
}

function presentMoodToken(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.trim().toLowerCase();
  if (clean.length < 2) return null;
  const localized: Record<string, string> = {
    cozy: "Gemütlich",
    gemuetlich: "Gemütlich",
    gemutlich: "Gemütlich",
    lively: "Lebhaft",
    calm: "Ruhig",
    quiet: "Ruhig",
  };
  return localized[clean] ?? clean.charAt(0).toUpperCase() + clean.slice(1);
}

function descriptionSourceLabel(source: string | null) {
  if (source === "owner") return "Betreiber";
  if (source === "admin") return "Backyrd geprüft";
  return null;
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
  <View style={styles.sectionTitleRow}><View style={styles.sectionMarker} /><AppText role="sectionTitle" style={styles.sectionTitle}>{children}</AppText></View>
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
  const { id, entrySource } = useLocalSearchParams<{ id: string; entrySource?: string }>();
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
  const [taxonomyItems, setTaxonomyItems] = useState<MobileSpotTaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const productOpenLogged = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);

  // One canonical detail-open signal for generic entry surfaces. Decision and
  // nearby-card entries already emit their own source event before navigation.
  useEffect(() => {
    if (!id || productOpenLogged.current || entrySource === "decision" || entrySource === "nearby") return;
    productOpenLogged.current = true;
    void recordMemoryProductAction({ actionType: "spot_opened", spotId: id, entrySurface: "generic" });
    void trackAnalyticsEvent({
      eventName: "spot_detail_opened",
      screenName: "spot_detail",
      entityType: "spot",
      entityId: id,
      spotId: id,
      properties: { entry_surface: "generic" },
    });
  }, [entrySource, id]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showAllMoods, setShowAllMoods] = useState(false);

  const [ownerCtx, setOwnerCtx] = useState<any>(null);

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

  const refreshVisibleReviews = useCallback(async () => {
    if (!id) return;

    const { data: revRows, error: reviewsError } = await supabase
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
      .order("created_at", { ascending: false });

    if (reviewsError) {
      console.log("refresh reviews error", reviewsError);
      return;
    }

    const rawReviews = revRows || [];
    let visibleReviews = rawReviews;

    if (rawReviews.length > 0) {
      const reviewIds = rawReviews
        .map((review: any) => review.id)
        .filter(Boolean);

      const { data: visibleReviewIds, error: visibilityError } =
        await supabase.rpc("safety_visible_entity_ids_v1", {
          p_entity_type: "review",
          p_entity_ids: reviewIds,
        });

      if (visibilityError) {
        console.log(
          "safety_visible_entity_ids_v1 refresh error",
          visibilityError,
        );
      } else {
        const allowedIds = new Set(
          Array.isArray(visibleReviewIds)
            ? visibleReviewIds
            : [],
        );

        visibleReviews = rawReviews.filter((review: any) =>
          allowedIds.has(review.id),
        );
      }
    }

    setReviews(visibleReviews);

    const { data: profile, error: profileError } = await supabase
      .from("backyrd_spot_mood_profile_public_v1")
      .select("concept_key,label,percentage,concept_contributors,eligible_contributors,evidence_state,rank")
      .eq("spot_id", id)
      .order("rank", { ascending: true });
    if (!profileError) setMoodSummary(profile ?? []);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadOwnerCtx();
      void refreshVisibleReviews();
    }, [loadOwnerCtx, refreshVisibleReviews])
  );

  useEffect(() => {
    (async () => {
      if (!id) return;
      setLoading(true);

      const [
        { data: spotRow },
        { data: revRows },
        { data: hourRows },
        taxonomyRows,
      ] = await Promise.all([
        supabase
          .from("spots")
          .select("id,name,address,lat,lng,phone,website,email,price_level,header_photo_path,google_place_id,google_photo_enabled")
          .eq("id", id)
          .single(),

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
        getMobileSpotTaxonomy(String(id), "de").catch((error) => {
          console.log("get_mobile_spot_taxonomy_v1 error", error);
          return [];
        }),
      ]);

      const headerPhotoUrl = selectSpotImageUrl({
        headerPhotoPath: spotRow?.header_photo_path,
      });
      const canonicalPhotos = headerPhotoUrl
        ? [{
          id: `header:${id}`,
          url: headerPhotoUrl,
          created_at: null,
        }]
        : [];

      setSpot(spotRow);
      setPhotos(canonicalPhotos);

      const rawReviews = revRows || [];
      let visibleReviews = rawReviews;

      if (rawReviews.length > 0) {
        const reviewIds = rawReviews
          .map((review: any) => review.id)
          .filter(Boolean);

        const { data: visibleReviewIds, error: visibilityError } =
          await supabase.rpc("safety_visible_entity_ids_v1", {
            p_entity_type: "review",
            p_entity_ids: reviewIds,
          });

        if (visibilityError) {
          console.log(
            "safety_visible_entity_ids_v1 error",
            visibilityError,
          );
        } else {
          const allowedIds = new Set(
            Array.isArray(visibleReviewIds)
              ? visibleReviewIds
              : [],
          );

          visibleReviews = rawReviews.filter((review: any) =>
            allowedIds.has(review.id),
          );
        }
      }

      setReviews(visibleReviews);

      setTaxonomyItems(taxonomyRows || []);

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

      const { data: profile, error: profileError } = await supabase
        .from("backyrd_spot_mood_profile_public_v1")
        .select("concept_key,label,percentage,concept_contributors,eligible_contributors,evidence_state,rank")
        .eq("spot_id", id)
        .order("rank", { ascending: true });
      if (!profileError) setMoodSummary(profile ?? []);

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

  const { state: openingState } = openingStateNow(todaysHours);
  const isOpen = openingState === "open";
  const openingUnknown = openingState === "unknown";

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
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
        .select("id,name,address,lat,lng,header_photo_path")
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

      const withPhoto = withDist.map((s) => ({
        ...s,
        headerPhotoPath: s.header_photo_path ?? undefined,
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
        <StateView kind="loading" title="Spot wird geladen" message="Backyrd bereitet diesen Ort für dich vor." />
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
                <SpotArtwork
                  imageUrl={photos[index.current]?.url}
                  priority="high"
                  spotId={String(spot.id)}
                  spotName={spot.name}
                  style={{ width, height: HEADER_MAX }}
                />
                <SpotArtwork
                  imageUrl={photos[(index.current + 1) % photos.length]?.url}
                  priority="high"
                  spotId={String(spot.id)}
                  spotName={spot.name}
                  style={{ width, height: HEADER_MAX }}
                />
              </Animated.View>
            ) : (
              <SpotArtwork
                imageUrl={selectSpotImageUrl({ headerPhotoPath: spot.header_photo_path })}
                priority="high"
                spotId={String(spot.id)}
                spotName={spot.name}
                style={{ width, height: HEADER_MAX }}
              />
            )}

            <LinearGradient
              colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.12)", "rgba(0,0,0,0.62)", theme.colors.background]}
              locations={[0, 0.45, 0.78, 1]}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroContent}>
              <View style={styles.heroPills}>
                <View style={[styles.statusPill, isOpen ? styles.statusOpen : openingUnknown ? styles.statusUnknown : styles.statusClosed]}>
                  <View style={[styles.statusDot, { backgroundColor: isOpen ? theme.colors.greenSoft : openingUnknown ? theme.colors.textSoft : theme.colors.danger }]} />
                  <Text style={[styles.statusText, { color: isOpen ? theme.colors.greenSoft : openingUnknown ? theme.colors.textSoft : "#FFB4B4" }]}>
                    {isOpen ? "Geöffnet" : openingUnknown ? "Öffnungszeiten unbekannt" : "Geschlossen"}
                  </Text>
                </View>
                {spot.price_level ? <Chip text={priceToSymbols(spot.price_level)} /> : null}
              </View>

              <AppText adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={4} role="displayL" style={styles.heroTitle}>{spot.name}</AppText>
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
              void recordMemoryProductAction({ actionType: "navigation_intent", spotId: spot.id, entrySurface: "generic" });
              openInAppleMaps(spot.lat, spot.lng, spot.name);
            }} style={styles.primaryAction}>
              <Feather name="navigation" size={17} color="#111113" />
              <Text style={styles.primaryActionText}>Route</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!userId) return setShowLoginPrompt(true);
                void trackAnalyticsEvent({ eventName: "spot_review_started", screenName: "spot_detail", entityType: "spot", entityId: spot.id, spotId: spot.id });
                void openMomentComposerSafely({ router, href: `/review/new?spotId=${spot.id}` });
              }}
              style={styles.secondaryAction}
            >
              <Feather name="plus" size={18} color={theme.colors.text} />
              <Text style={styles.secondaryActionText}>Moment</Text>
            </Pressable>
          </View>

          <SpotTaxonomyChips items={taxonomyItems} />

          <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <SectionTitle>So fühlt es sich hier an</SectionTitle>
                {moodSummary.length > 5 ? (
                  <Pressable onPress={() => setShowAllMoods((s) => !s)}>
                    <Text style={styles.showMoreText}>{showAllMoods ? "Weniger" : "Mehr anzeigen"}</Text>
                  </Pressable>
                ) : null}
              </View>
              {moodSummary.length > 0 ? <>
              {moodSummary[0]?.evidence_state === "EARLY" ? <Text style={styles.bodyText}>Erste Eindrücke</Text> : null}
              <View style={styles.moodWrap}>
                {(showAllMoods ? moodSummary : moodSummary.slice(0, 5)).map((m) => (
                  <View key={m.concept_key} style={styles.moodPill}>
                    <Text style={styles.moodText}>{m.label}</Text>
                    {m.evidence_state === "ESTABLISHED" ? <Text style={styles.moodCount}>{m.percentage}%</Text> : null}
                  </View>
                ))}
              </View>
              </> : <StateView kind="empty" title="Noch keine Stimmung eingefangen." message="Teile nach deinem Besuch deinen Eindruck." />}
            </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionTitle>Beschreibung</SectionTitle>
              {!!descriptionSourceLabel(descSource) ? (
                <View style={styles.sourcePill}>
                  <Text style={styles.sourceText}>{descriptionSourceLabel(descSource)}</Text>
                </View>
              ) : null}
            </View>
            {effectiveDesc ? <Text style={styles.bodyText}>{effectiveDesc}</Text> : <StateView kind="empty" title="Noch ohne Geschichte." message="Für diesen Ort gibt es noch keine Beschreibung – die wichtigsten Infos findest du trotzdem hier." />}
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
              <Pressable onPress={requestClaim} style={styles.ownerButton}>
                <Feather name="check-circle" size={17} color={theme.colors.text} />
                <Text style={styles.ownerButtonText}>Betreiberzugang anfragen</Text>
              </Pressable>
            )}
          </View>

          {Object.keys(hours).length > 0 ? (
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
          ) : (
            <View style={styles.section}>
              <SectionTitle>Öffnungszeiten</SectionTitle>
              <StateView kind="empty" title="Noch nicht bekannt" message="Backyrd zeigt keinen Öffnungsstatus, solange keine verlässlichen Zeiten hinterlegt sind." />
            </View>
          )}


          <SpotTaxonomyDetails items={taxonomyItems} />
          {reviews.length > 0 && (
            <View style={styles.section}>
              <SectionTitle>Momente</SectionTitle>
              {reviews.slice(0, 6).map((rev) => {
                const moods = [
                  presentMoodToken(rev.moodA?.token ?? rev.mood_a),
                  presentMoodToken(rev.moodB?.token ?? rev.mood_b),
                ].filter((mood): mood is string => Boolean(mood));
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
                        <Text style={styles.reviewName}>
                          {name}
                          {isLocal ? " · Local" : ""}
                        </Text>

                        <Text style={styles.reviewDate}>
                          {new Date(rev.created_at).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </Text>
                      </View>

                      {rev.profiles?.id !== userId ? (
                        userId ? (
                          <View style={styles.reviewReportAction}>
                            <ReportContentButton
                              entityType="review"
                              entityId={rev.id}
                              contentType="review"
                              actorUserId={rev.profiles?.id ?? null}
                              spotId={spot.id}
                              textContent={rev.text ?? null}
                              imageUrls={reviewPhotoUrl ? [reviewPhotoUrl] : []}
                              locale="de-CH"
                              sourceSurface="spot_detail_moment"
                              sourceContext={{
                                screen: "spot_detail",
                                review_id: rev.id,
                                spot_id: spot.id,
                              }}
                            />
                          </View>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Moment melden"
                            hitSlop={10}
                            onPress={() => setShowLoginPrompt(true)}
                            style={({ pressed }) => [
                              styles.reviewReportFallback,
                              pressed ? styles.reviewReportFallbackPressed : null,
                            ]}
                          >
                            <Ionicons
                              name="ellipsis-horizontal"
                              size={20}
                              color={theme.colors.textSoft}
                            />
                          </Pressable>
                        )
                      ) : null}
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
            <SectionTitle>Rund um diesen Spot</SectionTitle>
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
                    void recordMemoryProductAction({ actionType: "spot_opened", spotId: item.id, entrySurface: "nearby" });
                    router.push(`/spot/${item.id}?entrySource=nearby`);
                  }} style={styles.nearbyCard}>
                    <View style={styles.nearbyPhotoWrap}>
                      <SpotArtwork
                        imageUrl={selectSpotImageUrl({ headerPhotoPath: item.headerPhotoPath })}
                        spotId={String(item.id)}
                        spotName={item.name}
                        style={styles.nearbyPhoto}
                      />
                      <LinearGradient colors={["transparent", "rgba(0,0,0,0.62)"]} style={styles.nearbyGradient} />
                      <View style={styles.distancePill}>
                        <Text style={styles.distanceText}>{item.distanceKm.toFixed(1)} km vom Spot</Text>
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
  statusUnknown: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.18)",
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
    color: "#111113",
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
    marginLeft: foundationTheme.spacing.xs,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center" },
  sectionMarker: { width: 16, height: 4, borderRadius: 999, backgroundColor: foundationTheme.color.pink },
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
  reviewReportAction: {
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewReportFallback: {
    width: 40,
    height: 40,
    marginLeft: 4,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  reviewReportFallbackPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.97 }],
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
  googlePhotoAttribution: {
    position: "absolute",
    left: 14,
    bottom: 16,
    maxWidth: "82%",
    minHeight: 30,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  googlePhotoAttributionText: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.92)",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },

});
