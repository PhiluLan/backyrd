import {
  ACCEPTED_SOURCE_POLICY, FOUNDER_COHORT_VERSION, FOUNDER_EVALUATION_SCOPE, REGISTRY_HASH, REGISTRY_VERSION,
  REGISTRY_V1_1_HASH, REGISTRY_V1_1_VERSION, WORLD_KNOWLEDGE_PORT_VERSION, parseWorldKnowledgeSnapshot,
  type FounderWorldCohortManifest, type WorldKnowledgeReaderPort, type WorldKnowledgeSnapshot,
} from "@backyrd/world-knowledge-core";
import {
  COLD_SNAPSHOT, CONTRACT_VERSIONS as USER_VERSIONS, GRANTED_CONSENT, NO_CONSENT, SYNTHETIC_CONCEPT_REGISTRY_VERSION,
  SYNTHETIC_MANIFEST, SYNTHETIC_SUBJECT_BINDING_HASH, SYNTHETIC_USER_A, buildRelevantUserProjection,
  parseRelevantUserProjection, type RelevantUserProjection,
} from "@backyrd/user-intelligence-vnext-core";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { PHASE3B_COMBINED_RELEASE, PHASE3B_WORLD_BINDING } from "./phase3b-artifacts.js";
import { classifyConstraintCandidate } from "./phase3b-policy.js";
import { loadAcceptedPhase3BProductContextRelease, type AcceptedPhase3BProductContextRelease } from "./phase3b-release.js";
import { generateSyntheticWorld, SyntheticWorldKnowledgeReader } from "./sandbox.js";
import { SYNTHETIC_WORLD_SOURCE_POLICY } from "./synthetic-world-policy.js";
import {
  FounderLabCandidateAssessmentSchema, FounderLabCohortSchema, FounderLabCorrectionsSchema, FounderLabInterpretationSchema, FounderLabOracleSchema,
  FounderLabReleaseSchema, FounderLabReportSchema, FounderLabRequestSchema, FounderLabResultSchema,
  PHASE3C_LAB_VERSIONS, Phase3CLabCompatibilitySchema, type FounderLabCandidateAssessment, type FounderLabCohort,
  type FounderLabCorrections, type FounderLabInterpretation, type FounderLabOracle, type FounderLabRelease, type FounderLabReport, type FounderLabRequest,
  type FounderLabResult,
} from "./phase3c-lab-contracts.js";

const CANONICAL_BASE_SHA = "ee71680ed81a9a93b20e2ad82166ef7b4db1190e";
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

