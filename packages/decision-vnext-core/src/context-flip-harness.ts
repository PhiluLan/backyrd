import { canonicalJson, contentHash, deepFreeze } from "./canonical.js";
import { CONTEXT_KERNEL_VERSIONS, type ContextFlipReport, type ContextKernelClientInput, type OracleAuthorityRecord } from "./context-kernel-contracts.js";
import { phase3AClientInput, phase3ARequest, runPhase3AContextFixture, SyntheticContextWeatherProvider, type Phase3AContextRun } from "./context-fixtures.js";
import { verifyContextForConsumers, type VerifiedContextSnapshot } from "./context-kernel.js";
import { buildContextFlipReport, createStructuralOracle, createStructuralOracleAuthority, trustSyntheticOracleAuthorityForLocalEvaluation, validateContextFlipReport } from "./context-oracle.js";

export const PHASE3A_CONTEXT_FLIP_IDS = [
  "companion-alone-vs-friends", "midday-vs-late-evening", "available-time-long-vs-short", "distance-low-vs-high", "weather-dry-vs-rain",
  "budget-narrow-vs-broad", "familiar-vs-exploration", "general-vs-accessibility-hard", "location-permission-granted-vs-denied", "weather-known-vs-unavailable",
  "context-unknown-vs-not-configured", "initial-vs-alternative-requested", "candidate-unseen-vs-rejected", "same-request-different-authorized-location", "same-context-different-timezone",
] as const;
export type Phase3AContextFlipId = typeof PHASE3A_CONTEXT_FLIP_IDS[number];

interface FlipPair { readonly base: Phase3AContextRun; readonly flipped: Phase3AContextRun; readonly expected: readonly string[]; readonly expectedInputs: readonly OracleAuthorityRecord["allowedInputChanges"][number][]; readonly hardChanged?: boolean; readonly softChanged?: boolean; readonly eligibilityEffect?: "UNCHANGED" | "MAY_CHANGE_BY_CONFIGURED_HARD_CONSTRAINT" | "NOT_CONFIGURED"; }

const replaceDimension = (client: ContextKernelClientInput, dimensionKey: string, value: ContextKernelClientInput["explicitDimensions"][number]["value"]): ContextKernelClientInput => ({ ...client, explicitDimensions: [...client.explicitDimensions.filter((item) => item.dimensionKey !== dimensionKey), { dimensionKey, value }] });

async function pair(id: Phase3AContextFlipId): Promise<FlipPair> {
  const baseClient = phase3AClientInput();
  switch (id) {
    case "companion-alone-vs-friends": {
      const base = await runPhase3AContextFixture({ client: baseClient }); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ socialContext: "fixture.companion.friends" }) } });
      return { base, flipped, expected: ["context.companion.explicit"], expectedInputs: ["CLIENT_REQUEST"] };
    }
    case "midday-vs-late-evening": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ serverTime: "2026-01-15T22:00:00.000Z", weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.dry", "2026-01-15T21:30:00.000Z", "2026-01-16T00:00:00.000Z") });
      return { base, flipped, expected: ["context.time.local", "context.time.server", "context.location.scope", "context.location.permission", "context.session.state", "context.weather.explicit", "context.weather.observed", "context.occasion.explicit", "fixture.constraint.accessibility"], expectedInputs: ["AUTHORITY_SERVER_TIME", "AUTHORITY_WEATHER"] };
    }
    case "available-time-long-vs-short": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: replaceDimension(baseClient, "context.available-time.explicit", { kind: "DURATION_MINUTES", minutes: 30 }) });
      return { base, flipped, expected: ["context.available-time.explicit"], expectedInputs: ["CLIENT_EXPLICIT_DIMENSIONS"] };
    }
    case "distance-low-vs-high": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: replaceDimension(baseClient, "context.distance-willingness.explicit", { kind: "DISTANCE_METERS", meters: 20_000 }) });
      return { base, flipped, expected: ["context.distance-willingness.explicit"], expectedInputs: ["CLIENT_EXPLICIT_DIMENSIONS"] };
    }
    case "weather-dry-vs-rain": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.rain") });
      return { base, flipped, expected: ["context.weather.observed"], expectedInputs: ["AUTHORITY_WEATHER"] };
    }
    case "budget-narrow-vs-broad": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ budget: { state: "KNOWN", namespace: "fixture.context.budget-v1", values: ["fixture.budget.broad"] } }) } });
      return { base, flipped, expected: ["context.budget.explicit"], expectedInputs: ["CLIENT_REQUEST"] };
    }
    case "familiar-vs-exploration": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ exploration: { state: "KNOWN", namespace: "fixture.context.exploration-v1", values: ["fixture.exploration.open"] } }) } });
      return { base, flipped, expected: ["context.exploration.explicit"], expectedInputs: ["CLIENT_REQUEST"] };
    }
    case "general-vs-accessibility-hard": {
      const base = await runPhase3AContextFixture(); const hard = { constraintId: "fixture-accessibility-required", dimensionKey: "fixture.constraint.accessibility", operator: "REQUIRE_TRUE" as const, expectedValue: { kind: "BOOLEAN" as const, value: true } }; const flipped = await runPhase3AContextFixture({ client: { ...baseClient, hardConstraints: [hard] } });
      return { base, flipped, expected: ["fixture.constraint.accessibility"], expectedInputs: ["CLIENT_HARD_CONSTRAINTS"], hardChanged: true, eligibilityEffect: "MAY_CHANGE_BY_CONFIGURED_HARD_CONSTRAINT" };
    }
    case "location-permission-granted-vs-denied": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ locationPermission: "DENIED", locationSource: "EXPLICIT_CITY_SELECTION" });
      return { base, flipped, expected: ["context.location.permission", "context.location.scope"], expectedInputs: ["AUTHORITY_LOCATION", "AUTHORITY_PERMISSION"] };
    }
    case "weather-known-vs-unavailable": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ weatherProvider: null });
      return { base, flipped, expected: ["context.weather.observed"], expectedInputs: ["AUTHORITY_WEATHER"] };
    }
    case "context-unknown-vs-not-configured": {
      const unknownClient = { ...baseClient, request: phase3ARequest({ exploration: { state: "UNKNOWN", namespace: "fixture.context.exploration-v1" } }) }; const notConfiguredClient = { ...baseClient, request: phase3ARequest({ exploration: { state: "NOT_CONFIGURED", namespace: "fixture.context.exploration-v1" } }) };
      const base = await runPhase3AContextFixture({ client: unknownClient }); const flipped = await runPhase3AContextFixture({ client: notConfiguredClient });
      return { base, flipped, expected: ["context.exploration.explicit"], expectedInputs: ["CLIENT_REQUEST"] };
    }
    case "initial-vs-alternative-requested": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ alternativeRequestCount: 1 });
      return { base, flipped, expected: ["context.session.state"], expectedInputs: ["AUTHORITY_SESSION_STATE"] };
    }
    case "candidate-unseen-vs-rejected": {
      const rejectedClient = { ...baseClient, request: phase3ARequest({ shownCandidateIds: ["syn-spot-0001"], rejectedCandidateIds: ["syn-spot-0001"] }) }; const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: rejectedClient });
      return { base, flipped, expected: ["context.session.state"], expectedInputs: ["AUTHORITY_SESSION_STATE", "CLIENT_REQUEST"] };
    }
    case "same-request-different-authorized-location": {
      const baselClient = { ...baseClient, request: phase3ARequest({ location: { kind: "city", city: "Fixture Basel" } }) }; const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: baselClient, locationCity: "Fixture Basel" });
      return { base, flipped, expected: ["context.location.scope", "context.weather.observed"], expectedInputs: ["AUTHORITY_LOCATION", "AUTHORITY_WEATHER", "CLIENT_REQUEST"] };
    }
    case "same-context-different-timezone": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ timeZone: "America/New_York" });
      return { base, flipped, expected: ["context.time.local"], expectedInputs: ["AUTHORITY_TIME_ZONE"] };
    }
  }
}

