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
  Image,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { supabase } from "@/lib/supabase";
import { mapTextToClusterIds } from "@/lib/decision/moodMapping";

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
  address?: string | null;
  price_level?: number | null;
  category_id?: string | null;
  category_name?: string | null;
  description?: string | null;
  description_keywords?: string[];
  opening_hours_summary?: string | null;
  header_photo_path?: string | null;
  photo_url?: string | null;
  human_reason?: string | null;
  technical_why_this?: string | null;
  v13_sources?: Array<"personalized_v12" | "semantic_v13">;
  v13_rank?: number | null;
  v13_combined_score?: number | null;
  v13_semantic_rank?: number | null;
  v13_semantic_similarity?: number | null;
  v13_v12_rank?: number | null;
  v13_v12_score?: number | null;
  v13_document_preview?: string | null;
  reviews?: Array<{
    text: string | null;
    mood_a: string | null;
    mood_b: string | null;
  }>;
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
  source: "openai" | "fallback" | "v13";
};

type DecisionV13Candidate = {
  rank: number;
  spot_id: string;
  name: string;
  city: string | null;
  category_name: string | null;
  is_open_now: boolean | null;
  combined_score: number;
  sources: Array<"personalized_v12" | "semantic_v13">;
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
  error?: string;
};

type DecisionStatus = "idle" | "checking" | "deciding" | "writing" | "success" | "empty" | "error";
type SwipeDirection = "like" | "dislike";
type MlDecisionEventType =
  | "decision_impression"
  | "decision_like"
  | "decision_dislike"
  | "decision_open"
  | "decision_remix";


type DecisionInputMode = "guided" | "free";

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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = Math.min(105, SCREEN_WIDTH * 0.25);

const theme = {
  bg: "#09090A",
  card: "rgba(255,255,255,0.065)",
  border: "rgba(255,255,255,0.13)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.66)",
  subtle: "rgba(255,255,255,0.46)",
  cream: "#F4EBDD",
  ink: "#111111",
  green: "#78A045",
  red: "#E95050",
};

const VISIBLE_DECISION_LIMIT = 10;
const DECISION_CANDIDATE_LIMIT = 16;
const DECISION_V13_FUNCTION = "decision-v13";
const DECISION_V13_LIMIT = 16;
const DECISION_V13_V12_LIMIT = 16;
const DECISION_V13_SEMANTIC_LIMIT = 24;

const V11_TASTE_WEIGHT = 0.28;
const V11_EXPLORE_WEIGHT = 0.05;
const V11_REMIX_EXPLORE_WEIGHT = 0.16;
const V11_K = 1.0;
const V11_OPEN_BONUS = 0.0;

const TASTE_CAP = 0.4;
const TASTE_CONF_INC = 0.03;


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

function normalizeUrl(value?: string | null) {
  const raw = clean(value);
  if (!raw) return null;

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("file://") ||
    raw.startsWith("data:")
  ) {
    return raw;
  }

  try {
    const { data } = supabase.storage.from("spot-photos").getPublicUrl(raw);
    return data.publicUrl || null;
  } catch {
    return null;
  }
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}


