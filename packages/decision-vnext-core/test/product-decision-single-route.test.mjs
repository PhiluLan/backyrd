import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DECISION_PRODUCT_EVALUATION_POLICY, DECISION_PRODUCT_EVALUATION_RELEASE, DECISION_PRODUCT_RANKING_POLICY,
  DecisionProductEvaluationSchema, DecisionProductRequestSchema, PRODUCT_DECISION_VERSIONS,
  SyntheticPhase2UserProjectionPort, SyntheticUserProjectionReader, buildDecisionInteractionLearningEvent, buildDecisionProductExecution,
  canonicalJson, contentHash, createDecisionProductHttpHandler, resolveFounderLabText,
  runFounderDecisionLab, validateDecisionProductExecution, withContentHash,
} from "../dist/index.js";

const ACTOR = Object.freeze({ userId: "product-user", subjectBindingHash: "2".repeat(64), authenticationContextHash: "3".repeat(64), sessionBindingHash: "4".repeat(64), sessionId: "product-session" });
const SERVER_TIME = "2026-09-18T18:00:00.000Z";

function productRequest(text, suffix = "base", overrides = {}) {
  return DecisionProductRequestSchema.parse({
    contractVersion: PRODUCT_DECISION_VERSIONS.request,
    requestId: `product-request-${suffix}`,
    idempotencyKey: `product-idempotency-${suffix}`,
    naturalLanguage: text,
    explicit: {},
    alternativeRequested: false,
    previouslyPresentedCandidateIds: [],
    rejectedCandidateIds: [],
    ...overrides,
  });
}

async function fixture(request, mode = "NO_CONSENT") {
  const decisionId = `decision-${contentHash({ requestId: request.requestId, idempotencyKey: request.idempotencyKey }).slice(0, 32)}`;
  const labRequest = {
    contractVersion: "backyrd.decision-vnext.founder-lab-request@3c-1", requestId: request.requestId,
    ephemeralText: request.naturalLanguage, deviceLocation: { state: "DENIED", city: null }, userMode: "NEUTRAL_MISSING",
    alternativeRequested: request.alternativeRequested, rejectedCandidateIds: request.rejectedCandidateIds,
  };
  const interpretation = resolveFounderLabText(labRequest, request.explicit);
  const projectionRequest = {
    contractVersion: "backyrd.user-intelligence.projection-request@1.0", requestId: `projection-${request.requestId}`,
    actor: { kind: "AUTHENTICATED_USER", userId: ACTOR.userId, subjectBindingHash: ACTOR.subjectBindingHash, authenticationContextHash: ACTOR.authenticationContextHash, boundBy: "SERVER" },
    decisionId, snapshot: mode === "ACTIVE" ? { snapshotId: "synthetic-product-snapshot", snapshotHash: "5".repeat(64) } : null,
    context: { contextContractVersion: interpretation.contractVersion, contextHash: interpretation.interpretationHash, placeTypes: [], domainKeys: [], rawLocationIncluded: false, socialDetailsIncluded: false },
    requestedDomains: [], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "product-test-policy-v1", killSwitch: false,
  };
  const projection = mode === "ACTIVE"
    ? await new SyntheticPhase2UserProjectionPort("ACTIVE").project(projectionRequest)
    : await new SyntheticUserProjectionReader(mode).project(projectionRequest);
  const labEvaluation = await runFounderDecisionLab({ request: labRequest, corrections: request.explicit, userProjection: projection });
  const evaluatorContractVersion = "decision-vnext-product-evaluator@1.0";
  const evaluation = DecisionProductEvaluationSchema.parse(withContentHash({
    contractVersion: PRODUCT_DECISION_VERSIONS.evaluation,
    evaluationId: `product-evaluation-${request.requestId}`,
    createdAt: SERVER_TIME,
    requestHash: contentHash(request),
    interpretation: labEvaluation.interpretation,
    worldCohort: labEvaluation.worldCohort,
    userProjectionHash: labEvaluation.userProjectionHash,
    candidates: labEvaluation.candidates,
    limitations: labEvaluation.limitations,
    evaluatorVersion: evaluatorContractVersion,
    evaluationPolicyHash: DECISION_PRODUCT_EVALUATION_POLICY.policyHash,
    evaluationReleaseHash: DECISION_PRODUCT_EVALUATION_RELEASE.releaseHash,
    sourceKind: "CANONICAL_PRODUCT_PORTS",
    productSemanticsApproved: true,
    productRankingAuthorized: true,
    fixtureSourceUsed: false,
  }, "evaluationHash"));
  const presentations = evaluation.candidates.map((candidate) => withContentHash({
    contractVersion: PRODUCT_DECISION_VERSIONS.presentation, spotId: candidate.candidateId, name: candidate.label,
    locality: evaluation.interpretation.targetCity, categoryLabel: null, imageUrl: null,
    sourceHash: contentHash({ candidateId: candidate.candidateId, assessmentHash: candidate.assessmentHash }),
  }, "presentationHash"));
  return { request, evaluation, projection, presentations, actor: ACTOR, authority: { serverTime: SERVER_TIME, authorizedCity: evaluation.interpretation.targetCity, locationBindingHash: contentHash({ city: evaluation.interpretation.targetCity, subjectBindingHash: ACTOR.subjectBindingHash }) }, evaluatorContractVersion };
}

