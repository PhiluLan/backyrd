import fs from "node:fs";
import path from "node:path";
import {
  CONTRACT_VERSIONS,
  DARK_PROJECTION_RUNTIME_RELEASE,
  INTERNAL_PROJECTION_ALLOWLIST_POLICY,
  INTERNAL_PROJECTION_ARTIFACT_MANIFEST_HASH,
  INTERNAL_PROJECTION_FLAGS,
  INTERNAL_PROJECTION_NO_WRITE_PROOF,
  INTERNAL_PROJECTION_RELEASE,
  INTERNAL_PROJECTION_RETENTION_TEMPLATE,
  INTERNAL_PROJECTION_RETENTION_TEMPLATE_HASH,
  INTERNAL_PROJECTION_TRUST_ANCHOR,
  buildInternalProjectionPostDeployEvidence,
  canonicalJson,
  consumeInternalAllowlistedProjection,
  contentHash,
  createDarkProjectionRepositoryTrust,
  createInternalProjectionInvocation,
  createInternalProjectionRepositoryTrust,
  createSyntheticDarkProjectionAuthority,
  createSyntheticInternalProjectionAllowlist,
  rehearseInternalAllowlistedProjection,
  withDarkProjectionEventHash,
} from "../../packages/user-intelligence-vnext-core/dist/index.js";

