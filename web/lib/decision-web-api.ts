import { supabase } from "@/lib/supabase/client";

export type DecisionInputMode = "guided" | "free";
export type DecisionOption = {
  key: string;
  label: string;
  placeTypes?: string[];
  queryHint: string;
};
export const DIRECTION_OPTIONS: DecisionOption[] = [
  {
    key: "restaurant",
    label: "Essen",
    placeTypes: ["restaurant"],
    queryHint: "Restaurant, Essen, Lunch oder Dinner",
  },
  {
    key: "cafe",
    label: "Café",
    placeTypes: ["cafe"],
    queryHint: "Café, Kaffee, gemütlich sitzen",
  },
  {
    key: "bar",
    label: "Drinks",
    placeTypes: ["bar"],
    queryHint: "Bar, Drinks, Cocktails oder Wein",
  },
  {
    key: "culture",
    label: "Kultur",
    placeTypes: ["culture"],
    queryHint: "Museum, Kunst, Galerie oder Kultur",
  },
  {
    key: "activity",
    label: "Aktivität",
    placeTypes: ["activity", "experience"],
    queryHint: "Aktivität, Erlebnis, etwas unternehmen",
  },
  {
    key: "outing",
    label: "Ausflug",
    placeTypes: ["outing", "experience"],
    queryHint: "Ausflug, rausgehen, entdecken",
  },
];
export const AUDIENCE_OPTIONS: DecisionOption[] = [
  {
    key: "kids",
    label: "Mit Kind",
    placeTypes: ["activity", "culture", "outing", "experience", "cafe"],
    queryHint: "kinderfreundlich, mit Kind, Familie",
  },
  {
    key: "date",
    label: "Date",
    placeTypes: ["restaurant", "bar", "cafe", "culture"],
    queryHint: "Date, romantisch, persönlich",
  },
  {
    key: "friends",
    label: "Freunde",
    placeTypes: ["bar", "restaurant", "activity", "cafe"],
    queryHint: "mit Freunden, Gruppe, locker",
  },
  {
    key: "solo",
    label: "Allein",
    placeTypes: ["cafe", "culture", "outing"],
    queryHint: "alleine, solo, me time",
  },
];
export const MOOD_OPTIONS: DecisionOption[] = [
  { key: "cozy", label: "Cozy", queryHint: "cozy gemütlich warm" },
  { key: "quiet", label: "Ruhig", queryHint: "ruhig nicht laut entspannt" },
  {
    key: "inspiring",
    label: "Inspirierend",
    queryHint: "inspirierend kreativ besonders",
  },
  { key: "urban", label: "Urban", queryHint: "urban städtisch modern" },
  { key: "chic", label: "Chic", queryHint: "chic stilvoll schön" },
  {
    key: "lively",
    label: "Lebhaft",
    queryHint: "lebhaft energie gute stimmung",
  },
];

const REQUEST_VERSION = "backyrd.decision-vnext.product-request@1.0" as const;
const RESPONSE_VERSION = "backyrd.decision-vnext.product-response@1.0" as const;
const PRESENTATION_VERSION = "backyrd.decision-vnext.product-presentation@1.0" as const;
const RANKING_POLICY_VERSION = "backyrd.decision-vnext.product-ranking-policy@1.0" as const;
const INTERPRETATION_VERSION = "backyrd.decision-vnext.product-context@1.0" as const;
const INTERACTION_REQUEST_VERSION = "backyrd.decision-vnext.product-interaction-request@1.0" as const;
const INTERACTION_RESPONSE_VERSION = "backyrd.decision-vnext.product-interaction-response@1.0" as const;
const HASH = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

type DecisionProductRequest = {
  contractVersion: typeof REQUEST_VERSION;
  requestId: string;
  idempotencyKey: string;
  naturalLanguage: string;
  explicit: { targetCity?: string | null; moods?: string[] };
  alternativeRequested: boolean;
  previouslyPresentedCandidateIds: string[];
  rejectedCandidateIds: string[];
};

type ProductReason = {
  code: string;
  domain: "WORLD" | "USER" | "CONTEXT" | "ELIGIBILITY" | "RANKING" | "LIMITATION";
  sourceHash: string;
  statement: string;
  confirmed: boolean;
};

