import { canonicalJson, hashBody } from "./canonical.js";
import { createClaim, parseAttributeValue, type ActorType, type ClaimValue, type WorldKnowledgeClaim } from "./contracts.js";
import { createRegistryApprovalAuthority, createRegistryApprovalRecord, createRegistryRelease } from "./governance.js";
import { ATTRIBUTE_DEFINITIONS, PREVIOUS_REGISTRY_VERSION, REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { ContractValidationError, array, enumValue, hash, identifier, object, required, string, timestamp } from "./schema.js";
import { SOURCE_USE_CASES, createSourcePolicy, type SourcePolicy, type SourceUseCase } from "./source-policy.js";

export const ACCEPTED_POLICY_VERSION = "backyrd.world-knowledge.source-policy@4a.2" as const;
export const ENTITLEMENT_POLICY_CONTRACT_VERSION = "backyrd.world-knowledge.entitlement-policy@1.0" as const;
export const ENTITLEMENT_POLICY_VERSION = "backyrd.world-knowledge.entitlement-policy@4a.2" as const;
export const SERVER_WRITE_CONTRACT_VERSION = "backyrd.world-knowledge.server-write@1.0" as const;
export const CONFIRMATION_RECORD_CONTRACT_VERSION = "backyrd.world-knowledge.confirmation-record@1.1" as const;
export const REVIEW_WORK_ITEM_CONTRACT_VERSION = "backyrd.world-knowledge.review-work-item@1.0" as const;
export const IDENTITY_EVENT_CONTRACT_VERSION = "backyrd.world-knowledge.identity-event@1.0" as const;
export const HOLIDAY_REMINDER_CONTRACT_VERSION = "backyrd.world-knowledge.holiday-reminder@1.0" as const;
export const RETENTION_POLICY_CONTRACT_VERSION = "backyrd.world-knowledge.retention-policy@1.0" as const;

export const SLICE4A_REGISTRY_APPROVAL_AUTHORITY = createRegistryApprovalAuthority({ authorityId: "authority:slice-4a-founder-authoring-readiness", allowedRoles: ["PRODUCT_CTO"], allowedChangeClasses: ["SEMANTIC_CHANGE"], semanticEquivalenceApproval: false, validFrom: "2026-09-12T09:59:00.000Z", validUntil: "2026-09-12T10:01:00.000Z" });
export const SLICE4A_REGISTRY_APPROVAL_RECORD = createRegistryApprovalRecord({ recordId: "approval:slice-4a-authoring-readiness", authorityId: SLICE4A_REGISTRY_APPROVAL_AUTHORITY.authorityId, authorityHash: SLICE4A_REGISTRY_APPROVAL_AUTHORITY.authorityHash, role: "PRODUCT_CTO", registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, changeClass: "SEMANTIC_CHANGE", approvedAt: "2026-09-12T10:00:00.000Z" }, SLICE4A_REGISTRY_APPROVAL_AUTHORITY);
export const SLICE4A_REGISTRY_RELEASE = createRegistryRelease({ registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, predecessorVersion: PREVIOUS_REGISTRY_VERSION, changeClass: "SEMANTIC_CHANGE", createdAt: "2026-09-12T10:00:00.000Z", approval: { recordId: SLICE4A_REGISTRY_APPROVAL_RECORD.recordId, approvalHash: SLICE4A_REGISTRY_APPROVAL_RECORD.approvalHash, role: SLICE4A_REGISTRY_APPROVAL_RECORD.role, approvedAt: SLICE4A_REGISTRY_APPROVAL_RECORD.approvedAt, authorityId: SLICE4A_REGISTRY_APPROVAL_AUTHORITY.authorityId, authorityHash: SLICE4A_REGISTRY_APPROVAL_AUTHORITY.authorityHash }, changeSummary: ["Expand objective authoring taxonomies", "Add special kitchen hours", "Add scoped age and accompaniment rules"], compatibilityStatus: "REQUIRES_ADAPTER", deprecations: [], aliases: [] });

/** @deprecated Compatibility aliases for pre-closure consumers; use SLICE4A_* for Registry 2.0. */
export const SLICE3B_REGISTRY_APPROVAL_AUTHORITY = SLICE4A_REGISTRY_APPROVAL_AUTHORITY;
/** @deprecated Compatibility alias; use SLICE4A_REGISTRY_APPROVAL_RECORD. */
export const SLICE3B_REGISTRY_APPROVAL_RECORD = SLICE4A_REGISTRY_APPROVAL_RECORD;
/** @deprecated Compatibility alias; use SLICE4A_REGISTRY_RELEASE. */
export const SLICE3B_REGISTRY_RELEASE = SLICE4A_REGISTRY_RELEASE;

export const OWNER_BASIC_KEYS = Object.freeze([
  "identity.name", "location.address_line1", "location.locality", "location.neighborhood", "location.country_code", "location.latitude", "location.longitude", "location.timezone",
  "classification.primary_category", "classification.place_types", "contact.public_email", "contact.website", "contact.phone", "contact.instagram", "contact.facebook", "contact.linkedin", "contact.tiktok",
  "description.highlight", "operation.price_level", "operation.payment_methods", "operation.takeaway", "operation.service_model", "operation.service_format",
  "offering.cuisines", "offering.food_specialities", "offering.groups", "hours.regular", "hours.special", "hours.kitchen", "hours.kitchen_special", "state.current",
] as const);

export const OWNER_PRO_KEYS = Object.freeze([
  ...OWNER_BASIC_KEYS,
  "operation.laptop_policy", "operation.stay_policy", "capacity.seats_total", "capacity.seats_indoor", "capacity.seats_outdoor", "capacity.group_size_supported",
  "rule.reservation", "rule.external_food", "rule.external_drink", "amenity.features", "rule.pet_access", "rule.age_access", "rule.age_access_conditions",
  "accessibility.step_free_entrance", "accessibility.wheelchair_paths", "accessibility.accessible_seating", "accessibility.accessible_toilet", "accessibility.accessible_outdoor", "accessibility.accessible_indoor", "accessibility.elevator",
] as const);

export const OWNER_PRO_ONLY_KEYS = Object.freeze(OWNER_PRO_KEYS.filter((key) => !(OWNER_BASIC_KEYS as readonly string[]).includes(key)));
export const SUBJECTIVE_OBJECTIVE_EXCLUSIONS = Object.freeze(["research.subjective_fits"] as const);

export interface EntitlementPolicyRelease {
  readonly contractVersion: typeof ENTITLEMENT_POLICY_CONTRACT_VERSION;
  readonly policyVersion: typeof ENTITLEMENT_POLICY_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
  readonly basicKeys: readonly string[];
  readonly proKeys: readonly string[];
  readonly adminKeys: readonly string[];
  readonly excludedObjectiveKeys: readonly string[];
  readonly commercialInfluence: "AUTHORING_SCOPE_ONLY";
  readonly policyHash: string;
}

function validateKeySet(values: unknown, path: string): readonly string[] {
  const result = array(values, path, { min: 1 }).map((value, index) => identifier(value, `${path}[${index}]`)).sort();
  if (new Set(result).size !== result.length) throw new ContractValidationError(path, "duplicate attribute key");
  for (const key of result) if (!ATTRIBUTE_DEFINITIONS.some((definition) => definition.key === key)) throw new ContractValidationError(path, `unknown attribute key:${key}`);
  return result;
}

export function createEntitlementPolicyRelease(inputValue: unknown): EntitlementPolicyRelease {
  const input = object(inputValue, "$", ["policyVersion", "registryVersion", "registryHash", "basicKeys", "proKeys", "adminKeys", "excludedObjectiveKeys", "commercialInfluence"]);
  if (required(input, "policyVersion") !== ENTITLEMENT_POLICY_VERSION || required(input, "registryVersion") !== REGISTRY_VERSION || hash(required(input, "registryHash"), "$.registryHash") !== REGISTRY_HASH) throw new ContractValidationError("$", "unknown entitlement or registry identity");
  const basicKeys = validateKeySet(required(input, "basicKeys"), "$.basicKeys"); const proKeys = validateKeySet(required(input, "proKeys"), "$.proKeys"); const adminKeys = validateKeySet(required(input, "adminKeys"), "$.adminKeys"); const excludedObjectiveKeys = validateKeySet(required(input, "excludedObjectiveKeys"), "$.excludedObjectiveKeys");
  if (basicKeys.some((key) => !proKeys.includes(key)) || canonicalJson(proKeys) !== canonicalJson(adminKeys)) throw new ContractValidationError("$", "Basic must be a Pro subset and Admin scope must equal Pro scope");
  if (excludedObjectiveKeys.some((key) => basicKeys.includes(key) || proKeys.includes(key))) throw new ContractValidationError("$.excludedObjectiveKeys", "subjective keys cannot be owner/admin objective authority");
  if (required(input, "commercialInfluence") !== "AUTHORING_SCOPE_ONLY") throw new ContractValidationError("$.commercialInfluence", "commercial state may only control authoring scope");
  const body = { contractVersion: ENTITLEMENT_POLICY_CONTRACT_VERSION, policyVersion: ENTITLEMENT_POLICY_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, basicKeys, proKeys, adminKeys, excludedObjectiveKeys, commercialInfluence: "AUTHORING_SCOPE_ONLY" as const };
  return { ...body, policyHash: hashBody(body, []) };
}

export function parseEntitlementPolicyRelease(value: unknown): EntitlementPolicyRelease {
  const input = object(value, "$", ["contractVersion", "policyVersion", "registryVersion", "registryHash", "basicKeys", "proKeys", "adminKeys", "excludedObjectiveKeys", "commercialInfluence", "policyHash"]);
  if (required(input, "contractVersion") !== ENTITLEMENT_POLICY_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown entitlement contract");
  const { contractVersion: _contract, policyHash: supplied, ...draft } = input; const parsed = createEntitlementPolicyRelease(draft);
  if (parsed.policyHash !== hash(supplied, "$.policyHash")) throw new ContractValidationError("$.policyHash", "entitlement policy hash mismatch"); return parsed;
}

export const ACCEPTED_ENTITLEMENT_POLICY = createEntitlementPolicyRelease({ policyVersion: ENTITLEMENT_POLICY_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, basicKeys: OWNER_BASIC_KEYS, proKeys: OWNER_PRO_KEYS, adminKeys: OWNER_PRO_KEYS, excludedObjectiveKeys: SUBJECTIVE_OBJECTIVE_EXCLUSIONS, commercialInfluence: "AUTHORING_SCOPE_ONLY" });

const usesFor = (key: string): readonly SourceUseCase[] => {
  if (key.startsWith("contact.")) return ["GENERAL_WORLD", "EXPLANATION", "RESEARCH"];
  if (key.startsWith("hours.") || key === "state.current") return ["GENERAL_WORLD", "OPENING_HOURS_ELIGIBILITY", "RESEARCH"];
  if (["operation.price_level", "operation.price_range"].includes(key)) return ["GENERAL_WORLD", "PRICE", "RESEARCH"];
  if (key.startsWith("accessibility.")) return ["GENERAL_WORLD", "ACCESSIBILITY", "HARD_CONSTRAINTS", "RESEARCH"];
  if (["operation.takeaway", "rule.reservation", "rule.external_food", "rule.external_drink", "rule.age_access", "rule.age_access_conditions", "rule.pet_access"].includes(key)) return ["GENERAL_WORLD", "HARD_CONSTRAINTS", "RESEARCH"];
  if (key === "description.highlight" || key === "research.subjective_fits") return ["EXPLANATION", "RESEARCH"];
  return ["GENERAL_WORLD", "DISCOVERY", "RESEARCH"];
};

const freshnessFor = (key: string): SourcePolicy["entries"][number]["freshness"] => key === "state.current"
  ? { policyRef: "freshness:current-state:explicit-valid-until", mode: "REQUIRES_VALID_UNTIL" }
  : ["hours.special", "hours.kitchen_special"].includes(key) ? { policyRef: "freshness:special-hours:date-bound", mode: "SCHEDULE_BOUND" }
  : key.startsWith("hours.") ? { policyRef: "freshness:opening-hours:confirmed-until-changed", mode: "SCHEDULE_BOUND" }
  : { policyRef: "freshness:durable-until-contradicted", mode: "PERMANENT_UNTIL_CONTRADICTED" };

export const ACCEPTED_SOURCE_POLICY = createSourcePolicy({
  policyVersion: ACCEPTED_POLICY_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, createdAt: "2026-09-10T18:00:00.000Z",
  entries: ATTRIBUTE_DEFINITIONS.map((definition) => {
    const subjective = definition.engineAuthorization === "EXPLANATION_ONLY" && definition.key === "research.subjective_fits"; const allowed = usesFor(definition.key);
    return {
      attributeKey: definition.key, state: "CONFIGURED", allowedSourceTypes: subjective ? ["USER_REPORT"] : ["OWNER_ASSERTION", "ADMIN_OBSERVATION", "OFFICIAL_SOURCE"],
      allowedActorTypes: subjective ? ["PUBLIC_CONTRIBUTOR"] : ["VERIFIED_OWNER", "ADMIN"], sourceReference: "REQUIRED", selfAssertionAllowed: !subjective,
      verificationProcess: { requirement: subjective ? "NONE" : "PROCESS_REQUIRED", allowedProcessIds: subjective ? [] : ["process:owner-confirmed", "process:admin-confirmed"] }, freshness: freshnessFor(definition.key), conflictPolicy: "POLICY_SELECTED_WITH_ALTERNATIVES",
      useCases: Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, allowed.includes(useCase) ? "ALLOWED" : "PROHIBITED"])),
      minimumTrustByUseCase: Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, allowed.includes(useCase) ? subjective ? "ASSERTED" : "VERIFIED" : null])),
    };
  }),
});

