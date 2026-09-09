import { assertContentHash, withContentHash } from "./canonical.js";
import { brandEligibleCandidate, CONTRACT_VERSIONS, EligibilityResultSchema, type CandidatePoolSnapshot, type DecisionContextSnapshot, type EligibilityResult, type EligibleCandidate, type EvidenceItem } from "./contracts.js";
import { evidenceMap } from "./evidence.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import { candidateEvidence } from "./world-knowledge.js";

const evidenceOf = (candidate: CandidatePoolSnapshot["candidates"][number]["candidate"], kind: EvidenceItem["kind"]): EvidenceItem => {
  const item = candidateEvidence(candidate).find((entry) => entry.kind === kind);
  if (!item) throw new Error(`eligibility_evidence_missing:${kind}`);
  return item;
};

function result(candidate: CandidatePoolSnapshot["candidates"][number]["candidate"], context: DecisionContextSnapshot): EligibilityResult {
  evidenceMap(candidate);
  const distribution = evidenceOf(candidate, "distribution");
  const city = evidenceOf(candidate, "city");
  const open = evidenceOf(candidate, "open_status");
  const openNow = context.hardConstraints.some((constraint) => constraint.kind === "open_now" && constraint.value);
  const openOutcome = !openNow ? "pass" : candidate.openStatus === "open" ? "pass" : candidate.openStatus === "closed" ? "fail" : "unknown";
  const checks = [
    { ruleId: "distribution-allowed-v1" as const, rulesetVersion: PHASE1_VERSIONS.eligibility, outcome: candidate.distributionAllowed ? "pass" as const : "fail" as const, evidenceIds: [distribution.evidenceId], unknownPolicy: "fail" as const },
    { ruleId: "explicit-city-match-v1" as const, rulesetVersion: PHASE1_VERSIONS.eligibility, outcome: candidate.city === context.location.city ? "pass" as const : "fail" as const, evidenceIds: [city.evidenceId], unknownPolicy: "fail" as const },
    { ruleId: "explicit-open-now-v1" as const, rulesetVersion: PHASE1_VERSIONS.eligibility, outcome: openOutcome, evidenceIds: [open.evidenceId], unknownPolicy: openNow ? "fail" as const : "not-applicable" as const },
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
