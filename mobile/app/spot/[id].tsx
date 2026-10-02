import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Image,
  Dimensions,
  Pressable,
  FlatList,
  Share,
  Animated,
  Easing,
  StyleSheet,
  Linking,
  Modal,
  ScrollView,
} from "react-native";

import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather } from "@expo/vector-icons";
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
import { SpotMoodProfile, type SpotMoodProfileItem } from "../../components/spot/SpotMoodProfile";
import { AppText, ProductText as Text } from "../../components/foundation/AppText";
import { StateView } from "../../components/foundation/StateView";
import SharedAvatar from "../../components/Avatar";
import { backyrdTheme as foundationTheme } from "../../theme/backyrd";
import { SPOT_OPENING_STATUS_COPY, spotOpeningStatusNow } from "../../lib/spot-opening-status";
import { spotAddressLines } from "../../lib/spot-address-presentation";
import { getMobileSpotProductProfile, presentSpotProductField, spotCurrentStateDetails, spotOfferingLabels, spotPetAccessDetails, spotProductAdditionalFields, spotProductField, spotProductLabel, spotProductOpeningHours, type SpotProductField, type SpotProductProfile } from "../../lib/spot-product-profile";

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
    greenSoft: foundationTheme.color.openGreen,
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
// Spot imagery is the opening decision context, just like an Event hero: it
// deliberately reaches the screen edges rather than sitting in a card.
const HERO_W = width;
const HEADER_H = Math.round(HERO_W * 1.05);
const HEADER_MAX = Math.round(HERO_W * 1.05);
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
  <AppText role="sectionTitle" style={styles.sectionTitle}>{children}</AppText>
);

const socialContacts = {
  "contact.instagram": { label: "Instagram", icon: "instagram" },
  "contact.facebook": { label: "Facebook", icon: "facebook" },
  "contact.tiktok": { label: "TikTok", icon: "play-circle" },
} as const;

const ContactAction = ({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) => (
  <Pressable accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={styles.contactAction}>
    <View style={styles.contactIcon}>
      <Feather name={icon} size={19} color={theme.colors.text} />
    </View>
    <Text numberOfLines={1} style={styles.contactLabel}>{label}</Text>
  </Pressable>
);

const tokenFields = new Set([
  "context.typical_dayparts", "context.atmosphere", "amenity.features",
  "context.visit_situations", "offering.food_specialities", "offering.groups",
]);

const SpotFact = ({ field }: { field: SpotProductField }) => {
  const tokens = field.attributeKey === "offering.groups" ? spotOfferingLabels(field.value)
    : tokenFields.has(field.attributeKey) && Array.isArray(field.value)
    ? field.value.map((value) => presentSpotProductField({ ...field, value: [value] }))
    : null;
  const petDetails = field.attributeKey === "rule.pet_access" && field.knowledgeState !== "UNKNOWN" ? spotPetAccessDetails(field.value) : [];
  const petNotes = field.attributeKey === "rule.pet_access" && field.value && typeof field.value === "object" && !Array.isArray(field.value) && typeof (field.value as { notes?: unknown }).notes === "string" ? (field.value as { notes: string }).notes.trim() : "";
  const currentState = field.attributeKey === "state.current" && field.knowledgeState !== "UNKNOWN" ? spotCurrentStateDetails(field.value) : null;
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{spotProductLabel(field.attributeKey)}</Text>
      {petDetails.length ? <>
        <View style={styles.petDetails}>{petDetails.map(({ label, value }) => (
          <View key={label} style={styles.petDetail}><Text style={styles.petLabel}>{label}</Text><Text style={styles.petValue}>{value}</Text></View>
        ))}</View>
        {petNotes ? <Text style={styles.factNote}>{petNotes}</Text> : null}
      </> : currentState ? <View style={styles.currentState}>
        <View style={styles.currentStateDot} />
        <View style={styles.currentStateCopy}><Text style={styles.factValue}>{currentState.title}</Text>{currentState.scope ? <Text style={styles.factNote}>{currentState.scope}</Text> : null}</View>
      </View> : tokens?.length ? <View style={styles.factTokens}>{tokens.map((token, index) => (
        <View key={`${token}:${index}`} style={styles.factToken}><Text style={styles.factTokenText}>{token}</Text></View>
      ))}</View> : <Text style={styles.factValue}>{presentSpotProductField(field)}</Text>}
    </View>
  );
};