export interface ServerAuthoringContext { readonly serverTime: string; readonly actorId: string; readonly actorType: "VERIFIED_OWNER" | "ADMIN"; readonly ownedSpotIds: readonly string[]; readonly entitlement: "BASIC" | "PRO"; readonly acceptedRegistryVersion: string; readonly acceptedPolicyVersion: string; readonly acceptedEntitlementPolicyVersion: string }
export interface ServerWriteReceipt { readonly contractVersion: typeof SERVER_WRITE_CONTRACT_VERSION; readonly claim: WorldKnowledgeClaim; readonly actorId: string; readonly verificationMethod: "OWNER_CONFIRMED" | "ADMIN_CONFIRMED"; readonly sourceAuthority: "SERVER_BOUND_OWNER_WRITE" | "SERVER_BOUND_ADMIN_WRITE"; readonly entitlementPolicyHash: string; readonly receiptHash: string }

export function createServerVerifiedClaim(requestValue: unknown, contextValue: unknown, entitlementValue: unknown = ACCEPTED_ENTITLEMENT_POLICY): ServerWriteReceipt {
  const request = object(requestValue, "$.request", ["claimId", "spotId", "attributeKey", "area", "knowledgeState", "value", "observedAt", "validFrom", "validUntil", "visibility", "supersedesClaimId", "idempotencyKey"]);
  const context = object(contextValue, "$.context", ["serverTime", "actorId", "actorType", "ownedSpotIds", "entitlement", "acceptedRegistryVersion", "acceptedPolicyVersion", "acceptedEntitlementPolicyVersion"]); const policy = parseEntitlementPolicyRelease(entitlementValue);
  const serverTime = timestamp(required(context, "serverTime", "$.context"), "$.context.serverTime"); const actorId = identifier(required(context, "actorId", "$.context"), "$.context.actorId"); const actorType = enumValue(required(context, "actorType", "$.context"), ["VERIFIED_OWNER", "ADMIN"] as const, "$.context.actorType"); const entitlement = enumValue(required(context, "entitlement", "$.context"), ["BASIC", "PRO"] as const, "$.context.entitlement");
  if (required(context, "acceptedRegistryVersion", "$.context") !== REGISTRY_VERSION || required(context, "acceptedPolicyVersion", "$.context") !== ACCEPTED_POLICY_VERSION || required(context, "acceptedEntitlementPolicyVersion", "$.context") !== ENTITLEMENT_POLICY_VERSION) throw new ContractValidationError("$.context", "unknown accepted policy identity");
  const spotId = identifier(required(request, "spotId", "$.request"), "$.request.spotId"); const ownedSpotIds = array(required(context, "ownedSpotIds", "$.context"), "$.context.ownedSpotIds").map((value, index) => identifier(value, `$.context.ownedSpotIds[${index}]`));
  if (actorType === "VERIFIED_OWNER" && !ownedSpotIds.includes(spotId)) throw new ContractValidationError("$.request.spotId", "owner is not bound to this spot");
  const attributeKey = identifier(required(request, "attributeKey", "$.request"), "$.request.attributeKey"); const allowedKeys = actorType === "ADMIN" ? policy.adminKeys : entitlement === "PRO" ? policy.proKeys : policy.basicKeys; if (!allowedKeys.includes(attributeKey)) throw new ContractValidationError("$.request.attributeKey", "attribute is outside server-authorized entitlement scope");
  const observedAt = timestamp(required(request, "observedAt", "$.request"), "$.request.observedAt"); if (observedAt > serverTime) throw new ContractValidationError("$.request.observedAt", "observation cannot be in the future");
  const knowledgeState = enumValue(required(request, "knowledgeState", "$.request"), ["KNOWN_TRUE", "KNOWN_FALSE", "KNOWN_VALUE", "UNKNOWN"] as const, "$.request.knowledgeState"); const rawValue = required(request, "value", "$.request"); const value: ClaimValue = knowledgeState === "UNKNOWN" ? rawValue as ClaimValue : parseAttributeValue(attributeKey, rawValue, "$.request.value"); const validUntilRaw = required(request, "validUntil", "$.request"); if (attributeKey === "state.current" && validUntilRaw === null) throw new ContractValidationError("$.request.validUntil", "current state requires expiry");
  if (attributeKey.startsWith("contact.public_email") && actorType === "VERIFIED_OWNER" && typeof value !== "string") throw new ContractValidationError("$.request.value", "public email requires deliberate text input");
  const sourceReferenceId = `source:server-${actorType === "ADMIN" ? "admin" : "owner"}:${identifier(required(request, "idempotencyKey", "$.request"), "$.request.idempotencyKey")}`;
  const claim = createClaim({ claimId: identifier(required(request, "claimId", "$.request"), "$.request.claimId"), attributeKey, scope: { spotId, area: identifier(required(request, "area", "$.request"), "$.request.area") }, knowledgeState, value, actorType: actorType as ActorType, sourceType: actorType === "ADMIN" ? "ADMIN_OBSERVATION" : "OWNER_ASSERTION", sourceReferenceId, provenanceSessionId: `server:${actorId}`, verificationState: "VERIFIED", observedAt, validFrom: required(request, "validFrom", "$.request") as string | null, validUntil: validUntilRaw as string | null, stance: "SUPPORTS", visibility: enumValue(required(request, "visibility", "$.request"), ["PUBLIC", "INTERNAL"] as const, "$.request.visibility"), supersedesClaimId: required(request, "supersedesClaimId", "$.request") as string | null });
  const body = { contractVersion: SERVER_WRITE_CONTRACT_VERSION, claim, actorId, verificationMethod: actorType === "ADMIN" ? "ADMIN_CONFIRMED" as const : "OWNER_CONFIRMED" as const, sourceAuthority: actorType === "ADMIN" ? "SERVER_BOUND_ADMIN_WRITE" as const : "SERVER_BOUND_OWNER_WRITE" as const, entitlementPolicyHash: policy.policyHash };
  return { ...body, receiptHash: hashBody(body, []) };
}

