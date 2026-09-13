import assert from "node:assert/strict";
import test from "node:test";
import { createLegacyExportManifest, createLegacyImportRequest, sha256, transformLegacyExport } from "../dist/index.js";

const record = (spotId, lifecycle, fields) => {
  const body = { spotId, lifecycle, fields };
  return { ...body, recordHash: sha256(body) };
};
const source = () => createLegacyExportManifest({
  batchId: "batch:synthetic:2026-09-11", sourceSnapshotAt: "2026-09-11T19:00:00.000Z", schemaFingerprint: sha256("synthetic-schema"), scope: "ACTIVE_PUBLISHED_ONLY",
  records: [
    record("00000000-0000-4000-8000-000000000041", "ACTIVE_PUBLISHED", { name: "Synthetischer Spot", category: "Restaurant", email: "ambiguous@example.test", price_level: 2, missing: null, suitability: ["DATE"], n4_confidence: 0.99, owner_tier: "PRO" }),
    record("00000000-0000-4000-8000-000000000042", "ARCHIVED", { name: "Archiviert" }),
  ], exclusions: ["AUTH_USERS", "PRIVATE_OWNER_CONTACTS", "PAYMENT", "SUBSCRIPTION", "RAW_AI_OUTPUTS"]
});

test("export, transform and import identities are deterministic", () => {
  const first = source(); const second = source(); assert.deepEqual(first, second);
  const transformed = transformLegacyExport(first); assert.deepEqual(transformed, transformLegacyExport(second));
  const request = createLegacyImportRequest({ requestId: "import:synthetic:1", transformManifestHash: transformed.manifestHash, requestedAt: "2026-09-11T19:05:00.000Z" });
  assert.deepEqual(request, createLegacyImportRequest({ requestId: "import:synthetic:1", transformManifestHash: transformed.manifestHash, requestedAt: "2026-09-11T19:05:00.000Z" }));
});

test("conservative mapping preserves missing, ambiguous and prohibited boundaries", () => {
  const transformed = transformLegacyExport(source());
  const byField = Object.fromEntries(transformed.results.filter((row) => row.spotId.endsWith("41")).map((row) => [row.sourceField, row]));
  assert.equal(byField.name.mappingStatus, "MISSING_PROVENANCE"); assert.equal(byField.name.disposition, "PREFILL_REQUIRES_CONFIRMATION");
  assert.equal(byField.category.mappingStatus, "NORMALIZED"); assert.equal(byField.category.transformedValue, "EAT");
  assert.equal(byField.email.mappingStatus, "AMBIGUOUS"); assert.equal(byField.email.targetKey, null);
  assert.equal(byField.price_level.mappingStatus, "AMBIGUOUS"); assert.equal(byField.suitability.mappingStatus, "SUBJECTIVE");
  assert.equal(byField.n4_confidence.mappingStatus, "PROHIBITED"); assert.equal(byField.owner_tier.mappingStatus, "PROHIBITED");
  assert.equal("missing" in byField, false, "absence must create neither false nor explicit UNKNOWN");
  assert.equal(transformed.results.some((row) => row.spotId.endsWith("42") && row.disposition === "PREFILL_REQUIRES_CONFIRMATION"), false);
});

test("rehashing invalid semantic content still fails closed", () => {
  const sourceManifest = structuredClone(source()); sourceManifest.records[0].fields.name = "Manipuliert";
  sourceManifest.manifestHash = sha256(Object.fromEntries(Object.entries(sourceManifest).filter(([key]) => key !== "manifestHash")));
  assert.throws(() => transformLegacyExport(sourceManifest), /record hash mismatch/);
  const duplicate = source(); duplicate.records = [duplicate.records[0], duplicate.records[0]];
  duplicate.manifestHash = sha256(Object.fromEntries(Object.entries(duplicate).filter(([key]) => key !== "manifestHash")));
  assert.throws(() => transformLegacyExport(duplicate), /duplicate spot identity/);
});
