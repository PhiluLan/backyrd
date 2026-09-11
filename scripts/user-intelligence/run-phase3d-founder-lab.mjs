import fs from "node:fs";
import path from "node:path";
import {
  buildPhase3DFounderLabReport, canonicalJson, contentHash, createPhase3DCanonicalReleaseTrust,
  createPhase3DLocalEvidenceTrust, createPhase3DLocalObservation, createPhase3DRepositoryTrust,
  PHASE3D_CALIBRATION_CANDIDATES, PHASE3D_CALIBRATION_RELEASE, PHASE3D_CALIBRATION_TRUST_ANCHOR,
  PHASE3D_CANDIDATE_SET_HASH, PHASE3D_RELEASE_SUMMARY_BODY, PHASE3D_SCENARIO_IDS,
  PHASE3D_SCENARIO_SET_HASH, PHASE3D_SCENARIO_SET_VERSION,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const subject = contentHash("phase3d-release-fixture-subject"); const morning = contentHash({ dayPhase: "morning", companyType: "alone" });
const make = (recordId, eventType, overrides = {}) => createPhase3DLocalObservation({ recordId, subjectBindingHash: subject, eventType, occurredAt: "2026-09-12T08:00:00.000Z", journeyId: `journey-${recordId}`, contextHash: morning, contextDimensions: ["DAY_PHASE", "COMPANY_TYPE"], ...overrides });
const rows = [
  ...[1,2,3].map((n) => make(`search-${n}`, "SEARCH", { spotId: `search-spot-${n}`, conceptIds: ["vibe.cozy", "place_type.cafe"], worldAttribution: "CERTAIN", authorityProofs: ["AUTHENTICATED_USER_ACTION", "SERVER_MINIMIZATION_SERVICE"] })),
  ...[1,2,3].map((n) => make(`visit-${n}`, "VISITED", { spotId: "fixture-cafe-cozy", experienceConfirmed: true, authorityProofs: ["VERIFIED_OUTCOME"] })),
  make("save-1", "SAVED", { spotId: "fixture-cafe-cozy", authorityProofs: ["SERVER_VERIFIED_PRODUCT_STATE"] }),
  make("dwell-1", "DWELL", { contextHash: null, contextDimensions: [], authorityProofs: ["CLIENT_OBSERVATION", "SERVER_MINIMIZATION_SERVICE"] }),
  make("positive-1", "EXPLICIT_SATISFACTION", { spotId: "fixture-cafe-cozy", conceptIds: ["vibe.cozy"], worldAttribution: "CERTAIN", experienceConfirmed: true, satisfactionResponse: "HAS_MATCHED", authorityProofs: ["AUTHENTICATED_USER_ACTION", "SERVER_VERIFIED_PRODUCT_STATE"] }),
];
const evidenceTrust = createPhase3DLocalEvidenceTrust(rows); const input = { evaluationId: "phase3d-release-evaluation", subjectBindingHash: subject, lifecycle: "ACTIVE", observations: rows.map(({ observation }) => observation) };
const report = buildPhase3DFounderLabReport(input, createPhase3DCanonicalReleaseTrust(), evidenceTrust, createPhase3DRepositoryTrust());
const artifact = { contractVersion: "backyrd.user-intelligence.founder-lab-artifact@3d-1", labels: ["FOUNDER_EVALUATION_ONLY", "LOCAL_ONLY", "NOT_PRODUCTION_AUTHORIZED"], candidates: PHASE3D_CALIBRATION_CANDIDATES, calibrationRelease: PHASE3D_CALIBRATION_RELEASE, calibrationTrustAnchor: PHASE3D_CALIBRATION_TRUST_ANCHOR, scenarioIds: PHASE3D_SCENARIO_IDS, report, productionPlan: { migrations: [], functions: [], authChanges: [], productWiring: [], runtimeDeploymentRequired: false, executionAuthorized: false } };
const artifactHash = contentHash(artifact); const full = { ...artifact, artifactHash };
const summaryBody = { ...PHASE3D_RELEASE_SUMMARY_BODY, fullReportHash: artifactHash, centralResults: { searchContextualPromotionsByCandidate: report.candidateOutcomes.map(({ candidateId, searchContextualTargets }) => ({ candidateId, count: searchContextualTargets.length })), searchLongTermPromotionRemainsEvaluationOnly: true, skipGlobalAversionCount: 0, productionProjectionPersonalItems: 0, retentionDurationsConfigured: false }, productionPlan: artifact.productionPlan };
const summary = { ...summaryBody, summaryHash: contentHash(summaryBody) };
const write = (file, value) => { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); } };
write(argument("--full-output"), full); write(argument("--write-summary"), summary);
const verifyPath = argument("--verify-summary"); if (verifyPath) { const expected = JSON.parse(fs.readFileSync(verifyPath, "utf8")); if (canonicalJson(expected) !== canonicalJson(summary)) throw new Error("phase3d_release_summary_mismatch"); }
process.stdout.write(`${JSON.stringify(summary)}\n`);
