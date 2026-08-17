import { contentHash } from "./canonical-json.mjs";
import { MOMENT_SIGNATURE_CONTRACT, N2_VERSIONS } from "./n2-memory-user-intelligence.mjs";

export const N3_VERSIONS = Object.freeze({
  momentSchema: "backyrd-current-moment-schema-v1",
  inferenceContract: "backyrd-moment-inference-v1",
  provenanceContract: "backyrd-moment-provenance-v1",
  confidenceContract: "backyrd-moment-confidence-v1",
  historySignatureContract: "backyrd-moment-history-signature-v1",
  validationContract: "backyrd-moment-validation-contract-v1",
  flightRecorder: "backyrd-moment-flight-recorder-v1"
});

export const MOMENT_SOURCE_CLASS = Object.freeze({
  EXPLICIT: "EXPLICIT_CURRENT_INPUT",
  OBSERVED: "OBSERVED_CURRENT_FACT",
  INFERRED: "INFERRED_FROM_CURRENT_REQUEST",
  MEMORY: "MEMORY_SUPPORTED_HYPOTHESIS",
  UNKNOWN: "UNKNOWN"
});

const enumField = (values, role = "DESIRE") => Object.freeze({ kind: "ENUM", values: Object.freeze(values), role });
const listField = (values, role = "DESIRE") => Object.freeze({ kind: "LIST", values: Object.freeze(values), role });

export const CURRENT_MOMENT_SCHEMA = Object.freeze({
  social_context: enumField(["solo", "date", "friends", "family", "family_with_kids", "work", "group", "unknown"]),
  occasion: enumField(["breakfast", "lunch", "afterwork", "dinner", "late_night", "celebration", "tourist", "business", "casual", "unknown"]),
  activity_intent: listField(["food", "drink", "walk", "culture", "outing", "activity", "experience", "work", "broad"]),
  vibe: listField(["cozy", "quiet", "relaxed", "lively", "social", "romantic", "playful", "elegant", "authentic", "inspiring", "exploratory"]),
  energy: enumField(["low", "balanced", "high", "unknown"]),
  budget_orientation: enumField(["budget", "balanced", "premium", "unknown"]),
  spontaneity: enumField(["planned", "flexible", "spontaneous", "unknown"]),
  planning_tolerance: enumField(["low", "medium", "high", "unknown"]),
  duration: enumField(["under_60m", "one_to_two_hours", "two_to_four_hours", "open_ended", "unknown"]),
  distance_willingness: enumField(["near", "moderate", "far", "unknown"]),
  environment: enumField(["indoor", "outdoor", "either", "unknown"]),
  orientation: listField(["food", "drink", "activity"]),
  novelty_appetite: enumField(["familiar", "balanced", "novel", "unknown"]),
  social_intensity: enumField(["low", "medium", "high", "unknown"]),
  city: Object.freeze({ kind: "CITY", role: "FACT" }),
  calendar: enumField(["weekday", "weekend"], "FACT"),
  weekday: enumField(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], "FACT"),
  daypart: enumField(["morning", "afternoon", "evening", "night"], "FACT"),
  local_time: Object.freeze({ kind: "LOCAL_TIME", role: "FACT" }),
  explicit_constraints: Object.freeze({ kind: "CONSTRAINTS", role: "AUTHORITY" }),
  other_needs: Object.freeze({ kind: "LIST_TEXT", role: "DESIRE" })
});

const CORE_CONFIDENCE_WEIGHTS = Object.freeze({
  social_context: 0.16,
  activity_intent: 0.18,
  vibe: 0.15,
  occasion: 0.11,
  budget_orientation: 0.08,
  spontaneity: 0.07,
  planning_tolerance: 0.06,
  duration: 0.06,
  distance_willingness: 0.05,
  daypart: 0.04,
  city: 0.04
});

export const N3_INFERENCE_CONTRACT = Object.freeze({
  authorityOrder: Object.freeze([
    MOMENT_SOURCE_CLASS.EXPLICIT,
    MOMENT_SOURCE_CLASS.OBSERVED,
    MOMENT_SOURCE_CLASS.INFERRED,
    MOMENT_SOURCE_CLASS.MEMORY,
    MOMENT_SOURCE_CLASS.UNKNOWN
  ]),
  explicitCurrentIntentAuthoritative: true,
  objectiveFactsNeverRewrittenAsDesire: true,
  memoryMinimumConfidence: 0.55,
  memoryMinimumMatchingAnchors: 2,
  staleMemoryAllowed: false,
  unknownMeaning: "NO_JUSTIFIED_CURRENT_EVIDENCE",
  currentMomentWritesUserIntelligence: false,
  rankingAuthority: "NONE",
  sensitiveInference: "PROHIBITED"
});

