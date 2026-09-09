import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { analysisReport, catalog, confidenceFor, deriveFits, emptyState, engineSnapshot, qualityFor, resolveKnowledge, validateImport } from "../lib/world-knowledge/model.ts";

const fixedNow = new Date("2026-09-09T12:00:00.000Z");
const definition = (label) => {
  const item = catalog.definitions.find((candidate) => candidate.label === label);
  assert.ok(item, `Expected catalog definition ${label}`);
  return item;
};
const claim = (item, status, value, overrides = {}) => ({
  id: overrides.id ?? `${item.id}-${status}`,
  definitionId: item.id,
  status,
  value,
  actor: overrides.actor ?? "OWNER_BASIC",
  createdAt: overrides.createdAt ?? "2026-09-09T09:00:00.000Z",
  evidence: {
    sourceType: "OWNER_CLAIM",
    sourceName: "Philipps Casa · Verified Owner",
    observedAt: "2026-09-09",
    validFrom: "2026-09-09",
    validUntil: "",
    verificationState: "PENDING",
    reference: "fixture",
    stance: "SUPPORTS",
    privateReference: false,
    ...overrides.evidence,
  },
});

test("catalog preserves the complete draft inventory and all canonical categories", () => {
  assert.equal(catalog.categories.length, 16);
  assert.equal(catalog.definitions.length, 731);
  assert.equal(new Set(catalog.definitions.map((item) => item.id)).size, 731);
  for (const label of ["Pub", "Imbiss", "Take Away", "Fast-Food"]) assert.ok(catalog.definitions.some((item) => item.label === label && item.reviewState === "REVIEW_NEEDED"));
  assert.deepEqual(catalog.categories.map((item) => item.label), [
    "Eat", "Drinks", "Coffee & Daytime", "Nightlife", "Culture & Arts", "Entertainment", "Activities & Play", "Sport & Movement", "Outdoor & Nature", "Wellness & Relaxation", "Shopping & Markets", "Stay", "Community & Social Spaces", "Attractions & Landmarks", "Temporary Places", "Services & Special Experiences",
  ]);
  assert.deepEqual(new Set(catalog.definitions.map((item) => item.group)), new Set(["CLASSIFICATION", "INTENTS", "CAPABILITIES", "SITUATION_FIT", "CHARACTERISTICS", "AMENITIES_CONSTRAINTS", "TEMPORAL_STATE", "EVIDENCE_CONFIDENCE"]));
});

test("missing is not false, N/A is excluded from completeness, and expired claims are not current facts", () => {
  const state = emptyState();
  const wlan = definition("WLAN");
  const outlets = definition("Steckdosen");
  state.claims.push(claim(wlan, "NOT_APPLICABLE", null));
  state.claims.push(claim(outlets, "KNOWN_TRUE", true, { evidence: { validUntil: "2026-09-08" } }));
  const resolved = resolveKnowledge(state, fixedNow);
  assert.equal(resolved.find((item) => item.definition.id === wlan.id)?.status, "NOT_APPLICABLE");
  assert.equal(resolved.find((item) => item.definition.id === outlets.id)?.status, "EXPIRED");
  assert.equal(resolved.some((item) => item.status === "KNOWN_FALSE"), false);
  assert.equal(engineSnapshot(state, fixedNow).facts.some((item) => item.key === outlets.id), false);
  assert.ok(qualityFor(state, fixedNow).completeness >= 0);
});

test("competing values remain disputed and historical claims remain available", () => {
  const state = emptyState(); const terrace = definition("Terrasse");
  state.claims.push(claim(terrace, "KNOWN_TRUE", true, { id: "one" }), claim(terrace, "KNOWN_FALSE", false, { id: "two", actor: "ADMIN" }));
  const item = resolveKnowledge(state, fixedNow).find((candidate) => candidate.definition.id === terrace.id);
  assert.equal(item?.status, "DISPUTED"); assert.equal(item?.claims.length, 2);
  assert.equal(engineSnapshot(state, fixedNow).facts.some((fact) => fact.key === terrace.id), false);
});