function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function optionLabels(options: Array<{ key: string; label: string }>, keys: string[]) {
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

function compactMoodQuery(a: string, b: string, leftovers: string) {
  return uniq([clean(a), clean(b), clean(leftovers)].filter(Boolean)).join(" ");
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
  const fallback = rows.filter((row) => row?.spot_id);
  const picked = fresh.length >= limit ? fresh.slice(0, limit) : [...fresh, ...fallback].slice(0, limit);

  const deduped: DecisionSpotRpcRow[] = [];
  const used = new Set<string>();

  for (const row of picked) {
    if (!row?.spot_id || used.has(row.spot_id)) continue;
    used.add(row.spot_id);
    deduped.push(row);
  }

  return deduped.slice(0, limit);
}

function modeBadge(mode: DecisionContext["decision_mode"], source?: DecisionCopyResponse["source"]) {
  if (source === "v13") {
    return {
      label: "V13 kuratiert",
      border: "rgba(244,235,221,0.52)",
      bg: "rgba(244,235,221,0.15)",
    };
  }

  if (source === "openai") {
    return {
      label: "AI kuratiert",
      border: "rgba(244,235,221,0.48)",
      bg: "rgba(244,235,221,0.13)",
    };
  }

  switch (mode) {
    case "strong_personalized":
      return { label: "persönlich", border: "rgba(34,197,94,0.48)", bg: "rgba(34,197,94,0.14)" };
    case "weak_personalized":
      return { label: "lernt dich", border: "rgba(96,165,250,0.5)", bg: "rgba(96,165,250,0.13)" };
    case "fallback":
      return { label: "breite Auswahl", border: "rgba(251,191,36,0.48)", bg: "rgba(251,191,36,0.13)" };
    default:
      return { label: "heute passend", border: "rgba(255,255,255,0.22)", bg: "rgba(255,255,255,0.08)" };
  }
}

function priceToSymbols(value?: number | null) {
  const level = Number(value ?? 0);
  if (!Number.isFinite(level) || level < 1) return null;

  const normalized = Math.max(1, Math.min(4, Math.round(level)));
  const labelByLevel: Record<number, string> = {
    1: "günstig",
    2: "moderat",
    3: "gehoben",
    4: "premium",
  };

  return `${labelByLevel[normalized]} · ${normalized}/4`;
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
  rows: Array<{
    day_of_week: string | null;
    open_time: string | null;
    close_time: string | null;
    idx?: number | null;
  }>
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

function signalLabel(spot: EnrichedDecisionSpot) {
  const count = (spot.matched_tokens ?? []).length;
  if (count >= 3) return "starke Richtung";
  if (count >= 1) return "passt zum Vibe";
  return "breiter Pick";
}

function fallbackHeadline(index: number) {
  if (index === 0) return "Würde ich zuerst nehmen";
  if (index === 1) return "Sichere zweite Wahl";
  return "Etwas mehr Zufall";
}

function fallbackSubtitle(index: number) {
  if (index === 0) return "Wenn du jetzt einfach los willst.";
  if (index === 1) return "Weniger mutig, aber wahrscheinlich gut.";
  return "Für den Fall, dass du offen bist.";
}

function fallbackWhy({
  spot,
  index,
  moodA,
  moodB,
}: {
  spot: EnrichedDecisionSpot;
  index: number;
  moodA: string;
  moodB: string;
}) {
  const moodText = [clean(moodA), clean(moodB)].filter(Boolean).join(" + ");
  const category = clean(spot.category_name);
  const city = clean(spot.city);

  if (index === 0) {
    return `${spot.name}${category ? ` als ${category}` : ""} wirkt wie der naheliegende Start. Für ${moodText} würde ich hier anfangen, besonders wenn du nicht mehr lange vergleichen willst.`;
  }

  if (index === 1) {
    return `${spot.name} ist die ruhigere Alternative. Nicht unbedingt der mutigste Pick, aber wahrscheinlich angenehm, wenn du heute etwas Verlässliches suchst.`;
  }

  return `${spot.name}${city ? ` in ${city}` : ""} ist die offenere Wahl. Ich würde ihn nehmen, wenn du nicht beim komplett Offensichtlichen landen willst.`;
}

function fallbackCopy({
  spots,
  city,
  moodA,
  moodB,
  context,
}: {
  spots: EnrichedDecisionSpot[];
  city: string;
  moodA: string;
  moodB: string;
  context: DecisionContext | null;
}): DecisionCopyResponse {
  const c = clean(city) || "deiner Stadt";
  const moodText = [clean(moodA), clean(moodB)].filter(Boolean).join(" + ") || "deinen Vibe";

  return {
    source: "fallback",
    title:
      context?.decision_mode === "strong_personalized"
        ? "Das passt zu deinem Geschmack"
        : context?.decision_mode === "weak_personalized"
          ? "Ich habe eine Richtung gefunden"
          : "Ich hätte diese drei im Kopf",
    body: `Für ${moodText} in ${c} würde ich nicht ewig suchen. Wisch dich durch die drei Picks und öffne den Spot, der dich am meisten zieht.`,
    items: spots.map((spot, index) => ({
      spot_id: spot.spot_id,
      headline: fallbackHeadline(index),
      subtitle: fallbackSubtitle(index),
      why: fallbackWhy({ spot, index, moodA, moodB }),
      cta_label: "Mehr entdecken",
    })),
  };
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
      "Respect the user's concrete current intent more than old taste patterns.",
      "If category or audience is clear, prefer matching categories strongly and use personal taste only softly.",
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
    "Find places that match the selected direction, situation and vibe.",
    "Category and current intent are more important than old likes.",
    "Use previous taste only as a soft tie-breaker.",
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
  const c = clean(city) || "deiner Stadt";
  const moodText = [clean(moodA), clean(moodB)].filter(Boolean).join(" + ") || "deinen Vibe";
  const personalized = response?.mode === "personalized_semantic";

  return {
    source: "v13",
    title: personalized ? "Das fühlt sich nach dem besten Match an" : ctx?.title || "Ich hätte diese drei im Kopf",
    body: personalized
      ? `Für ${moodText} in ${c} kombiniere ich deinen bisherigen Geschmack mit echtem Vibe-Matching.`
      : `Für ${moodText} in ${c} habe ich Orte gesucht, die atmosphärisch möglichst gut passen.`,
    items: spots.map((spot, index) => ({
      spot_id: spot.spot_id,
      headline:
        index === 0
          ? "Bester Match"
          : index === 1
            ? "Sehr nah dran"
            : "Gute Alternative",
      subtitle:
        spot.category_name && spot.city
          ? `${spot.category_name} · ${spot.city}`
          : spot.category_name || spot.city || fallbackSubtitle(index),
      why: limitSentences(spot.human_reason || spot.why_this || fallbackWhy({ spot, index, moodA, moodB }), 3),
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
    headline: item?.headline || fallbackHeadline(index),
    subtitle: item?.subtitle || fallbackSubtitle(index),
    why: item?.why || fallbackWhy({ spot, index, moodA, moodB }),
    ctaLabel: "Mehr entdecken",
  };
}

export default function DecisionScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  const [city, setCity] = useState("Basel");
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
  const [deckMode, setDeckMode] = useState(false);

  const [status, setStatus] = useState<DecisionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onboardingPushInFlightRef = useRef(false);

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
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

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
      const { data, error } = await supabase.rpc("get_my_taste_profile_status_v1");

      if (error) {
        console.log("get_my_taste_profile_status_v1 failed:", error);
        return false;
      }

      const row = Array.isArray(data) ? data[0] : data;
      return Boolean(row?.needs_onboarding);
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

  const loadContext = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_decision_context_v1", {
      p_city: clean(city),
      p_mood_a_text: clean(moodA),
      p_mood_b_text: clean(moodB),
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return row as DecisionContext;
  }, [city, moodA, moodB]);

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
      supabase.from("spots").select("id,address,price_level,category_id,header_photo_path").in("id", ids),

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

    let categories: Array<{ id: string; name: string | null }> = [];

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
      Array<{
        day_of_week: string | null;
        open_time: string | null;
        close_time: string | null;
        idx?: number | null;
      }>
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
      Array<{
        text: string | null;
        mood_a: string | null;
        mood_b: string | null;
      }>
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
        photo_url: normalizeUrl(photoUrl) ?? normalizeUrl(headerUrl),
        matched_terms: uniq([...(row.matched_terms ?? []), ...descriptionKeywords]).slice(0, 10),
        reviews: reviewsBySpotId.get(row.spot_id) ?? [],
      };
    });
  }, []);

  const loadDecisionCopy = useCallback(
    async ({
      picked,
      ctx,
    }: {
      picked: EnrichedDecisionSpot[];
      ctx: DecisionContext | null;
    }): Promise<DecisionCopyResponse> => {
      const fallback = fallbackCopy({
        spots: picked,
        city,
        moodA,
        moodB,
        context: ctx,
      });

      try {
        const { data, error } = await supabase.functions.invoke("decision-copy", {
          body: {
            city: clean(city),
            moodA: clean(moodA),
            moodB: clean(moodB),
            decisionMode: ctx?.decision_mode ?? null,
            userConfidence: ctx?.user_confidence ?? null,
            spots: picked.map((spot, index) => ({
              spot_id: spot.spot_id,
              name: spot.name,
              city: spot.city,
              address: spot.address,
              category_name: spot.category_name,
              description: spot.description,
              price_level: spot.price_level,
              opening_hours_summary: spot.opening_hours_summary,
              is_open_now: spot.is_open_now,
              matched_tokens: spot.matched_tokens ?? [],
              matched_counts: spot.matched_counts ?? [],
              matched_terms: spot.matched_terms ?? [],
              why_this: spot.why_this,
              reviews: spot.reviews ?? [],
              rank: index + 1,
            })),
          },
        });

        if (error) {
          console.log("decision-copy function failed:", error);
          return fallback;
        }

        if (!data || !Array.isArray((data as any).items)) {
          console.log("decision-copy invalid response:", data);
          return fallback;
        }

        const aiCopy = data as DecisionCopyResponse;

        if (aiCopy.items.length !== picked.length) {
          console.log("decision-copy item count mismatch:", aiCopy);
          return fallback;
        }

        return aiCopy;
      } catch (error) {
        console.log("decision-copy crashed:", error);
        return fallback;
      }
    },
    [city, moodA, moodB]
  );

  const persistDecisionSession = useCallback(
    async (picked: EnrichedDecisionSpot[], usedCopy: DecisionCopyResponse | null): Promise<string | null> => {
      try {
        const { data: newId, error: sessionError } = await supabase.rpc("create_decision_session_v1", {
          p_city: clean(city),
          p_mood_a_text: clean(moodA),
          p_mood_b_text: clean(moodB),
        });

        if (sessionError) throw sessionError;

        const did =
          typeof newId === "string"
            ? newId
            : Array.isArray(newId)
              ? typeof newId[0] === "string"
                ? newId[0]
                : newId[0]?.id
              : (newId as any)?.id;

        if (!did) return null;

        setDecisionId(did);

        const spotIds = picked.map((item) => item.spot_id);
        const why = picked.map((item, index) => getCopyForSpot(usedCopy, item, index, moodA, moodB).why);

        const { error: impressionError } = await supabase.rpc("log_decision_impressions_v1", {
          p_decision_id: did,
          p_spot_ids: spotIds,
          p_why_this: why,
        });

        if (impressionError) throw impressionError;

        return did;
      } catch (error) {
        console.log("persist decision failed (non-blocking)", error);
        return null;
      }
    },
    [city, moodA, moodB]
  );

  const logMlEvent = useCallback(
    async ({
      eventType,
      spotId,
      rank,
      decisionIdOverride,
      extraContext,
    }: {
      eventType: MlDecisionEventType;
      spotId?: string | null;
      rank?: number | null;
      decisionIdOverride?: string | null;
      extraContext?: Record<string, unknown>;
    }) => {
      try {
        const { error } = await supabase.rpc("backyrd_ml_log_event_v1", {
          p_event_type: eventType,
          p_spot_id: spotId ?? null,
          p_decision_id: decisionIdOverride ?? decisionId,
          p_rank: rank ?? null,
          p_city: clean(city),
          p_mood_a_text: clean(moodA),
          p_mood_b_text: clean(moodB),
          p_context: {
            source: "mobile_decision",
            deck_size: spots.length,
            active_index: activeIndex,
            ...(decisionRunContext ?? {}),
            ...extraContext,
          },
          p_signal_strength: null,
        });

        if (error) {
          console.log("backyrd_ml_log_event_v1 failed:", eventType, error);
        }
      } catch (error) {
        console.log("backyrd_ml_log_event_v1 crashed:", eventType, error);
      }
    },
    [activeIndex, city, decisionId, decisionRunContext, moodA, moodB, spots.length]
  );

  const logSwipeSignal = useCallback(
    async (spot: EnrichedDecisionSpot, direction: SwipeDirection) => {
      const action = direction === "like" ? "exact_mood" : "not_there";

      logMlEvent({
        eventType: direction === "like" ? "decision_like" : "decision_dislike",
        spotId: spot.spot_id,
        rank: activeIndex + 1,
        extraContext: {
          action: direction,
          legacy_action: action,

          spot_name: spot.name,
          category_name: spot.category_name,
          place_type: (spot as any).place_type ?? null,

          human_reason: spot.human_reason ?? null,
          technical_why_this: spot.technical_why_this ?? null,

          matched_tokens: spot.matched_tokens ?? [],
          matched_terms: spot.matched_terms ?? [],
          v13_sources: spot.v13_sources ?? [],
          v13_rank: spot.v13_rank ?? null,
          v13_combined_score: spot.v13_combined_score ?? null,
          v13_semantic_rank: spot.v13_semantic_rank ?? null,
          v13_semantic_similarity: spot.v13_semantic_similarity ?? null,
          v13_v12_rank: spot.v13_v12_rank ?? null,
          v13_v12_score: spot.v13_v12_score ?? null,
        },
      });

      if (decisionId) {
        supabase
          .rpc("log_decision_action_v1", {
            p_decision_id: decisionId,
            p_spot_id: spot.spot_id,
            p_action: action,
          })
          .then(({ error }) => {
            if (error) console.log("decision swipe action log error", error);
          });
      }

      supabase
        .rpc("backyrd_log_taste_event_v3", {
          p_spot_id: spot.spot_id,
          p_event_type: action,
          p_cap: TASTE_CAP,
          p_conf_inc: direction === "like" ? TASTE_CONF_INC * 1.4 : TASTE_CONF_INC,
        })
        .then(({ error }) => {
          if (error) console.log("taste v3 swipe error", error);
        });
    },
    [activeIndex, decisionId, logMlEvent]
  );

  const advanceCard = useCallback(
    (direction: SwipeDirection) => {
      const spot = spots[activeIndex];
      if (!spot) return;

      logSwipeSignal(spot, direction);
      setActiveIndex((current) => Math.min(current + 1, spots.length));
    },
    [activeIndex, spots, logSwipeSignal]
  );

  const runDecision = useCallback(
    async (options?: { remix?: boolean }) => {
      const isRemix = Boolean(options?.remix);

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
        logMlEvent({
          eventType: "decision_remix",
          spotId: null,
          rank: null,
          extraContext: {
            reason: "user_requested_new_deck",
            previous_seen_spot_ids: seenSpotIds,
            model: "decision-v13",
            input_mode: inputMode,
            selected_directions: selectedDirections,
            selected_audiences: selectedAudiences,
            selected_moods: selectedMoods,
          },
        });
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
        setStatus(isRemix ? "deciding" : "checking");
        setErrorMessage(null);
        setSpots([]);
        setContext(null);
        setCopy(null);
        setDecisionId(null);
        setDecisionRunContext(null);
        setActiveIndex(0);

        if (!isRemix) {
          setSeenSpotIds([]);
          setRemixCount(0);
        }

        const needsOnboarding = await checkNeedsDecisionOnboarding();

        if (needsOnboarding) {
          setStatus("idle");
          router.push("/(tabs)/decision-onboarding");
          return;
        }

        setStatus("deciding");

        const ctx = await loadContext();
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
          body: {
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
            excludeSpotIds: isRemix ? seenSpotIds : [],
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (error) throw error;

        if (!data?.ok) {
          throw new Error(data?.error || "Decision V13 konnte nicht geladen werden.");
        }

        const runContext: Record<string, unknown> = {
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
        const v13Rows = candidates.map(mapV13CandidateToDecisionRow).filter((row) => row?.spot_id);

        const pickedRows = pickDecisionBatch({
          rows: v13Rows,
          alreadySeenIds: isRemix ? seenSpotIds : [],
          limit: VISIBLE_DECISION_LIMIT,
        });

        const enriched = await enrichSpots(pickedRows);

        if (enriched.length === 0) {
          setSpots([]);
          setContext(ctx);
          setStatus("empty");
          setDeckMode(false);
          return;
        }

        const newSeenIds = Array.from(
          new Set([...(isRemix ? seenSpotIds : []), ...enriched.map((spot) => spot.spot_id)])
        );

        setSeenSpotIds(newSeenIds);

        if (isRemix) {
          setRemixCount((current) => current + 1);
        }

        setStatus("writing");

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
        setContext({
          ...ctx,
          title: generatedCopy.title,
          body: generatedCopy.body,
        });
        setCopy(generatedCopy);
        setDecisionRunContext(runContext);

        const persistedDecisionId = await persistDecisionSession(enriched, generatedCopy);

        for (let i = 0; i < enriched.length; i += 1) {
          logMlEvent({
            eventType: "decision_impression",
            spotId: enriched[i].spot_id,
            rank: i + 1,
            decisionIdOverride: persistedDecisionId,
            extraContext: {
              ...runContext,

              spot_name: enriched[i].name,
              category_name: enriched[i].category_name,
              place_type: (enriched[i] as any).place_type ?? null,

              human_reason: enriched[i].human_reason ?? null,
              technical_why_this: enriched[i].technical_why_this ?? null,

              ai_copy_source: generatedCopy.source,
              v13_mode: data.mode,
              v13_sources: enriched[i].v13_sources ?? [],
              v13_rank: enriched[i].v13_rank ?? null,
              v13_combined_score: enriched[i].v13_combined_score ?? null,
              v13_semantic_rank: enriched[i].v13_semantic_rank ?? null,
              v13_semantic_similarity: enriched[i].v13_semantic_similarity ?? null,
              v13_v12_rank: enriched[i].v13_v12_rank ?? null,
              v13_v12_score: enriched[i].v13_v12_score ?? null,
              matched_tokens: enriched[i].matched_tokens ?? [],
              matched_terms: enriched[i].matched_terms ?? [],
            },
          });
        }

        setStatus("success");
        setDeckMode(true);
      } catch (error: any) {
        console.log("decision error", error);
        setErrorMessage(error?.message ?? "Decision konnte nicht geladen werden.");
        setStatus("error");
        setDeckMode(false);
        Alert.alert("Fehler", error?.message ?? "Decision konnte nicht geladen werden.");
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
      router,
      checkNeedsDecisionOnboarding,
      loadContext,
      enrichSpots,
      persistDecisionSession,
      logMlEvent,
    ]
  );

  const onOpenSpot = useCallback(
    async (spotId: string) => {
      const spot = spots.find((item) => item.spot_id === spotId) ?? spots[activeIndex] ?? null;

      logMlEvent({
        eventType: "decision_open",
        spotId,
        rank: activeIndex + 1,
        extraContext: {
          action: "open_spot_detail",

          spot_name: spot?.name ?? null,
          category_name: spot?.category_name ?? null,
          place_type: (spot as any)?.place_type ?? null,

          human_reason: spot?.human_reason ?? null,
          technical_why_this: spot?.technical_why_this ?? null,

          matched_tokens: spot?.matched_tokens ?? [],
          matched_terms: spot?.matched_terms ?? [],
          v13_sources: spot?.v13_sources ?? [],
          v13_rank: spot?.v13_rank ?? null,
          v13_combined_score: spot?.v13_combined_score ?? null,
          v13_semantic_rank: spot?.v13_semantic_rank ?? null,
          v13_semantic_similarity: spot?.v13_semantic_similarity ?? null,
          v13_v12_rank: spot?.v13_v12_rank ?? null,
          v13_v12_score: spot?.v13_v12_score ?? null,
        },
      });

      if (decisionId) {
        supabase
          .rpc("log_decision_action_v1", {
            p_decision_id: decisionId,
            p_spot_id: spotId,
            p_action: "tapped",
          })
          .then(({ error }) => {
            if (error) console.log("tapped log error", error);
          });
      }

      supabase
        .rpc("backyrd_log_taste_event_v3", {
          p_spot_id: spotId,
          p_event_type: "tapped",
          p_cap: TASTE_CAP,
          p_conf_inc: TASTE_CONF_INC,
        })
        .then(({ error }) => {
          if (error) console.log("taste v3 tapped error", error);
        });

      router.push(`/spot/${spotId}` as any);
    },
    [activeIndex, decisionId, logMlEvent, router, spots]
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
        onSwipe={advanceCard}
        onOpenSpot={onOpenSpot}
        onBack={() => setDeckMode(false)}
        onSettings={() => setDeckMode(false)}
        onRemix={() => runDecision({ remix: true })}
      />
    );
  }

  const badge = context ? modeBadge(context.decision_mode, copy?.source) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "left", "right"]}>
      <Stack.Screen
        options={{
          title: "Decision",
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
            paddingHorizontal: 22,
            paddingTop: 18,
            paddingBottom: 112,
            justifyContent: "center",
          }}
        >
          <View style={{ marginBottom: 28 }}>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: "rgba(244,235,221,0.08)",
                borderWidth: 1,
                borderColor: "rgba(244,235,221,0.14)",
                marginBottom: 18,
              }}
            >
              <Text
                style={{
                  color: "rgba(244,235,221,0.9)",
                  fontSize: 12,
                  fontWeight: "900",
                  letterSpacing: 0.2,
                }}
              >
                Decision
              </Text>
            </View>

            <Text
              style={{
                color: theme.text,
                fontSize: 44,
                lineHeight: 47,
                fontWeight: "950",
                letterSpacing: -1.55,
              }}
            >
              Wohin jetzt?
            </Text>

            <Text
              style={{
                color: "rgba(255,255,255,0.54)",
                marginTop: 12,
                fontSize: 16,
                lineHeight: 23,
                maxWidth: 330,
                fontWeight: "600",
              }}
            >
              Wähle eine Richtung oder beschreib frei, was du gerade suchst. Stimmung ist optional.
            </Text>
          </View>

          <View
            style={{
              borderRadius: 38,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
              backgroundColor: "rgba(255,255,255,0.055)",
              shadowColor: "#000",
              shadowOpacity: 0.3,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 18 },
            }}
          >
            <LinearGradient
              colors={["rgba(255,255,255,0.085)", "rgba(255,255,255,0.035)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 18 }}
            >
              <View
                style={{
                  borderRadius: 28,
                  backgroundColor: "rgba(0,0,0,0.18)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.085)",
                  paddingHorizontal: 18,
                  paddingVertical: 16,
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 11,
                    fontWeight: "950",
                    letterSpacing: 1.1,
                    textTransform: "uppercase",
                    marginBottom: 9,
                  }}
                >
                  Stadt
                </Text>

                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="Basel"
                  placeholderTextColor="rgba(255,255,255,0.26)"
                  autoCorrect={false}
                  returnKeyType="next"
                  style={{
                    color: theme.text,
                    paddingHorizontal: 0,
                    paddingVertical: 2,
                    fontWeight: "950",
                    fontSize: 29,
                    letterSpacing: -0.75,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  padding: 4,
                  borderRadius: 999,
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
                    borderRadius: 28,
                    backgroundColor: "rgba(0,0,0,0.18)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.085)",
                    paddingHorizontal: 18,
                    paddingVertical: 16,
                  }}
                >
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.42)",
                      fontSize: 11,
                      fontWeight: "950",
                      letterSpacing: 1.1,
                      textTransform: "uppercase",
                      marginBottom: 9,
                    }}
                  >
                    Was suchst du?
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
                          fontWeight: "950",
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
                          fontWeight: "950",
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
                          fontWeight: "950",
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
                          fontWeight: "950",
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
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: loading || !canRun ? "rgba(255,255,255,0.11)" : theme.cream,
                  shadowColor: "#000",
                  shadowOpacity: loading || !canRun ? 0 : 0.28,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 12 },
                }}
              >
                {loading ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "950", fontSize: 15 }}>
                      {status === "writing" ? "Einen Moment…" : "Suche Spots…"}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      color: canRun ? theme.ink : "rgba(255,255,255,0.45)",
                      fontWeight: "950",
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
                <Text style={{ color: theme.text, fontWeight: "950", fontSize: 17, flex: 1 }}>{context.title}</Text>

                {badge && (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: badge.border,
                      backgroundColor: badge.bg,
                    }}
                  >
                    <Text style={{ color: theme.text, fontWeight: "950", fontSize: 11 }}>{badge.label}</Text>
                  </View>
                )}
              </View>

              <Pressable
                onPress={() => setDeckMode(true)}
                style={{
                  marginTop: 13,
                  height: 48,
                  borderRadius: 999,
                  backgroundColor: "rgba(244,235,221,0.94)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#111", fontWeight: "950", fontSize: 15 }}>Deck öffnen</Text>
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
              <Text style={{ color: theme.text, fontWeight: "950", fontSize: 15 }}>Kurz gestolpert.</Text>
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
              <Text style={{ color: theme.text, fontWeight: "950", fontSize: 15 }}>Noch kein Treffer.</Text>
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
        backgroundColor: active ? theme.cream : "transparent",
      }}
    >
      <Text
        style={{
          color: active ? theme.ink : "rgba(255,255,255,0.62)",
          fontWeight: "950",
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
          fontWeight: "950",
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
        backgroundColor: active ? "rgba(244,235,221,0.94)" : "rgba(0,0,0,0.18)",
        borderWidth: 1,
        borderColor: active ? "rgba(244,235,221,0.62)" : "rgba(255,255,255,0.1)",
      }}
    >
      <Text
        style={{
          color: active ? theme.ink : "rgba(255,255,255,0.76)",
          fontWeight: "950",
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
  onSwipe,
  onOpenSpot,
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
  onSwipe: (direction: SwipeDirection) => void;
  onOpenSpot: (spotId: string) => void;
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
              <Text style={{ color: "#fff", fontSize: 34, lineHeight: 38, fontWeight: "950", letterSpacing: -1 }}>
                Noch nicht das Richtige?
              </Text>

              <Text style={{ color: "rgba(255,255,255,0.62)", marginTop: 10, fontSize: 15, lineHeight: 22 }}>
                Ich habe deine Swipes gespeichert. Willst du deine Moods anpassen oder weiter entdecken?
              </Text>

              <Pressable
                onPress={onRemix}
                style={{
                  marginTop: 20,
                  height: 56,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.cream,
                }}
              >
                <Text style={{ color: theme.ink, fontWeight: "950", fontSize: 15 }}>
                  Ich will mehr entdecken{remixCount > 0 ? ` · Mix ${remixCount + 2}` : ""}
                </Text>
              </Pressable>

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
          onSwipe={onSwipe}
          onOpen={() => onOpenSpot(currentSpot.spot_id)}
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
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(12,12,13,0.72)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.13)",
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: label === "≡" ? 25 : 30,
          fontWeight: "300",
          marginTop: label === "×" ? -3 : -1,
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
  onSwipe,
  onOpen,
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
  onSwipe: (direction: SwipeDirection) => void;
  onOpen: () => void;
  onBack: () => void;
  onSettings: () => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const isAnimatingRef = useRef(false);

  const likeProgress = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const dislikeProgress = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const likeScale = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [1, 1.18],
    extrapolate: "clamp",
  });

  const dislikeScale = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1.18, 1],
    extrapolate: "clamp",
  });

  const cardScale = pan.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: [0.965, 1, 0.965],
    extrapolate: "clamp",
  });

  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ["-7deg", "0deg", "7deg"],
    extrapolate: "clamp",
  });

  const swipeOut = useCallback(
    (direction: SwipeDirection) => {
      if (isAnimatingRef.current) return;

      isAnimatingRef.current = true;
      const x = direction === "like" ? SCREEN_WIDTH * 1.45 : -SCREEN_WIDTH * 1.45;
      const y = -SCREEN_HEIGHT * 0.06;

      Animated.timing(pan, {
        toValue: { x, y },
        duration: 260,
        useNativeDriver: true,
      }).start(() => {
        onSwipe(direction);
        pan.setValue({ x: 0, y: 0 });
        isAnimatingRef.current = false;
      });
    },
    [onSwipe, pan]
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => {
        return Math.abs(gesture.dx) > 5 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.75;
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD || gesture.vx > 0.75) {
          swipeOut("like");
          return;
        }

        if (gesture.dx < -SWIPE_THRESHOLD || gesture.vx < -0.75) {
          swipeOut("dislike");
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
    })
  ).current;

  const imageUrl = spot.photo_url;
  const price = priceToSymbols(spot.price_level);
  const cityLabel = clean(spot.city) || clean(city);
  const itemCopy = getCopyForSpot(copy, spot, index, moodA, moodB);
  const todayHours = clean(spot.opening_hours_summary).replace(/^Heute\s*/i, "") || null;

  return (
    <View style={{ flex: 1, backgroundColor: "#050506" }}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView
        pointerEvents="box-none"
        edges={["top", "left", "right"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 40,
        }}
      >
        <View
          pointerEvents="box-none"
          style={{
            height: 74,
            paddingHorizontal: 18,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <RoundDeckButton label="×" onPress={onBack} />

          <View style={{ alignItems: "center", maxWidth: SCREEN_WIDTH - 160 }}>

          </View>

          <RoundDeckButton label="≡" onPress={onSettings} />
        </View>
      </SafeAreaView>

      <View
        style={{
          flex: 1,
          paddingTop: 110,
          paddingHorizontal: 14,
          paddingBottom: 130,
        }}
      >
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            flex: 1,
            transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }, { scale: cardScale }],
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 38,
              overflow: "hidden",
              backgroundColor: "#111",
              shadowColor: "#000",
              shadowOpacity: 0.36,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 16 },
            }}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                resizeMode="cover"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: "100%",
                  height: "100%",
                }}
              />
            ) : (
              <LinearGradient
                colors={["rgba(244,235,221,0.2)", "#151515", "#070707"]}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                }}
              />
            )}

            <LinearGradient
              colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.1)", "rgba(0,0,0,0.52)", "rgba(0,0,0,0.9)"]}
              locations={[0, 0.34, 0.66, 1]}
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
                right: 26,
                top: "36%",
                opacity: likeProgress,
                transform: [{ scale: likeScale }],
                width: 112,
                height: 112,
                borderRadius: 56,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(120,160,69,0.94)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.42)",
                zIndex: 20,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 48 }}>♡</Text>
            </Animated.View>

            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 26,
                top: "36%",
                opacity: dislikeProgress,
                transform: [{ scale: dislikeScale }],
                width: 112,
                height: 112,
                borderRadius: 56,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(233,80,80,0.94)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.42)",
                zIndex: 20,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "300", fontSize: 58, marginTop: -4 }}>×</Text>
            </Animated.View>

            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
                padding: 18,
              }}
            >
              <Text style={{ color: "rgba(255,255,255,0.64)", fontSize: 12, fontWeight: "800", marginBottom: 10 }}>
                Pick {index + 1} von {total}
              </Text>

              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.88)",
                  marginBottom: 12,
                  maxWidth: "96%",
                }}
              >
                <Text numberOfLines={1} style={{ color: "#111", fontWeight: "950", fontSize: 12 }}>
                  {itemCopy.headline}
                </Text>
              </View>

              <Text
                numberOfLines={2}
                style={{
                  color: "#fff",
                  fontSize: 36,
                  lineHeight: 39,
                  fontWeight: "950",
                  letterSpacing: -1.1,
                }}
              >
                {spot.name}
              </Text>

              <Text
                numberOfLines={2}
                style={{
                  color: "rgba(255,255,255,0.82)",
                  marginTop: 7,
                  fontWeight: "850",
                  fontSize: 15,
                  lineHeight: 21,
                }}
              >
                {itemCopy.subtitle}
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 }}>
                {spot.is_open_now === true && <MiniPill label="jetzt offen" tone="green" />}
                {spot.is_open_now === false && <MiniPill label="gerade zu" tone="red" />}
                {spot.category_name && <MiniPill label={spot.category_name} />}
                {cityLabel && <MiniPill label={cityLabel} />}
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  marginTop: 15,
                }}
              >
                <InfoTile
                  label="Heute"
                  value={todayHours ?? "Keine Zeiten"}
                  tone={spot.is_open_now === true ? "green" : spot.is_open_now === false ? "red" : "neutral"}
                />
                <InfoTile
                  label="Preislevel"
                  value={price ?? "Nicht angegeben"}
                  tone="neutral"
                />
              </View>

              <Pressable
                onPress={onOpen}
                style={{
                  marginTop: 15,
                  height: 52,
                  borderRadius: 999,
                  backgroundColor: "rgba(244,235,221,0.96)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#111", fontWeight: "950", fontSize: 15 }}>Mehr entdecken</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>

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
            height: 118,
            paddingBottom: 12,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 28,
          }}
        >
          <Animated.View style={{ transform: [{ scale: dislikeScale }] }}>
            <Pressable
              onPress={() => swipeOut("dislike")}
              style={{
                width: 68,
                height: 68,
                borderRadius: 34,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#fff",
                shadowColor: "#000",
                shadowOpacity: 0.26,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 10 },
              }}
            >
              <Text style={{ color: theme.red, fontSize: 35, fontWeight: "300", marginTop: -4 }}>×</Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Pressable
              onPress={() => swipeOut("like")}
              style={{
                width: 86,
                height: 86,
                borderRadius: 43,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.green,
                shadowColor: "#000",
                shadowOpacity: 0.3,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 12 },
              }}
            >
              <Text style={{ color: "#fff", fontSize: 46, fontWeight: "700", marginTop: -2 }}>♡</Text>
            </Pressable>
          </Animated.View>

          <Pressable
            onPress={onOpen}
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#fff",
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 13,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <Text style={{ color: "rgba(17,17,17,0.72)", fontSize: 24, fontWeight: "700" }}>?</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function MiniPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "green" | "red" }) {
  const bg =
    tone === "green" ? "rgba(34,197,94,0.17)" : tone === "red" ? "rgba(239,68,68,0.16)" : "rgba(0,0,0,0.32)";

  const border =
    tone === "green" ? "rgba(34,197,94,0.3)" : tone === "red" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.14)";

  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        maxWidth: "100%",
      }}
    >
      <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "850", fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

function InfoTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red";
}) {
  const accent =
    tone === "green" ? "rgba(120,160,69,0.95)" : tone === "red" ? "rgba(233,80,80,0.95)" : "rgba(244,235,221,0.95)";

  return (
    <View
      style={{
        flex: 1,
        minHeight: 68,
        borderRadius: 22,
        paddingHorizontal: 13,
        paddingVertical: 12,
        backgroundColor: "rgba(0,0,0,0.34)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: "rgba(255,255,255,0.48)",
          fontSize: 10,
          fontWeight: "950",
          letterSpacing: 0.9,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          color: accent,
          fontSize: 15,
          lineHeight: 18,
          fontWeight: "950",
          letterSpacing: -0.2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