test("single-route product contract rejects client authority and has one transparent ranking policy", () => {
  assert.deepEqual(DECISION_PRODUCT_RANKING_POLICY.precedence, ["HARD_CONSTRAINTS", "ELIGIBILITY_TIER", "CORE_INTENT_COVERAGE", "ACTUAL_AVAILABILITY", "CONSENTED_USER_RELEVANCE", "SITUATIONAL_CONTEXT_FIT", "WORLD_EVIDENCE", "NEUTRAL_IDENTITY"]);
  assert.throws(() => DecisionProductRequestSchema.parse({ ...productRequest("Café in Zürich"), userId: "attacker" }), /unknown field/);
  assert.equal(DECISION_PRODUCT_RANKING_POLICY.commercialSignalsForbidden, true);
  assert.equal(DECISION_PRODUCT_RANKING_POLICY.fixtureOrderForbidden, true);
  assert.equal(DECISION_PRODUCT_RANKING_POLICY.spotNameForbidden, true);
  assert.equal(DECISION_PRODUCT_EVALUATION_POLICY.founderLabAuthorityAccepted, false);
  assert.equal(DECISION_PRODUCT_EVALUATION_RELEASE.runtimeActivated, false);
  assert.equal(DECISION_PRODUCT_EVALUATION_RELEASE.productionExecutionAuthorized, false);
});

test("evaluation-only Lab authority cannot be relabeled as Product output", async () => {
  const input = await fixture(productRequest("Café in Zürich", "lab-authority"), "NO_CONSENT");
  assert.throws(() => buildDecisionProductExecution({ ...input, evaluation: { ...input.evaluation, evaluationOnly: true, calibrationOnly: true, productionAuthorized: false, productRankingAuthorized: false } }), /unknown field/);
  const { evaluationHash: _evaluationHash, ...body } = input.evaluation;
  const fullyRehashedRelabel = withContentHash({ ...body, evaluationPolicyHash: "0".repeat(64) }, "evaluationHash");
  assert.throws(() => buildDecisionProductExecution({ ...input, evaluation: fullyRehashedRelabel }), /authority_invalid/);
});

test("hard constraints and core intent always precede consented user relevance", async () => {
  const built = buildDecisionProductExecution(await fixture(productRequest("Rollstuhlgerechtes Café in Zürich", "ranking"), "ACTIVE"));
  const ranked = built.response.candidates.filter((candidate) => candidate.rank !== null);
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((candidate) => candidate.failedHardConstraints.length === 0 && candidate.coreIntentCoverage !== "INCOMPATIBLE"));
  assert.ok(built.response.candidates.filter((candidate) => candidate.tier === "INELIGIBLE").every((candidate) => candidate.rank === null));
  assert.equal(built.response.legacyEngineUsed, false);
  assert.equal(built.response.fallbackUsed, false);
  assert.equal(built.envelope.boundaries.userProjectionEligibilityAuthority, false);
});

