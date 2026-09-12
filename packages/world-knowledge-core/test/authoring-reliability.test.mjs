import assert from "node:assert/strict";
import test from "node:test";
import { AUTHORING_FIELDS, validateAuthoringSubmission } from "../dist/index.js";

const samples = {
  TEXT: "Volta Bräu",
  EMAIL: "kontakt@volta.example",
  URL: "https://volta.example",
  PHONE: "+41781234567",
  COUNTRY_CODE: "CH",
  IANA_TIMEZONE: "Europe/Zurich",
  DECIMAL: 7.588,
  INTEGER: 40,
  BOOLEAN: true,
  ENUM: null,
  ENUM_SET: null,
  INTEGER_RANGE: { min: 1, max: 12 },
  WEEKLY_SCHEDULE: [{ day: "TUESDAY", intervals: [{ start: "17:00", end: "23:00" }, { start: "23:30", end: "02:00" }] }],
  SPECIAL_HOURS: [{ date: "2026-12-24", status: "OPEN", intervals: [{ start: "11:00", end: "15:00" }] }, { date: "2026-12-25", status: "CLOSED", intervals: [] }],
  RESERVATION_RULE: { mode: "CONDITIONAL", minimumPartySize: 6, days: ["FRIDAY", "SATURDAY"], fromTime: "18:00", toTime: "22:00" },
  CONSUMPTION_RULE: { policy: "CONDITIONAL", exceptions: ["Babynahrung"] },
  PET_ACCESS_RULE: { indoor: "NOT_ALLOWED", outdoor: "ALLOWED", assistanceAnimals: "ALLOWED", notes: null },
  AGE_ACCESS_RULE: { policy: "MINIMUM_AGE", minimumAge: 18, appliesFromTime: "22:00" },
  AGE_ACCESS_RULE_V2: { rules: [{ mode: "UNACCOMPANIED_MINIMUM", minimumAge: 12, accompaniment: "ADULT", appliesFromTime: null, days: [], area: null, event: null }, { mode: "GENERAL_MINIMUM", minimumAge: 18, accompaniment: "NONE", appliesFromTime: "22:00", days: [], area: null, event: null }] },
  CURRENT_STATE: { kind: "AREA_CLOSED", scope: "TERRACE" },
};

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
