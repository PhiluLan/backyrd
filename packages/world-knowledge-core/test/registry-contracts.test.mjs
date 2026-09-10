import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTE_DEFINITIONS, CLAIM_CONTRACT_VERSION, ContractValidationError, DERIVED_RULES, PHILIPPS_CASA_CLAIMS,
  REGISTRY_CANONICAL_JSON, REGISTRY_HASH, REGISTRY_VERSION, RULE_REGISTRY_HASH, WORLD_KNOWLEDGE_PORT_VERSION,
  appendClaim, createClaim, parseClaim, resolveWorldKnowledge, resolutionRequest,
} from "../dist/index.js";

test("registry is bilingual, language-neutral, unique and SHA-256 bound", () => {
  assert.equal(REGISTRY_HASH, "a0e9b00400e3be6faa33fdf289d630bb61799a12d49201d03384ed1f5329a7ee");
  assert.equal(RULE_REGISTRY_HASH, "e4550ce93b23d4a217bd296e8b83a01363a4459433309c953efae15def917e27");
  assert.match(REGISTRY_CANONICAL_JSON, /classification\.primary_category/);
  assert.equal(new Set(ATTRIBUTE_DEFINITIONS.map((item) => item.key)).size, ATTRIBUTE_DEFINITIONS.length);
  assert.ok(ATTRIBUTE_DEFINITIONS.every((item) => item.labels.de && item.labels.en && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(item.key)));
  assert.equal(DERIVED_RULES.length, 5);
  assert.ok(ATTRIBUTE_DEFINITIONS.find((item) => item.key === "offering.food_specialities").allowedValues.includes("BURGER"));
  assert.ok(!ATTRIBUTE_DEFINITIONS.find((item) => item.key === "offering.cuisines").allowedValues.includes("BURGER"));
});

test("claims are strict, canonical, hashed and fail closed on unknown versions", () => {
  const source = PHILIPPS_CASA_CLAIMS[0]; assert.equal(parseClaim(source).contentHash, source.contentHash);
  assert.throws(() => parseClaim({ ...source, contractVersion: "backyrd.world-knowledge.claim@2.0" }), ContractValidationError);
  assert.throws(() => parseClaim({ ...source, registryVersion: "unknown" }), ContractValidationError);
  assert.throws(() => parseClaim({ ...source, contentHash: "f".repeat(64) }), /hash mismatch/);
  assert.throws(() => parseClaim({ ...source, ownerTier: "PRO" }), /unknown field/);
  assert.throws(() => createClaim({ ...source, contractVersion: undefined, registryVersion: undefined, contentHash: undefined, claimId: "ai", attributeKey: "identity.name", value: "AI", knowledgeState: "KNOWN_VALUE", sourceType: "AI_INFERENCE", verificationState: "VERIFIED" }), /AI inference/);
  assert.equal(source.contractVersion, CLAIM_CONTRACT_VERSION); assert.equal(source.registryVersion, REGISTRY_VERSION);
});

test("append-only corrections preserve history and bind their predecessor", () => {
  const prior = PHILIPPS_CASA_CLAIMS[0];
  const { contractVersion: _contractVersion, registryVersion: _registryVersion, contentHash: _contentHash, ...priorDraft } = prior;
  const correction = createClaim({ ...priorDraft, claimId: "synthetic:correction", value: "Philipps Casa korrigiert", knowledgeState: "KNOWN_VALUE", supersedesClaimId: prior.claimId });
  const history = appendClaim([prior], correction); assert.equal(history.length, 2); assert.equal(history[0].value, "Philipps Casa"); assert.equal(history[1].supersedesClaimId, prior.claimId);
  assert.throws(() => appendClaim(history, correction), /duplicate claim/);
  const resolved = resolveWorldKnowledge(resolutionRequest(history)); assert.equal(resolved.resolved[0].value, "Philipps Casa korrigiert"); assert.equal(resolved.conflicts.length, 0);
});

test("port contract identity is independent from user intent contracts", () => {
  assert.equal(WORLD_KNOWLEDGE_PORT_VERSION, "backyrd.world-knowledge.port@1.0");
});