test("no-consent projection keeps Decision usable and emits no persistent learning event", async () => {
  const built = buildDecisionProductExecution(await fixture(productRequest("Ruhiges Café in Zürich", "no-consent"), "NO_CONSENT"));
  assert.equal(built.response.status, "AVAILABLE");
  assert.equal(built.response.personalization.state, "NEUTRAL");
  assert.equal(built.response.personalization.neutralReason, "NO_CONSENT");
  assert.equal(built.response.learning.mode, "DISABLED_NEUTRAL");
  assert.equal(built.response.learning.acknowledgement, "NOT_APPLICABLE_NEUTRAL");
  assert.deepEqual(built.learningEvents, []);
});

test("active projection emits minimized consent-bound events; alternative and reject stay contextual", async () => {
  const initialRequest = productRequest("Ruhiges Café in Zürich", "initial");
  const initial = buildDecisionProductExecution(await fixture(initialRequest, "ACTIVE"));
  assert.ok(initial.response.primaryCandidateId);
  const alternativeRequest = productRequest("Ruhiges Café in Zürich", "alternative", { alternativeRequested: true, previouslyPresentedCandidateIds: [initial.response.primaryCandidateId] });
  const alternative = buildDecisionProductExecution(await fixture(alternativeRequest, "ACTIVE"));
  assert.notEqual(alternative.response.alternative.selectedCandidateId, initial.response.primaryCandidateId);
  assert.equal(alternative.response.alternative.negativeSignalProduced, false);
  assert.ok(alternative.learningEvents.some((event) => event.eventType === "alternative_requested"));
  assert.ok(alternative.learningEvents.every((event) => event.feedback === null && event.targetEventId === null));

  const rejectedId = initial.response.primaryCandidateId;
  const rejectRequest = productRequest("Ruhiges Café in Zürich", "reject", { rejectedCandidateIds: [rejectedId] });
  const rejected = buildDecisionProductExecution(await fixture(rejectRequest, "ACTIVE"));
  const row = rejected.response.candidates.find((candidate) => candidate.spotId === rejectedId);
  assert.equal(row.contextualReject, true);
  assert.equal(row.rank, null);
  assert.equal(rejected.response.reject.worldFactProduced, false);
  assert.ok(rejected.learningEvents.some((event) => event.eventType === "candidate_rejected" && event.spotId === rejectedId));

  const interactionBase = { sessionId: ACTOR.sessionId, candidateId: rejectedId, occurredAt: SERVER_TIME, verifiedExecution: initial };
  const impression = buildDecisionInteractionLearningEvent({ ...interactionBase, eventType: "candidate_impression", actionId: "visible-action" });
  const opened = buildDecisionInteractionLearningEvent({ ...interactionBase, eventType: "candidate_opened", actionId: "open-action" });
  assert.equal(impression.eventType, "candidate_impression");
  assert.equal(opened.eventType, "candidate_opened");
  assert.notEqual(impression.idempotencyKey, opened.idempotencyKey);
  assert.throws(() => buildDecisionInteractionLearningEvent({ ...interactionBase, candidateId: "not-presented", eventType: "candidate_opened", actionId: "forged-action" }), /candidate_not_presented/);
});

test("A-D contexts produce deterministic vNext-only product results", async () => {
  const scenarios = [
    ["A", "Ruhiges Restaurant in Zürich für ein erstes Date, höchstens 40 CHF pro Person"],
    ["B", "Familienessen in Zürich mit 12-jährigem Kind und Erwachsenen"],
    ["C", "Rollstuhlgerechtes gemütliches Café in Zürich"],
    ["D", "Ich bin in Basel und suche ein Restaurant in Zürich"],
  ];
  for (const [id, text] of scenarios) {
    const input = await fixture(productRequest(text, id), "NO_CONSENT");
    const one = buildDecisionProductExecution(input); const two = buildDecisionProductExecution(input);
    assert.equal(canonicalJson(one), canonicalJson(two), id);
    assert.equal(one.response.interpretation.targetCity, "Zurich", id);
    assert.equal(one.response.legacyEngineUsed, false, id);
  }
});

