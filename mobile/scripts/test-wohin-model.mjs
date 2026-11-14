import "./test-decision-diagnostics.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { validateDecisionProductRequest } from "@backyrd/product-decision-contract";

const source = fs.readFileSync(new URL("../lib/decision/wohinModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createWohinRequest, visibleWohinCandidates, wohinRecommendation, wohinConsiderations, wohinClarificationQuery, wohinFollowUp, wohinLimitations, wohinPlaceMeta } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

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

test("Wohin offers a follow-up without turning unverified places into recommendations", () => {
  const candidate = { rank: null, contextualReject: false, failedHardConstraints: [], unknownHardConstraints: ["OPEN_ON_REQUESTED_DAY"] };
  const response = { primaryCandidateId: null, limitations: [], candidates: [candidate] };
  assert.deepEqual(visibleWohinCandidates(response), []);
  assert.match(wohinFollowUp(response).message, /nicht bestätigen/);
  assert.match(wohinFollowUp({ ...response, candidates: [{ ...candidate, failedHardConstraints: ["CLOSED"] }] }).message, /keinen ausreichend belegten Vorschlag/);
  assert.match(wohinFollowUp({ ...response, limitations: ["CORE_INTENT_REQUIRES_CLARIFICATION"] }).message, /Was möchtest du/);
  assert.match(wohinFollowUp({ ...response, limitations: ["REQUEST_NEEDS_CLARIFICATION"] }).message, /Budget pro Person/);
  assert.match(wohinFollowUp({ ...response, limitations: ["MULTI_PLACE_SEARCH_UNSUPPORTED"] }).message, /Mit welchem/);
  const revised = createWohinRequest({ query: "Stufenloses Café, auch morgen möglich", city: "Basel", requestId: "follow-up-1" });
  validateDecisionProductRequest(revised);
  assert.equal(revised.naturalLanguage, "Stufenloses Café, auch morgen möglich");
  assert.equal(revised.alternativeRequested, false);
  assert.deepEqual(revised.rejectedCandidateIds, []);
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

test("non-blocking age uncertainty and consumption exceptions remain visible on confirmed results", () => {
 const age="Die konkrete Alterseignung ist hier nicht vollständig dokumentiert. Bekannte Alters- und Begleitregeln werden berücksichtigt.";
 const minimum="Bewegungslandschaft für Kinder: ab 1 Jahr. Bitte prüfe die Altersgrenze vor dem Besuch.";
 const food="Eigene Speisen: Nicht in den Restaurants.";
 const candidate={coreIntentCoverage:"CONFIRMED",unknownHardConstraints:[],reasons:[{code:"librarian-age-requirement",domain:"LIMITATION",confirmed:false,statement:minimum},{code:"librarian-age-rules-unconfirmed",domain:"LIMITATION",confirmed:false,statement:age},{code:"librarian-external-consumption-exceptions",domain:"LIMITATION",confirmed:false,statement:food}]};
 assert.deepEqual(wohinConsiderations(candidate,false),[minimum,age,food]);
});

test("A clarification answer extends the original wish while ranked candidates remain visible", () => {
  const response = {clarification:"Woran erkennst du das Café?",primaryCandidateId:"spot-1",candidates:[{spotId:"spot-1",rank:1,contextualReject:false}]};
  assert.equal(visibleWohinCandidates(response).length,1);
  const query = wohinClarificationQuery("Das Café beim Park",response.clarification,"Eine Terrasse");
  assert.match(query,/Das Café beim Park\nRückfrage: Woran erkennst du das Café\?\nAntwort: Eine Terrasse/);
  assert.equal(wohinClarificationQuery("Das Café beim Park",response.clarification,"  "),null);
  assert.equal(wohinClarificationQuery("x".repeat(2000),response.clarification,"Eine Terrasse"),null);
});

test('an empty local catalog offers an explicit location change', () => {
 const result = wohinFollowUp({limitations:['NO_CATALOG_CANDIDATES'],candidates:[]});
 assert.equal(result.actionLabel,'Ort ändern');
 assert.match(result.message,/keine Spots oder Veranstaltungen erfasst/);
});

test("Wohin shows documented options with their unresolved condition", () => {
  const provisional = (code, statement) => ({
    rank:null, tier:"UNCONFIRMED_FALLBACK", contextualReject:false, failedHardConstraints:[],
    reasons:[{code,statement}],
  });
  const weather = provisional("librarian-confirmed-weather-branch", "Passend bei Regen. Welcher Wetterfall eintritt, ist offen.");
  const nearby = provisional("librarian-provisional-nearby", "In der Nähe. Ob der Ort zu eurer geplanten Aktivität passt, ist noch offen.");
  const dinner = provisional("librarian-dinner-cuisine-unconfirmed", "Abendessen ist belegt. Küchenstil und Preisniveau sind noch offen.");
  const closed = {...weather, failedHardConstraints:["CLOSED"]};
  assert.deepEqual(visibleWohinCandidates({primaryCandidateId:null,candidates:[weather,nearby,closed]}),[weather]);
  assert.deepEqual(visibleWohinCandidates({primaryCandidateId:null,candidates:[nearby],clarification:"Was möchtet ihr machen?"}),[nearby]);
  assert.match(wohinRecommendation(weather),/bei Regen/);
  assert.deepEqual(visibleWohinCandidates({primaryCandidateId:null,candidates:[dinner]}),[dinner]);
  assert.match(wohinRecommendation(dinner),/Küchenstil und Preisniveau sind noch offen/);
});
