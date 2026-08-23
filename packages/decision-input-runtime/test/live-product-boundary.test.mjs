import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveCandidateFunnel, containsInternalDecisionText, sanitizeLiveProductCandidate, sanitizeLiveProductRequestBody, selectLiveCandidateUniverse } from "../src/live-product-boundary.mjs";

const leaked = "If category or audience is clear, prefer matching categories strongly and use personal taste only softly.";

test("free-text Product request never sends internal instructions to retrieval", () => {
  const body = sanitizeLiveProductRequestBody({ rawFreeText:"Regnerischer Tag mit meiner 4 jährigen Tochter", query:`Regnerischer Tag\n${leaked}` });
  assert.equal(body.query, "Regnerischer Tag mit meiner 4 jährigen Tochter");
  assert.equal(containsInternalDecisionText(body.query), false);
});

test("Mobile candidate serialization strips internal/debug text", () => {
  const candidate = sanitizeLiveProductCandidate({ spot_id:"spot-a", matched_terms:[leaked,"Tierpark"], matched_tokens:["Familie"], technical_why_this:"debug", document_preview:"private", explanation:{ debug:true } }, "Passt zu deiner aktuellen Suche.");
  assert.deepEqual(candidate.matched_terms, ["Tierpark"]);
  assert.equal(candidate.human_reason, "Passt zu deiner aktuellen Suche.");
  assert.equal(candidate.technical_why_this, null);
  assert.equal(candidate.document_preview, null);
  assert.equal(candidate.explanation, undefined);
  assert.equal(JSON.stringify(candidate).includes("prefer matching categories"), false);
});

test("Candidate processing receives a bounded broad universe, not only three rows", () => {
  const candidates = Array.from({ length:16 }, (_, index) => ({ spot_id:`spot-${index}` }));
  candidates.splice(4, 0, { spot_id:"spot-1" });
  assert.deepEqual(selectLiveCandidateUniverse(candidates).map((row)=>row.spot_id), Array.from({ length:10 }, (_, index)=>`spot-${index}`));
});

test("the real failure shape applies hard eligibility before the bounded handoff",()=>{
  const rows=[
    ["tierpark","Tierpark Lange Erlen","outing"],["1777","1777","restaurant"],
    ["volta","Volta Bräu","bar"],["kabar","KaBar","bar"],["manabar","ManaBar","bar"],
    ["amber","Amber Bar","bar"],["max","MAX Restaurant","restaurant"],["baltazar","Baltazar","bar"],
    ["mimosa","Mimosa Restaurant & Bar","restaurant"],["concordia","Concordia","restaurant"],
    ["museum","Naturhistorisches Museum Basel","culture"],["elys","ELYS Boulderloft","activity"],
    ["zoo","Zoo Basel","outing"],["muks","MUKS","culture"],
  ].map(([spot_id,name,place_type],index)=>({spot_id,name,place_type,city:"Basel",combined_score:1-index/100,sources:["semantic_v13"]}));
  const funnel=buildLiveCandidateFunnel(rows,{city:"Basel",canonicalIntent:{hardConstraints:{excludedPlaceTypes:["bar","nightlife"]}},limit:10});
  assert.equal(funnel.sourceCount,14);
  assert.deepEqual(funnel.selected.map((row)=>row.spot_id),["tierpark","1777","max","mimosa","concordia","museum","elys","zoo","muks"]);
  assert.equal(funnel.rows.find((row)=>row.spotId==="volta").exclusionReasons[0],"EXCLUDED_PLACE_TYPE");
  assert.equal(funnel.rows.find((row)=>row.spotId==="museum").handoffStatus,"SELECTED");
});
