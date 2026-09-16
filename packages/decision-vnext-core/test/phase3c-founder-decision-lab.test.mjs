import assert from "node:assert/strict";
import test from "node:test";
import {
  FounderLabRequestSchema, PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, PHASE3C_FOUNDER_LAB_RELEASE, PHASE3C_FOUNDER_ORACLES, PHASE3C_FOUNDER_SCENARIO_IDS,
  PHASE3C_LAB_COMPATIBILITY, PHASE3C_LAB_VERSIONS, canonicalJson, contentHash, replayFounderDecisionLab,
  assertFounderLabEvaluable, founderLabEvaluationGaps, replayFounderLabReport, resolveFounderLabText, runFounderDecisionLab, runFounderLabOracles,
} from "../dist/index.js";
import { makeFounderCohortHandoff } from "../../../scripts/decision/phase3c-founder-cohort-fixture.mjs";

const request = (text, overrides = {}) => ({ contractVersion: PHASE3C_LAB_VERSIONS.request, requestId: "lab-test", ephemeralText: text, deviceLocation: { state: "AVAILABLE", city: "Basel" }, userMode: "NEUTRAL_MISSING", alternativeRequested: false, rejectedCandidateIds: [], ...overrides });
const rehash = (value, field) => { const body = structuredClone(value); delete body[field]; return { ...body, [field]: contentHash(body) }; };

test("canonical authority identities and explicit World 1.1 to 2.1 evaluation bridge remain bound", () => {
  assert.equal(PHASE3C_LAB_COMPATIBILITY.productContextWorldRegistryVersion, "backyrd.world-knowledge.registry@1.1");
  assert.equal(PHASE3C_LAB_COMPATIBILITY.founderLabWorldRegistryVersion, "backyrd.world-knowledge.registry@2.1");
  assert.equal(PHASE3C_LAB_COMPATIBILITY.mode, "EXPLICIT_EVALUATION_ADAPTER_NO_POLICY_UPGRADE");
  assert.equal(PHASE3C_FOUNDER_LAB_RELEASE.phase3BReleaseHash, "fa724e8a6616e502e34bc9ad0366bcb85a2ec05760074f411da18b5c1ed61725");
  assert.equal(PHASE3C_FOUNDER_LAB_RELEASE.worldFounderEvidenceHash, "fb892599f3f623f53ec8efcd5fc084bd8e9f55e6a6317de7e23c8f7f0d168437");
  assert.equal(PHASE3C_FOUNDER_LAB_RELEASE.userFounderRecordHash, "c7242a47ec14d71255f3a2b0db17918e1cc7d179683480399623723aab0d115f");
});

test("free text is mandatory, ephemeral, and unknown or commercial fields fail closed", async () => {
  assert.throws(() => FounderLabRequestSchema.parse(request("")));
  assert.throws(() => FounderLabRequestSchema.parse({ ...request("Café in Zürich"), ownerTier: "PRO" }), /unknown field/);
  assert.throws(() => resolveFounderLabText(request("Café in Zürich"), { locationAuthority: { state: "KNOWN", authorizedCity: "Basel" } }), /unknown field/);
  const result = await runFounderDecisionLab({ request: request("Ruhiges Café in Zürich mit Spezialwort") });
  assert.equal(result.rawTextPersisted, false); assert.equal(result.writesUserIntelligence, false); assert.equal(result.commercialInfluence, "FORBIDDEN");
  assert.doesNotMatch(canonicalJson(result), /Ruhiges Café|Spezialwort/);
});

test("composite quiet first-date objective is interpreted together and remains editable", () => {
  const value = resolveFounderLabText(request("Ruhiges Restaurant in Zürich für ein erstes Date"));
  assert.equal(value.primaryIntent, "context.intent.food"); assert.equal(value.secondaryIntent, "context.intent.conversation"); assert.equal(value.occasion, "context.occasion.first-date"); assert.ok(value.moods.includes("context.mood.quiet"));
  const changed = resolveFounderLabText(request("Ruhiges Restaurant in Zürich für ein erstes Date"), { moods: ["context.mood.lively"] });
  assert.notEqual(value.interpretationHash, changed.interpretationHash);
});