export interface ConfirmationRecord { readonly contractVersion: typeof CONFIRMATION_RECORD_CONTRACT_VERSION; readonly recordId: string; readonly claimId: string; readonly claimHash: string; readonly spotId: string; readonly actorBindingId: string; readonly confirmedAt: string; readonly confirmationDueAt: string; readonly confirmedByActorType: "VERIFIED_OWNER" | "ADMIN"; readonly method: "OWNER_CONFIRMED" | "ADMIN_CONFIRMED"; readonly policyVersion: string; readonly reconfirmationPolicyRef: "confirmation:quarterly-request-v1"; readonly idempotencyKey: string; readonly changesSemanticValue: false; readonly recordHash: string }
export function createConfirmationRecord(inputValue: unknown, claim: WorldKnowledgeClaim): ConfirmationRecord {
  const input = object(inputValue, "$", ["recordId", "claimId", "claimHash", "spotId", "actorBindingId", "confirmedAt", "confirmationDueAt", "confirmedByActorType", "method", "policyVersion", "reconfirmationPolicyRef", "idempotencyKey", "changesSemanticValue"]);
  if (required(input, "claimId") !== claim.claimId || hash(required(input, "claimHash"), "$.claimHash") !== claim.contentHash || required(input, "spotId") !== claim.scope.spotId || required(input, "changesSemanticValue") !== false) throw new ContractValidationError("$", "confirmation must bind an unchanged claim");
  const actor = enumValue(required(input, "confirmedByActorType"), ["VERIFIED_OWNER", "ADMIN"] as const, "$.confirmedByActorType"); const method = enumValue(required(input, "method"), ["OWNER_CONFIRMED", "ADMIN_CONFIRMED"] as const, "$.method"); if ((actor === "VERIFIED_OWNER") !== (method === "OWNER_CONFIRMED")) throw new ContractValidationError("$.method", "method does not match actor");
  const confirmedAt = timestamp(required(input, "confirmedAt"), "$.confirmedAt"); const confirmationDueAt = timestamp(required(input, "confirmationDueAt"), "$.confirmationDueAt"); const expectedDue = new Date(confirmedAt); expectedDue.setUTCMonth(expectedDue.getUTCMonth() + 3); if (confirmationDueAt !== expectedDue.toISOString()) throw new ContractValidationError("$.confirmationDueAt", "quarterly confirmation due date mismatch");
  if (required(input, "policyVersion") !== ACCEPTED_POLICY_VERSION || required(input, "reconfirmationPolicyRef") !== "confirmation:quarterly-request-v1") throw new ContractValidationError("$.policyVersion", "confirmation policy binding mismatch");
  const body = { contractVersion: CONFIRMATION_RECORD_CONTRACT_VERSION, recordId: identifier(required(input, "recordId"), "$.recordId"), claimId: claim.claimId, claimHash: claim.contentHash, spotId: claim.scope.spotId, actorBindingId: identifier(required(input, "actorBindingId"), "$.actorBindingId"), confirmedAt, confirmationDueAt, confirmedByActorType: actor, method, policyVersion: ACCEPTED_POLICY_VERSION, reconfirmationPolicyRef: "confirmation:quarterly-request-v1" as const, idempotencyKey: identifier(required(input, "idempotencyKey"), "$.idempotencyKey"), changesSemanticValue: false as const }; return { ...body, recordHash: hashBody(body, []) };
}

