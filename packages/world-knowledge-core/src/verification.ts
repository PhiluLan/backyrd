import { hashBody } from "./canonical.js";
import { type WorldKnowledgeClaim } from "./contracts.js";
import { REGISTRY_VERSION } from "./registry.js";
import { evaluateClaimSource, type SourcePolicy, parseSourcePolicy } from "./source-policy.js";
import { array, ContractValidationError, enumValue, hash, identifier, object, required, string, timestamp } from "./schema.js";

export const VERIFICATION_RECORD_CONTRACT_VERSION = "backyrd.world-knowledge.verification-record@1.0" as const;
export const VERIFICATION_RESULTS = ["VERIFIED", "REJECTED", "INCONCLUSIVE", "REQUIRES_REVIEW"] as const;
export const VERIFIER_ROLES = ["AUTHORIZED_HUMAN_VERIFIER", "INDEPENDENT_SYSTEM_CHECK"] as const;

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
  readonly verifierRole: typeof VERIFIER_ROLES[number];
  readonly sourceReferenceIds: readonly string[];
  readonly result: typeof VERIFICATION_RESULTS[number];
  readonly checkedAt: string;
  readonly reverificationPolicyRef: string;
  readonly reasonCodes: readonly string[];
  readonly resultHash: string;
}

export function createVerificationRecord(inputValue: unknown, claim: WorldKnowledgeClaim, policyValue: unknown): VerificationRecord {
  const policy = parseSourcePolicy(policyValue); const input = object(inputValue, "$", ["recordId", "policyVersion", "policyHash", "claimId", "claimHash", "attributeKey", "spotId", "processId", "processVersion", "verifierRole", "sourceReferenceIds", "result", "checkedAt", "reverificationPolicyRef", "reasonCodes"]);
  const policyVersion = string(required(input, "policyVersion"), "$.policyVersion", { min: 1 }); const policyHash = hash(required(input, "policyHash"), "$.policyHash");
  if (policyVersion !== policy.policyVersion || policyHash !== policy.policyHash) throw new ContractValidationError("$.policyVersion", "unknown or mismatched source policy");
  const claimId = identifier(required(input, "claimId"), "$.claimId"); const claimHash = hash(required(input, "claimHash"), "$.claimHash"); const attributeKey = identifier(required(input, "attributeKey"), "$.attributeKey"); const spotId = identifier(required(input, "spotId"), "$.spotId");
  if (claimId !== claim.claimId || claimHash !== claim.contentHash || attributeKey !== claim.attributeKey || spotId !== claim.scope.spotId) throw new ContractValidationError("$", "verification record does not bind the supplied claim, key, and spot");
  const entry = policy.entries.find((item) => item.attributeKey === attributeKey); if (!entry || entry.state !== "CONFIGURED") throw new ContractValidationError("$.attributeKey", "verification policy is not configured for attribute");
  if (claim.sourceType === "AI_INFERENCE") throw new ContractValidationError("$.claimId", "AI inference cannot be verified without an independent source claim");
  const sourceAssessment = evaluateClaimSource(claim, policy); if (sourceAssessment.status === "REJECTED") throw new ContractValidationError("$.claimId", `claim source is not authorized:${sourceAssessment.reasonCodes.join(",")}`);
  if (claim.sourceType === "OWNER_ASSERTION" && !entry.selfAssertionAllowed) throw new ContractValidationError("$.claimId", "self-assertion is not permitted for this attribute");
  const processId = identifier(required(input, "processId"), "$.processId"); if (entry.verificationProcess.requirement !== "PROCESS_REQUIRED" || !entry.verificationProcess.allowedProcessIds.includes(processId)) throw new ContractValidationError("$.processId", "verification process is not authorized by policy");
  const sourceReferenceIds = array(required(input, "sourceReferenceIds"), "$.sourceReferenceIds", { min: 1 }).map((value, index) => identifier(value, `$.sourceReferenceIds[${index}]`)).sort();
  if (sourceReferenceIds.some((value) => !value.startsWith("source:"))) throw new ContractValidationError("$.sourceReferenceIds", "verification evidence must use source namespace");
  if (claim.sourceReferenceId && !sourceReferenceIds.includes(claim.sourceReferenceId)) throw new ContractValidationError("$.sourceReferenceIds", "verification evidence does not include the claim-bound source");
  const result = enumValue(required(input, "result"), VERIFICATION_RESULTS, "$.result");
  const body = { contractVersion: VERIFICATION_RECORD_CONTRACT_VERSION, recordId: identifier(required(input, "recordId"), "$.recordId"), policyVersion, policyHash, claimId, claimHash, attributeKey, spotId, processId, processVersion: string(required(input, "processVersion"), "$.processVersion", { pattern: /^\d+\.\d+$/ }), verifierRole: enumValue(required(input, "verifierRole"), VERIFIER_ROLES, "$.verifierRole"), sourceReferenceIds, result, checkedAt: timestamp(required(input, "checkedAt"), "$.checkedAt"), reverificationPolicyRef: identifier(required(input, "reverificationPolicyRef"), "$.reverificationPolicyRef"), reasonCodes: array(required(input, "reasonCodes"), "$.reasonCodes", { min: 1 }).map((value, index) => identifier(value, `$.reasonCodes[${index}]`)).sort() };
  return { ...body, resultHash: hashBody(body, []) };
}

export function parseVerificationRecord(value: unknown, claim: WorldKnowledgeClaim, policy: SourcePolicy): VerificationRecord {
  const input = object(value, "$", ["contractVersion", "recordId", "policyVersion", "policyHash", "claimId", "claimHash", "attributeKey", "spotId", "processId", "processVersion", "verifierRole", "sourceReferenceIds", "result", "checkedAt", "reverificationPolicyRef", "reasonCodes", "resultHash"]);
  if (required(input, "contractVersion") !== VERIFICATION_RECORD_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown verification record contract");
  const { contractVersion: _contract, resultHash: supplied, ...draft } = input; const parsed = createVerificationRecord(draft, claim, policy);
  if (parsed.resultHash !== hash(supplied, "$.resultHash")) throw new ContractValidationError("$.resultHash", "verification record hash mismatch"); return parsed;
}

export function verifiedClaimIds(records: readonly VerificationRecord[]): ReadonlySet<string> {
  return new Set(records.filter((record) => record.result === "VERIFIED").map((record) => record.claimId));
}
