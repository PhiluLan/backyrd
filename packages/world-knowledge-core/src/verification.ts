import { hashBody } from "./canonical.js";
import { SOURCE_TYPES, type SourceType, type WorldKnowledgeClaim } from "./contracts.js";
import { evaluateClaimSource, parseSourcePolicy, type SourcePolicy } from "./source-policy.js";
import { array, ContractValidationError, enumValue, hash, identifier, number, object, required, string, timestamp } from "./schema.js";

export const VERIFICATION_PROCESS_CONTRACT_VERSION = "backyrd.world-knowledge.verification-process@1.0" as const;
export const VERIFICATION_AUTHORITY_CONTRACT_VERSION = "backyrd.world-knowledge.verification-authority@1.0" as const;
export const VERIFICATION_RECORD_CONTRACT_VERSION = "backyrd.world-knowledge.verification-record@1.0" as const;
export const VERIFICATION_RESULTS = ["VERIFIED", "REJECTED", "INCONCLUSIVE", "REQUIRES_REVIEW"] as const;
export const VERIFIER_ROLES = ["AUTHORIZED_HUMAN_VERIFIER", "INDEPENDENT_SYSTEM_CHECK"] as const;
export const VERIFICATION_AUTHORITY_CLASSES = ["PRODUCT_APPROVED_HUMAN_PROCESS", "PRODUCT_APPROVED_INDEPENDENT_CHECK"] as const;

export interface VerificationProcessContract {
  readonly contractVersion: typeof VERIFICATION_PROCESS_CONTRACT_VERSION;
  readonly processId: string;
  readonly processVersion: string;
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly attributeKeys: readonly string[];
  readonly allowedVerifierRoles: readonly typeof VERIFIER_ROLES[number][];
  readonly requiredAuthorityClass: typeof VERIFICATION_AUTHORITY_CLASSES[number];
  readonly requiredSourceTypes: readonly SourceType[];
  readonly freshnessPolicyRef: string;
  readonly allowedResults: readonly typeof VERIFICATION_RESULTS[number][];
  readonly maxFutureClockSkewSeconds: number;
  readonly processHash: string;
}

export interface VerificationExecutionAuthority {
  readonly contractVersion: typeof VERIFICATION_AUTHORITY_CONTRACT_VERSION;
  readonly authorityId: string;
  readonly processId: string;
  readonly processVersion: string;
  readonly processHash: string;
  readonly verifierRole: typeof VERIFIER_ROLES[number];
  readonly authorityClass: typeof VERIFICATION_AUTHORITY_CLASSES[number];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly authorityHash: string;
}

export interface AcceptedVerificationContext {
  readonly processes: readonly VerificationProcessContract[];
  readonly authorities: readonly VerificationExecutionAuthority[];
  readonly serverTime: string;
}

export interface VerificationRecord {
  readonly contractVersion: typeof VERIFICATION_RECORD_CONTRACT_VERSION;
  readonly recordId: string;
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly claimId: string;
  readonly claimHash: string;
  readonly attributeKey: string;
  readonly spotId: string;
  readonly processId: string;
  readonly processVersion: string;
  readonly processHash: string;
  readonly executionAuthorityId: string;
  readonly executionAuthorityHash: string;
  readonly verifierRole: typeof VERIFIER_ROLES[number];
  readonly sourceReferenceIds: readonly string[];
  readonly result: typeof VERIFICATION_RESULTS[number];
  readonly checkedAt: string;
  readonly reverificationPolicyRef: string;
  readonly reasonCodes: readonly string[];
  readonly resultHash: string;
}

