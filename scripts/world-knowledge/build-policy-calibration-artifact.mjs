import {
  POLICY_CALIBRATION_CONTRACT_VERSION, createClaim, createDraftCalibrationPolicy,
  hashBody, simulateDraftPolicy,
} from "../../packages/world-knowledge-core/dist/index.js";
import { writeFileSync } from "node:fs";

const observedAt = "2026-09-10T15:00:00.000Z";
const asOf = "2026-09-10T16:00:00.000Z";
const makeClaim = (claimId, attributeKey, value, overrides = {}) => createClaim({
  claimId, attributeKey, scope: { spotId: "synthetic:slice-3a", area: "SPOT" },
  knowledgeState: value === true ? "KNOWN_TRUE" : value === false ? "KNOWN_FALSE" : value === null ? "UNKNOWN" : "KNOWN_VALUE",
  value, actorType: "ADMIN", sourceType: "ADMIN_OBSERVATION", sourceReferenceId: null,
  provenanceSessionId: "session:slice-3a-calibration", verificationState: "UNVERIFIED",
  observedAt, validFrom: null, validUntil: null, stance: "SUPPORTS", visibility: "INTERNAL", supersedesClaimId: null,
  ...overrides,
});

const scenarios = [
  {
    id: "owner-asserted-hours",
    claims: [makeClaim("claim:s3a:owner-hours", "hours.regular", [{ day: "MONDAY", intervals: [{ start: "09:00", end: "18:00" }] }], { actorType: "VERIFIED_OWNER", sourceType: "OWNER_ASSERTION" })],
  },
  {
    id: "official-referenced-hours",
    claims: [makeClaim("claim:s3a:official-hours", "hours.regular", [{ day: "MONDAY", intervals: [{ start: "09:00", end: "18:00" }] }], { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:synthetic:official-hours" })],
  },
  {
    id: "current-state-without-expiry",
    claims: [makeClaim("claim:s3a:current-state", "state.current", { kind: "CLOSED", scope: "SPOT" })],
  },
  {
    id: "conflicting-official-takeaway",
    claims: [
      makeClaim("claim:s3a:takeaway-yes", "operation.takeaway", true, { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:synthetic:official-a" }),
      makeClaim("claim:s3a:takeaway-no", "operation.takeaway", false, { sourceType: "OFFICIAL_SOURCE", sourceReferenceId: "source:synthetic:official-b" }),
    ],
  },
];

const results = [];
for (const strategy of ["BALANCED_REFERENCE", "CONSERVATIVE_VERIFICATION"]) {
  const policy = createDraftCalibrationPolicy(strategy);
  for (const scenario of scenarios) {
    const result = simulateDraftPolicy({ scenarioId: `${strategy.toLowerCase()}:${scenario.id}`, asOf, claims: scenario.claims, policy });
    results.push({
      scenarioId: result.scenarioId, policyVersion: result.policyVersion, policyHash: result.policyHash,
      resolutionHash: result.resolutionHash, snapshotHash: result.snapshotHash, projectionHash: result.projectionHash,
      sourceAssessments: result.sourceAssessments, readiness: result.readiness,
      conflicts: result.conflicts, exclusions: result.exclusions, resultHash: result.resultHash,
    });
  }
}
const body = {
  artifactVersion: "backyrd.world-knowledge.slice-3a-calibration-artifact@1.0",
  calibrationContractVersion: POLICY_CALIBRATION_CONTRACT_VERSION,
  canonicalBase: "983cd7b3a3c11dd3e549c256850749b07b52eadf",
  generatedAt: "2026-09-10T16:00:00.000Z",
  status: "DRAFT_CANDIDATE",
  productionDataUsed: false,
  results,
};
const output = `${JSON.stringify({ ...body, artifactHash: hashBody(body, []) }, null, 2)}\n`;
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const outputPath = process.argv[outputIndex + 1];
  if (!outputPath) throw new Error("--output requires a path");
  writeFileSync(outputPath, output);
} else process.stdout.write(output);