export const IDENTITY_EVENT_TYPES = ["CREATED", "EXTERNAL_REFERENCE_ADDED", "ALIAS_ADDED", "DUPLICATE_SUSPECTED", "DUPLICATE_CONFIRMED", "MERGE_PROPOSED", "MERGE_CONFIRMED", "ARCHIVED", "RESTORED", "SPLIT", "MERGE_REVERSED", "TOMBSTONED"] as const;
export const REVIEW_WORK_ITEM_CLASSES = ["USER_REPORT", "AUTHORITY_CONFLICT", "CONTENT_SAFETY", "DUPLICATE_CANDIDATE", "HOLIDAY_HOURS_REMINDER", "CONFIRMATION_DUE"] as const;
export const RETENTION_DATA_CLASSES = ["PUBLIC_SPOT_FACT", "FACTUAL_CLAIM_HISTORY", "ACTOR_BINDING", "PRIVATE_SOURCE_PAYLOAD", "USER_REPORT", "MODERATION_EVIDENCE", "NON_PERSONAL_AUDIT_HASH", "WORK_ITEM", "REBUILDABLE_CACHE"] as const;

export function createIdentityEvent(inputValue: unknown) { const input = object(inputValue, "$", ["eventId", "eventType", "subjectSpotId", "relatedSpotId", "externalNamespace", "externalReferenceHash", "authorityRecordId", "occurredAt", "reasonCodes"]); const eventType = enumValue(required(input, "eventType"), IDENTITY_EVENT_TYPES, "$.eventType"); if (!["DUPLICATE_SUSPECTED", "MERGE_PROPOSED"].includes(eventType)) throw new ContractValidationError("$.eventType", "IDENTITY_OPERATION_AUTHORITY_NOT_CONFIGURED"); const related = required(input, "relatedSpotId"); const authority = required(input, "authorityRecordId"); const subjectSpotId = identifier(required(input, "subjectSpotId"), "$.subjectSpotId"); const relatedSpotId = related === null ? null : identifier(related, "$.relatedSpotId"); if (relatedSpotId === null || relatedSpotId === subjectSpotId || authority !== null) throw new ContractValidationError("$", "preparatory identity event requires a distinct pair and no mutation authority"); const body = { contractVersion: IDENTITY_EVENT_CONTRACT_VERSION, eventId: identifier(required(input, "eventId"), "$.eventId"), eventType, subjectSpotId, relatedSpotId, externalNamespace: required(input, "externalNamespace") === null ? null : identifier(required(input, "externalNamespace"), "$.externalNamespace"), externalReferenceHash: required(input, "externalReferenceHash") === null ? null : hash(required(input, "externalReferenceHash"), "$.externalReferenceHash"), authorityRecordId: null, occurredAt: timestamp(required(input, "occurredAt"), "$.occurredAt"), reasonCodes: array(required(input, "reasonCodes"), "$.reasonCodes", { min: 1 }).map((value, index) => identifier(value, `$.reasonCodes[${index}]`)).sort() }; return { ...body, eventHash: hashBody(body, []) }; }