export function createVerificationProcessContract(inputValue: unknown, policyValue: unknown): VerificationProcessContract {
  const policy = parseSourcePolicy(policyValue); const input = object(inputValue, "$", ["processId", "processVersion", "policyVersion", "policyHash", "attributeKeys", "allowedVerifierRoles", "requiredAuthorityClass", "requiredSourceTypes", "freshnessPolicyRef", "allowedResults", "maxFutureClockSkewSeconds"]);
  if (required(input, "policyVersion") !== policy.policyVersion || hash(required(input, "policyHash"), "$.policyHash") !== policy.policyHash) throw new ContractValidationError("$.policyVersion", "process does not bind accepted source policy");
  const attributeKeys = array(required(input, "attributeKeys"), "$.attributeKeys", { min: 1 }).map((value, index) => identifier(value, `$.attributeKeys[${index}]`)).sort();
  for (const key of attributeKeys) { const entry = policy.entries.find((item) => item.attributeKey === key); if (!entry || entry.state !== "CONFIGURED") throw new ContractValidationError("$.attributeKeys", `attribute policy is not configured:${key}`); }
  const processId = identifier(required(input, "processId"), "$.processId");
  for (const key of attributeKeys) if (!policy.entries.find((entry) => entry.attributeKey === key)?.verificationProcess.allowedProcessIds.includes(processId)) throw new ContractValidationError("$.processId", `process is not allowed for attribute:${key}`);
  const freshnessPolicyRef = identifier(required(input, "freshnessPolicyRef"), "$.freshnessPolicyRef");
  for (const key of attributeKeys) if (policy.entries.find((entry) => entry.attributeKey === key)?.freshness.policyRef !== freshnessPolicyRef) throw new ContractValidationError("$.freshnessPolicyRef", `process freshness does not match attribute policy:${key}`);
  const body = { contractVersion: VERIFICATION_PROCESS_CONTRACT_VERSION, processId, processVersion: string(required(input, "processVersion"), "$.processVersion", { pattern: /^\d+\.\d+$/ }), policyVersion: policy.policyVersion, policyHash: policy.policyHash, attributeKeys, allowedVerifierRoles: array(required(input, "allowedVerifierRoles"), "$.allowedVerifierRoles", { min: 1 }).map((value, index) => enumValue(value, VERIFIER_ROLES, `$.allowedVerifierRoles[${index}]`)).sort(), requiredAuthorityClass: enumValue(required(input, "requiredAuthorityClass"), VERIFICATION_AUTHORITY_CLASSES, "$.requiredAuthorityClass"), requiredSourceTypes: array(required(input, "requiredSourceTypes"), "$.requiredSourceTypes", { min: 1 }).map((value, index) => enumValue(value, SOURCE_TYPES, `$.requiredSourceTypes[${index}]`)).sort(), freshnessPolicyRef, allowedResults: array(required(input, "allowedResults"), "$.allowedResults", { min: 1 }).map((value, index) => enumValue(value, VERIFICATION_RESULTS, `$.allowedResults[${index}]`)).sort(), maxFutureClockSkewSeconds: number(required(input, "maxFutureClockSkewSeconds"), "$.maxFutureClockSkewSeconds", { min: 0, max: 3600, integer: true }) };
  return { ...body, processHash: hashBody(body, []) };
}

