import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  CompositeContextObjectiveSchema, ProductContextPolicySchema, SyntheticBudgetResolver, SyntheticIntentResolver,
  SyntheticLocationResolver, SyntheticMoodResolver, canonicalJson, classifyConstraintCandidate,
  contentHash, createCompositeSituationObjective, evaluateCompositeSituationObjective,
  loadAcceptedPhase3BProductContextRelease, orderConstraintCandidates, phase3BDecisionIdentity,
  replayPhase3BProductOracleWorkbench, runPhase3BProductOracleWorkbench,
  readPhase3BReleaseAttestation, verifyPhase3BReleaseAttestation,
  assertVerifiedResolverOutput,
  prepareContextObservationAdapter,
} from "../dist/index.js";

const release = () => loadAcceptedPhase3BProductContextRelease();
const rehash = (value, field) => { const body = structuredClone(value); delete body[field]; return { ...body, [field]: contentHash(body) }; };

test("Phase 3B release binds exactly 19 frozen founder decisions and canonical World prices", () => {
  const value = release();
  assert.equal(value.decisionRecord.decisions.length, 19);
  assert.deepEqual(value.policy.priceLevels, ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "PREMIUM", "FLEXIBLE"]);
  assert.equal(value.policy.priceAnchor.universalMapping, false);
  assert.equal(value.policy.sessionTimeLimitSeconds, null);
  assert.equal(value.policy.retentionSeconds, null);
  assert.equal(value.release.flags.productionAuthorized, false);
  assert.equal(value.release.flags.runtimeActivated, false);
});

test("release capability cannot be forged, cloned, spread, or serialized", async () => {
  const valid = release();
  for (const fake of [{ ...valid }, structuredClone(valid), JSON.parse(JSON.stringify(valid)), {}]) {
    assert.throws(() => phase3BDecisionIdentity("x", fake), /capability_required/);
  }
  const module = await import("../dist/index.js");
  assert.equal("validatePhase3BProductArtifacts" in module, false);
});

test("unknown contract versions and commercial fields fail closed", () => {
  const policy = release().policy;
  assert.throws(() => ProductContextPolicySchema.parse({ ...policy, contractVersion: "backyrd.decision-vnext.context-policy@forged" }), /expected/);
  assert.throws(() => ProductContextPolicySchema.parse({ ...policy, payment: true }), /unknown field/);
  assert.throws(() => ProductContextPolicySchema.parse({ ...policy, ownerTier: "PRO" }), /unknown field/);
});

test("separate ephemeral resolver ports preserve uncertainty and never persist text", () => {
  const accepted = release();
  const intent = new SyntheticIntentResolver().resolve({ ephemeralText: "ruhig abendessen" }, accepted);
  assert.deepEqual(intent.interpretations.map((item) => item.role), ["PRIMARY", "SECONDARY"]);
  assert.doesNotThrow(() => assertVerifiedResolverOutput(intent, "INTENT", contentHash({ ephemeralText: "ruhig abendessen" })));
  assert.throws(() => assertVerifiedResolverOutput(structuredClone(intent), "INTENT", intent.inputHash), /capability_required/);
  assert.equal(new SyntheticIntentResolver().resolve({ ephemeralText: "essen und nicht essen" }, accepted).state, "AMBIGUOUS");
  const mood = new SyntheticMoodResolver().resolve({ ephemeralText: "irgendwie besonders aber locker" }, accepted);
  assert.equal(mood.state, "AMBIGUOUS"); assert.equal(mood.clarificationRequired, true); assert.equal(mood.rawTextPersisted, false);
  const budget = new SyntheticBudgetResolver();
  assert.equal(budget.resolve({ ephemeralText: "maximal 20 chf pro person", market: "CH", category: "FOOD_SERVICE", consumption: "DINNER" }, accepted).interpretations[0].conceptId, "world.price.low");
  assert.equal(budget.resolve({ ephemeralText: "maximal 20 chf pro person", market: "DE", category: "FOOD_SERVICE", consumption: "DINNER" }, accepted).state, "NOT_CONFIGURED");
  assert.equal(new SyntheticLocationResolver().resolve({ ephemeralText: "zürich", permission: "DENIED" }, accepted).state, "RESOLVED");
  assert.equal(new SyntheticLocationResolver().resolve({ ephemeralText: "", permission: "DENIED" }, accepted).state, "DENIED");
});