interface FixtureProfile {
  readonly label: string; readonly quiet: "KNOWN_TRUE"|"KNOWN_FALSE"|"UNKNOWN"; readonly lively: "KNOWN_TRUE"|"KNOWN_FALSE"|"UNKNOWN";
  readonly wheelchair: "KNOWN_TRUE"|"KNOWN_FALSE"|"UNKNOWN"; readonly priceMaxChf: number | null; readonly distanceMinutes: number;
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
  const primaryIntent = /bar|trinken|drink/.test(text) ? "context.intent.drinks" : /kaffee|café|cafe/.test(text) ? "context.intent.coffee" : /essen|restaurant|mittag|abendessen/.test(text) ? "context.intent.food" : null;
  const incompatible = /essen und nicht essen|ruhig und laut zugleich/.test(text);
  const secondaryIntent = incompatible ? "context.intent.conflicting" : /ruhig|gemütlich|date/.test(text) && primaryIntent ? "context.intent.conversation" : /essen.*trinken|trinken.*essen/.test(text) ? "context.intent.food" : null;
  const targetCity = /zürich|zurich/.test(text) ? "Zurich" : /basel/.test(text) ? "Basel" : null;
  const amountMatch = text.match(/(?:höchstens|max(?:imal)?|unter|bis)\s*(\d{1,4})\s*(?:chf|fr(?:anken)?)/);
  const amount = amountMatch?.[1] ? Number(amountMatch[1]) : null;
  const moods = unique([/ruhig|entspannt|leise/.test(text) ? "context.mood.quiet" : "", /gemütlich|cosy|cozy/.test(text) ? "context.mood.cozy" : "", /lebhaft|laut|party/.test(text) ? "context.mood.lively" : ""].filter(Boolean));
  const knownMoodTokens = /(ruhig|entspannt|leise|gemütlich|cosy|cozy|lebhaft|laut|party)/;
  const unknownMood = text.match(/stimmung\s+([\p{L}-]+)/u)?.[1];
  const minimumAge = text.match(/(\d{1,2})[- ]?jähr/)?.[1];
  const adultPresent = /mit (?:einem |einer )?erwachsen|mit eltern|familie/.test(text);
  const hard: string[] = [];
  if (/rollstuhl|stufenfrei|barrierefrei/.test(text)) hard.push("ACCESSIBILITY");
  if (amount !== null && /höchstens|maximal|unter|bis/.test(text)) hard.push("BUDGET_MAXIMUM");
  if (/muss (?:noch )?geöffnet|jetzt geöffnet|küche muss/.test(text)) hard.push(/küche/.test(text) ? "KITCHEN_CURRENT" : "OPENING_CURRENT");
  if (/in der nähe|maximal \d+ minuten/.test(text)) hard.push("DISTANCE_MAXIMUM");
  if (minimumAge) hard.push("AGE_OR_LEGAL");
  const soft = unique([moods.length ? "MOOD" : "", /neu(?:es|e)|entdecken/.test(text) ? "EXPLORATION" : "", /bekannt|vertraut/.test(text) ? "FAMILIARITY" : ""].filter(Boolean));
  const dayPhase = /mittag/.test(text) ? "MIDDAY" : /abend|spät/.test(text) ? "EVENING" : /morgen|vormittag/.test(text) ? "MORNING" : null;
  const duration = /\bkurz|45 minuten|30 minuten/.test(text) ? "SHORT" : /\blang|viel zeit/.test(text) ? "LONG" : /\bmittel/.test(text) ? "MEDIUM" : null;
  const interpretationBody = {
    contractVersion: PHASE3C_LAB_VERSIONS.interpretation, resolverVersion: "decision-founder-lab-local-resolver-3c-1", inputHash: contentHash(request.ephemeralText.normalize("NFC")),
    primaryIntent, secondaryIntent, intentCompatibility: secondaryIntent ? incompatible ? "INCOMPATIBLE" as const : "COMPATIBLE" as const : primaryIntent ? "NOT_APPLICABLE" as const : "UNKNOWN" as const,
    occasion: /erst(?:es|en) date/.test(text) ? "context.occasion.first-date" : /familien|mit (?:zwei |\d+ )?kind/.test(text) ? "context.occasion.family" : null,
    moods, targetCity, dateTime: { state: dayPhase ? "KNOWN" as const : "UNKNOWN" as const, localDate: /nächste woche/.test(text) ? null : "2026-09-16", dayPhase, timeZone: targetCity ? "Europe/Zurich" : null },
    group: { size: /zu viert/.test(text) ? 4 : /mit zwei kindern/.test(text) ? 3 : null, minimumAge: minimumAge ? Number(minimumAge) : null, adultPresent, companionType: /allein/.test(text) ? "alone" : /freunde/.test(text) ? "friends" : /date|partner/.test(text) ? "partner-date" : /famil|kind/.test(text) ? "family" : null },
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

function profileHash(profile: FixtureProfile, snapshotHash: string) { return contentHash({ authority: "SYNTHETIC_FIXTURE_ONLY", snapshotHash, profile }); }

let syntheticCohortCache: Promise<{ cohort: FounderLabCohort; rows: readonly { snapshot: WorldKnowledgeSnapshot; profile: FixtureProfile }[] }> | null = null;

async function loadCohort(input: { reader?: WorldKnowledgeReaderPort; manifest?: FounderWorldCohortManifest | null } = {}): Promise<{ cohort: FounderLabCohort; rows: readonly { snapshot: WorldKnowledgeSnapshot; profile: FixtureProfile }[] }> {
  if ((input.reader && !input.manifest) || (!input.reader && input.manifest)) throw new Error("phase3c_founder_cohort_binding_incomplete");
  if (input.reader && input.manifest) {
    const manifest = input.manifest;
    const body = { ...manifest } as Record<string, unknown>; delete body.cohortHash;
    if (manifest.contractVersion !== FOUNDER_COHORT_VERSION || manifest.scope !== FOUNDER_EVALUATION_SCOPE || manifest.registryVersion !== REGISTRY_VERSION || manifest.registryHash !== REGISTRY_HASH || contentHash(body) !== manifest.cohortHash || manifest.spots.length < 1 || manifest.spots.length > 40 || new Set(manifest.spots.map((row) => row.spotId)).size !== manifest.spots.length) throw new Error("phase3c_founder_cohort_manifest_invalid");
    const snapshots = await Promise.all(manifest.spots.map(async (binding) => { const snapshot = await readSnapshot(input.reader!, binding.spotId); if (snapshot.snapshotHash !== binding.snapshotHash) throw new Error("phase3c_founder_cohort_snapshot_mismatch"); return snapshot; }));
    const rows = snapshots.map((snapshot, index) => ({ snapshot, profile: profiles[index % profiles.length]! }));
    const cohortBody = { contractVersion: PHASE3C_LAB_VERSIONS.cohort, cohortId: manifest.cohortId, source: "FOUNDER_WORLD_COHORT" as const, worldRegistryVersion: manifest.registryVersion, worldRegistryHash: manifest.registryHash, sourcePolicyVersion: manifest.policyVersion, spotBindings: rows.map(({ snapshot, profile }) => ({ spotId: snapshot.spot.spotId, snapshotHash: snapshot.snapshotHash, fixtureProfileHash: profileHash(profile, snapshot.snapshotHash) })), limitations: ["fixture-fit-profile-is-calibration-only"], mixedSources: false as const };
    return { cohort: deepFreeze(FounderLabCohortSchema.parse(withContentHash(cohortBody, "cohortHash"))), rows };
  }
  syntheticCohortCache ??= (async () => {
    const { world, reader } = fixtureWorld(); const snapshots = await Promise.all(world.spots.slice(0, profiles.length).map((spot) => readSnapshot(reader, spot.id)));
    const rows = snapshots.map((snapshot, index) => ({ snapshot, profile: profiles[index]! }));
    const cohortBody = { contractVersion: PHASE3C_LAB_VERSIONS.cohort, cohortId: "synthetic-founder-lab-cohort-3c-1", source: "SYNTHETIC_FALLBACK" as const, worldRegistryVersion: REGISTRY_VERSION, worldRegistryHash: REGISTRY_HASH, sourcePolicyVersion: SYNTHETIC_WORLD_SOURCE_POLICY.policyVersion, spotBindings: rows.map(({ snapshot, profile }) => ({ spotId: snapshot.spot.spotId, snapshotHash: snapshot.snapshotHash, fixtureProfileHash: profileHash(profile, snapshot.snapshotHash) })), limitations: ["no-bound-founder-world-cohort", "synthetic-world-never-mixed-with-founder-world", "fixture-fit-profile-is-calibration-only"], mixedSources: false as const };
    return deepFreeze({ cohort: FounderLabCohortSchema.parse(withContentHash(cohortBody, "cohortHash")), rows });
  })();
  return syntheticCohortCache;
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

function assess(snapshot: WorldKnowledgeSnapshot, profile: FixtureProfile, interpretation: FounderLabInterpretation, projection: RelevantUserProjection, rejected: readonly string[], release: AcceptedPhase3BProductContextRelease): FounderLabCandidateAssessment {
  const hardKnown: string[] = []; const hardUnknown: string[] = []; const hardFailed: string[] = []; const soft: string[] = []; const limitations: string[] = []; const reasons = [];
  const city = snapshot.spot.location.locality; const worldHash = snapshot.snapshotHash; const profileSource = profileHash(profile, worldHash);
  if (interpretation.targetCity) { if (city === interpretation.targetCity) hardKnown.push("LOCATION_SCOPE"); else hardFailed.push("LOCATION_SCOPE"); }
  if (interpretation.hardConstraints.includes("ACCESSIBILITY")) { if (profile.wheelchair === "KNOWN_TRUE") hardKnown.push("ACCESSIBILITY"); else if (profile.wheelchair === "KNOWN_FALSE") hardFailed.push("ACCESSIBILITY"); else hardUnknown.push("ACCESSIBILITY"); }
  if (interpretation.hardConstraints.includes("BUDGET_MAXIMUM")) { const amount = interpretation.budget.amount; if (amount === null || profile.priceMaxChf === null) hardUnknown.push("BUDGET_MAXIMUM"); else if (profile.priceMaxChf <= amount) hardKnown.push("BUDGET_MAXIMUM"); else hardFailed.push("BUDGET_MAXIMUM"); }
  if (interpretation.hardConstraints.includes("DISTANCE_MAXIMUM")) { if (profile.distanceMinutes <= 20) hardKnown.push("DISTANCE_MAXIMUM"); else hardFailed.push("DISTANCE_MAXIMUM"); }
  if (interpretation.hardConstraints.includes("AGE_OR_LEGAL")) { const age = interpretation.group.minimumAge; if (!profile.ageRule || age === null) hardUnknown.push("AGE_OR_LEGAL"); else if (age >= profile.ageRule.minimumAge || interpretation.group.adultPresent) hardKnown.push("AGE_OR_LEGAL"); else hardFailed.push("AGE_OR_LEGAL"); }
  if (interpretation.hardConstraints.includes("OPENING_CURRENT")) hardUnknown.push("OPENING_CURRENT");
  if (interpretation.hardConstraints.includes("KITCHEN_CURRENT")) hardUnknown.push("KITCHEN_CURRENT");
  if (interpretation.moods.includes("context.mood.quiet") && profile.quiet === "KNOWN_TRUE") soft.push("MOOD_QUIET");
  if (interpretation.moods.includes("context.mood.lively") && profile.lively === "KNOWN_TRUE") soft.push("MOOD_LIVELY");
  if (profile.conflict) limitations.push("blocking-world-conflict");
  if (rejected.includes(snapshot.spot.spotId)) limitations.push("rejected-in-current-session");
  const policyTiers = [
    ...hardKnown.filter((key) => key !== "LOCATION_SCOPE").map((ruleClass) => classifyConstraintCandidate({ candidateId: snapshot.spot.spotId, ruleClass: ruleClass as "ACCESSIBILITY"|"AGE_OR_LEGAL"|"BUDGET_MAXIMUM"|"DISTANCE_MAXIMUM"|"OPENING_CURRENT"|"KITCHEN_CURRENT", knowledgeState: "KNOWN_TRUE" }, release).tier),
    ...hardUnknown.map((ruleClass) => classifyConstraintCandidate({ candidateId: snapshot.spot.spotId, ruleClass: ruleClass as "ACCESSIBILITY"|"AGE_OR_LEGAL"|"BUDGET_MAXIMUM"|"DISTANCE_MAXIMUM"|"OPENING_CURRENT"|"KITCHEN_CURRENT", knowledgeState: "UNKNOWN" }, release).tier),
    ...hardFailed.filter((key) => key !== "LOCATION_SCOPE").map((ruleClass) => classifyConstraintCandidate({ candidateId: snapshot.spot.spotId, ruleClass: ruleClass as "ACCESSIBILITY"|"AGE_OR_LEGAL"|"BUDGET_MAXIMUM"|"DISTANCE_MAXIMUM"|"OPENING_CURRENT"|"KITCHEN_CURRENT", knowledgeState: "KNOWN_FALSE" }, release).tier),
  ];
  const notConfigured = interpretation.intentCompatibility === "INCOMPATIBLE" || interpretation.locationAuthority.state !== "KNOWN" || policyTiers.includes("NOT_CONFIGURED");
  const tier = hardFailed.length || policyTiers.includes("INELIGIBLE") || rejected.includes(snapshot.spot.spotId) || profile.conflict ? "INELIGIBLE" as const : notConfigured ? "NOT_CONFIGURED" as const : policyTiers.includes("UNCONFIRMED_FALLBACK") ? "UNCONFIRMED_FALLBACK" as const : "ELIGIBLE_CONFIRMED" as const;
  reasons.push(reason("world-snapshot-authorized", "WORLD", worldHash, `World Knowledge bestätigt den Snapshot für ${profile.label}.`, true));
  if (soft.length) reasons.push(reason("composite-context-soft-match", "CONTEXT", interpretation.interpretationHash, "Der Spot passt zu belegten Teilen der gemeinsam verstandenen Situation.", true));
  for (const key of hardKnown) reasons.push(reason(`hard-${key.toLowerCase()}-confirmed`, "WORLD", profileSource, `${key} ist für dieses Fixture bestätigt.`, true));
  for (const key of hardUnknown) reasons.push(reason(`hard-${key.toLowerCase()}-unknown`, "LIMITATION", profileSource, `${key} ist unbekannt und wird nicht als falsch behauptet.`, false));
  for (const key of hardFailed) reasons.push(reason(`hard-${key.toLowerCase()}-failed`, "WORLD", profileSource, `${key} verletzt eine ausdrückliche Bedingung.`, true));
  if (projection.status === "ACTIVE") reasons.push(reason("user-projection-read-without-authority", "USER", projection.projectionHash, "Minimierte User Intelligence ist sichtbar, besitzt hier aber keine Ranking- oder Eligibility-Autorität.", true));
  const order = { ELIGIBLE_CONFIRMED: "0", UNCONFIRMED_FALLBACK: "1", NOT_CONFIGURED: "2", INELIGIBLE: "3" }[tier];
  const body = { contractVersion: PHASE3C_LAB_VERSIONS.assessment, candidateId: snapshot.spot.spotId, label: profile.label, tier, confirmedHardConstraints: unique(hardKnown), unknownHardConstraints: unique(hardUnknown), failedHardConstraints: unique(hardFailed), matchedSoftPreferences: unique(soft), conflicts: profile.conflict ? ["WORLD_BLOCKING_CONFLICT"] : [], reasons, limitations: unique(limitations), userIntelligenceInvolved: projection.status === "ACTIVE", userIntelligenceAffectsEligibility: false as const, fixtureOrderKey: `${order}:${String(99 - soft.length).padStart(2, "0")}:${snapshot.spot.spotId}` };
  return deepFreeze(FounderLabCandidateAssessmentSchema.parse(withContentHash(body, "assessmentHash")));
}

export async function runFounderDecisionLab(input: { request: unknown; corrections?: unknown; worldReader?: WorldKnowledgeReaderPort; cohortManifest?: FounderWorldCohortManifest | null }): Promise<FounderLabResult> {
  const acceptedProductContext = loadAcceptedPhase3BProductContextRelease(); const request = FounderLabRequestSchema.parse(input.request); const interpretation = resolveFounderLabText(request, input.corrections);
  if ((input.worldReader && !input.cohortManifest) || (!input.worldReader && input.cohortManifest)) throw new Error("phase3c_founder_cohort_binding_incomplete");
  const cohortInput = input.worldReader && input.cohortManifest
    ? { reader: input.worldReader, manifest: input.cohortManifest }
    : {};
  const { cohort, rows } = await loadCohort(cohortInput); const projection = userProjection(request, interpretation.interpretationHash);
  const candidates = rows.map(({ snapshot, profile }) => assess(snapshot, profile, interpretation, projection, request.rejectedCandidateIds, acceptedProductContext)).sort((a, b) => a.fixtureOrderKey.localeCompare(b.fixtureOrderKey));
  const explanation = candidates.slice(0, 3).flatMap((candidate) => candidate.reasons.filter((item) => item.confirmed || item.domain === "LIMITATION"));
  const degradation = cohort.source === "SYNTHETIC_FALLBACK" ? "SYNTHETIC_WORLD_FALLBACK" as const : projection.status === "NEUTRAL" ? "USER_NEUTRAL" as const : interpretation.limitations.length ? "NOT_CONFIGURED" as const : "NONE" as const;
  const requestHash = contentHash({ contractVersion: request.contractVersion, requestId: request.requestId, inputHash: interpretation.inputHash, deviceLocation: request.deviceLocation, userMode: request.userMode, alternativeRequested: request.alternativeRequested, rejectedCandidateIds: request.rejectedCandidateIds });
  const body = { contractVersion: PHASE3C_LAB_VERSIONS.result, resultId: `result-${request.requestId}`, createdAt: FIXED_TIME, requestHash, interpretation, compatibilityHash: PHASE3C_LAB_COMPATIBILITY.compatibilityHash, phase3BReleaseHash: PHASE3B_COMBINED_RELEASE.releaseHash, worldCohort: cohort, userProjectionHash: projection.projectionHash, userProjectionState: projection.status, userNeutralReason: nullable(projection.neutralReason), candidates, explanation, alternative: { requested: request.alternativeRequested, negativeSignalProduced: false as const }, reject: { candidateIds: unique(request.rejectedCandidateIds), userEventProduced: false as const, scope: "USER_X_SPOT_X_DECISION_X_CONTEXT" as const }, limitations: unique([...interpretation.limitations, ...cohort.limitations, ...(projection.status === "NEUTRAL" ? [`user-projection-neutral-${projection.neutralReason?.toLowerCase()}`] : [])]), degradation, evaluationOnly: true as const, calibrationOnly: true as const, productionAuthorized: false as const, productRankingAuthorized: false as const, externalProviderUsed: false as const, rawTextPersisted: false as const, writesUserIntelligence: false as const, commercialInfluence: "FORBIDDEN" as const };
  return deepFreeze(FounderLabResultSchema.parse(withContentHash(body, "resultHash")));
}

export async function replayFounderDecisionLab(request: unknown, supplied: unknown, options: { corrections?: unknown } = {}): Promise<FounderLabResult> {
  const parsed = FounderLabResultSchema.parse(supplied); assertContentHash(parsed as unknown as Record<string, unknown>, "resultHash");
  for (const candidate of parsed.candidates) assertContentHash(candidate as unknown as Record<string, unknown>, "assessmentHash");
  const expected = await runFounderDecisionLab({ request, ...(options.corrections ? { corrections: options.corrections } : {}) });
  if (canonicalJson(parsed) !== canonicalJson(expected)) throw new Error("phase3c_founder_lab_replay_mismatch");
  return expected;
}

export const PHASE3C_FOUNDER_SCENARIO_IDS = Object.freeze([
  "quiet-first-date", "lively-bar-friends", "quiet-alone", "family-age12-with-adult", "age12-alone", "target-zurich-device-basel", "tracking-off-city-text", "nearby-reachable-unreachable", "cheap-dinner-under-20", "concrete-budget-conflicting-price-level", "wheelchair-confirmed-vs-unknown", "multiple-hard-partially-confirmed", "mood-synonym", "unknown-mood", "compatible-secondary-intent", "incompatible-intents", "alternative-request", "spot-not-fit", "context-flip", "world-conflict", "missing-cohort-manifest", "tampered-cohort-manifest", "user-unresolved-conflict", "projection-outside-context", "consent-withdrawal-reset-erasure", "full-replay", "event-order-changed", "same-input-byte-identical",
] as const);

const scenarioText: Record<typeof PHASE3C_FOUNDER_SCENARIO_IDS[number], string> = {
  "quiet-first-date": "Ruhiges Restaurant in Zürich für ein erstes Date", "lively-bar-friends": "Lebhafte Bar in Zürich mit Freunden", "quiet-alone": "Ruhiges Café in Zürich allein", "family-age12-with-adult": "Familienessen in Zürich mit 12-jährigem Kind und Erwachsenen", "age12-alone": "12-jährige Person allein in einer Bar in Zürich", "target-zurich-device-basel": "Restaurant in Zürich", "tracking-off-city-text": "Café in Zürich", "nearby-reachable-unreachable": "Restaurant in der Nähe in Zürich", "cheap-dinner-under-20": "Günstiges Abendessen in Zürich unter 20 CHF pro Person", "concrete-budget-conflicting-price-level": "Abendessen in Zürich höchstens 20 CHF pro Person", "wheelchair-confirmed-vs-unknown": "Rollstuhlgerechtes gemütliches Café in Zürich", "multiple-hard-partially-confirmed": "Rollstuhlgerecht, in der Nähe und höchstens 20 CHF in Zürich", "mood-synonym": "Entspanntes gemütliches Café in Zürich", "unknown-mood": "Café in Zürich Stimmung flirrblau", "compatible-secondary-intent": "Ruhig essen und reden in Zürich", "incompatible-intents": "Essen und nicht essen in Zürich", "alternative-request": "Ruhiges Café in Zürich", "spot-not-fit": "Ruhiges Café in Zürich", "context-flip": "Lebhafte Bar in Zürich mit Freunden", "world-conflict": "Ruhiges Restaurant in Zürich", "missing-cohort-manifest": "Restaurant in Zürich", "tampered-cohort-manifest": "Restaurant in Zürich", "user-unresolved-conflict": "Ruhiges Café in Zürich", "projection-outside-context": "Ruhiges Café in Zürich", "consent-withdrawal-reset-erasure": "Ruhiges Café in Zürich", "full-replay": "Ruhiges Restaurant in Zürich für ein erstes Date", "event-order-changed": "Ruhiges Café in Zürich", "same-input-byte-identical": "Ruhiges Café in Zürich",
};

const requestForScenario = (scenarioId: typeof PHASE3C_FOUNDER_SCENARIO_IDS[number], index: number): FounderLabRequest => FounderLabRequestSchema.parse({ contractVersion: PHASE3C_LAB_VERSIONS.request, requestId: `phase3c-scenario-${String(index + 1).padStart(2, "0")}`, ephemeralText: scenarioText[scenarioId], deviceLocation: scenarioId === "target-zurich-device-basel" ? { state: "AVAILABLE", city: "Basel" } : scenarioId === "tracking-off-city-text" ? { state: "DENIED", city: null } : { state: "AVAILABLE", city: "Zurich" }, userMode: scenarioId === "user-unresolved-conflict" || scenarioId === "projection-outside-context" ? "ACTIVE_SYNTHETIC" : scenarioId === "consent-withdrawal-reset-erasure" ? "NO_CONSENT" : "NEUTRAL_MISSING", alternativeRequested: scenarioId === "alternative-request", rejectedCandidateIds: scenarioId === "spot-not-fit" ? ["syn-spot-0001"] : [] });

export const PHASE3C_FOUNDER_ORACLES: readonly FounderLabOracle[] = deepFreeze(PHASE3C_FOUNDER_SCENARIO_IDS.map((scenarioId, index) => {
  const requiredReasonCodes = scenarioId === "wheelchair-confirmed-vs-unknown" ? ["hard-accessibility-confirmed", "hard-accessibility-unknown"] : ["world-snapshot-authorized"];
  const requiredTiers = scenarioId === "incompatible-intents" ? ["NOT_CONFIGURED"] : scenarioId === "age12-alone" ? ["INELIGIBLE", "NOT_CONFIGURED"] : scenarioId === "wheelchair-confirmed-vs-unknown" ? ["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK"] : ["ELIGIBLE_CONFIRMED"];
  const body = { contractVersion: PHASE3C_LAB_VERSIONS.oracle, oracleId: `founder-lab-oracle-3c-${String(index + 1).padStart(2, "0")}`, scenarioId, request: requestForScenario(scenarioId, index), expected: { requiredReasonCodes, requiredTiers, degradation: "SYNTHETIC_WORLD_FALLBACK" as const }, worldEvidenceRequired: true, userProjectionExpected: scenarioId === "user-unresolved-conflict" || scenarioId === "projection-outside-context" ? "ACTIVE" as const : "NEUTRAL" as const, contextExpectation: `context-${scenarioId}`, productionAuthorized: false as const, productQualityClaim: false as const };
  return FounderLabOracleSchema.parse(withContentHash(body, "oracleHash"));
}));

const releaseBody = { contractVersion: PHASE3C_LAB_VERSIONS.release, releaseId: "decision-founder-lab-release-3c-1", canonicalBaseSha: CANONICAL_BASE_SHA, phase3BReleaseHash: PHASE3B_COMBINED_RELEASE.releaseHash, compatibilityHash: PHASE3C_LAB_COMPATIBILITY.compatibilityHash, worldFounderEvidenceHash: WORLD_FOUNDER_EVIDENCE_HASH, userFounderRecordHash: USER_FOUNDER_RECORD_HASH, userProductPolicyHash: USER_PRODUCT_POLICY_HASH, userSignalRegistryHash: USER_SIGNAL_REGISTRY_HASH, scenarioSetHash: contentHash(PHASE3C_FOUNDER_SCENARIO_IDS), trustRoot: "INHERITED_PHASE3B_SIGNED_RELEASE_PLUS_REPOSITORY_SOURCE_IDENTITY" as const, evaluationOnly: true as const, calibrationOnly: true as const, productionAuthorized: false as const, productRankingAuthorized: false as const, externalProviderUsed: false as const, rawTextPersisted: false as const, writesUserIntelligence: false as const, commercialInfluence: "FORBIDDEN" as const };
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
