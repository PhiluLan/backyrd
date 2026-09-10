import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import {
  CONTEXT_AUTHORITIES,
  CONTEXT_KERNEL_VERSIONS,
  BoundHardConstraintSchema,
  BoundSoftPreferenceSchema,
  ContextAuthorityRecordSchema,
  ContextAuthorityTrustAnchorSchema,
  ContextDimensionRegistrySchema,
  ContextDimensionValueSchema,
  ContextExecutionEnvelopeSchema,
  ContextKernelClientInputSchema,
  ContextPolicySchema,
  ContextSnapshotSchema,
  ServerSessionStateSchema,
  WeatherObservationSchema,
  type BoundHardConstraint,
  type ContextAuthorityRecord,
  type ContextAuthorityTrustAnchor,
  type ContextDimensionDefinition,
  type ContextDimensionRegistry,
  type ContextDimensionValue,
  type ContextExecutionEnvelope,
  type ContextKernelClientInput,
  type ContextPolicy,
  type ContextSnapshot,
  type ContextTypedValue,
  type ContextWeatherProviderPort,
  type ServerSessionState,
  type WeatherObservation,
} from "./context-kernel-contracts.js";

const FIXTURE_REGISTRY_VERSION = "backyrd-vnext-context-fixture-registry-v1";
const FIXTURE_POLICY_VERSION = "backyrd-vnext-context-fixture-policy-v1";

const definition = (value: ContextDimensionDefinition): ContextDimensionDefinition => value;
const common = {
  contractVersion: "backyrd-vnext-context-dimension-definition-v1",
  persistence: "SNAPSHOT" as const,
  validity: "RUN_ONLY" as const,
  explanationRelevance: "AUTHORIZED_EVIDENCE_ONLY" as const,
  learningPolicy: "REQUIRES_SEPARATE_AUTHORIZED_EVENT" as const,
};