const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const userId = "synthetic-internal-week3-release-user";
const subjectBindingHash = contentHash(userId);
const now = "2026-09-17T12:00:00.000Z";
const consent = { contractVersion: CONTRACT_VERSIONS.consentEnvelope, purpose: "PERSONALIZED_RECOMMENDATIONS", state: "GRANTED", consentVersion: "week3-release-consent", policyVersion: "week3-release-policy", uxVersion: "week3-release-ux", effectiveAt: "2026-09-17T08:00:00.000Z", captureContext: "ONBOARDING", allowedProcessing: ["PERSONALIZATION_EVIDENCE", "TRANSPARENCY", "EXPORT", "ERASURE"], lifecycleEffect: "ALLOW" };
const darkAuthority = createSyntheticDarkProjectionAuthority({ authorityRecordId: "week3-release-dark-authority", authorityKind: "SERVER_USER_INTELLIGENCE_ORCHESTRATOR", userId, subjectBindingHash, consent, allowedActions: ["LOCAL_INGEST", "LOCAL_PROJECT", "LOCAL_REBUILD"] });
const darkTrust = createDarkProjectionRepositoryTrust([darkAuthority]);
const request = { contractVersion: CONTRACT_VERSIONS.projectionRequest, requestId: "week3-release-request", actor: { kind: "AUTHENTICATED_USER", userId, subjectBindingHash, authenticationContextHash: "0".repeat(64), boundBy: "SERVER" }, decisionId: "week3-release-decision", snapshot: null, context: { contextContractVersion: "week3-context-1", contextHash: contentHash("morning-solo"), placeTypes: ["cafe"], domainKeys: ["morning", "solo"], rawLocationIncluded: false, socialDetailsIncluded: false }, requestedDomains: ["direct-spot-state"], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "week3-internal-read-only-1", killSwitch: false };
const invocation = createInternalProjectionInvocation({ invocationId: "week3-release-invocation", allowlistRecordId: "week3-release-allowlist", request, consent, environment: "PROD_LIKE_TEST" });
const allowlist = createSyntheticInternalProjectionAllowlist({ recordId: invocation.allowlistRecordId, pseudonymousSubjectId: "synthetic-internal-week3-release-subject", userId, subjectBindingHash, requestHash: invocation.requestHash, consent, lifecycle: "ACTIVE", environment: "PROD_LIKE_TEST" });
const internalTrust = createInternalProjectionRepositoryTrust([allowlist], now);
const make = (eventId, eventType, overrides = {}) => withDarkProjectionEventHash({ contractVersion: CONTRACT_VERSIONS.darkProjectionRuntimeEvent, eventId, idempotencyKey: `idem-${eventId}`, userId, subjectBindingHash, eventType, journeyId: `journey-${eventId}`, occurredAt: "2026-09-17T09:00:00.000Z", observedAt: "2026-09-17T09:00:01.000Z", ingestedAt: "2026-09-17T09:00:02.000Z", authorityRecordId: darkAuthority.authorityRecordId, authorityRecordHash: darkAuthority.authorityHash, serverResolutionHash: contentHash(`resolution-${eventId}`), minimizedContextHash: contentHash("morning-solo"), rawTextIncluded: false, preciseLocationIncluded: false, commercialDataIncluded: false, productionAuthorized: false, ...overrides });
const events = [make("save-1", "SAVED", { spotId: "fixture-cafe" }), ...[1, 2, 3].map((n) => make(`visit-${n}`, "VISITED", { spotId: "fixture-cafe", journeyId: `independent-${n}` }))];
const input = { invocation, request, consent, lifecycle: "ACTIVE", events, internalTrust, darkProjectionAuthorityRecordId: darkAuthority.authorityRecordId, darkProjectionTrust: darkTrust, now };
const projection = consumeInternalAllowlistedProjection({ ...input, configuration: "PROD_LIKE_TEST" });
const rehearsal = rehearseInternalAllowlistedProjection(input);
const postDeployEvidence = buildInternalProjectionPostDeployEvidence(consent);
const productionPlan = { migrations: [], functions: [], authChanges: [], rpcChanges: [], edgeChanges: [], productWiring: [], runtimeDeploymentRequired: false, executionAuthorized: false };
const body = { contractVersion: "backyrd.user-intelligence.internal-projection-artifact@week3-1", release: INTERNAL_PROJECTION_RELEASE, trustAnchor: INTERNAL_PROJECTION_TRUST_ANCHOR, allowlistPolicy: INTERNAL_PROJECTION_ALLOWLIST_POLICY, syntheticAllowlistRecordHash: allowlist.recordHash, invocationHash: invocation.invocationHash, week2ReleaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash, flags: INTERNAL_PROJECTION_FLAGS, noWriteProof: INTERNAL_PROJECTION_NO_WRITE_PROOF, retentionDecisionTemplate: INTERNAL_PROJECTION_RETENTION_TEMPLATE, artifactManifestHash: INTERNAL_PROJECTION_ARTIFACT_MANIFEST_HASH, projection, rehearsal, postDeployEvidence, productionPlan };
const artifact = { ...body, artifactHash: contentHash(body) };
const summaryBody = { contractVersion: "backyrd.user-intelligence.internal-projection-release-summary@week3-1", canonicalBaseSha: INTERNAL_PROJECTION_RELEASE.canonicalBaseSha, canonicalBaseTree: INTERNAL_PROJECTION_RELEASE.canonicalBaseTree, releaseHash: INTERNAL_PROJECTION_RELEASE.releaseHash, trustAnchorHash: INTERNAL_PROJECTION_TRUST_ANCHOR.anchorHash, allowlistPolicyHash: INTERNAL_PROJECTION_ALLOWLIST_POLICY.policyHash, syntheticAllowlistRecordHash: allowlist.recordHash, invocationHash: invocation.invocationHash, week2ReleaseHash: DARK_PROJECTION_RUNTIME_RELEASE.releaseHash, noWriteProofHash: INTERNAL_PROJECTION_NO_WRITE_PROOF.proofHash, retentionTemplateHash: INTERNAL_PROJECTION_RETENTION_TEMPLATE_HASH, artifactManifestHash: INTERNAL_PROJECTION_ARTIFACT_MANIFEST_HASH, projectionHash: projection.projectionHash, rehearsalHash: rehearsal.rehearsalHash, postDeployEvidenceHash: postDeployEvidence.evidenceHash, fullReportHash: artifact.artifactHash, flags: INTERNAL_PROJECTION_FLAGS, productionPlan };
const summary = { ...summaryBody, summaryHash: contentHash(summaryBody) };
const write = (file, value) => { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); } };
write(argument("--full-output"), artifact); write(argument("--write-summary"), summary);
const verifyPath = argument("--verify-summary"); if (verifyPath) { const expected = JSON.parse(fs.readFileSync(verifyPath, "utf8")); if (canonicalJson(expected) !== canonicalJson(summary)) throw new Error("week3_internal_projection_release_summary_mismatch"); }
process.stdout.write(`${JSON.stringify(summary)}\n`);