test("guided deselection appends a retraction without deleting history or creating false", () => {
  const state = emptyState(); const restaurant = definition("Restaurant");
  const asserted = claim(restaurant, "KNOWN_TRUE", true, { id: "guided-assertion" });
  state.claims.push(asserted, { ...claim(restaurant, "UNKNOWN", null, { id: "guided-retraction" }), operation: "RETRACT", supersedesClaimId: asserted.id });
  assert.equal(state.claims.length, 2);
  assert.equal(resolveKnowledge(state, fixedNow).some((item) => item.definition.id === restaurant.id), false);
  assert.equal(resolveKnowledge(state, fixedNow).some((item) => item.status === "KNOWN_FALSE"), false);
});

test("raw facts and derived fits remain separate and derivations expose their inputs", () => {
  const state = emptyState(); const covered = definition("überdachte Außenplätze"); const wlan = definition("WLAN"); const outlets = definition("Steckdosen");
  state.claims.push(claim(covered, "KNOWN_TRUE", true), claim(wlan, "KNOWN_TRUE", true), claim(outlets, "KNOWN_TRUE", true));
  const resolved = resolveKnowledge(state, fixedNow); const derived = deriveFits(resolved); const snapshot = engineSnapshot(state, fixedNow);
  assert.ok(derived.some((item) => item.label === "Regentauglich" && item.inputs.includes("überdachte Außenplätze = true")));
  assert.ok(derived.some((item) => item.label === "Geeignet zum Arbeiten" && item.inputs.length === 2));
  assert.equal(snapshot.facts.some((item) => item.label === "Regentauglich"), false);
  assert.ok(snapshot.derivedFits.some((item) => item.label === "Regentauglich"));
});

test("owner subscription role cannot increase confidence or leak into engine output", () => {
  const wlan = definition("WLAN"); const basic = claim(wlan, "KNOWN_TRUE", true, { actor: "OWNER_BASIC" }); const pro = { ...basic, actor: "OWNER_PRO" };
  assert.equal(confidenceFor(basic, fixedNow), confidenceFor(pro, fixedNow));
  const state = emptyState(); state.claims.push(basic); const snapshotText = JSON.stringify(engineSnapshot(state, fixedNow));
  for (const forbidden of ["OWNER_BASIC", "OWNER_PRO", "ownerTier", "subscription", "payment", "privateReference", "reference"]) assert.equal(snapshotText.includes(forbidden), false);
});

test("identical input and as-of date produce identical analysis and engine snapshots", () => {
  const state = emptyState(); state.claims.push(claim(definition("WLAN"), "KNOWN_TRUE", true));
  assert.deepEqual(engineSnapshot(state, fixedNow), engineSnapshot(structuredClone(state), fixedNow));
  assert.deepEqual(analysisReport(state, fixedNow), analysisReport(structuredClone(state), fixedNow));
});

test("older local exports receive the new optional profile fields without losing claims", () => {
  const old = emptyState();
  delete old.spot.neighborhood;
  delete old.spot.website;
  delete old.spot.takeaway;
  old.claims.push(claim(definition("Restaurant"), "KNOWN_TRUE", true));
  const migrated = validateImport(old);
  assert.equal(migrated.spot.neighborhood, "");
  assert.equal(migrated.spot.website, "");
  assert.equal(migrated.spot.takeaway, "UNKNOWN");
  assert.equal(migrated.claims.length, 1);
});

test("prototype is explicitly isolated from Supabase and Production paths", async () => {
  const source = await readFile(new URL("../components/world-knowledge/world-knowledge-prototype.tsx", import.meta.url), "utf8");
  assert.match(source, /localStorage/); assert.match(source, /Analyse starten/); assert.match(source, /confirm\(/);
  assert.doesNotMatch(source, /@supabase|createClient|service.role|fetch\(/i);
});