const DEFINITIONS: readonly ContextDimensionDefinition[] = [
  definition({ ...common, dimensionKey: "context.time.server", domain: "TIME", dataType: "OPAQUE_FIXTURE_KEY", allowedAuthorities: ["SERVER_AUTHORIZED"], sensitivity: "NON_PERSONAL", maximumPrecision: "MINUTES", allowedConsumers: ["ELIGIBILITY", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "NONE", unknownPolicyRequired: true, status: "ACTIVE" }),
  definition({ ...common, dimensionKey: "context.time.local", domain: "TIME", dataType: "OPAQUE_FIXTURE_KEY", allowedAuthorities: ["DERIVED"], sensitivity: "NON_PERSONAL", maximumPrecision: "MINUTES", allowedConsumers: ["ELIGIBILITY", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "NONE", unknownPolicyRequired: true, status: "ACTIVE" }),
  definition({ ...common, dimensionKey: "context.location.scope", domain: "LOCATION", dataType: "OPAQUE_FIXTURE_KEY", allowedAuthorities: ["SERVER_AUTHORIZED"], sensitivity: "PERSONAL", maximumPrecision: "CITY_RADIUS", allowedConsumers: ["ELIGIBILITY", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "NONE", unknownPolicyRequired: true, status: "ACTIVE" }),
  definition({ ...common, dimensionKey: "context.location.permission", domain: "LOCATION", dataType: "BOOLEAN", allowedAuthorities: ["SERVER_AUTHORIZED", "DENIED", "NOT_AVAILABLE"], sensitivity: "PERSONAL", maximumPrecision: "BOOLEAN", allowedConsumers: ["ELIGIBILITY", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "NONE", unknownPolicyRequired: true, status: "ACTIVE" }),
  definition({ ...common, dimensionKey: "context.intent.explicit", domain: "INTENT", dataType: "CONCEPT_REFS", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "PERSONAL", maximumPrecision: "CONCEPT_REFERENCE", allowedConsumers: ["RANKING", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "NONE", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: false, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.occasion.explicit", domain: "OCCASION", dataType: "CONCEPT_REFS", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "PERSONAL", maximumPrecision: "CONCEPT_REFERENCE", allowedConsumers: ["RANKING", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "NONE", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: false, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.companion.explicit", domain: "COMPANION", dataType: "CONCEPT_REFS", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "PERSONAL", maximumPrecision: "CONCEPT_REFERENCE", allowedConsumers: ["RANKING", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "NONE", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: false, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.mood.current.explicit", domain: "MOOD", dataType: "CONCEPT_REFS", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "SENSITIVE", maximumPrecision: "CONCEPT_REFERENCE", allowedConsumers: ["RANKING", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "NONE", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: false, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.budget.explicit", domain: "BUDGET", dataType: "CONCEPT_REFS", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "SENSITIVE", maximumPrecision: "CONCEPT_REFERENCE", allowedConsumers: ["ELIGIBILITY", "RANKING", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: true, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.available-time.explicit", domain: "AVAILABLE_TIME", dataType: "DURATION_MINUTES", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "PERSONAL", maximumPrecision: "MINUTES", allowedConsumers: ["ELIGIBILITY", "RANKING", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: true, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.weather.explicit", domain: "WEATHER", dataType: "CONCEPT_REFS", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "NON_PERSONAL", maximumPrecision: "CONCEPT_REFERENCE", allowedConsumers: ["EVALUATION"], eligibilityRelevance: "NONE", rankingRelevance: "NONE", unknownPolicyRequired: false, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.weather.observed", domain: "WEATHER", dataType: "WEATHER_OBSERVATION", allowedAuthorities: ["SERVER_AUTHORIZED", "UNKNOWN", "NOT_AVAILABLE", "DENIED"], sensitivity: "NON_PERSONAL", maximumPrecision: "CITY", allowedConsumers: ["RANKING", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "NONE", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: false, status: "DRAFT" }),
  definition({ ...common, dimensionKey: "context.exploration.explicit", domain: "EXPLORATION", dataType: "CONCEPT_REFS", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "PERSONAL", maximumPrecision: "CONCEPT_REFERENCE", allowedConsumers: ["RANKING", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "NONE", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: false, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.distance-willingness.explicit", domain: "LOCATION", dataType: "DISTANCE_METERS", allowedAuthorities: ["EXPLICIT", "UNKNOWN", "NOT_CONFIGURED"], sensitivity: "PERSONAL", maximumPrecision: "CITY_RADIUS", allowedConsumers: ["RANKING", "EVALUATION"], eligibilityRelevance: "NONE", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: false, status: "NOT_CONFIGURED" }),
  definition({ ...common, dimensionKey: "context.constraint.open-now", domain: "CONSTRAINT", dataType: "BOOLEAN", allowedAuthorities: ["EXPLICIT"], sensitivity: "NON_PERSONAL", maximumPrecision: "BOOLEAN", allowedConsumers: ["ELIGIBILITY", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "NONE", unknownPolicyRequired: true, status: "ACTIVE" }),
  definition({ ...common, dimensionKey: "fixture.constraint.accessibility", domain: "CONSTRAINT", dataType: "BOOLEAN", allowedAuthorities: ["EXPLICIT", "UNKNOWN"], sensitivity: "SENSITIVE", maximumPrecision: "BOOLEAN", allowedConsumers: ["ELIGIBILITY", "EXPLANATION", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "NONE", unknownPolicyRequired: true, status: "DRAFT" }),
  definition({ ...common, dimensionKey: "context.session.state", domain: "SESSION", dataType: "OPAQUE_FIXTURE_KEY", allowedAuthorities: ["SERVER_AUTHORIZED"], sensitivity: "PSEUDONYMOUS", maximumPrecision: "OPAQUE_TECHNICAL", allowedConsumers: ["ELIGIBILITY", "RANKING", "EVALUATION"], eligibilityRelevance: "POLICY_GATED", rankingRelevance: "POLICY_GATED", unknownPolicyRequired: false, status: "DRAFT" }),
];

export function createFixtureContextRegistry(): ContextDimensionRegistry {
  const definitions = [...DEFINITIONS].sort((a, b) => a.dimensionKey.localeCompare(b.dimensionKey));
  return deepFreeze(ContextDimensionRegistrySchema.parse(withContentHash({ contractVersion: CONTEXT_KERNEL_VERSIONS.registry, registryId: "decision-vnext-context-fixture-registry", registryVersion: FIXTURE_REGISTRY_VERSION, fixtureOnly: true, productTaxonomyConfigured: false, definitions }, "registryHash"))) as ContextDimensionRegistry;
}

export function createFixtureContextPolicy(registry: ContextDimensionRegistry = createFixtureContextRegistry()): ContextPolicy {
  validateContextRegistry(registry);
  const constraintPolicies = [
    { policyId: "fixture-open-now-policy", dimensionKey: "context.constraint.open-now", operator: "REQUIRE_TRUE" as const, unknownPolicy: "EXCLUDE_IF_UNKNOWN" as const, fixtureOnly: true, productApproved: false as const },
    { policyId: "fixture-accessibility-policy", dimensionKey: "fixture.constraint.accessibility", operator: "REQUIRE_TRUE" as const, unknownPolicy: "EXCLUDE_IF_UNKNOWN" as const, fixtureOnly: true, productApproved: false as const },
  ];
  return deepFreeze(ContextPolicySchema.parse(withContentHash({ contractVersion: CONTEXT_KERNEL_VERSIONS.policy, policyId: "decision-vnext-context-fixture-policy", policyVersion: FIXTURE_POLICY_VERSION, registryVersion: registry.registryVersion, registryHash: registry.registryHash, fixtureOnly: true, productSemanticsConfigured: false, maximumClientClockSkewSeconds: 300, maximumOfflineAgeSeconds: 86_400, maximumWeatherAgeSeconds: 7_200, maximumSessionCandidates: 500, acceptedDerivedRules: [{ ruleId: "derive-local-time", ruleVersion: "derive-local-time-v1" }], constraintPolicies }, "policyHash"))) as ContextPolicy;
}

export function validateContextRegistry(registryValue: unknown): ContextDimensionRegistry {
  const registry = ContextDimensionRegistrySchema.parse(registryValue);
  assertContentHash(registry as unknown as Record<string, unknown>, "registryHash");
  if (new Set(registry.definitions.map((item) => item.dimensionKey)).size !== registry.definitions.length) throw new Error("context_registry_duplicate_dimension");
  if (registry.definitions.some((item) => new Set(item.allowedAuthorities).size !== item.allowedAuthorities.length || new Set(item.allowedConsumers).size !== item.allowedConsumers.length)) throw new Error("context_registry_duplicate_capability");
  return registry;
}

export function validateContextPolicy(policyValue: unknown, registryValue: unknown): ContextPolicy {
  const registry = validateContextRegistry(registryValue); const policy = ContextPolicySchema.parse(policyValue);
  assertContentHash(policy as unknown as Record<string, unknown>, "policyHash");
  if (policy.registryVersion !== registry.registryVersion || policy.registryHash !== registry.registryHash) throw new Error("context_policy_registry_mismatch");
  if (new Set(policy.constraintPolicies.map((item) => item.policyId)).size !== policy.constraintPolicies.length) throw new Error("context_policy_duplicate_constraint_policy");
  const definitions = new Set(registry.definitions.map((item) => item.dimensionKey));
  if (policy.constraintPolicies.some((item) => !definitions.has(item.dimensionKey))) throw new Error("context_policy_unknown_dimension");
  return policy;
}

export function createServerSessionState(input: Omit<ServerSessionState, "stateHash">): ServerSessionState {
  const normalize = (values: readonly string[]) => [...new Set(values)].sort();
  const body = { shownCandidateIds: normalize(input.shownCandidateIds), openedCandidateIds: normalize(input.openedCandidateIds), rejectedCandidateIds: normalize(input.rejectedCandidateIds), alternativeRequestCount: input.alternativeRequestCount };
  return deepFreeze(ServerSessionStateSchema.parse(withContentHash(body, "stateHash"))) as ServerSessionState;
}

export function createSyntheticContextAuthority(input: Omit<ContextAuthorityRecord, "contractVersion" | "authorityKind" | "authorityHash">): ContextAuthorityRecord {
  const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.authority, authorityKind: "SYNTHETIC_SERVER_CONTEXT_AUTHORITY" as const, ...input };
  return deepFreeze(ContextAuthorityRecordSchema.parse(withContentHash(body, "authorityHash"))) as ContextAuthorityRecord;
}

export function trustSyntheticContextAuthority(authorityValue: unknown, trustAnchorId = "phase3a-local-context-trust-anchor"): ContextAuthorityTrustAnchor {
  const authority = ContextAuthorityRecordSchema.parse(authorityValue);
  return ContextAuthorityTrustAnchorSchema.parse({ contractVersion: CONTEXT_KERNEL_VERSIONS.trustAnchor, trustAnchorId, acceptedAuthorityId: authority.authorityId, acceptedAuthorityHash: authority.authorityHash, acceptedRegistryHash: authority.acceptedRegistryHash, acceptedPolicyHash: authority.acceptedPolicyHash, acceptedWorldSnapshotBindingHash: authority.worldSnapshotBindingHash, acceptedUserProjectionBindingHash: authority.userProjectionBindingHash, acceptedCandidatePoolBindingHash: authority.candidatePoolBindingHash, acceptedEligibilityPolicyBindingHash: authority.eligibilityPolicyBindingHash, acceptedDegradationPolicyBindingHash: authority.degradationPolicyBindingHash, authorityKind: "SYNTHETIC_SERVER_CONTEXT_AUTHORITY", productionCapable: false });
}

export function validateContextAuthority(authorityValue: unknown, trustAnchorValue: unknown, registryValue: unknown, policyValue: unknown): ContextAuthorityRecord {
  const authority = ContextAuthorityRecordSchema.parse(authorityValue); const trust = ContextAuthorityTrustAnchorSchema.parse(trustAnchorValue);
  const registry = validateContextRegistry(registryValue); const policy = validateContextPolicy(policyValue, registry);
  assertContentHash(authority as unknown as Record<string, unknown>, "authorityHash");
  if (trust.productionCapable || trust.acceptedAuthorityId !== authority.authorityId || trust.acceptedAuthorityHash !== authority.authorityHash || trust.acceptedRegistryHash !== registry.registryHash || trust.acceptedPolicyHash !== policy.policyHash || trust.acceptedWorldSnapshotBindingHash !== authority.worldSnapshotBindingHash || trust.acceptedUserProjectionBindingHash !== authority.userProjectionBindingHash || trust.acceptedCandidatePoolBindingHash !== authority.candidatePoolBindingHash || trust.acceptedEligibilityPolicyBindingHash !== authority.eligibilityPolicyBindingHash || trust.acceptedDegradationPolicyBindingHash !== authority.degradationPolicyBindingHash) throw new Error("context_authority_not_trusted");
  if (authority.acceptedRegistryVersion !== registry.registryVersion || authority.acceptedRegistryHash !== registry.registryHash || authority.acceptedPolicyVersion !== policy.policyVersion || authority.acceptedPolicyHash !== policy.policyHash) throw new Error("context_authority_contract_mismatch");
  if (Date.parse(authority.expiresAt) < Date.parse(authority.serverTime)) throw new Error("context_authority_expired");
  validateSessionState(authority.sessionState);
  return authority;
}

function validateSessionState(value: ServerSessionState): void {
  assertContentHash(value as unknown as Record<string, unknown>, "stateHash");
  for (const values of [value.shownCandidateIds, value.openedCandidateIds, value.rejectedCandidateIds]) if (new Set(values).size !== values.length || canonicalJson(values) !== canonicalJson([...values].sort())) throw new Error("context_session_state_not_canonical");
}

function hashDimension<T extends Record<string, unknown>>(body: T): ContextDimensionValue {
  return ContextDimensionValueSchema.parse(withContentHash(body, "dimensionHash"));
}

function missingDimension(dimensionKey: string, state: "UNKNOWN" | "NOT_CONFIGURED" | "NOT_AVAILABLE" | "DENIED", reasonCode: string, at: string): ContextDimensionValue {
  return hashDimension({ dimensionKey, state, authority: state, reasonCode, consideredAt: at });
}

function explicitDimension(dimensionKey: string, value: ContextTypedValue, requestHash: string): ContextDimensionValue {
  return hashDimension({ dimensionKey, state: "KNOWN", authority: "EXPLICIT", value, sourceHash: requestHash, validUntil: null });
}

function serverDimension(dimensionKey: string, value: ContextTypedValue, sourceHash: string, observedAt: string, validUntil: string | null = null): ContextDimensionValue {
  return hashDimension({ dimensionKey, state: "KNOWN", authority: "SERVER_AUTHORIZED", value, sourceHash, observedAt, validUntil });
}

function derivedDimension(input: { dimensionKey: string; value: ContextTypedValue; ruleId: string; ruleVersion: string; sourceHashes: readonly string[]; derivedAt: string; limitations?: readonly string[] }): ContextDimensionValue {
  if (input.sourceHashes.length === 0) throw new Error("derived_context_source_required");
  const proofBody = { dimensionKey: input.dimensionKey, value: input.value, ruleId: input.ruleId, ruleVersion: input.ruleVersion, sourceHashes: [...input.sourceHashes].sort(), derivedAt: input.derivedAt, limitations: [...(input.limitations ?? [])].sort() };
  return hashDimension({ ...proofBody, state: "KNOWN", authority: "DERIVED", proofHash: contentHash(proofBody) });
}

const weekDayMap: Readonly<Record<string, ContextSnapshot["temporal"]["weekDay"]>> = { Mon: "MONDAY", Tue: "TUESDAY", Wed: "WEDNESDAY", Thu: "THURSDAY", Fri: "FRIDAY", Sat: "SATURDAY", Sun: "SUNDAY" };
function localClock(at: string, timeZone: string): { localDate: string; localTime: string; weekDay: ContextSnapshot["temporal"]["weekDay"] } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(at));
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    const year = get("year"), month = get("month"), day = get("day"), hour = get("hour"), minute = get("minute"), second = get("second"), weekday = get("weekday");
    if (!year || !month || !day || !hour || !minute || !second || !weekday || !weekDayMap[weekday]) throw new Error("parts");
    return { localDate: `${year}-${month}-${day}`, localTime: `${hour}:${minute}:${second}`, weekDay: weekDayMap[weekday] };
  } catch { throw new Error("context_timezone_invalid"); }
}

function placeholderToDimension(dimensionKey: string, value: { readonly state: "KNOWN"; readonly namespace: string; readonly values: readonly string[] } | { readonly state: "UNKNOWN" | "NOT_CONFIGURED"; readonly namespace: string } | undefined, requestHash: string, at: string): ContextDimensionValue {
  if (!value) return missingDimension(dimensionKey, "NOT_CONFIGURED", "client-dimension-not-configured", at);
  if (value.state !== "KNOWN") return missingDimension(dimensionKey, value.state, `client-${value.state.toLowerCase().replace("_", "-")}`, at);
  return explicitDimension(dimensionKey, { kind: "CONCEPT_REFS", registryVersion: value.namespace, conceptIds: [...value.values].sort() }, requestHash);
}

async function weatherDimension(provider: ContextWeatherProviderPort | undefined, authority: ContextAuthorityRecord, policy: ContextPolicy): Promise<ContextDimensionValue> {
  if (!provider) return missingDimension("context.weather.observed", "NOT_AVAILABLE", "weather-provider-not-available", authority.serverTime);
  if (provider.contractVersion !== CONTEXT_KERNEL_VERSIONS.weatherPort) throw new Error("context_weather_port_unknown");
  const raw = await provider.readObservation({ authorizedScope: authority.authorizedLocationScope, at: authority.serverTime });
  if (!raw) return missingDimension("context.weather.observed", "NOT_AVAILABLE", "weather-observation-not-available", authority.serverTime);
  const observation = WeatherObservationSchema.parse(raw); assertContentHash(observation as unknown as Record<string, unknown>, "sourceHash");
  if (observation.geographicScopeHash !== contentHash(authority.authorizedLocationScope)) throw new Error("context_weather_scope_mismatch");
  const age = Math.floor((Date.parse(authority.serverTime) - Date.parse(observation.observedAt)) / 1_000);
  if (Date.parse(observation.validUntil) < Date.parse(authority.serverTime) || age > policy.maximumWeatherAgeSeconds) return missingDimension("context.weather.observed", "NOT_AVAILABLE", "weather-observation-stale", authority.serverTime);
  return serverDimension("context.weather.observed", { kind: "WEATHER_OBSERVATION", conditionRef: observation.conditionRef, observedAt: observation.observedAt, validUntil: observation.validUntil, geographicScopeHash: observation.geographicScopeHash, freshness: "FRESH" }, observation.sourceHash, observation.observedAt, observation.validUntil);
}

function ensureDefinitionCompatibility(value: ContextDimensionValue, definitionValue: ContextDimensionDefinition): void {
  if (!definitionValue.allowedAuthorities.includes(value.authority)) throw new Error(`context_authority_not_allowed:${value.dimensionKey}`);
  if (value.state === "KNOWN" && value.value.kind !== definitionValue.dataType) throw new Error(`context_dimension_type_mismatch:${value.dimensionKey}`);
}

export async function resolveContextKernel(inputValue: unknown, authorityValue: unknown, trustAnchorValue: unknown, registryValue: unknown, policyValue: unknown, options: { readonly weatherProvider?: ContextWeatherProviderPort } = {}): Promise<ContextSnapshot> {
  const client = ContextKernelClientInputSchema.parse(inputValue); const registry = validateContextRegistry(registryValue); const policy = validateContextPolicy(policyValue, registry);
  const authority = validateContextAuthority(authorityValue, trustAnchorValue, registry, policy); const requestHash = contentHash(client.request);
  if (authority.clientLocationInputHash !== contentHash(client.request.location) || authority.locationComparison !== "MATCH") throw new Error("context_location_authority_mismatch");
  if (client.request.location.kind === "city" && client.request.location.city !== authority.authorizedLocationScope.city) throw new Error("context_location_scope_mismatch");
  if (canonicalJson([...client.request.shownCandidateIds].sort()) !== canonicalJson(authority.sessionState.shownCandidateIds) || canonicalJson([...client.request.rejectedCandidateIds].sort()) !== canonicalJson(authority.sessionState.rejectedCandidateIds)) throw new Error("context_session_history_mismatch");
  const ageSeconds = Math.floor((Date.parse(authority.serverTime) - Date.parse(client.request.clientRequestedAt)) / 1_000);
  if (ageSeconds < -policy.maximumClientClockSkewSeconds) throw new Error("context_client_time_ahead");
  if (ageSeconds > policy.maximumOfflineAgeSeconds) throw new Error("context_request_too_old");
  const requestTiming = { state: ageSeconds > policy.maximumClientClockSkewSeconds ? "LATE_WITH_LIMITATION" as const : "CURRENT" as const, ageSeconds: Math.max(0, ageSeconds) };
  const local = localClock(authority.serverTime, authority.timeZone);
  const dimensions = new Map<string, ContextDimensionValue>();
  const set = (value: ContextDimensionValue) => { if (dimensions.has(value.dimensionKey)) throw new Error(`context_duplicate_dimension:${value.dimensionKey}`); dimensions.set(value.dimensionKey, value); };
  const explicitlyExtended = new Set(client.explicitDimensions.map((entry) => entry.dimensionKey));
  set(serverDimension("context.time.server", { kind: "OPAQUE_FIXTURE_KEY", namespace: "context.time.utc", value: authority.serverTime.replace(/\.000Z$/, "Z") }, contentHash({ authorityId: authority.authorityId, serverTime: authority.serverTime }), authority.serverTime));
  const serverTimeHash = dimensions.get("context.time.server")!.dimensionHash;
  set(derivedDimension({ dimensionKey: "context.time.local", value: { kind: "OPAQUE_FIXTURE_KEY", namespace: "context.time.local", value: `${local.localDate}T${local.localTime}@${authority.timeZone}` }, ruleId: "derive-local-time", ruleVersion: "derive-local-time-v1", sourceHashes: [serverTimeHash, contentHash({ timeZone: authority.timeZone })], derivedAt: authority.serverTime }));
  set(serverDimension("context.location.scope", { kind: "OPAQUE_FIXTURE_KEY", namespace: "context.location.authorized-scope", value: `scope.${contentHash(authority.authorizedLocationScope)}` }, contentHash({ authorizedLocationScope: authority.authorizedLocationScope, source: authority.locationSource }), authority.serverTime, authority.expiresAt));
  if (authority.locationPermission === "GRANTED") set(serverDimension("context.location.permission", { kind: "BOOLEAN", value: true }, contentHash({ permission: authority.locationPermission, source: authority.locationSource }), authority.serverTime, authority.expiresAt));
  else set(missingDimension("context.location.permission", authority.locationPermission === "DENIED" ? "DENIED" : "NOT_AVAILABLE", authority.locationPermission === "DENIED" ? "location-permission-denied" : "location-provider-not-available", authority.serverTime));
  if (client.request.intentKeys.length) set(explicitDimension("context.intent.explicit", { kind: "CONCEPT_REFS", registryVersion: "context-intent-fixture-unapproved-v1", conceptIds: [...client.request.intentKeys].sort() }, contentHash({ field: "intentKeys", value: [...client.request.intentKeys].sort() })));
  if (client.request.moodKeys.length) set(explicitDimension("context.mood.current.explicit", { kind: "CONCEPT_REFS", registryVersion: "context-mood-fixture-unapproved-v1", conceptIds: [...client.request.moodKeys].sort() }, contentHash({ field: "moodKeys", value: [...client.request.moodKeys].sort() })));
  if (client.request.socialContext) set(explicitDimension("context.companion.explicit", { kind: "CONCEPT_REFS", registryVersion: "context-companion-fixture-unapproved-v1", conceptIds: [client.request.socialContext] }, contentHash({ field: "socialContext", value: client.request.socialContext })));
  if (client.request.occasion) set(explicitDimension("context.occasion.explicit", { kind: "CONCEPT_REFS", registryVersion: "context-occasion-fixture-unapproved-v1", conceptIds: [client.request.occasion] }, contentHash({ field: "occasion", value: client.request.occasion })));
  if (!explicitlyExtended.has("context.budget.explicit")) set(placeholderToDimension("context.budget.explicit", client.request.budget, contentHash({ field: "budget", value: client.request.budget ?? null }), authority.serverTime));
  if (!explicitlyExtended.has("context.weather.explicit")) set(placeholderToDimension("context.weather.explicit", client.request.weather, contentHash({ field: "weather", value: client.request.weather ?? null }), authority.serverTime));
  if (!explicitlyExtended.has("context.exploration.explicit")) set(placeholderToDimension("context.exploration.explicit", client.request.exploration, contentHash({ field: "exploration", value: client.request.exploration ?? null }), authority.serverTime));
  if (!explicitlyExtended.has("context.available-time.explicit")) set(client.request.availableTime?.state === "UNKNOWN" ? missingDimension("context.available-time.explicit", "UNKNOWN", "client-unknown", authority.serverTime) : missingDimension("context.available-time.explicit", "NOT_CONFIGURED", client.request.availableTime?.state === "KNOWN" ? "legacy-time-bucket-product-semantics-not-configured" : "client-dimension-not-configured", authority.serverTime));
  for (const entry of [...client.explicitDimensions].sort((a, b) => a.dimensionKey.localeCompare(b.dimensionKey))) set(explicitDimension(entry.dimensionKey, entry.value, contentHash(entry)));
  if (client.request.hardConstraints.some((entry) => entry.kind === "open_now" && entry.value)) set(explicitDimension("context.constraint.open-now", { kind: "BOOLEAN", value: true }, contentHash({ field: "openNow", value: true })));
  for (const entry of [...client.hardConstraints].sort((a, b) => a.constraintId.localeCompare(b.constraintId))) {
    const existing = dimensions.get(entry.dimensionKey);
    if (!existing || existing.state !== "KNOWN") dimensions.set(entry.dimensionKey, explicitDimension(entry.dimensionKey, entry.expectedValue, contentHash(entry)));
  }
  set(await weatherDimension(options.weatherProvider, authority, policy));
  set(serverDimension("context.session.state", { kind: "OPAQUE_FIXTURE_KEY", namespace: "context.session.bound-state", value: `session.${authority.sessionState.stateHash}` }, authority.sessionState.stateHash, authority.serverTime));
  for (const definitionValue of registry.definitions) if (!dimensions.has(definitionValue.dimensionKey)) set(missingDimension(definitionValue.dimensionKey, definitionValue.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "UNKNOWN", definitionValue.status === "NOT_CONFIGURED" ? "product-semantics-not-configured" : "value-not-known", authority.serverTime));
  const definitions = new Map(registry.definitions.map((item) => [item.dimensionKey, item]));
  for (const preference of client.softPreferences) if (!definitions.has(preference.dimensionKey)) throw new Error(`context_soft_preference_not_registered:${preference.dimensionKey}`);
  for (const value of dimensions.values()) { const definitionValue = definitions.get(value.dimensionKey); if (!definitionValue) throw new Error(`context_dimension_not_registered:${value.dimensionKey}`); ensureDefinitionCompatibility(value, definitionValue); if (registry.fixtureOnly && value.dimensionKey === "context.companion.explicit" && value.state === "KNOWN" && value.value.kind === "CONCEPT_REFS" && value.value.conceptIds.some((item) => !item.startsWith("fixture.companion."))) throw new Error("context_companion_identity_forbidden"); }
  const requestHard = [...client.hardConstraints];
  for (const constraint of client.request.hardConstraints) if (constraint.kind === "open_now" && constraint.value) requestHard.push({ constraintId: "request-open-now", dimensionKey: "context.constraint.open-now", operator: "REQUIRE_TRUE", expectedValue: { kind: "BOOLEAN", value: true } });
  if (requestHard.some((entry) => !dimensions.has(entry.dimensionKey))) for (const entry of requestHard.filter((item) => !dimensions.has(item.dimensionKey))) set(explicitDimension(entry.dimensionKey, entry.expectedValue, requestHash));
  const hardConstraints = requestHard.sort((a, b) => a.constraintId.localeCompare(b.constraintId)).map((entry) => {
    const policyEntry = policy.constraintPolicies.find((candidate) => candidate.dimensionKey === entry.dimensionKey && candidate.operator === entry.operator);
    const body = { constraintId: entry.constraintId, kind: "HARD" as const, dimensionKey: entry.dimensionKey, operator: entry.operator, expectedValue: entry.expectedValue, sourceDimensionHash: dimensions.get(entry.dimensionKey)!.dimensionHash, policyId: policyEntry?.policyId ?? null, policyVersion: policy.policyVersion, unknownPolicy: policyEntry?.unknownPolicy ?? "NOT_CONFIGURED" as const, status: policyEntry ? "ACTIVE_FIXTURE" as const : "NOT_CONFIGURED" as const };
    return BoundHardConstraintSchema.parse(withContentHash(body, "constraintHash"));
  });
  const softPreferences = [...client.softPreferences].sort((a, b) => a.preferenceId.localeCompare(b.preferenceId)).map((entry) => BoundSoftPreferenceSchema.parse(withContentHash({ preferenceId: entry.preferenceId, kind: "SOFT" as const, dimensionKey: entry.dimensionKey, preferredValue: entry.preferredValue, sourceDimensionHash: dimensions.get(entry.dimensionKey)?.dimensionHash ?? contentHash({ dimensionKey: entry.dimensionKey, state: "NOT_CONFIGURED" }), eligibilityAuthority: false as const, productSemantics: "NOT_CONFIGURED" as const }, "preferenceHash")));
  const limitations = ["context-product-taxonomies-not-configured", "context-ranking-semantics-not-configured", ...(requestTiming.state === "LATE_WITH_LIMITATION" ? ["late-client-request"] : []), ...(hardConstraints.some((entry) => entry.status === "NOT_CONFIGURED") ? ["constraint-policy-not-configured"] : [])].sort();
  const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.snapshot, registryBinding: { registryVersion: registry.registryVersion, registryHash: registry.registryHash }, policyBinding: { policyVersion: policy.policyVersion, policyHash: policy.policyHash }, authorityBinding: { authorityId: authority.authorityId, authorityHash: authority.authorityHash }, decisionId: authority.decisionId, sessionId: authority.sessionId, actorSubjectBindingHash: authority.actorSubjectBindingHash, resolvedAt: authority.serverTime, requestHash, temporal: { serverTime: authority.serverTime, ...local, timeZone: authority.timeZone, requestTiming }, location: { clientInputHash: authority.clientLocationInputHash, clientRepresentation: client.request.location.kind === "city" ? "CITY" as const : "PRECISE_COORDINATE_MINIMIZED" as const, authorizedScope: authority.authorizedLocationScope, comparison: "MATCH" as const, permission: authority.locationPermission, source: authority.locationSource, rawCoordinatesPersisted: false as const }, dimensions: [...dimensions.values()].sort((a, b) => a.dimensionKey.localeCompare(b.dimensionKey)), hardConstraints, softPreferences, sessionState: authority.sessionState, sourceBindings: { worldSnapshotBindingHash: authority.worldSnapshotBindingHash, userProjectionBindingHash: authority.userProjectionBindingHash, candidatePoolBindingHash: authority.candidatePoolBindingHash, eligibilityPolicyBindingHash: authority.eligibilityPolicyBindingHash, degradationPolicyBindingHash: authority.degradationPolicyBindingHash }, limitations, exclusions: [], privacy: { rawLocationPersisted: false as const, companionIdentityAllowed: false as const, freeTextPersisted: false as const, retention: "RUN_SCOPED_FIXTURE" as const, exportRequiredIfPersisted: true as const, deletionRequiredIfPersisted: true as const }, writesWorldState: false as const, writesUserIntelligence: false as const, commercialInfluence: "FORBIDDEN" as const };
  const snapshot = deepFreeze(ContextSnapshotSchema.parse(withContentHash(body, "contextHash"))) as ContextSnapshot;
  validateContextSnapshotIntegrity(snapshot, authority, trustAnchorValue, registry, policy, client);
  return snapshot;
}

function expectedExplicitClaims(client: ContextKernelClientInput): Map<string, { readonly sourceHash: string; readonly value: ContextTypedValue }> {
  const claims = new Map<string, { readonly sourceHash: string; readonly value: ContextTypedValue }>();
  const add = (dimensionKey: string, value: ContextTypedValue, sourceHash: string) => { if (claims.has(dimensionKey)) throw new Error(`context_duplicate_explicit_claim:${dimensionKey}`); claims.set(dimensionKey, { value, sourceHash }); };
  if (client.request.intentKeys.length) add("context.intent.explicit", { kind: "CONCEPT_REFS", registryVersion: "context-intent-fixture-unapproved-v1", conceptIds: [...client.request.intentKeys].sort() }, contentHash({ field: "intentKeys", value: [...client.request.intentKeys].sort() }));
  if (client.request.moodKeys.length) add("context.mood.current.explicit", { kind: "CONCEPT_REFS", registryVersion: "context-mood-fixture-unapproved-v1", conceptIds: [...client.request.moodKeys].sort() }, contentHash({ field: "moodKeys", value: [...client.request.moodKeys].sort() }));
  if (client.request.socialContext) add("context.companion.explicit", { kind: "CONCEPT_REFS", registryVersion: "context-companion-fixture-unapproved-v1", conceptIds: [client.request.socialContext] }, contentHash({ field: "socialContext", value: client.request.socialContext }));
  if (client.request.occasion) add("context.occasion.explicit", { kind: "CONCEPT_REFS", registryVersion: "context-occasion-fixture-unapproved-v1", conceptIds: [client.request.occasion] }, contentHash({ field: "occasion", value: client.request.occasion }));
  for (const [dimensionKey, field, value] of [["context.budget.explicit", "budget", client.request.budget], ["context.weather.explicit", "weather", client.request.weather], ["context.exploration.explicit", "exploration", client.request.exploration]] as const) if (value?.state === "KNOWN") add(dimensionKey, { kind: "CONCEPT_REFS", registryVersion: value.namespace, conceptIds: [...value.values].sort() }, contentHash({ field, value }));
  for (const entry of [...client.explicitDimensions].sort((a, b) => a.dimensionKey.localeCompare(b.dimensionKey))) { if (claims.has(entry.dimensionKey)) claims.delete(entry.dimensionKey); add(entry.dimensionKey, entry.value, contentHash(entry)); }
  if (client.request.hardConstraints.some((entry) => entry.kind === "open_now" && entry.value)) add("context.constraint.open-now", { kind: "BOOLEAN", value: true }, contentHash({ field: "openNow", value: true }));
  for (const entry of client.hardConstraints) if (!claims.has(entry.dimensionKey)) add(entry.dimensionKey, entry.expectedValue, contentHash(entry));
  return claims;
}

export function validateContextSnapshotIntegrity(snapshotValue: unknown, authorityValue: unknown, trustAnchorValue: unknown, registryValue: unknown, policyValue: unknown, clientValue: unknown): ContextSnapshot {
  const snapshot = ContextSnapshotSchema.parse(snapshotValue); const client = ContextKernelClientInputSchema.parse(clientValue); const registry = validateContextRegistry(registryValue); const policy = validateContextPolicy(policyValue, registry); const authority = validateContextAuthority(authorityValue, trustAnchorValue, registry, policy);
  assertContentHash(snapshot as unknown as Record<string, unknown>, "contextHash");
  if (snapshot.registryBinding.registryVersion !== registry.registryVersion || snapshot.registryBinding.registryHash !== registry.registryHash || snapshot.policyBinding.policyVersion !== policy.policyVersion || snapshot.policyBinding.policyHash !== policy.policyHash || snapshot.authorityBinding.authorityHash !== authority.authorityHash || snapshot.authorityBinding.authorityId !== authority.authorityId) throw new Error("context_snapshot_authority_binding_mismatch");
  if (snapshot.decisionId !== authority.decisionId || snapshot.sessionId !== authority.sessionId || snapshot.actorSubjectBindingHash !== authority.actorSubjectBindingHash || snapshot.requestHash !== contentHash(client.request) || snapshot.resolvedAt !== authority.serverTime) throw new Error("context_snapshot_identity_mismatch");
  const expectedClientRepresentation = client.request.location.kind === "city" ? "CITY" : "PRECISE_COORDINATE_MINIMIZED";
  if (snapshot.location.clientInputHash !== contentHash(client.request.location) || canonicalJson(snapshot.location.authorizedScope) !== canonicalJson(authority.authorizedLocationScope) || snapshot.location.clientRepresentation !== expectedClientRepresentation || snapshot.location.comparison !== authority.locationComparison || snapshot.location.permission !== authority.locationPermission || snapshot.location.source !== authority.locationSource || snapshot.location.rawCoordinatesPersisted) throw new Error("context_snapshot_location_binding_mismatch");
  const ageSeconds = Math.floor((Date.parse(authority.serverTime) - Date.parse(client.request.clientRequestedAt)) / 1_000);
  const expectedRequestTiming = { state: ageSeconds > policy.maximumClientClockSkewSeconds ? "LATE_WITH_LIMITATION" as const : "CURRENT" as const, ageSeconds: Math.max(0, ageSeconds) };
  const expectedLocal = localClock(authority.serverTime, authority.timeZone); if (snapshot.temporal.serverTime !== authority.serverTime || snapshot.temporal.timeZone !== authority.timeZone || snapshot.temporal.localDate !== expectedLocal.localDate || snapshot.temporal.localTime !== expectedLocal.localTime || snapshot.temporal.weekDay !== expectedLocal.weekDay || canonicalJson(snapshot.temporal.requestTiming) !== canonicalJson(expectedRequestTiming)) throw new Error("context_snapshot_temporal_binding_mismatch");
  validateSessionState(snapshot.sessionState); if (canonicalJson(snapshot.sessionState) !== canonicalJson(authority.sessionState)) throw new Error("context_snapshot_session_binding_mismatch");
  if (snapshot.sourceBindings.worldSnapshotBindingHash !== authority.worldSnapshotBindingHash || snapshot.sourceBindings.userProjectionBindingHash !== authority.userProjectionBindingHash || snapshot.sourceBindings.candidatePoolBindingHash !== authority.candidatePoolBindingHash || snapshot.sourceBindings.eligibilityPolicyBindingHash !== authority.eligibilityPolicyBindingHash || snapshot.sourceBindings.degradationPolicyBindingHash !== authority.degradationPolicyBindingHash) throw new Error("context_snapshot_source_binding_mismatch");
  if (snapshot.writesUserIntelligence || snapshot.writesWorldState || snapshot.commercialInfluence !== "FORBIDDEN") throw new Error("context_snapshot_domain_boundary_violation");
  if (snapshot.dimensions.length !== registry.definitions.length || new Set(snapshot.dimensions.map((item) => item.dimensionKey)).size !== snapshot.dimensions.length || canonicalJson(snapshot.dimensions.map((item) => item.dimensionKey)) !== canonicalJson(snapshot.dimensions.map((item) => item.dimensionKey).sort())) throw new Error("context_snapshot_dimension_identity_invalid");
  const definitions = new Map(registry.definitions.map((item) => [item.dimensionKey, item]));
  const expectedClaims = expectedExplicitClaims(client);
  const expectedMissing = new Map<string, { readonly state: "UNKNOWN" | "NOT_CONFIGURED" | "NOT_AVAILABLE" | "DENIED"; readonly reasonCode: string }>();
  const placeholderMissing = (dimensionKey: string, value: { readonly state: "KNOWN" | "UNKNOWN" | "NOT_CONFIGURED" } | undefined) => {
    if (expectedClaims.has(dimensionKey)) return;
    if (!value) expectedMissing.set(dimensionKey, { state: "NOT_CONFIGURED", reasonCode: "client-dimension-not-configured" });
    else if (value.state !== "KNOWN") expectedMissing.set(dimensionKey, { state: value.state, reasonCode: `client-${value.state.toLowerCase().replace("_", "-")}` });
  };
  placeholderMissing("context.budget.explicit", client.request.budget);
  placeholderMissing("context.weather.explicit", client.request.weather);
  placeholderMissing("context.exploration.explicit", client.request.exploration);
  if (!expectedClaims.has("context.available-time.explicit")) expectedMissing.set("context.available-time.explicit", client.request.availableTime?.state === "UNKNOWN" ? { state: "UNKNOWN", reasonCode: "client-unknown" } : { state: "NOT_CONFIGURED", reasonCode: client.request.availableTime?.state === "KNOWN" ? "legacy-time-bucket-product-semantics-not-configured" : "client-dimension-not-configured" });
  for (const definitionValue of registry.definitions) {
    if (expectedClaims.has(definitionValue.dimensionKey) || expectedMissing.has(definitionValue.dimensionKey) || ["context.time.server", "context.time.local", "context.location.scope", "context.location.permission", "context.weather.observed", "context.session.state"].includes(definitionValue.dimensionKey)) continue;
    expectedMissing.set(definitionValue.dimensionKey, definitionValue.status === "NOT_CONFIGURED" ? { state: "NOT_CONFIGURED", reasonCode: "product-semantics-not-configured" } : { state: "UNKNOWN", reasonCode: "value-not-known" });
  }
  for (const dimension of snapshot.dimensions) {
    assertContentHash(dimension as unknown as Record<string, unknown>, "dimensionHash"); const definitionValue = definitions.get(dimension.dimensionKey); if (!definitionValue) throw new Error("context_snapshot_unregistered_dimension"); ensureDefinitionCompatibility(dimension, definitionValue); if (registry.fixtureOnly && dimension.dimensionKey === "context.companion.explicit" && dimension.state === "KNOWN" && dimension.value.kind === "CONCEPT_REFS" && dimension.value.conceptIds.some((item) => !item.startsWith("fixture.companion."))) throw new Error("context_companion_identity_forbidden");
    if (dimension.authority === "DERIVED") { const proofBody = { dimensionKey: dimension.dimensionKey, value: dimension.value, ruleId: dimension.ruleId, ruleVersion: dimension.ruleVersion, sourceHashes: [...dimension.sourceHashes].sort(), derivedAt: dimension.derivedAt, limitations: [...dimension.limitations].sort() }; if (dimension.sourceHashes.length === 0 || contentHash(proofBody) !== dimension.proofHash || !policy.acceptedDerivedRules.some((item) => item.ruleId === dimension.ruleId && item.ruleVersion === dimension.ruleVersion)) throw new Error("context_derived_proof_invalid"); }
    if (dimension.authority === "EXPLICIT") { const expected = expectedClaims.get(dimension.dimensionKey); if (!expected || dimension.sourceHash !== expected.sourceHash || canonicalJson(dimension.value) !== canonicalJson(expected.value)) throw new Error("context_explicit_claim_binding_mismatch"); }
    const missing = expectedMissing.get(dimension.dimensionKey); if (missing && (dimension.state !== missing.state || dimension.authority !== missing.state || dimension.reasonCode !== missing.reasonCode || dimension.consideredAt !== authority.serverTime)) throw new Error("context_missing_dimension_binding_mismatch");
  }
  for (const dimensionKey of expectedClaims.keys()) if (!snapshot.dimensions.some((item) => item.dimensionKey === dimensionKey && item.authority === "EXPLICIT")) throw new Error("context_explicit_claim_missing");
  const serverTime = snapshot.dimensions.find((item) => item.dimensionKey === "context.time.server"); const localTime = snapshot.dimensions.find((item) => item.dimensionKey === "context.time.local"); const location = snapshot.dimensions.find((item) => item.dimensionKey === "context.location.scope"); const permission = snapshot.dimensions.find((item) => item.dimensionKey === "context.location.permission"); const session = snapshot.dimensions.find((item) => item.dimensionKey === "context.session.state"); const weather = snapshot.dimensions.find((item) => item.dimensionKey === "context.weather.observed");
  const expectedServerTimeValue = { kind: "OPAQUE_FIXTURE_KEY", namespace: "context.time.utc", value: authority.serverTime.replace(/\.000Z$/, "Z") }; const expectedLocationValue = { kind: "OPAQUE_FIXTURE_KEY", namespace: "context.location.authorized-scope", value: `scope.${contentHash(authority.authorizedLocationScope)}` }; const expectedSessionValue = { kind: "OPAQUE_FIXTURE_KEY", namespace: "context.session.bound-state", value: `session.${authority.sessionState.stateHash}` };
  if (!serverTime || serverTime.authority !== "SERVER_AUTHORIZED" || canonicalJson(serverTime.value) !== canonicalJson(expectedServerTimeValue) || serverTime.sourceHash !== contentHash({ authorityId: authority.authorityId, serverTime: authority.serverTime })) throw new Error("context_server_time_dimension_mismatch");
  const expectedLocalValue = { kind: "OPAQUE_FIXTURE_KEY", namespace: "context.time.local", value: `${expectedLocal.localDate}T${expectedLocal.localTime}@${authority.timeZone}` };
  const expectedLocalSources = [serverTime.dimensionHash, contentHash({ timeZone: authority.timeZone })].sort();
  if (!localTime || localTime.authority !== "DERIVED" || canonicalJson(localTime.value) !== canonicalJson(expectedLocalValue) || localTime.ruleId !== "derive-local-time" || localTime.ruleVersion !== "derive-local-time-v1" || localTime.derivedAt !== authority.serverTime || canonicalJson([...localTime.sourceHashes].sort()) !== canonicalJson(expectedLocalSources)) throw new Error("context_local_time_dimension_mismatch");
  if (!location || location.authority !== "SERVER_AUTHORIZED" || canonicalJson(location.value) !== canonicalJson(expectedLocationValue) || location.sourceHash !== contentHash({ authorizedLocationScope: authority.authorizedLocationScope, source: authority.locationSource })) throw new Error("context_location_dimension_mismatch");
  if (authority.locationPermission === "GRANTED") { if (!permission || permission.authority !== "SERVER_AUTHORIZED" || permission.value.kind !== "BOOLEAN" || !permission.value.value || permission.sourceHash !== contentHash({ permission: authority.locationPermission, source: authority.locationSource })) throw new Error("context_permission_dimension_mismatch"); } else { const expectedAuthority = authority.locationPermission === "DENIED" ? "DENIED" : "NOT_AVAILABLE"; const expectedReason = authority.locationPermission === "DENIED" ? "location-permission-denied" : "location-provider-not-available"; if (!permission || permission.authority !== expectedAuthority || permission.reasonCode !== expectedReason || permission.consideredAt !== authority.serverTime) throw new Error("context_permission_dimension_mismatch"); }
  if (!session || session.authority !== "SERVER_AUTHORIZED" || canonicalJson(session.value) !== canonicalJson(expectedSessionValue) || session.sourceHash !== authority.sessionState.stateHash) throw new Error("context_session_dimension_mismatch");
  const weatherBinding = authority.weatherObservationBinding;
  if (!weatherBinding) { if (weather?.authority === "SERVER_AUTHORIZED") throw new Error("context_weather_authority_binding_mismatch"); }
  else {
    const stale = Date.parse(weatherBinding.validUntil) < Date.parse(authority.serverTime) || Math.floor((Date.parse(authority.serverTime) - Date.parse(weatherBinding.observedAt)) / 1_000) > policy.maximumWeatherAgeSeconds;
    if (stale) { if (!weather || weather.authority !== "NOT_AVAILABLE" || weather.reasonCode !== "weather-observation-stale") throw new Error("context_weather_authority_binding_mismatch"); }
    else if (!weather || weather.authority !== "SERVER_AUTHORIZED" || weather.sourceHash !== weatherBinding.sourceHash || weather.value.kind !== "WEATHER_OBSERVATION" || weather.value.conditionRef !== weatherBinding.conditionRef || weather.value.observedAt !== weatherBinding.observedAt || weather.value.validUntil !== weatherBinding.validUntil || weather.value.geographicScopeHash !== weatherBinding.geographicScopeHash) throw new Error("context_weather_authority_binding_mismatch");
  }
  if (new Set(snapshot.hardConstraints.map((item) => item.constraintId)).size !== snapshot.hardConstraints.length || new Set(snapshot.softPreferences.map((item) => item.preferenceId)).size !== snapshot.softPreferences.length) throw new Error("context_constraint_identity_duplicate");
  for (const constraint of snapshot.hardConstraints) { assertContentHash(constraint as unknown as Record<string, unknown>, "constraintHash"); const source = snapshot.dimensions.find((item) => item.dimensionKey === constraint.dimensionKey); if (!source || source.dimensionHash !== constraint.sourceDimensionHash) throw new Error("context_constraint_source_mismatch"); const bound = policy.constraintPolicies.find((item) => item.policyId === constraint.policyId); if (constraint.status === "ACTIVE_FIXTURE" && (!bound || bound.unknownPolicy !== constraint.unknownPolicy || constraint.policyVersion !== policy.policyVersion)) throw new Error("context_constraint_policy_mismatch"); if (constraint.status === "NOT_CONFIGURED" && (constraint.policyId !== null || constraint.unknownPolicy !== "NOT_CONFIGURED")) throw new Error("context_constraint_unconfigured_mismatch"); }
  for (const preference of snapshot.softPreferences) { assertContentHash(preference as unknown as Record<string, unknown>, "preferenceHash"); if (preference.eligibilityAuthority) throw new Error("soft_preference_has_eligibility_authority"); const source = snapshot.dimensions.find((item) => item.dimensionKey === preference.dimensionKey); const expectedSourceHash = source?.dimensionHash ?? contentHash({ dimensionKey: preference.dimensionKey, state: "NOT_CONFIGURED" }); if (preference.sourceDimensionHash !== expectedSourceHash) throw new Error("context_soft_preference_source_mismatch"); }
  const expectedHard = [...client.hardConstraints, ...client.request.hardConstraints.filter((item) => item.kind === "open_now" && item.value).map(() => ({ constraintId: "request-open-now", dimensionKey: "context.constraint.open-now", operator: "REQUIRE_TRUE" as const, expectedValue: { kind: "BOOLEAN" as const, value: true } }))].sort((a, b) => a.constraintId.localeCompare(b.constraintId));
  if (canonicalJson(expectedHard.map((item) => item.constraintId)) !== canonicalJson(snapshot.hardConstraints.map((item) => item.constraintId))) throw new Error("context_hard_constraint_set_mismatch");
  for (const expected of expectedHard) { const actual = snapshot.hardConstraints.find((item) => item.constraintId === expected.constraintId); if (!actual || actual.dimensionKey !== expected.dimensionKey || actual.operator !== expected.operator || canonicalJson(actual.expectedValue) !== canonicalJson(expected.expectedValue)) throw new Error("context_hard_constraint_binding_mismatch"); }
  if (canonicalJson([...client.softPreferences].sort((a, b) => a.preferenceId.localeCompare(b.preferenceId)).map((item) => item.preferenceId)) !== canonicalJson(snapshot.softPreferences.map((item) => item.preferenceId))) throw new Error("context_soft_preference_set_mismatch");
  for (const expected of client.softPreferences) { const actual = snapshot.softPreferences.find((item) => item.preferenceId === expected.preferenceId); if (!actual || actual.dimensionKey !== expected.dimensionKey || canonicalJson(actual.preferredValue) !== canonicalJson(expected.preferredValue)) throw new Error("context_soft_preference_binding_mismatch"); }
  const expectedLimitations = ["context-product-taxonomies-not-configured", "context-ranking-semantics-not-configured", ...(expectedRequestTiming.state === "LATE_WITH_LIMITATION" ? ["late-client-request"] : []), ...(snapshot.hardConstraints.some((entry) => entry.status === "NOT_CONFIGURED") ? ["constraint-policy-not-configured"] : [])].sort();
  if (canonicalJson(snapshot.limitations) !== canonicalJson(expectedLimitations) || snapshot.exclusions.length !== 0) throw new Error("context_snapshot_limitation_binding_mismatch");
  return snapshot;
}

export function createContextExecutionEnvelope(snapshotValue: unknown, authorityValue: unknown, trustAnchorValue: unknown, registryValue: unknown, policyValue: unknown, clientValue: unknown): ContextExecutionEnvelope {
  const client = ContextKernelClientInputSchema.parse(clientValue); const registry = validateContextRegistry(registryValue); const policy = validateContextPolicy(policyValue, registry); const authority = validateContextAuthority(authorityValue, trustAnchorValue, registry, policy); const snapshot = validateContextSnapshotIntegrity(snapshotValue, authority, trustAnchorValue, registry, policy, client);
  const body = { contractVersion: CONTEXT_KERNEL_VERSIONS.executionEnvelope, authority, clientInputHash: contentHash(client), registryBinding: snapshot.registryBinding, policyBinding: snapshot.policyBinding, contextSnapshot: snapshot, worldSnapshotBindingHash: authority.worldSnapshotBindingHash, userProjectionBindingHash: authority.userProjectionBindingHash, candidatePoolBindingHash: authority.candidatePoolBindingHash, eligibilityPolicyBindingHash: authority.eligibilityPolicyBindingHash, degradationPolicyBindingHash: authority.degradationPolicyBindingHash, eligibilityPolicyAuthority: false as const, rankingAuthority: false as const, writesWorldState: false as const, writesUserIntelligence: false as const, commercialInfluence: "FORBIDDEN" as const };
  return deepFreeze(ContextExecutionEnvelopeSchema.parse(withContentHash(body, "envelopeHash"))) as ContextExecutionEnvelope;
}

export function validateContextExecutionEnvelope(envelopeValue: unknown, trustAnchorValue: unknown, registryValue: unknown, policyValue: unknown, clientValue: unknown): ContextExecutionEnvelope {
  const envelope = ContextExecutionEnvelopeSchema.parse(envelopeValue); const client = ContextKernelClientInputSchema.parse(clientValue); assertContentHash(envelope as unknown as Record<string, unknown>, "envelopeHash");
  const snapshot = validateContextSnapshotIntegrity(envelope.contextSnapshot, envelope.authority, trustAnchorValue, registryValue, policyValue, client);
  if (envelope.clientInputHash !== contentHash(client) || envelope.registryBinding.registryHash !== snapshot.registryBinding.registryHash || envelope.policyBinding.policyHash !== snapshot.policyBinding.policyHash || envelope.worldSnapshotBindingHash !== snapshot.sourceBindings.worldSnapshotBindingHash || envelope.userProjectionBindingHash !== snapshot.sourceBindings.userProjectionBindingHash || envelope.candidatePoolBindingHash !== snapshot.sourceBindings.candidatePoolBindingHash || envelope.eligibilityPolicyBindingHash !== snapshot.sourceBindings.eligibilityPolicyBindingHash || envelope.degradationPolicyBindingHash !== snapshot.sourceBindings.degradationPolicyBindingHash || envelope.eligibilityPolicyAuthority || envelope.rankingAuthority || envelope.writesUserIntelligence || envelope.writesWorldState || envelope.commercialInfluence !== "FORBIDDEN") throw new Error("context_execution_envelope_binding_mismatch");
  return envelope;
}

export function projectContextForConsumer(snapshotValue: unknown, registryValue: unknown, consumer: "ELIGIBILITY" | "RANKING" | "EXPLANATION" | "EVALUATION"): readonly ContextDimensionValue[] {
  const snapshot = ContextSnapshotSchema.parse(snapshotValue); const registry = validateContextRegistry(registryValue); const allowed = new Set(registry.definitions.filter((item) => item.allowedConsumers.includes(consumer)).map((item) => item.dimensionKey));
  return deepFreeze(snapshot.dimensions.filter((item) => allowed.has(item.dimensionKey)));
}

export function unknownConstraintDisposition(constraint: BoundHardConstraint): "EXCLUDE" | "ALLOW_WITH_LIMITATION" | "CLARIFY" | "NOT_CONFIGURED" | "FAIL_CLOSED" {
  return ({ EXCLUDE_IF_UNKNOWN: "EXCLUDE", ALLOW_WITH_LIMITATION: "ALLOW_WITH_LIMITATION", REQUIRE_USER_CLARIFICATION: "CLARIFY", NOT_CONFIGURED: "NOT_CONFIGURED", FAIL_CLOSED: "FAIL_CLOSED" } as const)[constraint.unknownPolicy];
}

export function contextExecutionIdentity(snapshot: ContextSnapshot): string {
  return contentHash({ decisionId: snapshot.decisionId, sessionId: snapshot.sessionId, actorSubjectBindingHash: snapshot.actorSubjectBindingHash, contextHash: snapshot.contextHash, worldSnapshotBindingHash: snapshot.sourceBindings.worldSnapshotBindingHash, userProjectionBindingHash: snapshot.sourceBindings.userProjectionBindingHash, candidatePoolBindingHash: snapshot.sourceBindings.candidatePoolBindingHash, eligibilityPolicyBindingHash: snapshot.sourceBindings.eligibilityPolicyBindingHash, degradationPolicyBindingHash: snapshot.sourceBindings.degradationPolicyBindingHash });
}

export function assertNoClientAuthority(input: unknown): ContextKernelClientInput {
  return ContextKernelClientInputSchema.parse(input);
}

export function contextAuthorityClasses(): readonly string[] { return CONTEXT_AUTHORITIES; }
