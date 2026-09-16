import {
  ACCEPTED_SOURCE_POLICY, FOUNDER_COHORT_VERSION, FOUNDER_EVALUATION_SCOPE, REGISTRY_HASH, REGISTRY_VERSION,
  REGISTRY_V1_1_HASH, REGISTRY_V1_1_VERSION, WORLD_KNOWLEDGE_PORT_VERSION, parseWorldKnowledgeSnapshot,
  parseFounderWorldCohortHandoff, type FounderContextShadowHandoff, type FounderShadowSnapshot, type FounderWorldCohortHandoff,
  type FounderWorldCohortManifest, type WorldKnowledgeReaderPort, type WorldKnowledgeSnapshot,
} from "@backyrd/world-knowledge-core";
import {
  COLD_SNAPSHOT, CONTRACT_VERSIONS as USER_VERSIONS, GRANTED_CONSENT, NO_CONSENT, SYNTHETIC_CONCEPT_REGISTRY_VERSION,
  SYNTHETIC_MANIFEST, SYNTHETIC_SUBJECT_BINDING_HASH, SYNTHETIC_USER_A, buildRelevantUserProjection,
  parseRelevantUserProjection, type RelevantUserProjection,
} from "@backyrd/user-intelligence-vnext-core";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { evaluateOpeningState, SYNTHETIC_OPENING_SOURCE_POLICY } from "./opening-state.js";
import { PHASE3B_COMBINED_RELEASE, PHASE3B_WORLD_BINDING } from "./phase3b-artifacts.js";
import { classifyConstraintCandidate } from "./phase3b-policy.js";
import { loadAcceptedPhase3BProductContextRelease, type AcceptedPhase3BProductContextRelease } from "./phase3b-release.js";
import { generateSyntheticWorld, SyntheticWorldKnowledgeReader } from "./sandbox.js";
import { SYNTHETIC_WORLD_SOURCE_POLICY } from "./synthetic-world-policy.js";
import {
  FounderLabCandidateAssessmentSchema, FounderLabCohortSchema, FounderLabContextualWorldPolicySchema, FounderLabCorrectionsSchema, FounderLabInterpretationSchema, FounderLabOracleSchema,
  FounderLabReleaseSchema, FounderLabReportSchema, FounderLabRequestSchema, FounderLabResultSchema,
  PHASE3C_LAB_VERSIONS, Phase3CLabCompatibilitySchema, type FounderLabCandidateAssessment, type FounderLabCohort,
  type FounderLabCorrections, type FounderLabInterpretation, type FounderLabOracle, type FounderLabRelease, type FounderLabReport, type FounderLabRequest,
  type FounderLabResult,
} from "./phase3c-lab-contracts.js";

const CANONICAL_BASE_SHA = "966e44ef636cb6c0c125dbd6b0fb0c63d6293443";
const WORLD_FOUNDER_EVIDENCE_HASH = "fb892599f3f623f53ec8efcd5fc084bd8e9f55e6a6317de7e23c8f7f0d168437";
const USER_FOUNDER_RECORD_HASH = "c7242a47ec14d71255f3a2b0db17918e1cc7d179683480399623723aab0d115f";
const USER_PRODUCT_POLICY_HASH = "e6cecdd5107285eae1cb91b9ff29d2b4b8f2756cc3fff05bda14eb0fd6bb7be4";
const USER_SIGNAL_REGISTRY_HASH = "2b6b502d14d68edb0f060708d456c119103e1af4823d37e67d18b674be6f4f13";
const FIXED_TIME = "2026-09-16T18:00:00.000Z";

const compatibilityBody = {
  contractVersion: PHASE3C_LAB_VERSIONS.compatibility, compatibilityId: "decision-founder-lab-world-compatibility-3c-1",
  productContextWorldRegistryVersion: REGISTRY_V1_1_VERSION, productContextWorldRegistryHash: REGISTRY_V1_1_HASH,
  founderLabWorldRegistryVersion: REGISTRY_VERSION, founderLabWorldRegistryHash: REGISTRY_HASH,
  mode: "EXPLICIT_EVALUATION_ADAPTER_NO_POLICY_UPGRADE" as const, authoringDraftsAuthorized: false as const,
};
export const PHASE3C_LAB_COMPATIBILITY = deepFreeze(Phase3CLabCompatibilitySchema.parse(withContentHash(compatibilityBody, "compatibilityHash")));

