import { CONTRACT_VERSIONS, type DecisionRequest } from "./contracts.js";
import { contentHash, withContentHash } from "./canonical.js";
import { CONTEXT_KERNEL_VERSIONS, type ContextAuthorityRecord, type ContextAuthorityTrustAnchor, type ContextKernelClientInput, type ContextSnapshot, type ContextWeatherProviderPort, type WeatherObservation } from "./context-kernel-contracts.js";
import { createContextExecutionEnvelope, createFixtureContextPolicy, createFixtureContextRegistry, createServerSessionState, createSyntheticContextAuthority, resolveContextKernel, trustSyntheticContextAuthority } from "./context-kernel.js";

export const PHASE3A_FIXTURE_CONCEPTS = Object.freeze({
  companion: ["fixture.companion.alone", "fixture.companion.friends"],
  budget: ["fixture.budget.narrow", "fixture.budget.broad"],
  exploration: ["fixture.exploration.familiar", "fixture.exploration.open"],
  mood: ["fixture.mood.calm"],
  intent: ["fixture.intent.eat"],
  weather: ["fixture.weather.dry", "fixture.weather.rain"],
} as const);

export function phase3ARequest(overrides: Partial<DecisionRequest> = {}): DecisionRequest {
  return {
    contractVersion: CONTRACT_VERSIONS.decisionRequest,
    idempotencyKey: "phase3a-context-request",
    clientRequestedAt: "2026-01-15T12:00:00.000Z",
    location: { kind: "city", city: "Fixture Zurich" },
    intentKeys: ["fixture.intent.eat"], moodKeys: ["fixture.mood.calm"], socialContext: "fixture.companion.alone",
    budget: { state: "KNOWN", namespace: "fixture.context.budget-v1", values: ["fixture.budget.narrow"] },
    exploration: { state: "KNOWN", namespace: "fixture.context.exploration-v1", values: ["fixture.exploration.familiar"] },
    shownCandidateIds: [], rejectedCandidateIds: [], hardConstraints: [{ kind: "open_now", value: true }], softPreferences: [], client: { surface: "synthetic", version: "phase3a-fixture-v1" },
    ...overrides,
  };
}

export function phase3AClientInput(input: { readonly request?: DecisionRequest; readonly explicitDimensions?: ContextKernelClientInput["explicitDimensions"]; readonly hardConstraints?: ContextKernelClientInput["hardConstraints"]; readonly softPreferences?: ContextKernelClientInput["softPreferences"] } = {}): ContextKernelClientInput {
  return { contractVersion: CONTEXT_KERNEL_VERSIONS.clientInput, request: input.request ?? phase3ARequest(), explicitDimensions: input.explicitDimensions ?? [{ dimensionKey: "context.available-time.explicit", value: { kind: "DURATION_MINUTES", minutes: 90 } }, { dimensionKey: "context.distance-willingness.explicit", value: { kind: "DISTANCE_METERS", meters: 5_000 } }], hardConstraints: input.hardConstraints ?? [], softPreferences: input.softPreferences ?? [] };
}

export class SyntheticContextWeatherProvider implements ContextWeatherProviderPort {
  readonly contractVersion = CONTEXT_KERNEL_VERSIONS.weatherPort;
  constructor(private readonly conditionRef: string, private readonly observedAt = "2026-01-15T11:30:00.000Z", private readonly validUntil = "2026-01-15T14:00:00.000Z") {}
  async readObservation(input: { readonly authorizedScope: { readonly kind: "CITY_SCOPE"; readonly city: string; readonly radiusMeters?: number; readonly accuracy: "CITY_ONLY" | "APPROXIMATE" | "AUTHORIZED_RADIUS" | "UNKNOWN" }; readonly at: string }): Promise<WeatherObservation> {
    const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.weatherPort, providerId: "synthetic-context-weather", providerVersion: "synthetic-context-weather-v1", conditionRef: this.conditionRef, observedAt: this.observedAt, validUntil: this.validUntil, geographicScopeHash: contentHash(input.authorizedScope) };
    return withContentHash(body, "sourceHash") as WeatherObservation;
  }
}