test("prepared Founder family and coffee tasks expose complete, correction-ready interpretations", () => {
  const family = resolveFounderLabText(request("Ich suche nächste Woche in Basel einen Ort für ein Familienessen für mich und meine zwölfjährige Tochter."));
  assert.equal(family.primaryIntent, "context.intent.food"); assert.equal(family.occasion, "context.occasion.family"); assert.equal(family.targetCity, "Basel");
  assert.deepEqual(family.group, { size: null, minimumAge: 12, adultPresent: true, companionType: "family" }); assert.ok(family.hardConstraints.includes("AGE_OR_LEGAL"));
  const coffee = resolveFounderLabText(request("Ich möchte in Basel gemütlich Kaffee trinken und brauche einen rollstuhlgerechten Zugang."));
  assert.equal(coffee.primaryIntent, "context.intent.coffee"); assert.ok(coffee.hardConstraints.includes("ACCESSIBILITY"));
});

test("Founder evaluation requires authorized core-intent coverage before confirmed eligibility", async () => {
  assert.equal(PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.confirmedTierRequiresCoreIntentCoverage, "CONFIRMED");
  assert.equal(PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.embeddedOfferingsNeverConfirmCoreIntent, true);
  assert.equal(PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.productionAuthorized, false);
  assert.equal(PHASE3C_FOUNDER_LAB_RELEASE.contextualWorldPolicyHash, PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash);
  const handoff = makeFounderCohortHandoff();
  const family = await runFounderDecisionLab({ request: request("Ich suche nächste Woche in Basel einen Ort für ein Familienessen für mich und meine zwölfjährige Tochter."), cohortHandoff: handoff });
  const elys = family.candidates.find((row) => row.label === "ELYS Boulderloft");
  assert.equal(elys.coreIntentCoverage.state, "INCOMPATIBLE"); assert.notEqual(elys.tier, "ELIGIBLE_CONFIRMED");
  assert.ok(family.candidates.every((row) => row.tier !== "ELIGIBLE_CONFIRMED" || row.coreIntentCoverage.state === "CONFIRMED"));
  const accessibility = await runFounderDecisionLab({ request: request("Ich möchte in Basel gemütlich Kaffee trinken und brauche einen rollstuhlgerechten Zugang."), cohortHandoff: handoff });
  const accessOnly = accessibility.candidates.find((row) => row.label === "Volta Bräu");
  assert.equal(accessOnly.confirmedHardConstraints.includes("ACCESSIBILITY"), true); assert.equal(accessOnly.coreIntentCoverage.state, "INCOMPATIBLE"); assert.equal(accessOnly.tier, "INELIGIBLE");
  assert.equal(accessOnly.confirmedHardConstraints.includes("LOCATION_SCOPE"), true);
  assert.ok(accessibility.candidates.every((row) => row.tier !== "ELIGIBLE_CONFIRMED"));
  const unconfigured = await runFounderDecisionLab({ request: request("Essen in Basel"), corrections: { primaryIntent: "context.intent.unreleased" }, cohortHandoff: handoff });
  assert.ok(unconfigured.candidates.every((row) => row.coreIntentCoverage.state === "NOT_CONFIGURED" && row.tier !== "ELIGIBLE_CONFIRMED"));
  assert.doesNotMatch(canonicalJson(PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY), /Volta|ELYS|Tierpark|Consum|Frühling|1101ee26|57cb213c|f8ae8625|ff90b2f4|644fbd15/);
});