export const N3_PROVENANCE_CONTRACT = Object.freeze({
  required: Object.freeze(["sourceClass", "source", "sourceId", "observedAt", "freshness"]),
  allowedSourceClasses: Object.freeze(Object.values(MOMENT_SOURCE_CLASS)),
  latentTruthRuntimeInput: false,
  privateTrustEvidence: false,
  rawHistoryInput: false
});

export const N3_CONFIDENCE_CONTRACT = Object.freeze({
  dimensionRange: Object.freeze([0, 1]),
  overallRange: Object.freeze([0, 1]),
  overallMeaning: "SUFFICIENCY_OF_JUSTIFIED_CORE_MOMENT_EVIDENCE",
  aggregation: "WEIGHTED_KNOWN_CORE_EVIDENCE_WITH_CONTRADICTION_PENALTY",
  levels: Object.freeze({ HIGH: 0.78, PARTIAL: 0.45, LOW: 0 }),
  unknownContribution: 0,
  memoryConfidenceCap: 0.74,
  explicitConfidence: 1,
  observedFactConfidence: 1
});

export const N3_HISTORY_SIGNATURE_CONTRACT = Object.freeze({
  version: N3_VERSIONS.historySignatureContract,
  parent: N2_VERSIONS.memoryEventContract,
  fields: MOMENT_SIGNATURE_CONTRACT.fields,
  rawRequestPersisted: false,
  preciseLocationPersisted: false,
  cityInPatternIdentity: false,
  createdOnlyAfterDecision: true,
  destination: "N2_MEMORY_EVENT:moment_signature_recorded"
});

export const N3_CONTRACT = Object.freeze({
  versions: N3_VERSIONS,
  schema: CURRENT_MOMENT_SCHEMA,
  inference: N3_INFERENCE_CONTRACT,
  provenance: N3_PROVENANCE_CONTRACT,
  confidence: N3_CONFIDENCE_CONTRACT,
  historySignature: N3_HISTORY_SIGNATURE_CONTRACT,
  upstreamAuthority: Object.freeze(["PRODUCT_ELIGIBILITY", "DISTRIBUTION_ELIGIBILITY", "USER_HARD_CONSTRAINTS", "EXPLICIT_CURRENT_INTENT"]),
  downstream: Object.freeze({ N5: "CURRENT_MOMENT_WITH_CONFIDENCE_AND_PROVENANCE", N6: "TOKEN_EFFICIENT_CURRENT_MOMENT" }),
  productionIntegration: "NOT_STARTED"
});

export const N3_CONTRACT_HASH = contentHash(N3_CONTRACT);
export const N3_MOMENT_SCHEMA_HASH = contentHash(CURRENT_MOMENT_SCHEMA);
export const N3_INFERENCE_CONTRACT_HASH = contentHash(N3_INFERENCE_CONTRACT);
export const N3_PROVENANCE_CONTRACT_HASH = contentHash(N3_PROVENANCE_CONTRACT);
export const N3_CONFIDENCE_CONTRACT_HASH = contentHash(N3_CONFIDENCE_CONTRACT);
export const N3_HISTORY_SIGNATURE_CONTRACT_HASH = contentHash(N3_HISTORY_SIGNATURE_CONTRACT);

const FORBIDDEN_KEY = /(latent|ground[_-]?truth|oracle|expected[_-]?utility|evaluation[_-]?label|future[_-]?outcome|fingerprint|contact|wifi|trust[_-]?score|moderation|demographic|religion|sexuality|health)/i;
const SOURCE_PRIORITY = Object.freeze({
  [MOMENT_SOURCE_CLASS.EXPLICIT]: 5,
  [MOMENT_SOURCE_CLASS.OBSERVED]: 4,
  [MOMENT_SOURCE_CLASS.INFERRED]: 3,
  [MOMENT_SOURCE_CLASS.MEMORY]: 2,
  [MOMENT_SOURCE_CLASS.UNKNOWN]: 1
});

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
const normalize = (value) => String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const iso = (value, code = "invalid_timestamp") => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(code);
  return date.toISOString();
};
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

