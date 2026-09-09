import { rankBaselineA, type EligibilityResult, type WorldCandidate } from "../src/index.js";

declare const candidate: WorldCandidate;
declare const rejected: EligibilityResult & { readonly eligible: false };

// The brand can only be produced by the central eligibility stage.
// @ts-expect-error An ineligible plain object is not an EligibleCandidate.
rankBaselineA([{ candidate, eligibility: rejected, retrievalSource: { kind: "synthetic_fixture", sourceId: "synthetic-neutral-rule-v1", personalized: false }, retrievalPosition: 1 }]);
