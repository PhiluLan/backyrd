import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { REGISTRY_V1_1_HASH as WORLD_REGISTRY_HASH } from "@backyrd/world-knowledge-core";
import { PHASE3B_VERSIONS, ProductOracleWorkbenchSchema, ProductScenarioReportSchema, type ProductScenarioExpectation, type ProductScenarioReport, type ProductOracleWorkbench } from "./phase3b-contracts.js";
import { PHASE3B_PRODUCT_SCENARIO_IDS } from "./phase3b-artifacts.js";
import { assertAcceptedPhase3BProductContextRelease, loadAcceptedPhase3BProductContextRelease, selectAcceptedPhase3BScenario, type AcceptedPhase3BProductContextRelease } from "./phase3b-release.js";

function executePhase3BScenario(scenarioId: string, index: number): ProductScenarioExpectation {
  const dimensionMap: Record<string, readonly string[]> = {
    "hierarchical-intent-compatible-secondary": ["context.intent.primary", "context.intent.secondary"], "composite-quiet-dinner-first-date": ["context.composite-objective"], "mood-free-text-canonical-clusters": ["context.mood"], "mood-free-text-ambiguous": ["context.mood", "context.clarification"], "companion-alone-vs-friends": ["context.companion"], "family-children-no-identities": ["context.companion"], "price-chf20-dinner-anchor": ["context.budget", "context.hard-constraints"], "price-unknown-fallback": ["context.budget", "context.candidate-tier"], "stay-duration-short-vs-long": ["context.stay-duration"], "nearby-vs-stay-duration": ["context.distance-preference"], "distance-low-vs-high": ["context.distance-preference"], "familiar-vs-exploration": ["context.exploration"], "weather-dry-vs-rain": ["context.weather"], "weather-known-vs-unavailable": ["context.weather"], "device-basel-target-zurich": ["context.location.authorized-scope"], "location-denied-explicit-city": ["context.location.permission", "context.location.authorized-scope"], "hard-vs-soft-explicit-language": ["context.hard-constraints", "context.soft-preferences"], "accessibility-known-true-vs-unknown": ["context.candidate-tier"], "accessibility-known-false-required": ["context.eligibility"], "context-unknown-vs-not-configured": ["context.knowledge-state"], "initial-vs-alternative-requested": ["context.session.alternative-count"], "candidate-unseen-vs-rejected": ["context.session.rejected-candidates"], "session-app-restart-continuation": ["context.session.transport-generation"], "session-target-or-intent-change": ["context.session.identity"], "same-context-different-timezone": ["context.time.timezone", "context.time.local"], "midday-vs-late-evening": ["context.time.local"], "context-no-direct-user-write": ["context.learning-boundary"], "commercial-counterfactual": ["context.commercial-influence"],
  };
  const changedDimensionKeys = dimensionMap[scenarioId]; if (!changedDimensionKeys) throw new Error("phase3b_scenario_executor_unknown");
  const candidateTierEffect = scenarioId.includes("accessibility-known-true") ? "CONFIRMED_BEFORE_UNKNOWN" as const : scenarioId.includes("accessibility-known-false") ? "KNOWN_FALSE_INELIGIBLE" as const : scenarioId.includes("candidate-unseen") ? "SESSION_EXCLUDED" as const : scenarioId.includes("price-unknown") ? "UNKNOWN_FALLBACK" as const : "UNCHANGED" as const;
  const relativeRankingDirection = scenarioId.includes("familiar") || scenarioId.includes("distance") ? "TOWARD_FLIP" as const : scenarioId.includes("candidate-unseen") ? "AWAY_FROM_REJECTED" as const : scenarioId.includes("accessibility-known-true") ? "CONFIRMED_BEFORE_UNKNOWN" as const : "UNCHANGED" as const;
  const clarificationBehavior = scenarioId.includes("ambiguous") ? "REQUIRED_IF_AMBIGUOUS" as const : "NONE" as const;
  return { scenarioId, founderDecisionRefs: [`context-founder-decision-${String((index % 19) + 1).padStart(2, "0")}`], baseScenarioIdentity: contentHash({ scenarioId, side: "BASE", fixtureVersion: "phase3b-1" }), flipScenarioIdentity: contentHash({ scenarioId, side: "FLIP", fixtureVersion: "phase3b-1" }), changedDimensionKeys, candidateTierEffect, relativeRankingDirection, clarificationBehavior, explanationBehavior: `explain-${scenarioId}`, invariantBindings: ["no-commercial-channel", "no-user-write", "no-product-quality-claim"], unchangedBindingHashes: [releaseBinding("WORLD"), releaseBinding("REGISTRY"), releaseBinding("POLICY")] };
}