export function createHolidayReminder(inputValue: unknown) { const input = object(inputValue, "$", ["workItemId", "spotId", "holidayCalendarVersion", "countryCode", "regionCode", "holidayDate", "holidayKey", "askAt", "state"]); const country = string(required(input, "countryCode"), "$.countryCode", { pattern: /^[A-Z]{2}$/ }); const holidayDate = string(required(input, "holidayDate"), "$.holidayDate", { pattern: /^\d{4}-\d{2}-\d{2}$/ }); const askAt = timestamp(required(input, "askAt"), "$.askAt"); if (new Date(`${holidayDate}T00:00:00.000Z`).getTime() - Date.parse(askAt) !== 7 * 86_400_000) throw new ContractValidationError("$.askAt", "reminder must be exactly seven days before bound holiday date"); const body = { contractVersion: HOLIDAY_REMINDER_CONTRACT_VERSION, workItemId: identifier(required(input, "workItemId"), "$.workItemId"), spotId: identifier(required(input, "spotId"), "$.spotId"), holidayCalendarVersion: identifier(required(input, "holidayCalendarVersion"), "$.holidayCalendarVersion"), countryCode: country, regionCode: identifier(required(input, "regionCode"), "$.regionCode"), holidayDate, holidayKey: identifier(required(input, "holidayKey"), "$.holidayKey"), askAt, state: enumValue(required(input, "state"), ["PLANNED", "CANCELLED", "COMPLETED"] as const, "$.state") }; return { ...body, reminderHash: hashBody(body, []) }; }

export const RETENTION_POLICY = Object.freeze({ contractVersion: RETENTION_POLICY_CONTRACT_VERSION, policyVersion: "backyrd.world-knowledge.retention-policy@3b.1", state: "REQUIRES_CTO_LEGAL_ACTIVATION", classes: RETENTION_DATA_CLASSES.map((dataClass) => ({ dataClass, duration: null, rule: ["PUBLIC_SPOT_FACT", "FACTUAL_CLAIM_HISTORY", "NON_PERSONAL_AUDIT_HASH"].includes(dataClass) ? "LONG_TERM_SUBJECT_TO_LEGAL_REVIEW" : dataClass === "REBUILDABLE_CACHE" ? "REBUILDABLE_DELETE_ANYTIME" : "PURPOSE_LIMITED_NOT_CONFIGURED" })), actorDeletion: "DETACH_AND_ROTATE_OPAQUE_PSEUDONYM_WHERE_LAWFUL", privacyClassification: "PSEUDONYMIZED_MAY_REMAIN_PERSONAL_NOT_ANONYMOUS", supports: ["EXPORT", "DELETION", "CORRECTION", "REBUILD"] });
export const RETENTION_POLICY_HASH = hashBody(RETENTION_POLICY, []);