export type DecisionResult = {
  spotId: string;
  presentation: {
    contractVersion: typeof PRESENTATION_VERSION;
    spotId: string;
    name: string;
    locality: string | null;
    categoryLabel: string | null;
    imageUrl: string | null;
    sourceHash: string;
    presentationHash: string;
  };
  tier: "ELIGIBLE_CONFIRMED" | "UNCONFIRMED_FALLBACK" | "NOT_CONFIGURED" | "INELIGIBLE";
  rank: number | null;
  coreIntentCoverage: "CONFIRMED" | "UNKNOWN" | "NOT_CONFIGURED" | "INCOMPATIBLE" | "DISPUTED" | "NOT_APPLICABLE";
  actualAvailability: "open" | "closed" | "unknown" | "not_authorized" | "expired" | "disputed" | "not_requested";
  confirmedHardConstraints: string[];
  unknownHardConstraints: string[];
  failedHardConstraints: string[];
  rankVector: Record<string, unknown> & { vectorHash: string };
  reasons: ProductReason[];
  limitations: string[];
  contextualReject: boolean;
  candidateHash: string;
};

type DecisionProductResponse = {
  contractVersion: typeof RESPONSE_VERSION;
  status: "AVAILABLE";
  decisionId: string;
  requestHash: string;
  envelopeHash: string;
  rankingPolicyVersion: typeof RANKING_POLICY_VERSION;
  rankingPolicyHash: string;
  interpretation: Record<string, unknown> & { interpretationHash: string; rawTextPersisted: false };
  primaryCandidateId: string | null;
  candidates: DecisionResult[];
  limitations: string[];
  alternative: { requested: boolean; selectedCandidateId: string | null; negativeSignalProduced: false };
  reject: { candidateIds: string[]; contextualOnly: true; worldFactProduced: false };
  personalization: { state: "ACTIVE" | "NEUTRAL"; neutralReason: string | null; projectionHash: string };
  learning: { mode: "CONSENT_BOUND_EVENTS" | "DISABLED_NEUTRAL"; acknowledgement: "CONSENT_BOUND_IDEMPOTENT" | "NOT_APPLICABLE_NEUTRAL"; eventCount: number; rawTextIncluded: false };
  productOutputAuthorized: true;
  legacyEngineUsed: false;
  fallbackUsed: false;
  resultHash: string;
};

export type DecisionRun = {
  decisionId: string;
  personalized: boolean;
  primaryCandidateId: string | null;
  limitations: string[];
  alternativeAvailable: boolean;
  presentedCandidateIds: string[];
  rejectedCandidateIds: string[];
  results: DecisionResult[];
};
export type DecisionRequest = {
  city: string;
  inputMode: DecisionInputMode;
  rawFreeText?: string | null;
  directions: string[];
  audiences: string[];
  moods: string[];
  moodA?: string;
  moodB?: string;
};

export type DecisionAction = {
  alternativeRequested: boolean;
  previouslyPresentedCandidateIds: string[];
  rejectedCandidateIds: string[];
};

const clean = (value?: string | null) =>
  (value ?? "").trim().replace(/\s+/g, " ");
const unique = <T>(items: T[]) => Array.from(new Set(items));
const labels = (options: DecisionOption[], keys: string[]) =>
  keys
    .map((key) => options.find((option) => option.key === key)?.label)
    .filter(Boolean)
    .join(" + ");
const hints = (options: DecisionOption[], keys: string[]) =>
  keys.flatMap(
    (key) => options.find((option) => option.key === key)?.queryHint ?? [],
  );

