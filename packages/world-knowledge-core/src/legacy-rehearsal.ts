import { canonicalSort, hashBody, sha256 } from "./canonical.js";
import { LEGACY_MAPPING_HASH, LEGACY_MAPPING_VERSION, type MappingStatus } from "./legacy-mapping.js";
import { REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { ContractValidationError, array, identifier, object, required, string, timestamp } from "./schema.js";

export const LEGACY_EXPORT_CONTRACT_VERSION = "backyrd.world-knowledge.legacy-export@4a.1" as const;
export const LEGACY_TRANSFORM_CONTRACT_VERSION = "backyrd.world-knowledge.legacy-transform@4a.1" as const;
export const LEGACY_IMPORT_CONTRACT_VERSION = "backyrd.world-knowledge.legacy-local-import@4a.1" as const;
export const LEGACY_TARGET_ENVIRONMENT = "LOCAL_FOUNDER_EVALUATION" as const;
export const LEGACY_SPOT_STATUSES = ["ACTIVE_PUBLISHED", "DRAFT", "ARCHIVED", "TOMBSTONED", "DUPLICATE_CANDIDATE", "UNCLEAR"] as const;
export type LegacySpotStatus = typeof LEGACY_SPOT_STATUSES[number];

export interface LegacyExportRecord {
  readonly spotId: string;
  readonly lifecycle: LegacySpotStatus;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly recordHash: string;
}
export interface LegacyExportManifest {
  readonly contractVersion: typeof LEGACY_EXPORT_CONTRACT_VERSION;
  readonly batchId: string;
  readonly sourceSnapshotAt: string;
  readonly schemaFingerprint: string;
  readonly scope: "ACTIVE_PUBLISHED_ONLY";
  readonly records: readonly LegacyExportRecord[];
  readonly exclusions: readonly string[];
  readonly manifestHash: string;
}
export interface LegacyTransformResult {
  readonly spotId: string;
  readonly sourceField: string;
  readonly targetKey: string | null;
  readonly mappingStatus: MappingStatus;
  readonly originalValueHash: string;
  readonly transformedValue: unknown | null;
  readonly disposition: "PREFILL_REQUIRES_CONFIRMATION" | "REVIEW_REQUIRED" | "EXCLUDED" | "IDENTITY_ONLY";
  readonly reasonCode: string;
  readonly resultHash: string;
}
export interface LegacyTransformManifest {
  readonly contractVersion: typeof LEGACY_TRANSFORM_CONTRACT_VERSION;
  readonly sourceManifestHash: string;
  readonly mappingVersion: typeof LEGACY_MAPPING_VERSION;
  readonly mappingHash: string;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
  readonly results: readonly LegacyTransformResult[];
  readonly manifestHash: string;
}

const lifecycle = (value: unknown, path: string): LegacySpotStatus => {
  const parsed = string(value, path, { min: 1, max: 40 }) as LegacySpotStatus;
  if (!LEGACY_SPOT_STATUSES.includes(parsed)) throw new ContractValidationError(path, "unknown lifecycle");
  return parsed;
};
const hash64 = (value: unknown, path: string) => {
  const parsed = string(value, path, { min: 64, max: 64 });
  if (!/^[0-9a-f]{64}$/.test(parsed)) throw new ContractValidationError(path, "expected sha256");
  return parsed;
};

export function createLegacyExportManifest(input: Omit<LegacyExportManifest, "contractVersion" | "manifestHash">): LegacyExportManifest {
  const records = canonicalSort(input.records.map((record) => {
    const body = { spotId: identifier(record.spotId, "$.records.spotId"), lifecycle: lifecycle(record.lifecycle, "$.records.lifecycle"), fields: object(record.fields, "$.records.fields") };
    if (record.recordHash !== sha256(body)) throw new ContractValidationError("$.records.recordHash", "record hash mismatch");
    return { ...body, recordHash: record.recordHash };
  }), (record) => record.spotId);
  if (new Set(records.map((record) => record.spotId)).size !== records.length) throw new ContractValidationError("$.records", "duplicate spot identity");
  const body = { contractVersion: LEGACY_EXPORT_CONTRACT_VERSION, batchId: identifier(input.batchId, "$.batchId"), sourceSnapshotAt: timestamp(input.sourceSnapshotAt, "$.sourceSnapshotAt"), schemaFingerprint: hash64(input.schemaFingerprint, "$.schemaFingerprint"), scope: input.scope, records, exclusions: [...input.exclusions].sort() };
  if (body.scope !== "ACTIVE_PUBLISHED_ONLY") throw new ContractValidationError("$.scope", "unsupported export scope");
  return { ...body, manifestHash: hashBody(body, []) };
}

export function parseLegacyExportManifest(value: unknown): LegacyExportManifest {
  const raw = object(value, "$", ["contractVersion", "batchId", "sourceSnapshotAt", "schemaFingerprint", "scope", "records", "exclusions", "manifestHash"]);
  if (required(raw, "contractVersion") !== LEGACY_EXPORT_CONTRACT_VERSION) throw new ContractValidationError("$.contractVersion", "unknown export contract");
  const records = array(required(raw, "records"), "$.records").map((entry, index) => {
    const row = object(entry, `$.records[${index}]`, ["spotId", "lifecycle", "fields", "recordHash"]);
    return { spotId: identifier(required(row, "spotId"), `$.records[${index}].spotId`), lifecycle: lifecycle(required(row, "lifecycle"), `$.records[${index}].lifecycle`), fields: object(required(row, "fields"), `$.records[${index}].fields`), recordHash: hash64(required(row, "recordHash"), `$.records[${index}].recordHash`) };
  });
  const manifest = createLegacyExportManifest({ batchId: identifier(required(raw, "batchId"), "$.batchId"), sourceSnapshotAt: timestamp(required(raw, "sourceSnapshotAt"), "$.sourceSnapshotAt"), schemaFingerprint: hash64(required(raw, "schemaFingerprint"), "$.schemaFingerprint"), scope: required(raw, "scope") as "ACTIVE_PUBLISHED_ONLY", records, exclusions: array(required(raw, "exclusions"), "$.exclusions").map((entry, index) => string(entry, `$.exclusions[${index}]`, { min: 1, max: 120 })) });
  if (required(raw, "manifestHash") !== manifest.manifestHash) throw new ContractValidationError("$.manifestHash", "manifest hash mismatch");
  return manifest;
}

const categoryAllowlist: Readonly<Record<string, string>> = Object.freeze({ restaurant: "EAT", bar: "DRINKS", cafe: "COFFEE_DAYTIME", café: "COFFEE_DAYTIME", nightlife: "NIGHTLIFE", hotel: "STAY", museum: "CULTURE_ARTS", other: "OTHER", sonstiges: "OTHER" });
const safeFields: Readonly<Record<string, string>> = Object.freeze({ name: "identity.name", address: "location.address_line1", city: "location.locality", country: "location.country_code", lat: "location.latitude", lng: "location.longitude", website: "contact.website", phone: "contact.phone", hours_regular: "hours.regular" });
const prohibitedFields = new Set(["owner_id", "owner_tier", "subscription", "payment", "billing", "advertising", "sponsoring", "admin_notes", "actor_id", "n4_confidence", "suitability", "user_intelligence", "analytics"]);

export function transformLegacyExport(value: unknown): LegacyTransformManifest {
  const source = parseLegacyExportManifest(value); const results: LegacyTransformResult[] = [];
  const add = (record: LegacyExportRecord, sourceField: string, targetKey: string | null, mappingStatus: MappingStatus, transformedValue: unknown | null, disposition: LegacyTransformResult["disposition"], reasonCode: string) => {
    const originalValue = sourceField === "id" ? record.spotId : sourceField === "status" ? record.lifecycle : record.fields[sourceField];
    const body = { spotId: record.spotId, sourceField, targetKey, mappingStatus, originalValueHash: sha256(originalValue), transformedValue, disposition, reasonCode };
    results.push({ ...body, resultHash: hashBody(body, []) });
  };
  for (const record of source.records) {
    add(record, "id", null, "DIRECT", record.spotId, "IDENTITY_ONLY", "CANONICAL_PUBLIC_SPOT_ID_RETAINED");
    if (record.lifecycle !== "ACTIVE_PUBLISHED") { add(record, "status", null, "NO_TARGET_KEY", null, "EXCLUDED", "NOT_ACTIVE_PUBLISHED"); continue; }
    for (const sourceField of Object.keys(record.fields).sort()) {
      const original = record.fields[sourceField]; if (original === null || original === undefined || original === "") continue;
      if (prohibitedFields.has(sourceField)) { add(record, sourceField, null, sourceField === "suitability" ? "SUBJECTIVE" : "PROHIBITED", null, "EXCLUDED", "PROHIBITED_DATA_CLASS"); continue; }
      if (sourceField === "email") { add(record, sourceField, null, "AMBIGUOUS", null, "REVIEW_REQUIRED", "PUBLIC_CONTACT_SEMANTICS_UNPROVEN"); continue; }
      if (sourceField === "price_level" || sourceField === "description") { add(record, sourceField, sourceField === "price_level" ? "operation.price_level" : "description.highlight", "AMBIGUOUS", null, "REVIEW_REQUIRED", "LEGACY_SEMANTICS_AMBIGUOUS"); continue; }
      if (sourceField === "category") { const normalized = categoryAllowlist[String(original).trim().toLocaleLowerCase("de-CH")]; add(record, sourceField, "classification.primary_category", normalized ? "NORMALIZED" : "AMBIGUOUS", normalized ?? null, normalized ? "PREFILL_REQUIRES_CONFIRMATION" : "REVIEW_REQUIRED", normalized ? "ALLOWLISTED_CATEGORY_NORMALIZATION" : "CATEGORY_NOT_ALLOWLISTED"); continue; }
      const targetKey = safeFields[sourceField]; if (targetKey) add(record, sourceField, targetKey, "MISSING_PROVENANCE", original, "PREFILL_REQUIRES_CONFIRMATION", "LEGACY_VALUE_REQUIRES_ADMIN_CONFIRMATION");
      else add(record, sourceField, null, "NO_TARGET_KEY", null, "EXCLUDED", "NO_FOUNDATION_TARGET");
    }
  }
  const sorted = canonicalSort(results, (item) => `${item.spotId}:${item.sourceField}:${item.targetKey ?? ""}`);
  const body = { contractVersion: LEGACY_TRANSFORM_CONTRACT_VERSION, sourceManifestHash: source.manifestHash, mappingVersion: LEGACY_MAPPING_VERSION, mappingHash: LEGACY_MAPPING_HASH, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, results: sorted };
  return { ...body, manifestHash: hashBody(body, []) };
}

export function createLegacyImportRequest(input: { requestId: string; transformManifestHash: string; requestedAt: string }) {
  const body = { contractVersion: LEGACY_IMPORT_CONTRACT_VERSION, requestId: identifier(input.requestId, "$.requestId"), transformManifestHash: hash64(input.transformManifestHash, "$.transformManifestHash"), targetEnvironment: LEGACY_TARGET_ENVIRONMENT, requestedAt: timestamp(input.requestedAt, "$.requestedAt") };
  return { ...body, requestHash: hashBody(body, []) };
}
