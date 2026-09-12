import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTE_DEFINITIONS, CLAIM_CONTRACT_VERSION, ContractValidationError, DERIVED_RULES, PHILIPPS_CASA_CLAIMS, PRIMARY_CATEGORIES, PRIMARY_CATEGORY_LABELS,
  REGISTRY_CANONICAL_JSON, REGISTRY_HASH, REGISTRY_VERSION, RULE_REGISTRY_HASH, WORLD_KNOWLEDGE_PORT_VERSION,
  appendClaim, createClaim, parseClaim, resolveWorldKnowledge, resolutionRequest,
} from "../dist/index.js";

test("registry is bilingual, language-neutral, unique and SHA-256 bound", () => {
  assert.equal(REGISTRY_HASH, "e93a7399c41535f7da2987c46343fbe82d1e3c07bca345b076d604f8d39f5a72");
  assert.equal(RULE_REGISTRY_HASH, "ce6b70c6f3ebc7c114af1fc2a24c79b415e552996e5db7d6f352e7e5867d61f8");
  assert.match(REGISTRY_CANONICAL_JSON, /classification\.primary_category/);
  assert.equal(new Set(ATTRIBUTE_DEFINITIONS.map((item) => item.key)).size, ATTRIBUTE_DEFINITIONS.length);
  assert.ok(ATTRIBUTE_DEFINITIONS.every((item) => item.labels.de && item.labels.en && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(item.key)));
  assert.equal(DERIVED_RULES.length, 5);
  assert.deepEqual(PRIMARY_CATEGORIES, ["EAT", "DRINKS", "COFFEE_DAYTIME", "NIGHTLIFE", "CULTURE_ARTS", "ENTERTAINMENT", "ACTIVITIES_PLAY", "SPORT_MOVEMENT", "OUTDOOR_NATURE", "WELLNESS_RELAXATION", "SHOPPING_MARKETS", "STAY", "COMMUNITY_SOCIAL", "ATTRACTIONS_LANDMARKS", "TEMPORARY_PLACES", "OTHER"]); assert.deepEqual(PRIMARY_CATEGORY_LABELS.OTHER, { de: "Sonstiges", en: "Other" });
  assert.ok(ATTRIBUTE_DEFINITIONS.find((item) => item.key === "offering.food_specialities").allowedValues.includes("BURGER"));
  assert.ok(!ATTRIBUTE_DEFINITIONS.find((item) => item.key === "offering.cuisines").allowedValues.includes("BURGER"));
  assert.ok(ATTRIBUTE_DEFINITIONS.find((item) => item.key === "offering.cuisines").allowedValues.includes("THAI"));
  assert.equal(ATTRIBUTE_DEFINITIONS.find((item) => item.key === "rule.age_access_conditions").valueType, "AGE_ACCESS_RULE_V2");
});

test("claims are strict, canonical, hashed and fail closed on unknown versions", () => {
  const source = PHILIPPS_CASA_CLAIMS[0]; assert.equal(parseClaim(source).contentHash, source.contentHash);
  assert.throws(() => parseClaim({ ...source, contractVersion: "backyrd.world-knowledge.claim@2.0" }), ContractValidationError);
  assert.throws(() => parseClaim({ ...source, registryVersion: "unknown" }), ContractValidationError);
  assert.throws(() => parseClaim({ ...source, contentHash: "f".repeat(64) }), /hash mismatch/);
  assert.throws(() => parseClaim({ ...source, ownerTier: "PRO" }), /unknown field/);
  const { contractVersion: _contractVersion, registryVersion: _registryVersion, contentHash: _contentHash, ...sourceDraft } = source;
  assert.throws(() => createClaim({ ...sourceDraft, claimId: "ai", attributeKey: "identity.name", value: "AI", knowledgeState: "KNOWN_VALUE", sourceType: "AI_INFERENCE", verificationState: "VERIFIED" }), /AI inference/);
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