test("incomplete free text is fail-closed until primary intent and an explicit authorized target are supplied", async () => {
  const incompleteRequest = request("Ich suche einen Ort für mich und meine zwölfjährige Tochter.", { deviceLocation: { state: "DENIED", city: null } });
  const incomplete = resolveFounderLabText(incompleteRequest);
  assert.deepEqual(founderLabEvaluationGaps(incomplete), ["LOCATION_AUTHORITY_REQUIRED", "PRIMARY_INTENT_REQUIRED"]);
  assert.throws(() => assertFounderLabEvaluable(incomplete), /phase3c_founder_lab_not_evaluable:LOCATION_AUTHORITY_REQUIRED,PRIMARY_INTENT_REQUIRED/);
  const corrected = resolveFounderLabText(incompleteRequest, { primaryIntent: "context.intent.food", targetCity: "Basel" });
  assert.deepEqual(founderLabEvaluationGaps(corrected), []);
  assert.doesNotThrow(() => assertFounderLabEvaluable(corrected));
  const result = await runFounderDecisionLab({ request: incompleteRequest, corrections: { primaryIntent: "context.intent.food", targetCity: "Basel" } });
  assert.equal(result.interpretation.primaryIntent, "context.intent.food");
  assert.equal(result.interpretation.locationAuthority.authorizedCity, "Basel");
});

test("explicit target city wins over device location and denied tracking still permits explicit city", async () => {
  const explicit = await runFounderDecisionLab({ request: request("Restaurant in Zürich", { deviceLocation: { state: "AVAILABLE", city: "Basel" } }) });
  assert.equal(explicit.interpretation.targetCity, "Zurich"); assert.equal(explicit.interpretation.locationAuthority.deviceCityUsed, false);
  const denied = await runFounderDecisionLab({ request: request("Café in Zürich", { deviceLocation: { state: "DENIED", city: null } }) });
  assert.equal(denied.interpretation.locationAuthority.authorizedCity, "Zurich"); assert.equal(denied.interpretation.locationAuthority.state, "KNOWN");
  const corrected = resolveFounderLabText(request("Restaurant in Basel"), { targetCity: "Zurich" }); assert.equal(corrected.targetCity, "Zurich"); assert.equal(corrected.locationAuthority.authorizedCity, "Zurich");
  const missing = resolveFounderLabText(request("Etwas Ruhiges", { deviceLocation: { state: "DENIED", city: null } })); assert.equal(missing.locationAuthority.state, "DENIED");
});

test("budget preserves exact CHF amount and labels only the bounded dinner calibration", () => {
  const value = resolveFounderLabText(request("Günstiges Abendessen in Zürich unter 20 CHF pro Person"));
  assert.deepEqual(value.budget, { state: "KNOWN", amount: 20, currency: "CHF", perPerson: true, calibrationLabel: "LOW_CH_DINNER_EVALUATION_ONLY" });
  assert.ok(value.hardConstraints.includes("BUDGET_MAXIMUM"));
});

test("mood synonyms resolve ephemerally and unknown mood terms remain visible", () => {
  assert.ok(resolveFounderLabText(request("Entspanntes gemütliches Café in Zürich")).moods.includes("context.mood.quiet"));
  const unknown = resolveFounderLabText(request("Café in Zürich Stimmung flirrblau")); assert.deepEqual(unknown.unresolvedTerms, ["flirrblau"]); assert.ok(unknown.limitations.includes("mood-term-unresolved"));
});

test("confirmed Accessibility precedes unknown fallback without converting unknown to false", async () => {
  const result = await runFounderDecisionLab({ request: request("Rollstuhlgerechtes gemütliches Café in Zürich") });
  const confirmed = result.candidates.find((row) => row.confirmedHardConstraints.includes("ACCESSIBILITY")); const unknown = result.candidates.find((row) => row.unknownHardConstraints.includes("ACCESSIBILITY") && row.tier === "UNCONFIRMED_FALLBACK");
  assert.ok(confirmed); assert.ok(unknown); assert.ok(result.candidates.indexOf(confirmed) < result.candidates.indexOf(unknown)); assert.equal(unknown.reasons.find((row) => row.reasonCode === "hard-accessibility-unknown").confirmed, false);
});