function assertNoForbiddenKeys(value, path = "moment_input") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`forbidden_moment_field:${path}.${key}`);
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

function evidence(dimension, value, confidence, sourceClass, source, sourceId, observedAt, reasonCode, details = {}) {
  return {
    dimension,
    value,
    confidence: clamp(Number(confidence)),
    sourceClass,
    provenance: {
      source,
      sourceId,
      observedAt: iso(observedAt),
      freshness: sourceClass === MOMENT_SOURCE_CLASS.MEMORY ? details.freshness ?? "CURRENT" : "CURRENT",
      ...details
    },
    reasonCode
  };
}

function validateValue(dimension, value) {
  const schema = CURRENT_MOMENT_SCHEMA[dimension];
  if (!schema) throw new Error(`unsupported_moment_dimension:${dimension}`);
  if (schema.kind === "ENUM") {
    const normalized = normalize(value);
    if (!schema.values.includes(normalized)) throw new Error(`invalid_moment_value:${dimension}`);
    return normalized;
  }
  if (schema.kind === "LIST") {
    const values = unique((Array.isArray(value) ? value : [value]).map(normalize));
    if (values.some((item) => !schema.values.includes(item))) throw new Error(`invalid_moment_value:${dimension}`);
    return values.sort();
  }
  if (schema.kind === "CITY") {
    const normalized = normalize(value).replace(/[^a-z0-9 _-]/g, "").slice(0, 80);
    if (!normalized) throw new Error("invalid_moment_value:city");
    return normalized;
  }
  if (schema.kind === "LOCAL_TIME") {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) throw new Error("invalid_moment_value:local_time");
    return String(value);
  }
  if (schema.kind === "CONSTRAINTS") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_moment_value:explicit_constraints");
    return value;
  }
  if (schema.kind === "LIST_TEXT") {
    const values = unique((Array.isArray(value) ? value : [value]).map((item) => String(item).trim().slice(0, 120)));
    return values.sort();
  }
  throw new Error(`unsupported_moment_schema_kind:${schema.kind}`);
}

function add(rows, dimension, value, confidence, sourceClass, source, sourceId, observedAt, reasonCode, details) {
  const normalized = validateValue(dimension, value);
  if (Array.isArray(normalized) && normalized.length === 0) return;
  rows.push(evidence(dimension, normalized, confidence, sourceClass, source, sourceId, observedAt, reasonCode, details));
}

const contains = (text, patterns) => patterns.some((pattern) => pattern.test(text));