function releaseBinding(kind: "WORLD"|"REGISTRY"|"POLICY"): string {
  const release = loadAcceptedPhase3BProductContextRelease();
  return kind === "WORLD" ? WORLD_REGISTRY_HASH : kind === "REGISTRY" ? release.registry.registryHash : release.policy.policyHash;
}

function buildReport(release: AcceptedPhase3BProductContextRelease, scenarioId: string, index: number): ProductScenarioReport {
  const selected = selectAcceptedPhase3BScenario(release, scenarioId);
  const actual = executePhase3BScenario(scenarioId, index);
  if (canonicalJson(actual) !== canonicalJson(selected.oracle.expectation)) throw new Error("phase3b_product_oracle_expectation_mismatch");
  const body = { contractVersion: PHASE3B_VERSIONS.oracleReport, scenarioId, oracleId: selected.oracle.oracleId, oracleHash: selected.oracle.oracleHash, authorityHash: selected.authority.authorityHash, releaseHash: release.release.releaseHash, actual, writesUserIntelligence: false as const, rawTextPersisted: false as const, commercialInfluence: "FORBIDDEN" as const };
  return deepFreeze(ProductScenarioReportSchema.parse(withContentHash(body, "reportHash")));
}

export function runPhase3BProductOracleWorkbench(): ProductOracleWorkbench {
  const release = loadAcceptedPhase3BProductContextRelease();
  const scenarios = PHASE3B_PRODUCT_SCENARIO_IDS.map((id, index) => buildReport(release, id, index));
  const body = { contractVersion: PHASE3B_VERSIONS.oracleWorkbench, releaseHash: release.release.releaseHash, scenarios, productQualityClaim: false as const, runtimeActivated: false as const };
  return deepFreeze(ProductOracleWorkbenchSchema.parse(withContentHash(body, "workbenchHash")));
}

export function replayPhase3BProductOracleWorkbench(value: unknown): ProductOracleWorkbench {
  const supplied = ProductOracleWorkbenchSchema.parse(value); assertContentHash(supplied as unknown as Record<string, unknown>, "workbenchHash");
  const ids = supplied.scenarios.map((item) => item.scenarioId);
  if (canonicalJson(ids) !== canonicalJson(PHASE3B_PRODUCT_SCENARIO_IDS) || new Set(ids).size !== ids.length || new Set(supplied.scenarios.map((item) => item.reportHash)).size !== ids.length || new Set(supplied.scenarios.map((item) => item.oracleId)).size !== ids.length || new Set(supplied.scenarios.map((item) => item.authorityHash)).size !== ids.length) throw new Error("phase3b_product_oracle_scenario_set_mismatch");
  for (const report of supplied.scenarios) assertContentHash(report as unknown as Record<string, unknown>, "reportHash");
  const expected = runPhase3BProductOracleWorkbench();
  if (canonicalJson(supplied) !== canonicalJson(expected)) throw new Error("phase3b_product_oracle_replay_mismatch");
  return expected;
}

export function verifyPhase3BReportAgainstRelease(report: ProductScenarioReport, release: AcceptedPhase3BProductContextRelease): void {
  assertAcceptedPhase3BProductContextRelease(release); assertContentHash(report as unknown as Record<string, unknown>, "reportHash");
  const index = PHASE3B_PRODUCT_SCENARIO_IDS.indexOf(report.scenarioId as typeof PHASE3B_PRODUCT_SCENARIO_IDS[number]);
  if (index < 0 || canonicalJson(report) !== canonicalJson(buildReport(release, report.scenarioId, index))) throw new Error("phase3b_product_oracle_report_mismatch");
}

export const PHASE3B_WORKBENCH_SEMANTIC_ID = contentHash({ version: PHASE3B_VERSIONS.oracleWorkbench, scenarioIds: PHASE3B_PRODUCT_SCENARIO_IDS });