function buildNaturalLanguage(input: DecisionRequest) {
  const city = clean(input.city) || "Basel";
  const directionLabel = labels(DIRECTION_OPTIONS, input.directions);
  const audienceLabel = labels(AUDIENCE_OPTIONS, input.audiences);
  const moodLabel = labels(MOOD_OPTIONS, input.moods);
  const moodText = [clean(input.moodA), clean(input.moodB), moodLabel]
    .filter(Boolean)
    .join(" + ");
  const free = input.inputMode === "free" ? clean(input.rawFreeText) : "";
  const query = free
    ? [
        free,
        `Ort in ${city}`,
        directionLabel ? `Gewünschte Richtung: ${directionLabel}` : null,
        audienceLabel ? `Situation: ${audienceLabel}` : null,
        moodText ? `Stimmung: ${moodText}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : [
        directionLabel ? `Richtung: ${directionLabel}` : null,
        audienceLabel ? `Situation: ${audienceLabel}` : null,
        moodText ? `Stimmung: ${moodText}` : null,
        unique([
          ...hints(DIRECTION_OPTIONS, input.directions),
          ...hints(AUDIENCE_OPTIONS, input.audiences),
          ...hints(MOOD_OPTIONS, input.moods),
        ]).join(", ") || null,
        `Ort in ${city}`,
      ]
        .filter(Boolean)
        .join("\n");
  return { city, query };
}

const uniqueIdentifiers = (values: string[]) => unique(values.filter((value) => IDENTIFIER.test(value))).slice(0, 50);

export function buildCanonicalDecisionRequest(
  input: DecisionRequest,
  action: DecisionAction = { alternativeRequested: false, previouslyPresentedCandidateIds: [], rejectedCandidateIds: [] },
): DecisionProductRequest {
  const { city, query } = buildNaturalLanguage(input);
  const requestId = crypto.randomUUID();
  const explicit: DecisionProductRequest["explicit"] = {
    moods: uniqueIdentifiers(input.moods),
  };
  if (IDENTIFIER.test(city)) explicit.targetCity = city;
  return {
    contractVersion: REQUEST_VERSION,
    requestId,
    idempotencyKey: requestId,
    naturalLanguage: query,
    explicit,
    alternativeRequested: action.alternativeRequested,
    previouslyPresentedCandidateIds: uniqueIdentifiers(action.previouslyPresentedCandidateIds),
    rejectedCandidateIds: uniqueIdentifiers(action.rejectedCandidateIds),
  };
}

async function sessionToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token)
    throw new Error("Bitte melde dich an, um Für jetzt zu nutzen.");
  return data.session.access_token;
}

const unavailable = () => new Error("Die aktuelle Decision ist gerade nicht verfügbar.");
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
};
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw unavailable();
};
const identifier = (value: unknown): value is string => typeof value === "string" && value.length <= 160 && IDENTIFIER.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && HASH.test(value);
const strings = (value: unknown, maximum: number): value is string[] => Array.isArray(value) && value.length <= maximum && value.every(identifier);
const enumValue = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === "string" && values.includes(value as T);
const nullableIdentifier = (value: unknown) => value === null || identifier(value);

function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (entry === null || typeof entry === "boolean") return entry;
    if (typeof entry === "string") return entry.normalize("NFC");
    if (typeof entry === "number" && Number.isFinite(entry)) return Object.is(entry, -0) ? 0 : entry;
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, normalize((entry as Record<string, unknown>)[key])]));
    }
    throw unavailable();
  };
  return JSON.stringify(normalize(value));
}

async function contentHash(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function assertContentHash(value: Record<string, unknown>, field: string) {
  const claimed = value[field];
  if (!hash(claimed)) throw unavailable();
  const body = { ...value };
  delete body[field];
  if (await contentHash(body) !== claimed) throw unavailable();
}

async function validateInterpretation(value: unknown) {
  const item = record(value);
  exactKeys(item, ["contractVersion", "resolverVersion", "inputHash", "primaryIntent", "secondaryIntent", "intentCompatibility", "occasion", "moods", "targetCity", "dateTime", "group", "budget", "stayDuration", "hardConstraints", "softPreferences", "unresolvedTerms", "locationAuthority", "limitations", "rawTextPersisted", "interpretationHash"]);
  if (item.contractVersion !== INTERPRETATION_VERSION || !identifier(item.resolverVersion) || !hash(item.inputHash) || !hash(item.interpretationHash) || item.rawTextPersisted !== false) throw unavailable();
  if (!nullableIdentifier(item.primaryIntent) || !nullableIdentifier(item.secondaryIntent) || !nullableIdentifier(item.occasion) || !nullableIdentifier(item.targetCity) || (item.stayDuration !== null && !enumValue(item.stayDuration, ["SHORT", "MEDIUM", "LONG"]))) throw unavailable();
  if (!enumValue(item.intentCompatibility, ["COMPATIBLE", "INCOMPATIBLE", "NOT_APPLICABLE", "UNKNOWN"])) throw unavailable();
  if (!strings(item.moods, 12) || !strings(item.hardConstraints, 30) || !strings(item.softPreferences, 30) || !Array.isArray(item.unresolvedTerms) || item.unresolvedTerms.length > 30 || !item.unresolvedTerms.every((term) => typeof term === "string" && term.length > 0 && term.length <= 120) || !strings(item.limitations, 30)) throw unavailable();
  const knowledge = ["KNOWN", "UNKNOWN", "NOT_CONFIGURED", "NOT_AVAILABLE", "DENIED"] as const;
  const dateTime = record(item.dateTime);
  exactKeys(dateTime, ["state", "localDate", "dayPhase", "timeZone"]);
  if (!enumValue(dateTime.state, knowledge) || (dateTime.localDate !== null && (typeof dateTime.localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateTime.localDate))) || !nullableIdentifier(dateTime.dayPhase) || (dateTime.timeZone !== null && typeof dateTime.timeZone !== "string")) throw unavailable();
  const group = record(item.group);
  exactKeys(group, ["size", "minimumAge", "adultPresent", "companionType"]);
  if ((group.size !== null && (!Number.isInteger(group.size) || (group.size as number) < 0)) || (group.minimumAge !== null && (!Number.isInteger(group.minimumAge) || (group.minimumAge as number) < 0)) || typeof group.adultPresent !== "boolean" || !nullableIdentifier(group.companionType)) throw unavailable();
  const budget = record(item.budget);
  exactKeys(budget, ["state", "amount", "currency", "perPerson", "calibrationLabel"]);
  if (!enumValue(budget.state, knowledge) || (budget.amount !== null && (!Number.isInteger(budget.amount) || (budget.amount as number) < 0)) || !["CHF", null].includes(budget.currency as "CHF" | null) || typeof budget.perPerson !== "boolean" || !nullableIdentifier(budget.calibrationLabel)) throw unavailable();
  const locationAuthority = record(item.locationAuthority);
  exactKeys(locationAuthority, ["explicitTargetWins", "authorizedCity", "deviceCityUsed", "state"]);
  if (locationAuthority.explicitTargetWins !== true || !nullableIdentifier(locationAuthority.authorizedCity) || typeof locationAuthority.deviceCityUsed !== "boolean" || !enumValue(locationAuthority.state, knowledge)) throw unavailable();
  await assertContentHash(item, "interpretationHash");
  return item as DecisionProductResponse["interpretation"];
}

async function validateCandidate(value: unknown, expectedRank: number | null): Promise<DecisionResult> {
  const item = record(value);
  exactKeys(item, ["spotId", "presentation", "tier", "rank", "coreIntentCoverage", "actualAvailability", "confirmedHardConstraints", "unknownHardConstraints", "failedHardConstraints", "rankVector", "reasons", "limitations", "contextualReject", "candidateHash"]);
  if (!identifier(item.spotId) || item.rank !== expectedRank || typeof item.contextualReject !== "boolean") throw unavailable();
  if (!enumValue(item.tier, ["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "NOT_CONFIGURED", "INELIGIBLE"]) || !enumValue(item.coreIntentCoverage, ["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "INCOMPATIBLE", "DISPUTED", "NOT_APPLICABLE"]) || !enumValue(item.actualAvailability, ["open", "closed", "unknown", "not_authorized", "expired", "disputed", "not_requested"])) throw unavailable();
  for (const key of ["confirmedHardConstraints", "unknownHardConstraints", "failedHardConstraints", "limitations"] as const) if (!strings(item[key], 40)) throw unavailable();
  const presentation = record(item.presentation);
  exactKeys(presentation, ["contractVersion", "spotId", "name", "locality", "categoryLabel", "imageUrl", "sourceHash", "presentationHash"]);
  if (presentation.contractVersion !== PRESENTATION_VERSION || presentation.spotId !== item.spotId || typeof presentation.name !== "string" || presentation.name.length < 1 || presentation.name.length > 160 || (presentation.locality !== null && !identifier(presentation.locality)) || (presentation.categoryLabel !== null && typeof presentation.categoryLabel !== "string") || (presentation.imageUrl !== null && (typeof presentation.imageUrl !== "string" || !presentation.imageUrl.startsWith("https://"))) || !hash(presentation.sourceHash)) throw unavailable();
  await assertContentHash(presentation, "presentationHash");
  const rankVector = record(item.rankVector);
  exactKeys(rankVector, ["hardConstraintState", "eligibilityTier", "coreIntentState", "primaryVisitPurposeState", "actualAvailability", "userRelevance", "contextFit", "worldEvidence", "neutralIdentity", "vectorHash"]);
  if (!enumValue(rankVector.hardConstraintState, ["PASS", "UNKNOWN", "FAIL"]) || !enumValue(rankVector.eligibilityTier, ["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "NOT_CONFIGURED", "INELIGIBLE"]) || !enumValue(rankVector.coreIntentState, ["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "INCOMPATIBLE", "DISPUTED", "NOT_APPLICABLE"]) || !enumValue(rankVector.actualAvailability, ["open", "closed", "unknown", "not_authorized", "expired", "disputed", "not_requested"]) || !identifier(rankVector.neutralIdentity)) throw unavailable();
  const userRelevance = record(rankVector.userRelevance);
  exactKeys(userRelevance, ["state", "confidence", "sourceHash"]);
  if (!enumValue(rankVector.primaryVisitPurposeState, ["CONFIRMED", "UNKNOWN", "NOT_CONFIGURED", "NOT_APPLICABLE", "DISPUTED", "INCOMPATIBLE"])) throw unavailable();
  if (!enumValue(userRelevance.state, ["POSITIVE_DIRECT", "NEGATIVE_DIRECT", "POSITIVE_TASTE", "NEGATIVE_TASTE", "MIXED_TASTE", "NEUTRAL"]) || typeof userRelevance.confidence !== "number" || userRelevance.confidence < 0 || userRelevance.confidence > 1 || !hash(userRelevance.sourceHash)) throw unavailable();
  const contextFit = record(rankVector.contextFit);
  exactKeys(contextFit, ["secondaryIntentConfirmed", "visitSituationConfirmed", "matchedSoftPreferenceCount", "atmosphereConfirmed", "typicalDaypartConfirmed"]);
  if (typeof contextFit.secondaryIntentConfirmed !== "boolean" || typeof contextFit.visitSituationConfirmed !== "boolean" || !Number.isInteger(contextFit.matchedSoftPreferenceCount) || (contextFit.matchedSoftPreferenceCount as number) < 0 || (contextFit.matchedSoftPreferenceCount as number) > 30 || typeof contextFit.atmosphereConfirmed !== "boolean" || typeof contextFit.typicalDaypartConfirmed !== "boolean") throw unavailable();
  const worldEvidence = record(rankVector.worldEvidence);
  exactKeys(worldEvidence, ["conflictFree", "confirmedReasonCount"]);
  if (typeof worldEvidence.conflictFree !== "boolean" || !Number.isInteger(worldEvidence.confirmedReasonCount) || (worldEvidence.confirmedReasonCount as number) < 0 || (worldEvidence.confirmedReasonCount as number) > 60) throw unavailable();
  await assertContentHash(rankVector, "vectorHash");
  if (!Array.isArray(item.reasons) || item.reasons.length < 1 || item.reasons.length > 80) throw unavailable();
  for (const rawReason of item.reasons) {
    const reason = record(rawReason);
    exactKeys(reason, ["code", "domain", "sourceHash", "statement", "confirmed"]);
    if (!identifier(reason.code) || !enumValue(reason.domain, ["WORLD", "USER", "CONTEXT", "ELIGIBILITY", "RANKING", "LIMITATION"]) || !hash(reason.sourceHash) || typeof reason.statement !== "string" || !reason.statement || typeof reason.confirmed !== "boolean") throw unavailable();
  }
  await assertContentHash(item, "candidateHash");
  return item as unknown as DecisionResult;
}

async function validateResponse(value: unknown, request: DecisionProductRequest): Promise<DecisionProductResponse> {
  const item = record(value);
  exactKeys(item, ["contractVersion", "status", "decisionId", "requestHash", "envelopeHash", "rankingPolicyVersion", "rankingPolicyHash", "interpretation", "primaryCandidateId", "candidates", "limitations", "alternative", "reject", "personalization", "learning", "productOutputAuthorized", "legacyEngineUsed", "fallbackUsed", "resultHash"]);
  if (item.contractVersion !== RESPONSE_VERSION || item.status !== "AVAILABLE" || !identifier(item.decisionId) || !hash(item.envelopeHash) || item.rankingPolicyVersion !== RANKING_POLICY_VERSION || !hash(item.rankingPolicyHash)) throw unavailable();
  if (item.productOutputAuthorized !== true || item.legacyEngineUsed !== false || item.fallbackUsed !== false) throw unavailable();
  if (item.requestHash !== await contentHash(request) || !strings(item.limitations, 60)) throw unavailable();
  await validateInterpretation(item.interpretation);
  const candidates = Array.isArray(item.candidates) ? item.candidates : (() => { throw unavailable(); })();
  if (candidates.length > 40) throw unavailable();
  const ranked = candidates.filter((candidate) => record(candidate).rank !== null);
  const parsed: DecisionResult[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const rank = record(candidates[index]).rank;
    parsed.push(await validateCandidate(candidates[index], rank === null ? null : ranked.indexOf(candidates[index]) + 1));
  }
  if (new Set(parsed.map((candidate) => candidate.spotId)).size !== parsed.length) throw unavailable();
  const rankedIds = new Set(parsed.filter((candidate) => candidate.rank !== null && !candidate.contextualReject).map((candidate) => candidate.spotId));
  if (item.primaryCandidateId !== null && (!identifier(item.primaryCandidateId) || !rankedIds.has(item.primaryCandidateId))) throw unavailable();
  const alternative = record(item.alternative);
  exactKeys(alternative, ["requested", "selectedCandidateId", "negativeSignalProduced"]);
  if (alternative.requested !== request.alternativeRequested || alternative.negativeSignalProduced !== false || (alternative.selectedCandidateId !== null && !identifier(alternative.selectedCandidateId)) || alternative.selectedCandidateId !== (request.alternativeRequested ? item.primaryCandidateId : null)) throw unavailable();
  const reject = record(item.reject);
  exactKeys(reject, ["candidateIds", "contextualOnly", "worldFactProduced"]);
  if (!strings(reject.candidateIds, 50) || canonicalJson(reject.candidateIds) !== canonicalJson(request.rejectedCandidateIds) || reject.contextualOnly !== true || reject.worldFactProduced !== false) throw unavailable();
  const personalization = record(item.personalization);
  exactKeys(personalization, ["state", "neutralReason", "projectionHash"]);
  if (!enumValue(personalization.state, ["ACTIVE", "NEUTRAL"]) || (personalization.neutralReason !== null && !identifier(personalization.neutralReason)) || !hash(personalization.projectionHash)) throw unavailable();
  const learning = record(item.learning);
  exactKeys(learning, ["mode", "acknowledgement", "eventCount", "rawTextIncluded"]);
  if (!enumValue(learning.mode, ["CONSENT_BOUND_EVENTS", "DISABLED_NEUTRAL"]) || !enumValue(learning.acknowledgement, ["CONSENT_BOUND_IDEMPOTENT", "NOT_APPLICABLE_NEUTRAL"]) || !Number.isInteger(learning.eventCount) || (learning.eventCount as number) < 0 || (learning.eventCount as number) > 52 || learning.rawTextIncluded !== false) throw unavailable();
  const response = { ...item, candidates: parsed } as unknown as DecisionProductResponse;
  await assertContentHash(item, "resultHash");
  return response;
}

export async function runWebDecision(input: DecisionRequest, action?: DecisionAction): Promise<DecisionRun> {
  const token = await sessionToken();
  const request = buildCanonicalDecisionRequest(input, action);
  const { data, error } = await supabase.functions.invoke<unknown>("decision-v13", {
    body: request,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error || !data) throw unavailable();
  const response = await validateResponse(data, request);
  const results = response.candidates.filter((candidate) => candidate.rank !== null && !candidate.contextualReject);
  return {
    decisionId: response.decisionId,
    personalized: response.personalization.state === "ACTIVE",
    primaryCandidateId: response.primaryCandidateId,
    limitations: response.limitations,
    alternativeAvailable: response.primaryCandidateId !== null,
    presentedCandidateIds: request.previouslyPresentedCandidateIds,
    rejectedCandidateIds: response.reject.candidateIds,
    results,
  };
}

export async function recordDecisionInteraction(
  decisionId: string,
  candidateId: string,
  eventType: "candidate_impression" | "candidate_opened",
) {
  if (!identifier(decisionId) || !identifier(candidateId)) throw unavailable();
  const token = await sessionToken();
  const actionId = crypto.randomUUID();
  const request = {
    contractVersion: INTERACTION_REQUEST_VERSION,
    actionId,
    idempotencyKey: actionId,
    decisionId,
    eventType,
    candidateId,
  };
  const { data, error } = await supabase.functions.invoke<unknown>("decision-v13", {
    body: request,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error || !data) throw unavailable();
  const response = record(data);
  exactKeys(response, ["contractVersion", "status", "decisionId", "candidateId", "eventType", "legacyWriteUsed", "fallbackUsed"]);
  if (response.contractVersion !== INTERACTION_RESPONSE_VERSION || response.status !== "ACKNOWLEDGED" || response.decisionId !== decisionId || response.candidateId !== candidateId || response.eventType !== eventType || response.legacyWriteUsed !== false || response.fallbackUsed !== false) throw unavailable();
}
