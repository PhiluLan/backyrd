import { canonicalJson, contentHash, deepFreeze } from "./canonical.js";
import { CONTEXT_KERNEL_VERSIONS, type ContextFlipReport, type ContextKernelClientInput, type OracleAuthorityRecord, type OracleTrustAnchorCatalogEntry } from "./context-kernel-contracts.js";
import { phase3AClientInput, phase3ARequest, runPhase3AContextFixture, SyntheticContextWeatherProvider, type Phase3AContextRun } from "./context-fixtures.js";
import { verifyContextForConsumers, type VerifiedContextSnapshot } from "./context-kernel.js";
import { buildContextFlipReport, createStructuralOracle, validateContextFlipReport } from "./context-oracle.js";
import { selectAcceptedOracleArtifacts, type AcceptedOracleCatalogs } from "./context-oracle-catalog.js";
import { loadAcceptedPhase3AOracleRelease, PHASE3A_RELEASE_SCENARIO_IDS } from "./context-oracle-release-fixture.js";

export const PHASE3A_CONTEXT_FLIP_IDS = [
  "companion-alone-vs-friends", "midday-vs-late-evening", "available-time-long-vs-short", "distance-low-vs-high", "weather-dry-vs-rain",
  "budget-narrow-vs-broad", "familiar-vs-exploration", "general-vs-accessibility-hard", "location-permission-granted-vs-denied", "weather-known-vs-unavailable",
  "context-unknown-vs-not-configured", "initial-vs-alternative-requested", "candidate-unseen-vs-rejected", "same-request-different-authorized-location", "same-context-different-timezone",
] as const;
export type Phase3AContextFlipId = typeof PHASE3A_CONTEXT_FLIP_IDS[number];

interface FlipPair { readonly base: Phase3AContextRun; readonly flipped: Phase3AContextRun; }

const replaceDimension = (client: ContextKernelClientInput, dimensionKey: string, value: ContextKernelClientInput["explicitDimensions"][number]["value"]): ContextKernelClientInput => ({ ...client, explicitDimensions: [...client.explicitDimensions.filter((item) => item.dimensionKey !== dimensionKey), { dimensionKey, value }] });

async function pair(id: Phase3AContextFlipId): Promise<FlipPair> {
  const baseClient = phase3AClientInput();
  switch (id) {
    case "companion-alone-vs-friends": {
      const base = await runPhase3AContextFixture({ client: baseClient }); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ socialContext: "fixture.companion.friends" }) } });
      return { base, flipped };
    }
    case "midday-vs-late-evening": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ serverTime: "2026-01-15T22:00:00.000Z", weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.dry", "2026-01-15T21:30:00.000Z", "2026-01-16T00:00:00.000Z") });
      return { base, flipped };
    }
    case "available-time-long-vs-short": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: replaceDimension(baseClient, "context.available-time.explicit", { kind: "DURATION_MINUTES", minutes: 30 }) });
      return { base, flipped };
    }
    case "distance-low-vs-high": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: replaceDimension(baseClient, "context.distance-willingness.explicit", { kind: "DISTANCE_METERS", meters: 20_000 }) });
      return { base, flipped };
    }
    case "weather-dry-vs-rain": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.rain") });
      return { base, flipped };
    }
    case "budget-narrow-vs-broad": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ budget: { state: "KNOWN", namespace: "fixture.context.budget-v1", values: ["fixture.budget.broad"] } }) } });
      return { base, flipped };
    }
    case "familiar-vs-exploration": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ exploration: { state: "KNOWN", namespace: "fixture.context.exploration-v1", values: ["fixture.exploration.open"] } }) } });
      return { base, flipped };
    }
    case "general-vs-accessibility-hard": {
      const base = await runPhase3AContextFixture(); const hard = { constraintId: "fixture-accessibility-required", dimensionKey: "fixture.constraint.accessibility", operator: "REQUIRE_TRUE" as const, expectedValue: { kind: "BOOLEAN" as const, value: true } }; const flipped = await runPhase3AContextFixture({ client: { ...baseClient, hardConstraints: [hard] } });
      return { base, flipped };
    }
    case "location-permission-granted-vs-denied": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ locationPermission: "DENIED", locationSource: "EXPLICIT_CITY_SELECTION" });
      return { base, flipped };
    }
    case "weather-known-vs-unavailable": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ weatherProvider: null });
      return { base, flipped };
    }
    case "context-unknown-vs-not-configured": {
      const unknownClient = { ...baseClient, request: phase3ARequest({ exploration: { state: "UNKNOWN", namespace: "fixture.context.exploration-v1" } }) }; const notConfiguredClient = { ...baseClient, request: phase3ARequest({ exploration: { state: "NOT_CONFIGURED", namespace: "fixture.context.exploration-v1" } }) };
      const base = await runPhase3AContextFixture({ client: unknownClient }); const flipped = await runPhase3AContextFixture({ client: notConfiguredClient });
      return { base, flipped };
    }
    case "initial-vs-alternative-requested": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ alternativeRequestCount: 1 });
      return { base, flipped };
    }
    case "candidate-unseen-vs-rejected": {
      const rejectedClient = { ...baseClient, request: phase3ARequest({ shownCandidateIds: ["syn-spot-0001"], rejectedCandidateIds: ["syn-spot-0001"] }) }; const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: rejectedClient });
      return { base, flipped };
    }
    case "same-request-different-authorized-location": {
      const baselClient = { ...baseClient, request: phase3ARequest({ location: { kind: "city", city: "Fixture Basel" } }) }; const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: baselClient, locationCity: "Fixture Basel" });
      return { base, flipped };
    }
    case "same-context-different-timezone": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ timeZone: "America/New_York" });
      return { base, flipped };
    }
  }
}