function extractExplicitRequestEvidence(request, rows, observedAt) {
  const raw = `${request?.query ?? ""} ${request?.rawFreeText ?? ""}`.trim();
  if (raw.length > 2_000) throw new Error("request_too_long");
  const text = normalize(raw);
  const id = request?.requestId ?? "current_request";
  const source = MOMENT_SOURCE_CLASS.EXPLICIT;

  const social = [
    ["family_with_kids", [/\bmit (?:meinen )?(?:kids?|kindern?)\b/, /\bwith (?:my )?(?:kids?|children)\b/]],
    ["family", [/\bmit (?:der |meiner )?familie\b/, /\bwith (?:my )?family\b/]],
    ["friends", [/\bmit (?:meinen )?freund(?:en|innen)?\b/, /\bwith (?:my )?friends\b/]],
    ["date", [/\bdate\b/, /\bmit (?:meinem |meiner )?partner(?:in)?\b/]],
    ["solo", [/\ballein(?:e)?\b/, /\bsolo\b/, /\bon my own\b/]],
    ["work", [/\bbusiness\b/, /\bgeschaftsessen\b/, /\bwork lunch\b/]],
    ["group", [/\bgruppe\b/, /\bgroup\b/]]
  ].find(([, patterns]) => contains(text, patterns));
  if (social) add(rows, "social_context", social[0], 1, source, "current_request", id, observedAt, "EXPLICIT_SOCIAL_CONTEXT");

  const vibes = [];
  const vibeTerms = {
    cozy: [/\bgemut(?:lich|lichkeit)\b/, /\bco[sz]y\b/], quiet: [/\bruhig\b/, /\bleise\b/, /\bquiet\b/],
    relaxed: [/\bentspannt\b/, /\bchillig\b/, /\brelaxed\b/], lively: [/\blebendig\b/, /\blebhaft\b/, /\blaut\b/, /\blively\b/],
    social: [/\bgesellig\b/, /\bsocial\b/], romantic: [/\bromantisch\b/, /\bromantic\b/],
    elegant: [/\belegant\b/, /\bschick\b/], authentic: [/\bauthentisch\b/, /\bauthentic\b/],
    exploratory: [/\birgendwas cooles\b/, /\bsomething cool\b/]
  };
  for (const [value, patterns] of Object.entries(vibeTerms)) if (contains(text, patterns)) vibes.push(value);
  if (vibes.length) add(rows, "vibe", vibes, text.includes("irgendwas cooles") ? 0.55 : 1, source, "current_request", id, observedAt, "EXPLICIT_VIBE");

  if (contains(text, [/\blow budget\b/, /\bbudget\b/, /\bg[ue]nstig\b/, /\bnicht teuer\b/, /\bpreiswert\b/])) add(rows, "budget_orientation", "budget", 1, source, "current_request", id, observedAt, "EXPLICIT_BUDGET");
  else if (contains(text, [/\bpremium\b/, /\bluxurios\b/, /\bteuer\b/])) add(rows, "budget_orientation", "premium", 1, source, "current_request", id, observedAt, "EXPLICIT_BUDGET");

  const activities = [];
  if (contains(text, [/\bnur (?:etwas )?trinken\b/, /\btrinken\b/, /\bonly drinks?\b/, /\bdrinks?\b/])) activities.push("drink");
  if (contains(text, [/\bessen\b/, /\bfood\b/, /\bdinner\b/, /\blunch\b/])) activities.push("food");
  if (contains(text, [/\brumlaufen\b/, /\bspazieren\b/, /\bwalk(?:ing)?\b/])) activities.push("walk");
  if (contains(text, [/\bmuseum\b/, /\bkultur\b/, /\bculture\b/])) activities.push("culture");
  if (contains(text, [/\bwas machen\b/, /\birgendwas\b/, /\bwhat (?:can|should) (?:i|we) do\b/])) activities.push("broad");
  if (activities.length) {
    add(rows, "activity_intent", activities, activities.includes("broad") ? 0.7 : 1, source, "current_request", id, observedAt, "EXPLICIT_ACTIVITY_INTENT");
    add(rows, "orientation", activities.filter((item) => ["food", "drink", "activity"].includes(item)), 1, source, "current_request", id, observedAt, "EXPLICIT_ORIENTATION");
  }

  if (contains(text, [/\bspontan\b/, /\bspontaneous\b/, /\bgerade angekommen\b/])) add(rows, "spontaneity", "spontaneous", 1, source, "current_request", id, observedAt, "EXPLICIT_SPONTANEITY");
  if (contains(text, [/\bkeine planung\b/, /\bkein bock.*plan/, /\blow friction\b/, /\bunkompliziert\b/])) add(rows, "planning_tolerance", "low", 1, source, "current_request", id, observedAt, "EXPLICIT_LOW_PLANNING_TOLERANCE");
  if (contains(text, [/\bin der nahe\b/, /\bnahe\b/, /\bnearby\b/, /\bkurze distanz\b/])) add(rows, "distance_willingness", "near", 1, source, "current_request", id, observedAt, "EXPLICIT_DISTANCE");
  if (contains(text, [/\bdraussen\b/, /\boutdoor\b/])) add(rows, "environment", "outdoor", 1, source, "current_request", id, observedAt, "EXPLICIT_ENVIRONMENT");
  if (contains(text, [/\bdrinnen\b/, /\bindoor\b/])) add(rows, "environment", "indoor", 1, source, "current_request", id, observedAt, "EXPLICIT_ENVIRONMENT");
  if (contains(text, [/\b(?:zwei|2) stunden\b/, /\b(?:two|2) hours\b/])) add(rows, "duration", "one_to_two_hours", 1, source, "current_request", id, observedAt, "EXPLICIT_DURATION");
  else if (contains(text, [/\b(?:eine|1) stunde\b/, /\b(?:one|1) hour\b/])) add(rows, "duration", "under_60m", 1, source, "current_request", id, observedAt, "EXPLICIT_DURATION");

  if (contains(text, [/\bfeierabend\b/, /\bafter ?work\b/])) {
    add(rows, "occasion", "afterwork", 0.86, MOMENT_SOURCE_CLASS.INFERRED, "request_semantics", id, observedAt, "INFERRED_AFTERWORK");
    if (!rows.some((row) => row.dimension === "spontaneity")) add(rows, "spontaneity", "flexible", 0.68, MOMENT_SOURCE_CLASS.INFERRED, "request_semantics", id, observedAt, "INFERRED_AFTERWORK_FLEXIBILITY");
  }
  if (contains(text, [/\bgeschaftsessen\b/, /\bbusiness lunch\b/])) add(rows, "occasion", "business", 0.95, MOMENT_SOURCE_CLASS.INFERRED, "request_semantics", id, observedAt, "INFERRED_BUSINESS_OCCASION");
  if (contains(text, [/\bgerade angekommen\b/, /\btourist\b/, /\bnew city\b/])) add(rows, "occasion", "tourist", 0.82, MOMENT_SOURCE_CLASS.INFERRED, "request_semantics", id, observedAt, "INFERRED_TOURIST_OCCASION");
  if (contains(text, [/\bkein bock heim\b/, /\bdont want to go home\b/])) add(rows, "planning_tolerance", "low", 0.72, MOMENT_SOURCE_CLASS.INFERRED, "request_semantics", id, observedAt, "INFERRED_LOW_FRICTION_DESIRE");
}