test("age rule allows 12 with adult, excludes 12 alone, and allows 13", async () => {
  const adult = await runFounderDecisionLab({ request: request("12-jähriges Kind mit Erwachsenen in einer Bar in Zürich") });
  const alone = await runFounderDecisionLab({ request: request("12-jährige Person allein in einer Bar in Zürich") });
  const thirteen = await runFounderDecisionLab({ request: request("13-jährige Person allein in einer Bar in Zürich") });
  const ageSpot = (value) => value.candidates.find((row) => row.label === "Abendrot Bar");
  assert.ok(ageSpot(adult).confirmedHardConstraints.includes("AGE_OR_LEGAL")); assert.ok(ageSpot(alone).failedHardConstraints.includes("AGE_OR_LEGAL")); assert.ok(ageSpot(thirteen).confirmedHardConstraints.includes("AGE_OR_LEGAL"));
});

test("alternative is neutral and reject remains Decision-context scoped without a User write", async () => {
  const alternative = await runFounderDecisionLab({ request: request("Café in Zürich", { alternativeRequested: true }) }); assert.equal(alternative.alternative.negativeSignalProduced, false);
  const rejected = await runFounderDecisionLab({ request: request("Café in Zürich", { rejectedCandidateIds: ["syn-spot-0001"] }) });
  assert.equal(rejected.reject.scope, "USER_X_SPOT_X_DECISION_X_CONTEXT"); assert.equal(rejected.reject.userEventProduced, false); assert.equal(rejected.writesUserIntelligence, false); assert.equal(rejected.candidates.find((row) => row.candidateId === "syn-spot-0001").tier, "INELIGIBLE");
});

test("only canonical minimized RelevantUserProjection is consumed and never grants eligibility authority", async () => {
  for (const mode of ["NEUTRAL_MISSING", "NO_CONSENT", "COLD", "KILL_SWITCH"]) { const result = await runFounderDecisionLab({ request: request("Café in Zürich", { userMode: mode }) }); assert.equal(result.userProjectionState, "NEUTRAL"); assert.ok(result.candidates.every((row) => !row.userIntelligenceAffectsEligibility)); }
  const active = await runFounderDecisionLab({ request: request("Café in Zürich", { userMode: "ACTIVE_SYNTHETIC" }) }); assert.equal(active.userProjectionState, "ACTIVE"); assert.ok(active.candidates.every((row) => row.userIntelligenceInvolved && !row.userIntelligenceAffectsEligibility));
});

test("missing Founder cohort degrades only to an unmixed synthetic fallback; incomplete or tampered bindings fail", async () => {
  const fallback = await runFounderDecisionLab({ request: request("Café in Zürich") }); assert.equal(fallback.worldCohort.source, "SYNTHETIC_FALLBACK"); assert.equal(fallback.worldCohort.mixedSources, false);
  await assert.rejects(() => runFounderDecisionLab({ request: request("Café in Zürich"), worldReader: { contractVersion: "backyrd.world-knowledge.reader-port@1.0", readSnapshot: async () => ({}) } }), /cohort_binding_incomplete/);
  const fake = { contractVersion: "backyrd.world-knowledge.founder-cohort@1.0", scope: "FOUNDER_EVALUATION_ONLY", cohortId: "fake", frozenAt: "2026-09-12T00:00:00.000Z", registryVersion: "backyrd.world-knowledge.registry@2.0", registryHash: "0".repeat(64), policyVersion: "fake", policyHash: "0".repeat(64), spots: [], exclusions: [], cohortHash: "0".repeat(64) };
  await assert.rejects(() => runFounderDecisionLab({ request: request("Café in Zürich"), worldReader: { contractVersion: "backyrd.world-knowledge.reader-port@1.0", readSnapshot: async () => ({}) }, cohortManifest: fake }), /manifest_invalid/);
});