test("synthetic Ed25519 trust root rejects wrong hash, signature, relabeling, and replacement key", () => {
  const { trustAnchor } = readPhase3BReleaseAttestation();
  assert.equal(verifyPhase3BReleaseAttestation(trustAnchor), true);
  assert.equal(verifyPhase3BReleaseAttestation({ ...trustAnchor, acceptedReleaseHash: "0".repeat(64) }), false);
  assert.equal(verifyPhase3BReleaseAttestation({ ...trustAnchor, releaseHashSignature: `${trustAnchor.releaseHashSignature.slice(0, -4)}AAAA` }), false);
  assert.equal(verifyPhase3BReleaseAttestation({ ...trustAnchor, authorityScope: "PRODUCTION" }), false);
  assert.equal(verifyPhase3BReleaseAttestation({ ...trustAnchor, productionCapable: true }), false);
  const { privateKey } = generateKeyPairSync("ed25519");
  const replacement = sign(null, Buffer.from(trustAnchor.acceptedReleaseHash), privateKey).toString("base64");
  assert.equal(verifyPhase3BReleaseAttestation({ ...trustAnchor, releaseHashSignature: replacement }), false);
  assert.equal(loadAcceptedPhase3BProductContextRelease.length, 0);
});

test("composite fit requires every component, evidence, and World relation", () => {
  const accepted = release();
  const components = ["intent", "occasion", "mood"].map((key) => ({ componentId: key, dimensionKey: `context.${key}`, conceptIds: [`context.${key}.fixture`], requirement: "REQUIRED", knowledgeState: "KNOWN_TRUE", sourceHash: contentHash(key), worldRelationRefs: [`relation:${key}`], evidenceIds: [`evidence:${key}`] }));
  const objective = createCompositeSituationObjective({ objectiveId: "quiet-dinner-first-date", components, dependencies: [{ fromComponentId: "intent", toComponentId: "occasion", relationId: "co-occurs" }], hardConstraintIds: [], softPreferenceIds: ["mood"], explanationTemplateId: "composite-confirmed-template" }, accepted);
  assert.equal(evaluateCompositeSituationObjective(objective, accepted).state, "AUTHORIZED_STRONG");
  const missingEvidence = rehash({ ...objective, components: objective.components.map((item) => item.componentId === "mood" ? { ...item, evidenceIds: [] } : item) }, "objectiveHash");
  const result = evaluateCompositeSituationObjective(CompositeContextObjectiveSchema.parse(missingEvidence), accepted);
  assert.equal(result.state, "PARTIAL_WITH_LIMITATION"); assert.equal(result.explanationAuthorized, false);
});

