import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { validateDecisionProductRequest } from "@backyrd/product-decision-contract";

const source = fs.readFileSync(new URL("../lib/decision/wohinModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createWohinRequest, visibleWohinCandidates, wohinEvidenceState } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test("Wohin sends only the new free text and profile city", () => {
  const request = createWohinRequest({ query: "  Sonntag   gemütlich Kaffee trinken  ", city: "Basel", requestId: "test-request-1" });
  validateDecisionProductRequest(request);
  assert.equal(request.naturalLanguage, "Sonntag gemütlich Kaffee trinken");
  assert.deepEqual(request.explicit, { targetCity: "Basel" });
  assert.equal(request.alternativeRequested, false);
  assert.deepEqual(request.previouslyPresentedCandidateIds, []);
  assert.deepEqual(request.rejectedCandidateIds, []);
  assert.equal(createWohinRequest({ query: "Kaffee", city: "Zürich", requestId: "test-request-zurich" }).explicit.targetCity, "Zurich");
  assert.throws(() => createWohinRequest({ query: " ", city: "Basel", requestId: "test-request-2" }), /wohin_query_invalid/);
});

test("Wohin shows the first five in server order and never manufactures missing places", () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({ spotId: `spot-${index + 1}`, rank: index + 1, contextualReject: false }));
  const response = { primaryCandidateId: "spot-1", candidates };
  assert.deepEqual(visibleWohinCandidates(response).map((candidate) => candidate.spotId), ["spot-1", "spot-2", "spot-3", "spot-4", "spot-5"]);
  assert.equal(visibleWohinCandidates({ primaryCandidateId: "spot-1", candidates: candidates.slice(0, 2) }).length, 2);
  assert.throws(() => visibleWohinCandidates({ primaryCandidateId: "spot-1", candidates: [candidates[1], candidates[0]] }), /wohin_server_ranking_invalid/);
  assert.throws(() => visibleWohinCandidates({ primaryCandidateId: "spot-4", candidates }), /wohin_primary_binding_invalid/);
});

test("Unconfirmed evidence is never presented as a confirmed match", () => {
  assert.equal(wohinEvidenceState({ tier: "ELIGIBLE_CONFIRMED", coreIntentCoverage: "CONFIRMED" }), "Kernabsicht bestätigt");
  assert.equal(wohinEvidenceState({ tier: "NOT_CONFIGURED", coreIntentCoverage: "NOT_CONFIGURED" }), "Passung nicht bestätigt");
  assert.equal(wohinEvidenceState({ tier: "UNCONFIRMED_FALLBACK", coreIntentCoverage: "UNKNOWN" }), "Passung nicht bestätigt");
});