test("local World handoff evaluates exactly the imported cohort and binds replay to it", async () => {
  const handoff = makeFounderCohortHandoff(["Volta Bräu"]); const input = request("Rollstuhlgerechtes Café in Zürich");
  const result = await runFounderDecisionLab({ request: input, cohortHandoff: handoff });
  assert.equal(result.worldCohort.source, "FOUNDER_WORLD_COHORT"); assert.equal(result.worldCohort.sourceHandoffHash, handoff.handoffHash); assert.deepEqual(result.candidates.map((row) => row.label), ["Volta Bräu"]); assert.ok(result.limitations.includes("single-spot-cohort-comparison-not-representative"));
  assert.equal((await replayFounderDecisionLab(input, result, { cohortHandoff: handoff })).resultHash, result.resultHash);
  await assert.rejects(() => runFounderDecisionLab({ request: input, cohortHandoff: handoff, worldReader: {} }), /sources_must_not_mix/);
});

test("incompatible intents, World conflict, and session state remain explicit", async () => {
  const incompatible = await runFounderDecisionLab({ request: request("Essen und nicht essen in Zürich") }); assert.equal(incompatible.interpretation.intentCompatibility, "INCOMPATIBLE"); assert.ok(incompatible.candidates.some((row) => row.tier === "NOT_CONFIGURED"));
  const worldConflict = await runFounderDecisionLab({ request: request("Ruhiges Restaurant in Zürich") }); assert.equal(worldConflict.candidates.find((row) => row.label === "Nordlicht").tier, "INELIGIBLE");
  const differentOrder = await runFounderDecisionLab({ request: request("Café in Zürich", { rejectedCandidateIds: ["syn-spot-0001", "syn-spot-0002"] }) }); const reversed = await runFounderDecisionLab({ request: request("Café in Zürich", { rejectedCandidateIds: ["syn-spot-0002", "syn-spot-0001"] }) }); assert.notEqual(differentOrder.requestHash, reversed.requestHash);
});

test("result replay is byte-identical and recursively rejects inner full-rehash manipulation", async () => {
  const input = request("Ruhiges Restaurant in Zürich für ein erstes Date"); const first = await runFounderDecisionLab({ request: input }); const second = await runFounderDecisionLab({ request: input }); assert.equal(canonicalJson(first), canonicalJson(second)); assert.equal((await replayFounderDecisionLab(input, first)).resultHash, first.resultHash);
  const changedCandidate = structuredClone(first); changedCandidate.candidates[0].tier = "INELIGIBLE"; changedCandidate.candidates[0] = rehash(changedCandidate.candidates[0], "assessmentHash"); const forged = rehash(changedCandidate, "resultHash"); await assert.rejects(() => replayFounderDecisionLab(input, forged), /replay_mismatch/);
});

test("all 28 Founder oracles are unique, evaluation-only, and recursively replayable", async () => {
  assert.equal(PHASE3C_FOUNDER_ORACLES.length, 28); assert.equal(new Set(PHASE3C_FOUNDER_SCENARIO_IDS).size, 28); assert.ok(PHASE3C_FOUNDER_ORACLES.every((row) => !row.productionAuthorized && !row.productQualityClaim));
  const first = await runFounderLabOracles(); const second = await runFounderLabOracles(); assert.equal(first.reportHash, second.reportHash); assert.equal((await replayFounderLabReport(first)).reportHash, first.reportHash);
  const forged = structuredClone(first); forged.resultHashes[0] = "0".repeat(64); await assert.rejects(() => replayFounderLabReport(rehash(forged, "reportHash")), /replay_mismatch/);
});

test("same domain input is commercially neutral because commercial fields have no contract channel", async () => {
  const first = await runFounderDecisionLab({ request: request("Ruhiges Café in Zürich") }); const second = await runFounderDecisionLab({ request: request("Ruhiges Café in Zürich") }); assert.equal(first.resultHash, second.resultHash);
  for (const field of ["payment", "subscription", "owner", "ownerTier", "sponsored", "advertising"]) assert.throws(() => FounderLabRequestSchema.parse({ ...request("Café in Zürich"), [field]: true }), /unknown field/);
});
