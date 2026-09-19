import {
  ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION, parseWorldKnowledgeSnapshot,
  type WorldKnowledgeReaderPort,
} from "@backyrd/world-knowledge-core";
import type { RelevantUserProjection } from "@backyrd/user-intelligence-vnext-core";
import { contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { evaluateOpeningState, type OpeningSourcePolicy } from "./opening-state.js";
import type { ProductWorldView } from "./product-world-resolver-binding.js";
import {
  DecisionProductCandidateAssessmentSchema, DecisionProductContextSchema, DecisionProductEvaluationSchema,
  DecisionProductPresentationSchema, DecisionProductRequestSchema,
  DecisionProductWorldCohortSchema, PRODUCT_DECISION_VERSIONS,
  type DecisionProductCandidateAssessment, type DecisionProductContext, type DecisionProductEvaluation,
  type DecisionProductPresentation, type DecisionProductRequest,
} from "./product-v1-contracts.js";
import { DECISION_PRODUCT_EVALUATION_POLICY, DECISION_PRODUCT_EVALUATION_RELEASE, DECISION_PRODUCT_INTENT_POLICY, PRODUCT_V1_INTENT_MAPPINGS, type ProductV1Intent } from "./product-v1-authority.js";

export const PRODUCT_V1_EVALUATOR_VERSION = "decision-vnext-product-evaluator@1.0" as const;

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("de-CH");
const includes = (text: string, terms: readonly string[]) => terms.some((term) => text.includes(term));
const inferredIntent = (text: string): ProductV1Intent | null => includes(text, ["kaffee", "café", "cafe"]) ? "COFFEE" : includes(text, ["boulder", "klettern", "sport"]) ? "SPORT_MOVEMENT" : includes(text, ["tierpark", "zoo", "familienausflug", "natur"]) ? "NATURE_ANIMAL_EXPERIENCE" : includes(text, ["museum", "kunst", "kultur"]) ? "CULTURE_ART" : includes(text, ["wein", "bar", "drink", "etwas trinken"]) ? "DRINKS" : includes(text, ["restaurant", "essen", "mittag", "abendessen"]) ? "EAT" : includes(text, ["aktivität", "erlebnis"]) ? "ACTIVITY_EXPERIENCE" : null;
const cityIn = (text: string) => includes(text, ["zürich", "zurich"]) ? "Zurich" : text.includes("basel") ? "Basel" : null;

export function resolveDecisionProductContext(requestValue: unknown, authority: { readonly authorizedCity: string; readonly serverTime: string }): DecisionProductContext {
  const request = DecisionProductRequestSchema.parse(requestValue); const text = normalize(request.naturalLanguage); const explicit = request.explicit;
  const textCity = cityIn(text); const requestedCity = explicit.targetCity ?? textCity; if (requestedCity && requestedCity !== authority.authorizedCity) throw new Error("product_context_location_authority_mismatch");
  const primaryIntent = explicit.primaryIntent ?? inferredIntent(text);
  const hard = new Set(explicit.hardConstraints ?? []); const soft = new Set(explicit.softPreferences ?? []);
  if (includes(text, ["rollstuhl", "stufenfrei"])) hard.add("ACCESSIBILITY_STEP_FREE");
  if (includes(text, ["geöffnet", "offen", "jetzt"])) hard.add("OPEN_NOW");
  if (/\b(?:\d{1,2})[- ]?(?:jährig|jaehrig)/.test(text) || includes(text, ["tochter", "sohn", "kind"])) hard.add("AGE_OR_LEGAL");
  if (/\b(?:höchstens|maximal|bis)\s+\d{1,4}\s*(?:chf|franken)/.test(text)) hard.add("BUDGET_MAXIMUM");
  if (requestedCity) hard.add("TARGET_LOCATION");
  if (includes(text, ["ruhig", "gemütlich"])) soft.add("ATMOSPHERE_QUIET");
  const body = {
    contractVersion: PRODUCT_DECISION_VERSIONS.context, resolverVersion: "decision-vnext-product-context-resolver-v1", inputHash: contentHash({ request, authority }),
    primaryIntent, secondaryIntent: explicit.secondaryIntent ?? (includes(text, ["date", "in ruhe reden"]) ? "QUIET_CONVERSATION" : null),
    intentCompatibility: primaryIntent ? "COMPATIBLE" as const : "UNKNOWN" as const, occasion: explicit.occasion ?? (text.includes("date") ? "DATE" : null),
    moods: explicit.moods ?? (includes(text, ["ruhig", "gemütlich"]) ? ["CALM"] : []), targetCity: authority.authorizedCity,
    dateTime: explicit.dateTime ?? { state: "KNOWN" as const, localDate: authority.serverTime.slice(0, 10), dayPhase: null, timeZone: "Europe/Zurich" },
    group: explicit.group ?? { size: includes(text, ["tochter", "sohn", "kind", "familie"]) ? 2 : null, minimumAge: Number(text.match(/\b(\d{1,2})[- ]?(?:jährig|jaehrig)/)?.[1] ?? NaN) || null, adultPresent: includes(text, ["mich und", "mit erwachsenen", "familie"]), companionType: includes(text, ["tochter", "sohn", "kind", "familie"]) ? "FAMILY" : null },
    budget: explicit.budget ?? (() => { const amount = Number(text.match(/(?:höchstens|maximal|bis)\s+(\d{1,4})\s*(?:chf|franken)/)?.[1] ?? NaN); return Number.isFinite(amount) ? { state: "KNOWN" as const, amount, currency: "CHF" as const, perPerson: includes(text, ["pro person", "p.p."]), calibrationLabel: null } : { state: "UNKNOWN" as const, amount: null, currency: null, perPerson: false, calibrationLabel: null }; })(),
    stayDuration: explicit.stayDuration ?? null, hardConstraints: [...hard].sort(), softPreferences: [...soft].sort(), unresolvedTerms: primaryIntent ? [] : ["CORE_INTENT"],
    locationAuthority: { explicitTargetWins: true as const, authorizedCity: authority.authorizedCity, deviceCityUsed: false, state: "KNOWN" as const },
    limitations: primaryIntent ? [] : ["CORE_INTENT_REQUIRES_CLARIFICATION"], rawTextPersisted: false as const,
  };
  return deepFreeze(DecisionProductContextSchema.parse(withContentHash(body, "interpretationHash")));
}

const productOpeningPolicy: OpeningSourcePolicy = Object.freeze({ version: "decision-vnext-product-opening-source-policy-v1", configured: true, authorizedTrustStates: ["VERIFIED"] as const });
const entry = (snapshot: ProductWorldView, key: string): ProductWorldView["facts"][number] | undefined => [...snapshot.facts, ...snapshot.operationalRules, ...snapshot.currentStates].find((row) => row.key === key);
const unknown = (snapshot: ProductWorldView, key: string) => snapshot.explicitUnknowns.some((row) => row.key === key);
const contextual = (state: DecisionProductCandidateAssessment["visitSituation"]["state"], source: unknown, ids: readonly string[] = []) => ({ state, mappingIds: ids, evidenceSourceHash: contentHash(source) });
const reason = (reasonCode: string, domain: "WORLD" | "CONTEXT" | "LIMITATION", sourceHash: string, statementDe: string, confirmed: boolean) => ({ reasonCode, domain, sourceHash, statementDe, confirmed });

export function evaluateProductV1IntentClassification(input: { readonly intent: string | null; readonly purpose: string | null; readonly category: string | null; readonly placeTypes: readonly string[]; readonly disputed: boolean; readonly evidenceSourceHash: string }) {
  if (!input.intent) return { intentId: null, state: "NOT_APPLICABLE" as const, mappingIds: [], worldFactKeys: [], evidenceSourceHash: input.evidenceSourceHash };
  const mapping = PRODUCT_V1_INTENT_MAPPINGS.find((row) => row.intentId === input.intent); if (!mapping) return { intentId: input.intent, state: "NOT_CONFIGURED" as const, mappingIds: [], worldFactKeys: [], evidenceSourceHash: input.evidenceSourceHash };
  const { purpose, category, placeTypes } = input;
  const specificConfirm = mapping.acceptedPrimaryCategories.includes(category ?? "") || placeTypes.some((value) => mapping.acceptedPlaceTypes.includes(value));
  const purposeOnlyConfirm = input.intent !== "COFFEE" && mapping.acceptedPrimaryPurposes.includes(purpose ?? "");
  const specificIncompatible = (purpose !== null && mapping.incompatiblePrimaryPurposes.includes(purpose)) || (category !== null && mapping.incompatiblePrimaryCategories.includes(category)) || placeTypes.some((value) => mapping.incompatiblePlaceTypes.includes(value));
  const state = input.disputed ? "DISPUTED" as const : specificConfirm || purposeOnlyConfirm ? "CONFIRMED" as const : specificIncompatible ? "INCOMPATIBLE" as const : "UNKNOWN" as const;
  return { intentId: input.intent, state, mappingIds: [`product-intent-${input.intent.toLowerCase()}`], worldFactKeys: ["purpose.primary_visit", "classification.primary_category", "classification.place_types"], evidenceSourceHash: contentHash({ evidenceSourceHash: input.evidenceSourceHash, purpose, category, placeTypes, policyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash }) };
}

function intentCoverage(snapshot: ProductWorldView, intent: string | null) {
  const purposeEntry = entry(snapshot, "purpose.primary_visit"); const purpose = typeof purposeEntry?.value === "string" ? purposeEntry.value : null;
  const category = snapshot.spot.classification.primaryCategory; const placeTypes = snapshot.spot.classification.placeTypes ?? [];
  return evaluateProductV1IntentClassification({ intent, purpose, category, placeTypes, disputed: snapshot.conflicts.some((row) => row.attributeKeys.some((key) => ["purpose.primary_visit", "classification.primary_category", "classification.place_types"].includes(key))), evidenceSourceHash: snapshot.snapshotHash });
}

function assess(snapshot: ProductWorldView, context: DecisionProductContext, rejected: readonly string[], evaluationAt: string): DecisionProductCandidateAssessment {
  const core = intentCoverage(snapshot, context.primaryIntent); const secondary = intentCoverage(snapshot, context.secondaryIntent);
  const confirmed: string[] = []; const unknownHard: string[] = []; const failed: string[] = [];
  if (context.hardConstraints.includes("TARGET_LOCATION")) (snapshot.spot.location.locality === context.targetCity ? confirmed : failed).push("TARGET_LOCATION");
  if (context.hardConstraints.includes("ACCESSIBILITY_STEP_FREE")) { const row = entry(snapshot, "accessibility.step_free_entrance"); row?.resolution === "KNOWN_TRUE" ? confirmed.push("ACCESSIBILITY_STEP_FREE") : row?.resolution === "KNOWN_FALSE" ? failed.push("ACCESSIBILITY_STEP_FREE") : unknownHard.push("ACCESSIBILITY_STEP_FREE"); }
  if (context.hardConstraints.includes("BUDGET_MAXIMUM")) { const row = entry(snapshot, "operation.price_range"); const value = row?.value; const maximum = value && typeof value === "object" && !Array.isArray(value) && "max" in value ? Number(value.max) : null; maximum === null || context.budget.amount === null ? unknownHard.push("BUDGET_MAXIMUM") : maximum <= context.budget.amount ? confirmed.push("BUDGET_MAXIMUM") : failed.push("BUDGET_MAXIMUM"); }
  if (context.hardConstraints.includes("AGE_OR_LEGAL")) { const row = entry(snapshot, "rule.age_access_conditions"); const value = row?.value; const age = context.group.minimumAge; if (!value || typeof value !== "object" || Array.isArray(value) || !("rules" in value) || age === null) unknownHard.push("AGE_OR_LEGAL"); else { const rules = Array.isArray(value.rules) ? value.rules : []; const allowed = rules.some((rule) => rule && typeof rule === "object" && ((rule.mode === "NO_MINIMUM") || (typeof rule.minimumAge === "number" && (age >= rule.minimumAge || (rule.mode === "UNACCOMPANIED_MINIMUM" && context.group.adultPresent))))); (allowed ? confirmed : failed).push("AGE_OR_LEGAL"); } }
  let openingStatus: DecisionProductCandidateAssessment["actualAvailability"]["status"] = "not_requested";
  if (context.hardConstraints.includes("OPEN_NOW")) { openingStatus = evaluateOpeningState(snapshot, evaluationAt, productOpeningPolicy).status; openingStatus === "open" ? confirmed.push("OPEN_NOW") : openingStatus === "closed" ? failed.push("OPEN_NOW") : unknownHard.push("OPEN_NOW"); }
  const contextualReject = rejected.includes(snapshot.spot.spotId); const incompatible = ["INCOMPATIBLE", "DISPUTED"].includes(core.state); const notConfigured = core.state === "NOT_CONFIGURED";
  const tierValue = contextualReject || failed.length || incompatible ? "INELIGIBLE" : notConfigured ? "NOT_CONFIGURED" : core.state === "CONFIRMED" && !unknownHard.length ? "ELIGIBLE_CONFIRMED" : "UNCONFIRMED_FALLBACK";
  const purposeEntry = entry(snapshot, "purpose.primary_visit"); const onsiteEntry = entry(snapshot, "offering.onsite"); const onsite = Array.isArray(onsiteEntry?.value) ? onsiteEntry.value as readonly { kind: string; relationship: "PART_OF_SPOT" | "EMBEDDED_FACILITY" }[] : [];
  const atmosphereEntry = entry(snapshot, "context.atmosphere"); const visitEntry = entry(snapshot, "context.visit_situations"); const daypartEntry = entry(snapshot, "context.typical_dayparts");
  const worldReasons = [reason(`core-intent-${core.state.toLowerCase()}`, "WORLD", core.evidenceSourceHash, core.state === "CONFIRMED" ? "Der Hauptzweck bestätigt die Kernabsicht." : core.state === "INCOMPATIBLE" ? "Der bestätigte Hauptzweck passt nicht zur Kernabsicht." : "Die Kernabsicht ist durch World Knowledge nicht bestätigt.", core.state === "CONFIRMED")];
  if (contextualReject) worldReasons.push(reason("situational-reject", "CONTEXT", context.interpretationHash, "Dieser Spot wurde nur für diese Anfrage abgewählt.", false));
  const body = {
    contractVersion: PRODUCT_DECISION_VERSIONS.assessment, candidateId: snapshot.spot.spotId, snapshotHash: snapshot.snapshotHash, tier: tierValue, coreIntentCoverage: core, secondaryIntentCoverage: secondary,
    worldClassification: { primaryVisitPurpose: typeof purposeEntry?.value === "string" ? purposeEntry.value : null, primaryCategory: snapshot.spot.classification.primaryCategory, placeTypes: snapshot.spot.classification.placeTypes ?? [], evidenceSourceHash: contentHash({ snapshotHash: snapshot.snapshotHash, structural: snapshot.spot.classification }) },
    primaryVisitPurpose: contextual(purposeEntry ? "CONFIRMED" : unknown(snapshot, "purpose.primary_visit") ? "UNKNOWN" : "NOT_CONFIGURED", purposeEntry ?? snapshot.snapshotHash),
    specificCoreClassification: contextual(core.state, core.evidenceSourceHash, core.mappingIds),
    onsiteOfferings: { state: onsiteEntry ? "CONFIRMED" as const : unknown(snapshot, "offering.onsite") ? "UNKNOWN" as const : "NOT_CONFIGURED" as const, mappingIds: [], availableKinds: onsite.map((row) => row.kind), matchedKinds: [], relationships: [...new Set(onsite.map((row) => row.relationship))].sort(), confirmsCoreIntent: false as const, evidenceSourceHash: contentHash(onsiteEntry ?? { snapshotHash: snapshot.snapshotHash, key: "offering.onsite" }) },
    visitSituation: contextual(visitEntry ? "CONFIRMED" : unknown(snapshot, "context.visit_situations") ? "UNKNOWN" : "NOT_CONFIGURED", visitEntry ?? snapshot.snapshotHash),
    atmosphere: contextual(atmosphereEntry ? "CONFIRMED" : unknown(snapshot, "context.atmosphere") ? "UNKNOWN" : "NOT_CONFIGURED", atmosphereEntry ?? snapshot.snapshotHash),
    typicalDaypart: contextual(daypartEntry ? "CONFIRMED" : unknown(snapshot, "context.typical_dayparts") ? "UNKNOWN" : "NOT_CONFIGURED", daypartEntry ?? snapshot.snapshotHash),
    actualAvailability: { status: openingStatus, evidenceSourceHash: contentHash({ snapshotHash: snapshot.snapshotHash, status: openingStatus }) },
    confirmedHardConstraints: confirmed.sort(), unknownHardConstraints: unknownHard.sort(), failedHardConstraints: failed.sort(), matchedSoftPreferences: [],
    conflicts: snapshot.conflicts.map((row) => row.code).sort(), reasons: worldReasons, limitations: [...(unknownHard.length ? ["HARD_CONSTRAINT_EVIDENCE_UNKNOWN"] : []), ...(core.state === "UNKNOWN" ? ["CORE_INTENT_EVIDENCE_UNKNOWN"] : [])],
    rejectionClass: contextualReject ? "SITUATIONAL_REJECT" as const : "NONE" as const, userIntelligenceInvolved: false, userIntelligenceAffectsEligibility: false as const,
    neutralTieBreakerHash: contentHash({ spotId: snapshot.spot.spotId, snapshotHash: snapshot.snapshotHash }),
  };
  return deepFreeze(DecisionProductCandidateAssessmentSchema.parse(withContentHash(body, "assessmentHash")));
}

export interface DecisionProductWorldSelection { readonly candidateIds: readonly string[]; readonly candidateSetHash: string }
export function createDecisionProductEvaluator(input: { readonly world: WorldKnowledgeReaderPort; readonly selectCandidates: (authorizedCity: string, signal: AbortSignal) => Promise<DecisionProductWorldSelection> }) {
  return async (requestValue: unknown, authority: { readonly authorizedCity: string; readonly serverTime: string }, projection: RelevantUserProjection, signal: AbortSignal): Promise<{ evaluation: DecisionProductEvaluation; presentations: readonly DecisionProductPresentation[] }> => {
    const request = DecisionProductRequestSchema.parse(requestValue); const context = resolveDecisionProductContext(request, authority); const selected = await input.selectCandidates(authority.authorizedCity, signal);
    const ids = [...new Set(selected.candidateIds)].sort(); if (!ids.length || contentHash(ids) !== selected.candidateSetHash) throw new Error("product_world_candidate_set_invalid");
    const snapshots = await Promise.all(ids.map(async (spotId) => { const raw = await input.world.readSnapshot({ spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH }); const snapshot = parseWorldKnowledgeSnapshot(raw, [ACCEPTED_SOURCE_POLICY]); if (snapshot.spot.spotId !== spotId) throw new Error("product_world_spot_binding_invalid"); return snapshot; }));
    return evaluateProductWorldViews(request, authority, projection, snapshots, selected.candidateSetHash);
  };
}

/** Shared deterministic Product assessment for the typed TS reader and the manifest-validated SQL resolver. */
export function evaluateProductWorldViews(requestValue: unknown, authority: { readonly authorizedCity: string; readonly serverTime: string }, projection: RelevantUserProjection, snapshotsValue: readonly ProductWorldView[], candidateSetHash: string): { evaluation: DecisionProductEvaluation; presentations: readonly DecisionProductPresentation[] } {
    const request = DecisionProductRequestSchema.parse(requestValue); const context = resolveDecisionProductContext(request, authority);
    const snapshots = [...snapshotsValue];
    const ids = snapshots.map((item) => item.spot.spotId).sort();
    if (!ids.length || ids.length > 1000 || new Set(ids).size !== ids.length || contentHash(ids) !== candidateSetHash) throw new Error("product_world_candidate_set_invalid");
    const bindings = snapshots.map((row) => ({ spotId: row.spot.spotId, snapshotHash: row.snapshotHash })).sort((a, b) => a.spotId.localeCompare(b.spotId));
    const cohort = DecisionProductWorldCohortSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.cohort, cohortId: `product-world-${candidateSetHash.slice(0, 24)}`, source: "CANONICAL_WORLD_KNOWLEDGE_READER", generatedAt: authority.serverTime, authorizedCity: authority.authorizedCity, worldRegistryVersion: REGISTRY_VERSION, worldRegistryHash: REGISTRY_HASH, sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash, spotBindings: bindings, candidateSetHash, limitations: snapshots.length === 1 ? ["SINGLE_CANDIDATE"] : [], commercialSignalsPresent: false, fixtureSourceUsed: false }, "cohortHash"));
    const candidates = snapshots.map((row) => assess(row, context, request.rejectedCandidateIds, authority.serverTime)).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
    const evaluation = DecisionProductEvaluationSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.evaluation, evaluationId: `product-evaluation-${contentHash({ requestId: request.requestId, cohortHash: cohort.cohortHash }).slice(0, 24)}`, createdAt: authority.serverTime, requestHash: contentHash(request), interpretation: context, worldCohort: cohort, userProjectionHash: projection.projectionHash, candidates, limitations: cohort.limitations, evaluatorVersion: PRODUCT_V1_EVALUATOR_VERSION, evaluationPolicyHash: DECISION_PRODUCT_EVALUATION_POLICY.policyHash, evaluationReleaseHash: DECISION_PRODUCT_EVALUATION_RELEASE.releaseHash, intentPolicyHash: DECISION_PRODUCT_INTENT_POLICY.policyHash, sourceKind: "CANONICAL_PRODUCT_PORTS", productSemanticsApproved: true, productRankingAuthorized: true, fixtureSourceUsed: false }, "evaluationHash"));
    const presentations = snapshots.map((row) => DecisionProductPresentationSchema.parse(withContentHash({ contractVersion: PRODUCT_DECISION_VERSIONS.presentation, spotId: row.spot.spotId, name: row.spot.identity.name ?? "Unbenannter Ort", locality: row.spot.location.locality, categoryLabel: row.spot.classification.primaryCategory, imageUrl: null, sourceHash: row.snapshotHash }, "presentationHash")));
    return deepFreeze({ evaluation, presentations });
}