export function parseVerificationProcessContract(value: unknown, policy: SourcePolicy): VerificationProcessContract {
  const input = object(value, "$", ["contractVersion", "processId", "processVersion", "policyVersion", "policyHash", "attributeKeys", "allowedVerifierRoles", "requiredAuthorityClass", "requiredSourceTypes", "freshnessPolicyRef", "allowedResults", "maxFutureClockSkewSeconds", "processHash"]);
  if (required(input, "contractVersion") !== VERIFICATION_PROCESS_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown verification process contract");
  const { contractVersion: _contract, processHash: supplied, ...draft } = input; const parsed = createVerificationProcessContract(draft, policy);
  if (parsed.processHash !== hash(supplied, "$.processHash")) throw new ContractValidationError("$.processHash", "process hash mismatch"); return parsed;
}

export function createVerificationExecutionAuthority(inputValue: unknown, processValue: unknown, policy: SourcePolicy): VerificationExecutionAuthority {
  const process = parseVerificationProcessContract(processValue, policy); const input = object(inputValue, "$", ["authorityId", "processId", "processVersion", "processHash", "verifierRole", "authorityClass", "validFrom", "validUntil"]);
  if (required(input, "processId") !== process.processId || required(input, "processVersion") !== process.processVersion || hash(required(input, "processHash"), "$.processHash") !== process.processHash) throw new ContractValidationError("$.processId", "authority does not bind accepted process");
  const verifierRole = enumValue(required(input, "verifierRole"), VERIFIER_ROLES, "$.verifierRole"); if (!process.allowedVerifierRoles.includes(verifierRole)) throw new ContractValidationError("$.verifierRole", "role is not authorized by process");
  const authorityClass = enumValue(required(input, "authorityClass"), VERIFICATION_AUTHORITY_CLASSES, "$.authorityClass"); if (authorityClass !== process.requiredAuthorityClass) throw new ContractValidationError("$.authorityClass", "authority class does not match process");
  const validFrom = timestamp(required(input, "validFrom"), "$.validFrom"); const validUntil = timestamp(required(input, "validUntil"), "$.validUntil"); if (validUntil < validFrom) throw new ContractValidationError("$.validUntil", "authority ends before it begins");
  const body = { contractVersion: VERIFICATION_AUTHORITY_CONTRACT_VERSION, authorityId: identifier(required(input, "authorityId"), "$.authorityId"), processId: process.processId, processVersion: process.processVersion, processHash: process.processHash, verifierRole, authorityClass, validFrom, validUntil };
  return { ...body, authorityHash: hashBody(body, []) };
}

export function parseVerificationExecutionAuthority(value: unknown, process: VerificationProcessContract, policy: SourcePolicy): VerificationExecutionAuthority {
  const input = object(value, "$", ["contractVersion", "authorityId", "processId", "processVersion", "processHash", "verifierRole", "authorityClass", "validFrom", "validUntil", "authorityHash"]);
  if (required(input, "contractVersion") !== VERIFICATION_AUTHORITY_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown verification authority contract");
  const { contractVersion: _contract, authorityHash: supplied, ...draft } = input; const parsed = createVerificationExecutionAuthority(draft, process, policy);
  if (parsed.authorityHash !== hash(supplied, "$.authorityHash")) throw new ContractValidationError("$.authorityHash", "authority hash mismatch"); return parsed;
}

function acceptedContext(contextValue: AcceptedVerificationContext | undefined, policy: SourcePolicy, processId: string, processVersion: string, processHash: string, authorityId: string, authorityHash: string): { process: VerificationProcessContract; authority: VerificationExecutionAuthority; serverTime: string } {
  if (!contextValue) throw new ContractValidationError("$.verificationAuthority", "accepted verification authority is required");
  const serverTime = timestamp(contextValue.serverTime, "$.verificationAuthority.serverTime");
  const processCandidate = contextValue.processes.find((item) => item.processId === processId && item.processVersion === processVersion && item.processHash === processHash); if (!processCandidate) throw new ContractValidationError("$.processVersion", "unknown or stale verification process version");
  const process = parseVerificationProcessContract(processCandidate, policy);
  const authorityCandidate = contextValue.authorities.find((item) => item.authorityId === authorityId && item.authorityHash === authorityHash); if (!authorityCandidate) throw new ContractValidationError("$.executionAuthorityId", "verification authority was not accepted by the caller");
  const authority = parseVerificationExecutionAuthority(authorityCandidate, process, policy);
  return { process, authority, serverTime };
}

export function createVerificationRecord(inputValue: unknown, claim: WorldKnowledgeClaim, policyValue: unknown, context?: AcceptedVerificationContext): VerificationRecord {
  const policy = parseSourcePolicy(policyValue); const input = object(inputValue, "$", ["recordId", "policyVersion", "policyHash", "claimId", "claimHash", "attributeKey", "spotId", "processId", "processVersion", "processHash", "executionAuthorityId", "executionAuthorityHash", "verifierRole", "sourceReferenceIds", "result", "checkedAt", "reverificationPolicyRef", "reasonCodes"]);
  if (required(input, "policyVersion") !== policy.policyVersion || hash(required(input, "policyHash"), "$.policyHash") !== policy.policyHash) throw new ContractValidationError("$.policyVersion", "unknown or mismatched source policy");
  const claimId = identifier(required(input, "claimId"), "$.claimId"); const claimHash = hash(required(input, "claimHash"), "$.claimHash"); const attributeKey = identifier(required(input, "attributeKey"), "$.attributeKey"); const spotId = identifier(required(input, "spotId"), "$.spotId");
  if (claimId !== claim.claimId || claimHash !== claim.contentHash || attributeKey !== claim.attributeKey || spotId !== claim.scope.spotId) throw new ContractValidationError("$", "verification record does not bind the supplied claim, key, and spot");
  const entry = policy.entries.find((item) => item.attributeKey === attributeKey); if (!entry || entry.state !== "CONFIGURED") throw new ContractValidationError("$.attributeKey", "verification policy is not configured for attribute");
  if (claim.sourceType === "AI_INFERENCE") throw new ContractValidationError("$.claimId", "AI inference cannot be verified without an independent source claim");
  const assessment = evaluateClaimSource(claim, policy); if (assessment.status !== "AUTHORIZED") throw new ContractValidationError("$.claimId", `claim source is not authorized:${assessment.reasonCodes.join(",")}`);
  const processId = identifier(required(input, "processId"), "$.processId"); const processVersion = string(required(input, "processVersion"), "$.processVersion", { pattern: /^\d+\.\d+$/ }); const processHash = hash(required(input, "processHash"), "$.processHash");
  const executionAuthorityId = identifier(required(input, "executionAuthorityId"), "$.executionAuthorityId"); const executionAuthorityHash = hash(required(input, "executionAuthorityHash"), "$.executionAuthorityHash");
  const accepted = acceptedContext(context, policy, processId, processVersion, processHash, executionAuthorityId, executionAuthorityHash); if (!accepted.process.attributeKeys.includes(attributeKey) || !accepted.process.requiredSourceTypes.includes(claim.sourceType)) throw new ContractValidationError("$.processId", "process does not authorize this attribute and source type");
  const verifierRole = enumValue(required(input, "verifierRole"), VERIFIER_ROLES, "$.verifierRole"); if (verifierRole !== accepted.authority.verifierRole) throw new ContractValidationError("$.verifierRole", "record role is not bound by accepted execution authority");
  const checkedAt = timestamp(required(input, "checkedAt"), "$.checkedAt"); if (checkedAt < claim.observedAt) throw new ContractValidationError("$.checkedAt", "verification cannot predate claim observation");
  if (Date.parse(checkedAt) > Date.parse(accepted.serverTime) + accepted.process.maxFutureClockSkewSeconds * 1000) throw new ContractValidationError("$.checkedAt", "verification exceeds server clock skew");
  if (checkedAt < accepted.authority.validFrom || checkedAt > accepted.authority.validUntil) throw new ContractValidationError("$.checkedAt", "verification occurred outside authority validity");
  const reverificationPolicyRef = identifier(required(input, "reverificationPolicyRef"), "$.reverificationPolicyRef"); if (reverificationPolicyRef !== entry.freshness.policyRef || reverificationPolicyRef !== accepted.process.freshnessPolicyRef) throw new ContractValidationError("$.reverificationPolicyRef", "reverification policy does not match source and process policy");
  const sourceReferenceIds = array(required(input, "sourceReferenceIds"), "$.sourceReferenceIds", { min: 1 }).map((value, index) => identifier(value, `$.sourceReferenceIds[${index}]`)).sort(); if (sourceReferenceIds.some((value) => !value.startsWith("source:"))) throw new ContractValidationError("$.sourceReferenceIds", "verification evidence must use source namespace"); if (claim.sourceReferenceId && !sourceReferenceIds.includes(claim.sourceReferenceId)) throw new ContractValidationError("$.sourceReferenceIds", "verification evidence does not include the claim-bound source");
  const result = enumValue(required(input, "result"), VERIFICATION_RESULTS, "$.result"); if (!accepted.process.allowedResults.includes(result)) throw new ContractValidationError("$.result", "result is not authorized by process");
  const body = { contractVersion: VERIFICATION_RECORD_CONTRACT_VERSION, recordId: identifier(required(input, "recordId"), "$.recordId"), policyVersion: policy.policyVersion, policyHash: policy.policyHash, claimId, claimHash, attributeKey, spotId, processId, processVersion, processHash, executionAuthorityId, executionAuthorityHash, verifierRole, sourceReferenceIds, result, checkedAt, reverificationPolicyRef, reasonCodes: array(required(input, "reasonCodes"), "$.reasonCodes", { min: 1 }).map((value, index) => identifier(value, `$.reasonCodes[${index}]`)).sort() };
  return { ...body, resultHash: hashBody(body, []) };
}

export function parseVerificationRecord(value: unknown, claim: WorldKnowledgeClaim, policy: SourcePolicy, context?: AcceptedVerificationContext): VerificationRecord {
  const input = object(value, "$", ["contractVersion", "recordId", "policyVersion", "policyHash", "claimId", "claimHash", "attributeKey", "spotId", "processId", "processVersion", "processHash", "executionAuthorityId", "executionAuthorityHash", "verifierRole", "sourceReferenceIds", "result", "checkedAt", "reverificationPolicyRef", "reasonCodes", "resultHash"]);
  if (required(input, "contractVersion") !== VERIFICATION_RECORD_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown verification record contract");
  const { contractVersion: _contract, resultHash: supplied, ...draft } = input; const parsed = createVerificationRecord(draft, claim, policy, context);
  if (parsed.resultHash !== hash(supplied, "$.resultHash")) throw new ContractValidationError("$.resultHash", "verification record hash mismatch"); return parsed;
}

export function verifiedClaimIds(records: readonly VerificationRecord[]): ReadonlySet<string> { return new Set(records.filter((record) => record.result === "VERIFIED").map((record) => record.claimId)); }
