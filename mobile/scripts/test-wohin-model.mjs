import "./test-decision-diagnostics.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { validateDecisionProductRequest } from "@backyrd/product-decision-contract";

const source = fs.readFileSync(new URL("../lib/decision/wohinModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createWohinRequest, visibleWohinCandidates, wohinRecommendation, wohinConsiderations, wohinLimitations, wohinPlaceMeta } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test("Wohin sends only the new free text and profile city", () => {
  const request = createWohinRequest({ query: "  Sonntag   gemütlich Kaffee trinken  ", city: "Basel", requestId: "test-request-1" });
  validateDecisionProductRequest(request);
  assert.equal(request.naturalLanguage, "Sonntag gemütlich Kaffee trinken");
  assert.deepEqual(request.explicit, { targetCity: "Basel", targetCityRole: "SEARCH_CONTEXT" });
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

test("unknown conditions stay visible without ranking boilerplate", () => {
  const candidate = {
    coreIntentCoverage: "UNKNOWN",
    unknownHardConstraints: ["ACCESSIBILITY_STEP_FREE", "OPEN_ON_REQUESTED_DAY"],
    reasons: [
      { code: "core-intent-unknown", confirmed: false, statement: "Nicht bestätigt." },
      { code: "user-taste-positive-cozy", confirmed: true, statement: "Freigegebene Präferenz." },
      { code: "product-rank-versus-next-v1", confirmed: true, statement: "Vor dem nächsten Platz wegen eines neutralen stabilen Tie-Breakers, nicht wegen einer besser belegten Passung." },
    ],
  };
  assert.deepEqual(wohinConsiderations(candidate, false), [
    "Ob du hier genau das Richtige findest, wissen wir noch nicht.",
    "Manche Details zu deinem Wunsch sind noch offen.",
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
  assert.deepEqual(wohinConsiderations(candidate, false), [
    "Ob es für dich und deine Begleitung passt, wissen wir noch nicht.",
    "Ob die Preise günstig sind, wissen wir noch nicht.",
  ]);
});

test("unverified music and precise time are not presented as a full match", () => {
  const candidate = {
    tier: "UNCONFIRMED_FALLBACK", coreIntentCoverage: "CONFIRMED", unknownHardConstraints: [],
    reasons: [
      { code: "music-at-visit-unverified", confirmed: false, statement: "Musik nicht bestätigt." },
      { code: "precise-time-unverified", confirmed: false, statement: "Uhrzeit nicht geprüft." },
    ],
  };
  assert.deepEqual(wohinConsiderations(candidate, false), [
    "Ob bei deinem Besuch Musik läuft, wissen wir noch nicht.",
    "Ob dein Besuch zur gewünschten Uhrzeit möglich ist, wissen wir noch nicht.",
  ]);
});

test("response limitations remain visible in plain language", () => {
  assert.deepEqual(wohinLimitations(["SINGLE_CANDIDATE"], 1), ["Für deinen Wunsch haben wir gerade einen Vorschlag."]);
  assert.deepEqual(wohinLimitations(["SINGLE_CANDIDATE"], 0), ["Der bisher gefundene Ort passt leider nicht zu deinem Wunsch."]);
  assert.deepEqual(wohinLimitations(["CANDIDATE_WINDOW_LIMITED"], 2), ["Einige Orte passen nicht zu deinem Wunsch und werden deshalb nicht gezeigt."]);
  assert.deepEqual(wohinLimitations(["FUTURE_LIMITATION", "ANOTHER_FUTURE_LIMITATION"], 1), ["Bei dieser Auswahl gibt es noch offene Fragen. Prüfe wichtige Details vor deinem Besuch."]);
  assert.deepEqual(wohinLimitations([], 0), []);
});

test("current librarian facts produce useful copy without exposing policy or promoting uncertainty", () => {
 const candidate={presentation:{categoryLabel:"SPORT_MOVEMENT",locality:"Basel"},coreIntentCoverage:"CONFIRMED",unknownHardConstraints:["LBR:missing"],reasons:[
  {code:"LBR:activity",domain:"WORLD",confirmed:true,statement:"Bestätigt: die gewünschte Aktivität."},
  {code:"LBR:area",domain:"LIMITATION",confirmed:false,statement:"Noch nicht bestätigt: der gewünschte Bereich."},
  {code:"product-ranking-policy-v6",domain:"RANKING",confirmed:true,statement:"technical ranking"},
 ]};
 assert.deepEqual(wohinConsiderations(candidate,false),["Ob du hier wie gewünscht drinnen oder draussen sein kannst, wissen wir noch nicht."]);
 assert.equal(wohinPlaceMeta(candidate),"Sport & Bewegung · Basel");
 assert.equal(wohinPlaceMeta({...candidate,presentation:{categoryLabel:"FUTURE_INTERNAL_TYPE",locality:"Basel"}}),"Basel");
});

test("one sentence uses only confirmed World evidence and does not promote possible offers", () => {
 const base={coreIntentCoverage:"CONFIRMED",reasons:[]};
 const offer={code:"librarian-selected-offers",domain:"WORLD",confirmed:true,statement:"Passende Angebote: Getränke"};
 assert.equal(wohinRecommendation({...base,reasons:[offer]}),"Hier gibt’s Getränke – passend zu dem, was du suchst.");
 for(const reason of [{...offer,confirmed:false},{...offer,domain:"RANKING"},{...offer,statement:"Mögliche Angebote: Getränke"}]) {
  assert.match(wohinRecommendation({...base,reasons:[reason]}),/fehlen uns/);
 }
 assert.match(wohinRecommendation({...base,reasons:[{code:"LBR:drink",domain:"WORLD",confirmed:true,statement:"Bestätigt: die Getränkeauswahl."}]}),/Drink/);
 assert.match(wohinRecommendation({...base,reasons:[{code:"core-intent-confirmed",domain:"WORLD",confirmed:true,statement:"internal"}]}),/passende Idee/);
});

test("an event card shows its real date and venue without a Spot-hours claim", () => {
 const candidate={presentation:{event:{startAt:"2026-10-15T18:00:00.000Z",venueName:"Musikraum"},locality:"Basel"},coreIntentCoverage:"UNKNOWN",reasons:[]};
 assert.match(wohinPlaceMeta(candidate),/Musikraum/);
 assert.match(wohinPlaceMeta(candidate),/20:00/);
 assert.match(wohinRecommendation(candidate),/Vielleicht/);
 assert.doesNotMatch(wohinRecommendation(candidate),/geöffnet/);
});
