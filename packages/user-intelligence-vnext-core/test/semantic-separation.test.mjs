import assert from "node:assert/strict";
import test from "node:test";
import { CONTRADICTORY_EVIDENCE_CHAIN, DirectSpotAffinitySchema, PracticalPreferenceSchema, SYNTHETIC_EVENTS, TasteNodeSchema } from "../dist/index.js";

test("visit and both review entry points prove experience but not satisfaction or taste", () => {
  for (const event of [SYNTHETIC_EVENTS.visit, SYNTHETIC_EVENTS.standardReview, SYNTHETIC_EVENTS.smartReview]) {
    assert.equal(event.eventClass, "EXPERIENCE");
    assert.equal(event.payload.satisfaction, "UNKNOWN");
    assert.equal("direction" in event.payload, false);
  }
  const standard = { ...SYNTHETIC_EVENTS.standardReview.payload, reviewOrigin: undefined };
  const smart = { ...SYNTHETIC_EVENTS.smartReview.payload, reviewOrigin: undefined };
  assert.deepEqual(standard, smart);
});

test("exposure, removal and navigation retain neutral or intent semantics", () => {
  assert.equal(SYNTHETIC_EVENTS.exposure.eventClass, "EXPOSURE");
  assert.deepEqual(SYNTHETIC_EVENTS.remove.payload, { kind: "INTENT", action: "SAVE_REMOVED" });
  assert.deepEqual(SYNTHETIC_EVENTS.navigation.payload, { kind: "INTENT", action: "NAVIGATION" });
  assert.equal("satisfaction" in SYNTHETIC_EVENTS.navigation.payload, false);
});

test("a contradictory journey preserves experience, positive, negative and conflict evidence", () => {
  const chain = CONTRADICTORY_EVIDENCE_CHAIN;
  assert.equal(chain.segments.experience.references.length, 1);
  assert.equal(chain.segments.satisfaction.references.length, 2);
  assert.deepEqual(chain.segments.tasteAttribution.map((row) => row.direction), ["POSITIVE", "NEGATIVE", "POSITIVE"]);
  assert.equal(chain.conflicts.some((row) => row.kind === "POSITIVE_AND_NEGATIVE"), true);
  assert.equal(chain.independence.journeyUnits, 1);
  assert.equal(chain.independence.independentExperiences, 1);
  assert.equal(chain.independence.repeatedSameSpotInteractions, 5);
  assert.equal(chain.independence.multiConceptSingleExperience, true);
  assert.equal(chain.segments.explicitCorrection.references.length, 1);
  assert.equal(SYNTHETIC_EVENTS.correction.supersedesEventId, "event-positive");
  assert.equal(chain.segments.tasteAttribution.some((row) => row.evidence.some((evidence) => evidence.eventId === SYNTHETIC_EVENTS.currentIntent.eventId)), false);
});

test("taste, practical behavior and direct spot relationships are structurally separate", () => {
  const practical = { contractVersion: "backyrd.user-intelligence.practical-preference@1.0", preferenceId: "practical-1", dimension: "DISTANCE_BEHAVIOR", observedBehavior: "selected shorter trips when comparable choices were visible", knowledgeState: "HYPOTHESIS", confidence: 0.2, opportunityControl: "PARTIAL", evidence: { count: 2, independentJourneys: 1, references: [] }, causalPreferenceClaimed: false, policyRef: "synthetic-tbd" };
  const direct = { contractVersion: "backyrd.user-intelligence.direct-spot-affinity@1.0", relationshipId: "direct-1", spotId: "spot-1", state: "VISITED", observations: { viewed: 2, saved: 1, selected: 1, visited: 1, excluded: 0, corrected: 0 }, experienceEvidence: { count: 1, independentJourneys: 1, references: [] }, satisfactionEvidence: { count: 0, independentJourneys: 0, references: [] }, confidence: 0.3, propagatesToConceptTaste: false, policyRef: "synthetic-tbd" };
  assert.equal(PracticalPreferenceSchema.parse(practical).causalPreferenceClaimed, false);
  assert.equal(DirectSpotAffinitySchema.parse(direct).propagatesToConceptTaste, false);
  assert.throws(() => PracticalPreferenceSchema.parse({ ...practical, conceptAffinity: 0.8 }), /unknown field/);
  assert.throws(() => DirectSpotAffinitySchema.parse({ ...direct, concept: "vibe.quiet" }), /unknown field/);
  assert.throws(() => TasteNodeSchema.parse({ ...practical, ownerTier: "premium" }), /unknown field/);
});
