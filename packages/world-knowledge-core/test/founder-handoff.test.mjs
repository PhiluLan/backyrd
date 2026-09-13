import assert from "node:assert/strict";
import test from "node:test";
import { parseFounderWorldCohortHandoff } from "../dist/index.js";
import { makeFounderCohortHandoff } from "../../../scripts/decision/phase3c-founder-cohort-fixture.mjs";

const rehash = (value, key, hashBody) => { const copy = structuredClone(value); delete copy[key]; return { ...copy, [key]: hashBody(copy, []) }; };

test("Founder cohort handoff validates the complete local World export", async () => {
  const { hashBody } = await import("../dist/index.js"); const artifact = makeFounderCohortHandoff();
  assert.equal(parseFounderWorldCohortHandoff(artifact).spots[0].name, "Volta Bräu");
  const scope = structuredClone(artifact); scope.scope = "PRODUCTION"; assert.throws(() => parseFounderWorldCohortHandoff(scope), /scope_identity_mismatch/);
  const registry = structuredClone(artifact); registry.manifest.registryVersion = "backyrd.world-knowledge.registry@999"; registry.manifestContentHash = hashBody(registry.manifest, []); registry.handoffHash = rehash(registry, "handoffHash", hashBody).handoffHash; assert.throws(() => parseFounderWorldCohortHandoff(registry), /registryVersion_identity_mismatch/);
  const manifest = structuredClone(artifact); manifest.spots[0].manifestHash = "0".repeat(64); manifest.handoffHash = rehash(manifest, "handoffHash", hashBody).handoffHash; assert.throws(() => parseFounderWorldCohortHandoff(manifest), /manifest_binding_mismatch/);
  const snapshot = structuredClone(artifact); snapshot.spots[0].snapshot.facts[0].value = "Manipuliert"; snapshot.handoffHash = rehash(snapshot, "handoffHash", hashBody).handoffHash; assert.throws(() => parseFounderWorldCohortHandoff(snapshot), /snapshot_integrity_mismatch/);
  const commercial = structuredClone(artifact); commercial.ownerTier = "PRO"; assert.throws(() => parseFounderWorldCohortHandoff(commercial), /unknown_field/);
});

test("Founder cohort handoff consumes the Registry 2.0 age-rule shape emitted by local World authoring", async () => {
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
