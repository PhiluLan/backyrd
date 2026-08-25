// BACKYRD_DECISION_V135_UI_MARKER - guided/free-text UI
// mobile/app/(tabs)/decision.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  PanResponder,
  Linking,
  AppState,
  useWindowDimensions,
  type AppStateStatus,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Crypto from "expo-crypto";

import { supabase } from "@/lib/supabase";
import { getMyProductEntryStatus } from "@/lib/onboardingStatus";
import { mapTextToClusterIds } from "@/lib/decision/moodMapping";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { recordMemoryProductAction } from "@/lib/memory-bridge";
import { selectSpotImageUrl } from "@/lib/spot-images";
import { SpotArtwork } from "@/components/spot/SpotArtwork";
import { MarkerStroke } from "@/components/brand/Editorial";
import { AppText } from "@/components/foundation/AppText";

type DecisionSpotRpcRow = {
  spot_id: string;
  name: string;
  city: string | null;
  is_open_now: boolean | null;
  final_score: string | number | null;
  matched_tokens: string[] | null;
  matched_counts: number[] | null;
  matched_terms: string[] | null;
  why_this: string | null;
};

type EnrichedDecisionSpot = DecisionSpotRpcRow & {
  north_star_active?: boolean;
  address?: string | null;
  price_level?: number | null;
  category_id?: string | null;
  category_name?: string | null;
  description?: string | null;
  description_keywords?: string[];
  opening_hours_summary?: string | null;
  header_photo_path?: string | null;
  photo_url?: string | null;
  lat?: number | null;
  lng?: number | null;
  human_reason?: string | null;
  technical_why_this?: string | null;
  v13_sources?: ("personalized_v12" | "semantic_v13")[];
  v13_rank?: number | null;
  v13_combined_score?: number | null;
  v13_semantic_rank?: number | null;
  v13_semantic_similarity?: number | null;
  v13_v12_rank?: number | null;
  v13_v12_score?: number | null;
  v13_document_preview?: string | null;
  reviews?: {
    text: string | null;
    mood_a: string | null;
    mood_b: string | null;
  }[];
};

type DecisionContext = {
  decision_mode: "orientation" | "weak_personalized" | "strong_personalized" | "fallback";
  title: string;
  body: string;
  weekday_name: string;
  time_bucket: string;
  user_confidence: number;
  is_fallback: boolean;
};

type DecisionCopyItem = {
  spot_id: string;
  headline: string;
  subtitle: string;
  why: string;
  cta_label: string;
};

type DecisionCopyResponse = {
  title: string;
  body: string;
  items: DecisionCopyItem[];
  source: "v13";
};

type DecisionV13Candidate = {
  rank: number;
  spot_id: string;
  name: string;
  city: string | null;
  category_name: string | null;
  is_open_now: boolean | null;
  combined_score: number;
  sources: ("personalized_v12" | "semantic_v13")[];
  v12_rank: number | null;
  v12_score: number;
  semantic_rank: number | null;
  semantic_similarity: number;
  matched_tokens: string[];
  matched_terms: string[];
  human_reason: string;
  technical_why_this: string | null;
  document_preview: string | null;
};

type DecisionV13Response = {
  ok: boolean;
  model?: string;
  version?: string;
  mode?: "personalized_semantic" | "semantic_only_no_user_token";
  warning?: string | null;
  city?: string | null;
  moodA?: string | null;
  moodB?: string | null;
  query?: string | null;
  queryText?: string;
  intent?: Record<string, boolean>;
  counts?: {
    v12: number;
    semantic: number;
    fused: number;
  };
  candidates?: DecisionV13Candidate[];
  north_star?: {
    active?: boolean;
    decision_id?: string;
    knowledge_mode?: "SUFFICIENT" | "PARTIAL" | "LOW_OR_UNKNOWN";
    personalization_active?: boolean;
  };
  continuation?: {
    decision_id: string;
    page: number;
    request_id: string | null;
    exhausted: boolean;
    remaining_count: number;
  };
  error?: string;
};

type DecisionStatus = "idle" | "checking" | "deciding" | "writing" | "success" | "empty" | "error";
type DecisionCardAction = "next" | "like" | "dislike";


type DecisionInputMode = "guided" | "free";
type DecisionCitySource = "empty" | "profile" | "manual";

type DirectionOption = {
  key: string;
  label: string;
  emoji: string;
  placeTypes: string[];
  queryHint: string;
};

type AudienceOption = {
  key: string;
  label: string;
  emoji: string;
  placeTypes: string[];
  queryHint: string;
};

type MoodOption = {
  key: string;
  label: string;
  queryHint: string;
};

const VISIBLE_EXPOSURE_MINIMUM_MS = 750;

const theme = {
  bg: "#050506",
  card: "rgba(255,255,255,0.065)",
  border: "rgba(255,255,255,0.13)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.66)",
  subtle: "rgba(255,255,255,0.46)",
  cream: "#F4EBDD",
  pink: "#FF4F91",
  pinkSoft: "#FFC5DA",
  pinkMuted: "#FF4F91",
  acid: "#D8FF3E",
  ink: "#111111",
  green: "#78A045",
  red: "#E95050",
};

const VISIBLE_DECISION_LIMIT = 10;
const DECISION_V13_FUNCTION = "decision-v13";
const DECISION_V13_LIMIT = 16;
const DECISION_V13_V12_LIMIT = 16;
const DECISION_V13_SEMANTIC_LIMIT = 24;

const DIRECTION_OPTIONS: DirectionOption[] = [
  { key: "restaurant", label: "Essen", emoji: "🍽", placeTypes: ["restaurant"], queryHint: "Restaurant, Essen, Lunch oder Dinner" },
  { key: "cafe", label: "Café", emoji: "☕️", placeTypes: ["cafe"], queryHint: "Café, Kaffee, gemütlich sitzen" },
  { key: "bar", label: "Drinks", emoji: "🍸", placeTypes: ["bar"], queryHint: "Bar, Drinks, Cocktails oder Wein" },
  { key: "culture", label: "Kultur", emoji: "🎨", placeTypes: ["culture"], queryHint: "Museum, Kunst, Galerie oder Kultur" },
  { key: "activity", label: "Aktivität", emoji: "🎯", placeTypes: ["activity", "experience"], queryHint: "Aktivität, Erlebnis, etwas unternehmen" },
  { key: "outing", label: "Ausflug", emoji: "🌿", placeTypes: ["outing", "experience"], queryHint: "Ausflug, rausgehen, entdecken" },
];

const AUDIENCE_OPTIONS: AudienceOption[] = [
  { key: "kids", label: "Mit Kind", emoji: "👨‍👧", placeTypes: ["activity", "culture", "outing", "experience", "cafe"], queryHint: "kinderfreundlich, mit Kind, Familie" },
  { key: "date", label: "Date", emoji: "♡", placeTypes: ["restaurant", "bar", "cafe", "culture"], queryHint: "Date, romantisch, persönlich" },
  { key: "friends", label: "Freunde", emoji: "☺︎", placeTypes: ["bar", "restaurant", "activity", "cafe"], queryHint: "mit Freunden, Gruppe, locker" },
  { key: "solo", label: "Allein", emoji: "◌", placeTypes: ["cafe", "culture", "outing"], queryHint: "alleine, solo, me time" },
];

const MOOD_OPTIONS: MoodOption[] = [
  { key: "cozy", label: "Cozy", queryHint: "cozy gemütlich warm" },
  { key: "quiet", label: "Ruhig", queryHint: "ruhig nicht laut entspannt" },
  { key: "inspiring", label: "Inspirierend", queryHint: "inspirierend kreativ besonders" },
  { key: "urban", label: "Urban", queryHint: "urban städtisch modern" },
  { key: "chic", label: "Chic", queryHint: "chic stilvoll schön" },
  { key: "lively", label: "Lebhaft", queryHint: "lebhaft energie gute stimmung" },
];

function clean(s: string | null | undefined) {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function limitSentences(value: string | null | undefined, maxSentences = 3) {
  const text = clean(value);
  if (!text) return "";

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!sentences) return text;

  return sentences
    .slice(0, maxSentences)
    .map((sentence) => sentence.trim())
    .join(" ");
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}


function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function optionLabels(options: { key: string; label: string }[], keys: string[]) {
  return keys
    .map((key) => options.find((option) => option.key === key)?.label)
    .filter(Boolean)
    .join(" + ");
}