function verified(run: Phase3AContextRun): VerifiedContextSnapshot { return verifyContextForConsumers(run.envelope, run.trustAnchor, run.registry, run.policy, run.client); }

export async function runContextFlipScenario(id: Phase3AContextFlipId): Promise<{ readonly base: Phase3AContextRun; readonly flipped: Phase3AContextRun; readonly baseVerified: VerifiedContextSnapshot; readonly flippedVerified: VerifiedContextSnapshot; readonly oracleAuthority: OracleAuthorityRecord; readonly oracleTrustAnchor: ReturnType<typeof trustSyntheticOracleAuthorityForLocalEvaluation>; readonly report: ContextFlipReport }> {
  const value = await pair(id); const baseVerified = verified(value.base); const flippedVerified = verified(value.flipped);
  const expectation = { oracleId: `oracle-${id}`, scenarioId: id, expectedStructuralChanges: value.expected, expectedInputChanges: value.expectedInputs, expectedHardConstraintSetChanged: value.hardChanged ?? false, expectedSoftPreferenceSetChanged: value.softChanged ?? false, ...(value.eligibilityEffect === undefined ? {} : { expectedEligibilityEffect: value.eligibilityEffect }), validFrom: "2026-01-15T00:00:00.000Z", validUntil: "2027-01-15T00:00:00.000Z", allowedScenarioIds: [id] };
  const oracleAuthority = createStructuralOracleAuthority({ ...expectation, base: baseVerified, flipped: flippedVerified }); const oracleTrustAnchor = trustSyntheticOracleAuthorityForLocalEvaluation(oracleAuthority); const oracle = createStructuralOracle(expectation, oracleAuthority, oracleTrustAnchor);
  const report = buildContextFlipReport(baseVerified, flippedVerified, oracle, oracleAuthority, oracleTrustAnchor); validateContextFlipReport(report, baseVerified, flippedVerified, oracleAuthority, oracleTrustAnchor);
  return deepFreeze({ base: value.base, flipped: value.flipped, baseVerified, flippedVerified, oracleAuthority, oracleTrustAnchor, report });
}

export async function runContextFlipWorkbench(): Promise<{ readonly contractVersion: string; readonly scenarios: readonly ContextFlipReport[]; readonly productRankingQualityConfigured: false; readonly workbenchHash: string }> {
  const scenarios: ContextFlipReport[] = []; for (const id of PHASE3A_CONTEXT_FLIP_IDS) scenarios.push((await runContextFlipScenario(id)).report);
  const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.flipReport, scenarios, productRankingQualityConfigured: false as const };
  return deepFreeze({ ...body, workbenchHash: contentHash(body) });
}

export function replayContextFlipWorkbench(value: Awaited<ReturnType<typeof runContextFlipWorkbench>>): void {
  if (value.scenarios.length !== PHASE3A_CONTEXT_FLIP_IDS.length || canonicalJson(value.scenarios.map((item) => item.scenarioId)) !== canonicalJson(PHASE3A_CONTEXT_FLIP_IDS)) throw new Error("context_flip_scenario_set_mismatch");
  if (value.productRankingQualityConfigured || contentHash({ contractVersion: value.contractVersion, scenarios: value.scenarios, productRankingQualityConfigured: value.productRankingQualityConfigured }) !== value.workbenchHash) throw new Error("context_flip_workbench_integrity_mismatch");
}
