import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseFounderWorldCohortHandoff } from "../dist/index.js";
import { makeFounderCohortHandoff } from "../../../scripts/decision/phase3c-founder-cohort-fixture.mjs";
import { postgresJsonbText } from "../../../scripts/world-knowledge/postgres-jsonb-canonical.mjs";

const rehash = (value, key, hashBody) => { const copy = structuredClone(value); delete copy[key]; return { ...copy, [key]: hashBody(copy, []) }; };
const pgHash = (value) => createHash("sha256").update(postgresJsonbText(value), "utf8").digest("hex");
const rehashPostgres = (value, key) => { const copy = structuredClone(value); delete copy[key]; return { ...copy, [key]: pgHash(copy) }; };
const rebindOuterHashes = (artifact, hashBody) => {
  artifact.manifest = rehashPostgres(artifact.manifest, "cohortHash");
  artifact.manifestContentHash = hashBody(artifact.manifest, []);
  artifact.handoffHash = rehash(artifact, "handoffHash", hashBody).handoffHash;
  return artifact;
};

test("Founder cohort handoff validates the complete local World export", async () => {
  const { hashBody } = await import("../dist/index.js"); const artifact = makeFounderCohortHandoff();
  assert.equal(parseFounderWorldCohortHandoff(artifact).spots[0].name, "Volta Bräu");
  const scope = structuredClone(artifact); scope.scope = "PRODUCTION"; assert.throws(() => parseFounderWorldCohortHandoff(scope), /scope_identity_mismatch/);
  const registry = structuredClone(artifact); registry.manifest.registryVersion = "backyrd.world-knowledge.registry@999"; registry.manifestContentHash = hashBody(registry.manifest, []); registry.handoffHash = rehash(registry, "handoffHash", hashBody).handoffHash; assert.throws(() => parseFounderWorldCohortHandoff(registry), /registryVersion_identity_mismatch/);
  const manifest = structuredClone(artifact); manifest.spots[0].manifestHash = "0".repeat(64); manifest.handoffHash = rehash(manifest, "handoffHash", hashBody).handoffHash; assert.throws(() => parseFounderWorldCohortHandoff(manifest), /manifest_binding_mismatch/);
  const snapshot = structuredClone(artifact); snapshot.spots[0].snapshot.facts[0].value = "Manipuliert"; snapshot.handoffHash = rehash(snapshot, "handoffHash", hashBody).handoffHash; assert.throws(() => parseFounderWorldCohortHandoff(snapshot), /snapshot_integrity_mismatch/);
  const commercial = structuredClone(artifact); commercial.ownerTier = "PRO"; assert.throws(() => parseFounderWorldCohortHandoff(commercial), /unknown_field/);
});

test("Founder cohort handoff consumes the Registry 2.1 age-rule shape emitted by local World authoring", async () => {
  const { createFounderWorldCohortHandoff, hashBody } = await import("../dist/index.js");
  const artifact = makeFounderCohortHandoff(["Volta Bräu"]);
  const manifest = artifact.manifest;
  const sourceSnapshot = structuredClone(artifact.spots[0].snapshot);
  sourceSnapshot.facts.find((fact) => fact.key === "rule.age_access_conditions").value.notes = "Founder-geprüfte lokale Regel";
  const built = createFounderWorldCohortHandoff({ manifest, spotDetails: [{ spotId: manifest.spots[0].spotId, fallbackName: "Volta Bräu", manifest: { manifestHash: manifest.spots[0].manifestHash, worldSnapshot: sourceSnapshot } }] });
  assert.equal(built.spots[0].snapshot.facts.find((fact) => fact.key === "rule.age_access_conditions").value.notes, "Founder-geprüfte lokale Regel");
  assert.equal(parseFounderWorldCohortHandoff(built).handoffHash, built.handoffHash);
  assert.equal(hashBody(built.spots[0].snapshot, []), built.spots[0].snapshotContentHash);
  const malformed = structuredClone(sourceSnapshot);
  malformed.facts.find((fact) => fact.key === "rule.age_access_conditions").value.rules[0].notes = "wrong nesting";
  assert.throws(() => createFounderWorldCohortHandoff({ manifest, spotDetails: [{ spotId: manifest.spots[0].spotId, fallbackName: "Volta Bräu", manifest: { manifestHash: manifest.spots[0].manifestHash, worldSnapshot: malformed } }] }), /unknown field/);
});

test("Registry 2.1 context is integrity-bound but excluded from Decision facts", async () => {
  const { hashBody } = await import("../dist/index.js");
  const artifact = makeFounderCohortHandoff();
  const binding = artifact.manifest.spots[0];
  binding.contextHandoff.entries["purpose.primary_visit"] = { key: "purpose.primary_visit", scope: "GLOBAL", resolution: "KNOWN_VALUE", value: "NATURE_ANIMAL_EXPERIENCE", trust: "VERIFIED", freshness: "CURRENT", basisClaimHashes: ["1".repeat(64)] };
  binding.contextHandoff.absentKeys = binding.contextHandoff.absentKeys.filter((key) => key !== "purpose.primary_visit");
  binding.contextHandoff = rehashPostgres(binding.contextHandoff, "handoffHash");
  binding.contextHandoffHash = binding.contextHandoff.handoffHash;
  rebindOuterHashes(artifact, hashBody);
  const parsed = parseFounderWorldCohortHandoff(artifact);
  assert.equal(parsed.manifest.spots[0].contextHandoff.entries["purpose.primary_visit"].value, "NATURE_ANIMAL_EXPERIENCE");
  assert.equal(parsed.spots[0].snapshot.facts.some((fact) => fact.key === "purpose.primary_visit"), false);

  const forged = structuredClone(artifact);
  forged.manifest.spots[0].contextHandoff.entries["purpose.primary_visit"].value = "UNREGISTERED_PURPOSE";
  forged.manifest.spots[0].contextHandoff = rehashPostgres(forged.manifest.spots[0].contextHandoff, "handoffHash");
  forged.manifest.spots[0].contextHandoffHash = forged.manifest.spots[0].contextHandoff.handoffHash;
  rebindOuterHashes(forged, hashBody);
  assert.throws(() => parseFounderWorldCohortHandoff(forged), /expected one of/);

  const obsolete = structuredClone(artifact);
  obsolete.manifest.contractVersion = "backyrd.world-knowledge.founder-cohort-shadow@2.0";
  rebindOuterHashes(obsolete, hashBody);
  assert.throws(() => parseFounderWorldCohortHandoff(obsolete), /contractVersion_identity_mismatch/);
});