function selectedPlaceTypesFromKeys(directionKeys: string[], audienceKeys: string[]) {
  const fromDirection = directionKeys.flatMap(
    (key) => DIRECTION_OPTIONS.find((option) => option.key === key)?.placeTypes ?? []
  );

  const fromAudience = audienceKeys.flatMap(
    (key) => AUDIENCE_OPTIONS.find((option) => option.key === key)?.placeTypes ?? []
  );

  return uniq([...fromDirection, ...fromAudience]);
}

function selectedQueryHints(directionKeys: string[], audienceKeys: string[], moodKeys: string[]) {
  const directionHints = directionKeys.flatMap(
    (key) => DIRECTION_OPTIONS.find((option) => option.key === key)?.queryHint ?? []
  );

  const audienceHints = audienceKeys.flatMap(
    (key) => AUDIENCE_OPTIONS.find((option) => option.key === key)?.queryHint ?? []
  );

  const moodHints = moodKeys.flatMap(
    (key) => MOOD_OPTIONS.find((option) => option.key === key)?.queryHint ?? []
  );

  return uniq([...directionHints, ...audienceHints, ...moodHints]);
}

function pickDecisionBatch({
  rows,
  alreadySeenIds,
  limit = VISIBLE_DECISION_LIMIT,
}: {
  rows: DecisionSpotRpcRow[];
  alreadySeenIds: string[];
  limit?: number;
}) {
  const seen = new Set(alreadySeenIds);
  const fresh = rows.filter((row) => row?.spot_id && !seen.has(row.spot_id));
  const picked = fresh.slice(0, limit);

  const deduped: DecisionSpotRpcRow[] = [];
  const used = new Set<string>();

  for (const row of picked) {
    if (!row?.spot_id || used.has(row.spot_id)) continue;
    used.add(row.spot_id);
    deduped.push(row);
  }

  return deduped.slice(0, limit);
}

function normalizeDayOfWeek(value?: string | null) {
  const raw = clean(value).toLowerCase();

  const map: Record<string, string> = {
    monday: "monday",
    mon: "monday",
    mo: "monday",
    montag: "monday",
    tuesday: "tuesday",
    tue: "tuesday",
    di: "tuesday",
    dienstag: "tuesday",
    wednesday: "wednesday",
    wed: "wednesday",
    mi: "wednesday",
    mittwoch: "wednesday",
    thursday: "thursday",
    thu: "thursday",
    do: "thursday",
    donnerstag: "thursday",
    friday: "friday",
    fri: "friday",
    fr: "friday",
    freitag: "friday",
    saturday: "saturday",
    sat: "saturday",
    sa: "saturday",
    samstag: "saturday",
    sunday: "sunday",
    sun: "sunday",
    so: "sunday",
    sonntag: "sunday",
  };

  return map[raw] ?? raw;
}

function dayLabel(value?: string | null) {
  const day = normalizeDayOfWeek(value);

  const map: Record<string, string> = {
    monday: "Mo",
    tuesday: "Di",
    wednesday: "Mi",
    thursday: "Do",
    friday: "Fr",
    saturday: "Sa",
    sunday: "So",
  };

  return map[day] ?? clean(value);
}

function todayZurichDay() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Europe/Zurich",
  })
    .format(new Date())
    .toLowerCase();
}

