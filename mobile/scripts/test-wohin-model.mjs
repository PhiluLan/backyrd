import "./test-decision-diagnostics.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { validateDecisionProductRequest } from "@backyrd/product-decision-contract";

const source = fs.readFileSync(new URL("../lib/decision/wohinModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { wohinAvailability, createWohinRequest, visibleWohinCandidates, wohinRecommendation, wohinConsiderations, wohinClarificationQuery, wohinFollowUp, wohinLimitations, wohinPlaceMeta, wohinDiscoveryDirections, wohinIsDiscoveryPlaceholder, wohinDiscoveryCategories, wohinMessageKind } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

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
  assert.match(wohinFollowUp(response).message, /noch unsicher/);
  assert.match(wohinFollowUp({ ...response, candidates: [{ ...candidate, failedHardConstraints: ["CLOSED"] }] }).message, /keinen passenden Ort/);
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
 const offer={code:"librarian-selected-offers",domain:"WORLD",confirmed:true,statement:"Passende Angebote: Hausgemachte Limonade"};
 assert.equal(wohinRecommendation({...base,reasons:[offer]}),"Hier gibt’s Hausgemachte Limonade.");
 for(const reason of [{...offer,confirmed:false},{...offer,domain:"RANKING"},{...offer,statement:"Mögliche Angebote: Hausgemachte Limonade"}]) {
  assert.match(wohinRecommendation({...base,reasons:[reason]}),/fehlen/);
 }
 assert.match(wohinRecommendation({...base,reasons:[{code:"LBR:drink",domain:"WORLD",confirmed:true,statement:"Bestätigt: die Getränkeauswahl."}]}),/Getränk/);
 assert.match(wohinRecommendation({...base,reasons:[{code:"core-intent-confirmed",domain:"WORLD",confirmed:true,statement:"internal"}]}),/passt zu deinem Plan/);
});

test("birthday cards explain the confirmed meal, visit window and spot-specific atmosphere", () => {
 const meal = { code: "LBR_EVIDENCE:meal", domain: "WORLD", confirmed: true, statement: "Bestätigt: die Essensmöglichkeit." };
 const mood = { code: "LBR_EVIDENCE:mood", domain: "WORLD", confirmed: true, statement: "Bestätigt: die gewünschte Atmosphäre." };
 const interpretation = { moods: ["cozy"], dateTime: { dayPhase: "EVENING" } };
 const dinner = { actualAvailability: "open", reasons: [meal, mood] };
 assert.equal(wohinRecommendation(dinner, interpretation), "Hier kannst du am gewünschten Abend gemütlich essen gehen.");
 assert.equal(wohinRecommendation({ ...dinner, reasons: [meal] }, interpretation), "Hier kannst du am gewünschten Abend essen gehen.");
 assert.equal(wohinRecommendation({ ...dinner, actualAvailability: "unknown" }, interpretation), "Hier kannst du gemütlich essen gehen. Schau vor dem Losgehen kurz nach, ob du zur gewünschten Zeit vorbeikannst.");
 assert.doesNotMatch(wohinRecommendation(dinner, { ...interpretation, moods: ["cozy", "romantic"] }), /gemütlich|romantisch|klein/);
});

test("an event card shows its real date and venue without a Spot-hours claim", () => {
 const candidate={presentation:{event:{startAt:"2026-10-15T18:00:00.000Z",venueName:"Musikraum"},locality:"Basel"},coreIntentCoverage:"UNKNOWN",reasons:[]};
 assert.match(wohinPlaceMeta(candidate),/Musikraum/);
 assert.match(wohinPlaceMeta(candidate),/20:00/);
 assert.match(wohinRecommendation(candidate),/noch offen/);
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
  assert.match(wohinRecommendation(dinner),/Ob Küche und Preise zu deinem Plan passen/);
});

test("provisional visits accepted by the server remain visible and explicitly uncertain", () => {
  const visit = { rank: null, tier: "UNCONFIRMED_FALLBACK", contextualReject: false, failedHardConstraints: [],
    reasons: [{ code: "librarian-provisional-visit", statement: "Eine Bedingung bleibt offen." }] };
  assert.deepEqual(visibleWohinCandidates({primaryCandidateId:null,candidates:[visit,{...visit,actualAvailability:"closed"},{...visit,failedHardConstraints:["ACCESS"]}]}),[visit]);
  assert.match(wohinRecommendation(visit), /Ein Punkt ist noch offen/);
});

test("card copy shows the exact evidence and prioritizes a caveat about visiting", () => {
 const fact = (label, confirmed) => ({code: confirmed ? "LBR_EVIDENCE:match" : "LBR:open",
  domain: confirmed ? "WORLD" : "LIMITATION", confirmed,
  statement: `${confirmed ? "Bestätigt" : "Noch nicht bestätigt"}: ${label}.`});
 const context = { dateTime: {dayPhase: "EVENING"} };
 const card = (confirmed, missing = [], actualAvailability = "open") => ({
  reasons: [fact(confirmed, true), ...missing.map(label => fact(label, false))], actualAvailability,
 });
 assert.equal(wohinRecommendation(card("Cocktails"), context), "Hier bekommst du abends Cocktails.");
 assert.equal(wohinRecommendation(card("Getränke vor Ort", ["Cocktails"]), context),
  "Hier kannst du abends etwas trinken gehen. Ob es Cocktails gibt, ist noch offen.");
 assert.equal(wohinRecommendation(card("Cocktails", ["die Grösse des Lokals"], "unknown"), context),
  "Hier gibt’s Cocktails. Schau vor dem Losgehen kurz nach, ob du zur gewünschten Zeit vorbeikannst.");
 assert.equal(wohinRecommendation(card("WLAN", ["eine ruhige Atmosphäre"])),
  "Hier gibt’s WLAN. Wie ruhig es bei deinem Besuch ist, wissen wir noch nicht.");
 assert.match(wohinRecommendation(card("die Essensmöglichkeit", ["die Grösse des Lokals"]), context), /Wie gross das Lokal ist/);
});

