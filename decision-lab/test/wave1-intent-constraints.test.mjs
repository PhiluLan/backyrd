import assert from "node:assert/strict";
import test from "node:test";
import { loadCanonicalDecisionHandler } from "../src/canonical-engine.mjs";

const sourceUrl = new URL("../../supabase/functions/decision-wave1/index.ts", import.meta.url);
const env = { DECISION_LAB_SUPABASE_URL: "http://127.0.0.1:54321", DECISION_LAB_SERVICE_ROLE_KEY: "synthetic" };

let loaded;
test.before(async () => { loaded = await loadCanonicalDecisionHandler({ env, embeddingMode: "FAST_SIMULATION", sourceUrl }); });
test.after(() => loaded.restore());
const contract = () => ({ extract: loaded.exports.extractStructuredIntentV1, eligible: loaded.exports.applyUserHardConstraintEligibilityV1 });

const candidate = (spot_id, place_type, is_open_now, combined_score = 0) => ({
  spot_id, place_type, category_name: place_type, is_open_now, combined_score,
});

test("structured intent preserves hard exclusions and keeps preferences soft", () => {
  const { extract } = contract();
  const mixed = extract({ query: "keine Bar, am liebsten ein Café", preferredPlaceTypes: [], excludedPlaceTypes: [], strictCategoryIntent: false });
  assert.deepEqual(mixed.hardConstraints.excludedPlaceTypes, ["bar"]);
  assert.deepEqual(mixed.hardConstraints.requiredPlaceTypes, []);
  assert.deepEqual(mixed.softPreferences.placeTypes, ["cafe"]);

  const positive = extract({ query: "eine Bar wäre gut", preferredPlaceTypes: [], excludedPlaceTypes: [], strictCategoryIntent: false });
  assert.deepEqual(positive.hardConstraints.excludedPlaceTypes, []);
  assert.deepEqual(positive.hardConstraints.requiredPlaceTypes, []);
});

test("guided strict and explicit only language create hard category requirements", () => {
  const { extract } = contract();
  assert.deepEqual(extract({ query: "Café", preferredPlaceTypes: ["cafe"], excludedPlaceTypes: [], strictCategoryIntent: true }).hardConstraints.requiredPlaceTypes, ["cafe"]);
  assert.deepEqual(extract({ query: "nur ein Café", preferredPlaceTypes: [], excludedPlaceTypes: [], strictCategoryIntent: false }).hardConstraints.requiredPlaceTypes, ["cafe"]);
  assert.deepEqual(extract({ query: "am liebsten ein Café", preferredPlaceTypes: [], excludedPlaceTypes: [], strictCategoryIntent: false }).hardConstraints.requiredPlaceTypes, []);
});

test("hard category and exclusion remove impossible high-score candidates before ranking", () => {
  const { extract, eligible } = contract();
  const hardCafe = extract({ query: "nur ein Café", preferredPlaceTypes: [], excludedPlaceTypes: [], strictCategoryIntent: false });
  const categoryResult = eligible([candidate("cafe", "cafe", true, 0.1), candidate("bar", "bar", true, 999)], hardCafe);
  assert.deepEqual(categoryResult.eligible.map((row) => row.spot_id), ["cafe"]);
  assert.equal(categoryResult.report.exclusions[0].constraint, "HARD_CATEGORY");

  const noBar = extract({ query: "keine Bar", preferredPlaceTypes: [], excludedPlaceTypes: [], strictCategoryIntent: false });
  const exclusionResult = eligible([candidate("cafe", "cafe", true, 0), candidate("bar", "bar", true, Number.MAX_SAFE_INTEGER)], noBar);
  assert.deepEqual(exclusionResult.eligible.map((row) => row.spot_id), ["cafe"]);
  assert.equal(exclusionResult.report.exclusions[0].constraint, "CATEGORY_EXCLUSION");
});

test("open-now uses fail-closed evidence and cannot be compensated by score", () => {
  const { extract, eligible } = contract();
  const intent = extract({ query: "jetzt geöffnet", preferredPlaceTypes: [], excludedPlaceTypes: [], strictCategoryIntent: false });
  assert.equal(intent.hardConstraints.openNow, true);
  const result = eligible([
    candidate("open", "cafe", true, 0),
    candidate("closed", "cafe", false, 999),
    candidate("unknown", "cafe", null, Number.MAX_SAFE_INTEGER),
  ], intent);
  assert.deepEqual(result.eligible.map((row) => row.spot_id), ["open"]);
  assert.equal(result.report.unknownEvidenceCount, 1);
  assert.deepEqual(result.report.exclusions.map((row) => row.evidenceStatus), ["KNOWN", "UNKNOWN"]);
});

test("compound constraints exclude on any violation and admit only complete matches", () => {
  const { extract, eligible } = contract();
  const intent = extract({ query: "nur ein Café, keine Bar, jetzt offen", preferredPlaceTypes: [], excludedPlaceTypes: [], strictCategoryIntent: false });
  const result = eligible([
    candidate("valid", "cafe", true),
    candidate("wrong-category", "restaurant", true),
    candidate("excluded", "bar", true),
    candidate("closed", "cafe", false),
  ], intent);
  assert.deepEqual(result.eligible.map((row) => row.spot_id), ["valid"]);
  assert.equal(result.report.candidateCountBefore, 4);
  assert.equal(result.report.candidateCountAfter, 1);
  assert.equal(result.report.excludedCount, 3);
});
