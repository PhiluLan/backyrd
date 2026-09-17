import { canonicalJson, hashBody, sha256 } from "./canonical.js";
import type { ClaimValue, FreshnessState, ResolutionState, TrustState } from "./contracts.js";
import { WORLD_KNOWLEDGE_PORT_VERSION } from "./contracts.js";
import type { WorldDarkReader, WorldDarkReaderEnvironment } from "./dark-reader.js";
import { WORLD_DARK_READER_CONTRACT_VERSION } from "./dark-reader.js";
import { getAttributeDefinition, REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { ACCEPTED_SOURCE_POLICY } from "./slice3b.js";
import { ContractValidationError, array, boolean, enumValue, hash, identifier, object, required, string, timestamp } from "./schema.js";

export const WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION = "backyrd.world-knowledge.internal-allowlist@1.0" as const;
export const WORLD_INTERNAL_ALLOWLIST_REQUEST_VERSION = "backyrd.world-knowledge.internal-allowlist-request@1.0" as const;
export const WORLD_INTERNAL_READ_PROJECTION_VERSION = "backyrd.world-knowledge.internal-read-projection@1.0" as const;
export const WORLD_POST_DEPLOY_EVIDENCE_VERSION = "backyrd.world-knowledge.post-deploy-evidence@1.0" as const;
export const WORLD_INTERNAL_ALLOWLIST_PURPOSES = ["INTERNAL_WORLD_READ_REHEARSAL"] as const;
export const WORLD_INTERNAL_ALLOWLIST_ENVIRONMENTS = ["LOCAL_TEST", "PROD_LIKE_TEST"] as const;
export const WORLD_INTERNAL_KNOWLEDGE_STATES = ["UNKNOWN", "NOT_CONFIGURED", "NOT_APPLICABLE", "INCOMPATIBLE", "DISPUTED"] as const;

type InternalPurpose = typeof WORLD_INTERNAL_ALLOWLIST_PURPOSES[number];
type InternalKnowledgeState = typeof WORLD_INTERNAL_KNOWLEDGE_STATES[number];

export interface WorldInternalAllowlistEntry {
  readonly entryId: string;
  readonly subjectPseudonym: string;
  readonly purpose: InternalPurpose;
  readonly environment: WorldDarkReaderEnvironment;
  readonly releaseVersion: string;
  readonly spotReferenceHash: string;
  readonly allowedAttributeKeys: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly status: "ENABLED_TEST_ONLY";
  readonly entryHash: string;
}

export interface WorldInternalAllowlistRelease {
  readonly contractVersion: typeof WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION;
  readonly releaseVersion: string;
  readonly canonicalMainSha: string;
  readonly canonicalTreeSha: string;
  readonly releaseArtifactHash: string;
  readonly migrationBundleHash: string;
  readonly readerContractVersion: typeof WORLD_DARK_READER_CONTRACT_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: typeof REGISTRY_HASH;
  readonly sourcePolicyVersion: typeof ACCEPTED_SOURCE_POLICY.policyVersion;
  readonly sourcePolicyHash: typeof ACCEPTED_SOURCE_POLICY.policyHash;
  readonly authorityStatus: "NOT_CONFIGURED" | "SYNTHETIC_TEST_AUTHORITY";
  readonly expirationPolicy: "NOT_CONFIGURED" | "ENTRY_VALID_UNTIL";
  readonly retentionPolicy: "NOT_CONFIGURED";
  readonly executionAuthorized: false;
  readonly entries: readonly WorldInternalAllowlistEntry[];
  readonly releaseHash: string;
}

export interface WorldInternalReadRequest {
  readonly contractVersion: typeof WORLD_INTERNAL_ALLOWLIST_REQUEST_VERSION;
  readonly requestId: string;
  readonly releaseVersion: string;
  readonly releaseHash: string;
  readonly entryId: string;
  readonly entryHash: string;
  readonly subjectPseudonym: string;
  readonly purpose: InternalPurpose;
  readonly environment: WorldDarkReaderEnvironment;
  readonly spotId: string;
  readonly requestedAttributeKeys: readonly string[];
  readonly requestHash: string;
}

export interface WorldInternalReadProjection {
  readonly contractVersion: typeof WORLD_INTERNAL_READ_PROJECTION_VERSION;
  readonly requestHash: string;
  readonly releaseHash: string;
  readonly entryHash: string;
  readonly spotReferenceHash: string;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: typeof REGISTRY_HASH;
  readonly sourcePolicyVersion: typeof ACCEPTED_SOURCE_POLICY.policyVersion;
  readonly sourcePolicyHash: typeof ACCEPTED_SOURCE_POLICY.policyHash;
  readonly sourceSnapshotHash: string;
  readonly knowledge: readonly {
    readonly kind: "FACT" | "OPERATIONAL_RULE" | "CURRENT_STATE";
    readonly key: string;
    readonly scope: string;
    readonly resolution: ResolutionState;
    readonly freshness: FreshnessState;
    readonly trust: TrustState;
    readonly value: ClaimValue | readonly ClaimValue[];
    readonly validFrom: string | null;
    readonly validUntil: string | null;
    readonly entryHash: string;
  }[];
  readonly statePartitions: readonly { readonly state: InternalKnowledgeState; readonly attributeKeys: readonly string[] }[];
  readonly conflicts: readonly { readonly code: string; readonly severity: "INFO" | "WARNING" | "BLOCKING"; readonly attributeKeys: readonly string[] }[];
  readonly projectionHash: string;
}

export interface WorldPostDeployEvidence {
  readonly contractVersion: typeof WORLD_POST_DEPLOY_EVIDENCE_VERSION;
  readonly mainSha: string;
  readonly treeSha: string;
  readonly releaseArtifactHash: string;
  readonly migrationBundleHash: string;
  readonly readerContractVersion: typeof WORLD_DARK_READER_CONTRACT_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: typeof REGISTRY_HASH;
  readonly sourcePolicyVersion: typeof ACCEPTED_SOURCE_POLICY.policyVersion;
  readonly sourcePolicyHash: typeof ACCEPTED_SOURCE_POLICY.policyHash;
  readonly allowlistContractVersion: typeof WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION;
  readonly allowlistHash: string;
  readonly status: "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY";
  readonly executionAuthorized: false;
  readonly evidenceHash: string;
}

const gitSha = (value: unknown, path: string) => string(value, path, { pattern: /^[a-f0-9]{40}$/ });
const nullableTimestamp = (value: unknown, path: string) => value === null ? null : timestamp(value, path);
const sortedUnique = (values: readonly string[], path: string): readonly string[] => {
  if (new Set(values).size !== values.length) throw new ContractValidationError(path, "duplicate value");
  const sorted = [...values].sort((left, right) => left.localeCompare(right, "en"));
  if (canonicalJson(sorted) !== canonicalJson(values)) throw new ContractValidationError(path, "must be canonically sorted");
  return values;
};

function validateAllowedAttributeKey(value: unknown, path: string): string {
  const key = identifier(value, path);
  const definition = getAttributeDefinition(key);
  if (key.startsWith("contact.") || definition.engineAuthorization === "EXPLANATION_ONLY") throw new ContractValidationError(path, "attribute is outside the minimized internal read boundary");
  if (/(?:subscription|payment|billing|advertis|sponsor|owner_tier|admin_note|private_source|actor)/i.test(key)) throw new ContractValidationError(path, "commercial or private attribute prohibited");
  return key;
}

function parseEntry(value: unknown, path: string): WorldInternalAllowlistEntry {
  const input = object(value, path, ["entryId", "subjectPseudonym", "purpose", "environment", "releaseVersion", "spotReferenceHash", "allowedAttributeKeys", "validFrom", "validUntil", "status", "entryHash"]);
  const body = {
    entryId: identifier(required(input, "entryId", path), `${path}.entryId`),
    subjectPseudonym: string(required(input, "subjectPseudonym", path), `${path}.subjectPseudonym`, { pattern: /^synthetic-internal:[a-z0-9][a-z0-9-]{7,63}$/ }),
    purpose: enumValue(required(input, "purpose", path), WORLD_INTERNAL_ALLOWLIST_PURPOSES, `${path}.purpose`),
    environment: enumValue(required(input, "environment", path), WORLD_INTERNAL_ALLOWLIST_ENVIRONMENTS, `${path}.environment`),
    releaseVersion: identifier(required(input, "releaseVersion", path), `${path}.releaseVersion`),
    spotReferenceHash: hash(required(input, "spotReferenceHash", path), `${path}.spotReferenceHash`),
    allowedAttributeKeys: sortedUnique(array(required(input, "allowedAttributeKeys", path), `${path}.allowedAttributeKeys`, { min: 1, max: 100 }).map((item, index) => validateAllowedAttributeKey(item, `${path}.allowedAttributeKeys[${index}]`)), `${path}.allowedAttributeKeys`),
    validFrom: timestamp(required(input, "validFrom", path), `${path}.validFrom`),
    validUntil: nullableTimestamp(required(input, "validUntil", path), `${path}.validUntil`),
    status: enumValue(required(input, "status", path), ["ENABLED_TEST_ONLY"] as const, `${path}.status`),
  };
  if (body.validUntil !== null && body.validUntil <= body.validFrom) throw new ContractValidationError(`${path}.validUntil`, "must be after validFrom");
  const entryHash = hash(required(input, "entryHash", path), `${path}.entryHash`);
  if (hashBody(body, []) !== entryHash) throw new ContractValidationError(`${path}.entryHash`, "entry hash mismatch");
  return { ...body, entryHash };
}

export function createWorldInternalAllowlistEntry(inputValue: unknown): WorldInternalAllowlistEntry {
  const input = object(inputValue, "$", ["entryId", "subjectPseudonym", "purpose", "environment", "releaseVersion", "spotId", "allowedAttributeKeys", "validFrom", "validUntil", "status"]);
  const spotId = identifier(required(input, "spotId"), "$.spotId");
  const body = {
    entryId: required(input, "entryId"), subjectPseudonym: required(input, "subjectPseudonym"), purpose: required(input, "purpose"), environment: required(input, "environment"), releaseVersion: required(input, "releaseVersion"),
    spotReferenceHash: sha256(spotId), allowedAttributeKeys: required(input, "allowedAttributeKeys"), validFrom: required(input, "validFrom"), validUntil: required(input, "validUntil"), status: required(input, "status"),
  };
  return parseEntry({ ...body, entryHash: hashBody(body, []) }, "$entry");
}

export function parseWorldInternalAllowlistRelease(value: unknown): WorldInternalAllowlistRelease {
  const input = object(value, "$", ["contractVersion", "releaseVersion", "canonicalMainSha", "canonicalTreeSha", "releaseArtifactHash", "migrationBundleHash", "readerContractVersion", "registryVersion", "registryHash", "sourcePolicyVersion", "sourcePolicyHash", "authorityStatus", "expirationPolicy", "retentionPolicy", "executionAuthorized", "entries", "releaseHash"]);
  if (required(input, "contractVersion") !== WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown allowlist contract version");
  const body = {
    contractVersion: WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION,
    releaseVersion: identifier(required(input, "releaseVersion"), "$.releaseVersion"),
    canonicalMainSha: gitSha(required(input, "canonicalMainSha"), "$.canonicalMainSha"), canonicalTreeSha: gitSha(required(input, "canonicalTreeSha"), "$.canonicalTreeSha"),
    releaseArtifactHash: hash(required(input, "releaseArtifactHash"), "$.releaseArtifactHash"), migrationBundleHash: hash(required(input, "migrationBundleHash"), "$.migrationBundleHash"),
    readerContractVersion: required(input, "readerContractVersion") === WORLD_DARK_READER_CONTRACT_VERSION ? WORLD_DARK_READER_CONTRACT_VERSION : (() => { throw new ContractValidationError("$.readerContractVersion", "unknown reader contract"); })(),
    registryVersion: required(input, "registryVersion") === REGISTRY_VERSION ? REGISTRY_VERSION : (() => { throw new ContractValidationError("$.registryVersion", "unknown registry"); })(),
    registryHash: hash(required(input, "registryHash"), "$.registryHash") as typeof REGISTRY_HASH,
    sourcePolicyVersion: required(input, "sourcePolicyVersion") === ACCEPTED_SOURCE_POLICY.policyVersion ? ACCEPTED_SOURCE_POLICY.policyVersion : (() => { throw new ContractValidationError("$.sourcePolicyVersion", "unknown source policy"); })(),
    sourcePolicyHash: hash(required(input, "sourcePolicyHash"), "$.sourcePolicyHash") as typeof ACCEPTED_SOURCE_POLICY.policyHash,
    authorityStatus: enumValue(required(input, "authorityStatus"), ["NOT_CONFIGURED", "SYNTHETIC_TEST_AUTHORITY"] as const, "$.authorityStatus"),
    expirationPolicy: enumValue(required(input, "expirationPolicy"), ["NOT_CONFIGURED", "ENTRY_VALID_UNTIL"] as const, "$.expirationPolicy"), retentionPolicy: enumValue(required(input, "retentionPolicy"), ["NOT_CONFIGURED"] as const, "$.retentionPolicy"),
    executionAuthorized: boolean(required(input, "executionAuthorized"), "$.executionAuthorized") as false,
    entries: array(required(input, "entries"), "$.entries", { max: 100 }).map((entry, index) => parseEntry(entry, `$.entries[${index}]`)),
  };
  if (body.registryHash !== REGISTRY_HASH || body.sourcePolicyHash !== ACCEPTED_SOURCE_POLICY.policyHash) throw new ContractValidationError("$", "registry or policy hash mismatch");
  if (body.executionAuthorized !== false) throw new ContractValidationError("$.executionAuthorized", "Production execution cannot be authorized by this contract");
  if (body.entries.some((entry) => entry.releaseVersion !== body.releaseVersion)) throw new ContractValidationError("$.entries", "entry release binding mismatch");
  if (body.authorityStatus === "NOT_CONFIGURED" && body.entries.length > 0) throw new ContractValidationError("$.authorityStatus", "unconfigured authority requires an empty allowlist");
  if (body.expirationPolicy === "ENTRY_VALID_UNTIL" && body.entries.some((entry) => entry.validUntil === null)) throw new ContractValidationError("$.entries", "configured expiration requires validUntil");
  if (body.expirationPolicy === "NOT_CONFIGURED" && body.entries.some((entry) => entry.validUntil !== null)) throw new ContractValidationError("$.entries", "unconfigured expiration cannot imply a deadline");
  const entryIds = body.entries.map((entry) => entry.entryId); sortedUnique(entryIds, "$.entries.entryId");
  const semanticIds = body.entries.map((entry) => `${entry.subjectPseudonym}|${entry.purpose}|${entry.environment}|${entry.spotReferenceHash}`);
  if (new Set(semanticIds).size !== semanticIds.length) throw new ContractValidationError("$.entries", "duplicate semantic allowlist member");
  const releaseHash = hash(required(input, "releaseHash"), "$.releaseHash");
  if (hashBody(body, []) !== releaseHash) throw new ContractValidationError("$.releaseHash", "release hash mismatch");
  return { ...body, releaseHash };
}

export function createWorldInternalAllowlistRelease(inputValue: unknown): WorldInternalAllowlistRelease {
  const input = object(inputValue, "$", ["releaseVersion", "canonicalMainSha", "canonicalTreeSha", "releaseArtifactHash", "migrationBundleHash", "authorityStatus", "expirationPolicy", "retentionPolicy", "entries"]);
  const body = { contractVersion: WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION, ...input, readerContractVersion: WORLD_DARK_READER_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash, executionAuthorized: false };
  return parseWorldInternalAllowlistRelease({ ...body, releaseHash: hashBody(body, []) });
}

export function parseWorldInternalReadRequest(value: unknown): WorldInternalReadRequest {
  const input = object(value, "$", ["contractVersion", "requestId", "releaseVersion", "releaseHash", "entryId", "entryHash", "subjectPseudonym", "purpose", "environment", "spotId", "requestedAttributeKeys", "requestHash"]);
  if (required(input, "contractVersion") !== WORLD_INTERNAL_ALLOWLIST_REQUEST_VERSION) throw new ContractValidationError("$.contractVersion", "unknown request contract version");
  const body = {
    contractVersion: WORLD_INTERNAL_ALLOWLIST_REQUEST_VERSION, requestId: identifier(required(input, "requestId"), "$.requestId"), releaseVersion: identifier(required(input, "releaseVersion"), "$.releaseVersion"), releaseHash: hash(required(input, "releaseHash"), "$.releaseHash"), entryId: identifier(required(input, "entryId"), "$.entryId"), entryHash: hash(required(input, "entryHash"), "$.entryHash"),
    subjectPseudonym: string(required(input, "subjectPseudonym"), "$.subjectPseudonym", { pattern: /^synthetic-internal:[a-z0-9][a-z0-9-]{7,63}$/ }), purpose: enumValue(required(input, "purpose"), WORLD_INTERNAL_ALLOWLIST_PURPOSES, "$.purpose"), environment: enumValue(required(input, "environment"), WORLD_INTERNAL_ALLOWLIST_ENVIRONMENTS, "$.environment"), spotId: identifier(required(input, "spotId"), "$.spotId"),
    requestedAttributeKeys: sortedUnique(array(required(input, "requestedAttributeKeys"), "$.requestedAttributeKeys", { min: 1, max: 100 }).map((item, index) => validateAllowedAttributeKey(item, `$.requestedAttributeKeys[${index}]`)), "$.requestedAttributeKeys"),
  };
  const requestHash = hash(required(input, "requestHash"), "$.requestHash"); if (hashBody(body, []) !== requestHash) throw new ContractValidationError("$.requestHash", "request hash mismatch");
  return { ...body, requestHash };
}

export function createWorldInternalReadRequest(inputValue: unknown): WorldInternalReadRequest {
  const input = object(inputValue, "$", ["requestId", "releaseVersion", "releaseHash", "entryId", "entryHash", "subjectPseudonym", "purpose", "environment", "spotId", "requestedAttributeKeys"]);
  const body = { contractVersion: WORLD_INTERNAL_ALLOWLIST_REQUEST_VERSION, ...input };
  return parseWorldInternalReadRequest({ ...body, requestHash: hashBody(body, []) });
}

function projectSnapshot(snapshot: Awaited<ReturnType<WorldDarkReader["reader"]["readSnapshot"]>>, request: WorldInternalReadRequest, entry: WorldInternalAllowlistEntry): WorldInternalReadProjection {
  const requested = new Set(request.requestedAttributeKeys);
  const rows = [
    ...snapshot.facts.map((item) => ({ kind: "FACT" as const, item })), ...snapshot.operationalRules.map((item) => ({ kind: "OPERATIONAL_RULE" as const, item })), ...snapshot.currentStates.map((item) => ({ kind: "CURRENT_STATE" as const, item })),
  ].filter(({ item }) => requested.has(item.key)).map(({ kind, item }) => ({ kind, key: item.key, scope: item.scope, resolution: item.resolution, freshness: item.freshness, trust: item.trust, value: item.value, validFrom: item.validFrom, validUntil: item.validUntil, entryHash: item.entryHash })).sort((left, right) => `${left.kind}|${left.key}|${left.scope}`.localeCompare(`${right.kind}|${right.key}|${right.scope}`, "en"));
  const unknown = [...new Set(snapshot.explicitUnknowns.filter((item) => requested.has(item.key)).map((item) => item.key))].sort();
  const disputes = [...new Set(snapshot.conflicts.flatMap((item) => item.attributeKeys).filter((key) => requested.has(key)))].sort();
  const statePartitions = WORLD_INTERNAL_KNOWLEDGE_STATES.map((state) => ({ state, attributeKeys: state === "UNKNOWN" ? unknown : state === "DISPUTED" ? disputes : [] }));
  const conflicts = snapshot.conflicts.map((item) => ({ code: item.code, severity: item.severity, attributeKeys: item.attributeKeys.filter((key) => requested.has(key)).sort() })).filter((item) => item.attributeKeys.length > 0).sort((left, right) => `${left.code}|${left.attributeKeys.join("|")}`.localeCompare(`${right.code}|${right.attributeKeys.join("|")}`, "en"));
  const body = { contractVersion: WORLD_INTERNAL_READ_PROJECTION_VERSION, requestHash: request.requestHash, releaseHash: request.releaseHash, entryHash: entry.entryHash, spotReferenceHash: entry.spotReferenceHash, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash, sourceSnapshotHash: snapshot.snapshotHash, knowledge: rows, statePartitions, conflicts };
  return Object.freeze({ ...body, projectionHash: hashBody(body, []) });
}

export function createWorldInternalAllowlistReader(input: Readonly<{ darkReader: WorldDarkReader; acceptedRelease: unknown; now: () => string }>) {
  const release = parseWorldInternalAllowlistRelease(input.acceptedRelease); let emergencyOff = false;
  const cache = new Map<string, WorldInternalReadProjection>(); const requestIds = new Map<string, string>();
  return Object.freeze({
    contractVersion: WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION,
    engageEmergencyOff(): void { emergencyOff = true; cache.clear(); },
    get emergencyOff(): boolean { return emergencyOff; },
    async read(requestValue: unknown): Promise<WorldInternalReadProjection> {
      if (emergencyOff) throw new Error("world_internal_reader_emergency_off");
      const request = parseWorldInternalReadRequest(requestValue);
      const priorHash = requestIds.get(request.requestId); if (priorHash && priorHash !== request.requestHash) throw new Error("world_internal_reader_idempotency_conflict");
      const cached = cache.get(request.requestHash); if (cached) return cached;
      if (!input.darkReader.state.enabled || input.darkReader.state.environment === null) throw new Error(`world_internal_reader_off:${input.darkReader.state.reason}`);
      if (request.releaseVersion !== release.releaseVersion || request.releaseHash !== release.releaseHash) throw new Error("world_internal_reader_release_mismatch");
      const entry = release.entries.find((candidate) => candidate.entryId === request.entryId); if (!entry || entry.entryHash !== request.entryHash) throw new Error("world_internal_reader_entry_denied");
      if (release.authorityStatus !== "SYNTHETIC_TEST_AUTHORITY") throw new Error("world_internal_reader_authority_not_configured");
      if (request.subjectPseudonym !== entry.subjectPseudonym || request.purpose !== entry.purpose || request.environment !== entry.environment || request.environment !== input.darkReader.state.environment) throw new Error("world_internal_reader_binding_mismatch");
      if (sha256(request.spotId) !== entry.spotReferenceHash) throw new Error("world_internal_reader_spot_denied");
      if (request.requestedAttributeKeys.some((key) => !entry.allowedAttributeKeys.includes(key))) throw new Error("world_internal_reader_attribute_denied");
      const now = timestamp(input.now(), "$.now"); if (now < entry.validFrom || (entry.validUntil !== null && now >= entry.validUntil)) throw new Error("world_internal_reader_entry_inactive");
      const snapshot = await input.darkReader.reader.readSnapshot({ spotId: request.spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH });
      const projection = projectSnapshot(snapshot, request, entry); requestIds.set(request.requestId, request.requestHash); cache.set(request.requestHash, projection); return projection;
    },
  });
}

export function parseWorldPostDeployEvidence(value: unknown): WorldPostDeployEvidence {
  const input = object(value, "$", ["contractVersion", "mainSha", "treeSha", "releaseArtifactHash", "migrationBundleHash", "readerContractVersion", "registryVersion", "registryHash", "sourcePolicyVersion", "sourcePolicyHash", "allowlistContractVersion", "allowlistHash", "status", "executionAuthorized", "evidenceHash"]);
  if (required(input, "contractVersion") !== WORLD_POST_DEPLOY_EVIDENCE_VERSION) throw new ContractValidationError("$.contractVersion", "unknown evidence contract");
  const body = { contractVersion: WORLD_POST_DEPLOY_EVIDENCE_VERSION, mainSha: gitSha(required(input, "mainSha"), "$.mainSha"), treeSha: gitSha(required(input, "treeSha"), "$.treeSha"), releaseArtifactHash: hash(required(input, "releaseArtifactHash"), "$.releaseArtifactHash"), migrationBundleHash: hash(required(input, "migrationBundleHash"), "$.migrationBundleHash"), readerContractVersion: required(input, "readerContractVersion") === WORLD_DARK_READER_CONTRACT_VERSION ? WORLD_DARK_READER_CONTRACT_VERSION : (() => { throw new ContractValidationError("$.readerContractVersion", "reader mismatch"); })(), registryVersion: required(input, "registryVersion") === REGISTRY_VERSION ? REGISTRY_VERSION : (() => { throw new ContractValidationError("$.registryVersion", "registry mismatch"); })(), registryHash: hash(required(input, "registryHash"), "$.registryHash") as typeof REGISTRY_HASH, sourcePolicyVersion: required(input, "sourcePolicyVersion") === ACCEPTED_SOURCE_POLICY.policyVersion ? ACCEPTED_SOURCE_POLICY.policyVersion : (() => { throw new ContractValidationError("$.sourcePolicyVersion", "policy mismatch"); })(), sourcePolicyHash: hash(required(input, "sourcePolicyHash"), "$.sourcePolicyHash") as typeof ACCEPTED_SOURCE_POLICY.policyHash, allowlistContractVersion: required(input, "allowlistContractVersion") === WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION ? WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION : (() => { throw new ContractValidationError("$.allowlistContractVersion", "allowlist mismatch"); })(), allowlistHash: hash(required(input, "allowlistHash"), "$.allowlistHash"), status: enumValue(required(input, "status"), ["NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"] as const, "$.status"), executionAuthorized: boolean(required(input, "executionAuthorized"), "$.executionAuthorized") as false };
  if (body.registryHash !== REGISTRY_HASH || body.sourcePolicyHash !== ACCEPTED_SOURCE_POLICY.policyHash || body.executionAuthorized !== false) throw new ContractValidationError("$", "evidence identity or authority mismatch");
  const evidenceHash = hash(required(input, "evidenceHash"), "$.evidenceHash"); if (hashBody(body, []) !== evidenceHash) throw new ContractValidationError("$.evidenceHash", "evidence hash mismatch"); return { ...body, evidenceHash };
}

export function createWorldPostDeployEvidence(inputValue: unknown): WorldPostDeployEvidence {
  const input = object(inputValue, "$", ["mainSha", "treeSha", "releaseArtifactHash", "migrationBundleHash", "allowlistHash"]); const body = { contractVersion: WORLD_POST_DEPLOY_EVIDENCE_VERSION, ...input, readerContractVersion: WORLD_DARK_READER_CONTRACT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, sourcePolicyVersion: ACCEPTED_SOURCE_POLICY.policyVersion, sourcePolicyHash: ACCEPTED_SOURCE_POLICY.policyHash, allowlistContractVersion: WORLD_INTERNAL_ALLOWLIST_CONTRACT_VERSION, status: "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" as const, executionAuthorized: false as const }; return parseWorldPostDeployEvidence({ ...body, evidenceHash: hashBody(body, []) });
}
