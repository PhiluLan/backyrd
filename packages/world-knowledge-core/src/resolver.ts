import { canonicalJson, canonicalSort, hashBody } from "./canonical.js";
import {
  FRESHNESS_STATES, parseAttributeValue, parseClaim, RESOLUTION_CONTRACT_VERSION, RESOLUTION_STATES, SOURCE_TYPES, TRUST_STATES,
  type ClaimValue, type FreshnessState, type ResolutionState, type TrustState, type WorldKnowledgeClaim,
} from "./contracts.js";
import { getAttributeDefinition, REGISTRY_VERSION, type AttributeDefinition } from "./registry.js";
import { array, ContractValidationError, enumValue, hash, identifier, object, required, string, timestamp } from "./schema.js";
import { evaluateClaimSource, parseClaimSourceAssessment, parseSourcePolicy, UNCONFIGURED_SOURCE_POLICY, type ClaimSourceAssessment, type SourcePolicy } from "./source-policy.js";
import { parseVerificationRecord, verifiedClaimIds, type AcceptedVerificationContext, type VerificationRecord } from "./verification.js";

export interface ResolvedKnowledge {
  readonly contractVersion: typeof RESOLUTION_CONTRACT_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly attributeKey: string;
  readonly scope: { readonly spotId: string; readonly area: string };
  readonly resolution: ResolutionState;
  readonly freshness: FreshnessState;
  readonly trust: TrustState;
  readonly value: ClaimValue | readonly ClaimValue[];
  readonly claimRefs: readonly string[];
  readonly sourceTypes: readonly string[];
  readonly sourceAssessmentHashes: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly resolutionHash: string;
}

export interface KnowledgeConflict {
  readonly code: string;
  readonly severity: "INFO" | "WARNING" | "BLOCKING";
  readonly attributeKeys: readonly string[];
  readonly claimRefs: readonly string[];
  readonly explanation: string;
}

export interface ResolutionResult {
  readonly contractVersion: typeof RESOLUTION_CONTRACT_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly asOf: string;
  readonly resolved: readonly ResolvedKnowledge[];
  readonly conflicts: readonly KnowledgeConflict[];
  readonly history: readonly WorldKnowledgeClaim[];
  readonly sourcePolicy: SourcePolicy;
  readonly sourceAssessments: readonly ClaimSourceAssessment[];
  readonly verificationRecords: readonly VerificationRecord[];
  readonly resultHash: string;
}

export interface ResolutionRequest {
  readonly contractVersion: typeof RESOLUTION_CONTRACT_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly asOf: string;
  readonly claims: readonly WorldKnowledgeClaim[];
  readonly sourcePolicy: SourcePolicy;
  readonly verificationRecords: readonly VerificationRecord[];
}

export const RESOLUTION_REASON_CODES = ["OVERLAPPING_CONTRADICTORY_CLAIMS", "EXPLICIT_UNKNOWN", "CONSISTENT_ACTIVE_CLAIMS", "VALIDITY_WINDOW_ENDED_LAST_KNOWN_RETAINED", "CURRENT_STATE_VALIDITY_ENDED", "CURRENT_STATE_MISSING_VALID_UNTIL"] as const;
export const KNOWLEDGE_CONFLICT_CODES = ["OVERLAPPING_CONTRADICTORY_CLAIMS", "OVERLAPPING_CLAIMS_IN_HISTORY", "CAPACITY_COMPONENTS_EXCEED_TOTAL", "GROUP_RANGE_EXCEEDS_TOTAL_CAPACITY", "RESERVATION_THRESHOLD_OUTSIDE_SUPPORTED_GROUP_RANGE", "TAKEAWAY_EXCLUDED_BUT_OFFERED", "OUTDOOR_AREA_TEMPORARILY_UNAVAILABLE", "KITCHEN_OPEN_WHILE_VENUE_CLOSED", "KITCHEN_HOURS_OUTSIDE_VENUE_HOURS", "UNUSUAL_CATEGORY_PLACE_TYPE_COMBINATION", "CURRENT_STATE_MISSING_VALID_UNTIL"] as const;

