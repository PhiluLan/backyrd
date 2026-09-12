import {
  // Phase 3B is a signed, immutable fixture release. Keep its original World
  // binding when the active authoring registry advances additively.
  REGISTRY_V1_1_HASH as WORLD_REGISTRY_HASH,
  REGISTRY_V1_1_VERSION as WORLD_REGISTRY_VERSION,
  PRICE_LEVELS,
} from "@backyrd/world-knowledge-core";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import {
  ContextRegistryReleaseRecordSchema, ContextRegistryReleaseSchema, FounderDecisionAuthoritySchema,
  FounderDecisionRecordSchema, FounderDecisionTrustAnchorSchema, PHASE3B_VERSIONS,
  ProductContextCombinedReleaseSchema, ProductContextPolicySchema, ProductContextReleaseTrustAnchorSchema,
  ProductOracleAuthorityCatalogSchema, ProductOracleTrustCatalogSchema, ProductPolicyReleaseRecordSchema,
  ProductScenarioOracleSchema, type FounderDecisionRecord, type ProductContextCombinedRelease,
  type ProductContextPolicy, type ProductContextReleaseTrustAnchor, type ProductOracleAuthorityCatalog,
  type ProductOracleTrustCatalog, type ProductScenarioOracle,
} from "./phase3b-contracts.js";

export const PHASE3B_PRODUCT_FLAGS = Object.freeze({ productionAuthorized: false, runtimeActivated: false, rankingWeightsConfigured: false, externalResolverConfigured: false, shadowTrafficAuthorized: false, productQualityClaim: false } as const);
const T0 = "2026-09-12T00:00:00.000Z";
const T1 = "2027-09-12T00:00:00.000Z";

const decision = (n: number, title: string, selectedOption: string, instruction: string) => ({ decisionId: `context-founder-decision-${String(n).padStart(2, "0")}`, title, selectedOption, instruction });
const decisions = [
  decision(1, "Intent", "B", "Hierarchische Intents mit kompatiblem Secondary Intent."),
  decision(2, "Occasion und Situation", "D", "Intent, Occasion und Mood bleiben getrennt und bilden gemeinsam ein Composite Situation Objective."),
  decision(3, "Mood", "C", "Freitext wird nur ephemer über einen Resolver-Port aufgelöst; Phase 3B enthält nur Fixtures."),
  decision(4, "Begleitung", "A", "Minimale Begleitungstypen ohne Identitäten."),
  decision(5, "Budget", "A", "Fünf kanonische World-Preislevel plus FLEXIBLE; CHF 20 ist nur für CH Dinner ein LOW-Anchor."),
  decision(6, "Verfügbare Zeit", "D", "Gesamtzeit, Distanz, Reisezeit, Nähe, Wartezeit und Aufenthaltsdauer getrennt; Dauer-Buckets ohne Minuten-Grenzen."),
  decision(7, "Distanz", "C", "Harter serverautorisierter Maximalscope und separate weiche Distanzpräferenz."),
  decision(8, "Exploration", "B", "FAMILIAR, OPEN_TO_BOTH und DISCOVER_NEW wirken nur im Ranking."),
  decision(9, "Wetter", "C", "Beobachtung, World-Facts und abgeleitete Regel bleiben getrennt; kein produktiver Provider."),
  decision(10, "Location Authority", "A", "Explizites Zielgebiet hat Vorrang vor UI- oder Device-Standort; Auflösung bleibt serverseitig."),
  decision(11, "Location denied", "B", "Bei verweigerter Location ist eine explizite Stadt nötig."),
  decision(12, "Hard versus Soft", "D", "Nur explizite Muss-Sprache und eine objektive Allowlist dürfen Hard Constraints erzeugen; Mood bleibt soft."),
  decision(13, "Unknown", "D", "Bestätigte Candidates vor Unknown-Fallback; Known False ist ineligible; maximal eine Rückfrage pro Step."),
  decision(14, "Accessibility", "D", "Komponentenweise: bestätigt, Unknown-Fallback, falsch ineligible; kein globaler Claim."),
  decision(15, "Age und Access", "D", "World-only und datensparsame Eligibility-Klasse; rechtliche Unknown-Policy bleibt NOT_CONFIGURED."),
  decision(16, "Alternative und Reject", "D", "Alternative ist neutral; Reject bleibt sessionbezogen und kann nur über ein separates Event beobachtet werden."),
  decision(17, "Session", "C", "Ende nach Zeit, Anzahl oder wesentlichem Context-Wechsel; Grenzwerte bleiben NOT_CONFIGURED."),
  decision(18, "Retention", "B", "Keine langfristigen Vollsnapshots; nur Hashes und Referenzen, Frist NOT_CONFIGURED."),
  decision(19, "Learning", "B", "Kein direkter Context-Write; nur separates kanonisches User Event, sonst Adapter NOT_CONFIGURED."),
];

