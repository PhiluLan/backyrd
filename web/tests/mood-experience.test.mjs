import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
const source = readFileSync(new URL("../../packages/shared/src/presentation/mood.ts", import.meta.url), "utf8");
const contract = ts.transpileModule(readFileSync(new URL("../../packages/shared/src/contracts/mood.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const contractUrl = `data:text/javascript;base64,${Buffer.from(contract).toString("base64")}`;
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replace("../contracts/mood", contractUrl);
const { toggleMoodExpression, parseMoodOptions, moodEvidenceCopy, moodIsProminent, loadBrowseMoods } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

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
  assert.equal(moodIsProminent(early), false);
  const singleton = { evidence_state: "ESTABLISHED", concept_contributors: 1, rank: 1 };
  assert.match(moodEvidenceCopy(singleton), /Eine Person/);
  assert.equal(moodIsProminent(singleton), false);
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