function addStructuredExplicit(explicit, rows, observedAt) {
  if (!explicit) return;
  const allowed = new Set(Object.keys(CURRENT_MOMENT_SCHEMA).filter((key) => CURRENT_MOMENT_SCHEMA[key].role !== "FACT"));
  for (const [dimension, value] of Object.entries(explicit)) {
    if (!allowed.has(dimension)) throw new Error(`unsupported_explicit_moment_field:${dimension}`);
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    add(rows, dimension, value, 1, MOMENT_SOURCE_CLASS.EXPLICIT, "guided_current_input", `guided:${dimension}`, observedAt, "GUIDED_EXPLICIT_INPUT");
  }
}

function addStructuredIntent(structuredIntent, rows, observedAt) {
  if (!structuredIntent) return;
  const hard = structuredIntent.hardConstraints ?? {};
  const constraints = {
    requiredPlaceTypes: unique(hard.requiredPlaceTypes ?? []).sort(),
    excludedPlaceTypes: unique(hard.excludedPlaceTypes ?? []).sort(),
    openNow: hard.openNow === true
  };
  if (constraints.requiredPlaceTypes.length || constraints.excludedPlaceTypes.length || constraints.openNow) {
    add(rows, "explicit_constraints", constraints, 1, MOMENT_SOURCE_CLASS.EXPLICIT, "structured_intent", structuredIntent.version ?? "structured-intent-v1", observedAt, "EXPLICIT_HARD_CONSTRAINTS");
  }
  const orientation = constraints.requiredPlaceTypes.flatMap((type) => type === "restaurant" || type === "cafe" ? ["food"] : type === "bar" || type === "nightlife" ? ["drink"] : ["activity"]);
  if (orientation.length) add(rows, "orientation", orientation, 1, MOMENT_SOURCE_CLASS.EXPLICIT, "structured_intent", structuredIntent.version ?? "structured-intent-v1", observedAt, "EXPLICIT_PLACE_TYPE_ORIENTATION");
}

function localFacts({ now, timeZone }) {
  if (!timeZone) throw new Error("decision_timezone_required");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(now));
  } catch {
    throw new Error("invalid_decision_timezone");
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(now)).map(({ type, value }) => [type, value]));
  const weekday = normalize(parts.weekday);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const daypart = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 22 ? "evening" : "night";
  const calendar = ["saturday", "sunday"].includes(weekday) ? "weekend" : "weekday";
  return { weekday, localTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, daypart, calendar };
}