test("recursive replay rejects fully rehashed inner manipulation", async () => {
  const input = await fixture(productRequest("Ruhiges Café in Zürich", "replay"), "ACTIVE");
  const built = buildDecisionProductExecution(input);
  assert.equal(validateDecisionProductExecution(input, built).response.resultHash, built.response.resultHash);
  const first = built.response.candidates[0];
  const forgedCandidate = { ...first, presentation: { ...first.presentation, name: "Manipuliert" } };
  forgedCandidate.candidateHash = contentHash(Object.fromEntries(Object.entries(forgedCandidate).filter(([key]) => key !== "candidateHash")));
  const forgedResponse = { ...built.response, candidates: [forgedCandidate, ...built.response.candidates.slice(1)] };
  forgedResponse.resultHash = contentHash(Object.fromEntries(Object.entries(forgedResponse).filter(([key]) => key !== "resultHash")));
  assert.throws(() => validateDecisionProductExecution(input, { ...built, response: forgedResponse }), /recursive_integrity_mismatch/);
});

test("candidate input order, display names and commercial-looking unknown fields cannot influence ranking", async () => {
  const input = await fixture(productRequest("Ruhiges Café in Zürich", "neutrality"), "NO_CONSENT");
  const original = buildDecisionProductExecution(input);
  const { evaluationHash: _evaluationHash, ...evaluationBody } = input.evaluation;
  const reorderedEvaluation = withContentHash({ ...evaluationBody, candidates: [...input.evaluation.candidates].reverse() }, "evaluationHash");
  const reorderedPresentations = [...input.presentations].reverse().map(({ presentationHash: _presentationHash, ...row }) => withContentHash({ ...row, name: `Anzeige ${row.spotId}` }, "presentationHash"));
  const reordered = buildDecisionProductExecution({ ...input, evaluation: reorderedEvaluation, presentations: reorderedPresentations });
  assert.deepEqual(reordered.response.candidates.map((row) => row.spotId), original.response.candidates.map((row) => row.spotId));
  assert.throws(() => buildDecisionProductExecution({ ...input, presentations: input.presentations.map((row, index) => index ? row : { ...row, ownerTier: "PREMIUM" }) }), /unknown field/);
});

test("HTTP boundary accepts any authenticated account, replays byte-identically, and visibly fails closed", async () => {
  const request = productRequest("Ruhiges Café in Zürich", "http"); const evaluated = await fixture(request, "NO_CONSENT");
  let evaluatedCount = 0; let learningCount = 0;
  const records = new Map();
  const ports = {
    auth: { async authenticate() { return ACTOR; } }, rateLimit: { async consume() { return true; } },
    control: { timeoutMilliseconds: 2_000, maxRequestBytes: 16_384, async assertBoundary() {} },
    async evaluate() { evaluatedCount += 1; const { request: _request, actor: _actor, ...rest } = evaluated; return rest; },
    idempotency: { async commit(value) { const existing = records.get(value.idempotencyKey); if (existing) return { status: "REPLAYED", execution: existing }; records.set(value.idempotencyKey, value.execution); return { status: "CREATED" }; } },
    learning: {
      contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0",
      async record() { learningCount += 1; throw new Error("neutral_projection_must_not_write"); },
    },
  };
  const handler = createDecisionProductHttpHandler(ports);
  const response = await handler(new Request("https://example.test/functions/v1/decision-v13", { method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: JSON.stringify(request) }));
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.status, "AVAILABLE"); assert.equal(body.legacyEngineUsed, false); assert.equal(evaluatedCount, 1); assert.equal(learningCount, 0);
  const replayResponse = await handler(new Request("https://example.test/functions/v1/decision-v13", { method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: JSON.stringify(request) }));
  assert.equal(replayResponse.status, 200);
  assert.equal(JSON.stringify(await replayResponse.json()), JSON.stringify(body));

  const denied = createDecisionProductHttpHandler({ ...ports, control: { ...ports.control, async assertBoundary(boundary) { if (boundary === "AUTH") throw new Error("kill-switch"); } } });
  const unavailable = await denied(new Request("https://example.test/functions/v1/decision-v13", { method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: JSON.stringify(request) }));
  assert.equal(unavailable.status, 503); const unavailableBody = await unavailable.json(); assert.equal(unavailableBody.status, "UNAVAILABLE"); assert.equal(unavailableBody.legacyFallbackUsed, false);
});