export interface Phase3AContextRun {
  readonly client: ContextKernelClientInput;
  readonly authority: ContextAuthorityRecord;
  readonly trustAnchor: ContextAuthorityTrustAnchor;
  readonly snapshot: ContextSnapshot;
  readonly envelope: import("./context-kernel-contracts.js").ContextExecutionEnvelope;
  readonly registry: ReturnType<typeof createFixtureContextRegistry>;
  readonly policy: ReturnType<typeof createFixtureContextPolicy>;
}

export async function runPhase3AContextFixture(options: {
  readonly client?: ContextKernelClientInput;
  readonly serverTime?: string;
  readonly timeZone?: string;
  readonly locationCity?: string;
  readonly locationPermission?: "GRANTED" | "DENIED" | "NOT_AVAILABLE";
  readonly locationSource?: "SYNTHETIC_AUTHORIZED_PROVIDER" | "EXPLICIT_CITY_SELECTION" | "SERVER_POLICY";
  readonly openedCandidateIds?: readonly string[];
  readonly alternativeRequestCount?: number;
  readonly weatherProvider?: ContextWeatherProviderPort | null;
  readonly authorityOverrides?: Partial<Omit<ContextAuthorityRecord, "contractVersion" | "authorityKind" | "authorityHash">>;
} = {}): Promise<Phase3AContextRun> {
  const registry = createFixtureContextRegistry(); const policy = createFixtureContextPolicy(registry); const client = options.client ?? phase3AClientInput();
  const serverTime = options.serverTime ?? "2026-01-15T12:00:00.000Z"; const locationCity = options.locationCity ?? (client.request.location.kind === "city" ? client.request.location.city : "Fixture Zurich");
  const sessionState = createServerSessionState({ shownCandidateIds: client.request.shownCandidateIds, openedCandidateIds: options.openedCandidateIds ?? [], rejectedCandidateIds: client.request.rejectedCandidateIds, alternativeRequestCount: options.alternativeRequestCount ?? 0 });
  const authorizedLocationScope = { kind: "CITY_SCOPE" as const, city: locationCity, radiusMeters: 10_000, accuracy: "AUTHORIZED_RADIUS" as const }; const weatherProvider = options.weatherProvider === null ? undefined : options.weatherProvider ?? new SyntheticContextWeatherProvider("fixture.weather.dry"); const weatherObservation = weatherProvider ? await weatherProvider.readObservation({ authorizedScope: authorizedLocationScope, at: serverTime }) : null;
  const authority = createSyntheticContextAuthority({ authorityId: "phase3a-context-authority", decisionId: "phase3a-decision", sessionId: "phase3a-session", actorSubjectBindingHash: contentHash("phase3a-synthetic-subject"), serverTime, expiresAt: new Date(Date.parse(serverTime) + 3_600_000).toISOString(), clientLocationInputHash: contentHash(client.request.location), authorizedLocationScope, locationComparison: "MATCH", locationPermission: options.locationPermission ?? "GRANTED", locationSource: options.locationSource ?? "SYNTHETIC_AUTHORIZED_PROVIDER", timeZone: options.timeZone ?? "Europe/Zurich", acceptedRegistryVersion: registry.registryVersion, acceptedRegistryHash: registry.registryHash, acceptedPolicyVersion: policy.policyVersion, acceptedPolicyHash: policy.policyHash, worldSnapshotBindingHash: contentHash("phase3a-world-snapshot-set"), userProjectionBindingHash: contentHash("phase3a-relevant-user-projection"), candidatePoolBindingHash: contentHash("phase3a-neutral-candidate-pool"), eligibilityPolicyBindingHash: contentHash("phase3a-existing-eligibility-policy"), degradationPolicyBindingHash: contentHash("phase3a-context-degradation-matrix"), weatherObservationBinding: weatherObservation ? { sourceHash: weatherObservation.sourceHash, conditionRef: weatherObservation.conditionRef, observedAt: weatherObservation.observedAt, validUntil: weatherObservation.validUntil, geographicScopeHash: weatherObservation.geographicScopeHash } : null, sessionState, ...options.authorityOverrides });
  const trustAnchor = trustSyntheticContextAuthority(authority);
  const snapshot = await resolveContextKernel(client, authority, trustAnchor, registry, policy, weatherProvider ? { weatherProvider } : {});
  const envelope = createContextExecutionEnvelope(snapshot, authority, trustAnchor, registry, policy, client);
  return { client, authority, trustAnchor, snapshot, envelope, registry, policy };
}
