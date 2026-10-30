import assert from "node:assert/strict";
import test from "node:test";
import { AUTHORING_FIELDS, evaluateAuthoringReadiness, validateAuthoringSubmission } from "../dist/index.js";

import {AUTHORING_VALUE_SAMPLES as samples} from './authoring-value-fixtures.mjs';

test("every exposed authoring field produces a registry-valid canonical value", () => {
  for (const field of AUTHORING_FIELDS) {
    const value = field.valueType === "ENUM" ? field.allowedValues[0].value : field.valueType === "ENUM_SET" ? [field.allowedValues[0].value] : samples[field.valueType];
    const result = validateAuthoringSubmission(field.attributeKey, field.valueType === "BOOLEAN" ? "KNOWN_TRUE" : "KNOWN_VALUE", value);
    assert.equal(result.ok, true, `${field.attributeKey}: ${result.ok ? "" : result.message}`);
  }
});

test("weekly and special hours accept multiple and overnight intervals", () => {
  assert.equal(validateAuthoringSubmission("hours.regular", "KNOWN_VALUE", samples.WEEKLY_SCHEDULE).ok, true);
  assert.equal(validateAuthoringSubmission("hours.kitchen", "KNOWN_VALUE", [{ day: "SATURDAY", intervals: [{ start: "22:00", end: "02:00" }] }]).ok, true);
  assert.equal(validateAuthoringSubmission("hours.special", "KNOWN_VALUE", samples.SPECIAL_HOURS).ok, true);
  assert.equal(validateAuthoringSubmission("hours.kitchen_special", "KNOWN_VALUE", samples.SPECIAL_HOURS).ok, true);
});

test("legacy UI shapes and unregistered rule values fail closed", () => {
  assert.equal(validateAuthoringSubmission("hours.regular", "KNOWN_VALUE", [{ day: "TUE", intervals: [{ from: "17:00", to: "23:00" }] }]).ok, false);
  assert.equal(validateAuthoringSubmission("rule.external_drink", "KNOWN_VALUE", { policy: "BYO_FEE", exceptions: [] }).ok, false);
  assert.equal(validateAuthoringSubmission("rule.pet_access", "KNOWN_VALUE", { indoor: "CONDITIONAL", outdoor: "ALLOWED", assistanceAnimals: "ALLOWED", notes: null }).ok, false);
  assert.equal(validateAuthoringSubmission("state.current", "KNOWN_VALUE", { kind: "OPEN", scope: "" }).ok, false);
});

test("unknown, false, empty and not-applicable remain distinct", () => {
  assert.deepEqual(validateAuthoringSubmission("operation.takeaway", "UNKNOWN", null), { ok: true, value: null });
  assert.deepEqual(validateAuthoringSubmission("operation.takeaway", "KNOWN_FALSE", false), { ok: true, value: false });
  assert.equal(validateAuthoringSubmission("operation.takeaway", "UNKNOWN", false).ok, false);
  assert.equal(validateAuthoringSubmission("identity.name", "KNOWN_VALUE", "").ok, false);
  assert.equal(validateAuthoringSubmission("operation.takeaway", "NOT_APPLICABLE", null).ok, false);
});

test("country, timezone, contact and numeric values are typed before RPC", () => {
  assert.equal(validateAuthoringSubmission("location.country_code", "KNOWN_VALUE", "Schweiz").ok, false);
  assert.equal(validateAuthoringSubmission("location.timezone", "KNOWN_VALUE", "Zurich").ok, false);
  assert.equal(validateAuthoringSubmission("contact.phone", "KNOWN_VALUE", "+41 78 123 45 67").ok, false);
  assert.equal(validateAuthoringSubmission("contact.website", "KNOWN_VALUE", "volta.example").ok, false);
  assert.equal(validateAuthoringSubmission("location.latitude", "KNOWN_VALUE", "47.5").ok, false);
});

test("review readiness counts each actionable problem once and never accepts unknown identity", () => {
  const answers = {
    "identity.name": { knowledgeState: "UNKNOWN", value: null },
    "classification.primary_category": { knowledgeState: "KNOWN_VALUE", value: "DRINKS" },
    "classification.place_types": { knowledgeState: "KNOWN_VALUE", value: ["RESTAURANT", "UNREGISTERED_PLACE"] },
  };
  const report = evaluateAuthoringReadiness({ answers, reviewedSteps: ["basics", "classification", "offering"] });
  assert.equal(report.readiness, "NOT_READY");
  assert.equal(report.blocking.filter((issue) => issue.attributeKey === "identity.name").length, 1);
  assert.equal(report.blocking.filter((issue) => issue.attributeKey === "classification.place_types").length, 1);
  assert.ok(report.gaps.some((issue) => issue.attributeKey === "offering.cuisines"));
  assert.equal(report.sectionStates.basics, "ERRORS");
  assert.equal(report.sectionStates.classification, "ERRORS");
  assert.equal(report.sectionStates.offering, "INTENTIONALLY_INCOMPLETE");
  assert.deepEqual(report.blocking.map((issue) => issue.id), [...new Set(report.blocking.map((issue) => issue.id))]);
});

 test('age rule write normalisation preserves read compatibility and supplies explicit nullable notes',()=>{
  const input=samples.AGE_ACCESS_RULE_V2;
  const checked=validateAuthoringSubmission('rule.age_access_conditions','KNOWN_VALUE',input);
  assert.equal(checked.ok,true);assert.deepEqual(checked.value,{...input,notes:null});assert.equal('notes' in input,false);
  assert.equal(validateAuthoringSubmission('rule.age_access_conditions','KNOWN_VALUE',{...input,notes:'Abends ab 18'}).value.notes,'Abends ab 18');
 });