const stateValue = (claim: WorldKnowledgeClaim): string => `${claim.knowledgeState}:${JSON.stringify(claim.value)}`;
const end = (claim: WorldKnowledgeClaim) => claim.validUntil ?? "9999-12-31T23:59:59.999Z";
const start = (claim: WorldKnowledgeClaim) => claim.validFrom ?? "0000-01-01T00:00:00.000Z";
const overlaps = (left: WorldKnowledgeClaim, right: WorldKnowledgeClaim) => start(left) <= end(right) && start(right) <= end(left);
const isAt = (claim: WorldKnowledgeClaim, asOf: string) => start(claim) <= asOf && asOf <= end(claim);

function freshnessFor(claim: WorldKnowledgeClaim, definition: AttributeDefinition, asOf: string): FreshnessState {
  if (!claim.validUntil || claim.validUntil >= asOf) return "CURRENT";
  return definition.expiryBehavior === "EXPIRES_AT_VALID_UNTIL" ? "EXPIRED" : "STALE";
}

function trustFor(claims: readonly WorldKnowledgeClaim[], assessments: ReadonlyMap<string, ClaimSourceAssessment>, conflicting = false): TrustState {
  if (conflicting) return "CONFLICTING";
  if (claims.some((claim) => assessments.get(claim.claimId)?.trust === "VERIFIED")) return "VERIFIED";
  if (claims.some((claim) => assessments.get(claim.claimId)?.trust === "REFERENCED")) return "REFERENCED";
  return "ASSERTED";
}

function resolvedHash(value: Omit<ResolvedKnowledge, "resolutionHash">): ResolvedKnowledge {
  return { ...value, resolutionHash: hashBody(value, []) };
}

function latest(claims: readonly WorldKnowledgeClaim[]): WorldKnowledgeClaim {
  const sorted = [...claims].sort((left, right) => right.observedAt.localeCompare(left.observedAt) || right.claimId.localeCompare(left.claimId));
  const value = sorted[0]; if (!value) throw new Error("latest_claim_missing"); return value;
}

function resolveGroup(claims: readonly WorldKnowledgeClaim[], asOf: string, assessments: ReadonlyMap<string, ClaimSourceAssessment>): ResolvedKnowledge {
  const first = claims[0]; if (!first) throw new Error("empty_claim_group"); const definition = getAttributeDefinition(first.attributeKey);
  const current = claims.filter((claim) => isAt(claim, asOf));
  const fallback = current.length ? current : claims.filter((claim) => claim.validUntil !== null && claim.validUntil < asOf);
  const considered = fallback.length ? fallback : claims;
  const known = considered.filter((claim) => claim.knowledgeState !== "UNKNOWN");
  const contradiction = considered.some((claim) => claim.stance === "CONTRADICTS");
  const distinct = new Set(known.map(stateValue));
  const disputed = contradiction || distinct.size > 1;
  const selected = latest(known.length ? known : considered);
  const freshness = current.length ? "CURRENT" : freshnessFor(selected, definition, asOf);
  const resolution: ResolutionState = disputed ? "DISPUTED" : known.length ? selected.knowledgeState : "UNKNOWN";
  const value: ClaimValue | readonly ClaimValue[] = disputed ? canonicalSort(known.map((claim) => claim.value), (item) => JSON.stringify(item)) : resolution === "UNKNOWN" ? null : selected.value;
  const reasonCodes = [
    disputed ? "OVERLAPPING_CONTRADICTORY_CLAIMS" : resolution === "UNKNOWN" ? "EXPLICIT_UNKNOWN" : "CONSISTENT_ACTIVE_CLAIMS",
    ...(freshness === "STALE" ? ["VALIDITY_WINDOW_ENDED_LAST_KNOWN_RETAINED"] : []),
    ...(freshness === "EXPIRED" ? ["CURRENT_STATE_VALIDITY_ENDED"] : []),
    ...(definition.kind === "CURRENT_STATE" && current.some((claim) => claim.validUntil === null) ? ["CURRENT_STATE_MISSING_VALID_UNTIL"] : []),
  ].sort();
  return resolvedHash({
    contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, attributeKey: first.attributeKey, scope: first.scope,
    resolution, freshness, trust: trustFor(considered, assessments, disputed), value,
    claimRefs: considered.map((claim) => claim.claimId).sort(), sourceTypes: [...new Set(considered.map((claim) => claim.sourceType))].sort(), sourceAssessmentHashes: considered.map((claim) => assessments.get(claim.claimId)?.assessmentHash).filter((value): value is string => Boolean(value)).sort(), reasonCodes,
  });
}

