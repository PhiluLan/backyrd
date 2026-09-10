import { canonicalJson, contentHash, deepFreeze } from "./canonical.js";
import { CONTEXT_KERNEL_VERSIONS, type ContextFlipReport, type ContextKernelClientInput, type ContextSnapshot } from "./context-kernel-contracts.js";
import { phase3AClientInput, phase3ARequest, runPhase3AContextFixture, SyntheticContextWeatherProvider } from "./context-fixtures.js";
import { buildContextFlipReport, createStructuralOracle, validateContextFlipReport } from "./context-oracle.js";

export const PHASE3A_CONTEXT_FLIP_IDS = [
  "companion-alone-vs-friends", "midday-vs-late-evening", "available-time-long-vs-short", "distance-low-vs-high", "weather-dry-vs-rain",
  "budget-narrow-vs-broad", "familiar-vs-exploration", "general-vs-accessibility-hard", "location-permission-granted-vs-denied", "weather-known-vs-unavailable",
  "context-unknown-vs-not-configured", "initial-vs-alternative-requested", "candidate-unseen-vs-rejected", "same-request-different-authorized-location", "same-context-different-timezone",
] as const;
export type Phase3AContextFlipId = typeof PHASE3A_CONTEXT_FLIP_IDS[number];

interface FlipPair { readonly base: ContextSnapshot; readonly flipped: ContextSnapshot; readonly expected: readonly string[]; readonly eligibilityEffect?: "UNCHANGED" | "MAY_CHANGE_BY_CONFIGURED_HARD_CONSTRAINT" | "NOT_CONFIGURED"; }

const replaceDimension = (client: ContextKernelClientInput, dimensionKey: string, value: ContextKernelClientInput["explicitDimensions"][number]["value"]): ContextKernelClientInput => ({ ...client, explicitDimensions: [...client.explicitDimensions.filter((item) => item.dimensionKey !== dimensionKey), { dimensionKey, value }] });

async function pair(id: Phase3AContextFlipId): Promise<FlipPair> {
  const baseClient = phase3AClientInput();
  switch (id) {
    case "companion-alone-vs-friends": {
      const base = await runPhase3AContextFixture({ client: baseClient }); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ socialContext: "fixture.companion.friends" }) } });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.companion.explicit"] };
    }
    case "midday-vs-late-evening": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ serverTime: "2026-01-15T22:00:00.000Z", weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.dry", "2026-01-15T21:30:00.000Z", "2026-01-16T00:00:00.000Z") });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.time.local", "context.time.server"] };
    }
    case "available-time-long-vs-short": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: replaceDimension(baseClient, "context.available-time.explicit", { kind: "DURATION_MINUTES", minutes: 30 }) });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.available-time.explicit"] };
    }
    case "distance-low-vs-high": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: replaceDimension(baseClient, "context.distance-willingness.explicit", { kind: "DISTANCE_METERS", meters: 20_000 }) });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.distance-willingness.explicit"] };
    }
    case "weather-dry-vs-rain": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ weatherProvider: new SyntheticContextWeatherProvider("fixture.weather.rain") });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.weather.observed"] };
    }
    case "budget-narrow-vs-broad": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ budget: { state: "KNOWN", namespace: "fixture.context.budget-v1", values: ["fixture.budget.broad"] } }) } });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.budget.explicit"] };
    }
    case "familiar-vs-exploration": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: { ...baseClient, request: phase3ARequest({ exploration: { state: "KNOWN", namespace: "fixture.context.exploration-v1", values: ["fixture.exploration.open"] } }) } });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.exploration.explicit"] };
    }
    case "general-vs-accessibility-hard": {
      const base = await runPhase3AContextFixture(); const hard = { constraintId: "fixture-accessibility-required", dimensionKey: "fixture.constraint.accessibility", operator: "REQUIRE_TRUE" as const, expectedValue: { kind: "BOOLEAN" as const, value: true } }; const flipped = await runPhase3AContextFixture({ client: { ...baseClient, hardConstraints: [hard] } });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["fixture.constraint.accessibility"], eligibilityEffect: "MAY_CHANGE_BY_CONFIGURED_HARD_CONSTRAINT" };
    }
    case "location-permission-granted-vs-denied": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ locationPermission: "DENIED", locationSource: "EXPLICIT_CITY_SELECTION" });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.location.permission"] };
    }
    case "weather-known-vs-unavailable": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ weatherProvider: null });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.weather.observed"] };
    }
    case "context-unknown-vs-not-configured": {
      const unknownClient = { ...baseClient, request: phase3ARequest({ exploration: { state: "UNKNOWN", namespace: "fixture.context.exploration-v1" } }) }; const notConfiguredClient = { ...baseClient, request: phase3ARequest({ exploration: { state: "NOT_CONFIGURED", namespace: "fixture.context.exploration-v1" } }) };
      const base = await runPhase3AContextFixture({ client: unknownClient }); const flipped = await runPhase3AContextFixture({ client: notConfiguredClient });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.exploration.explicit"] };
    }
    case "initial-vs-alternative-requested": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ alternativeRequestCount: 1 });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.session.state"] };
    }
    case "candidate-unseen-vs-rejected": {
      const rejectedClient = { ...baseClient, request: phase3ARequest({ shownCandidateIds: ["syn-spot-0001"], rejectedCandidateIds: ["syn-spot-0001"] }) }; const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: rejectedClient });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.session.state"] };
    }
    case "same-request-different-authorized-location": {
      const baselClient = { ...baseClient, request: phase3ARequest({ location: { kind: "city", city: "Fixture Basel" } }) }; const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ client: baselClient, locationCity: "Fixture Basel" });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.location.scope"] };
    }
    case "same-context-different-timezone": {
      const base = await runPhase3AContextFixture(); const flipped = await runPhase3AContextFixture({ timeZone: "America/New_York" });
      return { base: base.snapshot, flipped: flipped.snapshot, expected: ["context.time.local"] };
    }
  }
}

export async function runContextFlipScenario(id: Phase3AContextFlipId): Promise<{ readonly base: ContextSnapshot; readonly flipped: ContextSnapshot; readonly report: ContextFlipReport }> {
  const value = await pair(id); const oracle = createStructuralOracle({ oracleId: `oracle-${id}`, scenarioId: id, baseContextHash: value.base.contextHash, flippedContextHash: value.flipped.contextHash, expectedStructuralChanges: value.expected, ...(value.eligibilityEffect === undefined ? {} : { expectedEligibilityEffect: value.eligibilityEffect }), approvedAt: "2026-01-15T12:00:00.000Z" });
  const report = buildContextFlipReport(value.base, value.flipped, oracle); validateContextFlipReport(report, value.base, value.flipped);
  return deepFreeze({ base: value.base, flipped: value.flipped, report });
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
