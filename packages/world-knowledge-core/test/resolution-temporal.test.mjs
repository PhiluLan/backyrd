import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFLICTING_SPOT_CLAIMS, EXPIRED_STATE_CLAIMS, INCONSISTENT_CAPACITY_CLAIMS, SPECIAL_HOURS_CLAIMS, VENUE_KITCHEN_HOURS_CLAIMS,
  createClaim, effectiveVenueHours, resolveWorldKnowledge, resolutionRequest,
} from "../dist/index.js";

const base = (overrides) => createClaim({ claimId: "claim:base", attributeKey: "operation.takeaway", scope: { spotId: "spot", area: "SPOT" }, knowledgeState: "KNOWN_TRUE", value: true, actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION", sourceReferenceId: null, provenanceSessionId: "session:test", verificationState: "UNVERIFIED", observedAt: "2026-01-10T12:00:00.000Z", validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null, ...overrides });

test("missing, explicit unknown and false remain distinct", () => {
  const falseClaim = base({ claimId: "claim:false", value: false, knowledgeState: "KNOWN_FALSE" }); const unknownClaim = base({ claimId: "claim:unknown", attributeKey: "accessibility.step_free_entrance", value: null, knowledgeState: "UNKNOWN" });
  const resolution = resolveWorldKnowledge(resolutionRequest([falseClaim, unknownClaim]));
  assert.equal(resolution.resolved.find((item) => item.attributeKey === "operation.takeaway").resolution, "KNOWN_FALSE"); assert.equal(resolution.resolved.find((item) => item.attributeKey === "accessibility.step_free_entrance").resolution, "UNKNOWN"); assert.equal(resolution.resolved.some((item) => item.attributeKey === "operation.price_range"), false);
});

test("overlapping competing values dispute without deleting history", () => {
  const resolution = resolveWorldKnowledge(resolutionRequest(CONFLICTING_SPOT_CLAIMS)); const category = resolution.resolved.find((item) => item.attributeKey === "classification.primary_category");
  assert.equal(category.resolution, "DISPUTED"); assert.equal(category.trust, "CONFLICTING"); assert.equal(resolution.history.length, CONFLICTING_SPOT_CLAIMS.length); assert.ok(resolution.conflicts.some((item) => item.code === "TAKEAWAY_EXCLUDED_BUT_OFFERED"));
});

test("ordinary ended validity becomes stale while current state expires", () => {
  const stale = base({ validUntil: "2026-01-12T00:00:00.000Z" }); const staleResolution = resolveWorldKnowledge(resolutionRequest([stale])); assert.equal(staleResolution.resolved[0].freshness, "STALE");
  const expired = resolveWorldKnowledge(resolutionRequest(EXPIRED_STATE_CLAIMS)); assert.equal(expired.resolved[0].freshness, "EXPIRED");
});

test("special hours override regular hours only for their date", () => {
  const resolution = resolveWorldKnowledge(resolutionRequest(SPECIAL_HOURS_CLAIMS)); const regular = resolution.resolved.find((item) => item.attributeKey === "hours.regular").value; const special = resolution.resolved.find((item) => item.attributeKey === "hours.special").value;
  assert.deepEqual(effectiveVenueHours("2026-01-15", regular, special), { date: "2026-01-15", source: "SPECIAL", status: "CLOSED", intervals: [] });
  assert.equal(effectiveVenueHours("2026-01-22", regular, special).source, "REGULAR");
});

test("venue and kitchen hours remain separate and capacity inconsistencies are explained", () => {
  const hours = resolveWorldKnowledge(resolutionRequest(VENUE_KITCHEN_HOURS_CLAIMS)); assert.ok(hours.resolved.some((item) => item.attributeKey === "hours.regular")); assert.ok(hours.resolved.some((item) => item.attributeKey === "hours.kitchen")); assert.equal(hours.conflicts.length, 0);
  const capacity = resolveWorldKnowledge(resolutionRequest(INCONSISTENT_CAPACITY_CLAIMS)); assert.ok(capacity.conflicts.some((item) => item.code === "CAPACITY_COMPONENTS_EXCEED_TOTAL")); assert.ok(capacity.conflicts.some((item) => item.code === "GROUP_RANGE_EXCEEDS_TOTAL_CAPACITY")); assert.ok(capacity.conflicts.some((item) => item.code === "RESERVATION_THRESHOLD_OUTSIDE_SUPPORTED_GROUP_RANGE"));
});