function verified(run: Phase3AContextRun): VerifiedContextSnapshot { return verifyContextForConsumers(run.envelope, run.trustAnchor, run.registry, run.policy, run.client); }

async function runWithAcceptedCatalogs(id: Phase3AContextFlipId, catalogs: AcceptedOracleCatalogs): Promise<{ readonly base: Phase3AContextRun; readonly flipped: Phase3AContextRun; readonly baseVerified: VerifiedContextSnapshot; readonly flippedVerified: VerifiedContextSnapshot; readonly oracleAuthority: OracleAuthorityRecord; readonly oracleTrustAnchor: OracleTrustAnchorCatalogEntry; readonly report: ContextFlipReport }> {
  const selected = selectAcceptedOracleArtifacts(catalogs, id);
  const value = await pair(id); const baseVerified = verified(value.base); const flippedVerified = verified(value.flipped);
  const entry = selected.authorityEntry;
  const expectation = { oracleId: entry.oracleId, scenarioId: entry.scenarioId, expectedStructuralChanges: entry.expectedStructuralChanges, expectedInputChanges: entry.expectedInputChanges, expectedHardConstraintSetChanged: entry.expectedHardConstraintSetChanged, expectedSoftPreferenceSetChanged: entry.expectedSoftPreferenceSetChanged, expectedEligibilityEffect: entry.eligibilityExpectation, validFrom: entry.validFrom, validUntil: entry.validUntil, allowedScenarioIds: entry.allowedScenarioIds };
  const oracle = createStructuralOracle(expectation, catalogs);
  const report = buildContextFlipReport(baseVerified, flippedVerified, oracle, catalogs); validateContextFlipReport(report, baseVerified, flippedVerified, catalogs);
  return deepFreeze({ base: value.base, flipped: value.flipped, baseVerified, flippedVerified, oracleAuthority: entry.authority, oracleTrustAnchor: selected.trustAnchor, report });
}

export async function runContextFlipScenario(id: Phase3AContextFlipId): Promise<Awaited<ReturnType<typeof runWithAcceptedCatalogs>>> {
  const catalogs = loadAcceptedPhase3AOracleRelease();
  return runWithAcceptedCatalogs(id, catalogs);
}

export async function runContextFlipWorkbench(): Promise<{ readonly contractVersion: string; readonly oracleAuthorityCatalogHash: string; readonly oracleTrustAnchorCatalogHash: string; readonly oracleReleaseHash: string; readonly scenarios: readonly ContextFlipReport[]; readonly productRankingQualityConfigured: false; readonly workbenchHash: string }> {
  const catalogs = loadAcceptedPhase3AOracleRelease();
  const scenarios: ContextFlipReport[] = []; for (const id of PHASE3A_CONTEXT_FLIP_IDS) scenarios.push((await runWithAcceptedCatalogs(id, catalogs)).report);
  const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.flipReport, oracleAuthorityCatalogHash: catalogs.authorityCatalog.catalogHash, oracleTrustAnchorCatalogHash: catalogs.trustAnchorCatalog.catalogHash, oracleReleaseHash: catalogs.release.releaseHash, scenarios, productRankingQualityConfigured: false as const };
  return deepFreeze({ ...body, workbenchHash: contentHash(body) });
}

export function replayContextFlipWorkbench(value: Awaited<ReturnType<typeof runContextFlipWorkbench>>): void {
  const catalogs = loadAcceptedPhase3AOracleRelease();
  if (value.scenarios.length !== PHASE3A_CONTEXT_FLIP_IDS.length || canonicalJson(value.scenarios.map((item) => item.scenarioId)) !== canonicalJson(PHASE3A_CONTEXT_FLIP_IDS) || canonicalJson(PHASE3A_CONTEXT_FLIP_IDS) !== canonicalJson(PHASE3A_RELEASE_SCENARIO_IDS)) throw new Error("context_flip_scenario_set_mismatch");
  if (value.oracleAuthorityCatalogHash !== catalogs.authorityCatalog.catalogHash || value.oracleTrustAnchorCatalogHash !== catalogs.trustAnchorCatalog.catalogHash || value.oracleReleaseHash !== catalogs.release.releaseHash) throw new Error("context_flip_workbench_release_binding_mismatch");
  for (const report of value.scenarios) {
    if (report.oracleAuthorityCatalogHash !== catalogs.authorityCatalog.catalogHash || report.oracleTrustAnchorCatalogHash !== catalogs.trustAnchorCatalog.catalogHash || report.oracleReleaseHash !== catalogs.release.releaseHash) throw new Error("context_flip_report_release_binding_mismatch");
  }
  if (value.productRankingQualityConfigured || contentHash({ contractVersion: value.contractVersion, oracleAuthorityCatalogHash: value.oracleAuthorityCatalogHash, oracleTrustAnchorCatalogHash: value.oracleTrustAnchorCatalogHash, oracleReleaseHash: value.oracleReleaseHash, scenarios: value.scenarios, productRankingQualityConfigured: value.productRankingQualityConfigured }) !== value.workbenchHash) throw new Error("context_flip_workbench_integrity_mismatch");
}