test("active learning uses canonical idempotent User receipts on create and replay", async () => {
  const request = productRequest("Ruhiges Café in Zürich", "learning-replay"); const evaluated = await fixture(request, "ACTIVE");
  const records = new Map(); const seen = new Map();
  const ports = {
    auth: { async authenticate() { return ACTOR; } }, rateLimit: { async consume() { return true; } },
    control: { timeoutMilliseconds: 2_000, maxRequestBytes: 16_384, async assertBoundary() {} },
    async evaluate() { const { request: _request, actor: _actor, ...rest } = evaluated; return rest; },
    idempotency: { async commit(value) { const existing = records.get(value.idempotencyKey); if (existing) return { status: "REPLAYED", execution: existing }; records.set(value.idempotencyKey, value.execution); return { status: "CREATED" }; } },
    learning: {
      contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0",
      async record(event) {
        const previous = seen.get(event.idempotencyKey); seen.set(event.idempotencyKey, event);
        return { contractVersion: "backyrd.user-intelligence.product-decision-learning-receipt@1.0", status: previous ? "REPLAYED" : "PERSISTED", persisted: true, eventId: event.eventId, recordHash: contentHash(event), neutralProjectionRequired: false };
      },
    },
  };
  const handler = createDecisionProductHttpHandler(ports);
  const invoke = () => handler(new Request("https://example.test/functions/v1/decision-v13", { method: "POST", headers: { authorization: "Bearer valid" }, body: JSON.stringify(request) }));
  const one = await invoke(); const oneText = await one.text(); const firstKeys = [...seen.keys()];
  const two = await invoke(); const twoText = await two.text();
  assert.equal(one.status, 200); assert.equal(two.status, 200); assert.equal(twoText, oneText);
  assert.deepEqual([...seen.keys()], firstKeys);
  assert.ok(firstKeys.length > 0);
});

test("deadline races and aborts hanging auth, evaluation, idempotency and learning stages", async () => {
  for (const stage of ["AUTH", "EVALUATION", "IDEMPOTENCY", "LEARNING"]) {
    const request = productRequest("Ruhiges Café in Zürich", `timeout-${stage.toLowerCase()}`);
    const evaluated = await fixture(request, "ACTIVE"); let aborted = false;
    const hang = (signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true }));
    const handler = createDecisionProductHttpHandler({
      auth: { async authenticate(_token, signal) { return stage === "AUTH" ? hang(signal) : ACTOR; } },
      rateLimit: { async consume() { return true; } },
      control: { timeoutMilliseconds: 20, maxRequestBytes: 16_384, async assertBoundary() {} },
      async evaluate(_request, _actor, signal) { if (stage === "EVALUATION") return hang(signal); const { request: _ignoredRequest, actor: _ignoredActor, ...rest } = evaluated; return rest; },
      idempotency: { async commit(_value, signal) { return stage === "IDEMPOTENCY" ? hang(signal) : { status: "CREATED" }; } },
      learning: {
        contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0",
        async record(event, signal) {
          if (stage === "LEARNING") return hang(signal);
          return { contractVersion: "backyrd.user-intelligence.product-decision-learning-receipt@1.0", status: "PERSISTED", persisted: true, eventId: event.eventId, recordHash: contentHash(event), neutralProjectionRequired: false };
        },
      },
    });
    const response = await handler(new Request("https://example.test/functions/v1/decision-v13", { method: "POST", headers: { authorization: "Bearer valid" }, body: JSON.stringify(request) }));
    assert.equal(response.status, 504, stage); assert.equal(aborted, true, stage);
    assert.equal((await response.json()).legacyFallbackUsed, false, stage);
  }
});

test("active product module has no legacy, founder allowlist, dual-run or fallback channel", async () => {
  const source = await readFile(new URL("../src/product-decision.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /EXISTING_ENGINE|legacyBody|fallbackFunction|invokeExisting|FounderLiveAllowlistPort|createFounderLiveDualRun/);
  const contracts = await readFile(new URL("../src/product-decision-contracts.ts", import.meta.url), "utf8");
  assert.doesNotMatch(contracts, /decision-learning-event@1\.0|DecisionLearningEventSchema/);
});