function addObservedContext(context, rows, observedAt) {
  const now = iso(context?.now ?? observedAt, "invalid_decision_time");
  const facts = localFacts({ now, timeZone: context?.timeZone });
  add(rows, "weekday", facts.weekday, 1, MOMENT_SOURCE_CLASS.OBSERVED, "decision_clock", context.timeZone, observedAt, "OBSERVED_LOCAL_WEEKDAY", { timeZone: context.timeZone });
  add(rows, "calendar", facts.calendar, 1, MOMENT_SOURCE_CLASS.OBSERVED, "decision_clock", context.timeZone, observedAt, "OBSERVED_LOCAL_CALENDAR", { timeZone: context.timeZone });
  add(rows, "daypart", facts.daypart, 1, MOMENT_SOURCE_CLASS.OBSERVED, "decision_clock", context.timeZone, observedAt, "OBSERVED_LOCAL_DAYPART", { timeZone: context.timeZone });
  add(rows, "local_time", facts.localTime, 1, MOMENT_SOURCE_CLASS.OBSERVED, "decision_clock", context.timeZone, observedAt, "OBSERVED_LOCAL_TIME", { timeZone: context.timeZone });

  const location = context?.location;
  if (!location?.city) return;
  if (location.source === "explicit_selected") {
    add(rows, "city", location.city, 1, MOMENT_SOURCE_CLASS.EXPLICIT, "selected_location", location.id ?? "selected_city", observedAt, "EXPLICIT_SELECTED_CITY");
  } else if (location.source === "device" && context.locationConsent === "granted") {
    add(rows, "city", location.city, 0.98, MOMENT_SOURCE_CLASS.OBSERVED, "consented_current_location", location.id ?? "current_city", observedAt, "OBSERVED_CONSENTED_CITY", { precision: "CITY_ONLY" });
  }
}

function currentAnchorMap(resolved) {
  const get = (key) => resolved[key]?.value;
  return {
    audience: get("social_context") === "family_with_kids" ? "family" : get("social_context"),
    daypart: get("daypart"),
    calendar: get("calendar"),
    occasion: get("occasion"),
    friction: get("planning_tolerance"),
    distanceWillingness: get("distance_willingness")
  };
}

function addMemoryPatterns(patterns, rows, provisionalResolved, observedAt, consentState) {
  if (consentState !== "granted") return;
  const anchors = currentAnchorMap(provisionalResolved);
  for (const pattern of patterns ?? []) {
    if (pattern.state !== "KNOWN" || pattern.recencyState === "STALE" || pattern.confidence < N3_INFERENCE_CONTRACT.memoryMinimumConfidence) continue;
    if (pattern.version !== N2_VERSIONS.behavioralPatternContract) throw new Error("memory_pattern_version_mismatch");
    const signature = pattern.contextSignature ?? {};
    const comparable = Object.entries(anchors).filter(([key, value]) => value && signature[key]);
    const matches = comparable.filter(([key, value]) => signature[key] === value).length;
    const conflicts = comparable.length - matches;
    if (conflicts > 0 || matches < N3_INFERENCE_CONTRACT.memoryMinimumMatchingAnchors) continue;
    const confidence = Math.min(N3_CONFIDENCE_CONTRACT.memoryConfidenceCap, pattern.confidence * 0.78 * (matches / comparable.length));
    const details = { patternKey: pattern.patternKey, patternVersion: pattern.version, matchingAnchors: matches, evidenceCount: pattern.evidenceCount, freshness: pattern.recencyState };
    if (signature.friction && !provisionalResolved.planning_tolerance) add(rows, "planning_tolerance", signature.friction, confidence, MOMENT_SOURCE_CLASS.MEMORY, "n2_behavioral_pattern", pattern.patternKey, observedAt, "MEMORY_SUPPORTED_PLANNING_TOLERANCE", details);
    if (signature.distanceWillingness && !provisionalResolved.distance_willingness) add(rows, "distance_willingness", signature.distanceWillingness, confidence, MOMENT_SOURCE_CLASS.MEMORY, "n2_behavioral_pattern", pattern.patternKey, observedAt, "MEMORY_SUPPORTED_DISTANCE", details);
    if (signature.placeType && !provisionalResolved.activity_intent) {
      const activity = ["bar", "nightlife"].includes(signature.placeType) ? "drink" : ["cafe", "restaurant"].includes(signature.placeType) ? "food" : "activity";
      add(rows, "activity_intent", [activity], confidence, MOMENT_SOURCE_CLASS.MEMORY, "n2_behavioral_pattern", pattern.patternKey, observedAt, "MEMORY_SUPPORTED_ACTIVITY", details);
    }
  }
}