test("constraint tiers order confirmed before unknown and never explain unknown as true", () => {
  const accepted = release();
  const confirmed = classifyConstraintCandidate({ candidateId: "a", ruleClass: "ACCESSIBILITY", knowledgeState: "KNOWN_TRUE" }, accepted);
  const unknown = classifyConstraintCandidate({ candidateId: "b", ruleClass: "ACCESSIBILITY", knowledgeState: "UNKNOWN" }, accepted);
  const falseValue = classifyConstraintCandidate({ candidateId: "c", ruleClass: "ACCESSIBILITY", knowledgeState: "KNOWN_FALSE" }, accepted);
  assert.deepEqual(orderConstraintCandidates([falseValue, unknown, confirmed]).map((item) => item.tier), ["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "INELIGIBLE"]);
  assert.equal(unknown.explanationState, "UNCONFIRMED"); assert.equal(falseValue.tier, "INELIGIBLE");
  assert.equal(classifyConstraintCandidate({ candidateId: "d", ruleClass: "OPENING_CURRENT", knowledgeState: "UNKNOWN" }, accepted).tier, "INELIGIBLE");
  assert.equal(classifyConstraintCandidate({ candidateId: "e", ruleClass: "AGE_OR_LEGAL", knowledgeState: "UNKNOWN" }, accepted).tier, "NOT_CONFIGURED");
});

test("oracle workbench has exact approved scenario set and deterministic replay", () => {
  const first = runPhase3BProductOracleWorkbench(); const second = runPhase3BProductOracleWorkbench();
  assert.equal(first.scenarios.length, 28); assert.equal(new Set(first.scenarios.map((item) => item.scenarioId)).size, 28);
  assert.equal(canonicalJson(first), canonicalJson(second)); assert.equal(canonicalJson(replayPhase3BProductOracleWorkbench(first)), canonicalJson(first));
  assert.ok(first.scenarios.some((item) => item.scenarioId === "midday-vs-late-evening" && item.actual.changedDimensionKeys.length === 1 && item.actual.changedDimensionKeys[0] === "context.time.local"));
  assert.ok(first.scenarios.some((item) => item.scenarioId === "device-basel-target-zurich"));
  assert.ok(first.scenarios.every((item) => !item.writesUserIntelligence && item.actual.baseScenarioIdentity !== item.actual.flipScenarioIdentity && item.actual.unchangedBindingHashes.length === 3));
});

test("inner oracle manipulation fails even after report and workbench rehash", () => {
  const workbench = structuredClone(runPhase3BProductOracleWorkbench());
  workbench.scenarios[0].actual.changedDimensionKeys = ["context.forged"];
  workbench.scenarios[0] = rehash(workbench.scenarios[0], "reportHash");
  const forged = rehash(workbench, "workbenchHash");
  assert.throws(() => replayPhase3BProductOracleWorkbench(forged), /replay_mismatch/);
});

test("missing, duplicate, reordered and foreign scenarios fail closed after rehash", () => {
  const base = runPhase3BProductOracleWorkbench();
  const variants = [];
  variants.push(rehash({ ...base, scenarios: base.scenarios.slice(1) }, "workbenchHash"));
  variants.push(rehash({ ...base, scenarios: [...base.scenarios.slice(0, -1), base.scenarios[0]] }, "workbenchHash"));
  variants.push(rehash({ ...base, scenarios: [base.scenarios[1], base.scenarios[0], ...base.scenarios.slice(2)] }, "workbenchHash"));
  const foreign = structuredClone(base); foreign.scenarios[0].scenarioId = "foreign-scenario"; foreign.scenarios[0] = rehash(foreign.scenarios[0], "reportHash"); variants.push(rehash(foreign, "workbenchHash"));
  for (const value of variants) assert.throws(() => replayPhase3BProductOracleWorkbench(value));
});

test("commercial counterfactual has no contract channel or semantic identity effect", () => {
  const accepted = release();
  const domainInput = { intent: "dinner", location: "zurich" };
  const first = phase3BDecisionIdentity(domainInput, accepted); const second = phase3BDecisionIdentity({ ...domainInput }, accepted);
  assert.equal(first, second);
  assert.throws(() => ProductContextPolicySchema.parse({ ...accepted.policy, sponsored: true }), /unknown field/);
});

test("alternative and Context never write User Intelligence; reject adapter remains gated", () => {
  const accepted = release();
  assert.deepEqual(prepareContextObservationAdapter({ action: "ALTERNATIVE_REQUESTED", consent: true }, accepted), { contractVersion: "backyrd.decision-vnext.context-observation-adapter@3b-1", action: "ALTERNATIVE_REQUESTED", status: "NOT_APPLICABLE", reasonCode: "alternative-is-context-neutral", userEventProduced: false, writesUserIntelligence: false, resultHash: prepareContextObservationAdapter({ action: "ALTERNATIVE_REQUESTED", consent: true }, accepted).resultHash });
  assert.equal(prepareContextObservationAdapter({ action: "SPOT_REJECTED_FOR_CURRENT_DECISION", consent: false }, accepted).status, "DENIED");
  assert.equal(prepareContextObservationAdapter({ action: "SPOT_REJECTED_FOR_CURRENT_DECISION", consent: true }, accepted).status, "NOT_CONFIGURED");
});
