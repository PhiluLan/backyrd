import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { validateDecisionProductRequest } from "@backyrd/product-decision-contract";

const source = fs.readFileSync(new URL("../lib/decision/wohinModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createWohinRequest, visibleWohinCandidates, wohinFitLabel, wohinHighlights, wohinConsiderations, wohinLimitations } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

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
  assert.equal(wohinFitLabel({ tier: "ELIGIBLE_CONFIRMED", coreIntentCoverage: "CONFIRMED" }), "Passend zu deinem Wunsch");
  assert.equal(wohinFitLabel({ tier: "NOT_CONFIGURED", coreIntentCoverage: "NOT_CONFIGURED" }), "Passung noch nicht vollständig belegt");
  assert.equal(wohinFitLabel({ tier: "UNCONFIRMED_FALLBACK", coreIntentCoverage: "UNKNOWN" }), "Passung noch nicht vollständig belegt");
});

test("Wohin shows at most two distinct, confirmed user-facing reasons", () => {
  const candidate = {
    coreIntentCoverage: "CONFIRMED",
    unknownHardConstraints: [],
    reasons: [
      { code: "core-intent-confirmed", confirmed: true, statement: "Die bestätigte Kernklassifikation passt zur Absicht." },
      { code: "atmosphere-fit", confirmed: true, statement: "Die bestätigte Atmosphäre passt zu deinem Wunsch." },
      { code: "primary-purpose-confirmed", confirmed: true, statement: "Der bestätigte Hauptzweck unterstützt die Absicht zusätzlich." },
      { code: "product-ranking-policy-v2", confirmed: true, statement: "Die Reihenfolge folgt der freigegebenen lexikografischen Decision-vNext-Policy." },
      { code: "price-level-fit", confirmed: false, statement: "Nicht bestätigt." },
    ],
  };
  assert.deepEqual(wohinHighlights(candidate, false), ["Die Art des Ortes passt zu deinem Wunsch.", "Die Atmosphäre passt zu dem, was du suchst."]);
  assert.equal(wohinHighlights(candidate, false).some((reason) => /Policy|Hauptzweck|nicht bestätigt/.test(reason)), false);
  assert.deepEqual(wohinHighlights({ ...candidate, reasons: candidate.reasons.filter((reason) => reason.code !== "atmosphere-fit") }, false), ["Die Art des Ortes passt zu deinem Wunsch."]);
  assert.deepEqual(wohinConsiderations(candidate, false), []);
});

test("unknown conditions and neutral order are disclosed without claiming better fit", () => {
  const candidate = {
    coreIntentCoverage: "UNKNOWN",
    unknownHardConstraints: ["ACCESSIBILITY_STEP_FREE", "OPEN_ON_REQUESTED_DAY"],
    reasons: [
      { code: "core-intent-unknown", confirmed: false, statement: "Nicht bestätigt." },
      { code: "user-taste-positive-cozy", confirmed: true, statement: "Freigegebene Präferenz." },
      { code: "product-rank-versus-next-v1", confirmed: true, statement: "Vor dem nächsten Platz wegen eines neutralen stabilen Tie-Breakers, nicht wegen einer besser belegten Passung." },
    ],
  };
  assert.deepEqual(wohinHighlights(candidate, false), []);
  assert.deepEqual(wohinHighlights(candidate, true), ["Passt zu deinen freigegebenen Vorlieben."]);
  assert.deepEqual(wohinConsiderations(candidate, false), [
    "Ob dieser Ort genau zu deinem Wunsch passt, ist noch nicht bestätigt.",
    "Eine angefragte Bedingung konnte noch nicht bestätigt werden.",
    "Bei ähnlich gut belegten Orten bedeutet die Reihenfolge keine bessere Passung.",
  ]);
});

test("unknown companion and low-price claims stay visible as uncertainty", () => {
  const candidate = {
    tier: "UNCONFIRMED_FALLBACK", coreIntentCoverage: "CONFIRMED", unknownHardConstraints: [],
    reasons: [
      { code: "visit-unconfirmed", confirmed: false, statement: "Ob dieser Ort für deine Begleitung geeignet ist, ist nicht bestätigt." },
      { code: "price-level-unconfirmed", confirmed: false, statement: "Niedriges Preisniveau nicht bestätigt." },
    ],
  };
  assert.equal(wohinFitLabel(candidate), "Passung noch nicht vollständig belegt");
  assert.deepEqual(wohinHighlights(candidate, false), []);
  assert.deepEqual(wohinConsiderations(candidate, false), [
    "Ob der Ort für deine Begleitung und Situation geeignet ist, ist noch nicht bestätigt.",
    "Ein niedriges Preisniveau ist für diesen Ort nicht bestätigt.",
  ]);
});

test("response limitations remain visible in plain language", () => {
  assert.deepEqual(wohinLimitations(["SINGLE_CANDIDATE"], 1), ["Für diesen Wunsch steht gerade nur ein geprüfter Ort zur Auswahl."]);
  assert.deepEqual(wohinLimitations(["SINGLE_CANDIDATE"], 0), ["Für diesen Wunsch wurde nur ein Ort geprüft; er konnte nicht empfohlen werden."]);
  assert.deepEqual(wohinLimitations(["CANDIDATE_WINDOW_LIMITED"], 2), ["Nicht alle geprüften Orte erfüllen die Voraussetzungen für diesen Wunsch."]);
  assert.deepEqual(wohinLimitations(["FUTURE_LIMITATION", "ANOTHER_FUTURE_LIMITATION"], 1), ["Zu dieser Auswahl liegen weitere Einschränkungen vor. Prüfe wichtige Angaben vor deinem Besuch."]);
  assert.deepEqual(wohinLimitations([], 0), []);
});