const founderBody = { contractVersion: PHASE3B_VERSIONS.founderDecisionRecord, recordId: "founder-context-decisions-3b-1", sourcePhase: "3A" as const, decisions, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_FOUNDER_DECISION_RECORD: FounderDecisionRecord = deepFreeze(FounderDecisionRecordSchema.parse(withContentHash(founderBody, "recordHash")));
const founderAuthorityBody = { contractVersion: PHASE3B_VERSIONS.founderAuthority, authorityId: "founder-context-authority-3b-1", issuer: "BACKYRD_FOUNDER_CONTEXT_DECISION_AUTHORITY" as const, acceptedRecordId: PHASE3B_FOUNDER_DECISION_RECORD.recordId, acceptedRecordHash: PHASE3B_FOUNDER_DECISION_RECORD.recordHash, validFrom: T0, validUntil: T1, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_FOUNDER_AUTHORITY = deepFreeze(FounderDecisionAuthoritySchema.parse(withContentHash(founderAuthorityBody, "authorityHash")));
const founderAnchorBody = { contractVersion: PHASE3B_VERSIONS.founderTrustAnchor, trustAnchorId: "founder-context-trust-anchor-3b-1", acceptedAuthorityId: PHASE3B_FOUNDER_AUTHORITY.authorityId, acceptedAuthorityHash: PHASE3B_FOUNDER_AUTHORITY.authorityHash, acceptedIssuer: PHASE3B_FOUNDER_AUTHORITY.issuer, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_FOUNDER_TRUST_ANCHOR = deepFreeze(FounderDecisionTrustAnchorSchema.parse(withContentHash(founderAnchorBody, "anchorHash")));

const concept = (conceptId: string, domain: "INTENT"|"OCCASION"|"MOOD"|"COMPANION"|"PRICE"|"STAY_DURATION"|"EXPLORATION"|"WEATHER"|"ACCESSIBILITY"|"ELIGIBILITY", de: string, en: string, parentConceptId: string | null = null, eligibilityAuthority = false, rankingAuthority = false) => ({ conceptId, domain, parentConceptId, labels: { de, en }, lifecycle: "DRAFT_PRODUCT_RELEASE" as const, eligibilityAuthority, rankingAuthority });
const worldPrices = PRICE_LEVELS.map((key) => concept(`world.price.${key.toLowerCase()}`, "PRICE", key, key, null, false, true));
const concepts = [
  concept("context.intent.food", "INTENT", "Essen", "Food", null, false, true), concept("context.intent.food.dinner", "INTENT", "Abendessen", "Dinner", "context.intent.food", false, true),
  concept("context.occasion.first-date", "OCCASION", "Erstes Date", "First date", null, false, true),
  concept("context.mood.quiet", "MOOD", "Ruhig", "Quiet", null, false, true), concept("context.mood.cozy", "MOOD", "Gemütlich", "Cozy", null, false, true),
  ...["alone", "partner-date", "friends", "family", "children", "group"].map((key) => concept(`context.companion.${key}`, "COMPANION", key, key)),
  ...worldPrices, concept("context.price.flexible", "PRICE", "Flexibel", "Flexible", null, false, true),
  ...["short", "medium", "long"].map((key) => concept(`context.stay.${key}`, "STAY_DURATION", key, key, null, false, true)),
  ...["familiar", "open-to-both", "discover-new"].map((key) => concept(`context.exploration.${key}`, "EXPLORATION", key, key, null, false, true)),
  concept("context.weather.rain", "WEATHER", "Regen", "Rain", null, false, true), concept("context.weather.dry", "WEATHER", "Trocken", "Dry", null, false, true),
  concept("world.accessibility.wheelchair-entry", "ACCESSIBILITY", "Rollstuhlzugang", "Wheelchair entry", null, true), concept("world.accessibility.step-free-route", "ACCESSIBILITY", "Stufenfreier Weg", "Step-free route", null, true), concept("world.accessibility.accessible-wc", "ACCESSIBILITY", "Zugängliches WC", "Accessible WC", null, true),
  concept("context.eligibility.minimum-age-class", "ELIGIBILITY", "Altersberechtigung", "Age eligibility", null, true),
];
const registryBody = { contractVersion: PHASE3B_VERSIONS.registry, registryId: "context-registry-3b-1", registryVersion: PHASE3B_VERSIONS.registry, basedOnContextRegistryVersion: "backyrd-vnext-context-fixture-registry-v1", basedOnWorldRegistryVersion: WORLD_REGISTRY_VERSION, founderDecisionRecordHash: PHASE3B_FOUNDER_DECISION_RECORD.recordHash, lifecycle: "DRAFT_PRODUCT_RELEASE" as const, concepts, unresolvedTaxonomies: ["intent-full-taxonomy", "occasion-full-taxonomy", "mood-full-taxonomy", "stay-duration-minute-boundaries", "legal-age-unknown-policy"], flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_CONTEXT_REGISTRY = deepFreeze(ContextRegistryReleaseSchema.parse(withContentHash(registryBody, "registryHash")));
const registryReleaseBody = { contractVersion: PHASE3B_VERSIONS.registryRelease, releaseId: "context-registry-release-3b-1", registryVersion: PHASE3B_CONTEXT_REGISTRY.registryVersion, registryHash: PHASE3B_CONTEXT_REGISTRY.registryHash, founderAuthorityHash: PHASE3B_FOUNDER_AUTHORITY.authorityHash, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_REGISTRY_RELEASE = deepFreeze(ContextRegistryReleaseRecordSchema.parse(withContentHash(registryReleaseBody, "releaseHash")));

const policyBody = { contractVersion: PHASE3B_VERSIONS.policy, policyId: "context-policy-3b-1", policyVersion: PHASE3B_VERSIONS.policy, registryVersion: PHASE3B_CONTEXT_REGISTRY.registryVersion, registryHash: PHASE3B_CONTEXT_REGISTRY.registryHash, founderDecisionRecordHash: PHASE3B_FOUNDER_DECISION_RECORD.recordHash, intentMode: "HIERARCHICAL_WITH_COMPATIBLE_SECONDARY" as const, compositeSituationRequired: true as const, moodFreeTextMode: "EPHEMERAL_RESOLVER_ONLY" as const, priceLevels: [...PRICE_LEVELS, "FLEXIBLE"] as const, priceAnchor: { market: "CH" as const, currency: "CHF" as const, category: "FOOD_SERVICE" as const, consumption: "DINNER" as const, perPerson: true as const, maximumAmount: 20 as const, interpretedLevel: "LOW" as const, universalMapping: false as const }, stayDurationBuckets: ["SHORT", "MEDIUM", "LONG"].map((key) => ({ key, minimumMinutes: null, maximumMinutes: null })), explorationModes: ["FAMILIAR", "OPEN_TO_BOTH", "DISCOVER_NEW"] as const, hardConstraintAllowlist: ["OPENING_CURRENT", "KITCHEN_CURRENT", "ACCESSIBILITY", "AGE_OR_LEGAL", "BUDGET_MAXIMUM", "DISTANCE_MAXIMUM", "DURATION_MAXIMUM", "GROUP_CAPACITY", "RESERVATION", "TAKEAWAY", "PET_ACCESS"], subjectiveDimensionsAlwaysSoft: ["MOOD", "OCCASION", "EXPLORATION"], unknownRules: [
  { ruleClass: "OPENING_CURRENT", treatment: "EXCLUDE_IF_UNKNOWN", clarificationLimitPerDecisionStep: 0 }, { ruleClass: "KITCHEN_CURRENT", treatment: "EXCLUDE_IF_UNKNOWN", clarificationLimitPerDecisionStep: 0 },
  { ruleClass: "ACCESSIBILITY", treatment: "UNCONFIRMED_FALLBACK", clarificationLimitPerDecisionStep: 1 }, { ruleClass: "AGE_OR_LEGAL", treatment: "NOT_CONFIGURED", clarificationLimitPerDecisionStep: 1 },
  ...["BUDGET_MAXIMUM", "DISTANCE_MAXIMUM", "DURATION_MAXIMUM", "GROUP_CAPACITY", "RESERVATION", "TAKEAWAY", "PET_ACCESS", "GENERAL_OBJECTIVE"].map((ruleClass) => ({ ruleClass, treatment: "UNCONFIRMED_FALLBACK", clarificationLimitPerDecisionStep: 1 })),
], sessionTimeLimitSeconds: null, sessionCandidateLimit: null, retentionSeconds: null, rawTextPersistence: "FORBIDDEN_AFTER_EPHEMERAL_RESOLUTION" as const, contextLearning: "SEPARATE_AUTHORIZED_OBSERVATION_ONLY" as const, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_CONTEXT_POLICY: ProductContextPolicy = deepFreeze(ProductContextPolicySchema.parse(withContentHash(policyBody, "policyHash")));
const policyReleaseBody = { contractVersion: PHASE3B_VERSIONS.policyRelease, releaseId: "context-policy-release-3b-1", policyVersion: PHASE3B_CONTEXT_POLICY.policyVersion, policyHash: PHASE3B_CONTEXT_POLICY.policyHash, registryReleaseHash: PHASE3B_REGISTRY_RELEASE.releaseHash, founderAuthorityHash: PHASE3B_FOUNDER_AUTHORITY.authorityHash, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_POLICY_RELEASE = deepFreeze(ProductPolicyReleaseRecordSchema.parse(withContentHash(policyReleaseBody, "releaseHash")));

export const PHASE3B_PRODUCT_SCENARIO_IDS = Object.freeze([
  "hierarchical-intent-compatible-secondary", "composite-quiet-dinner-first-date", "mood-free-text-canonical-clusters", "mood-free-text-ambiguous", "companion-alone-vs-friends", "family-children-no-identities", "price-chf20-dinner-anchor", "price-unknown-fallback", "stay-duration-short-vs-long", "nearby-vs-stay-duration", "distance-low-vs-high", "familiar-vs-exploration", "weather-dry-vs-rain", "weather-known-vs-unavailable", "device-basel-target-zurich", "location-denied-explicit-city", "hard-vs-soft-explicit-language", "accessibility-known-true-vs-unknown", "accessibility-known-false-required", "context-unknown-vs-not-configured", "initial-vs-alternative-requested", "candidate-unseen-vs-rejected", "session-app-restart-continuation", "session-target-or-intent-change", "same-context-different-timezone", "midday-vs-late-evening", "context-no-direct-user-write", "commercial-counterfactual",
] as const);

const oracleDimensions: Record<typeof PHASE3B_PRODUCT_SCENARIO_IDS[number], readonly string[]> = {
  "hierarchical-intent-compatible-secondary": ["context.intent.primary", "context.intent.secondary"], "composite-quiet-dinner-first-date": ["context.composite-objective"], "mood-free-text-canonical-clusters": ["context.mood"], "mood-free-text-ambiguous": ["context.mood", "context.clarification"], "companion-alone-vs-friends": ["context.companion"], "family-children-no-identities": ["context.companion"], "price-chf20-dinner-anchor": ["context.budget", "context.hard-constraints"], "price-unknown-fallback": ["context.budget", "context.candidate-tier"], "stay-duration-short-vs-long": ["context.stay-duration"], "nearby-vs-stay-duration": ["context.distance-preference"], "distance-low-vs-high": ["context.distance-preference"], "familiar-vs-exploration": ["context.exploration"], "weather-dry-vs-rain": ["context.weather"], "weather-known-vs-unavailable": ["context.weather"], "device-basel-target-zurich": ["context.location.authorized-scope"], "location-denied-explicit-city": ["context.location.permission", "context.location.authorized-scope"], "hard-vs-soft-explicit-language": ["context.hard-constraints", "context.soft-preferences"], "accessibility-known-true-vs-unknown": ["context.candidate-tier"], "accessibility-known-false-required": ["context.eligibility"], "context-unknown-vs-not-configured": ["context.knowledge-state"], "initial-vs-alternative-requested": ["context.session.alternative-count"], "candidate-unseen-vs-rejected": ["context.session.rejected-candidates"], "session-app-restart-continuation": ["context.session.transport-generation"], "session-target-or-intent-change": ["context.session.identity"], "same-context-different-timezone": ["context.time.timezone", "context.time.local"], "midday-vs-late-evening": ["context.time.local"], "context-no-direct-user-write": ["context.learning-boundary"], "commercial-counterfactual": ["context.commercial-influence"],
};
const expected = (scenarioId: typeof PHASE3B_PRODUCT_SCENARIO_IDS[number], index: number) => ({ scenarioId, founderDecisionRefs: [`context-founder-decision-${String((index % 19) + 1).padStart(2, "0")}`], baseScenarioIdentity: contentHash({ scenarioId, side: "BASE", fixtureVersion: "phase3b-1" }), flipScenarioIdentity: contentHash({ scenarioId, side: "FLIP", fixtureVersion: "phase3b-1" }), changedDimensionKeys: oracleDimensions[scenarioId], candidateTierEffect: scenarioId.includes("accessibility-known-true") ? "CONFIRMED_BEFORE_UNKNOWN" as const : scenarioId.includes("accessibility-known-false") ? "KNOWN_FALSE_INELIGIBLE" as const : scenarioId.includes("candidate-unseen") ? "SESSION_EXCLUDED" as const : scenarioId.includes("price-unknown") ? "UNKNOWN_FALLBACK" as const : "UNCHANGED" as const, relativeRankingDirection: scenarioId.includes("familiar") || scenarioId.includes("distance") ? "TOWARD_FLIP" as const : scenarioId.includes("candidate-unseen") ? "AWAY_FROM_REJECTED" as const : scenarioId.includes("accessibility-known-true") ? "CONFIRMED_BEFORE_UNKNOWN" as const : "UNCHANGED" as const, clarificationBehavior: scenarioId.includes("ambiguous") ? "REQUIRED_IF_AMBIGUOUS" as const : "NONE" as const, explanationBehavior: `explain-${scenarioId}`, invariantBindings: ["no-commercial-channel", "no-user-write", "no-product-quality-claim"], unchangedBindingHashes: [WORLD_REGISTRY_HASH, PHASE3B_CONTEXT_REGISTRY.registryHash, PHASE3B_CONTEXT_POLICY.policyHash] });
export const PHASE3B_PRODUCT_ORACLES: readonly ProductScenarioOracle[] = deepFreeze(PHASE3B_PRODUCT_SCENARIO_IDS.map((scenarioId, index) => {
  const body = { contractVersion: PHASE3B_VERSIONS.oracle, oracleId: `oracle-product-3b-${String(index + 1).padStart(2, "0")}`, oracleVersion: PHASE3B_VERSIONS.oracle, expectation: expected(scenarioId, index), founderApproved: true as const, productionAuthorized: false as const, productQualityClaim: false as const };
  return ProductScenarioOracleSchema.parse(withContentHash(body, "oracleHash"));
}));

const authorityEntries = PHASE3B_PRODUCT_ORACLES.map((oracle, index) => {
  const body = { authorityId: `oracle-authority-product-3b-${String(index + 1).padStart(2, "0")}`, scenarioId: oracle.expectation.scenarioId, oracleId: oracle.oracleId, oracleHash: oracle.oracleHash, founderAuthorityHash: PHASE3B_FOUNDER_AUTHORITY.authorityHash, registryHash: PHASE3B_CONTEXT_REGISTRY.registryHash, policyHash: PHASE3B_CONTEXT_POLICY.policyHash, validFrom: T0, validUntil: T1, flags: PHASE3B_PRODUCT_FLAGS };
  return withContentHash(body, "authorityHash");
});
const authorityCatalogBody = { contractVersion: PHASE3B_VERSIONS.oracleAuthorityCatalog, catalogId: "context-oracle-authority-catalog-3b-1", scenarioAllowlist: PHASE3B_PRODUCT_SCENARIO_IDS, entries: authorityEntries, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_ORACLE_AUTHORITY_CATALOG: ProductOracleAuthorityCatalog = deepFreeze(ProductOracleAuthorityCatalogSchema.parse(withContentHash(authorityCatalogBody, "catalogHash")));
const trustEntries = authorityEntries.map((authority, index) => withContentHash({ trustAnchorId: `oracle-trust-anchor-product-3b-${String(index + 1).padStart(2, "0")}`, scenarioId: authority.scenarioId, acceptedAuthorityId: authority.authorityId, acceptedAuthorityHash: authority.authorityHash, flags: PHASE3B_PRODUCT_FLAGS }, "anchorHash"));
const trustCatalogBody = { contractVersion: PHASE3B_VERSIONS.oracleTrustCatalog, catalogId: "context-oracle-trust-catalog-3b-1", authorityCatalogHash: PHASE3B_ORACLE_AUTHORITY_CATALOG.catalogHash, scenarioAllowlist: PHASE3B_PRODUCT_SCENARIO_IDS, entries: trustEntries, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_ORACLE_TRUST_CATALOG: ProductOracleTrustCatalog = deepFreeze(ProductOracleTrustCatalogSchema.parse(withContentHash(trustCatalogBody, "catalogHash")));

const combinedReleaseBody = { contractVersion: PHASE3B_VERSIONS.combinedRelease, releaseId: PHASE3B_VERSIONS.combinedRelease, founderDecisionRecordHash: PHASE3B_FOUNDER_DECISION_RECORD.recordHash, founderAuthorityHash: PHASE3B_FOUNDER_AUTHORITY.authorityHash, founderTrustAnchorHash: PHASE3B_FOUNDER_TRUST_ANCHOR.anchorHash, registryHash: PHASE3B_CONTEXT_REGISTRY.registryHash, registryReleaseHash: PHASE3B_REGISTRY_RELEASE.releaseHash, policyHash: PHASE3B_CONTEXT_POLICY.policyHash, policyReleaseHash: PHASE3B_POLICY_RELEASE.releaseHash, oracleAuthorityCatalogHash: PHASE3B_ORACLE_AUTHORITY_CATALOG.catalogHash, oracleTrustCatalogHash: PHASE3B_ORACLE_TRUST_CATALOG.catalogHash, scenarioAllowlist: PHASE3B_PRODUCT_SCENARIO_IDS, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_COMBINED_RELEASE: ProductContextCombinedRelease = deepFreeze(ProductContextCombinedReleaseSchema.parse(withContentHash(combinedReleaseBody, "releaseHash")));
const combinedAnchorBody = { contractVersion: PHASE3B_VERSIONS.combinedTrustAnchor, trustAnchorId: "context-release-trust-anchor-3b-1", acceptedReleaseId: PHASE3B_COMBINED_RELEASE.releaseId, acceptedReleaseHash: PHASE3B_COMBINED_RELEASE.releaseHash, signatureAlgorithm: "Ed25519" as const, verificationKeyId: "phase3b-product-context-synthetic-fixture-key-1", releaseHashSignature: "uUv4imMXfVKh5hYEQTcmaD3sk6oTbt8xCa72J/Q2labkc7nziMN0gMX72VtLfC1QWRFhnaD7sW8ZNPOtiqBTBQ==", authorityScope: "SYNTHETIC_FIXTURE_ONLY" as const, productionCapable: false as const, productApproved: false as const, flags: PHASE3B_PRODUCT_FLAGS };
export const PHASE3B_COMBINED_TRUST_ANCHOR: ProductContextReleaseTrustAnchor = deepFreeze(ProductContextReleaseTrustAnchorSchema.parse(withContentHash(combinedAnchorBody, "anchorHash")));

export function validatePhase3BProductArtifacts(): void {
  for (const [value, field] of [[PHASE3B_FOUNDER_DECISION_RECORD, "recordHash"], [PHASE3B_FOUNDER_AUTHORITY, "authorityHash"], [PHASE3B_FOUNDER_TRUST_ANCHOR, "anchorHash"], [PHASE3B_CONTEXT_REGISTRY, "registryHash"], [PHASE3B_REGISTRY_RELEASE, "releaseHash"], [PHASE3B_CONTEXT_POLICY, "policyHash"], [PHASE3B_POLICY_RELEASE, "releaseHash"], [PHASE3B_ORACLE_AUTHORITY_CATALOG, "catalogHash"], [PHASE3B_ORACLE_TRUST_CATALOG, "catalogHash"], [PHASE3B_COMBINED_RELEASE, "releaseHash"], [PHASE3B_COMBINED_TRUST_ANCHOR, "anchorHash"]] as const) assertContentHash(value as unknown as Record<string, unknown>, field);
  if (canonicalJson(PHASE3B_CONTEXT_POLICY.priceLevels.slice(0, 5)) !== canonicalJson(PRICE_LEVELS) || PHASE3B_CONTEXT_REGISTRY.basedOnWorldRegistryVersion !== WORLD_REGISTRY_VERSION || WORLD_REGISTRY_HASH.length !== 64) throw new Error("phase3b_world_contract_binding_mismatch");
  if (new Set(PHASE3B_PRODUCT_SCENARIO_IDS).size !== 28 || new Set(PHASE3B_FOUNDER_DECISION_RECORD.decisions.map((item) => item.decisionId)).size !== 19) throw new Error("phase3b_identity_set_invalid");
  for (const oracle of PHASE3B_PRODUCT_ORACLES) assertContentHash(oracle as unknown as Record<string, unknown>, "oracleHash");
  for (let index = 0; index < PHASE3B_PRODUCT_SCENARIO_IDS.length; index += 1) {
    const scenarioId = PHASE3B_PRODUCT_SCENARIO_IDS[index]; const oracle = PHASE3B_PRODUCT_ORACLES[index]; const authority = PHASE3B_ORACLE_AUTHORITY_CATALOG.entries[index]; const anchor = PHASE3B_ORACLE_TRUST_CATALOG.entries[index];
    if (!oracle || !authority || !anchor || oracle.expectation.scenarioId !== scenarioId || authority.scenarioId !== scenarioId || anchor.scenarioId !== scenarioId || authority.oracleId !== oracle.oracleId || authority.oracleHash !== oracle.oracleHash || anchor.acceptedAuthorityId !== authority.authorityId || anchor.acceptedAuthorityHash !== authority.authorityHash) throw new Error("phase3b_oracle_recursive_binding_mismatch");
    assertContentHash(authority as unknown as Record<string, unknown>, "authorityHash"); assertContentHash(anchor as unknown as Record<string, unknown>, "anchorHash");
  }
  if (new Set(PHASE3B_ORACLE_AUTHORITY_CATALOG.entries.map((item) => item.authorityId)).size !== 28 || new Set(PHASE3B_PRODUCT_ORACLES.map((item) => item.oracleId)).size !== 28) throw new Error("phase3b_oracle_duplicate_identity");
  if (PHASE3B_COMBINED_RELEASE.releaseHash !== PHASE3B_COMBINED_TRUST_ANCHOR.acceptedReleaseHash) throw new Error("phase3b_release_anchor_mismatch");
}

export const PHASE3B_WORLD_BINDING = Object.freeze({ registryVersion: WORLD_REGISTRY_VERSION, registryHash: WORLD_REGISTRY_HASH });
export const PHASE3B_ARTIFACT_IDENTITY = contentHash({ releaseHash: PHASE3B_COMBINED_RELEASE.releaseHash, trustAnchorHash: PHASE3B_COMBINED_TRUST_ANCHOR.anchorHash });
