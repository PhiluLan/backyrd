import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
const source = readFileSync(new URL("../../packages/shared/src/presentation/mood.ts", import.meta.url), "utf8");
const contract = ts.transpileModule(readFileSync(new URL("../../packages/shared/src/contracts/mood.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const contractUrl = `data:text/javascript;base64,${Buffer.from(contract).toString("base64")}`;
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replace("../contracts/mood", contractUrl);
const { toggleMoodExpression, parseMoodOptions, moodEvidenceCopy, loadBrowseMoods, rankMoodSupport, publicMoodCount, moodCountCopy, loadMoodCounts } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

test("a third impression never silently replaces the visitor's two choices", () => {
  assert.deepEqual(toggleMoodExpression(["Gemütlich", "Laut"], "Urban"), { values: ["Gemütlich", "Laut"], full: true });
  assert.deepEqual(toggleMoodExpression(["Gemütlich", "Laut"], " GEMÜTLICH "), { values: ["Laut"], full: false });
  assert.deepEqual(toggleMoodExpression([""], " Mein Eindruck "), { values: ["Mein Eindruck"], full: false });
});
test("server aliases stay a single concept and invalid suggestions cannot become chips", () => {
  assert.deepEqual(parseMoodOptions([null, { concept_key: "mood.cozy", label: "Gemütlich", matched_expression: "cozy" }, { concept_key: "mood.cozy", label: "Gemütlich", matched_expression: "heimelig" }, { concept_key: "broken" }]).map(v => v.concept_key), ["mood.cozy"]);
});
test("early and singleton impressions never claim broad community agreement", () => {
  const early = { evidence_state: "EARLY", concept_contributors: 2, rank: 1 };
  assert.match(moodEvidenceCopy(early), /erster Eindruck/);
  assert.doesNotMatch(moodEvidenceCopy(early), /2/);
  const singleton = { evidence_state: "ESTABLISHED", concept_contributors: 1, rank: 1 };
  assert.match(moodEvidenceCopy(singleton), /Eine Person/);
});
test("browse profiles remain complete beyond the Data API page cap and fail honestly", async () => {
  let calls = 0;
  const row = { spot_id: "spot", concept_key: "mood.cozy", label: "Gemütlich", rank: 1 };
  const result = await loadBrowseMoods(["spot"], async (_ids, from) => { calls++; return from === 0 ? Array.from({ length: 1000 }, () => row) : [{ ...row, concept_key: "mood.quiet", label: "Ruhig", rank: 1001 }]; });
  assert.equal(calls, 2); assert.equal(result.length, 1001); assert.equal(result.at(-1).label, "Ruhig");
  await assert.rejects(loadBrowseMoods(["spot"], async () => null), /invalid/);
  await assert.rejects(loadBrowseMoods(["spot"], async () => [{ ...row, spot_id: "outside" }]), /invalid/);
  assert.deepEqual(await loadBrowseMoods([], async () => { throw Error("must not read globally"); }), []);
});


test("signature ranks distinct people rather than visits or weighted score and never mutates input", () => {
  const rows = [
    {concept_key:"quiet",label:"Ruhig",rank:1,evidence_state:"ESTABLISHED",concept_contributors:4,eligible_contributors:12,percentage:75},
    {concept_key:"urban",label:"Urban",rank:2,evidence_state:"ESTABLISHED",concept_contributors:9,eligible_contributors:12,percentage:25},
    {concept_key:"early",label:"Warm",rank:3,evidence_state:"EARLY",concept_contributors:99,eligible_contributors:99},
  ];
  assert.deepEqual(rankMoodSupport(rows).map(row=>row.concept_key), ["urban","quiet","early"]);
  assert.equal(rows[0].concept_key,"quiet");
  assert.equal(publicMoodCount(rows[2]),null);
  assert.equal(publicMoodCount({...rows[0],concept_contributors:-1}),null);
});
test("published Mood totals remain distinct from contributor counts; missing totals do not mean zero", async () => {
  assert.equal(moodCountCopy(1),"1 Mood");
  assert.equal(moodCountCopy(0),"0 Moods");
  assert.equal(moodCountCopy(42),"42 Moods");
  for (const value of [null,undefined,-1,NaN,1.5]) assert.equal(moodCountCopy(value),null);
  const ids=Array.from({length:201},(_,i)=>`spot-${i}`), batches=[];
  const counts=await loadMoodCounts(ids,async batch=>{batches.push(batch.length);return batch.map(spot_id=>({spot_id,mood_count:spot_id==="spot-0"?0:12}));});
  assert.deepEqual(batches,[200,1]);assert.equal(counts["spot-0"],0);assert.equal(counts["spot-200"],12);
  assert.deepEqual(await loadMoodCounts(["missing"],async()=>[]),{});
  await assert.rejects(loadMoodCounts(["spot"],async()=>null),/invalid/);
  await assert.rejects(loadMoodCounts(["spot"],async()=>[{spot_id:"other",mood_count:1}]),/invalid/);
  await assert.rejects(loadMoodCounts(["spot"],async()=>[{spot_id:"spot",mood_count:-1}]),/invalid/);
  await assert.rejects(loadMoodCounts(["spot"],async()=>{throw Error("offline");}),/offline/);
});
test("catalog signatures use the same contributor ranking as detail profiles",async()=>{
  const rows=[{spot_id:"s",concept_key:"quiet",label:"Ruhig",rank:1,concept_contributors:2,evidence_state:"ESTABLISHED"},{spot_id:"s",concept_key:"urban",label:"Urban",rank:2,concept_contributors:8,evidence_state:"ESTABLISHED"}];
  assert.deepEqual((await loadBrowseMoods(["s"],async()=>rows)).map(row=>row.label),["Urban","Ruhig"]);
});