const SpotEssentials = ({ category, placeType, price }: {
  category?: SpotProductField;
  placeType?: SpotProductField;
  price?: SpotProductField;
}) => category || placeType || price ? (
  <View style={styles.essentials}>
    <Text style={styles.essentialsHeading}>Auf einen Blick</Text>
    <View style={styles.essentialsDetails}>
      {category ? <View style={styles.essentialsDetail}>
        <Feather name="grid" size={18} color={theme.colors.pink} />
        <Text style={styles.essentialsDetailValue}>{presentSpotProductField(category)}</Text>
        <Text style={styles.essentialsLabel}>Hauptkategorie</Text>
      </View> : null}
      {placeType ? <View style={styles.essentialsDetail}>
        <Feather name="map-pin" size={18} color={theme.colors.pink} />
        <Text style={styles.essentialsDetailValue}>{presentSpotProductField(placeType)}</Text>
        <Text style={styles.essentialsLabel}>Art des Ortes</Text>
      </View> : null}
      {price ? <View style={styles.essentialsDetail}>
        <Feather name="credit-card" size={18} color={theme.colors.pink} />
        <Text style={styles.essentialsDetailValue}>{presentSpotProductField(price)}</Text>
        <Text style={styles.essentialsLabel}>Preisniveau</Text>
      </View> : null}
    </View>
  </View>
) : null;

function specialHours(value: unknown): { date: string; hours: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { date?: unknown; status?: unknown; intervals?: unknown };
    if (typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return [];
    const parsedDate = new Date(`${row.date}T12:00:00Z`);
    if (Number.isNaN(parsedDate.getTime())) return [];
    const date = new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parsedDate);
    if (row.status === "CLOSED") return [{ date, hours: "Geschlossen" }];
    if (row.status !== "OPEN" || !Array.isArray(row.intervals)) return [];
    const hours = row.intervals.flatMap((interval) => interval && typeof interval === "object" && typeof (interval as { start?: unknown }).start === "string" && typeof (interval as { end?: unknown }).end === "string" ? [`${(interval as { start: string }).start}–${(interval as { end: string }).end}`] : []);
    return hours.length ? [{ date, hours: hours.join(" · ") }] : [];
  });
}