function sameValue(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function resolveEvidence(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.dimension)) grouped.set(row.dimension, []);
    grouped.get(row.dimension).push(row);
  }
  const fields = {};
  const contradictions = [];
  for (const dimension of Object.keys(CURRENT_MOMENT_SCHEMA)) {
    const explicitSourcePriority = { guided_current_input: 3, structured_intent: 2, current_request: 1 };
    const candidates = (grouped.get(dimension) ?? []).sort((a, b) => SOURCE_PRIORITY[b.sourceClass] - SOURCE_PRIORITY[a.sourceClass]
      || (explicitSourcePriority[b.provenance.source] ?? 0) - (explicitSourcePriority[a.provenance.source] ?? 0)
      || b.confidence - a.confidence || a.provenance.sourceId.localeCompare(b.provenance.sourceId));
    if (!candidates.length) continue;
    const winner = candidates[0];
    for (const rejected of candidates.slice(1)) {
      if (!sameValue(winner.value, rejected.value)) contradictions.push({
        dimension,
        winningValue: winner.value,
        winningSourceClass: winner.sourceClass,
        rejectedValue: rejected.value,
        rejectedSourceClass: rejected.sourceClass,
        resolution: "HIGHER_AUTHORITY_CURRENT_EVIDENCE_WINS"
      });
    }
    fields[dimension] = { ...winner, alternatives: candidates.slice(1) };
  }
  return { fields, contradictions };
}

function overallConfidence(fields, contradictions) {
  let score = 0;
  for (const [dimension, weight] of Object.entries(CORE_CONFIDENCE_WEIGHTS)) score += weight * (fields[dimension]?.confidence ?? 0);
  const penalty = Math.min(0.18, contradictions.length * 0.025);
  return clamp(score - penalty);
}

function confidenceLevel(score) {
  return score >= N3_CONFIDENCE_CONTRACT.levels.HIGH ? "HIGH" : score >= N3_CONFIDENCE_CONTRACT.levels.PARTIAL ? "PARTIAL" : "LOW";
}

function buildDesireProjection(fields) {
  const dimensions = Object.entries(fields)
    .filter(([key]) => CURRENT_MOMENT_SCHEMA[key].role === "DESIRE")
    .map(([dimension, row]) => ({ dimension, value: row.value, confidence: row.confidence, sourceClass: row.sourceClass, reasonCode: row.reasonCode }));
  return { dimensions, unknown: Object.keys(CURRENT_MOMENT_SCHEMA).filter((key) => CURRENT_MOMENT_SCHEMA[key].role === "DESIRE" && !fields[key]) };
}

export function buildMomentHistorySignature(currentMoment) {
  if (!currentMoment?.fields) throw new Error("current_moment_required");
  const value = (dimension) => currentMoment.fields[dimension]?.value;
  const social = value("social_context");
  const activity = value("activity_intent")?.[0];
  const signature = {
    audience: social === "family_with_kids" ? "family" : ["solo", "date", "friends", "family", "work"].includes(social) ? social : undefined,
    daypart: value("daypart"),
    calendar: value("calendar"),
    occasion: value("occasion") === "unknown" ? undefined : value("occasion"),
    placeType: activity === "food" ? "restaurant" : activity === "drink" ? "bar" : ["culture", "outing", "activity", "experience"].includes(activity) ? activity : undefined,
    friction: value("planning_tolerance") === "unknown" ? undefined : value("planning_tolerance"),
    distanceWillingness: value("distance_willingness") === "unknown" ? undefined : value("distance_willingness")
  };
  const minimized = Object.fromEntries(Object.entries(signature).filter(([, item]) => item));
  return deepFreeze({ version: N3_VERSIONS.historySignatureContract, signature: minimized, rawRequestPersisted: false, preciseLocationPersisted: false, destination: N3_HISTORY_SIGNATURE_CONTRACT.destination, signatureHash: contentHash(minimized) });
}

