import fs from "node:fs";
import path from "node:path";
import {
  CONTRACT_VERSIONS,
  FOUNDER_LIVE_ARTIFACT_MANIFEST_HASH,
  FOUNDER_LIVE_NO_WRITE_PROOF,
  FOUNDER_LIVE_PIPELINE_TOPOLOGY,
  FOUNDER_LIVE_PROJECTION_FLAGS,
  FOUNDER_LIVE_PROJECTION_RELEASE,
  FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR,
  FOUNDER_LIVE_RETENTION_TEMPLATE,
  FOUNDER_LIVE_RETENTION_TEMPLATE_HASH,
  FOUNDER_LIVE_SUBJECT_SLOT,
  buildFounderLivePostDeployEvidence,
  canonicalJson,
  consumeFounderLiveProjection,
  contentHash,
  createDarkProjectionRepositoryTrust,
  createFounderLiveProjectionInvocation,
  createFounderLiveRepositoryTrust,
  createSyntheticDarkProjectionAuthority,
  createSyntheticFounderLiveSubjectAuthority,
  rehearseFounderLiveProjection,
  withDarkProjectionEventHash,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const userId = "synthetic-founder-release-user";
const subjectBindingHash = contentHash(userId);
const sessionBindingHash = contentHash("synthetic-founder-release-session");
const now = "2026-09-17T12:00:00.000Z";
const consent = {
  contractVersion: CONTRACT_VERSIONS.consentEnvelope,
  purpose: "PERSONALIZED_RECOMMENDATIONS",
  state: "GRANTED",
  consentVersion: "founder-live-release-consent",
  policyVersion: "founder-live-release-consent-policy",
  uxVersion: "founder-live-release-consent-ux",
  effectiveAt: "2026-09-17T08:00:00.000Z",
  captureContext: "ONBOARDING",
  allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"],
  lifecycleEffect: "ALLOW",
};
const request = {
  contractVersion: CONTRACT_VERSIONS.projectionRequest,
  requestId: "founder-live-release-request",
  actor: { kind: "AUTHENTICATED_USER", userId, subjectBindingHash, authenticationContextHash: contentHash("server-auth-context"), boundBy: "SERVER" },
  decisionId: "founder-live-release-decision",
  snapshot: null,
  context: { contextContractVersion: "founder-live-context-1", contextHash: contentHash("morning-solo"), placeTypes: ["cafe"], domainKeys: ["morning", "solo"], rawLocationIncluded: false, socialDetailsIncluded: false },
  requestedDomains: ["direct-spot-state"],
  budgets: { maxItems: 16, maxBytes: 8192 },
  projectionPolicyVersion: "founder-live-read-only-1",
  killSwitch: false,
};
const darkAuthority = createSyntheticDarkProjectionAuthority({ authorityRecordId: "founder-live-release-dark-authority", authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR", userId, subjectBindingHash, consent, allowedActions: ["LOCAL_INGEST", "LOCAL_PROJECT", "LOCAL_REBUILD"] });
const darkTrust = createDarkProjectionRepositoryTrust([darkAuthority]);
const authorityRecordId = "founder-live-release-subject-authority";
const invocation = createFounderLiveProjectionInvocation({ invocationId: "founder-live-release-invocation", authorityRecordId, request, consent, environment: "PROD_LIKE_TEST", sessionBindingHash });
const subjectAuthority = createSyntheticFounderLiveSubjectAuthority({ authorityRecordId, pseudonymousSubjectId: "synthetic-founder-release-subject", userId, subjectBindingHash, sessionBindingHash, consent, requestHash: invocation.requestHash, environment: "PROD_LIKE_TEST" });
const trust = createFounderLiveRepositoryTrust([subjectAuthority], now);
const makeEvent = (eventId, eventType, overrides = {}) => withDarkProjectionEventHash({
  contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeEvent,
  eventId, idempotencyKey: `idem-${eventId}`, userId, subjectBindingHash, eventType, journeyId: `journey-${eventId}`,
  occurredAt: "2026-09-17T09:00:00.000Z", observedAt: "2026-09-17T09:00:01.000Z", ingestedAt: "2026-09-17T09:00:02.000Z",
  authorityRecordId: darkAuthority.authorityRecordId, authorityRecordHash: darkAuthority.authorityHash,
  serverResolutionHash: contentHash(`resolution-${eventId}`), minimizedContextHash: contentHash("morning-solo"),
  rawTextIncluded: false, preciseLocationIncluded: false, commercialDataIncluded: false, productionAuthorized: false,
  ...overrides,
});
const syntheticEvents = [makeEvent("save-1", "SAVED", { spotId: "fixture-cafe" }), ...[1, 2, 3].map((index) => makeEvent(`visit-${index}`, "VISITED", { spotId: "fixture-cafe", journeyId: `independent-${index}` }))];
const input = { invocation, request, consent, lifecycle: "ACTIVE", currentSessionBindingHash: sessionBindingHash, syntheticEvents, trust, darkProjectionAuthorityRecordId: darkAuthority.authorityRecordId, darkProjectionTrust: darkTrust, now };
const outcome = consumeFounderLiveProjection({ ...input, configuration: "PROD_LIKE_TEST" });
if (outcome.status !== "AVAILABLE") throw new Error(`founder_live_projection_unavailable:${outcome.reasonCode}`);
const rehearsal = rehearseFounderLiveProjection(input);
const postDeployEvidence = buildFounderLivePostDeployEvidence();
const productionPlan = Object.freeze({ migrations: [], functions: [], authChanges: [], rpcChanges: [], edgeChanges: [], productWiring: [], learningRuntimeActivated: false, eventIngestionActivated: false, projectionPersistenceActivated: false, writebackActivated: false, runtimeDeploymentRequired: false, executionAuthorized: false });
const body = {
  contractVersion: "backyrd.user-intelligence.founder-live-projection-artifact@1.0",
  release: FOUNDER_LIVE_PROJECTION_RELEASE, trustAnchor: FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR,
  founderSlot: FOUNDER_LIVE_SUBJECT_SLOT, syntheticSubjectAuthorityHash: subjectAuthority.authorityHash,
  invocationHash: invocation.invocationHash, flags: FOUNDER_LIVE_PROJECTION_FLAGS,
  pipelineTopology: FOUNDER_LIVE_PIPELINE_TOPOLOGY, noWriteProof: FOUNDER_LIVE_NO_WRITE_PROOF,
  retentionDecisionTemplate: FOUNDER_LIVE_RETENTION_TEMPLATE, artifactManifestHash: FOUNDER_LIVE_ARTIFACT_MANIFEST_HASH,
  projection: outcome.projection, outcomeHash: outcome.outcomeHash, rehearsal, postDeployEvidence, productionPlan,
};
const artifact = { ...body, artifactHash: contentHash(body) };
const summaryBody = {
  contractVersion: "backyrd.user-intelligence.founder-live-projection-release-summary@1.0",
  canonicalBaseSha: FOUNDER_LIVE_PROJECTION_RELEASE.canonicalBaseSha,
  canonicalBaseTree: FOUNDER_LIVE_PROJECTION_RELEASE.canonicalBaseTree,
  releaseHash: FOUNDER_LIVE_PROJECTION_RELEASE.releaseHash,
  trustAnchorHash: FOUNDER_LIVE_PROJECTION_TRUST_ANCHOR.anchorHash,
  founderSlotHash: FOUNDER_LIVE_SUBJECT_SLOT.slotHash,
  founderSlotStatus: FOUNDER_LIVE_SUBJECT_SLOT.status,
  syntheticSubjectAuthorityHash: subjectAuthority.authorityHash,
  invocationHash: invocation.invocationHash,
  noWriteProofHash: FOUNDER_LIVE_NO_WRITE_PROOF.proofHash,
  retentionTemplateHash: FOUNDER_LIVE_RETENTION_TEMPLATE_HASH,
  artifactManifestHash: FOUNDER_LIVE_ARTIFACT_MANIFEST_HASH,
  projectionHash: outcome.projection.projectionHash,
  outcomeHash: outcome.outcomeHash,
  rehearsalHash: rehearsal.rehearsalHash,
  postDeployEvidenceHash: postDeployEvidence.evidenceHash,
  fullReportHash: artifact.artifactHash,
  flags: FOUNDER_LIVE_PROJECTION_FLAGS,
  productionPlan,
};
const summary = { ...summaryBody, summaryHash: contentHash(summaryBody) };
const write = (file, value) => { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); } };
write(argument("--full-output"), artifact);
write(argument("--write-summary"), summary);
const verifyPath = argument("--verify-summary");
if (verifyPath) {
  const expected = JSON.parse(fs.readFileSync(verifyPath, "utf8"));
  if (canonicalJson(expected) !== canonicalJson(summary)) throw new Error("founder_live_projection_release_summary_mismatch");
}
process.stdout.write(`${JSON.stringify(summary)}\n`);
