import { assertContentHash, withContentHash } from "./canonical.js";
import { brandEligibleCandidate, CONTRACT_VERSIONS, EligibilityResultSchema, type CandidatePoolSnapshot, type DecisionContextSnapshot, type EligibilityResult, type EligibleCandidate, type EvidenceItem } from "./contracts.js";
import { evidenceMap } from "./evidence.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import { candidateEvidence } from "./evidence.js";

const evidenceOf = (candidate: CandidatePoolSnapshot["candidates"][number]["candidate"], signal: string): EvidenceItem => {
  const item = candidateEvidence(candidate).find((entry) => entry.signal === signal);
  if (!item) throw new Error(`eligibility_evidence_missing:${signal}`);
  return item;
};

function result(candidate: CandidatePoolSnapshot["candidates"][number]["candidate"], context: DecisionContextSnapshot): EligibilityResult {
  evidenceMap(candidate);
  const distribution = evidenceOf(candidate, "distribution.allowed");
  const city = evidenceOf(candidate, "location.city");
  const open = evidenceOf(candidate, "temporal.open_status");
  const openNow = context.explicit.hardConstraints.some((constraint) => constraint.kind === "open_now" && constraint.value);
  const openOutcome = !openNow ? "pass" : candidate.openStatus === "open" ? "pass" : candidate.openStatus === "closed" ? "fail" : "unknown";
  const proof = <T extends Record<string, unknown>>(check: T) => withContentHash(check, "proofHash");
  const checks = [
    proof({ ruleId: "distribution-allowed-v1" as const, rulesetVersion: PHASE1_VERSIONS.eligibility, outcome: candidate.distributionAllowed ? "pass" as const : "fail" as const, evidenceIds: [distribution.evidenceId], unknownPolicy: "fail" as const, reasonCodes: [candidate.distributionAllowed ? "distribution-allowed" : "distribution-blocked"] }),
    proof({ ruleId: "explicit-city-match-v1" as const, rulesetVersion: PHASE1_VERSIONS.eligibility, outcome: candidate.city === context.explicit.location.city ? "pass" as const : "fail" as const, evidenceIds: [city.evidenceId], unknownPolicy: "fail" as const, reasonCodes: [candidate.city === context.explicit.location.city ? "city-match" : "city-mismatch"] }),
    proof({ ruleId: "explicit-open-now-v1" as const, rulesetVersion: PHASE1_VERSIONS.eligibility, outcome: openOutcome, evidenceIds: [open.evidenceId], unknownPolicy: openNow ? "fail" as const : "not-applicable" as const, reasonCodes: [!openNow ? "open-now-not-requested" : `open-status-${candidate.openStatus}`] }),
  ];
  return EligibilityResultSchema.parse(withContentHash({
    contractVersion: CONTRACT_VERSIONS.eligibility,
    spotId: candidate.spotId,
    eligible: checks.every((check) => check.outcome === "pass"),
    checks,
  }, "resultHash"));
}

export function applyPhase1Eligibility(pool: CandidatePoolSnapshot, context: DecisionContextSnapshot): {
  readonly eligible: readonly EligibleCandidate[];
  readonly rejected: readonly EligibilityResult[];
} {
  const eligible: EligibleCandidate[] = [];
  const rejected: EligibilityResult[] = [];
  for (const entry of pool.candidates) {
    const eligibility = result(entry.candidate, context);
    assertContentHash(eligibility as unknown as Record<string, unknown>, "resultHash");
    if (!eligibility.eligible) { rejected.push(eligibility); continue; }
    eligible.push(brandEligibleCandidate({ ...entry, eligibility: eligibility as EligibilityResult & { readonly eligible: true } }));
  }
  return Object.freeze({ eligible: Object.freeze(eligible), rejected: Object.freeze(rejected) });
}