export function serializeCurrentMomentForN6(currentMoment) {
  if (!currentMoment?.fields || currentMoment.version !== N3_VERSIONS.momentSchema) throw new Error("invalid_current_moment");
  const fields = Object.fromEntries(Object.entries(currentMoment.fields).map(([dimension, row]) => [dimension, { value: row.value, confidence: row.confidence, sourceClass: row.sourceClass }]));
  const compact = { version: currentMoment.version, fields, overallConfidence: currentMoment.overallConfidence, confidenceLevel: currentMoment.confidenceLevel, unknownFields: currentMoment.unknownFields };
  return deepFreeze({ ...compact, projectionHash: contentHash(compact) });
}

export function buildCurrentMoment(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_moment_input");
  assertNoForbiddenKeys(input);
  if (!input.decisionId || !input.request) throw new Error("moment_identity_and_request_required");
  const observedAt = iso(input.observedAt ?? input.context?.now ?? new Date().toISOString(), "invalid_moment_observed_at");
  const rows = [];
  extractExplicitRequestEvidence(input.request, rows, observedAt);
  addStructuredExplicit(input.explicit, rows, observedAt);
  addStructuredIntent(input.structuredIntent, rows, observedAt);
  addObservedContext(input.context ?? {}, rows, observedAt);
  const provisional = resolveEvidence(rows);
  addMemoryPatterns(input.memoryPatterns, rows, provisional.fields, observedAt, input.memoryConsentState ?? "missing");
  const resolved = resolveEvidence(rows);
  const unknownFields = Object.keys(CURRENT_MOMENT_SCHEMA).filter((dimension) => !resolved.fields[dimension]);
  const score = overallConfidence(resolved.fields, resolved.contradictions);
  const body = {
    version: N3_VERSIONS.momentSchema,
    engineVersions: N3_VERSIONS,
    decisionId: String(input.decisionId),
    userId: input.userId ? String(input.userId) : null,
    observedAt,
    immutableForDecision: true,
    fields: resolved.fields,
    desireProjection: buildDesireProjection(resolved.fields),
    unknownFields,
    contradictions: resolved.contradictions,
    memorySupportedEvidence: rows.filter(({ sourceClass }) => sourceClass === MOMENT_SOURCE_CLASS.MEMORY),
    overallConfidence: Number(score.toFixed(6)),
    confidenceLevel: confidenceLevel(score),
    uncertaintyReasonCodes: [
      ...(score < N3_CONFIDENCE_CONTRACT.levels.HIGH ? [score < N3_CONFIDENCE_CONTRACT.levels.PARTIAL ? "MOMENT_UNDERSTANDING_LOW" : "MOMENT_UNDERSTANDING_PARTIAL"] : []),
      ...(unknownFields.length ? ["CURRENT_FIELDS_UNKNOWN"] : []),
      ...(resolved.contradictions.length ? ["CONFLICT_RESOLVED_BY_AUTHORITY"] : []),
      ...(input.memoryConsentState !== "granted" ? ["MEMORY_NOT_USED"] : [])
    ],
    boundaries: {
      ranking: "NOT_IMPLEMENTED",
      userLearning: "N2_ONLY_AFTER_LEGITIMATE_MEMORY_EVENT",
      relevantUserProjection: "N5_NOT_IMPLEMENTED",
      aiDecisionBuddy: "N6_NOT_IMPLEMENTED",
      locationPersistence: "CITY_ONLY_IN_TEMPORARY_MOMENT",
      latentTruthRuntimeInput: false
    }
  };
  const currentMoment = deepFreeze({ ...body, momentHash: contentHash(body) });
  const recorderBody = {
    version: N3_VERSIONS.flightRecorder,
    decisionId: currentMoment.decisionId,
    currentMoment,
    evidence: rows,
    authorityResolution: resolved.contradictions,
    unknownFields,
    memorySupportedEvidence: currentMoment.memorySupportedEvidence,
    overallConfidence: currentMoment.overallConfidence,
    reasonCodes: currentMoment.uncertaintyReasonCodes,
    productionIntegration: "NOT_STARTED"
  };
  return deepFreeze({ currentMoment, historySignature: buildMomentHistorySignature(currentMoment), n6Projection: serializeCurrentMomentForN6(currentMoment), flightRecorder: { ...recorderBody, recorderHash: contentHash(recorderBody) } });
}

export function validateN3ScientificBoundary(value) {
  return !FORBIDDEN_KEY.test(JSON.stringify(value));
}