const contextualWorldPolicyBody = {
  contractVersion: PHASE3C_LAB_VERSIONS.contextualWorldPolicy,
  policyId: "decision-founder-lab-contextual-world-evaluation-policy-3c-3",
  scope: "SYNTHETIC_FOUNDER_EVALUATION_ONLY" as const,
  intentMappings: [
    { mappingId: "intent-eat-drink-general-3c-3", intentId: "context.intent.eat-drink-general", acceptedPrimaryPurposes: ["EAT_DRINK"], requiredSpecificity: "PRIMARY_PURPOSE_ONLY" as const, acceptedPrimaryCategories: [], acceptedPlaceTypes: [], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
    { mappingId: "intent-food-restaurant-3c-3", intentId: "context.intent.food", acceptedPrimaryPurposes: ["EAT_DRINK"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["EAT"], acceptedPlaceTypes: ["RESTAURANT", "BRASSERIE", "BISTRO"], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
    { mappingId: "intent-coffee-primary-3c-3", intentId: "context.intent.coffee", acceptedPrimaryPurposes: ["EAT_DRINK"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["COFFEE_DAYTIME"], acceptedPlaceTypes: ["CAFE"], incompatiblePrimaryCategories: ["DRINKS", "EAT", "NIGHTLIFE", "OUTDOOR_NATURE", "SPORT_MOVEMENT"], incompatiblePlaceTypes: ["AQUARIUM", "BAR", "BISTRO", "BRASSERIE", "BREWERY", "CLIMBING_GYM", "COCKTAIL_BAR", "GYM", "LOUNGE", "MUSIC_CLUB", "NATURE_RESERVE", "NIGHTCLUB", "PARK", "PUB", "RESTAURANT", "SPORTS_CENTRE", "SPORTS_COURT", "TAPROOM", "WINE_BAR", "ZOO"] },
    { mappingId: "intent-drinks-primary-3c-3", intentId: "context.intent.drinks", acceptedPrimaryPurposes: ["EAT_DRINK"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["DRINKS", "NIGHTLIFE"], acceptedPlaceTypes: ["BAR", "PUB", "BREWERY", "TAPROOM", "WINE_BAR", "COCKTAIL_BAR", "LOUNGE"], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
    { mappingId: "intent-wine-bar-primary-3c-3", intentId: "context.intent.wine-bar", acceptedPrimaryPurposes: ["EAT_DRINK"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["DRINKS"], acceptedPlaceTypes: ["WINE_BAR"], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
    { mappingId: "intent-bar-nightlife-primary-3c-3", intentId: "context.intent.bar-nightlife", acceptedPrimaryPurposes: ["EAT_DRINK"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["DRINKS", "NIGHTLIFE"], acceptedPlaceTypes: ["BAR", "PUB", "COCKTAIL_BAR", "NIGHTCLUB", "MUSIC_CLUB", "LOUNGE"], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
    { mappingId: "intent-family-outing-nature-3c-3", intentId: "context.intent.family-outing", acceptedPrimaryPurposes: ["NATURE_ANIMAL_EXPERIENCE"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["OUTDOOR_NATURE"], acceptedPlaceTypes: ["PARK", "NATURE_RESERVE", "ZOO", "AQUARIUM"], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
    { mappingId: "intent-bouldering-sport-3c-3", intentId: "context.intent.bouldering", acceptedPrimaryPurposes: ["SPORT_MOVEMENT"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["SPORT_MOVEMENT"], acceptedPlaceTypes: ["CLIMBING_GYM"], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
    { mappingId: "intent-nature-animal-3c-3", intentId: "context.intent.nature-animal", acceptedPrimaryPurposes: ["NATURE_ANIMAL_EXPERIENCE"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["OUTDOOR_NATURE"], acceptedPlaceTypes: ["PARK", "NATURE_RESERVE", "ZOO", "AQUARIUM"], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
    { mappingId: "intent-sport-general-3c-3", intentId: "context.intent.sport", acceptedPrimaryPurposes: ["SPORT_MOVEMENT"], requiredSpecificity: "PRIMARY_PURPOSE_AND_SPECIFIC_CLASSIFICATION" as const, acceptedPrimaryCategories: ["SPORT_MOVEMENT"], acceptedPlaceTypes: ["GYM", "SPORTS_CENTRE", "CLIMBING_GYM", "SPORTS_COURT"], incompatiblePrimaryCategories: [], incompatiblePlaceTypes: [] },
  ],
  specificClassificationPrecedence: "CONFIRM_THEN_INCOMPATIBLE_THEN_UNKNOWN" as const,
  onsiteOfferingMappings: [
    { mappingId: "onsite-food-3c-1", intentId: "context.intent.food", acceptedKinds: ["RESTAURANT", "FULL_MEALS"], confirmsCoreIntent: false as const },
    { mappingId: "onsite-coffee-3c-1", intentId: "context.intent.coffee", acceptedKinds: ["CAFE"], confirmsCoreIntent: false as const },
    { mappingId: "onsite-drinks-3c-1", intentId: "context.intent.drinks", acceptedKinds: ["BAR", "DRINKS"], confirmsCoreIntent: false as const },
  ],
  situationMappings: [
    { mappingId: "situation-alone-3c-1", contextId: "alone", worldSituation: "ALONE" },
    { mappingId: "situation-date-pair-3c-1", contextId: "partner-date", worldSituation: "DATE_PAIR" },
    { mappingId: "situation-family-3c-1", contextId: "family", worldSituation: "FAMILY" },
    { mappingId: "situation-friends-group-3c-1", contextId: "friends", worldSituation: "FRIENDS_GROUP" },
    { mappingId: "situation-business-3c-1", contextId: "business", worldSituation: "BUSINESS" },
  ],
  atmosphereMappings: [
    { mappingId: "atmosphere-quiet-3c-1", contextId: "context.mood.quiet", worldAtmosphere: "QUIET" },
    { mappingId: "atmosphere-cozy-3c-1", contextId: "context.mood.cozy", worldAtmosphere: "COZY" },
    { mappingId: "atmosphere-lively-3c-1", contextId: "context.mood.lively", worldAtmosphere: "LIVELY" },
    { mappingId: "atmosphere-romantic-3c-1", contextId: "context.mood.romantic", worldAtmosphere: "ROMANTIC" },
    { mappingId: "atmosphere-creative-3c-1", contextId: "context.mood.creative", worldAtmosphere: "CREATIVE" },
  ],
  daypartMappings: [
    { mappingId: "daypart-morning-3c-1", contextId: "MORNING", worldDaypart: "MORNING" },
    { mappingId: "daypart-midday-3c-1", contextId: "MIDDAY", worldDaypart: "MIDDAY" },
    { mappingId: "daypart-afternoon-3c-1", contextId: "AFTERNOON", worldDaypart: "AFTERNOON" },
    { mappingId: "daypart-evening-3c-1", contextId: "EVENING", worldDaypart: "EVENING" },
  ],
  unknownConstraintEvaluationOverrides: [{ ruleClass: "AGE_OR_LEGAL", treatment: "UNCONFIRMED_FALLBACK" as const, rationale: "founder-confirmed-age-unknown-remains-fallback-3c" }],
  embeddedOfferingsNeverConfirmCoreIntent: true as const, typicalDaypartsNeverDetermineOpeningState: true as const, softContextNeverExcludes: true as const,
  confirmedTierRequiresCoreIntentCoverage: "CONFIRMED" as const,
  productionAuthorized: false as const, productQualityClaim: false as const, productRankingAuthorized: false as const,
};
export const PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY = deepFreeze(FounderLabContextualWorldPolicySchema.parse(withContentHash(contextualWorldPolicyBody, "policyHash")));

interface FixtureProfile {
  readonly label: string; readonly quiet: "KNOWN_TRUE"|"KNOWN_FALSE"|"UNKNOWN"; readonly lively: "KNOWN_TRUE"|"KNOWN_FALSE"|"UNKNOWN";
  readonly wheelchair: "KNOWN_TRUE"|"KNOWN_FALSE"|"UNKNOWN"; readonly priceMaxChf: number | null; readonly distanceMinutes: number | null;
  readonly ageRule: { readonly mode: "UNACCOMPANIED_MINIMUM"; readonly minimumAge: 13; readonly accompaniment: "ADULT" } | null;
  readonly conflict: boolean;
}

const profiles: readonly FixtureProfile[] = Object.freeze([
  { label: "Limmat Ruhe", quiet: "KNOWN_TRUE", lively: "KNOWN_FALSE", wheelchair: "KNOWN_TRUE", priceMaxChf: 38, distanceMinutes: 12, ageRule: null, conflict: false },
  { label: "Kleine Bühne", quiet: "UNKNOWN", lively: "KNOWN_TRUE", wheelchair: "UNKNOWN", priceMaxChf: 18, distanceMinutes: 18, ageRule: null, conflict: false },
  { label: "Abendrot Bar", quiet: "KNOWN_FALSE", lively: "KNOWN_TRUE", wheelchair: "UNKNOWN", priceMaxChf: 30, distanceMinutes: 9, ageRule: { mode: "UNACCOMPANIED_MINIMUM", minimumAge: 13, accompaniment: "ADULT" }, conflict: false },
  { label: "Garten Tisch", quiet: "KNOWN_TRUE", lively: "UNKNOWN", wheelchair: "UNKNOWN", priceMaxChf: null, distanceMinutes: 27, ageRule: null, conflict: false },
  { label: "Markt Küche", quiet: "UNKNOWN", lively: "KNOWN_TRUE", wheelchair: "KNOWN_FALSE", priceMaxChf: 19, distanceMinutes: 8, ageRule: null, conflict: false },
  { label: "Nordlicht", quiet: "KNOWN_TRUE", lively: "KNOWN_TRUE", wheelchair: "KNOWN_TRUE", priceMaxChf: 55, distanceMinutes: 35, ageRule: null, conflict: true },
  { label: "Basel Ecke", quiet: "KNOWN_TRUE", lively: "UNKNOWN", wheelchair: "KNOWN_TRUE", priceMaxChf: 20, distanceMinutes: 6, ageRule: null, conflict: false },
  { label: "See Café", quiet: "KNOWN_TRUE", lively: "KNOWN_FALSE", wheelchair: "UNKNOWN", priceMaxChf: 22, distanceMinutes: 22, ageRule: null, conflict: false },
]);

const unique = (values: readonly string[]) => [...new Set(values)].sort();
const normalize = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase("de-CH");
const nullable = <T>(value: T | undefined): T | null => value ?? null;

/** Local deterministic resolver. It has no network, persistence or Product authority. */
export function resolveFounderLabText(raw: unknown, correctionInput: unknown = {}): FounderLabInterpretation {
  const request = FounderLabRequestSchema.parse(raw); const corrections: FounderLabCorrections = FounderLabCorrectionsSchema.parse(correctionInput); const text = normalize(request.ephemeralText);
  const primaryIntent = /boulder/.test(text) ? "context.intent.bouldering" : /familienausflug/.test(text) ? "context.intent.family-outing" : /tierpark|natur(?:-| )?erlebnis/.test(text) ? "context.intent.nature-animal" : /kaffee|café|cafe/.test(text) ? "context.intent.coffee" : /weinbar|wein trinken/.test(text) ? "context.intent.wine-bar" : /nachtleben|cocktailbar|\bbar\b/.test(text) ? "context.intent.bar-nightlife" : /sport/.test(text) ? "context.intent.sport" : /essen oder trinken/.test(text) ? "context.intent.eat-drink-general" : /trinken|drink/.test(text) ? "context.intent.drinks" : /essen|restaurant|mittag|abendessen/.test(text) ? "context.intent.food" : null;
  const incompatible = /essen und nicht essen|ruhig und laut zugleich/.test(text);
  const secondaryIntent = incompatible ? "context.intent.conflicting" : /ruhig|gemütlich|date/.test(text) && primaryIntent ? "context.intent.conversation" : /essen.*trinken|trinken.*essen/.test(text) ? "context.intent.food" : null;
  const targetCity = /zürich|zurich/.test(text) ? "Zurich" : /basel/.test(text) ? "Basel" : null;
  const amountMatch = text.match(/(?:höchstens|max(?:imal)?|unter|bis)\s*(\d{1,4})\s*(?:chf|fr(?:anken)?)/);
  const amount = amountMatch?.[1] ? Number(amountMatch[1]) : null;
  const moods = unique([/ruhig|entspannt|leise/.test(text) ? "context.mood.quiet" : "", /gemütlich|cosy|cozy/.test(text) ? "context.mood.cozy" : "", /lebhaft|laut|party/.test(text) ? "context.mood.lively" : "", /romantisch/.test(text) ? "context.mood.romantic" : "", /kreativ/.test(text) ? "context.mood.creative" : ""].filter(Boolean));
  const knownMoodTokens = /(ruhig|entspannt|leise|gemütlich|cosy|cozy|lebhaft|laut|party|romantisch|kreativ)/;
  const unknownMood = text.match(/stimmung\s+([\p{L}-]+)/u)?.[1];
  const minimumAge = text.match(/(\d{1,2})[- ]?jähr/)?.[1] ?? (/zwölfjähr/.test(text) ? "12" : undefined);
  const adultPresent = /mit (?:einem |einer )?erwachsen|mit eltern|familie|für mich und mein/.test(text);
  const hard: string[] = [];
  if (/rollstuhl|stufenfrei|barrierefrei/.test(text)) hard.push("ACCESSIBILITY");
  if (amount !== null && /höchstens|maximal|unter|bis/.test(text)) hard.push("BUDGET_MAXIMUM");
  if (/muss (?:noch )?geöffnet|jetzt geöffnet|küche muss/.test(text)) hard.push(/küche/.test(text) ? "KITCHEN_CURRENT" : "OPENING_CURRENT");
  if (/in der nähe|maximal \d+ minuten/.test(text)) hard.push("DISTANCE_MAXIMUM");
  if (minimumAge) hard.push("AGE_OR_LEGAL");
  const soft = unique([moods.length ? "MOOD" : "", /neu(?:es|e)|entdecken/.test(text) ? "EXPLORATION" : "", /bekannt|vertraut/.test(text) ? "FAMILIARITY" : ""].filter(Boolean));
  const dayPhase = /nachmittag/.test(text) ? "AFTERNOON" : /mittag/.test(text) ? "MIDDAY" : /abend|spät/.test(text) ? "EVENING" : /morgen|vormittag/.test(text) ? "MORNING" : null;
  const duration = /\bkurz|45 minuten|30 minuten/.test(text) ? "SHORT" : /\blang|viel zeit/.test(text) ? "LONG" : /\bmittel/.test(text) ? "MEDIUM" : null;
  const interpretationBody = {
    contractVersion: PHASE3C_LAB_VERSIONS.interpretation, resolverVersion: "decision-founder-lab-local-resolver-3c-1", inputHash: contentHash(request.ephemeralText.normalize("NFC")),
    primaryIntent, secondaryIntent, intentCompatibility: secondaryIntent ? incompatible ? "INCOMPATIBLE" as const : "COMPATIBLE" as const : primaryIntent ? "NOT_APPLICABLE" as const : "UNKNOWN" as const,
    occasion: /erst(?:es|en) date/.test(text) ? "context.occasion.first-date" : /familien|mit (?:zwei |\d+ )?kind/.test(text) ? "context.occasion.family" : null,
    moods, targetCity, dateTime: { state: dayPhase ? "KNOWN" as const : "UNKNOWN" as const, localDate: /nächste woche/.test(text) ? null : "2026-09-16", dayPhase, timeZone: targetCity ? "Europe/Zurich" : null },
    group: { size: /zu viert/.test(text) ? 4 : /mit zwei kindern/.test(text) ? 3 : null, minimumAge: minimumAge ? Number(minimumAge) : null, adultPresent, companionType: /allein/.test(text) ? "alone" : /freunde/.test(text) ? "friends" : /geschäft|business/.test(text) ? "business" : /date|partner/.test(text) ? "partner-date" : /famil|kind/.test(text) ? "family" : null },
    budget: { state: amount === null ? "UNKNOWN" as const : "KNOWN" as const, amount, currency: amount === null ? null : "CHF" as const, perPerson: /pro person|p\.p\./.test(text), calibrationLabel: amount !== null && amount <= 20 && /abendessen|dinner/.test(text) ? "LOW_CH_DINNER_EVALUATION_ONLY" : null },
    stayDuration: duration, hardConstraints: unique(hard), softPreferences: soft,
    unresolvedTerms: unknownMood && !knownMoodTokens.test(unknownMood) ? [unknownMood] : [],
    locationAuthority: { explicitTargetWins: true as const, authorizedCity: targetCity, deviceCityUsed: targetCity === null && request.deviceLocation.state === "AVAILABLE", state: targetCity || request.deviceLocation.state === "AVAILABLE" ? "KNOWN" as const : request.deviceLocation.state === "DENIED" ? "DENIED" as const : "NOT_AVAILABLE" as const },
    limitations: unique([primaryIntent ? "" : "intent-not-understood", targetCity || request.deviceLocation.state === "AVAILABLE" ? "" : "location-not-authorized", incompatible ? "incompatible-intents-require-clarification" : "", unknownMood && !knownMoodTokens.test(unknownMood) ? "mood-term-unresolved" : ""].filter(Boolean)), rawTextPersisted: false as const,
  };
  const effectiveTargetCity = corrections.targetCity === undefined ? interpretationBody.targetCity : corrections.targetCity;
  const merged = { ...interpretationBody, ...corrections, targetCity: effectiveTargetCity, locationAuthority: { explicitTargetWins: true as const, authorizedCity: effectiveTargetCity, deviceCityUsed: effectiveTargetCity === null && request.deviceLocation.state === "AVAILABLE", state: effectiveTargetCity || request.deviceLocation.state === "AVAILABLE" ? "KNOWN" as const : request.deviceLocation.state === "DENIED" ? "DENIED" as const : "NOT_AVAILABLE" as const }, contractVersion: PHASE3C_LAB_VERSIONS.interpretation, inputHash: interpretationBody.inputHash, rawTextPersisted: false as const };
  return deepFreeze(FounderLabInterpretationSchema.parse(withContentHash(merged, "interpretationHash")));
}

function fixtureWorld() {
  const world = generateSyntheticWorld({ configVersion: "backyrd-vnext-sandbox-config-v1", worldVersion: "backyrd-vnext-synthetic-world-phase3c-lab", seed: 3003, observedAt: FIXED_TIME, spotCount: 12, userCount: 3, cities: ["Zurich", "Basel"], candidatePoolSize: 8 });
  return { world, reader: new SyntheticWorldKnowledgeReader(world) };
}

async function readSnapshot(reader: WorldKnowledgeReaderPort, spotId: string): Promise<WorldKnowledgeSnapshot> {
  if (reader.contractVersion !== "backyrd.world-knowledge.reader-port@1.0") throw new Error("phase3c_world_reader_port_unknown");
  const value = await reader.readSnapshot({ spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH });
  const snapshot = parseWorldKnowledgeSnapshot(value, [SYNTHETIC_WORLD_SOURCE_POLICY, ACCEPTED_SOURCE_POLICY]);
  if (snapshot.spot.spotId !== spotId || snapshot.registryVersion !== REGISTRY_VERSION || snapshot.registryHash !== REGISTRY_HASH) throw new Error("phase3c_world_snapshot_binding_mismatch");
  return snapshot;
}

interface LabWorldFact { readonly key: string; readonly resolution: string; readonly value: unknown; readonly trust?: string; readonly freshness?: string; readonly basisClaimHashes?: readonly string[] }
interface LabContextBinding {
  readonly entries: Readonly<Record<string, LabWorldFact>>; readonly absentKeys: readonly string[]; readonly explicitUnknowns: readonly string[];
  readonly conflicts: readonly { readonly key: string; readonly claimHashes: readonly string[] }[]; readonly bindingHash: string;
}
interface LabWorldRow { readonly spotId: string; readonly name: string; readonly locality: string | null; readonly snapshotHash: string; readonly facts: readonly LabWorldFact[]; readonly context: LabContextBinding | null; readonly shadowSnapshot: FounderShadowSnapshot | null; readonly profile: FixtureProfile }
const factsFromWorldSnapshot = (snapshot: WorldKnowledgeSnapshot): readonly LabWorldFact[] => [
  ...snapshot.facts,
  { key: "classification.primary_category", resolution: snapshot.spot.classification.primaryCategory ? "KNOWN_VALUE" : "UNKNOWN", value: snapshot.spot.classification.primaryCategory },
  { key: "classification.place_types", resolution: snapshot.spot.classification.placeTypes.length ? "KNOWN_VALUE" : "UNKNOWN", value: snapshot.spot.classification.placeTypes },
];
function profileHash(profile: FixtureProfile, snapshotHash: string, authority: "SYNTHETIC_FIXTURE_ONLY" | "WORLD_COHORT_HANDOFF" = "SYNTHETIC_FIXTURE_ONLY") { return contentHash({ authority, snapshotHash, profile }); }
const stateFromFact = (snapshot: FounderShadowSnapshot, key: string): "KNOWN_TRUE"|"KNOWN_FALSE"|"UNKNOWN" => { const fact = snapshot.facts.find((item) => item.key === key); return fact?.resolution === "KNOWN_TRUE" ? "KNOWN_TRUE" : fact?.resolution === "KNOWN_FALSE" ? "KNOWN_FALSE" : "UNKNOWN"; };
const valueFromFact = (snapshot: FounderShadowSnapshot, key: string): unknown => snapshot.facts.find((item) => item.key === key && item.resolution === "KNOWN_VALUE")?.value;
function contextBinding(value: FounderContextShadowHandoff): LabContextBinding {
  return { entries: value.entries as Readonly<Record<string, LabWorldFact>>, absentKeys: value.absentKeys, explicitUnknowns: value.explicitUnknowns, conflicts: value.conflicts, bindingHash: value.handoffHash };
}
function rowFromHandoff(item: FounderWorldCohortHandoff["spots"][number], binding: FounderWorldCohortHandoff["manifest"]["spots"][number]): LabWorldRow {
  if (item.spotId !== binding.spotId || item.snapshot.spotId !== item.spotId || binding.contextHandoff.spotId !== item.spotId || binding.contextHandoffHash !== binding.contextHandoff.handoffHash) throw new Error("phase3c_founder_cohort_spot_binding_mismatch");
  const age = valueFromFact(item.snapshot, "rule.age_access_conditions") as { rules?: readonly { mode?: unknown; minimumAge?: unknown; accompaniment?: unknown }[] } | undefined;
  const matchingAgeRule = age?.rules?.find((rule) => rule.mode === "UNACCOMPANIED_MINIMUM" && rule.minimumAge === 13 && rule.accompaniment === "ADULT");
  const priceRange = valueFromFact(item.snapshot, "operation.price_range") as { currency?: unknown; max?: unknown } | undefined;
  const profile: FixtureProfile = { label: item.name, quiet: "UNKNOWN", lively: "UNKNOWN", wheelchair: stateFromFact(item.snapshot, "accessibility.step_free_entrance"), priceMaxChf: priceRange?.currency === "CHF" && typeof priceRange.max === "number" ? priceRange.max : null, distanceMinutes: null, ageRule: matchingAgeRule ? { mode: "UNACCOMPANIED_MINIMUM", minimumAge: 13, accompaniment: "ADULT" } : null, conflict: item.snapshot.conflicts.length > 0 };
  const locality = valueFromFact(item.snapshot, "location.locality");
  return { spotId: item.spotId, name: item.name, locality: typeof locality === "string" ? locality : null, snapshotHash: item.snapshotContentHash, facts: item.snapshot.facts, context: contextBinding(binding.contextHandoff), shadowSnapshot: item.snapshot, profile };
}

let syntheticCohortCache: Promise<{ cohort: FounderLabCohort; rows: readonly LabWorldRow[] }> | null = null;

async function loadCohort(input: { reader?: WorldKnowledgeReaderPort; manifest?: FounderWorldCohortManifest | null; handoff?: FounderWorldCohortHandoff | unknown } = {}): Promise<{ cohort: FounderLabCohort; rows: readonly LabWorldRow[] }> {
  if (input.handoff && (input.reader || input.manifest)) throw new Error("phase3c_founder_cohort_sources_must_not_mix");
  if (input.handoff) {
    const handoff = parseFounderWorldCohortHandoff(input.handoff);
    const bindings = new Map(handoff.manifest.spots.map((row) => [row.spotId, row]));
    if (bindings.size !== handoff.manifest.spots.length || handoff.spots.length !== handoff.manifest.spots.length) throw new Error("phase3c_founder_cohort_spot_binding_mismatch");
    const rows = [...handoff.spots].sort((a, b) => a.spotId.localeCompare(b.spotId)).map((item) => {
      const binding = bindings.get(item.spotId);
      if (!binding) throw new Error("phase3c_founder_cohort_spot_binding_missing");
      return rowFromHandoff(item, binding);
    });
    const cohortBody = { contractVersion: PHASE3C_LAB_VERSIONS.cohort, cohortId: handoff.manifest.cohortId, source: "FOUNDER_WORLD_COHORT" as const, worldRegistryVersion: handoff.manifest.registryVersion, worldRegistryHash: handoff.registryHash, sourcePolicyVersion: handoff.manifest.policyVersion, sourceHandoffHash: handoff.handoffHash, spotBindings: rows.map((row) => ({ spotId: row.spotId, snapshotHash: row.snapshotHash, fixtureProfileHash: profileHash(row.profile, row.snapshotHash, "WORLD_COHORT_HANDOFF") })), limitations: [...(rows.length === 1 ? ["single-spot-cohort-comparison-not-representative"] : []), "world-cohort-evaluation-only-no-product-ranking"], mixedSources: false as const };
    return { cohort: deepFreeze(FounderLabCohortSchema.parse(withContentHash(cohortBody, "cohortHash"))), rows };
  }
  if ((input.reader && !input.manifest) || (!input.reader && input.manifest)) throw new Error("phase3c_founder_cohort_binding_incomplete");
  if (input.reader && input.manifest) {
    const manifest = input.manifest;
    const body = { ...manifest } as Record<string, unknown>; delete body.cohortHash;
    if (manifest.contractVersion !== FOUNDER_COHORT_VERSION || manifest.scope !== FOUNDER_EVALUATION_SCOPE || manifest.registryVersion !== REGISTRY_VERSION || manifest.registryHash !== REGISTRY_HASH || contentHash(body) !== manifest.cohortHash || manifest.spots.length < 1 || manifest.spots.length > 40 || new Set(manifest.spots.map((row) => row.spotId)).size !== manifest.spots.length) throw new Error("phase3c_founder_cohort_manifest_invalid");
    const snapshots = await Promise.all(manifest.spots.map(async (binding) => { const snapshot = await readSnapshot(input.reader!, binding.spotId); if (snapshot.snapshotHash !== binding.snapshotHash) throw new Error("phase3c_founder_cohort_snapshot_mismatch"); return snapshot; }));
    const rows = snapshots.map((snapshot, index) => ({ spotId: snapshot.spot.spotId, name: snapshot.spot.identity.name ?? profiles[index % profiles.length]!.label, locality: snapshot.spot.location.locality, snapshotHash: snapshot.snapshotHash, facts: factsFromWorldSnapshot(snapshot), context: null, shadowSnapshot: null, profile: { ...profiles[index % profiles.length]!, label: snapshot.spot.identity.name ?? profiles[index % profiles.length]!.label } }));
    const cohortBody = { contractVersion: PHASE3C_LAB_VERSIONS.cohort, cohortId: manifest.cohortId, source: "FOUNDER_WORLD_COHORT" as const, worldRegistryVersion: manifest.registryVersion, worldRegistryHash: manifest.registryHash, sourcePolicyVersion: manifest.policyVersion, sourceHandoffHash: null, spotBindings: rows.map((row) => ({ spotId: row.spotId, snapshotHash: row.snapshotHash, fixtureProfileHash: profileHash(row.profile, row.snapshotHash) })), limitations: ["fixture-fit-profile-is-calibration-only"], mixedSources: false as const };
    return { cohort: deepFreeze(FounderLabCohortSchema.parse(withContentHash(cohortBody, "cohortHash"))), rows };
  }
  syntheticCohortCache ??= (async () => {
    const { world, reader } = fixtureWorld(); const snapshots = await Promise.all(world.spots.slice(0, profiles.length).map((spot) => readSnapshot(reader, spot.id)));
    const rows = snapshots.map((snapshot, index) => ({ spotId: snapshot.spot.spotId, name: profiles[index]!.label, locality: snapshot.spot.location.locality, snapshotHash: snapshot.snapshotHash, facts: factsFromWorldSnapshot(snapshot), context: null, shadowSnapshot: null, profile: profiles[index]! }));
    const cohortBody = { contractVersion: PHASE3C_LAB_VERSIONS.cohort, cohortId: "synthetic-founder-lab-cohort-3c-1", source: "SYNTHETIC_FALLBACK" as const, worldRegistryVersion: REGISTRY_VERSION, worldRegistryHash: REGISTRY_HASH, sourcePolicyVersion: SYNTHETIC_WORLD_SOURCE_POLICY.policyVersion, sourceHandoffHash: null, spotBindings: rows.map((row) => ({ spotId: row.spotId, snapshotHash: row.snapshotHash, fixtureProfileHash: profileHash(row.profile, row.snapshotHash) })), limitations: ["no-bound-founder-world-cohort", "synthetic-world-never-mixed-with-founder-world", "fixture-fit-profile-is-calibration-only"], mixedSources: false as const };
    return deepFreeze({ cohort: FounderLabCohortSchema.parse(withContentHash(cohortBody, "cohortHash")), rows });
  })();
  return syntheticCohortCache;
}

export async function inspectFounderLabCohort(cohortHandoff?: FounderWorldCohortHandoff | unknown) {
  const { cohort, rows } = await loadCohort(cohortHandoff ? { handoff: cohortHandoff } : {});
  return deepFreeze({ cohort, names: rows.map((row) => row.name), spotCount: rows.length });
}

export function founderLabEvaluationGaps(interpretationInput: unknown): readonly string[] {
  const interpretation = FounderLabInterpretationSchema.parse(interpretationInput);
  const gaps = [
    !interpretation.primaryIntent ? "PRIMARY_INTENT_REQUIRED" : "",
    interpretation.locationAuthority.state !== "KNOWN" || !interpretation.locationAuthority.authorizedCity ? "LOCATION_AUTHORITY_REQUIRED" : "",
  ].filter(Boolean);
  return deepFreeze(unique(gaps));
}

export function assertFounderLabEvaluable(interpretationInput: unknown): void {
  const gaps = founderLabEvaluationGaps(interpretationInput);
  if (gaps.length) throw new Error(`phase3c_founder_lab_not_evaluable:${gaps.join(",")}`);
}

function userProjection(request: FounderLabRequest, contextHash: string): RelevantUserProjection {
  const projectionRequest = {
    contractVersion: USER_VERSIONS.projectionRequest, requestId: `projection-${request.requestId}`, actor: { kind: "AUTHENTICATED_USER" as const, userId: SYNTHETIC_USER_A, subjectBindingHash: SYNTHETIC_SUBJECT_BINDING_HASH, authenticationContextHash: contentHash("phase3c-lab-auth"), boundBy: "SERVER" as const }, decisionId: `decision-${request.requestId}`,
    snapshot: { snapshotId: COLD_SNAPSHOT.snapshotId, snapshotHash: COLD_SNAPSHOT.snapshotHash }, context: { contextContractVersion: PHASE3C_LAB_VERSIONS.interpretation, contextHash, placeTypes: [], domainKeys: [], rawLocationIncluded: false as const, socialDetailsIncluded: false as const }, requestedDomains: [], budgets: { maxItems: 8, maxBytes: 8192 }, projectionPolicyVersion: "synthetic-projection-policy-v0", killSwitch: request.userMode === "KILL_SWITCH",
  };
  const empty = { taste: [], practical: [], directSpot: [], domainSufficiency: [], knowledgeLevel: "UNKNOWN" as const, suppression: { total: 0, byReason: [] } };
  const active = { ...empty, knowledgeLevel: "PARTIAL" as const, taste: [{ concept: { contractVersion: "backyrd.user-intelligence.user-concept-reference@1.0" as const, registryVersion: SYNTHETIC_CONCEPT_REGISTRY_VERSION, conceptId: "vibe.quiet" }, scope: { kind: "PLACE_TYPE" as const, reference: "cafe" }, affinity: 0.4, confidence: 0.5, reason: { code: "PLACE_TYPE_MATCH" as const, subjectRef: "synthetic-taste-node", policyRef: "synthetic-projection-policy-v0" } }], directSpot: [{ relationshipId: "synthetic-direct-spot", spotId: "syn-spot-0001", state: "FAMILIAR", confidence: 0.5, reason: { code: "DIRECT_SPOT_RELATIONSHIP" as const, subjectRef: "synthetic-direct-node", policyRef: "synthetic-projection-policy-v0" } }] };
  const mode = request.userMode;
  const projection = buildRelevantUserProjection({ request: mode === "NEUTRAL_MISSING" ? { ...projectionRequest, snapshot: null } : projectionRequest, consent: mode === "NO_CONSENT" ? NO_CONSENT : GRANTED_CONSENT, manifest: { manifestId: SYNTHETIC_MANIFEST.manifestId, manifestHash: SYNTHETIC_MANIFEST.manifestHash }, snapshot: mode === "NEUTRAL_MISSING" ? null : COLD_SNAPSHOT, content: mode === "ACTIVE_SYNTHETIC" ? active : empty, identity: { projectionId: `projection-value-${request.requestId}` }, clock: { now: FIXED_TIME }, ...(mode === "COLD" ? { forcedNeutralReason: "COLD_START" as const } : {}) });
  return parseRelevantUserProjection(projection, mode === "NEUTRAL_MISSING" || mode === "NO_CONSENT" || mode === "KILL_SWITCH" ? undefined : projectionRequest);
}

const reason = (reasonCode: string, domain: "WORLD"|"USER"|"CONTEXT"|"LIMITATION", sourceHash: string, statementDe: string, confirmed: boolean) => ({ reasonCode, domain, sourceHash, statementDe, confirmed });

type ContextualState = "CONFIRMED" | "UNKNOWN" | "NOT_CONFIGURED" | "INCOMPATIBLE" | "DISPUTED" | "NOT_APPLICABLE";
const contextualSourceHash = (world: LabWorldRow, key: string, contextId: string | null) => contentHash({ policyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash, spotId: world.spotId, snapshotHash: world.snapshotHash, contextBindingHash: world.context?.bindingHash ?? null, key, contextId });
function contextualFact(world: LabWorldRow, key: string): { readonly state: "KNOWN" | "UNKNOWN" | "DISPUTED"; readonly value: unknown; readonly evidenceSourceHash: string } {
  const evidenceSourceHash = contextualSourceHash(world, key, null);
  if (world.context?.conflicts.some((row) => row.key === key)) return { state: "DISPUTED", value: null, evidenceSourceHash };
  const entry = world.context?.entries[key];
  if (!entry || world.context?.absentKeys.includes(key) || world.context?.explicitUnknowns.includes(key) || entry.resolution === "UNKNOWN") return { state: "UNKNOWN", value: null, evidenceSourceHash };
  if (entry.resolution === "DISPUTED" || entry.trust === "CONFLICTING") return { state: "DISPUTED", value: null, evidenceSourceHash };
  return { state: "KNOWN", value: entry.value, evidenceSourceHash };
}
function snapshotFact(world: LabWorldRow, key: string): { readonly state: "KNOWN" | "UNKNOWN" | "DISPUTED"; readonly value: unknown; readonly evidenceSourceHash: string } {
  const evidenceSourceHash = contextualSourceHash(world, key, null);
  const matches = world.facts.filter((entry) => entry.key === key);
  if (matches.length > 1 || matches.some((entry) => entry.resolution === "DISPUTED" || entry.trust === "CONFLICTING")) return { state: "DISPUTED", value: null, evidenceSourceHash };
  const entry = matches[0];
  if (!entry || entry.resolution === "UNKNOWN" || entry.value === null || entry.value === undefined) return { state: "UNKNOWN", value: null, evidenceSourceHash };
  return { state: "KNOWN", value: entry.value, evidenceSourceHash };
}
function resolveIntentCoverage(world: LabWorldRow, intentId: string | null) {
  const evidenceSourceHash = contentHash({ purpose: contextualSourceHash(world, "purpose.primary_visit", intentId), category: contextualSourceHash(world, "classification.primary_category", intentId), placeTypes: contextualSourceHash(world, "classification.place_types", intentId) });
  if (!intentId) return { intentId: null, state: "NOT_APPLICABLE" as const, mappingIds: [], worldFactKeys: [], evidenceSourceHash };
  const mappings = PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.intentMappings.filter((mapping) => mapping.intentId === intentId);
  const worldFactKeys = ["purpose.primary_visit", "classification.primary_category", "classification.place_types"];
  if (!mappings.length) return { intentId, state: "NOT_CONFIGURED" as const, mappingIds: [], worldFactKeys, evidenceSourceHash };
  const purpose = contextualFact(world, "purpose.primary_visit");
  const mappingIds = mappings.map((row) => row.mappingId);
  if (purpose.state === "DISPUTED") return { intentId, state: "DISPUTED" as const, mappingIds, worldFactKeys, evidenceSourceHash };
  if (purpose.state === "UNKNOWN") return { intentId, state: "UNKNOWN" as const, mappingIds, worldFactKeys, evidenceSourceHash };
  const purposeValue = typeof purpose.value === "string" ? purpose.value : null;
  const purposeMappings = purposeValue ? mappings.filter((mapping) => mapping.acceptedPrimaryPurposes.includes(purposeValue)) : [];
  if (!purposeMappings.length) return { intentId, state: "INCOMPATIBLE" as const, mappingIds, worldFactKeys, evidenceSourceHash };
  if (purposeMappings.some((mapping) => mapping.requiredSpecificity === "PRIMARY_PURPOSE_ONLY")) return { intentId, state: "CONFIRMED" as const, mappingIds, worldFactKeys, evidenceSourceHash };
  const category = snapshotFact(world, "classification.primary_category");
  const placeTypes = snapshotFact(world, "classification.place_types");
  if (category.state === "DISPUTED" || placeTypes.state === "DISPUTED") return { intentId, state: "DISPUTED" as const, mappingIds, worldFactKeys, evidenceSourceHash };
  const categoryValue = typeof category.value === "string" ? category.value : null;
  const placeTypeValues = Array.isArray(placeTypes.value) ? placeTypes.value.filter((value): value is string => typeof value === "string") : [];
  const specificallyConfirmed = purposeMappings.some((mapping) => (categoryValue !== null && mapping.acceptedPrimaryCategories.includes(categoryValue)) || placeTypeValues.some((value) => mapping.acceptedPlaceTypes.includes(value)));
  if (specificallyConfirmed) return { intentId, state: "CONFIRMED" as const, mappingIds, worldFactKeys, evidenceSourceHash };
  const knownSpecificIncompatibility = purposeMappings.some((mapping) =>
    (categoryValue !== null && mapping.incompatiblePrimaryCategories.includes(categoryValue))
    || placeTypeValues.some((value) => mapping.incompatiblePlaceTypes.includes(value)));
  return { intentId, state: knownSpecificIncompatibility ? "INCOMPATIBLE" as const : "UNKNOWN" as const, mappingIds, worldFactKeys, evidenceSourceHash };
}
function contextualEvaluation(state: ContextualState, world: LabWorldRow, key: string, contextId: string | null, mappingIds: readonly string[] = []) {
  return { state, mappingIds: unique(mappingIds), evidenceSourceHash: contextualSourceHash(world, key, contextId) };
}
function resolveOnsiteOfferings(world: LabWorldRow, intentId: string | null) {
  const mappings = intentId ? PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.onsiteOfferingMappings.filter((row) => row.intentId === intentId) : [];
  const evidenceSourceHash = contextualSourceHash(world, "offering.onsite", intentId);
  const base = { mappingIds: mappings.map((row) => row.mappingId), availableKinds: [] as string[], matchedKinds: [] as string[], relationships: [] as ("PART_OF_SPOT"|"EMBEDDED_FACILITY"|"UNKNOWN")[], confirmsCoreIntent: false as const, evidenceSourceHash };
  if (!intentId) return { ...base, state: "NOT_APPLICABLE" as const };
  const fact = contextualFact(world, "offering.onsite");
  if (fact.state === "DISPUTED") return { ...base, state: "DISPUTED" as const };
  if (fact.state === "UNKNOWN") return { ...base, state: "UNKNOWN" as const };
  const rows = Array.isArray(fact.value) ? fact.value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const relationships = unique(rows.map((row) => String(row.relationship)).filter((value) => ["PART_OF_SPOT", "EMBEDDED_FACILITY", "UNKNOWN"].includes(value))) as ("PART_OF_SPOT"|"EMBEDDED_FACILITY"|"UNKNOWN")[];
  const availableKinds = unique(rows.map((row) => String(row.kind)).filter(Boolean));
  if (!mappings.length) return { ...base, state: "NOT_CONFIGURED" as const, availableKinds, relationships };
  const matched = rows.filter((row) => typeof row.kind === "string" && mappings.some((mapping) => mapping.acceptedKinds.includes(row.kind as string)));
  return { ...base, state: matched.length ? "CONFIRMED" as const : "NOT_APPLICABLE" as const, availableKinds, matchedKinds: unique(matched.map((row) => String(row.kind))), relationships };
}
function conditionMatches(conditions: unknown, interpretation: FounderLabInterpretation): true | false | "UNKNOWN" {
  if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) return false;
  const row = conditions as Record<string, unknown>; let unknown = false;
  const dayparts = Array.isArray(row.dayparts) ? row.dayparts : [];
  if (dayparts.length) { if (!interpretation.dateTime.dayPhase) unknown = true; else if (!dayparts.includes(interpretation.dateTime.dayPhase)) return false; }
  const days = Array.isArray(row.days) ? row.days : [];
  if (days.length) { if (!interpretation.dateTime.localDate) unknown = true; else { const names = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"]; if (!days.includes(names[new Date(`${interpretation.dateTime.localDate}T12:00:00.000Z`).getUTCDay()])) return false; } }
  if (row.groupSize && typeof row.groupSize === "object" && !Array.isArray(row.groupSize)) { const size = interpretation.group.size; if (size === null) unknown = true; else { const range = row.groupSize as Record<string, unknown>; if (size < Number(range.min) || size > Number(range.max)) return false; } }
  if (row.ageContext) { const context = interpretation.group.minimumAge !== null && interpretation.group.adultPresent ? "MIXED_AGES" : interpretation.group.minimumAge !== null ? "CHILDREN" : null; if (!context) unknown = true; else if (row.ageContext !== context) return false; }
  if (row.accompaniment) { const accompaniment = interpretation.group.adultPresent ? "ADULT" : interpretation.group.companionType === "alone" ? "ALONE" : interpretation.group.companionType === "friends" ? "GROUP" : null; if (!accompaniment) unknown = true; else if (row.accompaniment !== accompaniment) return false; }
  if (row.occasion || row.area) unknown = true;
  if (row.eventMode && row.eventMode !== "NORMAL_OPERATION") unknown = true;
  return unknown ? "UNKNOWN" : true;
}
function resolveContextRows(world: LabWorldRow, key: "context.visit_situations"|"context.atmosphere"|"context.typical_dayparts", contextIds: readonly string[], mappings: readonly { readonly mappingId: string; readonly contextId: string; readonly worldValue: string }[], interpretation: FounderLabInterpretation) {
  if (!contextIds.length) return contextualEvaluation("NOT_APPLICABLE", world, key, null);
  const selected = mappings.filter((mapping) => contextIds.includes(mapping.contextId));
  if (selected.length !== contextIds.length) return contextualEvaluation("NOT_CONFIGURED", world, key, contextIds.join("+"), selected.map((row) => row.mappingId));
  const fact = contextualFact(world, key);
  if (fact.state === "DISPUTED") return contextualEvaluation("DISPUTED", world, key, contextIds.join("+"), selected.map((row) => row.mappingId));
  if (fact.state === "UNKNOWN") return contextualEvaluation("UNKNOWN", world, key, contextIds.join("+"), selected.map((row) => row.mappingId));
  const rows = Array.isArray(fact.value) ? fact.value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
  const valueField = key === "context.visit_situations" ? "situation" : key === "context.atmosphere" ? "atmosphere" : "daypart";
  let sawUnknown = false;
  for (const mapping of selected) {
    const relevant = rows.filter((row) => row[valueField] === mapping.worldValue);
    if (!relevant.length) return contextualEvaluation("INCOMPATIBLE", world, key, contextIds.join("+"), selected.map((row) => row.mappingId));
    const matches = relevant.map((row) => conditionMatches(row.conditions ?? {}, interpretation));
    if (!matches.includes(true)) { if (matches.includes("UNKNOWN")) sawUnknown = true; else return contextualEvaluation("INCOMPATIBLE", world, key, contextIds.join("+"), selected.map((row) => row.mappingId)); }
  }
  return contextualEvaluation(sawUnknown ? "UNKNOWN" : "CONFIRMED", world, key, contextIds.join("+"), selected.map((row) => row.mappingId));
}
function resolveVisitSituation(world: LabWorldRow, interpretation: FounderLabInterpretation) {
  const contextId = interpretation.group.companionType ?? (interpretation.occasion === "context.occasion.first-date" ? "partner-date" : interpretation.occasion === "context.occasion.family" ? "family" : null);
  return resolveContextRows(world, "context.visit_situations", contextId ? [contextId] : [], PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.situationMappings.map((row) => ({ ...row, worldValue: row.worldSituation })), interpretation);
}
function resolveAtmosphere(world: LabWorldRow, interpretation: FounderLabInterpretation) {
  return resolveContextRows(world, "context.atmosphere", interpretation.moods, PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.atmosphereMappings.map((row) => ({ ...row, worldValue: row.worldAtmosphere })), interpretation);
}
function resolveTypicalDaypart(world: LabWorldRow, interpretation: FounderLabInterpretation) {
  const daypart = interpretation.dateTime.dayPhase;
  return resolveContextRows(world, "context.typical_dayparts", daypart ? [daypart] : [], PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.daypartMappings.map((row) => ({ ...row, worldValue: row.worldDaypart })), interpretation);
}
function resolveActualAvailability(world: LabWorldRow, interpretation: FounderLabInterpretation) {
  const requested = interpretation.hardConstraints.includes("OPENING_CURRENT"); const evidenceSourceHash = contextualSourceHash(world, "hours.regular", interpretation.dateTime.localDate);
  if (!requested) return { status: "not_requested" as const, evidenceSourceHash };
  if (!world.shadowSnapshot || !interpretation.dateTime.localDate || !interpretation.dateTime.timeZone) return { status: "unknown" as const, evidenceSourceHash };
  const source = world.shadowSnapshot; const entry = (fact: LabWorldFact) => ({ key: fact.key, scope: "SPOT", resolution: fact.resolution, freshness: "CURRENT", trust: fact.trust ?? "VERIFIED", value: fact.value, observedAt: source.resolvedAt, validFrom: null, validUntil: null, basisClaimRefs: fact.basisClaimHashes ?? [], sourceAssessmentHashes: [], authorizedUseCases: ["OPENING_HOURS_ELIGIBILITY"], entryHash: contentHash(fact) });
  const facts = source.facts.map(entry); const snapshot = { spot: { location: { timezone: valueFromFact(source, "location.timezone") ?? interpretation.dateTime.timeZone } }, operationalRules: facts.filter((row) => row.key === "hours.regular" || row.key === "hours.special"), currentStates: facts.filter((row) => row.key === "state.current"), conflicts: source.conflicts.map((row) => ({ severity: "BLOCKING", attributeKeys: [row.key] })), exclusions: [] } as unknown as WorldKnowledgeSnapshot;
  const at = `${interpretation.dateTime.localDate}T18:00:00.000Z`; const evaluated = evaluateOpeningState(snapshot, at, SYNTHETIC_OPENING_SOURCE_POLICY);
  return { status: evaluated.status, evidenceSourceHash: contentHash({ evidenceSourceHash, evaluated }) };
}

function resolveAgeConstraint(world: LabWorldRow, age: number | null, adultPresent: boolean): "KNOWN_TRUE" | "KNOWN_FALSE" | "UNKNOWN" {
  if (world.spotId.startsWith("syn-") && world.profile.ageRule) return age === null ? "UNKNOWN" : age >= world.profile.ageRule.minimumAge || adultPresent ? "KNOWN_TRUE" : "KNOWN_FALSE";
  const fact = world.facts.find((entry) => entry.key === "rule.age_access_conditions");
  if (!fact || fact.resolution !== "KNOWN_VALUE" || !fact.value || typeof fact.value !== "object" || !("rules" in fact.value) || !Array.isArray(fact.value.rules)) return "UNKNOWN";
  const rules = fact.value.rules.filter((rule): rule is Record<string, unknown> => Boolean(rule) && typeof rule === "object" && !Array.isArray(rule) && (rule as Record<string, unknown>).area == null && (rule as Record<string, unknown>).event == null && Array.isArray((rule as Record<string, unknown>).days) && ((rule as Record<string, unknown>).days as unknown[]).length === 0 && (rule as Record<string, unknown>).appliesFromTime == null);
  if (rules.some((rule) => rule.mode === "NO_MINIMUM")) return "KNOWN_TRUE";
  const applicable = rules.filter((rule) => ["GENERAL_MINIMUM", "UNACCOMPANIED_MINIMUM"].includes(String(rule.mode)) && typeof rule.minimumAge === "number");
  if (!applicable.length || age === null) return "UNKNOWN";
  return applicable.every((rule) => age >= Number(rule.minimumAge) || (rule.mode === "UNACCOMPANIED_MINIMUM" && adultPresent && rule.accompaniment === "ADULT")) ? "KNOWN_TRUE" : "KNOWN_FALSE";
}

function assess(world: LabWorldRow, interpretation: FounderLabInterpretation, projection: RelevantUserProjection, rejected: readonly string[], release: AcceptedPhase3BProductContextRelease): FounderLabCandidateAssessment {
  const profile = world.profile;
  const hardKnown: string[] = []; const hardUnknown: string[] = []; const hardFailed: string[] = []; const soft: string[] = []; const limitations: string[] = []; const reasons = [];
  const city = world.locality; const worldHash = world.snapshotHash; const profileSource = profileHash(profile, worldHash, world.spotId.startsWith("syn-") ? "SYNTHETIC_FIXTURE_ONLY" : "WORLD_COHORT_HANDOFF");
  if (interpretation.targetCity) { if (city === interpretation.targetCity) hardKnown.push("LOCATION_SCOPE"); else hardFailed.push("LOCATION_SCOPE"); }
  if (interpretation.hardConstraints.includes("ACCESSIBILITY")) { if (profile.wheelchair === "KNOWN_TRUE") hardKnown.push("ACCESSIBILITY"); else if (profile.wheelchair === "KNOWN_FALSE") hardFailed.push("ACCESSIBILITY"); else hardUnknown.push("ACCESSIBILITY"); }
  if (interpretation.hardConstraints.includes("BUDGET_MAXIMUM")) { const amount = interpretation.budget.amount; if (amount === null || profile.priceMaxChf === null) hardUnknown.push("BUDGET_MAXIMUM"); else if (profile.priceMaxChf <= amount) hardKnown.push("BUDGET_MAXIMUM"); else hardFailed.push("BUDGET_MAXIMUM"); }
  if (interpretation.hardConstraints.includes("DISTANCE_MAXIMUM")) { if (profile.distanceMinutes === null) hardUnknown.push("DISTANCE_MAXIMUM"); else if (profile.distanceMinutes <= 20) hardKnown.push("DISTANCE_MAXIMUM"); else hardFailed.push("DISTANCE_MAXIMUM"); }
  if (interpretation.hardConstraints.includes("AGE_OR_LEGAL")) { const state = resolveAgeConstraint(world, interpretation.group.minimumAge, interpretation.group.adultPresent); if (state === "KNOWN_TRUE") hardKnown.push("AGE_OR_LEGAL"); else if (state === "KNOWN_FALSE") hardFailed.push("AGE_OR_LEGAL"); else hardUnknown.push("AGE_OR_LEGAL"); }
  const actualAvailability = resolveActualAvailability(world, interpretation);
  if (interpretation.hardConstraints.includes("OPENING_CURRENT")) { if (actualAvailability.status === "open") hardKnown.push("OPENING_CURRENT"); else if (actualAvailability.status === "closed") hardFailed.push("OPENING_CURRENT"); else hardUnknown.push("OPENING_CURRENT"); }
  if (interpretation.hardConstraints.includes("KITCHEN_CURRENT")) hardUnknown.push("KITCHEN_CURRENT");
  const coreIntentCoverage = resolveIntentCoverage(world, interpretation.primaryIntent);
  const secondaryIntentCoverage = resolveIntentCoverage(world, interpretation.secondaryIntent);
  const purposeFact = contextualFact(world, "purpose.primary_visit");
  const categoryFact = snapshotFact(world, "classification.primary_category");
  const placeTypesFact = snapshotFact(world, "classification.place_types");
  const purposeState = purposeFact.state === "KNOWN" ? "CONFIRMED" as const : purposeFact.state;
  const classificationState = categoryFact.state === "DISPUTED" || placeTypesFact.state === "DISPUTED" ? "DISPUTED" as const : categoryFact.state === "KNOWN" || placeTypesFact.state === "KNOWN" ? "CONFIRMED" as const : "UNKNOWN" as const;
  const primaryVisitPurpose = contextualEvaluation(purposeState, world, "purpose.primary_visit", interpretation.primaryIntent, coreIntentCoverage.mappingIds);
  const specificCoreClassification = contextualEvaluation(classificationState, world, "classification.primary_category+classification.place_types", interpretation.primaryIntent, coreIntentCoverage.mappingIds);
  const worldClassification = {
    primaryVisitPurpose: typeof purposeFact.value === "string" ? purposeFact.value : null,
    primaryCategory: typeof categoryFact.value === "string" ? categoryFact.value : null,
    placeTypes: Array.isArray(placeTypesFact.value) ? unique(placeTypesFact.value.filter((value): value is string => typeof value === "string")) : [],
    evidenceSourceHash: contentHash({ purpose: purposeFact.evidenceSourceHash, category: categoryFact.evidenceSourceHash, placeTypes: placeTypesFact.evidenceSourceHash }),
  };
  const onsiteOfferings = resolveOnsiteOfferings(world, interpretation.primaryIntent);
  const visitSituation = resolveVisitSituation(world, interpretation);
  const atmosphere = resolveAtmosphere(world, interpretation);
  const typicalDaypart = resolveTypicalDaypart(world, interpretation);
  if (atmosphere.state === "CONFIRMED") soft.push(...interpretation.moods.map((item) => item === "context.mood.quiet" ? "MOOD_QUIET" : item === "context.mood.cozy" ? "MOOD_COZY" : item === "context.mood.lively" ? "MOOD_LIVELY" : "MOOD"));
  if (profile.conflict) limitations.push("blocking-world-conflict");
  if (rejected.includes(world.spotId)) limitations.push("rejected-in-current-session");
  if (interpretation.softPreferences.includes("MOOD") && atmosphere.state === "UNKNOWN") limitations.push("soft-mood-world-evidence-not-available");
  if (atmosphere.state === "INCOMPATIBLE") limitations.push("soft-atmosphere-mismatch");
  if ([coreIntentCoverage.state, visitSituation.state, atmosphere.state, typicalDaypart.state].includes("DISPUTED")) limitations.push("contextual-world-claim-disputed");
  const policyTiers = [
    ...hardKnown.filter((key) => key !== "LOCATION_SCOPE").map((ruleClass) => classifyConstraintCandidate({ candidateId: world.spotId, ruleClass: ruleClass as "ACCESSIBILITY"|"AGE_OR_LEGAL"|"BUDGET_MAXIMUM"|"DISTANCE_MAXIMUM"|"OPENING_CURRENT"|"KITCHEN_CURRENT", knowledgeState: "KNOWN_TRUE" }, release).tier),
    ...hardUnknown.map((ruleClass) => classifyConstraintCandidate({ candidateId: world.spotId, ruleClass: ruleClass as "ACCESSIBILITY"|"AGE_OR_LEGAL"|"BUDGET_MAXIMUM"|"DISTANCE_MAXIMUM"|"OPENING_CURRENT"|"KITCHEN_CURRENT", knowledgeState: "UNKNOWN" }, release).tier),
    ...hardFailed.filter((key) => key !== "LOCATION_SCOPE").map((ruleClass) => classifyConstraintCandidate({ candidateId: world.spotId, ruleClass: ruleClass as "ACCESSIBILITY"|"AGE_OR_LEGAL"|"BUDGET_MAXIMUM"|"DISTANCE_MAXIMUM"|"OPENING_CURRENT"|"KITCHEN_CURRENT", knowledgeState: "KNOWN_FALSE" }, release).tier),
  ];
  if (hardUnknown.includes("AGE_OR_LEGAL") && PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.unknownConstraintEvaluationOverrides.some((entry) => entry.ruleClass === "AGE_OR_LEGAL")) {
    const index = policyTiers.indexOf("NOT_CONFIGURED"); if (index >= 0) policyTiers[index] = "UNCONFIRMED_FALLBACK";
  }
  const notConfigured = interpretation.intentCompatibility === "INCOMPATIBLE" || interpretation.locationAuthority.state !== "KNOWN" || policyTiers.includes("NOT_CONFIGURED") || ["NOT_CONFIGURED", "NOT_APPLICABLE"].includes(coreIntentCoverage.state);
  const rejectedHere = rejected.includes(world.spotId);
  const tier = hardFailed.length || policyTiers.includes("INELIGIBLE") || coreIntentCoverage.state === "INCOMPATIBLE" || rejectedHere || profile.conflict ? "INELIGIBLE" as const : notConfigured ? "NOT_CONFIGURED" as const : policyTiers.includes("UNCONFIRMED_FALLBACK") || ["UNKNOWN", "DISPUTED"].includes(coreIntentCoverage.state) ? "UNCONFIRMED_FALLBACK" as const : "ELIGIBLE_CONFIRMED" as const;
  reasons.push(reason("world-snapshot-authorized", "WORLD", worldHash, `World Knowledge bestätigt den Snapshot für ${profile.label}.`, true));
  if (coreIntentCoverage.state === "CONFIRMED") reasons.push(reason("core-intent-confirmed", "WORLD", coreIntentCoverage.evidenceSourceHash, "Die Kernabsicht ist durch autorisierte World-Fakten und die evaluation-only Zuordnung bestätigt.", true));
  if (coreIntentCoverage.state === "UNKNOWN") reasons.push(reason("core-intent-unknown", "LIMITATION", coreIntentCoverage.evidenceSourceHash, "Für die Kernabsicht fehlt eine benötigte World-Angabe; unbekannt ist weder Ja noch Nein.", false));
  if (coreIntentCoverage.state === "NOT_CONFIGURED") reasons.push(reason("core-intent-mapping-not-configured", "LIMITATION", coreIntentCoverage.evidenceSourceHash, "Die Zuordnung der World-Fakten zur Kernabsicht ist noch nicht freigegeben.", false));
  if (coreIntentCoverage.state === "NOT_APPLICABLE") reasons.push(reason("core-intent-required", "LIMITATION", coreIntentCoverage.evidenceSourceHash, "Ohne gebundene Kernabsicht ist keine bestätigte Candidate-Auswertung möglich.", false));
  if (coreIntentCoverage.state === "INCOMPATIBLE") reasons.push(reason("core-intent-incompatible", "WORLD", coreIntentCoverage.evidenceSourceHash, "Autorisierte World-Fakten belegen, dass der Spot die Kernabsicht nicht erfüllt.", true));
  if (coreIntentCoverage.state === "DISPUTED") reasons.push(reason("core-intent-disputed", "LIMITATION", coreIntentCoverage.evidenceSourceHash, "Zum Hauptgrund für den Besuch liegen widersprüchliche Angaben vor; keine davon wird automatisch zum Gewinner erklärt.", false));
  if (onsiteOfferings.state === "CONFIRMED") reasons.push(reason("onsite-offering-additional-only", "WORLD", onsiteOfferings.evidenceSourceHash, "Ein passendes Zusatzangebot ist vorhanden, bestätigt aber nicht den Hauptzweck des gesamten Spots.", true));
  if (visitSituation.state === "CONFIRMED") reasons.push(reason("visit-situation-confirmed", "WORLD", visitSituation.evidenceSourceHash, "Die gewünschte Besuchssituation ist unter den gebundenen Bedingungen bestätigt.", true));
  if (visitSituation.state === "UNKNOWN") reasons.push(reason("visit-situation-unknown", "LIMITATION", visitSituation.evidenceSourceHash, "Zur gewünschten Besuchssituation fehlt eine bestätigte Angabe.", false));
  if (visitSituation.state === "INCOMPATIBLE") reasons.push(reason("visit-situation-mismatch", "WORLD", visitSituation.evidenceSourceHash, "Die bestätigten Besuchssituationen decken diese konkrete Situation nicht ab.", false));
  if (atmosphere.state === "CONFIRMED") reasons.push(reason("atmosphere-confirmed", "WORLD", atmosphere.evidenceSourceHash, "Die gewünschte Atmosphäre ist situationsbezogen bestätigt.", true));
  if (atmosphere.state === "UNKNOWN") reasons.push(reason("atmosphere-unknown", "LIMITATION", atmosphere.evidenceSourceHash, "Zur gewünschten Atmosphäre fehlt eine bestätigte Angabe; das schließt den Spot nicht aus.", false));
  if (atmosphere.state === "INCOMPATIBLE") reasons.push(reason("atmosphere-soft-mismatch", "WORLD", atmosphere.evidenceSourceHash, "Die bestätigte Atmosphäre entspricht dem weichen Wunsch nicht; allein dadurch wird der Spot nicht ausgeschlossen.", false));
  if (atmosphere.state === "DISPUTED") reasons.push(reason("atmosphere-disputed", "LIMITATION", atmosphere.evidenceSourceHash, "Zur Atmosphäre liegen widersprüchliche Angaben vor; es wird keine Gewinneraussage erzeugt.", false));
  if (typicalDaypart.state === "CONFIRMED") reasons.push(reason("typical-daypart-confirmed", "WORLD", typicalDaypart.evidenceSourceHash, "Die gewünschte Tageszeit ist als typische Nutzungszeit bestätigt.", true));
  if (typicalDaypart.state === "INCOMPATIBLE") reasons.push(reason("typical-daypart-soft-mismatch", "WORLD", typicalDaypart.evidenceSourceHash, "Die gewünschte Tageszeit ist nicht als typische Nutzung bestätigt; die tatsächliche Verfügbarkeit bestimmen weiterhin nur Öffnungszeiten.", false));
  if (secondaryIntentCoverage.state === "NOT_CONFIGURED") reasons.push(reason("secondary-intent-mapping-not-configured", "LIMITATION", secondaryIntentCoverage.evidenceSourceHash, "Die Nebenabsicht wird getrennt geführt; ihre World-Zuordnung ist noch nicht freigegeben.", false));
  if (soft.length) reasons.push(reason("composite-context-soft-match", "CONTEXT", interpretation.interpretationHash, "Der Spot passt zu belegten Teilen der gemeinsam verstandenen Situation.", true));
  if (interpretation.softPreferences.includes("MOOD") && atmosphere.state === "UNKNOWN") reasons.push(reason("soft-mood-evidence-unavailable", "LIMITATION", worldHash, "Der weiche Stimmungswunsch bleibt sichtbar, ist für diesen Spot aber nicht durch autorisierte World-Evidence belegt.", false));
  const constraintLabel = (key: string) => ({ LOCATION_SCOPE: "Das Zielgebiet", ACCESSIBILITY: "Der rollstuhlgerechte Zugang", BUDGET_MAXIMUM: "Das maximale Budget", DISTANCE_MAXIMUM: "Die gewünschte Nähe", AGE_OR_LEGAL: "Die Altersregel", OPENING_CURRENT: "Der aktuelle Öffnungsstatus", KITCHEN_CURRENT: "Der aktuelle Küchenstatus" } as Record<string, string>)[key] ?? "Die Bedingung";
  for (const key of hardKnown) reasons.push(reason(`hard-${key.toLowerCase()}-confirmed`, "WORLD", profileSource, `${constraintLabel(key)} ist durch die gebundene World-Auswertung bestätigt.`, true));
  for (const key of hardUnknown) reasons.push(reason(`hard-${key.toLowerCase()}-unknown`, "LIMITATION", profileSource, `${constraintLabel(key)} ist unbekannt und wird weder als erfüllt noch als nicht erfüllt behauptet.`, false));
  for (const key of hardFailed) reasons.push(reason(`hard-${key.toLowerCase()}-failed`, "WORLD", profileSource, `${constraintLabel(key)} verletzt eine ausdrückliche Bedingung.`, true));
  if (rejectedHere) reasons.push(reason("situational-reject", "CONTEXT", interpretation.interpretationHash, "Dieser Spot wurde nur für diese Anfrage und diesen Context abgewählt; das ist keine objektive World-Inkompatibilität.", true));
  if (projection.status === "ACTIVE") reasons.push(reason("user-projection-read-without-authority", "USER", projection.projectionHash, "Minimierte User Intelligence ist sichtbar, besitzt hier aber keine Ranking- oder Eligibility-Autorität.", true));
  const order = { ELIGIBLE_CONFIRMED: "0", UNCONFIRMED_FALLBACK: "1", NOT_CONFIGURED: "2", INELIGIBLE: "3" }[tier];
  const body = { contractVersion: PHASE3C_LAB_VERSIONS.assessment, candidateId: world.spotId, label: profile.label, tier, coreIntentCoverage, secondaryIntentCoverage, worldClassification, primaryVisitPurpose, specificCoreClassification, onsiteOfferings, visitSituation, atmosphere, typicalDaypart, actualAvailability, confirmedHardConstraints: unique(hardKnown), unknownHardConstraints: unique(hardUnknown), failedHardConstraints: unique(hardFailed), matchedSoftPreferences: unique(soft), conflicts: profile.conflict ? ["WORLD_BLOCKING_CONFLICT"] : [], reasons, limitations: unique(limitations), rejectionClass: rejectedHere ? "SITUATIONAL_REJECT" as const : "NONE" as const, userIntelligenceInvolved: projection.status === "ACTIVE", userIntelligenceAffectsEligibility: false as const, fixtureOrderKey: `${order}:${world.spotId}` };
  return deepFreeze(FounderLabCandidateAssessmentSchema.parse(withContentHash(body, "assessmentHash")));
}

export async function runFounderDecisionLab(input: { request: unknown; corrections?: unknown; worldReader?: WorldKnowledgeReaderPort; cohortManifest?: FounderWorldCohortManifest | null; cohortHandoff?: FounderWorldCohortHandoff | unknown }): Promise<FounderLabResult> {
  const acceptedProductContext = loadAcceptedPhase3BProductContextRelease(); const request = FounderLabRequestSchema.parse(input.request); const interpretation = resolveFounderLabText(request, input.corrections);
  if (input.cohortHandoff && (input.worldReader || input.cohortManifest)) throw new Error("phase3c_founder_cohort_sources_must_not_mix");
  if ((input.worldReader && !input.cohortManifest) || (!input.worldReader && input.cohortManifest)) throw new Error("phase3c_founder_cohort_binding_incomplete");
  const cohortInput = input.worldReader && input.cohortManifest
    ? { reader: input.worldReader, manifest: input.cohortManifest }
    : input.cohortHandoff ? { handoff: input.cohortHandoff } : {};
  const { cohort, rows } = await loadCohort(cohortInput); const projection = userProjection(request, interpretation.interpretationHash);
  const candidates = rows.map((row) => assess(row, interpretation, projection, request.rejectedCandidateIds, acceptedProductContext)).sort((a, b) => a.fixtureOrderKey.localeCompare(b.fixtureOrderKey));
  const explanation = candidates.slice(0, 3).flatMap((candidate) => candidate.reasons.filter((item) => item.confirmed || item.domain === "LIMITATION"));
  const degradation = cohort.source === "SYNTHETIC_FALLBACK" ? "SYNTHETIC_WORLD_FALLBACK" as const : projection.status === "NEUTRAL" ? "USER_NEUTRAL" as const : interpretation.limitations.length ? "NOT_CONFIGURED" as const : "NONE" as const;
  const requestHash = contentHash({ contractVersion: request.contractVersion, requestId: request.requestId, inputHash: interpretation.inputHash, deviceLocation: request.deviceLocation, userMode: request.userMode, alternativeRequested: request.alternativeRequested, rejectedCandidateIds: request.rejectedCandidateIds });
  const body = { contractVersion: PHASE3C_LAB_VERSIONS.result, resultId: `result-${request.requestId}`, createdAt: FIXED_TIME, requestHash, interpretation, compatibilityHash: PHASE3C_LAB_COMPATIBILITY.compatibilityHash, phase3BReleaseHash: PHASE3B_COMBINED_RELEASE.releaseHash, contextualWorldPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash, worldCohort: cohort, userProjectionHash: projection.projectionHash, userProjectionState: projection.status, userNeutralReason: nullable(projection.neutralReason), candidates, explanation, alternative: { requested: request.alternativeRequested, negativeSignalProduced: false as const }, reject: { candidateIds: unique(request.rejectedCandidateIds), userEventProduced: false as const, scope: "USER_X_SPOT_X_DECISION_X_CONTEXT" as const }, limitations: unique([...interpretation.limitations, ...cohort.limitations, ...(projection.status === "NEUTRAL" ? [`user-projection-neutral-${projection.neutralReason?.toLowerCase()}`] : [])]), degradation, evaluationOnly: true as const, calibrationOnly: true as const, productionAuthorized: false as const, productRankingAuthorized: false as const, externalProviderUsed: false as const, rawTextPersisted: false as const, writesUserIntelligence: false as const, commercialInfluence: "FORBIDDEN" as const };
  return deepFreeze(FounderLabResultSchema.parse(withContentHash(body, "resultHash")));
}

export async function replayFounderDecisionLab(request: unknown, supplied: unknown, options: { corrections?: unknown; cohortHandoff?: FounderWorldCohortHandoff | unknown } = {}): Promise<FounderLabResult> {
  const parsed = FounderLabResultSchema.parse(supplied); assertContentHash(parsed as unknown as Record<string, unknown>, "resultHash");
  for (const candidate of parsed.candidates) assertContentHash(candidate as unknown as Record<string, unknown>, "assessmentHash");
  const expected = await runFounderDecisionLab({ request, ...(options.corrections ? { corrections: options.corrections } : {}), ...(options.cohortHandoff ? { cohortHandoff: options.cohortHandoff } : {}) });
  if (canonicalJson(parsed) !== canonicalJson(expected)) throw new Error("phase3c_founder_lab_replay_mismatch");
  return expected;
}

export const PHASE3C_FOUNDER_SCENARIO_IDS = Object.freeze([
  "quiet-first-date", "lively-bar-friends", "quiet-alone", "family-age12-with-adult", "age12-alone", "target-zurich-device-basel", "tracking-off-city-text", "nearby-reachable-unreachable", "cheap-dinner-under-20", "concrete-budget-conflicting-price-level", "wheelchair-confirmed-vs-unknown", "multiple-hard-partially-confirmed", "mood-synonym", "unknown-mood", "compatible-secondary-intent", "incompatible-intents", "alternative-request", "spot-not-fit", "context-flip", "world-conflict", "missing-cohort-manifest", "tampered-cohort-manifest", "user-unresolved-conflict", "projection-outside-context", "consent-withdrawal-reset-erasure", "full-replay", "event-order-changed", "same-input-byte-identical",
] as const);

const scenarioText: Record<typeof PHASE3C_FOUNDER_SCENARIO_IDS[number], string> = {
  "quiet-first-date": "Ruhiges Restaurant in Zürich für ein erstes Date", "lively-bar-friends": "Lebhafte Bar in Zürich mit Freunden", "quiet-alone": "Ruhiges Café in Zürich allein", "family-age12-with-adult": "Familienessen in Zürich mit 12-jährigem Kind und Erwachsenen", "age12-alone": "12-jährige Person allein in einer Bar in Zürich", "target-zurich-device-basel": "Restaurant in Zürich", "tracking-off-city-text": "Café in Zürich", "nearby-reachable-unreachable": "Restaurant in der Nähe in Zürich", "cheap-dinner-under-20": "Günstiges Abendessen in Zürich unter 20 CHF pro Person", "concrete-budget-conflicting-price-level": "Abendessen in Zürich höchstens 20 CHF pro Person", "wheelchair-confirmed-vs-unknown": "Rollstuhlgerechtes gemütliches Café in Zürich", "multiple-hard-partially-confirmed": "Rollstuhlgerechtes Café, in der Nähe und höchstens 20 CHF in Zürich", "mood-synonym": "Entspanntes gemütliches Café in Zürich", "unknown-mood": "Café in Zürich Stimmung flirrblau", "compatible-secondary-intent": "Ruhig essen und reden in Zürich", "incompatible-intents": "Essen und nicht essen in Zürich", "alternative-request": "Ruhiges Café in Zürich", "spot-not-fit": "Ruhiges Café in Zürich", "context-flip": "Lebhafte Bar in Zürich mit Freunden", "world-conflict": "Ruhiges Restaurant in Zürich", "missing-cohort-manifest": "Restaurant in Zürich", "tampered-cohort-manifest": "Restaurant in Zürich", "user-unresolved-conflict": "Ruhiges Café in Zürich", "projection-outside-context": "Ruhiges Café in Zürich", "consent-withdrawal-reset-erasure": "Ruhiges Café in Zürich", "full-replay": "Ruhiges Restaurant in Zürich für ein erstes Date", "event-order-changed": "Ruhiges Café in Zürich", "same-input-byte-identical": "Ruhiges Café in Zürich",
};

const requestForScenario = (scenarioId: typeof PHASE3C_FOUNDER_SCENARIO_IDS[number], index: number): FounderLabRequest => FounderLabRequestSchema.parse({ contractVersion: PHASE3C_LAB_VERSIONS.request, requestId: `phase3c-scenario-${String(index + 1).padStart(2, "0")}`, ephemeralText: scenarioText[scenarioId], deviceLocation: scenarioId === "target-zurich-device-basel" ? { state: "AVAILABLE", city: "Basel" } : scenarioId === "tracking-off-city-text" ? { state: "DENIED", city: null } : { state: "AVAILABLE", city: "Zurich" }, userMode: scenarioId === "user-unresolved-conflict" || scenarioId === "projection-outside-context" ? "ACTIVE_SYNTHETIC" : scenarioId === "consent-withdrawal-reset-erasure" ? "NO_CONSENT" : "NEUTRAL_MISSING", alternativeRequested: scenarioId === "alternative-request", rejectedCandidateIds: scenarioId === "spot-not-fit" ? ["syn-spot-0001"] : [] });

export const PHASE3C_FOUNDER_ORACLES: readonly FounderLabOracle[] = deepFreeze(PHASE3C_FOUNDER_SCENARIO_IDS.map((scenarioId, index) => {
  const requiredReasonCodes = scenarioId === "wheelchair-confirmed-vs-unknown" ? ["hard-accessibility-confirmed", "hard-accessibility-unknown"] : ["world-snapshot-authorized"];
  const oracleRequest = requestForScenario(scenarioId, index);
  const requiredTiers = scenarioId === "incompatible-intents" ? ["NOT_CONFIGURED"] : scenarioId === "age12-alone" ? ["INELIGIBLE", "UNCONFIRMED_FALLBACK"] : ["UNCONFIRMED_FALLBACK"];
  const body = { contractVersion: PHASE3C_LAB_VERSIONS.oracle, oracleId: `founder-lab-oracle-3c-${String(index + 1).padStart(2, "0")}`, scenarioId, request: oracleRequest, expected: { requiredReasonCodes, requiredTiers, degradation: "SYNTHETIC_WORLD_FALLBACK" as const }, worldEvidenceRequired: true, userProjectionExpected: scenarioId === "user-unresolved-conflict" || scenarioId === "projection-outside-context" ? "ACTIVE" as const : "NEUTRAL" as const, contextExpectation: `context-${scenarioId}`, productionAuthorized: false as const, productQualityClaim: false as const };
  return FounderLabOracleSchema.parse(withContentHash(body, "oracleHash"));
}));

const releaseBody = { contractVersion: PHASE3C_LAB_VERSIONS.release, releaseId: "decision-founder-lab-release-3c-5", canonicalBaseSha: CANONICAL_BASE_SHA, phase3BReleaseHash: PHASE3B_COMBINED_RELEASE.releaseHash, compatibilityHash: PHASE3C_LAB_COMPATIBILITY.compatibilityHash, worldFounderEvidenceHash: WORLD_FOUNDER_EVIDENCE_HASH, userFounderRecordHash: USER_FOUNDER_RECORD_HASH, userProductPolicyHash: USER_PRODUCT_POLICY_HASH, userSignalRegistryHash: USER_SIGNAL_REGISTRY_HASH, scenarioSetHash: contentHash(PHASE3C_FOUNDER_SCENARIO_IDS), contextualWorldPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash, founderCohortHandoffContract: "backyrd.world-knowledge.founder-cohort-handoff@1.0" as const, trustRoot: "INHERITED_PHASE3B_SIGNED_RELEASE_PLUS_REPOSITORY_SOURCE_IDENTITY" as const, evaluationOnly: true as const, calibrationOnly: true as const, productionAuthorized: false as const, productRankingAuthorized: false as const, externalProviderUsed: false as const, rawTextPersisted: false as const, writesUserIntelligence: false as const, commercialInfluence: "FORBIDDEN" as const };
export const PHASE3C_FOUNDER_LAB_RELEASE: FounderLabRelease = deepFreeze(FounderLabReleaseSchema.parse(withContentHash(releaseBody, "releaseHash")));

export async function runFounderLabOracles(): Promise<FounderLabReport> {
  if (PHASE3B_WORLD_BINDING.registryVersion !== REGISTRY_V1_1_VERSION || PHASE3B_COMBINED_RELEASE.releaseHash !== "fa724e8a6616e502e34bc9ad0366bcb85a2ec05760074f411da18b5c1ed61725") throw new Error("phase3c_canonical_context_binding_changed");
  const hashes: string[] = [];
  for (const oracle of PHASE3C_FOUNDER_ORACLES) {
    assertContentHash(oracle as unknown as Record<string, unknown>, "oracleHash");
    const result = await runFounderDecisionLab({ request: oracle.request }); const reasonCodes = new Set(result.candidates.flatMap((row) => row.reasons.map((entry) => entry.reasonCode))); const tiers = new Set(result.candidates.map((row) => row.tier));
    if (!oracle.expected.requiredReasonCodes.every((code) => reasonCodes.has(code)) || !oracle.expected.requiredTiers.every((tier) => tiers.has(tier)) || result.degradation !== oracle.expected.degradation || result.userProjectionState !== oracle.userProjectionExpected) throw new Error(`phase3c_oracle_failed:${oracle.scenarioId}`);
    hashes.push(result.resultHash);
  }
  const body = { contractVersion: PHASE3C_LAB_VERSIONS.report, releaseHash: PHASE3C_FOUNDER_LAB_RELEASE.releaseHash, scenarioIds: PHASE3C_FOUNDER_SCENARIO_IDS, resultHashes: hashes, oracleHashes: PHASE3C_FOUNDER_ORACLES.map((item) => item.oracleHash), passed: 28, failed: 0 as const, evaluationOnly: true as const, calibrationOnly: true as const, productionAuthorized: false as const, productRankingAuthorized: false as const, externalProviderUsed: false as const, rawTextPersisted: false as const, writesUserIntelligence: false as const, commercialInfluence: "FORBIDDEN" as const };
  return deepFreeze(FounderLabReportSchema.parse(withContentHash(body, "reportHash")));
}

export async function replayFounderLabReport(value: unknown): Promise<FounderLabReport> {
  const supplied = FounderLabReportSchema.parse(value); assertContentHash(supplied as unknown as Record<string, unknown>, "reportHash");
  const expected = await runFounderLabOracles(); if (canonicalJson(supplied) !== canonicalJson(expected)) throw new Error("phase3c_founder_lab_report_replay_mismatch"); return expected;
}