export default function SpotDetailScreen() {
  const { id, entrySource } = useLocalSearchParams<{ id: string; entrySource?: string }>();
  const decisionOrigin = entrySource === "decision";
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
  const [legacyAddress, setLegacyAddress] = useState<string | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [hours, setHours] = useState<Record<string, any[]>>({});
  const [moodSummary, setMoodSummary] = useState<SpotMoodProfileItem[]>([]);
  const [nearby, setNearby] = useState<any[]>([]);
  const [taxonomyItems, setTaxonomyItems] = useState<MobileSpotTaxonomyItem[]>([]);
  const [productProfile, setProductProfile] = useState<SpotProductProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [specialHoursExpanded, setSpecialHoursExpanded] = useState(false);
  const [moreInfoExpanded, setMoreInfoExpanded] = useState(false);
  const productOpenLogged = useRef(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);

  // One canonical detail-open signal for generic entry surfaces. Decision and
  // nearby-card entries already emit their own source event before navigation.
  useEffect(() => {
    if (!id || productOpenLogged.current || decisionOrigin || entrySource === "nearby") return;
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
  }, [decisionOrigin, entrySource, id]);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginPromptMessage, setLoginPromptMessage] = useState("Melde dich an, um deinen Moment zu teilen.");

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
        worldProfile,
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
        getMobileSpotProductProfile(String(id)).catch((error) => {
          console.log("spot_detail_product_profile_v1 error", error);
          return null;
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

      const canonicalSpot = worldProfile?.worldManifestHash && worldProfile.spot.source === "WORLD_KNOWLEDGE"
        ? {
          ...spotRow,
          name: worldProfile.spot.name,
          address: worldProfile.spot.addressLine1,
          city: worldProfile.spot.locality,
          lat: worldProfile.spot.latitude,
          lng: worldProfile.spot.longitude,
          header_photo_path: worldProfile.spot.headerPhotoPath ?? spotRow?.header_photo_path ?? null,
        }
        : spotRow;
      setSpot(canonicalSpot);
      setLegacyAddress(spotRow?.address ?? null);
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
      setProductProfile(worldProfile);

      await loadOwnerCtx();

      const grouped: Record<string, any[]> = {};
      const effectiveHourRows = worldProfile?.worldManifestHash
        ? spotProductOpeningHours(worldProfile)
        : (hourRows || []);
      effectiveHourRows.forEach((h: any) => {
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

  const canonicalWorldDetail = Boolean(productProfile?.worldManifestHash);
  const openingStatus = useMemo(() => {
    if (canonicalWorldDetail && !Object.prototype.hasOwnProperty.call(hours, todayNameNormalized)) return "unknown";
    return spotOpeningStatusNow(Object.values(hours).flat());
  }, [canonicalWorldDetail, hours, todayNameNormalized]);
  const openingState = openingStatus === "open" ? "open" : openingStatus === "openingSoon" ? "openingSoon" : openingStatus === "closingSoon" ? "closingSoon" : openingStatus === "unknown" ? "unknown" : "closed";
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
        toValue: -HERO_W,
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
    if (!decisionOrigin) void trackAnalyticsEvent({ eventName: "spot_shared", screenName: "spot_detail", entityType: "spot", entityId: id, spotId: id });
    Share.share({ message: `${spot.name}\n${spot.address ?? ""}\n${url}` });
  }

  async function requestClaim() {
    if (!userId) {
      setLoginPromptMessage("Melde dich an, um diesen Spot zu verwalten.");
      setShowLoginPrompt(true);
      return;
    }
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
        <StateView appearance="dark" kind="loading" title="Spot wird geladen" message="Backyrd bereitet diesen Ort für dich vor." />
      </View>
    );
  }

  const effectiveDesc: string | null = ownerCtx?.effective_description ?? null;
  const descSource: string | null = ownerCtx?.description_source ?? null;
  const field = (key: string) => spotProductField(productProfile, key);
  const neighborhoodField = canonicalWorldDetail ? field("location.neighborhood") : undefined;
  const addressLines = spotAddressLines({
    street: spot.address,
    postalCode: canonicalWorldDetail ? productProfile?.spot.postalCode : null,
    locality: spot.city,
    neighborhood: neighborhoodField?.knowledgeState === "KNOWN_VALUE" && typeof neighborhoodField.value === "string" ? neighborhoodField.value : null,
    country: canonicalWorldDetail ? productProfile?.spot.countryCode : spot.country,
    legacyAddress,
  });
  const contactKeys = ["contact.website", "contact.phone", "contact.public_email", "contact.instagram", "contact.facebook", "contact.linkedin", "contact.tiktok"];
  const contacts = canonicalWorldDetail ? contactKeys.map((key) => field(key)).filter((item): item is SpotProductField => Boolean(item)) : [];
  const descriptionField = canonicalWorldDetail ? field("description.highlight") : undefined;
  const description = descriptionField ? presentSpotProductField(descriptionField) : canonicalWorldDetail ? null : effectiveDesc;
  const specialHoursField = field("hours.special");
  const specialHoursList = specialHoursField ? specialHours(specialHoursField.value) : [];
  const additionalFields = spotProductAdditionalFields(productProfile);
  const moreInfoKeys = ["context.typical_dayparts", "context.atmosphere", "amenity.features", "accessibility.accessible_toilet", "accessibility.elevator", "accessibility.step_free_entrance", "context.visit_situations", "offering.food_specialities", "rule.pet_access"];
  const moreInfoFields = moreInfoKeys.map((key) => field(key)).filter((item): item is SpotProductField => Boolean(item));
  const hasMoreInfo = moreInfoFields.length > 0 || additionalFields.length > 0 || (!canonicalWorldDetail && taxonomyItems.length > 0);
  const presentableReviews = reviews.filter((review) => Boolean(
    review.text?.trim() || review.photo_path || review.review_photos?.length ||
    review.mood_a || review.mood_b || review.moodA?.token || review.moodB?.token,
  ));
  const showHours = !canonicalWorldDetail || Boolean(field("hours.regular"));
  const trackContact = (kind: "phone" | "website") => {
    if (!decisionOrigin) void trackAnalyticsEvent({ eventName: kind === "phone" ? "spot_phone_clicked" : "spot_website_clicked", screenName: "spot_detail", entityType: "spot", entityId: spot.id, spotId: spot.id });
  };
  const contactActions: { key: string; label: string; value: string; icon: keyof typeof Feather.glyphMap; onPress: () => void }[] = [];
  const contactValues = canonicalWorldDetail
    ? contacts.filter((contact) => contact.knowledgeState !== "UNKNOWN" && typeof contact.value === "string" && contact.value.trim())
      .map((contact) => ({ key: contact.attributeKey, value: contact.value as string }))
    : [
      { key: "contact.website", value: spot.website },
      { key: "contact.phone", value: spot.phone },
      { key: "contact.public_email", value: spot.email },
    ].filter((contact): contact is { key: string; value: string } => typeof contact.value === "string" && Boolean(contact.value.trim()));
  for (const contact of contactValues) {
    const social = socialContacts[contact.key as keyof typeof socialContacts];
    const label = social?.label ?? spotProductLabel(contact.key);
    const icon: keyof typeof Feather.glyphMap = social?.icon ?? (contact.key === "contact.phone" ? "phone" : contact.key === "contact.public_email" ? "mail" : "globe");
    const onPress = () => {
      if (contact.key === "contact.phone") { trackContact("phone"); callNumber(contact.value); }
      else if (contact.key === "contact.public_email") void Linking.openURL(`mailto:${contact.value}`);
      else { if (contact.key === "contact.website") trackContact("website"); openWebsite(contact.value); }
    };
    contactActions.push({ key: contact.key, label, value: contact.value, icon, onPress });
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View
        pointerEvents="box-none"
        style={[styles.stickyNav, {
          paddingTop: insets.top + 8,
          backgroundColor: scrollY.interpolate({
            inputRange: [0, HEADER_H * 0.55],
            outputRange: ["rgba(8,8,9,0)", "rgba(8,8,9,0.97)"],
            extrapolate: "clamp",
          }),
        }]}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.topBarBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>

          <View style={styles.topBarActions}>
            <Pressable onPress={onShare} style={styles.topBarBtn} hitSlop={8}>
              <Feather name="share" size={18} color="#fff" />
            </Pressable>

            <Pressable
              onPress={async () => {
                if (!userId) {
                  setLoginPromptMessage("Melde dich an, um diesen Ort für später zu speichern.");
                  setShowLoginPrompt(true);
                  return;
                }
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
        </View>
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
            width: HERO_W,
            height: HEADER_H,
            marginTop: 0,
            marginHorizontal: 0,
            borderRadius: 0,
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
                  width: HERO_W * 2,
                  height: HEADER_MAX,
                  transform: [{ translateX }],
                }}
              >
                <SpotArtwork
                  imageUrl={photos[index.current]?.url}
                  priority="high"
                  showFallbackName={false}
                  spotId={String(spot.id)}
                  spotName={spot.name}
                  style={{ width: HERO_W, height: HEADER_MAX }}
                />
                <SpotArtwork
                  imageUrl={photos[(index.current + 1) % photos.length]?.url}
                  priority="high"
                  showFallbackName={false}
                  spotId={String(spot.id)}
                  spotName={spot.name}
                  style={{ width: HERO_W, height: HEADER_MAX }}
                />
              </Animated.View>
            ) : (
              <SpotArtwork
                imageUrl={selectSpotImageUrl({ headerPhotoPath: spot.header_photo_path })}
                priority="high"
                showFallbackName={false}
                spotId={String(spot.id)}
                spotName={spot.name}
                style={{ width: HERO_W, height: HEADER_MAX }}
              />
            )}

            <LinearGradient
              colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.12)", "rgba(0,0,0,0.62)", "rgba(0,0,0,0.90)"]}
              locations={[0, 0.45, 0.78, 1]}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroContent}>
              <View style={styles.heroPills}>
                <View style={[styles.statusPill, openingState === "open" ? styles.statusOpen : openingState === "openingSoon" ? styles.statusOpeningSoon : openingState === "closingSoon" ? styles.statusClosingSoon : openingUnknown ? styles.statusUnknown : styles.statusClosed]}>
                  <View style={[styles.statusDot, { backgroundColor: openingState === "open" ? theme.colors.greenSoft : openingState === "openingSoon" ? foundationTheme.color.warning : openingState === "closingSoon" ? foundationTheme.color.closingSoon : openingUnknown ? theme.colors.textSoft : theme.colors.danger }]} />
                  <Text style={[styles.statusText, { color: openingState === "open" ? theme.colors.greenSoft : openingState === "openingSoon" ? foundationTheme.color.warning : openingState === "closingSoon" ? foundationTheme.color.closingSoon : openingUnknown ? theme.colors.textSoft : "#FFB4B4" }]}>
                    {SPOT_OPENING_STATUS_COPY[openingStatus]}
                  </Text>
                </View>
                {!canonicalWorldDetail && spot.price_level ? <Chip text={priceToSymbols(spot.price_level)} /> : null}
              </View>

              <AppText adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={4} role="displayL" style={styles.heroTitle}>{spot.name}</AppText>
            </View>
          </Animated.View>
        </Animated.View>

        <View style={styles.content}>
          {addressLines.length ? <View style={styles.addressBlock}>
            <Feather name="map-pin" size={18} color={theme.colors.pink} style={styles.addressIcon} />
            <View style={styles.addressLines}>{addressLines.map((line, index) => (
              <Text key={`${index}:${line}`} style={index === 0 ? styles.addressStreet : styles.addressDetail}>{line}</Text>
            ))}</View>
          </View> : null}
          <View style={styles.quickActions}>
            <Pressable onPress={() => {
              if (!decisionOrigin) {
                void trackAnalyticsEvent({ eventName: "spot_route_clicked", screenName: "spot_detail", entityType: "spot", entityId: spot.id, spotId: spot.id });
                if (userId) void recordMemoryProductAction({ actionType: "navigation_intent", spotId: spot.id, entrySurface: "generic" });
              }
              openInAppleMaps(spot.lat, spot.lng, spot.name);
            }} style={styles.primaryAction}>
              <Feather name="navigation" size={17} color="#111113" />
              <Text style={styles.primaryActionText}>Route</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!userId) {
                  setLoginPromptMessage("Melde dich an, um deinen Moment an diesem Ort zu teilen.");
                  setShowLoginPrompt(true);
                  return;
                }
                if (!decisionOrigin) void trackAnalyticsEvent({ eventName: "spot_review_started", screenName: "spot_detail", entityType: "spot", entityId: spot.id, spotId: spot.id });
                void openMomentComposerSafely({ router, href: `/review/new?spotId=${spot.id}` });
              }}
              style={styles.secondaryAction}
            >
              <Feather name="plus" size={18} color={theme.colors.text} />
              <Text style={styles.secondaryActionText}>Moment</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}><SectionTitle>So fühlt es sich hier an</SectionTitle></View>
            {moodSummary.length > 0 ? <SpotMoodProfile moods={moodSummary} /> : <View style={styles.moodEmpty}>
              <Feather name="sun" size={22} color={theme.colors.textMuted} />
              <Text style={styles.moodEmptyTitle}>Noch keine Eindrücke</Text>
              <Text style={styles.moodEmptyCopy}>Teile nach deinem Besuch deinen Moment.</Text>
            </View>}
          </View>

          <SpotEssentials category={field("classification.primary_category")} placeType={field("classification.place_types")} price={field("operation.price_level")} />

          {contactActions.length > 0 ? <View style={styles.section}>
            <SectionTitle>Kontakt</SectionTitle>
            <View style={styles.contactGrid}>
              {contactActions.map((contact) => <ContactAction key={contact.key} icon={contact.icon} label={contact.label} value={contact.value} onPress={contact.onPress} />)}
            </View>
          </View> : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionTitle>Beschreibung</SectionTitle>
              {!canonicalWorldDetail && !!descriptionSourceLabel(descSource) ? (
                <View style={styles.sourcePill}>
                  <Text style={styles.sourceText}>{descriptionSourceLabel(descSource)}</Text>
                </View>
              ) : null}
            </View>
            {description ? (
              <>
                <Text numberOfLines={descriptionExpanded ? undefined : 2} style={styles.bodyText}>{description}</Text>
                {description.length > 65 ? (
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: descriptionExpanded }} onPress={() => setDescriptionExpanded((value) => !value)} style={styles.textAction}>
                    <Text style={styles.textActionLabel}>{descriptionExpanded ? "Weniger anzeigen" : "Mehr lesen"}</Text>
                    <Feather name={descriptionExpanded ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.pink} />
                  </Pressable>
                ) : null}
              </>
            ) : <Text style={styles.mutedText}>Für diesen Spot ist noch keine Beschreibung hinterlegt.</Text>}
          </View>

          {showHours ? (
            <View style={styles.detailLineGroup}>
              <Pressable accessibilityRole="button" accessibilityLabel="Alle Öffnungszeiten" accessibilityState={{ expanded: hoursExpanded }} onPress={() => setHoursExpanded((value) => !value)} style={styles.disclosureRow}>
                <Feather name="clock" size={19} color={theme.colors.textSoft} />
                <View style={styles.disclosureText}>
                  <Text style={styles.disclosureTitle}>Öffnungszeiten</Text>
                  <Text style={styles.disclosureSub}>{Object.keys(hours).length > 0 ? `${todayNameNormalized}: ${todaysHours.length > 0 ? todaysHours.map((slot) => slot.open_time && slot.close_time ? `${slot.open_time.slice(0, 5)}–${slot.close_time.slice(0, 5)}` : "Heute geschlossen").join(" · ") : openingUnknown ? "Nicht bekannt" : "Heute geschlossen"}` : "Noch nicht bekannt"}</Text>
                </View>
                <Feather name={hoursExpanded ? "chevron-up" : "chevron-right"} size={19} color={theme.colors.pink} />
              </Pressable>
              {hoursExpanded && Object.keys(hours).length === 0 ? <Text style={styles.hoursUncertainty}>Backyrd zeigt keinen Öffnungsstatus, solange keine verlässlichen Zeiten hinterlegt sind.</Text> : null}
              {hoursExpanded && Object.keys(hours).length > 0 ? <View style={styles.disclosureContent}>{WEEK_ORDER.map((day) => {
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
                                : "Geschlossen"}
                            </Text>
                          ))
                        ) : (
                          <Text style={styles.hoursTime}>Nicht bekannt</Text>
                        )}
                      </View>
                    </View>
                  );
                })}</View> : null}
            </View>
          ) : null}

          {specialHoursField ? <View style={styles.detailLineGroup}>
            <Pressable accessibilityRole="button" accessibilityLabel="Sonderöffnungszeiten" accessibilityState={{ expanded: specialHoursExpanded }} onPress={() => setSpecialHoursExpanded((value) => !value)} style={styles.disclosureRow}>
              <Feather name="calendar" size={19} color={theme.colors.textSoft} />
              <View style={styles.disclosureText}>
                <Text style={styles.disclosureTitle}>Sonderöffnungszeiten</Text>
                <Text style={styles.disclosureSub}>{specialHoursList.length ? `${specialHoursList[0].date}: ${specialHoursList[0].hours}${specialHoursList.length > 1 ? ` · +${specialHoursList.length - 1}` : ""}` : "Keine bestätigten Angaben"}</Text>
              </View>
              <Feather name={specialHoursExpanded ? "chevron-up" : "chevron-right"} size={19} color={theme.colors.pink} />
            </Pressable>
            {specialHoursExpanded ? <View style={styles.disclosureContent}>
              {specialHoursList.length ? specialHoursList.map((item) => (
                <View key={item.date} style={styles.specialHoursRow}>
                  <Text style={styles.factLabel}>{item.date}</Text>
                  <Text style={styles.factValue}>{item.hours}</Text>
                </View>
              )) : <Text style={styles.mutedText}>Noch keine bestätigten Sonderöffnungszeiten.</Text>}
            </View> : null}
          </View> : null}

          <View style={styles.moreInfoEntry}>
            <Pressable accessibilityRole="button" accessibilityLabel="Mehr Infos" onPress={() => setMoreInfoExpanded(true)} style={styles.moreInfoToggle}>
              <Text style={styles.moreInfoTitle}>Mehr Infos</Text>
              <Feather name="chevron-right" size={20} color={theme.colors.pink} />
            </Pressable>
            <Text style={styles.moreInfoSubtitle}>Ausstattung, Atmosphäre und weitere Details</Text>
          </View>

          <View style={styles.section}>
              <View style={styles.sectionHeader}><SectionTitle>Momente</SectionTitle>{presentableReviews.length > 3 ? <Text style={styles.previewMeta}>Aktuell</Text> : null}</View>
              {presentableReviews.length === 0 ? <Text style={styles.mutedText}>Hier wurden noch keine Momente geteilt.</Text> : null}
              {presentableReviews.slice(0, 3).map((rev) => {
                const moods = [
                  presentMoodToken(rev.moodA?.token ?? rev.mood_a),
                  presentMoodToken(rev.moodB?.token ?? rev.mood_b),
                ].filter((mood): mood is string => Boolean(mood));
                const name = rev.profiles?.first_name || "Mitglied";
                const isLocal = rev.profiles?.is_local;
                const publicReviewPhotoUrl = rev.photo_path
                  ? supabase.storage.from("spot-photos").getPublicUrl(rev.photo_path).data.publicUrl
                  : null;
                const reviewPhotoUrl =
                  rev.review_photos?.[0]?.url ||
                  (rev.photo_path?.startsWith("http")
                    ? rev.photo_path
                    : publicReviewPhotoUrl);

                return (
                  <View key={rev.id} style={[styles.reviewCard, !reviewPhotoUrl && !rev.text ? styles.reviewCardCompact : null]}>
                    <View style={styles.reviewHeader}>
                      <SharedAvatar name={name} size={40} />

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
              {presentableReviews.length > 3 ? <Text style={styles.momentsMore}>Weitere Momente findest du im Moments-Feed.</Text> : null}
          </View>

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
                        showFallbackName={false}
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
        </View>

        <View style={{ height: foundationTheme.control.tabBar + foundationTheme.spacing.xxl + insets.bottom }} />
      </Animated.ScrollView>

      <Modal animationType="slide" presentationStyle="fullScreen" visible={moreInfoExpanded} onRequestClose={() => setMoreInfoExpanded(false)}>
        <SafeAreaView style={styles.moreInfoScreen} edges={["top", "bottom"]}>
          <View style={styles.moreInfoHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Zurück zum Spot" onPress={() => setMoreInfoExpanded(false)} style={styles.moreInfoBack}>
              <Feather name="chevron-left" size={20} color={theme.colors.text} />
              <Text style={styles.moreInfoBackText}>Zurück zum Spot</Text>
            </Pressable>
            <Text style={styles.moreInfoPageTitle}>Mehr Infos</Text>
            <Text style={styles.moreInfoPageSubtitle}>Alle weiteren Angaben zu {spot.name} auf einen Blick.</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.moreInfoScroll, { paddingTop: 8, paddingBottom: 40 }]}>
            <View style={styles.moreInfoFacts}>
              {moreInfoFields.filter((detail) => ["context.typical_dayparts", "context.atmosphere", "amenity.features"].includes(detail.attributeKey)).map((detail) => <SpotFact key={`${detail.attributeKey}:${detail.scope}`} field={detail} />)}
              {moreInfoFields.some((detail) => detail.attributeKey.startsWith("accessibility.")) ? <View style={styles.accessibilityGroup}>
                <Text style={styles.accessibilityHeading}>Barrierefreiheit</Text>
                {moreInfoFields.filter((detail) => detail.attributeKey.startsWith("accessibility.")).map((detail) => <SpotFact key={`${detail.attributeKey}:${detail.scope}`} field={detail} />)}
              </View> : null}
              {moreInfoFields.filter((detail) => !detail.attributeKey.startsWith("accessibility.") && !["context.typical_dayparts", "context.atmosphere", "amenity.features"].includes(detail.attributeKey)).map((detail) => <SpotFact key={`${detail.attributeKey}:${detail.scope}`} field={detail} />)}
              {additionalFields.map((detail) => <SpotFact key={`${detail.attributeKey}:${detail.scope}`} field={detail} />)}
              {!canonicalWorldDetail ? <>
                <SpotTaxonomyDetails items={taxonomyItems} />
                {taxonomyItems.length ? <SpotTaxonomyChips items={taxonomyItems} /> : null}
              </> : null}
              {!hasMoreInfo ? <Text style={styles.mutedText}>Noch keine weiteren Angaben hinterlegt.</Text> : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <LoginPromptModal visible={showLoginPrompt} onClose={() => setShowLoginPrompt(false)} message={loginPromptMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  stickyNav: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: foundationTheme.layout.pageGutter,
    paddingBottom: 9,
  },
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
    left: foundationTheme.layout.pageGutter,
    right: foundationTheme.layout.pageGutter,
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
  statusOpeningSoon: {
    backgroundColor: "rgba(247,198,92,0.13)",
    borderColor: "rgba(247,198,92,0.30)",
  },
  statusClosingSoon: {
    backgroundColor: "rgba(255,155,94,0.13)",
    borderColor: "rgba(255,155,94,0.30)",
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
    color: foundationTheme.color.textPrimary,
    letterSpacing: -1,
  },
  content: {
    paddingHorizontal: foundationTheme.layout.pageGutter,
    paddingTop: 20,
  },
  addressBlock: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 5, marginBottom: 23 },
  addressIcon: { marginTop: 2 },
  addressLines: { flex: 1, gap: 4 },
  addressStreet: { color: theme.colors.text, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  addressDetail: { color: theme.colors.textSoft, fontSize: 14, lineHeight: 20 },
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
    backgroundColor: theme.colors.surface,
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
    marginBottom: 38,
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
    lineHeight: 28,
    letterSpacing: -0.5,
  },
  essentials: {
    marginBottom: 32,
    paddingTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  essentialsHeading: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: 18,
  },
  essentialsLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
  },
  essentialsDetails: {
    flexDirection: "row",
    paddingBottom: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  essentialsDetail: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.colors.border,
  },
  essentialsDetailValue: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  moodEmpty: {
    minHeight: 124,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  moodEmptyTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "700" },
  moodEmptyCopy: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center" },
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
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "400",
  },
  textAction: {
    minHeight: 44,
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  textActionLabel: {
    color: theme.colors.pink,
    fontSize: 14,
    fontWeight: "800",
  },
  contactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  contactAction: {
    width: "30%",
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  contactLabel: { color: theme.colors.textSoft, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  factRow: {
    paddingVertical: 19,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  factTokens: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  petDetails: { marginTop: 8, gap: 12 },
  petDetail: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  petLabel: { color: theme.colors.textSoft, fontSize: 14, lineHeight: 20 },
  petValue: { color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  factNote: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  currentState: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 8 },
  currentStateDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: theme.colors.pink },
  currentStateCopy: { flex: 1 },
  factToken: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(255,255,255,0.065)",
  },
  factTokenText: { color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  factLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  factValue: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  specialHoursRow: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  detailLineGroup: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  disclosureRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 14 },
  disclosureText: { flex: 1, gap: 4 },
  disclosureTitle: { color: theme.colors.text, fontSize: 15, lineHeight: 21, fontWeight: "700" },
  disclosureSub: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 },
  disclosureContent: { paddingLeft: 33, paddingBottom: 18 },
  hoursUncertainty: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, paddingLeft: 33, paddingBottom: 18 },
  moreInfoEntry: { marginBottom: 38, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  moreInfoToggle: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  moreInfoTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  moreInfoSubtitle: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 18, paddingBottom: 17 },
  moreInfoScreen: { flex: 1, backgroundColor: theme.colors.background },
  moreInfoHeader: { paddingHorizontal: 24, backgroundColor: theme.colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  moreInfoScroll: { paddingHorizontal: 24 },
  moreInfoBack: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  moreInfoBackText: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
  moreInfoPageTitle: { color: theme.colors.text, ...foundationTheme.typeScale.screenTitle, fontWeight: "700", marginTop: 20 },
  moreInfoPageSubtitle: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 5, marginBottom: 24 },
  moreInfoFacts: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  accessibilityGroup: { paddingTop: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  accessibilityHeading: { color: theme.colors.text, fontSize: 17, fontWeight: "700", marginBottom: 5 },
  ownerBlock: {
    marginTop: 8,
    marginBottom: 26,
  },
  ownerButton: {
    minHeight: 44,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    backgroundColor: "transparent",
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
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
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
  reviewCardCompact: {
    paddingVertical: 12,
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
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  previewMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  momentsMore: {
    marginTop: 12,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
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
    color: foundationTheme.color.textPrimary,
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