test("unmatched teriyaki and club request keeps nightlife first and Asian food as a separate direction", () => {
  const directions = wohinDiscoveryDirections("Teryaki essen in Basel, es muss aber ein Club in der Nacht sein");
  assert.deepEqual(directions.map(direction => direction.label), ["Clubs", "Asiatisch essen"]);
  assert.equal(directions[0].category.test("Nachtleben"), true);
  assert.equal(directions[0].category.test("Zoo"), false);
  assert.deepEqual(wohinDiscoveryDirections("Teriyaki essen, kein Club").map(direction => direction.label), ["Asiatisch essen"]);
});

test("uninterpretable wishes offer category choices and ignore directions from NukNuk's questions", () => {
  for (const placeholder of ["XYZ", " xyz?! ", "ＸＹＺ"]) assert.equal(wohinIsDiscoveryPlaceholder(placeholder), true);
  for (const search of ["XYZ Bar", "Wo ist XYZ?", "SBB", "K7", "Zoo"]) assert.equal(wohinIsDiscoveryPlaceholder(search), false);
  assert.deepEqual(wohinDiscoveryDirections("XYZ"), []);
  assert.deepEqual(wohinDiscoveryDirections("XYZ Rückfrage: Suchst du einen Club? Antwort: keine Ahnung"), []);
  assert.ok(wohinDiscoveryCategories().some(direction => direction.label === "Kultur"));
});

test("Wohin distinguishes another plan from refinements and explicit corrections", () => {
  const current = "Gemütlich was trinken heute Abend";
  assert.equal(wohinMessageKind("Aber morgen möchte ich mit meiner Tochter etwas erleben", current), "NEW_PLAN");
  assert.equal(wohinMessageKind("Lieber mit Terrasse", current), "REFINEMENT");
  assert.equal(wohinMessageKind("Doch morgen möchte ich etwas trinken", current), "REFINEMENT");
  assert.equal(wohinMessageKind("Erklär mir Quantenphysik", current), "OFF_TOPIC");
  assert.equal(wohinMessageKind("Ich suche einen Workshop über Quantenphysik"), "REFINEMENT");
});


test("short cards keep confirmed evidence while full visit notes retain uncertainty", () => {
  const candidate = {actualAvailability:"open",coreIntentCoverage:"UNKNOWN",unknownHardConstraints:["LBR:unknown"],reasons:[
    {code:"LBR:indoor",domain:"WORLD",confirmed:true,statement:"Bestätigt: ein Bereich drinnen."},
    {code:"LBR:unknown",domain:"LIMITATION",confirmed:false,statement:"Diesen Wunsch können wir noch nicht zuverlässig prüfen: dieser Teil deines Wunsches."},
  ]};
  const before = JSON.stringify(candidate);
  assert.equal(wohinRecommendation(candidate, undefined, false), "Hier könnt ihr drinnen bleiben.");
  assert.match(wohinRecommendation(candidate), /Ein Punkt ist noch offen/);
  const notes = wohinConsiderations(candidate, false);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /Welche Einzelheit offen ist/);
  assert.doesNotMatch(notes[0], /prüfen: dieser Teil/);
  assert.equal(JSON.stringify(candidate), before, "presentation must not mutate server evidence");
});

test("opening copy is explicitly about the requested visit and never invents a time", () => {
  const candidate = {actualAvailability:"open",reasons:[]};
  assert.equal(wohinAvailability(candidate), "Zur gewünschten Besuchszeit laut Angaben geöffnet");
  assert.match(wohinAvailability({...candidate,actualAvailability:"closed"}), /gewünschten Besuchszeit.*geschlossen/);
  assert.match(wohinAvailability({...candidate,actualAvailability:"unknown"}), /kennen wir noch nicht/);
  assert.match(wohinAvailability({...candidate,actualAvailability:"not_requested"}), /vor Besuch prüfen/);
  assert.equal(wohinAvailability({...candidate,reasons:[{code:"requested-day-opening-hours",statement:"Freitag 17–23 Uhr"}]}), "Freitag 17–23 Uhr");
  assert.match(wohinAvailability({...candidate,reasons:[{code:"librarian-visit-time-unconfirmed"}]}), /noch offen/);
});

test("in-app AI disclosure stays identical to the public disclosure without a network dependency", () => {
  const screen = fs.readFileSync(new URL("../app/(tabs)/wohin.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("wohin.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let paragraphs;
  const visit = node => {
    if(ts.isVariableDeclaration(node) && node.name.getText(ast) === "searchPrivacy") paragraphs = node.initializer.elements.map(item=>item.text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const publicPage = fs.readFileSync(new URL("../../web/app/legal/page.tsx", import.meta.url), "utf8").split('<section id="decision"')[1].split("</section>")[0];
  const published = [...publicPage.matchAll(/<p className="b-muted">([\s\S]*?)<\/p>/g)].map(match=>match[1].replace(/\s+/g," ").trim());
  assert.deepEqual(paragraphs, published);
});