function intervalMinutes(value: string): number { const [hours, minutes] = value.split(":").map(Number); return (hours ?? 0) * 60 + (minutes ?? 0); }
function containsInterval(venue: { start: string; end: string }, kitchen: { start: string; end: string }): boolean {
  const venueStart = intervalMinutes(venue.start); let venueEnd = intervalMinutes(venue.end); if (venueEnd <= venueStart) venueEnd += 1440;
  const kitchenStart = intervalMinutes(kitchen.start); let kitchenEnd = intervalMinutes(kitchen.end); if (kitchenEnd <= kitchenStart) kitchenEnd += 1440;
  return kitchenStart >= venueStart && kitchenEnd <= venueEnd;
}

function semanticConflicts(resolved: readonly ResolvedKnowledge[], claims: readonly WorldKnowledgeClaim[]): readonly KnowledgeConflict[] {
  const conflicts: KnowledgeConflict[] = [];
  const current = new Map(resolved.filter((item) => item.freshness === "CURRENT" && !["DISPUTED", "UNKNOWN"].includes(item.resolution)).map((item) => [item.attributeKey, item]));
  const value = <T>(key: string): T | undefined => current.get(key)?.value as T | undefined;
  const add = (code: string, severity: KnowledgeConflict["severity"], attributeKeys: readonly string[], explanation: string, claimRefs: readonly string[] = []) => conflicts.push({ code, severity, attributeKeys: [...attributeKeys].sort(), claimRefs: [...claimRefs].sort(), explanation });

  for (const item of resolved.filter((entry) => entry.resolution === "DISPUTED")) add("OVERLAPPING_CONTRADICTORY_CLAIMS", "BLOCKING", [item.attributeKey], "Competing active claims for the same attribute and scope cannot be resolved without destroying disagreement.", item.claimRefs);
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
    const left = claims[leftIndex]; const right = claims[rightIndex]; if (!left || !right || left.attributeKey !== right.attributeKey || left.scope.spotId !== right.scope.spotId || left.scope.area !== right.scope.area || stateValue(left) === stateValue(right) || !overlaps(left, right) || left.supersedesClaimId === right.claimId || right.supersedesClaimId === left.claimId) continue;
    if (!conflicts.some((item) => item.code === "OVERLAPPING_CLAIMS_IN_HISTORY" && item.claimRefs.includes(left.claimId))) add("OVERLAPPING_CLAIMS_IN_HISTORY", "WARNING", [left.attributeKey], "Different historical claims overlap in scope and validity; history is retained for review.", [left.claimId, right.claimId]);
  }

  const total = value<number>("capacity.seats_total"); const indoor = value<number>("capacity.seats_indoor"); const outdoor = value<number>("capacity.seats_outdoor"); const group = value<{ min: number; max: number }>("capacity.group_size_supported"); const reservation = value<{ minimumPartySize: number | null }>("rule.reservation");
  if (total !== undefined && indoor !== undefined && outdoor !== undefined && indoor + outdoor > total) add("CAPACITY_COMPONENTS_EXCEED_TOTAL", "BLOCKING", ["capacity.seats_total", "capacity.seats_indoor", "capacity.seats_outdoor"], "Indoor and outdoor capacity exceed the declared simultaneous total capacity.");
  if (total !== undefined && group && group.max > total) add("GROUP_RANGE_EXCEEDS_TOTAL_CAPACITY", "BLOCKING", ["capacity.group_size_supported", "capacity.seats_total"], "Supported group size exceeds total seating capacity.");
  if (group && reservation?.minimumPartySize !== null && reservation?.minimumPartySize !== undefined && reservation.minimumPartySize > group.max) add("RESERVATION_THRESHOLD_OUTSIDE_SUPPORTED_GROUP_RANGE", "WARNING", ["capacity.group_size_supported", "rule.reservation"], "Reservation threshold is above the declared supported group range.");

  const takeaway = current.get("operation.takeaway"); const offerings = value<readonly string[]>("offering.groups") ?? [];
  if (takeaway?.resolution === "KNOWN_FALSE" && offerings.includes("TAKEAWAY_MEALS")) add("TAKEAWAY_EXCLUDED_BUT_OFFERED", "BLOCKING", ["operation.takeaway", "offering.groups"], "Takeaway is explicitly false while takeaway meals are listed as an offering.");

  const amenities = value<readonly string[]>("amenity.features") ?? []; const states = resolved.filter((item) => item.attributeKey === "state.current" && item.freshness === "CURRENT" && item.resolution === "KNOWN_VALUE");
  if ((amenities.includes("TERRACE") || amenities.includes("OUTDOOR_SEATING")) && states.some((item) => (item.value as { kind?: string; scope?: string }).kind === "AREA_CLOSED" && /terrace|outdoor/i.test((item.value as { scope?: string }).scope ?? ""))) add("OUTDOOR_AREA_TEMPORARILY_UNAVAILABLE", "INFO", ["amenity.features", "state.current"], "Outdoor infrastructure remains a durable fact while the current scoped state temporarily closes it.");

  const venue = value<readonly { day: string; intervals: readonly { start: string; end: string }[] }[]>("hours.regular"); const kitchen = value<readonly { day: string; intervals: readonly { start: string; end: string }[] }[]>("hours.kitchen");
  if (venue && kitchen) for (const kitchenDay of kitchen) {
    const venueDay = venue.find((day) => day.day === kitchenDay.day); if (!venueDay && kitchenDay.intervals.length) add("KITCHEN_OPEN_WHILE_VENUE_CLOSED", "BLOCKING", ["hours.regular", "hours.kitchen"], `Kitchen has service on ${kitchenDay.day} while the venue has no interval.`);
    else if (venueDay && kitchenDay.intervals.some((interval) => !venueDay.intervals.some((venueInterval) => containsInterval(venueInterval, interval)))) add("KITCHEN_HOURS_OUTSIDE_VENUE_HOURS", "BLOCKING", ["hours.regular", "hours.kitchen"], `Kitchen hours on ${kitchenDay.day} extend outside venue hours.`);
  }

  const primary = value<string>("classification.primary_category"); const placeTypes = value<readonly string[]>("classification.place_types") ?? [];
  if (primary === "EAT" && placeTypes.includes("PUB")) add("UNUSUAL_CATEGORY_PLACE_TYPE_COMBINATION", "INFO", ["classification.primary_category", "classification.place_types"], "Pub does not force Drinks; the unusual combination is retained for review without automatic reclassification.");
  for (const item of resolved.filter((entry) => entry.attributeKey === "state.current" && entry.reasonCodes.includes("CURRENT_STATE_MISSING_VALID_UNTIL"))) add("CURRENT_STATE_MISSING_VALID_UNTIL", "BLOCKING", ["state.current"], "Current state has no explicit expiry and cannot become engine-authoritative.", item.claimRefs);
  return canonicalSort(conflicts, (item) => `${item.code}:${item.attributeKeys.join(",")}:${item.claimRefs.join(",")}`);
}