function formatTime(value?: string | null) {
  const raw = clean(value);
  if (!raw) return "";

  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function buildOpeningHoursSummary(
  rows: {
    day_of_week: string | null;
    open_time: string | null;
    close_time: string | null;
    idx?: number | null;
  }[]
) {
  if (!rows.length) return null;

  const today = todayZurichDay();

  const cleanRows = rows
    .map((row) => ({
      ...row,
      normalizedDay: normalizeDayOfWeek(row.day_of_week),
      label: dayLabel(row.day_of_week),
      open: formatTime(row.open_time),
      close: formatTime(row.close_time),
      idx: typeof row.idx === "number" ? row.idx : 999,
    }))
    .filter((row) => row.normalizedDay && row.open && row.close)
    .sort((a, b) => a.idx - b.idx);

  if (!cleanRows.length) return null;

  const todayRows = cleanRows.filter((row) => row.normalizedDay === today);

  if (todayRows.length > 0) {
    return `Heute ${todayRows.map((row) => `${row.open}–${row.close}`).join(", ")}`;
  }

  const preview = cleanRows.slice(0, 2).map((row) => `${row.label} ${row.open}–${row.close}`);
  return `Öffnungszeiten: ${preview.join(", ")}`;
}

function buildDecisionV13Query({
  city,
  moodA,
  moodB,
  freeText,
  directionKeys,
  audienceKeys,
  moodKeys,
}: {
  city: string;
  moodA: string;
  moodB: string;
  freeText?: string | null;
  directionKeys: string[];
  audienceKeys: string[];
  moodKeys: string[];
}) {
  const c = clean(city) || "deiner Stadt";
  const a = clean(moodA);
  const b = clean(moodB);
  const free = clean(freeText);
  const directionLabel = optionLabels(DIRECTION_OPTIONS, directionKeys);
  const audienceLabel = optionLabels(AUDIENCE_OPTIONS, audienceKeys);
  const moodLabel = optionLabels(MOOD_OPTIONS, moodKeys);
  const moodText = [a, b, moodLabel].filter(Boolean).join(" + ");
  const hintText = selectedQueryHints(directionKeys, audienceKeys, moodKeys).join(", ");

  if (free) {
    return [
      free,
      `Ort in ${c}`,
      directionLabel ? `Gewünschte Richtung: ${directionLabel}` : null,
      audienceLabel ? `Situation: ${audienceLabel}` : null,
      moodText ? `Stimmung: ${moodText}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    directionLabel ? `Richtung: ${directionLabel}` : null,
    audienceLabel ? `Situation: ${audienceLabel}` : null,
    moodText ? `Stimmung: ${moodText}` : null,
    hintText || null,
    `Ort in ${c}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function mapV13CandidateToDecisionRow(candidate: DecisionV13Candidate): DecisionSpotRpcRow & Partial<EnrichedDecisionSpot> {
  return {
    spot_id: candidate.spot_id,
    name: candidate.name,
    city: candidate.city,
    is_open_now: candidate.is_open_now,
    final_score: candidate.combined_score,
    matched_tokens: Array.isArray(candidate.matched_tokens) ? candidate.matched_tokens : [],
    matched_counts: [],
    matched_terms: Array.isArray(candidate.matched_terms) ? candidate.matched_terms : [],
    why_this: candidate.human_reason || candidate.technical_why_this || null,
    human_reason: candidate.human_reason ?? null,
    technical_why_this: candidate.technical_why_this ?? null,
    category_name: candidate.category_name ?? null,
    v13_sources: Array.isArray(candidate.sources) ? candidate.sources : [],
    v13_rank: candidate.rank ?? null,
    v13_combined_score: candidate.combined_score ?? null,
    v13_semantic_rank: candidate.semantic_rank ?? null,
    v13_semantic_similarity: candidate.semantic_similarity ?? null,
    v13_v12_rank: candidate.v12_rank ?? null,
    v13_v12_score: candidate.v12_score ?? null,
    v13_document_preview: candidate.document_preview ?? null,
  };
}

function buildV13Copy({
  spots,
  city,
  moodA,
  moodB,
  ctx,
  response,
}: {
  spots: EnrichedDecisionSpot[];
  city: string;
  moodA: string;
  moodB: string;
  ctx: DecisionContext | null;
  response: DecisionV13Response | null;
}): DecisionCopyResponse {
  const personalized = response?.north_star?.personalization_active === true;

  return {
    source: "v13",
    title: "Das passt zu deinem Moment",
    body: personalized
      ? "Backyrd berücksichtigt hier deinen aktuellen Wunsch und freigegebene persönliche Signale."
      : "Backyrd ordnet diese Orte nach deinem aktuellen Wunsch.",
    items: spots.map((spot, index) => ({
      spot_id: spot.spot_id,
      headline: index === 0 ? "Passt besonders gut zu diesem Moment" : "Weitere passende Option",
      subtitle:
        spot.category_name && spot.city
          ? `${spot.category_name} · ${spot.city}`
          : spot.category_name || spot.city || "Sichere Basisdaten verfügbar",
      why: limitSentences(
        spot.human_reason ||
          spot.why_this ||
          "Zu diesem Ort kennt Backyrd bisher nur die sicheren Basisdaten.",
        3
      ),
      cta_label: "Mehr entdecken",
    })),
  };
}

function getCopyForSpot(
  copy: DecisionCopyResponse | null,
  spot: EnrichedDecisionSpot,
  index: number,
  moodA: string,
  moodB: string
) {
  const item = copy?.items?.find((entry) => entry.spot_id === spot.spot_id);

  return {
    headline: item?.headline || "Passt zu deinem Moment",
    subtitle: item?.subtitle || spot.category_name || spot.city || "Sichere Basisdaten verfügbar",
    why:
      item?.why ||
      spot.human_reason ||
      spot.why_this ||
      "Zu diesem Ort kennt Backyrd bisher nur die sicheren Basisdaten.",
    ctaLabel: "Mehr entdecken",
  };
}

export default function DecisionScreen() {
  const router = useRouter();
  const homeParams = useLocalSearchParams<{ query?: string; city?: string; auto?: string }>();
  const homeAutoRunRef = useRef<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [city, setCity] = useState("");
  const [citySource, setCitySource] = useState<DecisionCitySource>("empty");
  const [inputMode, setInputMode] = useState<DecisionInputMode>("guided");
  const [freeTextQuery, setFreeTextQuery] = useState("");
  const [selectedDirections, setSelectedDirections] = useState<string[]>([]);
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [moodA, setMoodA] = useState("");
  const [moodB, setMoodB] = useState("");

  const [context, setContext] = useState<DecisionContext | null>(null);
  const [spots, setSpots] = useState<EnrichedDecisionSpot[]>([]);
  const [copy, setCopy] = useState<DecisionCopyResponse | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [decisionRunContext, setDecisionRunContext] = useState<Record<string, unknown> | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [seenSpotIds, setSeenSpotIds] = useState<string[]>([]);
  const [remixCount, setRemixCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleExposureReady, setVisibleExposureReady] = useState(false);
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(AppState.currentState);
  const [continuationExhausted, setContinuationExhausted] = useState(false);
  const [continuationLoading, setContinuationLoading] = useState(false);
  const [deckMode, setDeckMode] = useState(false);

  const [status, setStatus] = useState<DecisionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onboardingPushInFlightRef = useRef(false);
  const continuationInFlightRef = useRef(false);
  const continuationRequestIdRef = useRef<string | null>(null);
  const visibleExposureKeysRef = useRef(new Set<string>());
  const cardActionInFlightRef = useRef(false);

  const loading = status === "checking" || status === "deciding" || status === "writing";
  const currentSpot = spots[activeIndex] ?? null;
  const hasResults = spots.length > 0;
  const finishedDeck = hasResults && activeIndex >= spots.length;

  const selectedPlaceTypes = useMemo(() => {
    return selectedPlaceTypesFromKeys(selectedDirections, selectedAudiences);
  }, [selectedDirections, selectedAudiences]);

  const guidedMoodText = useMemo(() => {
    return selectedQueryHints([], [], selectedMoods).join(" ");
  }, [selectedMoods]);

  const mappedMoods = useMemo(() => {
    return mapTextToClusterIds([moodA, guidedMoodText].filter(Boolean).join(" "), moodB);
  }, [moodA, moodB, guidedMoodText]);

  const canRun = useMemo(() => {
    if (clean(city).length <= 1) return false;

    if (inputMode === "free") {
      return clean(freeTextQuery).length >= 3;
    }

    return (
      selectedDirections.length > 0 ||
      selectedAudiences.length > 0 ||
      selectedMoods.length > 0 ||
      clean(moodA).length > 0 ||
      clean(moodB).length > 0
    );
  }, [city, inputMode, freeTextQuery, selectedDirections.length, selectedAudiences.length, selectedMoods.length, moodA, moodB]);

  useEffect(() => {
    const loadUserAndProfileCity = async (nextUserId?: string | null) => {
      const resolvedUserId = nextUserId ?? null;
      setUserId(resolvedUserId);

      if (!resolvedUserId) return;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("city")
        .eq("id", resolvedUserId)
        .maybeSingle();

      const profileCity = clean(profileRow?.city);

      if (profileCity) {
        setCity((current) => {
          if (clean(current)) return current;
          setCitySource("profile");
          return profileCity;
        });
      }
    };

    supabase.auth.getUser().then(({ data }) => {
      void loadUserAndProfileCity(data.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadUserAndProfileCity(session?.user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(()=>{
    const subscription=AppState.addEventListener("change",setAppStateStatus);
    return()=>subscription.remove();
  },[]);

  useEffect(() => {
    router.setParams({
      hideTabs: deckMode ? "1" : "",
    });

    return () => {
      router.setParams({
        hideTabs: "",
      });
    };
  }, [router, deckMode]);

  const checkNeedsDecisionOnboarding = useCallback(async (): Promise<boolean> => {
    try {
      const status = await getMyProductEntryStatus();
      return status.needsDecisionOnboarding;
    } catch (error) {
      console.log("Decision onboarding check failed:", error);
      return false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function run() {
        if (onboardingPushInFlightRef.current) return;

        const { data } = await supabase.auth.getUser();
        if (!data.user?.id) return;

        const needs = await checkNeedsDecisionOnboarding();
        if (cancelled) return;

        if (needs) {
          onboardingPushInFlightRef.current = true;
          router.push("/(tabs)/decision-onboarding");

          setTimeout(() => {
            onboardingPushInFlightRef.current = false;
          }, 800);
        }
      }

      run();

      return () => {
        cancelled = true;
      };
    }, [router, checkNeedsDecisionOnboarding])
  );

  const enrichSpots = useCallback(async (rows: DecisionSpotRpcRow[]) => {
    const ids = rows.map((row) => row.spot_id).filter(Boolean);

    if (!ids.length) return [];

    const [
      { data: spotDetails, error: spotDetailsError },
      { data: photos, error: photosError },
      { data: reviews, error: reviewsError },
      { data: effectiveContent, error: effectiveContentError },
      { data: hours, error: hoursError },
    ] = await Promise.all([
      supabase.from("spots").select("id,address,price_level,category_id,header_photo_path,lat,lng").in("id", ids),

      supabase
        .from("spot_photos")
        .select("spot_id,url,created_at")
        .in("spot_id", ids)
        .order("created_at", { ascending: true }),

      supabase
        .from("reviews")
        .select("spot_id,text,mood_a,mood_b,created_at")
        .in("spot_id", ids)
        .not("text", "is", null)
        .order("created_at", { ascending: false })
        .limit(30),

      supabase
        .from("spot_effective_content_v1")
        .select("spot_id,effective_description,effective_keywords")
        .in("spot_id", ids),

      supabase
        .from("spot_hours")
        .select("spot_id,day_of_week,open_time,close_time,idx")
        .in("spot_id", ids)
        .order("idx", { ascending: true }),
    ]);

    if (spotDetailsError) console.log("Decision spot details enrich failed:", spotDetailsError);
    if (photosError) console.log("Decision spot photos enrich failed:", photosError);
    if (reviewsError) console.log("Decision reviews enrich failed:", reviewsError);
    if (effectiveContentError) console.log("Decision effective content enrich failed:", effectiveContentError);
    if (hoursError) console.log("Decision hours enrich failed:", hoursError);

    const categoryIds = Array.from(
      new Set((spotDetails ?? []).map((detail: any) => detail.category_id).filter(Boolean))
    );

    let categories: { id: string; name: string | null }[] = [];

    if (categoryIds.length > 0) {
      const { data: categoryRows, error: categoryError } = await supabase
        .from("categories")
        .select("id,name")
        .in("id", categoryIds);

      if (categoryError) {
        console.log("Decision categories enrich failed:", categoryError);
      } else {
        categories = categoryRows ?? [];
      }
    }

    const detailById = new Map<string, any>();
    for (const detail of spotDetails ?? []) {
      detailById.set(detail.id, detail);
    }

    const categoryById = new Map<string, string>();
    for (const category of categories) {
      if (category.id && category.name) {
        categoryById.set(category.id, category.name);
      }
    }

    const firstPhotoBySpotId = new Map<string, string>();
    for (const photo of photos ?? []) {
      if (!firstPhotoBySpotId.has(photo.spot_id) && photo.url) {
        firstPhotoBySpotId.set(photo.spot_id, photo.url);
      }
    }

    const contentBySpotId = new Map<
      string,
      {
        effective_description: string | null;
        effective_keywords: string[] | null;
      }
    >();

    for (const content of effectiveContent ?? []) {
      contentBySpotId.set(content.spot_id, {
        effective_description: content.effective_description ?? null,
        effective_keywords: Array.isArray(content.effective_keywords) ? content.effective_keywords.filter(Boolean) : null,
      });
    }

    const hoursBySpotId = new Map<
      string,
      {
        day_of_week: string | null;
        open_time: string | null;
        close_time: string | null;
        idx?: number | null;
      }[]
    >();

    for (const hour of hours ?? []) {
      const current = hoursBySpotId.get(hour.spot_id) ?? [];

      current.push({
        day_of_week: hour.day_of_week ?? null,
        open_time: hour.open_time ?? null,
        close_time: hour.close_time ?? null,
        idx: hour.idx ?? null,
      });

      hoursBySpotId.set(hour.spot_id, current);
    }

    const reviewsBySpotId = new Map<
      string,
      {
        text: string | null;
        mood_a: string | null;
        mood_b: string | null;
      }[]
    >();

    for (const review of reviews ?? []) {
      const current = reviewsBySpotId.get(review.spot_id) ?? [];

      if (current.length < 3) {
        current.push({
          text: review.text ?? null,
          mood_a: review.mood_a ?? null,
          mood_b: review.mood_b ?? null,
        });

        reviewsBySpotId.set(review.spot_id, current);
      }
    }

    return rows.map((row) => {
      const detail = detailById.get(row.spot_id);
      const content = contentBySpotId.get(row.spot_id);
      const photoUrl = firstPhotoBySpotId.get(row.spot_id);
      const headerUrl = detail?.header_photo_path;
      const categoryName = detail?.category_id ? categoryById.get(detail.category_id) ?? null : null;
      const descriptionKeywords = content?.effective_keywords ?? [];

      return {
        ...row,
        address: detail?.address ?? null,
        price_level: detail?.price_level ?? null,
        category_id: detail?.category_id ?? null,
        category_name: categoryName ?? (row as any).category_name ?? null,
        description: content?.effective_description ?? null,
        description_keywords: descriptionKeywords,
        opening_hours_summary: buildOpeningHoursSummary(hoursBySpotId.get(row.spot_id) ?? []),
        header_photo_path: headerUrl ?? null,
        photo_url: selectSpotImageUrl({ photoUrl, headerPhotoPath: headerUrl }),
        lat: Number.isFinite(Number(detail?.lat)) ? Number(detail?.lat) : null,
        lng: Number.isFinite(Number(detail?.lng)) ? Number(detail?.lng) : null,
        matched_terms: uniq([...(row.matched_terms ?? []), ...descriptionKeywords]).slice(0, 10),
        reviews: reviewsBySpotId.get(row.spot_id) ?? [],
      };
    });
  }, []);

  const logExplicitFeedback = useCallback(async (spot: EnrichedDecisionSpot, action: "like"|"dislike") => {
    if (!decisionId || !visibleExposureReady) return false;
    const { error } = await supabase.rpc("log_decision_action_v1", {
      p_decision_id:decisionId,p_spot_id:spot.spot_id,
      p_action:action === "like" ? "exact_mood" : "not_there",
    });
    if (error) {
      console.log("canonical Decision feedback failed", error);
      Alert.alert("Feedback nicht gespeichert", "Versuch es bitte noch einmal.");
      return false;
    }
    return true;
  },[decisionId,visibleExposureReady]);

  const advanceCard = useCallback(
    async (action: DecisionCardAction) => {
      if (cardActionInFlightRef.current) return;
      const spot = spots[activeIndex];
      if (!spot) return;
      cardActionInFlightRef.current = true;

      if (action !== "next" && !(await logExplicitFeedback(spot, action))) {
        cardActionInFlightRef.current = false;
        return;
      }

      void trackAnalyticsEvent({
        eventName: action === "next" ? "decision_next" : action === "like" ? "decision_like" : "decision_dislike",
        screenName: "decision",
        entityType: "spot",
        entityId: spot.spot_id,
        spotId: spot.spot_id,
        decisionId,
        properties: { rank: activeIndex + 1 },
      });
      setVisibleExposureReady(false);
      setActiveIndex((current) => Math.min(current + 1, spots.length));
    },
    [activeIndex, decisionId, spots, logExplicitFeedback]
  );

  const runDecision = useCallback(
    async (options?: { remix?: boolean }) => {
      const isRemix = Boolean(options?.remix);
      if (isRemix && (continuationInFlightRef.current || continuationExhausted)) return;
      if (isRemix && !decisionId) {
        Alert.alert("Nicht mehr verfügbar", "Bitte starte diese Suche noch einmal.");
        return;
      }
      void trackAnalyticsEvent({
        eventName: options?.remix ? "decision_remixed" : "decision_started",
        screenName: "decision",
        properties: { input_mode: inputMode },
      });

      if (!userId) {
        Alert.alert("Login nötig", "Bitte logge dich ein, damit Decision deinen Geschmack lernen kann.");
        router.push("/auth/login");
        return;
      }

      if (!canRun) {
        Alert.alert(
          "Fehlt noch was",
          inputMode === "free"
            ? "Bitte gib Stadt und eine kurze freie Suche ein."
            : "Bitte wähle eine Richtung, Situation oder Stimmung."
        );
        return;
      }

      if (isRemix) {
        continuationInFlightRef.current = true;
        setContinuationLoading(true);
        continuationRequestIdRef.current ??= Crypto.randomUUID();
      }

      const c = clean(city);
      const a = clean(moodA);
      const b = clean(moodB);
      const activeFreeText = inputMode === "free" ? clean(freeTextQuery) : null;
      const decisionQuery = buildDecisionV13Query({
        city: c,
        moodA: a,
        moodB: b,
        freeText: activeFreeText,
        directionKeys: selectedDirections,
        audienceKeys: selectedAudiences,
        moodKeys: selectedMoods,
      });

      try {
        setErrorMessage(null);
        if (!isRemix) {
          setStatus("checking");
          setSpots([]);
          setContext(null);
          setCopy(null);
          setDecisionId(null);
          setDecisionRunContext(null);
          setActiveIndex(0);
          setSeenSpotIds([]);
          setRemixCount(0);
          setCurrentPage(1);
          cardActionInFlightRef.current = false;
          setVisibleExposureReady(false);
          visibleExposureKeysRef.current.clear();
          setContinuationExhausted(false);
          continuationRequestIdRef.current=null;

          const needsOnboarding = await checkNeedsDecisionOnboarding();
          if (needsOnboarding) {
            setStatus("idle");
            router.push("/(tabs)/decision-onboarding");
            return;
          }
          setStatus("deciding");
        }
        const ctx = isRemix && context ? context : null;
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          Alert.alert("Session abgelaufen", "Bitte logge dich nochmal ein.");
          setStatus("idle");
          router.push("/auth/login");
          return;
        }

        const { data, error } = await supabase.functions.invoke<DecisionV13Response>(DECISION_V13_FUNCTION, {
          body: isRemix ? {
            continuationDecisionId: decisionId,
            continuationRequestId: continuationRequestIdRef.current,
          } : {
            city: c,
            moodA: a || null,
            moodB: b || null,
            query: decisionQuery,
            preferredPlaceTypes: selectedPlaceTypes,
            audience: selectedAudiences,
            strictCategoryIntent: selectedPlaceTypes.length > 0,
            inputMode,
            rawFreeText: activeFreeText,
            limit: DECISION_V13_LIMIT,
            v12Limit: DECISION_V13_V12_LIMIT,
            semanticLimit: DECISION_V13_SEMANTIC_LIMIT,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (error) throw error;

        if (!data?.ok) {
          throw new Error(data?.error || "Decision V13 konnte nicht geladen werden.");
        }

        if (data.north_star?.active !== true) {
          throw new Error("Die aktuelle Decision-Architektur ist gerade nicht verfügbar. Bitte versuche es erneut.");
        }

        const serverDecisionId =
          data.north_star?.decision_id ?? data.continuation?.decision_id ?? null;
        if (!serverDecisionId) {
          throw new Error("Die Decision konnte nicht sicher fortgesetzt werden. Bitte starte die Suche erneut.");
        }

        const runContext: Record<string, unknown> = isRemix && decisionRunContext ? {
          ...decisionRunContext,
          continuation_page: data.continuation?.page ?? remixCount + 2,
          continuation_request_id: data.continuation?.request_id ?? continuationRequestIdRef.current,
        } : {
          model: data.model ?? "backyrd_decision_v13_orchestrator",
          model_version: data.version ?? null,
          decision_mode: data.mode ?? null,
          query: data.query ?? decisionQuery,
          query_text: data.queryText ?? null,
          intent: data.intent ?? null,
          counts: data.counts ?? null,

          inputMode,
          rawFreeText: activeFreeText,
          preferredPlaceTypes: selectedPlaceTypes,
          audience: selectedAudiences,
          selectedDirections,
          selectedAudiences,
          selectedMoods,
        };

        const candidates = Array.isArray(data.candidates) ? data.candidates : [];
        const northStarActive = data.north_star?.active === true;
        const v13Rows = candidates
          .map((candidate) => ({ ...mapV13CandidateToDecisionRow(candidate), north_star_active: northStarActive }))
          .filter((row) => row?.spot_id);

        const pickedRows = pickDecisionBatch({
          rows: v13Rows,
          alreadySeenIds: isRemix ? seenSpotIds : [],
          limit: VISIBLE_DECISION_LIMIT,
        });

        const enriched = await enrichSpots(pickedRows);

        if (enriched.length === 0) {
          if(isRemix){
            setContinuationExhausted(true);
            continuationRequestIdRef.current=null;
          }else{
            setSpots([]);
            setContext(ctx);
            setStatus("empty");
            setDeckMode(false);
          }
          return;
        }

        const newSeenIds = Array.from(
          new Set([...(isRemix ? seenSpotIds : []), ...enriched.map((spot) => spot.spot_id)])
        );

        setSeenSpotIds(newSeenIds);

        if (isRemix) {
          setRemixCount((current) => current + 1);
        }

        if(!isRemix)setStatus("writing");

        const generatedCopy = buildV13Copy({
          spots: enriched,
          city: c,
          moodA: a,
          moodB: b,
          ctx,
          response: data,
        });

        setSpots(enriched);
        setActiveIndex(0);
        setCurrentPage(data.continuation?.page ?? (isRemix ? remixCount+2 : 1));
        setVisibleExposureReady(false);
        setContext({
          decision_mode: "orientation",
          weekday_name: "",
          time_bucket: "",
          user_confidence: 0,
          is_fallback: false,
          title: generatedCopy.title,
          body: generatedCopy.body,
        });
        setCopy(generatedCopy);
        setDecisionRunContext(runContext);

        if (!isRemix) setDecisionId(serverDecisionId);

        setContinuationExhausted(data.continuation?.exhausted===true);
        continuationRequestIdRef.current=null;
        setStatus("success");
        setDeckMode(true);
      } catch (error: any) {
        console.log("decision error", error);
        setErrorMessage(error?.message ?? "Decision konnte nicht geladen werden.");
        if(!isRemix){
          setStatus("error");
          setDeckMode(false);
        }
        Alert.alert("Fehler", error?.message ?? "Decision konnte nicht geladen werden.");
      } finally {
        if(isRemix){
          continuationInFlightRef.current=false;
          setContinuationLoading(false);
        }
      }
    },
    [
      userId,
      canRun,
      city,
      inputMode,
      freeTextQuery,
      selectedDirections,
      selectedAudiences,
      selectedMoods,
      selectedPlaceTypes,
      moodA,
      moodB,
      seenSpotIds,
      decisionId,
      decisionRunContext,
      context,
      continuationExhausted,
      remixCount,
      router,
      checkNeedsDecisionOnboarding,
      enrichSpots,
    ]
  );

  useEffect(() => {
    const query = clean(homeParams.query);
    const incomingCity = clean(homeParams.city);
    if (!query) return;

    setInputMode("free");
    setFreeTextQuery(query);
    if (incomingCity) {
      setCity(incomingCity);
      setCitySource("manual");
    }
  }, [homeParams.city, homeParams.query]);

  useEffect(() => {
    const key = `${clean(homeParams.city)}:${clean(homeParams.query)}`;
    if (homeParams.auto !== "1" || !canRun || !userId || loading) return;
    if (homeAutoRunRef.current === key) return;

    homeAutoRunRef.current = key;
    router.setParams({ auto: "" });
    void runDecision();
  }, [canRun, homeParams.auto, homeParams.city, homeParams.query, loading, router, runDecision, userId]);

  useEffect(()=>{
    if(!deckMode||!decisionId||!currentSpot||currentPage<1)return;
    if (currentSpot.north_star_active !== true) return;
    if(appStateStatus!=="active"){
      setVisibleExposureReady(false);
      return;
    }
    const key=`${decisionId}:${currentSpot.spot_id}`;
    if(visibleExposureKeysRef.current.has(key)){
      cardActionInFlightRef.current = false;
      setVisibleExposureReady(true);
      return;
    }
    let cancelled=false;
    setVisibleExposureReady(false);
    // A mounted next card is not yet a human exposure. It must remain the
    // active foreground card for a bounded interval before persistence.
    const timer=setTimeout(()=>{
      if(cancelled||AppState.currentState!=="active")return;
      void supabase.rpc("backyrd_record_visible_decision_impression_v1",{
        p_decision_id:decisionId,p_spot_id:currentSpot.spot_id,
        p_page_number:currentPage,p_position_in_page:activeIndex+1,
      }).then(({error})=>{
        if(cancelled)return;
        if(error){
          console.log("visible Decision impression failed",error);
          return;
        }
        visibleExposureKeysRef.current.add(key);
        cardActionInFlightRef.current = false;
        setVisibleExposureReady(true);
        void trackAnalyticsEvent({
          eventName:"decision_impression",screenName:"decision",entityType:"spot",
          entityId:currentSpot.spot_id,spotId:currentSpot.spot_id,decisionId,
          properties:{page:currentPage,position:activeIndex+1,minimum_visible_ms:VISIBLE_EXPOSURE_MINIMUM_MS},
        });
      });
    },VISIBLE_EXPOSURE_MINIMUM_MS);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[activeIndex,appStateStatus,currentPage,currentSpot,decisionId,deckMode]);

  const onOpenSpot = useCallback(
    async (spotId: string) => {
      void trackAnalyticsEvent({
        eventName: "decision_spot_opened",
        screenName: "decision",
        entityType: "spot",
        entityId: spotId,
        spotId,
        decisionId,
      });
      void recordMemoryProductAction({ actionType: "spot_opened", spotId, decisionId, entrySurface: "decision" });
      router.push(`/spot/${spotId}?entrySource=decision` as any);
    },
    [decisionId, router]
  );

  const onRouteToSpot = useCallback(
    async (spot: EnrichedDecisionSpot) => {
      if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) {
        Alert.alert("Route nicht verfügbar", "Für diesen Spot fehlt noch eine sichere Position.");
        return;
      }
      void trackAnalyticsEvent({ eventName: "spot_route_clicked", screenName: "decision", entityType: "spot", entityId: spot.spot_id, spotId: spot.spot_id, decisionId });
      void recordMemoryProductAction({ actionType: "navigation_intent", spotId: spot.spot_id, decisionId, entrySurface: "decision" });
      const label = encodeURIComponent(spot.name);
      const coordinates = `${spot.lat},${spot.lng}`;
      await Linking.openURL(Platform.OS === "ios" ? `https://maps.apple.com/?ll=${coordinates}&q=${label}` : `https://www.google.com/maps/search/?api=1&query=${coordinates}`);
    },
    [decisionId]
  );

  if (deckMode && !loading && (currentSpot || finishedDeck)) {
    return (
      <FullscreenDeck
        currentSpot={currentSpot}
        finishedDeck={finishedDeck}
        activeIndex={activeIndex}
        spots={spots}
        city={city}
        moodA={moodA}
        moodB={moodB}
        copy={copy}
        remixCount={remixCount}
        continuationExhausted={continuationExhausted}
        continuationLoading={continuationLoading}
        exposureReady={visibleExposureReady}
        onSwipe={advanceCard}
        onOpenSpot={onOpenSpot}
        onRoute={onRouteToSpot}
        onBack={() => setDeckMode(false)}
        onSettings={() => setDeckMode(false)}
        onRemix={() => runDecision({ remix: true })}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          title: "Für jetzt",
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: "#fff",
          headerShadowVisible: false,
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 112,
          }}
        >
          <View style={{ marginBottom: 24, marginTop: 4 }}>
            <AppText
              role="displayXL"
              style={{
                color: theme.text,
                fontSize: 56,
                lineHeight: 60,
                letterSpacing: -1.8,
              }}
            >
              DEIN / JETZT.
            </AppText>

            <MarkerStroke inset={0} width={154} />

            <Text
              style={{
                color: "rgba(255,255,255,0.54)",
                marginTop: 12,
                fontSize: 15,
                lineHeight: 22,
                maxWidth: 330,
                fontWeight: "600",
              }}
            >
              Beschreib deinen Moment oder wähle ein paar Signale. Backyrd sucht daraus passende Orte.
            </Text>
          </View>

          <View
            style={{
              borderRadius: 2,
              overflow: "hidden",
              borderWidth: 0,
              backgroundColor: "transparent",
            }}
          >
            <LinearGradient
              colors={["transparent", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 0 }}
            >
              <View
                style={{
                  borderRadius: 0,
                  backgroundColor: "transparent",
                  borderBottomWidth: 1,
                  borderColor: "rgba(255,255,255,0.35)",
                  paddingHorizontal: 2,
                  paddingVertical: 16,
                  marginBottom: 18,
                }}
              >
                <Text
                  style={{
                    color: theme.acid,
                    fontSize: 11,
                    fontWeight: "900",
                    letterSpacing: 1.1,
                    textTransform: "uppercase",
                    marginBottom: 9,
                  }}
                >
                  WO
                </Text>

                <TextInput
                  value={city}
                  onChangeText={(value) => {
                    setCity(value);
                    setCitySource(clean(value) ? "manual" : "empty");
                  }}
                  placeholder="Basel oder Zürich"
                  placeholderTextColor="rgba(255,255,255,0.26)"
                  autoCorrect={false}
                  returnKeyType="next"
                  style={{
                    color: theme.text,
                    paddingHorizontal: 0,
                    paddingVertical: 2,
                    fontWeight: "900",
                    fontSize: 29,
                    letterSpacing: -0.75,
                  }}
                />

                <View
                  style={{
                    marginTop: 12,
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    paddingHorizontal: 11,
                    paddingVertical: 7,
                    backgroundColor: "rgba(255,125,167,0.10)",
                    borderWidth: 1,
                    borderColor: "rgba(255,125,167,0.24)",
                  }}
                >
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.66)",
                      fontSize: 12,
                      lineHeight: 16,
                      fontWeight: "700",
                    }}
                  >
                    {citySource === "profile"
                      ? "Aus deinem Profil · nicht dein Live-Standort"
                      : citySource === "manual"
                        ? "Manuell gewählt · ohne Standortfreigabe"
                        : "Keine Standortfreigabe nötig"}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  padding: 4,
                  borderRadius: 2,
                  backgroundColor: "rgba(0,0,0,0.2)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  marginBottom: 14,
                }}
              >
                <SegmentButton
                  label="Geführt"
                  active={inputMode === "guided"}
                  onPress={() => setInputMode("guided")}
                />
                <SegmentButton
                  label="Freitext"
                  active={inputMode === "free"}
                  onPress={() => setInputMode("free")}
                />
              </View>

              {inputMode === "free" ? (
                <View
                  style={{
                  borderRadius: 0,
                  backgroundColor: "transparent",
                  borderBottomWidth: 1,
                  borderColor: "rgba(255,255,255,0.35)",
                  paddingHorizontal: 2,
                  paddingVertical: 16,
                  }}
                >
                  <Text
                    style={{
                      color: theme.acid,
                      fontSize: 11,
                      fontWeight: "900",
                      letterSpacing: 1.1,
                      textTransform: "uppercase",
                      marginBottom: 9,
                    }}
                  >
                    WAS / MOOD
                  </Text>

                  <TextInput
                    value={freeTextQuery}
                    onChangeText={setFreeTextQuery}
                    placeholder="Freier Tag mit meiner 4-jährigen Tochter, irgendwas unternehmen…"
                    placeholderTextColor="rgba(255,255,255,0.26)"
                    autoCorrect
                    multiline
                    textAlignVertical="top"
                    returnKeyType="default"
                    style={{
                      minHeight: 112,
                      color: theme.text,
                      paddingHorizontal: 0,
                      paddingVertical: 2,
                      fontWeight: "800",
                      fontSize: 19,
                      lineHeight: 25,
                      letterSpacing: -0.25,
                    }}
                  />

                  <Text style={{ color: "rgba(255,255,255,0.38)", fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 10 }}>
                    Beispiele: Sonntag mit Freunden unterwegs, cozy aber chic · chillig und nicht laut · Museum mit Kind bei Regen
                  </Text>
                </View>
              ) : (
                <>
                  <InputSectionLabel title="Wonach suchst du?" subtitle="Kategorie schlägt alten Geschmack. Stimmung ist optional." />

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {DIRECTION_OPTIONS.map((option) => (
                      <ChoiceChip
                        key={option.key}
                        label={`${option.emoji} ${option.label}`}
                        active={selectedDirections.includes(option.key)}
                        onPress={() => setSelectedDirections((current) => toggleValue(current, option.key))}
                      />
                    ))}

                    <ChoiceChip
                      label="✨ Egal"
                      active={selectedDirections.length === 0 && selectedAudiences.length === 0}
                      onPress={() => {
                        setSelectedDirections([]);
                        setSelectedAudiences([]);
                      }}
                    />
                  </View>

                  <InputSectionLabel title="Für wen / welche Situation?" />

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {AUDIENCE_OPTIONS.map((option) => (
                      <ChoiceChip
                        key={option.key}
                        label={`${option.emoji} ${option.label}`}
                        active={selectedAudiences.includes(option.key)}
                        onPress={() => setSelectedAudiences((current) => toggleValue(current, option.key))}
                      />
                    ))}
                  </View>

                  <InputSectionLabel title="Welche Stimmung?" subtitle="Optional – hilft beim Feinschliff." />

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {MOOD_OPTIONS.map((option) => (
                      <ChoiceChip
                        key={option.key}
                        label={option.label}
                        active={selectedMoods.includes(option.key)}
                        onPress={() => setSelectedMoods((current) => toggleValue(current, option.key))}
                      />
                    ))}
                  </View>

                  <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 28,
                        backgroundColor: "rgba(0,0,0,0.18)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.085)",
                        paddingHorizontal: 16,
                        paddingVertical: 15,
                      }}
                    >
                      <Text
                        style={{
                          color: "rgba(255,255,255,0.42)",
                          fontSize: 11,
                          fontWeight: "900",
                          letterSpacing: 1.1,
                          textTransform: "uppercase",
                          marginBottom: 9,
                        }}
                      >
                        Vibe
                      </Text>

                      <TextInput
                        value={moodA}
                        onChangeText={setMoodA}
                        placeholder="cozy"
                        placeholderTextColor="rgba(255,255,255,0.26)"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="next"
                        style={{
                          color: theme.text,
                          paddingHorizontal: 0,
                          paddingVertical: 2,
                          fontWeight: "900",
                          fontSize: 22,
                          letterSpacing: -0.45,
                        }}
                      />
                    </View>

                    <View
                      style={{
                        flex: 1,
                        borderRadius: 28,
                        backgroundColor: "rgba(0,0,0,0.18)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.085)",
                        paddingHorizontal: 16,
                        paddingVertical: 15,
                      }}
                    >
                      <Text
                        style={{
                          color: "rgba(255,255,255,0.42)",
                          fontSize: 11,
                          fontWeight: "900",
                          letterSpacing: 1.1,
                          textTransform: "uppercase",
                          marginBottom: 9,
                        }}
                      >
                        Plus
                      </Text>

                      <TextInput
                        value={moodB}
                        onChangeText={setMoodB}
                        placeholder="urban"
                        placeholderTextColor="rgba(255,255,255,0.26)"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          if (canRun && !loading) runDecision();
                        }}
                        style={{
                          color: theme.text,
                          paddingHorizontal: 0,
                          paddingVertical: 2,
                          fontWeight: "900",
                          fontSize: 22,
                          letterSpacing: -0.45,
                        }}
                      />
                    </View>
                  </View>
                </>
              )}

              {mappedMoods.clusterIds.length > 0 && (
                <Text
                  numberOfLines={1}
                  style={{
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 13,
                    lineHeight: 18,
                    fontWeight: "700",
                    marginTop: 14,
                    marginHorizontal: 3,
                  }}
                >
                  {mappedMoods.matchedTokens.slice(0, 3).join(" · ")}
                </Text>
              )}

              <Pressable
                onPress={() => runDecision()}
                disabled={loading || !canRun}
                style={{
                  marginTop: 18,
                  minHeight: 60,
                  borderRadius: 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: loading || !canRun ? "rgba(255,255,255,0.11)" : theme.pink,
                  shadowColor: "#000",
                  shadowOpacity: loading || !canRun ? 0 : 0.28,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 12 },
                }}
              >
                {loading ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                      {status === "writing" ? "Einen Moment…" : "Suche Spots…"}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      color: canRun ? "#111113" : "rgba(255,255,255,0.45)",
                      fontWeight: "900",
                      fontSize: 17,
                      letterSpacing: -0.2,
                    }}
                  >
                    Vorschläge finden
                  </Text>
                )}
              </Pressable>
            </LinearGradient>
          </View>

          {context && hasResults && (
            <View
              style={{
                marginTop: 16,
                borderRadius: 28,
                padding: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.09)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ color: theme.text, fontWeight: "900", fontSize: 17, flex: 1 }}>{context.title}</Text>
              </View>

              <Pressable
                onPress={() => setDeckMode(true)}
                style={{
                  marginTop: 13,
                  height: 48,
                  borderRadius: 999,
                  backgroundColor: theme.pink,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#111113", fontWeight: "900", fontSize: 15 }}>Deck öffnen</Text>
              </Pressable>
            </View>
          )}

          {!loading && status === "error" && (
            <View
              style={{
                marginTop: 16,
                borderRadius: 24,
                padding: 15,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.25)",
                backgroundColor: "rgba(239,68,68,0.08)",
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "900", fontSize: 15 }}>Kurz gestolpert.</Text>
              <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 20 }}>
                {errorMessage ?? "Bitte versuch es gleich nochmals."}
              </Text>
            </View>
          )}

          {!loading && status === "empty" && (
            <View
              style={{
                marginTop: 16,
                borderRadius: 24,
                padding: 15,
                borderWidth: 1,
                borderColor: "rgba(251,191,36,0.22)",
                backgroundColor: "rgba(251,191,36,0.08)",
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "900", fontSize: 15 }}>Noch kein Treffer.</Text>
              <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 20 }}>
                Versuch es etwas breiter, zum Beispiel „Aktivität + Mit Kind“ oder nutze Freitext.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 42,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? theme.pinkSoft : "transparent",
      }}
    >
      <Text
        style={{
          color: active ? "#111113" : "rgba(255,255,255,0.62)",
          fontWeight: "900",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InputSectionLabel({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginTop: 16, marginBottom: 9 }}>
      <Text
        style={{
          color: "rgba(255,255,255,0.84)",
          fontSize: 14,
          fontWeight: "900",
          letterSpacing: -0.1,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: "rgba(255,255,255,0.42)", marginTop: 3, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function ChoiceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 42,
        paddingHorizontal: 14,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? theme.pinkSoft : "rgba(0,0,0,0.18)",
        borderWidth: 1,
        borderColor: active ? "rgba(255,125,167,0.45)" : "rgba(255,255,255,0.1)",
      }}
    >
      <Text
        style={{
          color: active ? "#111113" : "rgba(255,255,255,0.76)",
          fontWeight: "900",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FullscreenDeck({
  currentSpot,
  finishedDeck,
  activeIndex,
  spots,
  city,
  moodA,
  moodB,
  copy,
  remixCount,
  continuationExhausted,
  continuationLoading,
  exposureReady,
  onSwipe,
  onOpenSpot,
  onRoute,
  onBack,
  onSettings,
  onRemix,
}: {
  currentSpot: EnrichedDecisionSpot | null;
  finishedDeck: boolean;
  activeIndex: number;
  spots: EnrichedDecisionSpot[];
  city: string;
  moodA: string;
  moodB: string;
  copy: DecisionCopyResponse | null;
  remixCount: number;
  continuationExhausted: boolean;
  continuationLoading: boolean;
  exposureReady:boolean;
  onSwipe: (action: DecisionCardAction) => void;
  onOpenSpot: (spotId: string) => void;
  onRoute: (spot: EnrichedDecisionSpot) => void;
  onBack: () => void;
  onSettings: () => void;
  onRemix: () => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: "#050506" }}>
      <Stack.Screen options={{ title: "", headerShown: false }} />

      {finishedDeck ? (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#050506" }} edges={["top", "left", "right", "bottom"]}>
          <View style={{ position: "absolute", left: 18, top: 58, zIndex: 20 }}>
            <RoundDeckButton label="×" onPress={onBack} />
          </View>

          <View style={{ flex: 1, paddingHorizontal: 22, justifyContent: "center" }}>
            <View
              style={{
                borderRadius: 38,
                padding: 24,
                borderWidth: 1,
                borderColor: "rgba(244,235,221,0.18)",
                backgroundColor: "rgba(255,255,255,0.065)",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 34, lineHeight: 38, fontWeight: "900", letterSpacing: -1 }}>
                {continuationExhausted ? "Das waren die passendsten Vorschläge." : "Noch nicht das Richtige?"}
              </Text>

              <Text style={{ color: "rgba(255,255,255,0.62)", marginTop: 10, fontSize: 15, lineHeight: 22 }}>
                {continuationExhausted
                  ? "Für diese Suche sind keine weiteren passenden Orte übrig. Du kannst deine Wünsche anpassen und neu suchen."
                  : "Du hast alle Vorschläge dieser Seite gesehen. Willst du deine Wünsche anpassen oder weiter entdecken?"}
              </Text>

              {!continuationExhausted ? (
                <Pressable
                  onPress={onRemix}
                  disabled={continuationLoading}
                  style={{
                    marginTop: 20,
                    height: 56,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.pink,
                    opacity: continuationLoading ? 0.65 : 1,
                  }}
                >
                  {continuationLoading ? <ActivityIndicator color="#111113" /> : (
                    <Text style={{ color: "#111113", fontWeight: "900", fontSize: 15 }}>
                      Weitere Vorschläge{remixCount > 0 ? ` · Seite ${remixCount + 2}` : ""}
                    </Text>
                  )}
                </Pressable>
              ) : null}

              <Pressable
                onPress={onSettings}
                style={{
                  marginTop: 12,
                  height: 54,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.075)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                  Moods anpassen
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      ) : currentSpot ? (
        <FullscreenSwipeCard
          key={`${currentSpot.spot_id}-${activeIndex}`}
          spot={currentSpot}
          index={activeIndex}
          total={spots.length}
          city={city}
          moodA={moodA}
          moodB={moodB}
          copy={copy}
          exposureReady={exposureReady}
          onSwipe={onSwipe}
          onOpen={() => onOpenSpot(currentSpot.spot_id)}
          onRoute={() => onRoute(currentSpot)}
          onBack={onBack}
          onSettings={onSettings}
        />
      ) : null}
    </View>
  );
}

function RoundDeckButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.055)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.095)",
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: label === "✦" ? 19 : 25,
          fontWeight: label === "✦" ? "800" : "400",
          marginTop: label === "✦" ? -1 : -2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FullscreenSwipeCard({
  spot,
  index,
  total,
  city,
  moodA,
  moodB,
  copy,
  exposureReady,
  onSwipe,
  onOpen,
  onRoute,
  onBack,
  onSettings,
}: {
  spot: EnrichedDecisionSpot;
  index: number;
  total: number;
  city: string;
  moodA: string;
  moodB: string;
  copy: DecisionCopyResponse | null;
  exposureReady:boolean;
  onSwipe: (action: DecisionCardAction) => void;
  onOpen: () => void;
  onRoute: () => void;
  onBack: () => void;
  onSettings: () => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const swipeThreshold = Math.min(105, screenWidth * 0.25);
  const pan = useRef(new Animated.ValueXY()).current;
  const isAnimatingRef = useRef(false);

  const likeProgress = pan.x.interpolate({
    inputRange: [0, swipeThreshold],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const dislikeProgress = pan.x.interpolate({
    inputRange: [-swipeThreshold, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const likeScale = pan.x.interpolate({
    inputRange: [0, swipeThreshold],
    outputRange: [1, 1.18],
    extrapolate: "clamp",
  });

  const dislikeScale = pan.x.interpolate({
    inputRange: [-swipeThreshold, 0],
    outputRange: [1.18, 1],
    extrapolate: "clamp",
  });

  const cardScale = pan.x.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [0.965, 1, 0.965],
    extrapolate: "clamp",
  });

  const rotate = pan.x.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: ["-7deg", "0deg", "7deg"],
    extrapolate: "clamp",
  });

  const swipeOut = useCallback(
    (action: DecisionCardAction,visualDirection:"left"|"right"="right") => {
      if (isAnimatingRef.current||!exposureReady) return;

      isAnimatingRef.current = true;
      const x = visualDirection === "right" ? screenWidth * 1.45 : -screenWidth * 1.45;
      const y = -screenHeight * 0.06;

      Animated.timing(pan, {
        toValue: { x, y },
        duration: 260,
        useNativeDriver: true,
      }).start(() => {
        onSwipe(action);
        pan.setValue({ x: 0, y: 0 });
        isAnimatingRef.current = false;
      });
    },
    [exposureReady,onSwipe,pan,screenHeight,screenWidth]
  );

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => {
        return Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.75;
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > swipeThreshold || gesture.vx > 0.75) {
          swipeOut("next","right");
          return;
        }

        if (gesture.dx < -swipeThreshold || gesture.vx < -0.75) {
          swipeOut("next","left");
          return;
        }

        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          friction: 6,
          tension: 72,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          friction: 6,
          tension: 72,
          useNativeDriver: true,
        }).start();
      },
    }),
    [pan, swipeOut, swipeThreshold]
  );

  const imageUrl = spot.photo_url;
  const itemCopy = getCopyForSpot(copy, spot, index, moodA, moodB);
  const queryLabel =
    clean(moodA) ||
    clean(moodB) ||
    clean(itemCopy.headline) ||
    "Dein aktueller Moment";
  const momentChips = uniq(
    [
      clean(moodA),
      clean(moodB),
      ...(spot.matched_terms ?? []).map(clean),
      ...(spot.matched_tokens ?? []).map(clean),
      clean(spot.category_name),
    ].filter(Boolean)
  ).slice(0, 3);
  const whyText = limitSentences(itemCopy.why || spot.human_reason || spot.why_this, 2);

  return (
    <View style={{ flex: 1, backgroundColor: "#050506" }}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#050506" }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <RoundDeckButton label="‹" onPress={onBack} />
          <AppText role="displayM" numberOfLines={1} style={{ color: theme.text, fontSize: 34, lineHeight: 40, letterSpacing: -0.9 }}>
            DEIN / JETZT.
          </AppText>
          <RoundDeckButton label="✦" onPress={onSettings} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 118,
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              maxWidth: "100%",
              minHeight: 38,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: theme.pinkSoft,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text numberOfLines={1} style={{ color: "#111113", fontSize: 14, fontWeight: "700", maxWidth: screenWidth - 108 }}>
              {queryLabel}
            </Text>
            <Text style={{ color: "rgba(23,18,20,0.58)", fontSize: 18, fontWeight: "600", marginTop: -1 }}>×</Text>
          </View>

          <Text
            style={{
              color: "rgba(255,255,255,0.44)",
              fontSize: 13,
              fontWeight: "600",
              marginTop: 22,
              marginBottom: 10,
            }}
          >
            Dein Moment
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {(momentChips.length > 0 ? momentChips : ["dein Moment"]).map((chip, chipIndex) => (
              <View
                key={`${chip}-${chipIndex}`}
                style={{
                  minHeight: 34,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <Text style={{ color: chipIndex === 0 ? "#C8E3A6" : theme.pinkMuted, fontSize: 15 }}>
                  {chipIndex === 0 ? "↗" : chipIndex === 1 ? "∿" : "♡"}
                </Text>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{chip}</Text>
              </View>
            ))}
          </View>

          <Animated.View
            {...panResponder.panHandlers}
            style={{
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }, { scale: cardScale }],
            }}
          >
            <View
              style={{
                minHeight: Math.min(510, screenHeight * 0.58),
                borderRadius: 3,
                overflow: "hidden",
                backgroundColor: "#121214",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <SpotArtwork
                imageUrl={imageUrl}
                priority="high"
                spotId={spot.spot_id}
                spotName={spot.name}
                style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
              />

              <LinearGradient
                colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.72)", "rgba(0,0,0,0.95)"]}
                locations={[0, 0.42, 0.72, 1]}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                }}
              />

              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  right: 18,
                  top: 18,
                  opacity: likeProgress,
                  transform: [{ scale: likeScale }],
                  paddingHorizontal: 14,
                  height: 42,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,125,167,0.92)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.32)",
                  zIndex: 20,
                }}
              >
                <Text style={{ color: "#111113", fontSize: 14, fontWeight: "900" }}>weiter</Text>
              </Animated.View>

              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 18,
                  top: 18,
                  opacity: dislikeProgress,
                  transform: [{ scale: dislikeScale }],
                  paddingHorizontal: 14,
                  height: 42,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.86)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.28)",
                  zIndex: 20,
                }}
              >
                <Text style={{ color: "#111113", fontSize: 14, fontWeight: "900" }}>weiter</Text>
              </Animated.View>

              <View style={{ flex: 1, justifyContent: "space-between", padding: 16 }}>
                <View>
                  <AppText
                    numberOfLines={2}
                    style={{
                      color: theme.text,
                      fontSize: 47,
                      lineHeight: 52,
                      letterSpacing: -1.15,
                    }}
                    role="displayL"
                  >
                    {spot.name}
                  </AppText>
                  <Text style={{ color: "rgba(255,255,255,0.72)", fontSize: 15, fontWeight: "600", marginTop: 8 }}>
                    Passt zu deinem Moment
                  </Text>

                  <View
                    style={{
                      marginTop: 18,
                      padding: 15,
                      borderRadius: 2,
                      backgroundColor: "rgba(12,12,14,0.74)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.11)",
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                      <Text style={{ color: theme.pinkMuted, fontSize: 27, lineHeight: 30 }}>✦</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.pinkSoft, fontSize: 14, fontWeight: "800", marginBottom: 7 }}>
                          Warum dieser Treffer?
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 15, lineHeight: 21, fontWeight: "600" }}>
                          {whyText || "Für diesen Treffer liegt noch keine genauere Begründung vor."}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>

          {total > 1 && (
            <Text style={{ color: "rgba(255,255,255,0.38)", textAlign: "center", marginTop: 14, fontWeight: "700", fontSize: 12 }}>
              Treffer {index + 1} von {total}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView
        pointerEvents="box-none"
        edges={["bottom", "left", "right"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 45,
        }}
      >
        <View
          pointerEvents="box-none"
          style={{
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 12,
            gap: 10,
            backgroundColor: "rgba(5,5,6,0.82)",
            opacity:exposureReady?1:0.55,
          }}
        >
          <Pressable
            onPress={()=>swipeOut("next","right")}
            disabled={!exposureReady}
            style={{height:52,borderRadius:2,alignItems:"center",justifyContent:"center",backgroundColor:theme.pink}}
          >
            {exposureReady?<Text style={{color:"#111113",fontWeight:"900",fontSize:15}}>Weiter</Text>:<ActivityIndicator color="#111113"/>}
          </Pressable>
          <View style={{flexDirection:"row",gap:10}}>
          <Pressable
            onPress={() => swipeOut("dislike","left")}
            disabled={!exposureReady}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.065)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.09)",
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 13 }}>Nicht passend</Text>
          </Pressable>

          <Pressable
            onPress={onRoute}
            disabled={!exposureReady}
            style={{
              flex: 1.12,
              height: 52,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(5,5,6,0.96)",
              borderWidth: 1,
              borderColor: theme.acid,
            }}
          >
            <Text style={{ color: theme.acid, fontWeight: "900", fontSize: 15 }}>Route</Text>
          </Pressable>

          <Pressable
            onPress={() => swipeOut("like","right")}
            disabled={!exposureReady}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.065)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.09)",
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 14 }}>Passt</Text>
          </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