export function parseResolutionRequest(value: unknown, acceptedPolicies: readonly Pick<SourcePolicy, "policyVersion" | "policyHash">[] = [UNCONFIGURED_SOURCE_POLICY], verificationContext?: AcceptedVerificationContext): ResolutionRequest {
  const input = object(value, "$", ["contractVersion", "registryVersion", "asOf", "claims", "sourcePolicy", "verificationRecords"]);
  if (required(input, "contractVersion") !== RESOLUTION_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown resolution contract version");
  if (required(input, "registryVersion") !== REGISTRY_VERSION) throw new ContractValidationError("$.registryVersion", "unknown registry version");
  const claims = array(required(input, "claims"), "$.claims").map(parseClaim); const byId = new Map(claims.map((claim) => [claim.claimId, claim]));
  if (byId.size !== claims.length) throw new ContractValidationError("$.claims", "duplicate claim id");
  for (const claim of claims) if (claim.supersedesClaimId) {
    const prior = byId.get(claim.supersedesClaimId); if (!prior) throw new ContractValidationError("$.claims", `superseded claim not found:${claim.supersedesClaimId}`);
    if (prior.attributeKey !== claim.attributeKey || prior.scope.spotId !== claim.scope.spotId || prior.scope.area !== claim.scope.area) throw new ContractValidationError("$.claims", "supersedes relationship crosses attribute or scope");
    if (claim.observedAt < prior.observedAt) throw new ContractValidationError("$.claims", "correction predates superseded claim");
    const visited = new Set([claim.claimId]); let cursor: WorldKnowledgeClaim | undefined = prior; while (cursor?.supersedesClaimId) { if (visited.has(cursor.claimId)) throw new ContractValidationError("$.claims", "cyclic supersedes relationship"); visited.add(cursor.claimId); cursor = byId.get(cursor.supersedesClaimId); }
  }
  const sourcePolicy = parseSourcePolicy(required(input, "sourcePolicy"));
  if (!acceptedPolicies.some((policy) => policy.policyVersion === sourcePolicy.policyVersion && policy.policyHash === sourcePolicy.policyHash)) throw new ContractValidationError("$.sourcePolicy", "unknown source policy identity");
  const verificationRecords = array(required(input, "verificationRecords"), "$.verificationRecords").map((value, index) => {
    const recordInput = object(value, `$.verificationRecords[${index}]`); const claimId = identifier(required(recordInput, "claimId", `$.verificationRecords[${index}]`), `$.verificationRecords[${index}].claimId`); const claim = byId.get(claimId);
    if (!claim) throw new ContractValidationError(`$.verificationRecords[${index}].claimId`, "verification record claim not found");
    return parseVerificationRecord(value, claim, sourcePolicy, verificationContext);
  });
  if (new Set(verificationRecords.map((record) => record.recordId)).size !== verificationRecords.length) throw new ContractValidationError("$.verificationRecords", "duplicate verification record id");
  for (const claim of claims) if (claim.verificationState === "VERIFIED" && !verificationRecords.some((record) => record.claimId === claim.claimId && record.result === "VERIFIED")) throw new ContractValidationError("$.verificationRecords", `VERIFIED claim lacks valid verification record:${claim.claimId}`);
  return { contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf: timestamp(required(input, "asOf"), "$.asOf"), claims, sourcePolicy, verificationRecords };
}

export function resolveWorldKnowledge(requestValue: ResolutionRequest, acceptedPolicies?: readonly Pick<SourcePolicy, "policyVersion" | "policyHash">[], verificationContext?: AcceptedVerificationContext): ResolutionResult;
export function resolveWorldKnowledge(requestValue: unknown, acceptedPolicies: readonly Pick<SourcePolicy, "policyVersion" | "policyHash">[] = [UNCONFIGURED_SOURCE_POLICY], verificationContext?: AcceptedVerificationContext): ResolutionResult {
  const request = parseResolutionRequest(requestValue, acceptedPolicies, verificationContext); const parsed = canonicalSort(request.claims, (claim) => claim.claimId); const verified = verifiedClaimIds(request.verificationRecords);
  const sourceAssessments = parsed.map((claim) => evaluateClaimSource(claim, request.sourcePolicy, verified.has(claim.claimId))).sort((a, b) => a.claimId.localeCompare(b.claimId)); const assessmentByClaim = new Map(sourceAssessments.map((assessment) => [assessment.claimId, assessment]));
  const superseded = new Set(parsed.map((claim) => claim.supersedesClaimId).filter((value): value is string => value !== null));
  const eligible = parsed.filter((claim) => !superseded.has(claim.claimId) && claim.verificationState !== "REJECTED" && assessmentByClaim.get(claim.claimId)?.status !== "REJECTED" && (claim.validFrom === null || claim.validFrom <= request.asOf));
  const groups = new Map<string, WorldKnowledgeClaim[]>();
  for (const claim of eligible) { const key = `${claim.scope.spotId}\u0000${claim.scope.area}\u0000${claim.attributeKey}`; groups.set(key, [...(groups.get(key) ?? []), claim]); }
  const resolved = canonicalSort([...groups.values()].map((claims) => resolveGroup(claims, request.asOf, assessmentByClaim)), (item) => `${item.scope.spotId}:${item.scope.area}:${item.attributeKey}`);
  const conflicts = semanticConflicts(resolved, parsed);
  const body = { contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf: request.asOf, resolved, conflicts, history: parsed, sourcePolicy: request.sourcePolicy, sourceAssessments, verificationRecords: request.verificationRecords };
  return { ...body, resultHash: hashBody(body, []) };
}

export function parseResolvedKnowledge(value: unknown): ResolvedKnowledge {
  const input = object(value, "$", ["contractVersion", "registryVersion", "attributeKey", "scope", "resolution", "freshness", "trust", "value", "claimRefs", "sourceTypes", "sourceAssessmentHashes", "reasonCodes", "resolutionHash"]);
  if (required(input, "contractVersion") !== RESOLUTION_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown resolution contract version");
  if (required(input, "registryVersion") !== REGISTRY_VERSION) throw new ContractValidationError("$.registryVersion", "unknown registry version");
  const scope = object(required(input, "scope"), "$.scope", ["spotId", "area"]); const definition = getAttributeDefinition(identifier(required(input, "attributeKey"), "$.attributeKey")); const resolution = enumValue(required(input, "resolution"), RESOLUTION_STATES, "$.resolution");
  const rawValue = required(input, "value");
  let parsedValue: ClaimValue | readonly ClaimValue[];
  if (resolution === "UNKNOWN") {
    if (rawValue !== null) throw new ContractValidationError("$.value", "UNKNOWN requires null"); parsedValue = null;
  } else if (resolution === "DISPUTED") {
    parsedValue = array(rawValue, "$.value", { min: 2 }).map((item, index) => parseAttributeValue(definition.key, item, `$.value[${index}]`));
    if (new Set(parsedValue.map((item) => canonicalJson(item))).size < 2) throw new ContractValidationError("$.value", "DISPUTED requires distinct competing values");
  } else {
    parsedValue = parseAttributeValue(definition.key, rawValue, "$.value");
    if (resolution === "KNOWN_TRUE" && parsedValue !== true) throw new ContractValidationError("$.value", "KNOWN_TRUE requires true");
    if (resolution === "KNOWN_FALSE" && parsedValue !== false) throw new ContractValidationError("$.value", "KNOWN_FALSE requires false");
    if (["KNOWN_TRUE", "KNOWN_FALSE"].includes(resolution) && definition.valueType !== "BOOLEAN") throw new ContractValidationError("$.resolution", "boolean resolution requires BOOLEAN attribute");
  }
  if (canonicalJson(parsedValue) !== canonicalJson(rawValue)) throw new ContractValidationError("$.value", "value is not canonical");
  const trust = enumValue(required(input, "trust"), TRUST_STATES, "$.trust");
  if ((resolution === "DISPUTED") !== (trust === "CONFLICTING")) throw new ContractValidationError("$.trust", "CONFLICTING trust must match DISPUTED resolution");
  const resultWithoutHash: Omit<ResolvedKnowledge, "resolutionHash"> = {
    contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, attributeKey: definition.key,
    scope: { spotId: identifier(required(scope, "spotId", "$.scope"), "$.scope.spotId"), area: identifier(required(scope, "area", "$.scope"), "$.scope.area") },
    resolution, freshness: enumValue(required(input, "freshness"), FRESHNESS_STATES, "$.freshness"), trust,
    value: parsedValue, claimRefs: array(required(input, "claimRefs"), "$.claimRefs", { min: 1 }).map((item, index) => identifier(item, `$.claimRefs[${index}]`)), sourceTypes: array(required(input, "sourceTypes"), "$.sourceTypes", { min: 1 }).map((item, index) => enumValue(item, SOURCE_TYPES, `$.sourceTypes[${index}]`)), sourceAssessmentHashes: array(required(input, "sourceAssessmentHashes"), "$.sourceAssessmentHashes", { min: 1 }).map((item, index) => hash(item, `$.sourceAssessmentHashes[${index}]`)), reasonCodes: array(required(input, "reasonCodes"), "$.reasonCodes", { min: 1 }).map((item, index) => enumValue(item, RESOLUTION_REASON_CODES, `$.reasonCodes[${index}]`)),
  };
  const primaryReason = resolution === "DISPUTED" ? "OVERLAPPING_CONTRADICTORY_CLAIMS" : resolution === "UNKNOWN" ? "EXPLICIT_UNKNOWN" : "CONSISTENT_ACTIVE_CLAIMS"; if (!resultWithoutHash.reasonCodes.includes(primaryReason)) throw new ContractValidationError("$.reasonCodes", "resolution reason does not match resolution state");
  if (resultWithoutHash.freshness === "STALE" && !resultWithoutHash.reasonCodes.includes("VALIDITY_WINDOW_ENDED_LAST_KNOWN_RETAINED") || resultWithoutHash.freshness === "EXPIRED" && !resultWithoutHash.reasonCodes.includes("CURRENT_STATE_VALIDITY_ENDED")) throw new ContractValidationError("$.reasonCodes", "freshness reason does not match freshness state");
  const expected = resolvedHash(resultWithoutHash); if (expected.resolutionHash !== hash(required(input, "resolutionHash"), "$.resolutionHash")) throw new ContractValidationError("$.resolutionHash", "resolution hash mismatch"); return expected;
}

function parseConflict(value: unknown, path: string): KnowledgeConflict {
  const input = object(value, path, ["code", "severity", "attributeKeys", "claimRefs", "explanation"]);
  return { code: enumValue(required(input, "code", path), KNOWLEDGE_CONFLICT_CODES, `${path}.code`), severity: enumValue(required(input, "severity", path), ["INFO", "WARNING", "BLOCKING"] as const, `${path}.severity`), attributeKeys: array(required(input, "attributeKeys", path), `${path}.attributeKeys`, { min: 1 }).map((item, index) => getAttributeDefinition(identifier(item, `${path}.attributeKeys[${index}]`)).key), claimRefs: array(required(input, "claimRefs", path), `${path}.claimRefs`).map((item, index) => identifier(item, `${path}.claimRefs[${index}]`)), explanation: string(required(input, "explanation", path), `${path}.explanation`, { min: 1 }) };
}

export function parseResolutionResult(value: unknown, acceptedPolicies: readonly Pick<SourcePolicy, "policyVersion" | "policyHash">[] = [UNCONFIGURED_SOURCE_POLICY], verificationContext?: AcceptedVerificationContext): ResolutionResult {
  const input = object(value, "$", ["contractVersion", "registryVersion", "asOf", "resolved", "conflicts", "history", "sourcePolicy", "sourceAssessments", "verificationRecords", "resultHash"]);
  if (required(input, "contractVersion") !== RESOLUTION_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown resolution contract version");
  if (required(input, "registryVersion") !== REGISTRY_VERSION) throw new ContractValidationError("$.registryVersion", "unknown registry version");
  const body = {
    contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf: timestamp(required(input, "asOf"), "$.asOf"),
    resolved: array(required(input, "resolved"), "$.resolved").map(parseResolvedKnowledge), conflicts: array(required(input, "conflicts"), "$.conflicts").map((item, index) => parseConflict(item, `$.conflicts[${index}]`)), history: array(required(input, "history"), "$.history").map(parseClaim), sourcePolicy: parseSourcePolicy(required(input, "sourcePolicy")), sourceAssessments: [] as readonly ClaimSourceAssessment[], verificationRecords: [] as readonly VerificationRecord[],
  };
  if (!acceptedPolicies.some((policy) => policy.policyVersion === body.sourcePolicy.policyVersion && policy.policyHash === body.sourcePolicy.policyHash)) throw new ContractValidationError("$.sourcePolicy", "unknown source policy identity");
  const byId = new Map(body.history.map((claim) => [claim.claimId, claim])); body.verificationRecords = array(required(input, "verificationRecords"), "$.verificationRecords").map((item, index) => { const itemObject = object(item, `$.verificationRecords[${index}]`); const claimId = identifier(required(itemObject, "claimId", `$.verificationRecords[${index}]`), `$.verificationRecords[${index}].claimId`); const claim = byId.get(claimId); if (!claim) throw new ContractValidationError(`$.verificationRecords[${index}]`, "claim not found"); return parseVerificationRecord(item, claim, body.sourcePolicy, verificationContext); });
  const verified = verifiedClaimIds(body.verificationRecords); body.sourceAssessments = array(required(input, "sourceAssessments"), "$.sourceAssessments").map((item, index) => { const itemObject = object(item, `$.sourceAssessments[${index}]`); const claimId = identifier(required(itemObject, "claimId", `$.sourceAssessments[${index}]`), `$.sourceAssessments[${index}].claimId`); const claim = byId.get(claimId); if (!claim) throw new ContractValidationError(`$.sourceAssessments[${index}]`, "claim not found"); return parseClaimSourceAssessment(item, claim, body.sourcePolicy, verified.has(claimId)); });
  const supplied = hash(required(input, "resultHash"), "$.resultHash"); if (hashBody(body, []) !== supplied) throw new ContractValidationError("$.resultHash", "resolution result hash mismatch");
  if (body.sourceAssessments.length !== body.history.length || new Set(body.sourceAssessments.map((item) => item.claimId)).size !== body.history.length) throw new ContractValidationError("$.sourceAssessments", "each claim requires exactly one source assessment");
  const recomputed = resolveWorldKnowledge({ contractVersion: RESOLUTION_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, asOf: body.asOf, claims: body.history, sourcePolicy: body.sourcePolicy, verificationRecords: body.verificationRecords }, acceptedPolicies, verificationContext);
  const { resultHash: _recomputedHash, ...recomputedBody } = recomputed;
  if (canonicalJson(recomputedBody) !== canonicalJson(body)) throw new ContractValidationError("$", "resolution payload does not match deterministic resolution of its history");
  return { ...body, resultHash: supplied };
}
